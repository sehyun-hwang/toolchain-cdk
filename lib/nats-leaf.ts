/* eslint-disable max-classes-per-file */
import { ContainerImage, Ec2Service, Secret } from 'aws-cdk-lib/aws-ecs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';

export default class NatsSeedNestedStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NestedServiceStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase } = props;

    const synadiaCredsParameter = StringParameter.fromSecureStringParameterAttributes(this, 'SynadiaCredsParameter', {
      parameterName: '/synadia/creds/default',
    });

    const { taskDefinition, logDriver } = this;
    taskDefinition.addContainer('nats', {
      memoryLimitMiB: 32,
      logging: logDriver,
      image: ContainerImage.fromRegistry('nats:alpine'),
      secrets: {
        SYNADIA_CREDS: Secret.fromSsmParameter(synadiaCredsParameter),
      },
      environment: {
        NATS_SERVER_CONFIG: `http_port: 8222
server_name: $HOSTNAME

cluster {
  name: default
  listen: 0.0.0.0:6222
  routes: [
    %s
  ]
}`,
      },
      entryPoint: ['sh', '-c', 'printf "$SYNADIA_CREDS" > /tmp/synadia-creds.txt && echo "$NATS_SERVER_CONFIG" > /tmp/nats-server.conf && exec $@'],
      command: ['nats-server', '-c', '/tmp/nats-server.conf'],
    });

    const { cluster } = loadBalancerServiceBase;
    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      daemon: true,
    });
  }
}
