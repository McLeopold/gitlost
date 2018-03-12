const path = require('path');
const webpack = require('webpack');

var nodeExternals = require('webpack-node-externals');

const common = {
    plugins: [ /* common plugins */],
    resolve: {
        extensions: ['.js', '.css', '.less'], // common extensions
        modules: [
            'node_modules'
        ]
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
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: ['babel-loader']
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            { test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/, loader: 'url-loader?limit=100000' }
        ]
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

const css = {
    entry: './web/graph.css',
    output: {
        filename: 'graph.css',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            { test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/, loader: 'url-loader?limit=100000' }
        ]
    },
    resolve: {
        extensions: ['.js', '.css', '.less'],
        modules: [
            'node_modules'
        ]
    },
    mode: 'development',
}


module.exports = [
    Object.assign({}, common, frontend),
    Object.assign({}, common, backend)
];