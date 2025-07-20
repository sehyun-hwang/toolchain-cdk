/* eslint-disable max-classes-per-file */
import { Ec2Service, Secret } from 'aws-cdk-lib/aws-ecs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';
import { natsContainerOptions } from './nats-jetstream';
import { NATS_SERVER_CONFIG } from './nats-seed';

const leafNodeConfig = `leafnodes {
  remotes = [{
    url: tls://connect.ngs.global
    credentials: /tmp/leaf.creds
  }]
}`;

export default class NatsLeefStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NestedServiceStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase } = props;

    const synadiaCredsParameter = StringParameter.fromSecureStringParameterAttributes(this, 'SynadiaCredsParameter', {
      parameterName: '/synadia/creds/default',
    });

    const { taskDefinition, logDriver } = this;
    const container = taskDefinition.addContainer('nats', {
      ...natsContainerOptions,
      command: [`set -ex
echo "$SYNADIA_CREDS" > /tmp/leaf.creds
        ` + natsContainerOptions.command[0]],
      logging: logDriver,
      secrets: {
        SYNADIA_CREDS: Secret.fromSsmParameter(synadiaCredsParameter),
      },
    });
    container.addEnvironment('NATS_SERVER_CONFIG', NATS_SERVER_CONFIG + '\n' + leafNodeConfig);
    container.addEnvironment('SERVER_TAG', 'az:null');

    const { cluster } = loadBalancerServiceBase;
    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
    });
  }
}
