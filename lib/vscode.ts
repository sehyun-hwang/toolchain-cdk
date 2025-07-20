import { EventbridgeToStepfunctions } from '@aws-solutions-constructs/aws-eventbridge-stepfunctions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {
  ArnPrincipal, ManagedPolicy, PolicyStatement, Role, StarPrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { DefinitionBody, Pass } from 'aws-cdk-lib/aws-stepfunctions';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

interface VsCodeEc2StackProps extends cdk.StackProps {
  vpc?: ec2.IVpc;
  efsSecurityGroupId: string;
}

export default class VsCodeEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: VsCodeEc2StackProps) {
    super(scope, id, props);

    const vpc = props.vpc || ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: 'vpc-0ae899f9b16f02f06',
    });

    const bucket = new Bucket(this, 'NixCacheBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.exportValue(bucket.bucketDomainName);
    const result = bucket.addToResourcePolicy(
      new PolicyStatement({
        actions: [
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:GetObject',
          's3:ListBucket',
          's3:ListBucketMultipartUploads',
          's3:ListMultipartUploadParts',
          's3:PutObject',
        ],
        resources: [
          bucket.bucketArn,
          bucket.arnForObjects('*'),
        ],
        principals: [new StarPrincipal()],
        conditions: {
          StringEquals: {
            'aws:SourceVpc': vpc.vpcId,
          },
        },
      }),
    );
    if (!result.statementAdded)
      throw new Error();

    const isUsRegionCondition = new cdk.CfnCondition(this, 'IsUsRegion', {
      expression: cdk.Fn.conditionEquals(cdk.Fn.select(0, cdk.Fn.split('-', this.region, 1)), 'us'),
    });
    const instanceProps: ec2.InstanceProps = {
      vpc,
      instanceType: new ec2.InstanceType(
        cdk.Fn.conditionIf(
          isUsRegionCondition.logicalId,
          ec2.InstanceType.of(
            ec2.InstanceClass.COMPUTE8_GRAVITON4,
            ec2.InstanceSize.MEDIUM,
          ).toString(),
          ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL).toString(),
        ) as unknown as string,
      ),
      machineImage: ec2.MachineImage.lookup({
        owners: [(427812963091).toString()],
        name: 'nixos/24.11.711815.*',
        filters: {
          architecture: ['arm64'],
        },
      }),
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(32),
      }],
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', `aws-${this.account}-${this.region}`),
      allowAllIpv6Outbound: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        availabilityZones: [this.region + 'a'],
      },
    };
    const instance = new ec2.Instance(this, 'Instance', instanceProps);
    const efsSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'EfsSecurityGroup', props.efsSecurityGroupId, {
      mutable: false,
    });
    instance.addSecurityGroup(efsSecurityGroup);
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(22), 'SSH IP v4');
    instance.connections.allowFrom(ec2.Peer.anyIpv6(), ec2.Port.tcp(22), 'SSH IP v6');

    instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    StringParameter.prototype.grantRead.call({
      parameterArn: 'arn:aws:ssm:ap-northeast-1:248837585826:parameter/nix/cache/private-key',
    }, instance);
    const adminRole = new Role(this, 'AdministratorAccessRole', {
      assumedBy: new ArnPrincipal(instance.role.roleArn),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });
    adminRole.grantPassRole(instance.role);

    const _eventbridgeToStepfunctions = new EventbridgeToStepfunctions(this, 'EventbridgeToStepfunctions', {
      eventRuleProps: {
        eventPattern: {
          source: ['aws.ec2'],
          detailType: ['EC2 Instance State-change Notification'],
          detail: {
            'instance-id': [instance.instanceId],
          },
        },
      },
      stateMachineProps: {
        definitionBody: DefinitionBody.fromChainable(new Pass(this, 'Pass')),
      },
    });
  }
}
