import * as opn from 'opn';
import server from "../lib/server";

opn('http://localhost:6776', {app: 'chrome'});
server.listen(6776);
