var child_process = require('child_process');
var queue_cmd = (function () {
    var last_promise = Promise.resolve()
    return function (cmd) {
        last_promise = last_promise.then(function () {
            return new Promise(function (resolve, reject) {
                console.log(cmd);
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
        });
        return last_promise;
    }
}());
function graph(settings) {
    settings.branches = settings.branches || ['master'];
    settings.rankdir = settings.rankdir || 'LR';
    var vars = {
        dot: ''
    };
    return queue_cmd('git merge-base --octopus ' + settings.branches.join(' '))
    .then(function (base_commit) {
        vars.base_commit = base_commit.replace('\n', '');
        var loop_promise = Promise.resolve(settings.branches[0]);
        for (var i = 0; i < settings.branches.length; i++) {
            loop_promise = loop_promise.then(function (branch) {
                return function () {
                    return queue_cmd('git rev-list --parents ' + branch + ' ^^' + vars.base_commit + '^^')
                    .then(function (rev_list) {
                        vars.rev_list = rev_list.split('\n');
                        vars.dot += vars.rev_list.join('\n');
                        return Promise.resolve();
                    })
                    .catch(function (err) {
                        console.log(err);
                    });
                }
            }(settings.branches[i]));
        }
        return loop_promise.then(function () {
            return queue_cmd('git for-each-ref refs --format="%(refname) %(refname:short) %(objectname) %(*objectname)"');
        });
    })
    .then(function (refs) {
        refs = refs.split('\n').map(function (ref_line) {
            var ref_split = ref_line.split(' ');
            return {
                ref_name: ref_split[0],
                ref_short: ref_split[1],
                ref_commit: ref_split[3] || ref_split[2]
            }
        });
        refs.sort(function (a, b) {
            return ((ax = settings.branches.indexOf(a.ref_short)) !== -1 ? ax : settings.branches.length) - ((bx = settings.branches.indexOf(b.ref_short)) !== -1 ? bx : settings.branches.length);
        })
        for (var i = 0; i < refs.length; i++) {
            console.log(refs[i].ref_name);
        }
        return vars.dot;
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
        'justin'
    ]
}).then(function (dot) {
    //console.log(dot);
})
