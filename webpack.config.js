const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

module.exports = {
  entry: './index.js',
  devtool: 'source-map',
  target: 'web',
  output: {
    path: `${__dirname}/dist`,
    filename: 'index.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
  },
  plugins: [new NodePolyfillPlugin()],
  performance: {
    hints: false,
  },
}
