import { glob } from 'node:fs/promises';
import type { Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

import cognitoLocal from "cognito-local";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import Pino from "pino";
import { Config } from 'amazon-cognito-passwordless-auth/config';
import { AppClient } from 'cognito-local/lib/services/appClient';

let server: Server;

export default defineConfig(async ({ mode }) => {
  console.log(mode);

  let COGNITO_LOCAL_DB_JSON = null;
  let PASSWORDLESS_CONFIG_JSON: string;
  if (mode === 'development') {
    // Local Cognitio server
    server && await new Promise<void>((resolve, reject) => server
      .close(error => error ? reject(error) : resolve()));
    server = await cognitoLocal.createDefaultServer(Pino())
      .then(cognitoServer => cognitoServer.start());
    const cognitoAddress = server.address();
    if (typeof cognitoAddress === 'string')
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
  return {
    plugins: [
      preact(),
    ],
    define,
  };
});
