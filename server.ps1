Set-Location "C:\GitHub\scott"
Start-Process -PSPath "http://localhost:8008/"
$routes = @{
    "^/$" = { return ((Invoke-Expression -Command .\graph.ps1) | dot.exe -Tsvg) }
    "^/raw$" = { return (Invoke-Expression -Command .\graph.ps1) }
    "^/kill$" = { Exit }
    "^/show/(.+)$" = {
        param([string[]]$args)
        Write-Host $args
        return "<pre>$((git show $args) -join "`n")</pre>"
    }
}

$url = 'http://localhost:8008/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

Write-Host "Listening at $url..."

while ($listener.IsListening)
{
    $context = $listener.GetContext()
    $requestUrl = $context.Request.Url
    $response = $context.Response

    Write-Host ''
    Write-Host "> $requestUrl"

    $localPath = $requestUrl.LocalPath
    Write-Host $requestUrl.LocalPath
    $matched = $false
    foreach ($route_entry in $routes.GetEnumerator()) {
        $match = [regex]::Match($localPath, $route_entry.Key)
        if ($match.Success) {
            $route = $route_entry.Value
            $params = $match.Captures.Groups | %{ $_.Value }
            Write-Host $route_entry.Key
            Write-Host $params
            break
        }
    }
    #$route = $routes.Get_Item($requestUrl.LocalPath)

    if (-not $match.Success)
    {
        $response.StatusCode = 404
    }
    elseif ($localPath -eq "/kill") {
        $response.Close()
        Break
    }
    else
    {
        if ($params.Length -gt 0) {
            $content = & $route @params
        } else {
            $content = & $route
        }
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    
    $response.Close()

    $responseStatus = $response.StatusCode
    Write-Host "< $responseStatus"
}