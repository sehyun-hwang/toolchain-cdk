import {
  AwsLogDriver, ContainerImage, Ec2Service, Ec2TaskDefinition, type ICluster, Secret,
} from 'aws-cdk-lib/aws-ecs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

const TUNNEL_METRICS = '127.0.0.1:8000';

interface CloudFlaredStackProps extends cdk.StackProps {
  cluster: ICluster;
}

export default class CloudFlaredStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CloudFlaredStackProps) {
    super(scope, id, props);
    const { cluster } = props;

    const taskDefinition = new Ec2TaskDefinition(this, 'TaskDefinition');
    const cloudflareTokenParameter = StringParameter.fromSecureStringParameterAttributes(this, 'CloudFlareTokenParameter', {
      parameterName: '/cloudflare/tunnel/token',
    });
    taskDefinition.addContainer('cloudflared', {
      memoryLimitMiB: 128,
      logging: new AwsLogDriver({ streamPrefix: this.node.id }),
      image: ContainerImage.fromRegistry('cloudflare/cloudflared'),
      command: ['tunnel', '--no-autoupdate', 'run'],
      secrets: {
        TUNNEL_TOKEN: Secret.fromSsmParameter(cloudflareTokenParameter),
      },
      environment: {
        TUNNEL_METRICS,
      },
      healthCheck: {
        command: ['cloudflared', 'tunnel', '--metrics', TUNNEL_METRICS, 'ready'],
      },
    });

    new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2,
    });
  }
}
