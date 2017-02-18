$graph ="digraph {`n"
$graph += "layout=dot`n"
$graph += "rankdir=TB`n"
$commits = git rev-list --all
foreach ($commit in $commits) {
    $graph += "`"$($commit.Substring(0,7))`"[shape=circle;href=`"show/$($commit.Substring(0,7))`"]`n"
    $parents = (git rev-list --parents -n 1 $commit) -split " "
    foreach ($parent in $parents[1..10]) {
        $graph += "`"$($parent.Substring(0,7))`" -> `"$($commit.Substring(0,7))`"`n"
    }
}
$refs = git show-ref --abbrev
$names = @()
foreach ($ref in $refs) {
    $values = $ref -split " "
    $values[1] = $values[1] -replace "refs/heads/", ""
    $names += $values[1]
    $graph += "`"$($values[1])`"[shape=cds;tooltip=`"$($values[1])`";href=`"show/$($values[1])`"]`n"
    $graph += "{rank=same; `"$($values[1])`" -> `"$($values[0])`"}`n"
}
#$graph += "{rank=same $($names -join " ")}"
$graph += "}"
return $graph
