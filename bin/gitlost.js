#!/usr/bin/env node
var opn = require('opn');
var server = require("../lib/server.js");

server.listen(6776, 'localhost', null, () => {
    console.log(server.address());
    opn("http://"+server.address().address+":"+server.address().port+"/");
});
