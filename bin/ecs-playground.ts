import * as cdk from 'aws-cdk-lib/core';

import BastionStack from '../lib/bastion';
import BedrockOpenAiGatewayStack from '../lib/bedrock-open-ai-gateway';
import { ChatBotStack, GlobalChatBotStack } from '../lib/chatbot';
import CloudFlaredStack from '../lib/cloudflared';
import EcsPlaygroundStack from '../lib/ecs-playground-stack';
import End2EndPasswordlessExampleStack from '../lib/passwordless';
import PasswordlessFrontendStack from '../lib/passwordless-frontend';
import SimpleReverseProxyStack from '../lib/simple-reverse-proxy';
import VsCodeEc2Stack from '../lib/vscode';

const PASSWORDLESS_FRONTEND_DIST_FOLDER_PATH = 'passwordless/dist';
const CHATBOT_REGIONS = [
  'ap-northeast-1', // Prod
  'us-west-2', // VsCode
  'us-east-1', // GlobalChatBot
];

const env = {
  // eslint-disable-next-line dot-notation
  account: process.env['CDK_DEFAULT_ACCOUNT'] || '',
  // eslint-disable-next-line dot-notation
  region: process.env['CDK_DEFAULT_REGION'] || '',
};

const app = new cdk.App();

const {
  loadBalancerServiceBase,
  vpc,
  distributionDomainNameImport,
  capacityProvider,
} = new EcsPlaygroundStack(app, 'EcsPlaygroundStack', {
  env,
});

// new VsCodeEc2Stack(app, 'VsCodeEc2Stack', {
//   env,
//   vpc,
//   efsSecurityGroupId: 'sg-042fdc617ba6bff47',
// });

new VsCodeEc2Stack(app, 'VsCodeEc2Stack-Us', {
  env: {
    account: env.account,
    region: 'us-west-2',
  },
  efsSecurityGroupId: 'sg-00b197c59a79424c6',
});

const { listener } = loadBalancerServiceBase;
const passwordlessStack = new End2EndPasswordlessExampleStack(app, 'End2EndPasswordlessExampleStack', {
  env,
  listener,
  botUrl: 'https://eo20dnx5kq1d0eb.m.pipedream.net',
  distributionDomainName: 'd33pxtdicwnfxx.cloudfront.net',
});
const {
  verifyApiUrl, passwordlessConfigEntries, passwordlessConfigEntriesLength,
} = passwordlessStack;

const passwordlessFrontendStack = new PasswordlessFrontendStack(app, 'PasswordlessFrontendStack', {
  env,
  passwordlessFrontendDistFolderPath: PASSWORDLESS_FRONTEND_DIST_FOLDER_PATH,
  distributionDomainNameImport,
  passwordlessConfigEntries,
  passwordlessConfigEntriesLength,
});
passwordlessFrontendStack.addDependency(passwordlessStack, 'passwordlessConfigEntries');

const { distributionDomainName } = passwordlessFrontendStack;
new BastionStack(app, 'BastionStack', {
  env,
  vpc,
  loadBalancerServiceBase,
  securityGroup: loadBalancerServiceBase.pushSecurityGroup(),
  nginxEnvironment: {
    API_GATEWAY_AUTH_URL: verifyApiUrl,
    ALLOWED_ORIGIN: 'https://' + distributionDomainName,
  },
});

new BedrockOpenAiGatewayStack(app, 'BedrockOpenAiGatewayStack', {
  env,
  loadBalancerServiceBase,
});

new SimpleReverseProxyStack(app, 'SimpleReverseProxyStack', {
  env,
  loadBalancerServiceBase,
});

const { cluster } = loadBalancerServiceBase;
new CloudFlaredStack(app, 'CloudFlaredStack', {
  env,
  cluster,
  capacityProvider,
});

CHATBOT_REGIONS.forEach(region => {
  new ChatBotStack(app, 'ChatBotStack-' + region, {
    stackName: 'ChatBotStack',
    env: {
      account: env.account,
      region,
    },
  });
});

new GlobalChatBotStack(app, 'GlobalChatBotStack', {
  env: {
    account: env.account,
    region: 'us-east-1',
  },
  regions: CHATBOT_REGIONS,
  chatConfigurationArn: 'arn:aws:chatbot::248837585826:chat-configuration/slack-channel/default',
});
