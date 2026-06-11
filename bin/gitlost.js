#!/usr/bin/env node
var open = require('open').default;
var server = require("../lib/server.js");

server.listen(6776, 'localhost', null, () => {
    console.log(server.address());
    if (process.env.GITLOST_NO_OPEN === '1') {
        return;
    }

    var url = "http://localhost:" + server.address().port + "/";
    open(url).catch(function (err) {
        console.error('Unable to open browser:', err && err.message ? err.message : err);
    });
});
