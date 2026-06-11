const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(rootDir, 'web', 'vendor');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(fromPath, toPath) {
  ensureDir(path.dirname(toPath));
  fs.copyFileSync(fromPath, toPath);
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function syncFile(relativeSourcePath, relativeTargetPath) {
  copyFile(path.join(rootDir, relativeSourcePath), path.join(vendorDir, relativeTargetPath));
}

ensureDir(vendorDir);

syncFile('node_modules/jquery/dist/jquery.min.js', 'js/jquery.min.js');
syncFile('node_modules/vue/dist/vue.min.js', 'js/vue.min.js');
syncFile('node_modules/vuetify/dist/vuetify.min.js', 'js/vuetify.min.js');
syncFile('node_modules/vuetify/dist/vuetify.min.css', 'css/vuetify.min.css');
syncFile('node_modules/sortablejs/Sortable.min.js', 'js/Sortable.min.js');
syncFile('node_modules/vuedraggable/dist/vuedraggable.umd.min.js', 'js/vuedraggable.umd.min.js');
syncFile('node_modules/d3/dist/d3.min.js', 'js/d3.min.js');
syncFile('node_modules/d3-graphviz/build/d3-graphviz.min.js', 'js/d3-graphviz.min.js');
syncFile('node_modules/@mdi/font/css/materialdesignicons.min.css', 'css/materialdesignicons.min.css');
syncFile('node_modules/@mdi/font/fonts/materialdesignicons-webfont.eot', 'fonts/materialdesignicons-webfont.eot');
syncFile('node_modules/@mdi/font/fonts/materialdesignicons-webfont.ttf', 'fonts/materialdesignicons-webfont.ttf');
syncFile('node_modules/@mdi/font/fonts/materialdesignicons-webfont.woff', 'fonts/materialdesignicons-webfont.woff');
syncFile('node_modules/@mdi/font/fonts/materialdesignicons-webfont.woff2', 'fonts/materialdesignicons-webfont.woff2');
syncFile('node_modules/@hpcc-js/wasm/dist/graphviz.umd.js', 'js/graphviz.umd.js');

writeTextFile(path.join(vendorDir, 'js', 'graphviz-worker.js'),
`var graphvizBaseUrl = String(self.location.href || '').replace(/[^/]+$/, '');
importScripts(graphvizBaseUrl + 'graphviz.umd.js');
self['@hpcc-js/wasm'] = self['@hpcc-js/wasm/graphviz'];
`);

console.log('Web vendor assets synced to', vendorDir);