# save directory script was imported from
$web_dir = $PSScriptRoot

function Show-GitViz {
    $git_dir = Get-Location
    $web_host = "http://localhost:6776/"

    Write-Host $git_dir
    Write-Host $web_dir
    Write-Host $web_host

    Start-Process -PSPath ($web_host)

    $routes = @{
        "^/$" = {
            return Get-Content (Join-Path -Path $web_dir -ChildPath "graph.html") -raw
        }
        "^/svg$" = {
            $svg = ((Invoke-Expression -Command (Join-Path -Path $web_dir -ChildPath "graph.ps1")) | dot.exe -Tsvg) -join ""
            $svg = $svg.Substring($svg.IndexOf("<svg"))
            return $svg
        }
        "^/dot$" = {
            return (Invoke-Expression -Command (Join-Path -Path $web_dir -ChildPath "graph.ps1"))
        }
        "^/show/(.+)$" = {
            param([string[]]$args)
            return "<pre>$((git show $args) -join "`n")</pre>"
        }
        "^/([^/]+\.(html|css|js))$" = {
            param([string[]]$args)
            return Get-Content (Join-Path -Path $web_dir -ChildPath $args[0]) -raw
        }
        "^/watch$" = {
            param([string[]]$args)
            $watcher = New-Object System.IO.FileSystemWatcher
            $watcher.Path = (Join-Path -Path $git_dir -ChildPath ".git\logs")
            $watcher.IncludeSubdirectories = $true
            $watcher.EnableRaisingEvents = $false
            $watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName
            $results = @()
            $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Renamed -bOr [System.IO.WatcherChangeTypes]::Created, 5000);
            $results += $result
            if ($result.TimedOut -eq $false) {
                # wait for 1 second of inactivity
                while ($true) {
                    $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Renamed -bOr [System.IO.WatcherChangeTypes]::Created, 1000);
                    if ($result.TimedOut -eq $true) {
                        break
                    }
                    else {
                        $results += $result
                    }
                }
            }
            return $results
        }
        "^/kill$" = { return }
    }

    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($web_host)
    $listener.Start()

    $RunspacePool = [RunspaceFactory ]::CreateRunspacePool(1, 5)
    $RunspacePool.Open()

    Write-Host "Listening at $web_host..."

    while ($listener.IsListening)
    {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        Write-Host  "`n> $($request.Url.LocalPath)"

        $localPath = $request.Url.LocalPath

        if ($localPath -eq "/kill") {
            $response.Close()
            $listener.Close()
            continue
        }

        $matched = $false
        foreach ($route_entry in $routes.GetEnumerator())
        {
            $match = [regex]::Match($localPath, $route_entry.Key)
            if ($match.Success)
            {
                $route = $route_entry.Value
                $params = $match.Captures.Groups | %{ $_.Value }
                Write-Host "    matched $($route_entry.Key)"
                Write-Host "    params $($params -join ", ")"
                break
            }
        }

        if (-not $match.Success)
        {
            $response.StatusCode = 404
            $response.Close()
        }
        else
        {
            $request_script = {
                param($request, $response, $route, $params)
                $content = & $route @params
                if (-not ($content -is [string])) {
                    $content = ($content | ConvertTo-Json)
                    $response.ContentType = "application/json"
                }
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()
                $responseStatus = $response.StatusCode
            }
            $request_task = [powershell]::Create().
                AddScript($request_script).
                AddArgument($request).
                AddArgument($response).
                AddArgument($route).
                AddArgument($params)
            $request_task.RunspacePool = $RunspacePool
            $task_result = $request_task.BeginInvoke()
        }
    }
    $RunspacePool.Close()
}
Export-ModuleMember -Function Show-GitViz
