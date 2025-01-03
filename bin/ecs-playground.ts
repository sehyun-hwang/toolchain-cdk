import * as cdk from 'aws-cdk-lib';

import BastionStack from '../lib/bastion';
import BedrockOpenAiGatewayStack from '../lib/bedrock-open-ai-gateway';
import EcsPlaygroundStack from '../lib/ecs-playground-stack';
import End2EndPasswordlessExampleStack from '../lib/passwordless';
import PasswordlessFrontendStack from '../lib/passwordless-frontend';
import VsCodeEc2Stack from '../lib/vscode';

const PASSWORDLESS_FRONTEND_DIST_FOLDER_PATH = 'passwordless/dist';

const env = {
  // eslint-disable-next-line dot-notation
  account: process.env['CDK_DEFAULT_ACCOUNT'] || '',
  // eslint-disable-next-line dot-notation
  region: process.env['CDK_DEFAULT_REGION'] || '',
};

const app = new cdk.App();

const { loadBalancerServiceBase, vpc } = new EcsPlaygroundStack(app, 'EcsPlaygroundStack', {
  env,
});

new VsCodeEc2Stack(app, 'VsCodeEc2Stack', {
  env,
  vpc,
  efsSecurityGroupId: 'sg-042fdc617ba6bff47',
});

new VsCodeEc2Stack(app, 'VsCodeEc2Stack-Us', {
  env: {
    account: env.account,
    region: 'us-west-2',
  },
  efsSecurityGroupId: 'sg-00b197c59a79424c6',
});

const { distributionDomainName } = new PasswordlessFrontendStack(app, 'PasswordlessFrontendStack', {
  env,
  passwordlessFrontendDistFolderPath: PASSWORDLESS_FRONTEND_DIST_FOLDER_PATH,
});

const { listener } = loadBalancerServiceBase;
const { verifyApiUrl } = new End2EndPasswordlessExampleStack(app, 'End2EndPasswordlessExampleStack', {
  env,
  listener,
  botUrl: 'https://eo20dnx5kq1d0eb.m.pipedream.net',
  distributionDomainName,
});

new BastionStack(app, 'BastionStack', {
  env,
  vpc,
  loadBalancerServiceBase,
  nginxEnvironment: {
    API_GATEWAY_AUTH_URL: verifyApiUrl,
    ALLOWED_ORIGIN: 'https://' + distributionDomainName,
  },
});

new BedrockOpenAiGatewayStack(app, 'BedrockOpenAiGatewayStack', {
  env,
  vpc,
  loadBalancerServiceBase,
});
