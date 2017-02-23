try {
$graph ="digraph GitViz {`n"
$graph += "  graph [layout=dot rankdir=BT bgcolor=`"#ffffff`" title=`"Test`"]`n`n"

$graph += "  { node [shape=box style=`"rounded,filled`" fixedsize=true width=0.6 height=0.4 fontcolor=`"#ffffff`" fontname=Consolas fontsize=10]`n"
$commits = git rev-list --all --no-merges --pretty=oneline
foreach ($commit in $commits) {
    $info = $commit -split " ", 2
    $label = $info[1] -replace "`"", "\`""
    $graph += "    `"$($info[0])`" [label=<<b>$($info[0].Substring(0,4) + "<br />" + $info[0].Substring(4,4))</b>> href=`"show/$($info[0])`" tooltip=`"$($label)`"]`n"
}
$graph += "  }`n`n"

$graph += "  { node [shape=octagon style=filled fixedsize=true width=0.6 height=0.4 fontcolor=`"#ffffff`" fontname=Consolas fontsize=10]`n"
$commits = git rev-list --all --merges --pretty=oneline
foreach ($commit in $commits) {
    $info = $commit -split " ", 2
    $label = $info[1] -replace "`"", "\`""
    $graph += "    `"$($info[0])`" [label=<<b>$($info[0].Substring(0,4) + "<br />" + $info[0].Substring(4,4))</b>> href=`"show/$($info[0])`" tooltip=`"$($label)`"]`n"
}
$graph += "  }`n`n"

$colors = @("#c00000", "#c06000", "#c0c000", "#00c000", "#0000c0", "#c000c0", "#00c0c0", "#60c000", "#6000c0", "#c00060", "#00c060", "#0060c0")
$color_num = 0
# create ref/commit hash table and ordered list of refs
# in order to match commits to most desirable refs first
# and combine different refs on same commit into subgraph
$refs_used = @{}
$commits_used = @{}
$commit_color = @{}
$refs = @{}
$ref_list = @()
$tags = git tag
$each_refs = git for-each-ref refs --sort=-committerdate --sort=objecttype --format='%(refname:short) %(objectname) %(objecttype)'
foreach ($each_ref in $each_refs) {
    $info = $each_ref -split " "
    if ($info[2] -eq "tag") {
        # dereference annotated tag
        $info[1] = git rev-list -1 $info[0]
    }
    $refs.Add($info[0], $info[1])
    $ref_list += $info[0]
}
$ref_list += "HEAD"
$refs.Add("HEAD", $(git rev-parse HEAD))
foreach ($ref_search in @("master", "deploy", "")) {
    #$branches = git for-each-ref --sort=-committerdate $ref_search --format='%(objectname) %(refname:short)'
    foreach ($branch in $ref_list) {
        #$info = $branch_info -split " "
        $branch_commit = $refs.Get_Item($branch) # $info[0]
        #$branch = $branch_info.Key # $info[1]
        if (-not $refs_used.ContainsKey($branch) -and ($branch.IndexOf($ref_search) -ne -1 -or $ref_search -eq "")) {
            #$refs_used.Add($branch, $branch_commit)
            #$graph += "    `"$($branch)`" [label=`"$($branch)`" style=`"filled`" color=`"#404040`" fontcolor=`"#ffffff`" shape=cds tooltip=`"$($branch)`" href=`"show/$($branch)`" fontname=Calibri fontsize=10 width=0 height=0]`n"
            $graph += "    subgraph `"$($branch)_head`" {`n"
            $graph += "      color=`"#ffffff`";`n"
            $graph += "      edge [color=`"#404040`" arrowhead=none penwidth=2]`n`n"
            #$graph += "      `"$($branch_commit)`" -> `"$($branch)`"`n"
            foreach ($ref in $ref_list) {
                if ($refs.Get_Item($ref) -eq $branch_commit) {
                    $refs_used.Add($ref, $branch_commit)
                    $color = "#80ff80"
                    if ($tags.Length -gt 0 -and $tags.Contains($ref)) {
                        $color = "#ffff80"
                    } elseif ($ref.IndexOf("/") -ne -1) {
                        $color = "#ff80ff"
                    } elseif ($ref -eq "HEAD") {
                        $color = "#80ffff"
                    } elseif ($ref -eq "stash") {
                        $color = "#808080"
                    }
                    $graph += "    `"$($ref)`" [label=<$($ref)> style=`"filled`" color=`"#404040`" fontcolor=`"$($color)`" shape=cds tooltip=`"$($ref)`" href=`"show/$($ref)`" fontname=Calibri fontsize=10 width=0 height=0]`n"
                    $graph += "      `"$($branch_commit)`" -> `"$($ref)`"`n"
                }
            }
            $graph += "    }`n`n"
            $graph += "  subgraph `"cluster_$($branch)`" {`n"
            $graph += "    color=`"#ffffff`";`n"
            $branch_commits = git log $branch --first-parent --format=%H
            foreach ($branch_commit in $branch_commits) {
                if (-not $commits_used.ContainsKey($branch_commit)) {
                    $graph += "    `"$($branch_commit)`" [color=`"$($colors[$color_num])`"]`n"
                    $commits_used.Add($branch_commit, $color_num)
                }
            }
            $graph += "  }`n`n"
            $color_num = ($color_num + 1) % $colors.Length
        }
    }
}

$graph += "  edge [penwidth=4 arrowhead=none color=`"#808080`"]`n`n"
$commits = git rev-list --all
foreach ($commit in $commits) {
    $parents = (git rev-list --parents -n 1 $commit) -split " "
    foreach ($parent in $parents[1..10]) {
        $color = "#808080"
        if ($commits_used.ContainsKey($commit)) {
            $color = $colors[$commits_used.Get_Item($commit)]
        }
        $graph += "  `"$($parent)`" -> `"$($commit)`" [color=`"$($color)`"]`n"
    }
}
$graph += "`n"
$graph += "}"
return $graph
} catch {
    return $_.Exception | Format-List -Force | Out-String
}
