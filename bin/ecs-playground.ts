/* eslint-disable no-new */

import * as cdk from 'aws-cdk-lib';

import BastionStack from '../lib/bastion';
import EcsPlaygroundStack from '../lib/ecs-playground-stack';
import End2EndPasswordlessExampleStack from '../lib/passwordless';
import BastionPasswordlessProxyStack from '../lib/bastion-passwordless-proxy';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

const { loadBalancerServiceBase, vpc } = new EcsPlaygroundStack(app, 'EcsPlaygroundStack', {
  env,
});

const { proxyFunction } = new BastionStack(app, 'BastionStack', {
  env,
  vpc,
  loadBalancerServiceBase,
});

new End2EndPasswordlessExampleStack(app, 'End2EndPasswordlessExampleStack', {
  env,
  listener: loadBalancerServiceBase.listener,
  botUrl: 'https://eo20dnx5kq1d0eb.m.pipedream.net',
  proxyFunction,
});
