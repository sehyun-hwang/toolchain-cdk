/* eslint-disable max-classes-per-file */

import {
  AutoScalingGroup, BlockDeviceVolume, EbsDeviceVolumeType, GroupMetrics,
  Monitoring,
} from 'aws-cdk-lib/aws-autoscaling';
import {
  AllowedMethods, CachePolicy, Distribution,
  OriginProtocolPolicy, OriginRequestPolicy, ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, VpcOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import {
  InstanceArchitecture, InstanceClass, InstanceSize, InstanceType,
  type IPrefixList, type IVpc,
  Peer, Port, PrefixList, SecurityGroup, Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

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

class ApplicationLoadBalancedService extends ApplicationLoadBalancedServiceBase {
  securityGroups: SecurityGroup[] = [];

  pushSecurityGroup() {
    const { vpc } = this.cluster;
    const securityGroup = new SecurityGroup(this, `SecurityGroup-${this.securityGroups.length}`, {
      vpc,
      disableInlineRules: true,
      allowAllIpv6Outbound: true,
    });
    this.securityGroups.push(securityGroup);
    return securityGroup;
  }
}

/**
 * @link https://dev.to/aws-builders/autoscaling-using-spot-instances-with-aws-cdk-ts-4hgh
 */
export default class HelloEcsStack extends cdk.Stack {
  vpc: IVpc;

  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;

  distributionDomainNameImport: string;

  capacityProvider: ecs.AsgCapacityProvider;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Networking
    const vpc = Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });
    this.vpc = vpc;

    // EC2
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
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs(2, {
          volumeType: EbsDeviceVolumeType.GP3,
        }),
      }, {
        deviceName: '/dev/xvdb',
        volume: BlockDeviceVolume.ebs(4, {
          volumeType: EbsDeviceVolumeType.GP3,
        }),
      }],
    });
    autoScalingGroup.addUserData(`[settings.bootstrap-containers.bear]
source = "public.ecr.aws/bottlerocket/bottlerocket-bootstrap:v0.1.0"
mode = "once"
user-data = ""`);
    const capacityProviderName = 'prefix-' + cdk.Names.nodeUniqueId(new cdk.CfnOutput(this, 'AsgCapacityProviderName', {
      value: '',
    }).node);
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      capacityProviderName,
      autoScalingGroup,
      machineImageType: ecs.MachineImageType.BOTTLEROCKET,
      spotInstanceDraining: true,
    });
    this.capacityProvider = capacityProvider;

    const loadBalancedService = new ApplicationLoadBalancedService(this, 'Service', {
      vpc,

      // Internet-facing
      publicLoadBalancer: false,
      // protocol: ApplicationProtocol.HTTPS,
      // redirectHTTP: true,
      // certificate,
      // domainName: 'elb.hwangsehyun.com',
      // domainZone: PublicHostedZone.fromPublicHostedZoneAttributes(this, 'HostedZone', {
      //   hostedZoneId: 'Z08913012TPEI07HRGWDQ',
      //   zoneName: 'hwangsehyun.com',
      // }),

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

    const cluster = loadBalancedService.cluster as unknown as ecs.Cluster;
    cluster.addAsgCapacityProvider(capacityProvider);
    cluster.addDefaultCapacityProviderStrategy([{
      capacityProvider: capacityProvider.capacityProviderName,
    }]);
    cluster.enableFargateCapacityProviders();
    const { Ref } = this.resolve(cluster.clusterName);
    cluster.addDefaultCloudMapNamespace({
      name: Ref,
    });

    new Alarm(this, 'MemoryReservationAlarm', {
      metric: cluster.metricMemoryReservation({
        period: cdk.Duration.minutes(1),
        statistic: 'max',
      }),
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 50,
      evaluationPeriods: 2,
    });

    const asset = new DockerImageAsset(this, 'StressWebhookImageAsset', {
      directory: 'webhook',
    });

    // const certificate = Certificate.fromCertificateArn(
    //   this,
    //   'Certificate',
    //   'arn:aws:acm:ap-northeast-1:248837585826:certificate/f6a51c7c-6e84-4b03-8f17-9dcce8b2d19a',
    // );

    (loadBalancedService.listener.node.defaultChild as cdk.CfnElement)
      .overrideLogicalId('ServiceLBPublicListener46709EAA7B4E02A1Temp');

    // Task
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Ec2TaskDefinition');
    // @ts-expect-error Protected method
    const logDriver = loadBalancedService.createAWSLogDriver(this.node.id);
    taskDefinition.addContainer('stress-webhook', {
      memoryLimitMiB: 100,
      logging: logDriver,
      image: ecs.ContainerImage.fromDockerImageAsset(asset),
      portMappings: [{
        containerPort: 9000,
      }],
    });
    taskDefinition.addContainer('whoami', {
      image: ecs.ContainerImage.fromRegistry('traefik/whoami'),
      memoryLimitMiB: 100,
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
      maxCapacity: 3,
    }).scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 40,
    });
    loadBalancedService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '0');

    // Security
    const { listener } = loadBalancedService;
    const { prefixList: { prefixListId } } = new AwsManagedPrefixList(this, 'CloudFrontPrefixList', {
      name: 'com.amazonaws.global.cloudfront.origin-facing',
    });
    autoScalingGroup.connections.allowFrom(loadBalancedService.loadBalancer, Port.allTcp());
    loadBalancedService.loadBalancer.connections.allowFrom(autoScalingGroup, Port.allTcp());
    loadBalancedService.loadBalancer.connections.allowTo(Peer.anyIpv4(), Port.tcp(6080)); // Temp
    loadBalancedService.loadBalancer.connections.allowFrom(Peer.anyIpv4(), Port.tcp(6443)); // Temp
    loadBalancedService.loadBalancer.connections
      .allowTo(Peer.prefixList(prefixListId), Port.tcp(listener.port));

    const distribution = new Distribution(this, 'Distribution-2', {
      defaultBehavior: {
        origin: VpcOrigin.withApplicationLoadBalancer(this.loadBalancerServiceBase.loadBalancer, {
          protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
        cachePolicy: CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        '/ttyd/ws': {
          origin: new HttpOrigin('ttyd.3091977.xyz', {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          cachePolicy: CachePolicy.CACHING_DISABLED,
        },
      },
    });
    this.distributionDomainNameImport = this.exportValue(distribution.distributionDomainName);
  }
}
