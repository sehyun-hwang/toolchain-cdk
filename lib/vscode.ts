import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';

interface VsCodeEc2StackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export default class VsCodeEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: VsCodeEc2StackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const instanceProps: ec2.InstanceProps = {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.lookup({
        owners: [(427812963091).toString()],
        name: 'nixos/24.05.6632.*',
        filters: {
          architecture: ['arm64'],
        },
      }),
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(32),
      }],
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', `aws-${this.account}-${this.region}`),
      availabilityZone: this.region + 'a',
    };

    const instance = new ec2.Instance(this, 'Instance', instanceProps);
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(22), 'SSH');
    instance.connections.allowInternally(ec2.Port.tcp(2049), 'EFS');
    instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
  }
}
