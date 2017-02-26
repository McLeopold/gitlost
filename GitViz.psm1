# save directory script was imported from
$web_dir = $PSScriptRoot

function Show-GitViz {
    $git_dir = Get-Location

    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = (Join-Path -Path $git_dir -ChildPath ".git\logs")
    $watcher.IncludeSubdirectories = $true
    $watcher.EnableRaisingEvents = $false
    $watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

    $web_host = "http://localhost:6776/"

    Write-Host $git_dir
    Write-Host $web_dir
    Write-Host $web_host

    Start-Process -PSPath ($web_host + "")

    $routes = @{
        "^/$" = {
            param([string[]]$parts, $data)
            try {
                return Get-Content (Join-Path -Path $web_dir -ChildPath "graph.html") -raw
            } catch {
                Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                return $_.Exception | Format-List -Force | Out-String
            }
        }
        "^/svg$" = {
            param([string[]]$parts, $data)
            try {
                $command = Join-Path -Path $web_dir -ChildPath "graph.ps1"
                $dot = Invoke-Expression -Command "$command `"$data`""
                $svg = $dot | dot.exe -Tsvg | Out-String
                $svg = $svg.Substring([math]::max(0, $svg.IndexOf("<svg")))
                return $svg
            } catch {
                Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                return $_.Exception | Format-List -Force | Out-String
            }
        }
        "^/dot$" = {
            param([string[]]$parts, $data)
            try {
                $command = Join-Path -Path $web_dir -ChildPath "graph.ps1"
                $dot = Invoke-Expression -Command "$command `"$data`""
                return $dot
            } catch {
                Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                return $_.Exception | Format-List -Force | Out-String
            }

        }
        "^/show/(.+)$" = {
            param([string[]]$parts, $data)
            try {
                return "<pre>$((git show $parts[1]) -join "`n")</pre>"
            } catch {
                Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                return $_.Exception | Format-List -Force | Out-String
            }
        }
        "^/([^/]+\.(html|css|js))$" = {
            param([string[]]$parts, $data)
            try {
                return Get-Content (Join-Path -Path $web_dir -ChildPath $parts[1]) -raw
            } catch {
                Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                return $_.Exception | Format-List -Force | Out-String
            }
        }
        "^/watch$" = {
            param([string[]]$parts, $data)
            try {
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
            } catch {
                Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                return $_.Exception | Format-List -Force | Out-String
            }
        }
        "^/kill$" = { return "" }
    }

    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($web_host)
    $listener.Start()

    $RunspacePool = [RunspaceFactory ]::CreateRunspacePool(5, 10)
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
                $parts = $match.Captures.Groups | %{ $_.Value }
                Write-Host "    matched $($route_entry.Key)"
                Write-Host "    parts $($parts -join ", ")"
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
            # get post data
            $data = ""
            if ($request.HasEntityBody) {
                $body = $request.InputStream;
                $encoding = $request.ContentEncoding;
                $reader = New-Object System.IO.StreamReader($body, $encoding);
                $data = $reader.ReadToEnd();
                $body.Close();
                $reader.Close();
            }
            # route task
            $request_script = {
                param($request, $data, $response, $route, $parts)
                try {
                    $content = & $route $parts ($data -replace "`"", "```"")
                    if (-not ($content -is [string])) {
                        $content = ($content | ConvertTo-Json)
                        $response.ContentType = "application/json"
                    }
                } catch {
                    Add-Content (Join-Path -Path $web_dir -ChildPath "gitviz.log") ($_.Exception | Format-List -Force | Out-String)
                    $content = $_.Exception | Format-List -Force | Out-String
                }
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()
            }
            $request_task = [powershell]::Create().
                AddScript($request_script).
                AddArgument($request).
                AddArgument($data).
                AddArgument($response).
                AddArgument($route).
                AddArgument($parts)
            $request_task.RunspacePool = $RunspacePool
            $task_result = $request_task.BeginInvoke()
        }
        #Start-Sleep -Milliseconds 50
    }
    $RunspacePool.Close()
}
Export-ModuleMember -Function Show-GitViz
