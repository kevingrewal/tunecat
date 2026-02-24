const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  // Chrome extensions forbid eval — use source-map instead of default eval-based devtool
  devtool: 'cheap-source-map',
  entry: {
    'service-worker': './src/service-worker.ts',
    'offscreen/offscreen': './src/offscreen/offscreen.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'realtime-bpm-analyzer': path.resolve(
        __dirname,
        'node_modules/realtime-bpm-analyzer/dist/dist/index.esm.js',
      ),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/' },
        { from: 'src/popup/popup.css', to: 'popup/' },
        { from: 'src/offscreen/offscreen.html', to: 'offscreen/' },
        { from: 'src/icons', to: 'icons/' },
        {
          from: 'node_modules/realtime-bpm-analyzer/dist/dist/realtime-bpm-processor.js',
          to: 'realtime-bpm-processor.js',
        },
      ],
    }),
  ],
};
