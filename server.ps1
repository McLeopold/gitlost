$web_host = "http://localhost:8008/"
$log_file = "C:\GitHub\scott\log.txt"
Set-Location "C:\GitHub\scott"
Start-Process -PSPath ($web_host)

$templates = @{
    "graph" = "graph.html"
}

function load_template ([string]$template_name) {
    return Get-Content ($templates.Get_Item($template_name)) -raw
}

$routes = @{
    "^/$" = {
        $svg = ((Invoke-Expression -Command .\graph.ps1) | dot.exe -Tsvg) -join ""
        $svg = $svg.Substring($svg.IndexOf("<svg"))
        $template = load_template("graph")
        $template = $template.Replace("{svg}", $svg);
        return $template
    }
    "^/raw$" = { return (Invoke-Expression -Command .\graph.ps1) }
    "^/kill$" = { Exit }
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
    "^/wait$" = {
        Start-Sleep -Seconds 5
        $svg = ((Invoke-Expression -Command .\graph.ps1) | dot.exe -Tsvg) -join ""
        $svg = $svg.Substring($svg.IndexOf("<svg"))
        return $svg
    }
}

$url = 'http://localhost:8008/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

$RunspacePool = [RunspaceFactory ]::CreateRunspacePool(1, 5)
$RunspacePool.Open()
#$request_tasks = @()

Write-Host "Listening at $url..."

while ($listener.IsListening)
{
    Get-Job
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
    elseif ($localPath -eq "/kill") {
        $response.Close()
        Break
    }
    else
    {
        $request_script = {
            param($request, $response, $route, $params)
            $content = & $route @params
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
        <#
        $request_tasks += New-Object PSObject -Property @{
            Pipe = $request_task
            Result = $request_task.BeginInvoke()
        }
        #>
        <#
        Try {
            Start-Job $request_task -ArgumentList $request, $response, $route
        } Catch { Write-Host "Error"}
        #>
        #$response.Close()
    }
    Start-Sleep -Seconds 5
}