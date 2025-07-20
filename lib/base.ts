import {
  type AsgCapacityProvider, AwsLogDriver, ContainerImage,
  type Ec2Service, Ec2TaskDefinition,
  type FargateService, type FargateTaskDefinition,
  type ICluster, type NetworkMode, Secret,
} from 'aws-cdk-lib/aws-ecs';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib/core';

export interface NestedServiceStackProps extends cdk.NestedStackProps {
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;
  capacityProvider: AsgCapacityProvider;
  TaskDefinitionClass?: typeof FargateTaskDefinition | typeof Ec2TaskDefinition;
  networkMode?: NetworkMode;
}

export default abstract class NestedServiceStack extends cdk.NestedStack {
  cluster: ICluster;

  logDriver: AwsLogDriver;

  taskDefinition: Ec2TaskDefinition;

  abstract service: Ec2Service | FargateService;

  constructor(scope: cdk.Stack, id: string, {
    TaskDefinitionClass = Ec2TaskDefinition,
    ...props
  }: NestedServiceStackProps) {
    super(scope, id, props);
    this.cluster = props.loadBalancerServiceBase.cluster;
    this.logDriver = new AwsLogDriver({ streamPrefix: this.node.id });
    const { networkMode } = props;
    this.taskDefinition = new TaskDefinitionClass(this, 'TaskDefinition', {
      networkMode,
    });
  }

  addTailscaleContainer(hostname: string) {
    const tailscaleAuthKeyParameter = StringParameter.fromSecureStringParameterAttributes(this, 'TailscaleAuthKeyParameter', {
      parameterName: '/tailscale/auth-key/' + hostname,
    });

    this.taskDefinition.addContainer('tailscale', {
      memoryLimitMiB: 96,
      logging: new AwsLogDriver({ streamPrefix: this.node.id }),
      image: ContainerImage.fromRegistry('tailscale/tailscale'),
      secrets: {
        TS_AUTHKEY: Secret.fromSsmParameter(tailscaleAuthKeyParameter),
      },
      environment: {
        TS_ENABLE_HEALTH_CHECK: 'true',
        TS_HOSTNAME: hostname,
        TS_ROUTES: [
          this.cluster.vpc.vpcCidrBlock,
          '10.0.0.0/16',
        ].join(','),
      },
      healthCheck: {
        command: ['wget', '--spider', '-q', 'http://127.0.0.1:9002/healthz'],
      },
    });
  }
}
