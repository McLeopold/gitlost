var child_process = require('child_process');
var queue_cmd = (function () {
    var last_promise = Promise.resolve();
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
        return queue_cmd('git rev-list --parents ' + settings.branches.join(' ') + ' ^^' + vars.base_commit + '^^');
    })
    .then(function (rev_list) {
        vars.rev_list = rev_list.split('\n');
        vars.dot += vars.rev_list.join('\n');
        return vars.dot;
    });
}
graph({
    branches: [
        'master',
        'nodejs',
        'justin'
    ]
}).then(function (dot) {
    console.log(dot);
})
