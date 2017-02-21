$graph ="digraph GitViz {`n"
$graph += "  graph [layout=dot rankdir=BT bgcolor=`"#ffffff`" title=`"Test`"]`n`n"
$graph += "  { node [shape=circle fontname=Consolas fontsize=6]`n"
$commits = git rev-list --all --no-merges --abbrev-commit --pretty=oneline
foreach ($commit in $commits) {
    $info = $commit -split " ", 2
    $label = $info[1] -replace "`"", "\`""
    $graph += "    `"$($info[0])`" [href=`"show/$($info[0])`" tooltip=`"$($label)`"]`n"
}
$graph += "  }`n`n"
$graph += "  { node [shape=doublecircle fontname=Consolas fontsize=6 width=0.25 height=0.25]`n"
$commits = git rev-list --all --merges --abbrev-commit --pretty=oneline
foreach ($commit in $commits) {
    $info = $commit -split " ", 2
    $label = $info[1] -replace "`"", "\`""
    $graph += "    `"$($info[0])`" [href=`"show/$($info[0])`" tooltip=`"$($label)`" label=`"`"]`n"
}
$graph += "  }`n`n"

$commit_branch = @{}
$branches = git for-each-ref --sort=-committerdate refs/heads --format='%(objectname:short) %(refname:short)'
foreach ($branch_info in $branches) {
    $info = $branch_info -split " "
    $branch_commit = $info[0]
    $branch = $info[1]


    $graph += "  subgraph cluster_$($branch) {`n"
    $graph += "    color=`"#ffffff`";`n"
    #$graph += "    label=`"$($branch)`"`n`n"
    $graph += "    `"$($branch)`" [shape=cds tooltip=`"$($branch)`" href=`"show/$($branch)`" fontname=Calibri fontsize=9 width=0.25 height=0.25]`n"
    $graph += "    { `"$($branch_commit)`" -> `"$($branch)`" }`n`n"
    $branch_commits = git log $branch --first-parent --format=%h
    foreach ($branch_commit in $branch_commits) {
        if (-not $commit_branch.ContainsKey($branch_commit)) {
            $graph += "    `"$($branch_commit)`"`n"
            $commit_branch.Add($branch_commit, $branch)
        }
    }
    $graph += "  }`n`n"
}
$commits = git rev-list --all
foreach ($commit in $commits) {
    $parents = (git rev-list --parents -n 1 $commit) -split " "
    foreach ($parent in $parents[1..10]) {
        $graph += "  `"$($parent.Substring(0,7))`" -> `"$($commit.Substring(0,7))`"`n"
    }
}
$graph += "`n"
$graph += "}"
return $graph
