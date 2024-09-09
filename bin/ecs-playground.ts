#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import EcsPlaygroundStack from '../lib/ecs-playground-stack';
import End2EndPasswordlessExampleStack from '../lib/passwordless';
import BastionStack from '../lib/bastion';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

const { listener, vpc } = new EcsPlaygroundStack(app, 'EcsPlaygroundStack', {
  env,
});

new End2EndPasswordlessExampleStack(app, 'End2EndPasswordlessExampleStack', {
  env,
  listener,
  botUrl: 'https://eo20dnx5kq1d0eb.m.pipedream.net',
});

new BastionStack(app, 'BastionStack', { vpc });
