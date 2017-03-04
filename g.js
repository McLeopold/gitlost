var child_process = require('child_process');

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
    return function (cmd) {
        last_promise = last_promise.then(function () {
            return new Promise(function (resolve, reject) {
                //console.log(cmd);
                child_process.exec(cmd, function (err, stdout, stderr) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(stdout.replace(/\n+$/, ''));
                    }
                });
            });
        })
        .catch(function (err) {
            console.log(err);
            last_promise = Promise.resolve();
        });
        return last_promise;
    }
}());

function hslToRgb(h, s, l){
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
    var hash = 0;
    function df(n) {
        return ((n << 4) & 0x30) + ((n >> 2) & 0x0f)
    }
    for (var i = 0; i < text.length; i += 3) {
        hash ^= ((df(text.charCodeAt(i  ) || 0) << 12) +
                 (df(text.charCodeAt(i+1) || 0) <<  6) +
                 (df(text.charCodeAt(i+2) || 0)))
    }
    var h = (hash >> 11) / 128;                // map [0,127] to ~[  0,   1)
    var s = (((hash >> 5) & 0x3f) + 36) / 100; // map [0, 63] to  [.36, .99]
    var l = ((hash & 0x1f) + 24) / 100;        // map [0, 31] to  [.24, .55]
    rgb = hslToRgb(h, s, l);
    rgb = (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
    // mask to prevent pale colors and zero pad
    console.log('/* ' + rgb.toString(16) + ' - ' + [h, s, l] + '*/')
    return '#' + ('000000' + rgb.toString(16)).slice(-6)
};


// get repo info in order, then create digraph
// nested thens are for logical clarity
function graph(settings) {
    settings.branches = settings.branches || ['master'];
    settings.rankdir = settings.rankdir || 'LR';
    var vars = {
        dot: ''
    };
    // get earliest commit in common to all selected branches
    return queue_cmd('git merge-base --octopus ' + settings.branches.join(' '))
    // get commit list reachable from each branch until merge base parent
    // get parents and commit message title and create objects
    .then(function (base_commit) {
        vars.base_commit = base_commit.replace('\n', '');
        var rev_list_cmds = settings.branches.map(function (branch) {
            return queue_cmd('git rev-list --parents --pretty=oneline ' + branch + ' ' + carot + vars.base_commit + carot)
            .then(function (rev_list) {
                return {
                    branch: branch,
                    commits: rev_list.split('\n')
                        .filter(function (rev_line) {
                            return rev_line !== '';
                        })
                        .map(function (rev_line) {
                            var rev_parts = rev_line.match(/(([0-9a-z]{40}\s)+)(.+)/);
                            var commits = rev_parts[1].match(/[0-9a-f]{40}/g);
                            return {
                                commit: commits[0],
                                parents: commits.slice(1),
                                title: rev_parts[3]
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
    .then(function (commits) {
        vars.commits = commits;

        var commits_used = new Set();

        var dot = 'digraph GitViz {\n';
        dot += '  graph [layout=dot rankdir=RL bgcolor="#ffffff" title="GitViz"]\n';
        dot += '  node [shape=box style="rounded,filled" fixedsize=true width=0.6 height=0.4 fontcolor="#ffffff" fontname=Consolas fontsize=10]\n';
        dot += '  edge [penwidth=4 arrowhead=normal arrowsize=0.1 color="#808080"]\n\n';

        vars.rev_lists.forEach(function (rev_list) {
            var color = color_hash(rev_list.branch);
            var dot_nodes = '';
            var dot_edges = '';
            dot += '  subgraph "cluster_' + rev_list.branch + '" {\n';
            dot += '    color="#ffffff";\n';
            dot += '    node [color="' + color + '"]\n';
            dot += '    edge [color="' + color + '"]\n';
            rev_list.commits.forEach(function (commit_info, index) {
                if (!commits_used.has(commit_info.commit)) {
                    dot += ('    "' + 
                            commit_info.commit + '" [label=<<b>' +
                            commit_info.commit.substring(0,4) + '<br />' + 
                            commit_info.commit.substring(4,8) + '</b>> href="show/' +
                            commit_info.commit + '" tooltip="' + 
                            commit_info.title + '"]\n');
                    commits_used.add(commit_info.commit);
                    if (index < rev_list.commits.length - 1) {
                        commit_info.parents.forEach(function (parent) {
                            dot_edges += ('    "' +
                                    parent + '" -> "' +
                                    commit_info.commit + '"\n');
                        });
                    };
                }
            });
            dot += '\n' + dot_edges + '  }\n\n';
            //console.log(rev_list);
        })
        vars.commits.forEach(function (commit) {
            //console.log(commit);
        })

        dot += '}\n';
        return dot;
    })
    .catch(function (err) {
        console.log(err);
    });
}

graph({
    branches: [
        'master',
        'origin/master',
        'nodejs',
        'justin',
        'controls'
    ]
}).then(function (dot) {
    console.log(dot);
})
