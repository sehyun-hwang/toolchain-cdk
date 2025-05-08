/* eslint-disable max-classes-per-file */
import type { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Port } from 'aws-cdk-lib/aws-ec2';
import {
  ContainerDependencyCondition,
  ContainerImage, Ec2Service, NetworkMode, type ScratchSpace,
} from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';

export const NATS_SERVER_CONFIG = `http_port: 8222
http_base_path: /nats

server_tags: [
  cloud:aws
  $SERVER_TAG
]

jetstream: {
  enable: %s
  unique_tag: az
}

cluster {
  name: default
  host: %s
  port: 6222
  routes: [
    %s
  ]
}

accounts {
  SYS {
    users: [{
      user: sys
      pass: sys
    }]
  }
  kine {
    jetstream {}
    users: [{
      user: kine
      pass: kine
    }]
  }
}

system_account: SYS
no_auth_user: sys`;

interface NatsSeedStackProps extends NestedServiceStackProps {
  autoScalingGroup: AutoScalingGroup;
}

export default class NatsSeedStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NatsSeedStackProps) {
    super(scope, id, {
      ...props,
      networkMode: NetworkMode.HOST,
    });
    const { autoScalingGroup, loadBalancerServiceBase } = props;
    autoScalingGroup.connections.allowInternally(Port.tcp(6222));

    const scratchSpace: ScratchSpace = {
      containerPath: '/tmp/nats',
      readOnly: false,
      sourcePath: undefined as unknown as string,
      name: 'tmp-nats',
    };
    const natsServerConfPath = scratchSpace.containerPath + '/nats-server.conf';

    const { taskDefinition, logDriver } = this;
    taskDefinition.addToTaskRolePolicy(new PolicyStatement({
      actions: ['ec2:DescribeInstances'],
      resources: ['*'],
    }));

    const awsCliContainer = taskDefinition.addContainer('aws-cli', {
      essential: false,
      memoryLimitMiB: 128,
      logging: logDriver,
      image: ContainerImage.fromRegistry('amazon/aws-cli'),
      environment: {
        NATS_SERVER_CONFIG,
      },
      entryPoint: ['sh', '-c'],
      command: [`set -eux
TOKEN=$(curl -fX PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
HOST_IP=$(curl -f http://169.254.169.254/latest/meta-data/local-ipv4 -H "X-aws-ec2-metadata-token: $TOKEN")

CLUSTER_ROUTES=$(aws ec2 describe-instances \
  --filters Name=tag:aws:autoscaling:groupName,Values=${autoScalingGroup.autoScalingGroupName} \
  --query 'Reservations[*].Instances[*].PrivateIpAddress' \
  --output text \
  |  awk '{ print "nats://"$0":6222" }')

printf "$NATS_SERVER_CONFIG" false "$HOST_IP" "$CLUSTER_ROUTES" \
  | tee ${natsServerConfPath}`,
      ],
    });

    const natsContainer = taskDefinition.addContainer('nats', {
      memoryLimitMiB: 32,
      logging: logDriver,
      image: ContainerImage.fromRegistry('nats'),
      environment: {
        SERVER_TAG: 'az:null',
      },
      command: ['-c', natsServerConfPath],
    });

    awsCliContainer.addScratch(scratchSpace);
    natsContainer.addScratch(scratchSpace);
    natsContainer.addContainerDependencies({
      container: awsCliContainer,
      condition: ContainerDependencyCondition.COMPLETE,
    });

    const { cluster } = loadBalancerServiceBase;
    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      daemon: true,
    });
  }
}
