var opn = require('opn');
var server = require("../lib/server.js");

opn('http://localhost:6776', {app: 'chrome'});
server.listen(6776);
