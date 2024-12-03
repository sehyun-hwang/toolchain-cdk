/* eslint-disable max-classes-per-file */

import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { AutoScalingGroup, GroupMetrics, Monitoring } from 'aws-cdk-lib/aws-autoscaling';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  type IPrefixList,
  type IVpc,
  InstanceArchitecture,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  PrefixList,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';

export interface AwsManagedPrefixListProps {
  /**
   * Name of the aws managed prefix list.
   * See: https://docs.aws.amazon.com/vpc/latest/userguide/working-with-aws-managed-prefix-lists.html#available-aws-managed-prefix-lists
   * eg. com.amazonaws.global.cloudfront.origin-facing
   */
  readonly name: string;
}

export class AwsManagedPrefixList extends Construct {
  public readonly prefixList: IPrefixList;

  constructor(scope: Construct, id: string, { name }: AwsManagedPrefixListProps) {
    super(scope, id);

    const prefixListId = new AwsCustomResource(this, 'GetPrefixListId', {
      onUpdate: {
        service: '@aws-sdk/client-ec2',
        action: 'DescribeManagedPrefixListsCommand',
        parameters: {
          Filters: [
            {
              Name: 'prefix-list-name',
              Values: [name],
            },
          ],
        },
        physicalResourceId: PhysicalResourceId.of(`${id}-${this.node.addr.slice(0, 16)}`),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['ec2:DescribeManagedPrefixLists'],
          resources: ['*'],
        }),
      ]),
    }).getResponseField('PrefixLists.0.PrefixListId');

    this.prefixList = PrefixList.fromPrefixListId(this, 'PrefixList', prefixListId);
  }
}

class ApplicationLoadBalancedService extends ApplicationLoadBalancedServiceBase {}

/**
 * @link https://dev.to/aws-builders/autoscaling-using-spot-instances-with-aws-cdk-ts-4hgh
 */
export default class HelloEcsStack extends cdk.Stack {
  vpc: IVpc;

  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });
    this.vpc = vpc;

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
      instanceMonitoring: Monitoring.BASIC,
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
      enableFargateCapacityProviders: true,
      defaultCloudMapNamespace: {
        name: 'foo',
      },
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

    const loadBalancedService = new ApplicationLoadBalancedService(this, 'Service', {
      cluster,

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
    this.loadBalancerServiceBase = loadBalancedService;

    // Task
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Ec2TaskDefinition');
    // @ts-expect-error protected
    const logDriver = loadBalancedService.createAWSLogDriver(this.node.id);
    taskDefinition.addContainer('stress-webhook', {
      memoryLimitMiB: 256,
      logging: logDriver,
      image: ecs.ContainerImage.fromDockerImageAsset(asset),
      portMappings: [{
        containerPort: 9000,
      }],
    });
    taskDefinition.addContainer('whoami', {
      image: ecs.ContainerImage.fromRegistry('traefik/whoami'),
      memoryLimitMiB: 256,
      logging: logDriver,
    });

    // Service
    const ec2Service = new ecs.Ec2Service(this, 'Ec2Service', {
      cluster,
      taskDefinition,
    });
    loadBalancedService.targetGroup.addTarget(ec2Service);

    ec2Service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 20,
    }).scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 40,
    });
    loadBalancedService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '0');

    // Security
    const { prefixList: { prefixListId: ec2InstanceConnectPrefixId } } = new AwsManagedPrefixList(this, 'Ec2IntanceConnectPrefixList', {
      name: `com.amazonaws.${this.region}.ec2-instance-connect`,
    });
    autoScalingGroup.connections.allowFrom(
      Peer.prefixList(ec2InstanceConnectPrefixId),
      Port.tcp(22),
    );
    autoScalingGroup.connections.allowFrom(loadBalancedService.loadBalancer, Port.allTcp());
    loadBalancedService.loadBalancer.connections.allowFrom(autoScalingGroup, Port.allTcp());
  }
}
