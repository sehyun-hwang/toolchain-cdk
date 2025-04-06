import {
  type AsgCapacityProvider, AwsLogDriver, ContainerDependencyCondition, ContainerImage,
  Ec2Service, type ScratchSpace, Secret,
} from 'aws-cdk-lib/aws-ecs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';

interface K3sApiStackProps extends NestedServiceStackProps {
  capacityProvider: AsgCapacityProvider;
}

// WIP
export default class K3sApiStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: K3sApiStackProps) {
    super(scope, id, props);
    const { cluster } = props.loadBalancerServiceBase;

    const hostname = 'ecs-k3s';
    const tailscaleAuthKeyParameter = StringParameter.fromSecureStringParameterAttributes(this, 'TailscaleAuthKeyParameter', {
      parameterName: '/tailscale/auth-key/' + hostname,
    });
    const scratchSpace: ScratchSpace = {
      containerPath: '/usr/local/sbin',
      readOnly: false,
      sourcePath: undefined as unknown as string,
      name: 'executable-default',
    };
    const vpnAuthFile = scratchSpace.containerPath + '/vpn-auth-file';

    const { taskDefinition } = this;
    const init = taskDefinition.addContainer('init', {
      essential: false,
      memoryLimitMiB: 32,
      logging: new AwsLogDriver({ streamPrefix: this.node.id }),
      image: ContainerImage.fromRegistry('tailscale/tailscale'),
      command: [
        'sh',
        '-c',
        `echo "name=tailscale,joinKey=$TS_AUTHKEY" > ${vpnAuthFile}
 && cp -v /usr/local/bin/tailscale ${scratchSpace.containerPath}/
 && exec /usr/local/bin/tailscaled --tun userspace-networking`.replace('\n', ' '),
      ],
      secrets: {
        TS_AUTHKEY: Secret.fromSsmParameter(tailscaleAuthKeyParameter),
      },
    });
    init.addScratch(scratchSpace);

    const k3sContainer = taskDefinition.addContainer('k3s', {
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: this.node.id }),
      image: ContainerImage.fromRegistry('rancher/k3s:v1.30.10-k3s1'),
      command: ['server', '--disable-agent', '--vpn-auth-file', vpnAuthFile],
      healthCheck: {
        command: ['kubectl', 'get', '--raw=/readyz'],
      },
      environment: {},
    });
    k3sContainer.addScratch(scratchSpace);
    k3sContainer.addContainerDependencies({
      container: init,
      condition: ContainerDependencyCondition.COMPLETE,
    });

    // @ts-expect-error Private property
    (taskDefinition.volumes as Volume[]).pop();

    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 0,
      capacityProviderStrategies: [{
        capacityProvider: props.capacityProvider.capacityProviderName,
        weight: 1,
      }],
    });
  }
}
