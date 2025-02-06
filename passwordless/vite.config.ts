import { glob, readFile } from 'node:fs/promises';
import type { Server } from 'node:http';

import preact from '@preact/preset-vite';
import type { Config } from 'amazon-cognito-passwordless-auth/config';
import cognitoLocal from 'cognito-local';
import type { AppClient } from 'cognito-local/lib/services/appClient';
import Pino from 'pino';
import urlResolve from 'rollup-plugin-url-resolve';
import { type PluginOption, defineConfig, loadEnv } from 'vite';
import generateFile from 'vite-plugin-generate-file';
import { insertHtml, h } from 'vite-plugin-insert-html';

let server: Server;

export default defineConfig(async ({ command, mode }) => {
  console.log(command);

  let COGNITO_LOCAL_DB_JSON = null;
  let passwordlessConfig: Config;
  if (command === 'serve') {
    server = global.server;
    // Local Cognitio server
    if (server)
      await new Promise<void>((resolve, reject) => server
        .close((error?: Error) => { error ? reject(error) : resolve(); }));
    server = await cognitoLocal.createDefaultServer(Pino())
      .then(cognitoServer => cognitoServer.start());
    global.server = server;
    const cognitoAddress = server.address();
    if (typeof cognitoAddress === 'string' || cognitoAddress === null)
      throw new Error();

    // Local Cognito DB
    const { Clients }: {
      Clients: Record<string, AppClient>
    } = await readFile('.cognito/db/clients.json', 'utf-8')
      .then(JSON.parse);
    const [{
      ClientId: clientId,
      UserPoolId: userPoolId,
    }] = Object.values(Clients);
    passwordlessConfig = {
      cognitoIdpEndpoint: `http://localhost:${cognitoAddress.port}`,
      clientId,
      userPoolId,
    };
    COGNITO_LOCAL_DB_JSON = JSON.stringify(`.cognito/db/${userPoolId}.json`);
  } else {
    // command === 'build'
    passwordlessConfig = await fetch('https://elb.hwangsehyun.com/passwordless/params')
      .then(res => res.json());
  }

  const define = {
    'import.meta.env.COGNITO_LOCAL_DB_JSON': COGNITO_LOCAL_DB_JSON,
  };
  console.log(define);
  const { VITE_API_BASE } = loadEnv(mode, process.cwd());

  const { value: ttydJsPath } = await glob('ttyd/terminal.*.js')[Symbol.asyncIterator]().next();
  console.log({ ttydJsPath });
  const urlResolvePlugin: PluginOption = ttydJsPath ? {} : {
    name: 'rollup-plugin-url-resolve',
    enforce: 'pre',
    ...urlResolve(),
  };

  return {
    assetsInclude: ['/src/env.js'], // Build-time config. Serve-time config is src="/src/env.js?url" in index.html
    resolve: {
      alias: [{
        find: '@ttyd-terminal',
        replacement: ttydJsPath || 'http://localhost:9000/terminal.4154146d5b5fb7bcdfad.js',
      },
      command === 'serve' && {
        find: 'env.json',
        replacement: 'virtual:env',
      },
      ].filter(x => x),
    },
    plugins: [
      urlResolvePlugin,
      preact({
        babel: {
          generatorOpts: {
            importAttributesKeyword: 'with',
          },
        },
      }),
      generateFile([{
        type: 'json',
        output: 'env.json',
        data: {
          VITE_API_BASE,
          PASSWORDLESS_CONFIG: passwordlessConfig,
        },
      }]),
      insertHtml({
        headPrepend: [h('script', { src: '/assets/env.js' })],
      }),
    ],
    define,
    build: {
      manifest: true,
      rollupOptions: {
        external: ['/env.json'],
        input: {
          index: 'index.html',
          env: 'src/env.js',
        },
        output: {
          assetFileNames({ name }: { name: string }) {
            console.log('Asset name', name);
            return `assets/[name]${name === 'env.js' ? '' : '-[hash]'}[extname]`;
          },
        },
      },
    },
  };
});
