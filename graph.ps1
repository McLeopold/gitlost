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

Write-Output $(git_graph)
