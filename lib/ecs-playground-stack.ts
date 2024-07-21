/* eslint-disable no-new */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { AutoScalingGroup, GroupMetrics } from 'aws-cdk-lib/aws-autoscaling';
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
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';

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
      groupMetrics: [GroupMetrics.all()],
    });

    const capacityProviderName = 'prefix-' + cdk.Names.nodeUniqueId(new cdk.CfnOutput(this, 'AsgCapacityProviderName', {
      value: '',
    }).node);
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      capacityProviderName,
      autoScalingGroup,
      machineImageType: ecs.MachineImageType.BOTTLEROCKET,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });
    cluster.addAsgCapacityProvider(capacityProvider, {
      spotInstanceDraining: true,
    });

    const asset = new DockerImageAsset(this, 'StressWebhookImageAsset', {
      directory: 'webhook',
    });

    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:ap-northeast-1:248837585826:certificate/f6a51c7c-6e84-4b03-8f17-9dcce8b2d19a',
    );

    const loadBalancedEcsService = new ApplicationLoadBalancedEc2Service(this, 'Service', {
      // Task
      taskImageOptions: {
        image: ecs.ContainerImage.fromDockerImageAsset(asset),
        containerName: 'stress-webhook',
        containerPort: 9000,
      },
      cluster,
      memoryLimitMiB: 256,

      // Internet-facing
      protocol: ApplicationProtocol.HTTPS,
      redirectHTTP: true,
      certificate,
      domainName: 'elb.hwangsehyun.com',
      domainZone: PublicHostedZone.fromPublicHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: 'Z08913012TPEI07HRGWDQ',
        zoneName: 'hwangsehyun.com',
      }),

      // Scaling
      circuitBreaker: {
        rollback: true,
      },
      capacityProviderStrategies: [{
        capacityProvider: capacityProvider.capacityProviderName,
        weight: 1,
      }],
      enableECSManagedTags: true,
    });

    // Task
    loadBalancedEcsService.taskDefinition.addContainer('whoami', {
      image: ecs.ContainerImage.fromRegistry('traefik/whoami'),
      memoryLimitMiB: 256,
      // @ts-expect-error protected
      logging: loadBalancedEcsService.createAWSLogDriver(loadBalancedEcsService.node.id),
    });

    // Scalling
    loadBalancedEcsService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 20,
    }).scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 40,
    });
    loadBalancedEcsService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '0');

    // Security
    autoScalingGroup.connections.allowFrom(loadBalancedEcsService.loadBalancer, Port.allTcp());
    loadBalancedEcsService.loadBalancer.connections.allowFrom(autoScalingGroup, Port.allTcp());
  }
}
