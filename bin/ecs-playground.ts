import * as cdk from 'aws-cdk-lib';

import BastionStack from '../lib/bastion';
import EcsPlaygroundStack from '../lib/ecs-playground-stack';
import End2EndPasswordlessExampleStack from '../lib/passwordless';
import PasswordlessFrontendStack from '../lib/passwordless-frontend';

const PASSWORDLESS_FRONTEND_DIST_FOLDER_PATH = 'passwordless/dist';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '',
  region: process.env.CDK_DEFAULT_REGION || '',
};

const app = new cdk.App();

const { loadBalancerServiceBase, vpc } = new EcsPlaygroundStack(app, 'EcsPlaygroundStack', {
  env,
});

new BastionStack(app, 'BastionStack', {
  env,
  vpc,
  loadBalancerServiceBase,
});

const { distributionDomainName } = new PasswordlessFrontendStack(app, 'PasswordlessFrontendStack', {
  env,
  passwordlessFrontendDistFolderPath: PASSWORDLESS_FRONTEND_DIST_FOLDER_PATH,
});

const { listener } = loadBalancerServiceBase;
new End2EndPasswordlessExampleStack(app, 'End2EndPasswordlessExampleStack', {
  env,
  listener,
  botUrl: 'https://eo20dnx5kq1d0eb.m.pipedream.net',
  distributionDomainName,
});
