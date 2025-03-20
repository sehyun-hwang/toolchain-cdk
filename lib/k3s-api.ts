import {
  type AsgCapacityProvider, AwsLogDriver, ContainerImage, Ec2Service, Secret,
} from 'aws-cdk-lib/aws-ecs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type * as cdk from 'aws-cdk-lib/core';

import type { NestedServiceStackProps } from './base';
import NestedServiceStack from './base';

interface K3sApiStackProps extends NestedServiceStackProps {
  capacityProvider: AsgCapacityProvider;
}

export default class K3sApiStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: K3sApiStackProps) {
    super(scope, id, props);
    const { cluster } = props.loadBalancerServiceBase;

    const hostname = 'ecs-k3s';
    const tailscaleAuthKeyParameter = StringParameter.fromSecureStringParameterAttributes(this, 'TailscaleAuthKeyParameter', {
      parameterName: '/tailscale/auth-key/' + hostname,
    });

    const { taskDefinition } = this;
    taskDefinition.addContainer('k3s', {
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: this.node.id }),
      image: ContainerImage.fromRegistry('rancher/k3s:v1.30.10-k3s1'),
      command: ['server', '--disable-agent'],
      secrets: {
        TUNNEL_TOKEN: Secret.fromSsmParameter(tailscaleAuthKeyParameter),
      },
      environment: {
        TS_ROUTES: cluster.vpc.vpcCidrBlock,
      },
      healthCheck: {
        command: ['kubectl', 'get', '--raw=/readyz'],
      },
    });

    taskDefinition.addContainer('tailscale', {
      memoryLimitMiB: 50,
      logging: new AwsLogDriver({ streamPrefix: this.node.id }),
      image: ContainerImage.fromRegistry('tailscale/tailscale:latest'),
      secrets: {
        TS_AUTHKEY: Secret.fromSsmParameter(tailscaleAuthKeyParameter),
      },
      environment: {
        TS_ENABLE_HEALTH_CHECK: 'true',
        TS_HOSTNAME: hostname,
      },
      healthCheck: {
        command: ['wget', '--spider', '-q', 'http://127.0.0.1:9002/healthz'],
      },
    });

    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      capacityProviderStrategies: [{
        capacityProvider: props.capacityProvider.capacityProviderName,
        weight: 1,
      }],
    });
  }
}
