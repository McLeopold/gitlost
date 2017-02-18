$graph ="digraph {`n"
$graph += "layout=dot`n"
$graph += "rankdir=RL`n"
$commits = git rev-list --all
foreach ($commit in $commits) {
    $graph += "`"$($commit.Substring(0,7))`"[shape=circle]`n"
    $parents = (git rev-list --parents -n 1 $commit) -split " "
    foreach ($parent in $parents[1..10]) {
        $graph += "`"$($parent.Substring(0,7))`" -> `"$($commit.Substring(0,7))`"`n"
    }
}
$refs = git show-ref --head --abbrev
foreach ($ref in $refs) {
    $values = $ref -split " "
    $values[1] = $values[1] -replace "refs/heads/", ""
    $graph += "`"$($values[1])`"[shape=cds]`n"
    $graph += "`"$($values[0])`" -> `"$($values[1])`"`n"
}
$graph += "}"
return $graph
