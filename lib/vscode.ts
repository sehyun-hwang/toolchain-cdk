import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

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
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', `aws-${this.account}-${this.region}`),
      availabilityZone: this.region + 'a',
    };

    const instance = new ec2.Instance(this, 'Instance', instanceProps);
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(22), 'SSH');
  }
}