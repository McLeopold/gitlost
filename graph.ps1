$graph ="digraph GitViz {`n"
$graph += "graph [layout=dot rankdir=BT bgcolor=`"#808080`" title=`"Test`"]`n"
$commits = git rev-list --all
foreach ($commit in $commits) {
    $parents = (git rev-list --parents -n 1 $commit) -split " "
    $shape = "circle"
    if ($parents.Length -gt 2) {
        $shape = "doublecircle"
    }
    $graph += "`"$($commit.Substring(0,7))`"[shape=$($shape);href=`"show/$($commit.Substring(0,7))`"fontname=Consolas;fontsize=6]`n"
    foreach ($parent in $parents[1..10]) {
        $graph += "`"$($parent.Substring(0,7))`" -> `"$($commit.Substring(0,7))`"`n"
    }
}
$refs = git show-ref --abbrev
$names = @()
foreach ($ref in $refs) {
    $values = $ref -split " "
    $values[1] = $values[1] -replace "refs/heads/", ""
    $values[1] = $values[1] -replace "refs/remotes/", ""
    $names += $values[1]
    $graph += "`"$($values[1])`"[shape=cds;tooltip=`"$($values[1])`";href=`"show/$($values[1])`";fontname=Calibri;fontsize=9 width=0.25 height=0.25]`n"
    $graph += "{rank=same; `"$($values[1])`" -> `"$($values[0])`"}`n"
}
#$graph += "{rank=same $($names -join " ")}"
$graph += "}"
return $graph
