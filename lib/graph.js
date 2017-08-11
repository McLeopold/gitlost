var child_process = require('child_process');
var md5 = require('md5');

var carot = '^';
if (process.platform === 'win32') {
    // stupid cmd.exe...
    carot = '^^';
}

/*
 * Function returns a function to create a closure and make last_promise private.
 * Create the start of a promise chain.  Everytime the queue_cmd function is called
 * a new promise is added to the end of the chain and passed to the caller and also
 * saved as last_prommise for further chaining.  If the process throws, then a new
 * chain is started.
 */
var queue_cmd = (function () {
    var last_promise = Promise.resolve()
    return function (cmd, catch_error) {
        last_promise = last_promise.then(function () {
            return new Promise(function (resolve, reject) {
                console.log('/* ' + cmd + ' */');
                child_process.exec(cmd, function (err, stdout, stderr) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(stdout.replace(/\n+$/, ''));
                    }
                });
            });
        });
        if (catch_error) {
            last_promise = last_promise.catch(function (err) {
            });
        }
        return last_promise;
    }
}());

function hsl_to_rgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        var hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

var color_hash = function(text) {
    text = text.match(/[^\/]+$/)[0];
    hash = parseInt('0x' + md5(text).slice(-5));
    var h = (((hash >> 9) & 0x1ff) ^ 0x109) / 512;      // map [0,127] to ~[  0,   1)
    var s = ((((hash >> 5) & 0x3f) ^ 0x2f) + 36) / 100; // map [0, 63] to  [.36, .99]
    var l = ((hash & 0x1f) + 24) / 100;                 // map [0, 31] to  [.24, .55]
    rgb = hsl_to_rgb(h, s, l);
    rgb = (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
    //console.log('/* ' + hash.toString(16) + ' - ' + [h, s, l] + '*/')
    return '#' + ('000000' + rgb.toString(16)).slice(-6)
};


// get repo info in order, then create digraph
// nested thens are for logical clarity
function graph(settings) {
    settings = settings || {};
    settings.branches = settings.branches || ['master'];
    if (settings.branches.indexOf('HEAD') === -1) {
        settings.branches.push('HEAD');
    }
    settings.bgcolor = settings.bgcolor || {'master': '#eeeeee', 'origin/master': '#eeeeee'};
    settings.color = settings.color || {};
    settings.fontcolor = settings.fontcolor || {};
    console.log(settings.branches);
    if (settings.include_forward === undefined) settings.include_forward = true;
    settings.rankdir = settings.rankdir || 'LR';
    var vars = {
        dot: ''
    };
    return Promise.all([queue_cmd('git tag -l'), queue_cmd('git branch -a')])
    .then(function (branches) {
        branches = branches.join('\n');
        settings.branches = settings.branches.filter(function (branch) {
            return branches.indexOf(branch) > -1;
        });
        return queue_cmd('git merge-base --octopus ' + settings.branches.join(' '));
    })
    // get earliest commit in common to all selected branches
    // maybe expand list of branches
    .then(function (base_commit) {
        vars.base_commit = base_commit.replace('\n', '');
        if (settings.include_forward) {
            return queue_cmd('git for-each-ref --contains ' + base_commit + ' --format="%(refname:short)"')
            .then(function (branches) {
                branches.split('\n').forEach(function (branch) {
                    if (settings.branches.indexOf(branch) === -1) {
                        settings.branches.push(branch);
                    }
                });
                return settings.branches;
            })
        } else {
            return settings.branches;
        }
    })
    // get commit list reachable from each branch until merge base parent
    // get parents and commit message title and create objects
    .then(function (branches) {
        settings.branches = branches;
        var rev_list_cmds = settings.branches.map(function (branch) {
            return queue_cmd('git rev-list --parents --first-parent --pretty=oneline ' + branch + ' ' + carot + vars.base_commit + carot)
            .then(function (rev_list) {
                return {
                    branch: branch,
                    commits: rev_list.split('\n')
                        .filter(function (rev_line) {
                            return rev_line !== '';
                        })
                        .map(function (rev_line) {
                            var rev_parts = rev_line.match(/(([0-9a-z]{40}\s)+)(.*)/);
                            var commits = rev_parts[1].match(/[0-9a-f]{40}/g);
                            return {
                                commit: commits[0],
                                parents: commits.slice(1),
                                title: rev_parts[3].replace(/"/g, '\\"').replace(/\//g, '\\/')
                            }
                        })
                };
            });
        });
        // queue_cmd already gaurantees sequential execution
        return Promise.all(rev_list_cmds);
    })
    // get all commits' parents, create objects and sort
    .then(function (rev_lists) {
        vars.rev_lists = rev_lists;
        return queue_cmd('git for-each-ref refs --format="%(refname) %(refname:short) %(objectname) %(*objectname)"')
        .then(function (refs) {
            return refs.split('\n')
            .filter(function (ref_line) {
                return ref_line !== '';
            })
            .map(function (ref_line) {
                var ref_split = ref_line.split(' ');
                return {
                    ref_name: ref_split[0],
                    ref_short: ref_split[1],
                    ref_commit: ref_split[3] || ref_split[2]
                };
            })
            .sort(function (a, b) {
                return ((ax = settings.branches.indexOf(a.ref_short)) !== -1 ? ax : settings.branches.length) - ((bx = settings.branches.indexOf(b.ref_short)) !== -1 ? bx : settings.branches.length);
            });
        });
    })
    .then(function (refs) {
        vars.refs = refs;
        return Promise.all([queue_cmd('git symbolic-ref --quiet HEAD', true), queue_cmd('git rev-parse HEAD')]);
    })
    .then(function (HEAD) {
        vars.HEAD = HEAD;

        if (!vars.HEAD[0]) {
            vars.refs.push({
                ref_name: 'HEAD',
                ref_short: 'HEAD',
                ref_commit: vars.HEAD[1]
            });
        }

        var commits_used = new Set();
        var commits_unused = new Set();

        var dot = 'digraph GitLost {\n';
        dot += '  graph [layout=dot splines=splines rankdir=' + settings.rankdir + ' bgcolor="#ffffff" title="GitLost"]\n';
        dot += '  node [shape=box style="rounded,filled" fixedsize=true width=0.6 height=0.4 fontcolor="#ffffff" fontname=Consolas fontsize=10]\n';
        dot += '  edge [penwidth=4 arrowhead=normal arrowsize=0.1 color="#808080"]\n\n';

        var dot_edges = '';
        vars.rev_lists.forEach(function (rev_list) {
            var color = settings.color[rev_list.branch] || color_hash(rev_list.branch);
            var bgcolor = settings.bgcolor[rev_list.branch] || '#ffffff';
            var dot_nodes = '';
            //var dot_edges = '';
            dot += '  subgraph "cluster_' + rev_list.branch + '" {\n';
            dot += '    style=filled;\n';
            dot += '    color="' + bgcolor + '";\n';
            dot += '    node [color="' + color + '"]\n';
            dot += '    edge [color="' + color + '"]\n';
            rev_list.commits.forEach(function (commit_info, index) {
                if (!commits_used.has(commit_info.commit)) {
                    var extra = '';
                    if (commit_info.parents.length > 1) {
                        extra += ' shape=octagon style="filled"';
                    }
                    if (settings.fontcolor[rev_list.branch]) {
                        extra += ' fontcolor="' + settings.fontcolor[rev_list.branch] + '"';
                    }
                    dot += ('    "' + 
                            commit_info.commit + '" [label=<<b>' +
                            commit_info.commit.substring(0,4) + '<br />' + 
                            commit_info.commit.substring(4,8) + '</b>> href="show/' +
                            commit_info.commit + '" tooltip="' + 
                            commit_info.title + '"' + extra + ']\n');
                    commits_used.add(commit_info.commit);
                    commit_info.parents.forEach(function (parent) {
                        commits_unused.add(parent);
                        dot_edges += ('    "' +
                                parent + '" -> "' +
                                commit_info.commit +
                                '" [color="' + color + '"]\n');
                    });
                }
            });
            //dot += dot_edges;
            dot += '  }\n\n';
            //console.log(rev_list);
        });
        (new Set([...commits_unused].filter(commit => !commits_used.has(commit)))).forEach(function (commit) {
            dot += '  "' + commit + '" [label=<<b>' + commit.substring(0,4) + '<br />' + commit.substring(4,8) + '</b>> href="show/' + commit + '"]\n';
        });
        dot += '\n' + dot_edges + '\n\n';
        var refs_used = new Set();
        vars.refs.forEach(function (ref) {
            if (settings.branches.indexOf(ref.ref_short) >= 0) {
                //console.log(commit);
                var labels = [];
                vars.refs.forEach(function (ref2) {
                    if (!refs_used.has(ref2.ref_name) && ref2.ref_commit === ref.ref_commit) {
                        var color = '#808080';
                        if (ref2.ref_name.startsWith('refs/heads/')) color = '#60c060';
                        else if (ref2.ref_name.startsWith('refs/remotes/')) color = '#c06060';
                        else if (ref2.ref_name.startsWith('refs/tags/')) color = '#c0c060';
                        else if (ref2.ref_name === 'HEAD') color = '#60c0c0';
                        if (ref2.ref_name === vars.HEAD[0]) {
                            labels.push('      <tr><td align="left" valign="bottom" href="show/' + ref2.ref_short + '" bgcolor="#ffffff"><font color="#60c0c0">HEAD -&gt; </font><font color="' + color + '">' + ref2.ref_short + '</font></td></tr>\n');
                        } else {
                            labels.push('      <tr><td align="left" valign="bottom" href="show/' + ref2.ref_short + '" bgcolor="#ffffff"><font color="' + color + '">' + ref2.ref_short + '</font></td></tr>\n');
                        }
                        refs_used.add(ref2.ref_name);
                    }
                });
                if (labels.length > 0) {
                    dot += '  subgraph "' + ref.ref_short + '" {\n';
                    dot += '    color="#ffffff";\n';
                    dot += '    edge [color="#c0c0c0" arrowhead=none penwidth=2]\n\n';
                    dot += '    "' + ref.ref_short + '" [label=<<table border="0" cellpadding="0px" cellspacing="0px">\n';
                    dot += labels.join('');
                    dot += '      </table>> shape=box fixedsize=false color="#ffffff" tooltip="' + ref.ref_short + '" fontname=Calibri fontsize=10]\n\n';
                    dot += '    "' + ref.ref_commit + '" -> "' + ref.ref_short + '"\n';
                    dot += '  }\n\n';
                }
            }
        })

        dot += '}\n';
        return dot;
    })
    .catch(function (err) {
        console.log('graph failed');
        console.log(err);
    });
}

module.exports = {
    graph: graph,
    queue_cmd: queue_cmd
};
