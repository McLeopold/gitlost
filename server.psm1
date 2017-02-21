$web_host = "http://localhost:8008/"
$log_file = "C:\GitHub\scott\log.txt"
Set-Location "C:\GitHub\scott"
Start-Process -PSPath ($web_host)

$routes = @{
    "^/$" = {
        return Get-Content "graph.html" -raw
    }
    "^/svg$" = {
        $svg = ((Invoke-Expression -Command .\graph.ps1) | dot.exe -Tsvg) -join ""
        $svg = $svg.Substring($svg.IndexOf("<svg"))
        return $svg
    }
    "^/dot$" = {
        return (Invoke-Expression -Command .\graph.ps1)
    }
    "^/show/(.+)$" = {
        param([string[]]$args)
        Write-Host $args
        return "<pre>$((git show $args) -join "`n")</pre>"
    }
    "^/([^/]+\.(html|js))$" = {
        param([string[]]$args)
        Add-Content $log_file "html route $($args -join ", ")"
        return Get-Content $args[0] -raw
    }
    "^/watch$" = {
        param([string[]]$args)
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = "C:\GitHub\scott\.git\logs"
        $watcher.IncludeSubdirectories = $true
        $watcher.EnableRaisingEvents = $false
        $watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName
        $results = @()
        $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Renamed -bOr [System.IO.WatcherChangeTypes]::Created, 60000);
        $results += $result
        if ($result.TimedOut -eq $false) {
            # wait for 1 second of inactivity
            while ($true) {
                $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Renamed -bOr [System.IO.WatcherChangeTypes]::Created, 1000);
                if ($result.TimedOut -eq $true) {
                    Break
                }
                else {
                    $results += $result
                }
            }
        }
        return $results
    }
}

$url = 'http://localhost:8008/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

$RunspacePool = [RunspaceFactory ]::CreateRunspacePool(1, 5)
$RunspacePool.Open()

Write-Host "Listening at $url..."

while ($listener.IsListening)
{
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    Add-Content $log_file  ''
    Add-Content $log_file  "> $($request.Url.LocalPath)"

    $localPath = $request.Url.LocalPath
    $matched = $false
    foreach ($route_entry in $routes.GetEnumerator())
    {
        $match = [regex]::Match($localPath, $route_entry.Key)
        if ($match.Success)
        {
            $route = $route_entry.Value
            $params = $match.Captures.Groups | %{ $_.Value }
            Add-Content $log_file  "    matched $($route_entry.Key)"
            Add-Content $log_file  "    params $($params -join ", ")"
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
            Add-Content "C:\GitHub\scott\log.txt"  "< $($responseStatus)"
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
    Start-Sleep -Seconds 5
}