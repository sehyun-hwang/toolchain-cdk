import assert from 'assert/strict';

import type { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AvailabilityZoneRebalancing, ContainerImage, Ec2Service } from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListener, ApplicationProtocol, ApplicationTargetGroup, ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';
import { NATS_SERVER_CONFIG } from './nats-seed';

interface NatsJetStreamStackProps extends NestedServiceStackProps {
  autoScalingGroup: AutoScalingGroup;
}

export default class NatsJetStreamStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NatsJetStreamStackProps) {
    super(scope, id, props);
    const { autoScalingGroup, loadBalancerServiceBase } = props;

    const natsServerConfPath = '/tmp/nats-server.conf';
    const { taskDefinition, logDriver } = this;
    taskDefinition.addContainer('nats', {
      memoryLimitMiB: 32,
      logging: logDriver,
      image: ContainerImage.fromRegistry('nats:alpine'),
      portMappings: [{
        containerPort: 8222,
      }, {
        containerPort: 6222,
      }],
      environment: {
        NATS_SERVER_CONFIG,
      },
      entryPoint: ['sh', '-c'],
      command: [`set -eux
sleep 3

NATS_VARZ_URL=$(ip route | awk '/^default/ { print $3":8222/nats/varz" }')
HOST_IP=$(wget -O- $NATS_VARZ_URL \
  | tee /dev/stderr \
  | sed -n 's/.*"addr"[[:space:]]*:[[:space:]]*"\\([0-9.]\\+\\)",/\\1/p')
HOST_CLUSTER_PORT=$(wget -O- $ECS_CONTAINER_METADATA_URI_V4/task \
  | tee /dev/stderr \
  | sed -n 's/.*{"ContainerPort":6222,"Protocol":"tcp","HostPort":\\([0-9]\\+\\),"HostIp":"0.0.0.0"}.*/\\1/p')
HOST_CLIENT_PORT=$(wget -O- $ECS_CONTAINER_METADATA_URI_V4/task \
  | tee /dev/stderr \
  | sed -n 's/.*{"ContainerPort":6222,"Protocol":"tcp","HostPort":\\([0-9]\\+\\),"HostIp":"0.0.0.0"}.*/\\1/p')

printf "$NATS_SERVER_CONFIG" 0.0.0.0 "nats://$HOST_IP:6222" | tee ${natsServerConfPath}
exec nats-server -c ${natsServerConfPath} -js \
  -n jetstream-$HOSTNAME \
  --cluster_advertise $HOST_IP:$HOST_CLUSTER_PORT \
  --client_advertise $HOST_IP:$HOST_CLIENT_PORT`,
      ],
      healthCheck: {
        command: ['wget', '--spider', '-q', 'http://127.0.0.1:8222/nats/healthz'],
      },
    });

    const { cluster } = loadBalancerServiceBase;
    this.service = new Ec2Service(this, 'Service', {
      desiredCount: 5,
      cluster,
      taskDefinition,
      availabilityZoneRebalancing: AvailabilityZoneRebalancing.ENABLED,
      capacityProviderStrategies: [{
        capacityProvider: props.capacityProvider.capacityProviderName,
        weight: 1,
      }],
    });

    /**
     * @link https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html
     * @example `cat /proc/sys/net/ipv4/ip_local_port_range`
     */
    autoScalingGroup.connections.allowInternally(Port.tcpRange(32768, 60999));

    const { securityGroupId } = loadBalancerServiceBase.loadBalancer.connections
      .securityGroups.at(0) || {};
    assert(securityGroupId);
    const listener = ApplicationListener.fromApplicationListenerAttributes(this, 'ApplicationListener', {
      listenerArn: loadBalancerServiceBase.listener.listenerArn,
      securityGroup: SecurityGroup.fromSecurityGroupId(this, 'LoadBalancerSecurityGroup', securityGroupId),
    });

    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      targets: [this.service],
      vpc: cluster.vpc,
      protocol: ApplicationProtocol.HTTP,
      port: 8222,
      healthCheck: {
        path: '/nats/healthz',
      },
    });
    listener.addTargetGroups('ListenerRule', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/nats', '/nats/*']),
      ],
      priority: 200,
    });
  }
}
