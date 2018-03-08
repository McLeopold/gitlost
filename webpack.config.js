const path = require('path');
const webpack = require('webpack');

var nodeExternals = require('webpack-node-externals');

const common = {
    plugins: [ /* common plugins */ ],
    resolve: {
        extensions: ['.js'] // common extensions
    },
    mode: 'development',
    // other plugins, postcss config etc. common for frontend and backend
};

const frontend = {
     entry: [
         './web/client.js'
     ],
     output: {
        filename: 'web.bundle.js',
        path: path.resolve(__dirname, 'dist')
     },
     devtool: 'inline-source-map',
     plugins: [
        new webpack.ProvidePlugin({
            jQuery: 'jquery'
        })
    ]
     // other loaders, plugins etc. specific for frontend
};

const backend = {
     entry: [
         './bin/gitlost.js'
     ],
     output: {
        filename: 'gitlost.js',
        path: path.resolve(__dirname, 'dist')
     },
     target: 'node',
     stats: 'verbose',
     externals: [nodeExternals()],
     node: {
         __dirname: false
     }
     // other loaders, plugins etc. specific for backend
};

module.exports = [
    Object.assign({} , common, frontend),
    Object.assign({} , common, backend)
];