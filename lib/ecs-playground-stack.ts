/* eslint-disable no-new */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { AutoScalingGroup, HealthCheck } from 'aws-cdk-lib/aws-autoscaling';
import {
  InstanceArchitecture,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
} from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancedEc2Service } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Duration } from 'aws-cdk-lib';

/**
 * @link https://dev.to/aws-builders/autoscaling-using-spot-instances-with-aws-cdk-ts-4hgh
 */
export default class HelloEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });

    const autoScalingGroup = new AutoScalingGroup(this, 'AutoScalingGroup', {
      vpc,
      instanceType: InstanceType.of(
        InstanceClass.BURSTABLE4_GRAVITON,
        InstanceSize.MICRO,
      ),
      machineImage: new ecs.BottleRocketImage({
        architecture: InstanceArchitecture.ARM_64,
        variant: ecs.BottlerocketEcsVariant.AWS_ECS_2,
      }),
      allowAllOutbound: true,
      maxCapacity: 3,
      minCapacity: 1,
      spotPrice: '0.007', // $0.0032 per Hour when writing, $0.0084 per Hour on-demand
      healthCheck: HealthCheck.ec2(),
    });

    autoScalingGroup.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
      cooldown: Duration.minutes(1),
      estimatedInstanceWarmup: Duration.minutes(1),
    });

    const asgCapacityProviderName = new cdk.CfnOutput(this, 'AsgCapacityProviderName', {
      value: '',
    });
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      capacityProviderName: 'prefix-' + cdk.Names.nodeUniqueId(asgCapacityProviderName.node),
      autoScalingGroup,
      machineImageType: ecs.MachineImageType.BOTTLEROCKET,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:ap-northeast-1:248837585826:certificate/f6a51c7c-6e84-4b03-8f17-9dcce8b2d19a',
    );

    const asset = new DockerImageAsset(this, 'StressWebhookImageAsset', {
      directory: 'webhook',
    });
    const loadBalancedEcsService = new ApplicationLoadBalancedEc2Service(this, 'Service', {
      taskImageOptions: {
        image: ecs.ContainerImage.fromDockerImageAsset(asset),
        containerPort: 9000,
      },
      cluster,
      memoryLimitMiB: 512,
      protocol: ApplicationProtocol.HTTPS,
      redirectHTTP: true,
      certificate,
    });
    loadBalancedEcsService.taskDefinition.addContainer('WhoamiContainer', {
      image: ecs.ContainerImage.fromRegistry('traefik/whoami'),
      memoryLimitMiB: 512,
    });

    autoScalingGroup.connections.allowFrom(loadBalancedEcsService.loadBalancer, Port.allTcp());
    loadBalancedEcsService.loadBalancer.connections.allowFrom(autoScalingGroup, Port.allTcp());
  }
}
