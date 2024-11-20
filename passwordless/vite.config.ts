import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';

import { defineConfig, loadEnv } from 'vite';
import type { AppClient } from 'cognito-local/lib/services/appClient';
import type { Config } from 'amazon-cognito-passwordless-auth/config';
import Pino from 'pino';
import cognitoLocal from 'cognito-local';
import generateFile from 'vite-plugin-generate-file';
import preact from '@preact/preset-vite';
import urlResolve from 'rollup-plugin-url-resolve';

let server: Server;

export default defineConfig(async ({ mode }) => {
  console.log(mode);

  let COGNITO_LOCAL_DB_JSON = null;
  let PASSWORDLESS_CONFIG_JSON: string;
  if (mode === 'development') {
    // Local Cognitio server
    if (server)
      await new Promise<void>((resolve, reject) => server
        .close((error?: Error | undefined) => { error ? reject(error) : resolve(); }));
    server = await cognitoLocal.createDefaultServer(Pino())
      .then(cognitoServer => cognitoServer.start());
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
    const passwordlessConfig: Config = {
      cognitoIdpEndpoint: 'http://localhost:' + cognitoAddress.port,
      clientId,
      userPoolId,
    };
    COGNITO_LOCAL_DB_JSON = JSON.stringify(`.cognito/db/${userPoolId}.json`);
    PASSWORDLESS_CONFIG_JSON = JSON.stringify(passwordlessConfig);
  } else {
    PASSWORDLESS_CONFIG_JSON = await fetch('https://elb.hwangsehyun.com/passwordless/params')
      .then(res => res.text());
  }

  const define = {
    'import.meta.env.PASSWORDLESS_CONFIG_JSON': PASSWORDLESS_CONFIG_JSON,
    'import.meta.env.COGNITO_LOCAL_DB_JSON': COGNITO_LOCAL_DB_JSON,
  };
  console.log(define);
  const { VITE_API_BASE } = loadEnv(mode, process.cwd());
  return {
    resolve: {
      alias: [
        { find: '@ttyd-terminal', replacement: 'http://localhost:9000/terminal.754c44763d540d534ad4.js' },
      ],
    },
    plugins: [
      {
        name: 'rollup-plugin-url-resolve',
        enforce: 'pre',
        ...urlResolve(),
      },
      preact(),
      generateFile([{
        type: 'json',
        output: 'env.json',
        data: {
          VITE_API_BASE,
        },
      }]),
    ],
    define,
  };
});
