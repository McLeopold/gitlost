var http = require('http');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var EventEmitter = require('events');
var gitlost = require('./graph');

var webdir = path.join(__dirname, '../web');

var mimetypes = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript'

}

class GitEmitter extends EventEmitter {}
const gitEmitter = new GitEmitter();
gitEmitter.on('error', function (err) {
    console.log('gitEmitter: ' + err);
})
setInterval(function () {
    gitEmitter.emit('git', 'heartbeat');
}, 55000);
var git_logs_watcher = fs.watch(path.join(process.cwd(), '.git', 'logs'), {recursive: true}, function (eventType, filename) {
    if (filename) {
        console.log(eventType, filename);
        gitEmitter.emit('git', eventType, filename);
    }
})
var git_refs_watcher = fs.watch(path.join(process.cwd(), '.git', 'refs'), {recursive: true}, function (eventType, filename) {
    if (filename) {
        console.log(eventType, filename);
        gitEmitter.emit('git', eventType, filename);
    }
})

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
            console.log(path.join(webdir, parts[1]));
            fs.readFile(path.join(webdir, parts[1]), 'utf8', function (err, data) {
                if (err) throw err;
                response.write(data);
                response.end();
            })
        }
    }, {
        regex: /^\/dot$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            response.setHeader('Content-Type', 'text/plain');
            var settings = JSON.parse(request.headers['gitlost-settings'] || '{"rankdir":"LR"}');
            gitlost.graph(settings)
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
        regex: /\/show\/([^;<>&|\\\*\[\?\w]+)$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            gitlost.queue_cmd('git show ' + parts[1])
            .then(function (output) {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/plain');
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
        regex: /\/refs$/,
        method: ['GET'],
        fn: function (request, response, parts) {
            gitlost.queue_cmd('git for-each-ref --format="%(objectname) %(refname) %(refname:short)"')
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
                response.write(JSON.stringify(refs));
                response.end();
            })
            .catch(function (err) {
                console.log(err);
                response.statusCode = 500;
                response.end();
            })
        }
    }, {
        regex: /\/watch$/,
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
                    response.write('{"filename": "' + (filename || "") + '"}')
                }
                response.end()
            })
        }
    }, {
        regex: /\/close$/,
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

server.on('request', function (request, response) {
    console.log(request.url);
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
