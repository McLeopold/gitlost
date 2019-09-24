var http = require('http');
//var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var EventEmitter = require('events');
var gitlost = require('./graph');

var webdir = path.join(__dirname, '../web');
var vizjs = path.join(__dirname, '../node_modules/viz.js/viz.js');

var mimetypes = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript'

}

var carot = '^';
if (process.platform === 'win32') {
    // stupid cmd.exe...
    carot = '^^';
}

class GitEmitter extends EventEmitter {}
const gitEmitter = new GitEmitter();
gitEmitter.on('error', function (err) {
    console.log('gitEmitter: ' + err);
})
setInterval(function () {
    gitEmitter.emit('git', 'heartbeat');
}, 55000);

var git_watchers = {};
function add_watcher(repo) {
    if (git_watchers[repo] === undefined) {
        var git_path = path.join(repo, '.git');
        fs.readFile(path, {encoding: 'utf8'}, function (err, data) {
            if (!err) {
                git_path = path.join(repo, data.substring(8).trim());
            }
            var git_logs_watcher = fs.watch(path.join(git_path, 'logs'), {recursive: true}, function (eventType, filename) {
                if (filename) {
                    console.log(eventType, filename);
                    gitEmitter.emit('git', eventType, filename);
                }
            })
            var git_refs_watcher = fs.watch(path.join(git_path, 'refs'), {recursive: true}, function (eventType, filename) {
                if (filename) {
                    console.log(eventType, filename);
                    gitEmitter.emit('git', eventType, filename);
                }
            })
            git_watchers[repo] = [git_logs_watcher, git_refs_watcher];
            console.log("watching: " + repo);
        });
    }
}

var server = http.createServer();

var routes = [
    {
        regex: /^\/$/,
        method: ['GET'],
        fn: function (request, response) {
            routes[1].fn(request, response, ['/graph.html', 'graph.html', 'html']);
        },
    }, {
        regex: /^\/([^\/]+\.(html|css|js))$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            response.statusCode = 200;
            response.setHeader('Content-Type', mimetypes[parts[2]]);
            var filepath = path.join(webdir, parts[1]);
            if (parts[1] === 'viz.js') {
                filepath = vizjs;
            }
            fs.readFile(filepath, 'utf8', function (err, data) {
                if (err) {
                    console.log(err);
                    response.statusCode = 404;
                    response.end();
                            }
                else {
                    response.write(data);
                    response.end();
                }
            })
        }
    }, {
        regex: /^\/git\/status$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            var repo = request.headers['gitlost-repo'];
            gitlost.queue_cmd(repo, 'git status')
            .then(function (output) {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'application/json');
                response.write(output);
                response.end();
            })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            })
        }
    }, {
        regex: /^\/dot$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            response.setHeader('Content-Type', 'text/plain');
            var settings = JSON.parse(request.headers['gitlost-settings'] || '{"rankdir":"LR"}');
            var repo = request.headers['gitlost-repo'];
            console.log(settings);
            gitlost.graph(repo, settings)
            .then(function (dot) {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/plain');
                response.write(dot);
                response.end();
            })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            });
        }
    }, {
        regex: /^\/git\/tags$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            var repo = request.headers['gitlost-repo'];
            gitlost.queue_cmd(repo, 'git for-each-ref refs/tags/* --format="%(refname) %(*objectname)"')
            .then(function (output) {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'application/json');
                response.write(JSON.stringify(output.split(/\n/).map(function (tag) {
                    var parts = tag.split(' ');
                    return {
                        refname: parts[0].substring(11),
                        objectname: parts[1]
                    }
                })));
                response.end();
            })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            })
        }
    }, {
        regex: /^\/git\/branches$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            var repo = request.headers['gitlost-repo'];
            gitlost.queue_cmd(repo, 'git for-each-ref --format="%(refname) %(objectname)"')
            .then(function (output) {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'application/json');
                response.write(JSON.stringify(output.split(/\n/).map(function (tag) {
                    var parts = tag.split(' ');
                    return {
                        refname: parts[0].substring(parts[0].indexOf('/', 6) + 1),
                        objectname: parts[1]
                    }
                })));
                response.end();
            })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            })
        }
    }, {
        regex: /^\/show\/([^;<>&|\\\*\[\?\s]+)$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            var outputResponse = {'id': parts[1]};
            var repo = request.headers['gitlost-repo'];
            gitlost.queue_cmd(repo, 'git show --stat=300 --format=fuller ' + parts[1])
                .then(function (output) {
                    outputResponse['text'] = output;
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'text/plain');
                    response.write(JSON.stringify(outputResponse));
                    response.end();
                })
                .catch(function (err) {
                    console.log(err);
                    response.statusCode = 500;
                    response.end();
                })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            })
        }
    }, {
        regex: /^\/refs$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            var repo = request.headers['gitlost-repo'];
            gitlost.queue_cmd(repo, 'git for-each-ref --format="%(objectname) %(refname) %(refname:short)"')
            .then(function (refs) {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'application/json');
                var refs = refs.split('\n').map(function (ref) {
                    var ref_info = ref.split(' ');
                    return {
                        commit: ref_info[0],
                        ref_name: ref_info[1],
                        ref_short: ref_info[2]
                    }
                });
                response.write(JSON.stringify({
                    repo_path: repo,
                    refs: refs
                }));
                response.end();
            })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            })
        }
    }, {
        regex: /^\/watch$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');
            gitEmitter.once('git', function (eventType, filename) {
                if (eventType === 'close') {
                    response.write('{"close": true}');
                } else if (eventType === 'heartbeat') {
                    response.write('{"heartbeat": true}');
                } else {
                    response.write(JSON.stringify({"filename": (filename || "")}));
                }
                response.end()
            })
        }
    }, {
        regex: /^\/close$/,
        method: ['PUT'],
        fn: function (request, response, parts) {
            gitEmitter.emit('git', 'close');
            response.end();
            server.close();
            setTimeout(function () {
                process.exit(0);
            }, 500);
        }
    }
];

function get_route(request) {
    for (var i = 0; i < routes.length; i++) {
        var route = routes[i];
        if (route.method && route.method.indexOf(request.method) !== -1) {
            var parts = route.regex.exec(request.url);
            if (parts) {
                return [parts, route];
            }
        }
    }
}

if (!fs.existsSync(path.join(__dirname, '../log'))) {
    fs.mkdirSync(path.join(__dirname, '../log'));
}
server.on('request', function (request, response) {
    fs.appendFile(path.join(__dirname, '../log') + '/gitlost.log', request.url + ' ' + (
        request.headers['x-forwarded-for'] ||
        request.connection.remoteAddress ||
        request.socket.remoteAddress ||
        request.connection.socket.remoteAddress
    ) + ' ' + request.rawHeaders + '\n', function (err) {
        if (err) console.log(err);
    });
    //console.log(request.url);
    //console.log(request.rawHeaders);
    //console.log();
    var route_data = get_route(request);
    if (route_data) {
        response.on('error', function (err) {
            console.error(err.stack);
        });
        var parts = route_data[0];
        var route = route_data[1];
        //console.log(parts);
        if (route.body) {
            var body = [];
            request.on('data', function (chunk) {
                body.push(chunk);
            }).on('end', function () {
                body = Buffer.concat(body).toString();
                route.fn(request, response, parts, body);
            }).on('error', function (err) {
                console.error(err.stack);
            });
        } else {
            route.fn(request, response, parts);
        }
    } else {
        response.statusCode = 404;
        response.end();
    }
});

module.exports = server;
