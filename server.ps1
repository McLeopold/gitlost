
function git_graph {
    $graph ="digraph {`n"
    $commits = git rev-list --all
    foreach ($commit in $commits) {
        $parents = (git rev-list --parents -n 1 $commit) -split " "
        foreach ($parent in $parents[1..10]) {
            $graph += "C$($parent.Substring(0,6)) -> C$($commit.Substring(0,6))`n"
        }
    }
    $graph += "}"
    return $graph
}

Set-Location "C:\GitHub\scott"
Start-Process -PSPath "http://localhost:8008/"
$routes = @{
    "/" = { return (git_graph | dot.exe -Tsvg) }
    "/raw" = { return (git_graph) }
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
    $route = $routes.Get_Item($requestUrl.LocalPath)

    if ($route -eq $null)
    {
        $response.StatusCode = 404
    }
    else
    {
        $content = & $route
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    
    $response.Close()

    $responseStatus = $response.StatusCode
    Write-Host "< $responseStatus"
}