import * as path from 'path'
import os from 'os'
import webpack from 'webpack'
import { Configuration as DevServerConfig } from 'webpack-dev-server'
import HtmlPlugin from 'html-webpack-plugin'
import nodeExternals from 'webpack-node-externals'
import HardSourcePlugin from 'hard-source-webpack-plugin'
import ForkTsCheckerPlugin from 'fork-ts-checker-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'
import OnBuildPlugin from 'on-build-webpack'
import fs from 'fs'

interface Options {
  isDev: boolean
}

const tsRule: webpack.Rule = {
  test: /\.[tj]sx?$/,
  include: path.resolve(__dirname, 'src'),
  use: [
    {
      loader: 'ts-loader',
      options: {
        experimentalWatchApi: true,
        transpileOnly: true,
      },
    },
  ],
}

const cssRule: webpack.Rule = {
  test: /\.css$/,
  use: [
    'style-loader',
    {
      loader: 'css-loader',
      options: {
        modules: {
          mode: 'global',
          localIdentName: '[local]-[hash:base64:5]',
        },
      },
    },
  ],
}

const imageRule: webpack.Rule = {
  test: /\.(png|svg|jpg|gif)$/,
  use: {
    loader: 'file-loader',
    options: {
      outputPath: 'assets',
      publicPath: 'assets',
      name: '[name].[ext]',
    },
  },
}

const fontRule: webpack.Rule = {
  test: /\.(woff|woff2|eot|ttf|otf)$/,
  use: {
    loader: 'file-loader',
    options: {
      outputPath: 'assets',
      publicPath: 'assets',
      name: '[name].[ext]',
    },
  },
}

const devServer: DevServerConfig = {
  contentBase: path.join(__dirname, 'dist'),
  hotOnly: true,
  overlay: {
    warnings: false,
    errors: true,
  },
}

function shared({ isDev }: Options): webpack.Configuration {
  return {
    context: path.resolve(__dirname),
    devtool: isDev ? undefined : 'source-map',
    devServer,
    stats: {
      assets: false,
      maxModules: 3,
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    externals: [
      nodeExternals({
        whitelist: [/webpack/, '@ibm/plex'],
      }),
    ],
    module: {
      rules: [tsRule, cssRule, imageRule, fontRule],
    },
  }
}

function config(cb: (opts: Options) => webpack.Configuration) {
  return (env: any, args: any) => {
    const { mode = 'development' } = args
    const opts = { isDev: mode === 'development' }
    const conf = cb(opts)

    return Object.assign(
      {},
      shared(opts),
      {
        mode,
        output: {
          path: path.resolve(__dirname, 'dist'),
          filename: `[name].js`,
          globalObject: 'this',
        },
      } as webpack.Configuration,
      conf
    )
  }
}

const cacheDirectory = path.resolve(__dirname, '.cache/hard-source/[confighash]')

// Get node path for clipper host.
function getNodePath(isDev: boolean) {
  if (isDev) return process.execPath
  return os.platform() === 'win32' ? './PushPin.exe' : './PushPin'
}

export default [
  config(({ isDev }) => ({
    name: 'main',
    entry: ['./src/main'],
    target: 'electron-main',
    plugins: [
      new ForkTsCheckerPlugin({
        formatter: 'codeframe',
      }),
      ...(isDev
        ? [
            new HardSourcePlugin({
              cacheDirectory,
              info: {
                level: 'warn',
                mode: 'none',
              },
            }),
          ]
        : []),
    ],
  })),

  config(({ isDev }) => ({
    name: 'freeze-dry-preload',
    entry: { 'freeze-dry-preload': './src/freeze-dry-preload' },
    target: 'electron-renderer',
    devtool: false,
    plugins: [
      new ForkTsCheckerPlugin({
        formatter: 'codeframe',
      }),
      ...(isDev
        ? [
            new HardSourcePlugin({
              cacheDirectory,
              info: {
                level: 'warn',
                mode: 'none',
              },
            }),
          ]
        : []),
    ],
  })),

  config(({ isDev }) => ({
    name: 'clipper-host',
    entry: { 'clipper-host': './src/apps/clipper-host' },
    target: 'node',
    devtool: false,
    output: {
      path: path.resolve(__dirname, 'dist/clipper-host'),
      filename: `[name].js`,
      globalObject: 'this',
    },
    externals: [],
    plugins: [
      new ForkTsCheckerPlugin({
        formatter: 'codeframe',
      }),
      new CopyPlugin([
        {
          from: 'src/apps/clipper-host/*.+(sh|bat)',
          flatten: true,
          transform: (content: Buffer, filePath: string) => {
            const nodePath = getNodePath(isDev)
            const interpolated = content.toString().replace('__NODE_PATH__', nodePath)
            return Buffer.from(interpolated)
          },
        },
      ]),
      new OnBuildPlugin(() => {
        // set permissions on the clipper-host scripts
        const clipperHostDir = path.resolve(__dirname, 'dist/clipper-host')
        fs.chmodSync(path.join(clipperHostDir, 'clipper-host.js'), 0o755)
        fs.chmodSync(path.join(clipperHostDir, 'clipper-host.sh'), 0o755)
      }),
      ...(isDev
        ? [
            new HardSourcePlugin({
              cacheDirectory,
              info: {
                level: 'warn',
                mode: 'none',
              },
            }),
          ]
        : []),
    ],
  })),

  config(({ isDev }) => ({
    name: 'renderer',
    entry: {
      renderer: './src/renderer',
      background: './src/background',
    },
    target: 'electron-renderer',
    plugins: [
      new ForkTsCheckerPlugin({
        formatter: 'codeframe',
      }),
      new HtmlPlugin({ title: 'PushPin', chunks: ['renderer'] }),
      new HtmlPlugin({
        title: 'PushPin: Background',
        chunks: ['background'],
        filename: 'background.html',
      }),
      ...(isDev
        ? [
            new HardSourcePlugin({
              cacheDirectory,
              info: {
                level: 'warn',
                mode: 'none',
              },
            }),
            new webpack.HotModuleReplacementPlugin(),
          ]
        : []),
    ],
  })),
]
