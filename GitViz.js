var http = require('http');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

var mimetypes = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript'

}

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
            fs.readFile(path.join(__dirname, parts[1]), 'utf8', function (err, data) {
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
            var settings = request.headers['gitviz-settings'] || '{"rankdir":"LR"}';
            var cmd = 'powershell.exe ' + path.join(__dirname, 'graph.ps1') + ' "' + settings.replace(/"/g, '`\\"').replace(/\{/g, '`{').replace(/\}/g, '`}') + '"';
            console.log(cmd);
            child_process.exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    console.log(err);
                    response.statusCode = 500;
                    response.end();
                }
                response.statusCode = 200;
                console.log(stdout);
                response.write(stdout);
                response.end();
            })
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

var server = http.createServer();
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
server.listen(6776);
