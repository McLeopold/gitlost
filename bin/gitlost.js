#!/usr/bin/env node
var opn = require('opn');
var server = require("../lib/server.js");

opn('http://localhost:6776');
server.listen(6776);
