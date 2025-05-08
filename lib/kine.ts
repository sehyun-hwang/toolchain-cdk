import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  type AsgCapacityProvider, AvailabilityZoneRebalancing,
  type CfnService,
  ContainerImage, type Ec2Service,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedEc2Service } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as cdk from 'aws-cdk-lib/core';

import type { NestedServiceStackProps } from './base';
import NestedServiceStack from './base';

interface KineStackProps extends NestedServiceStackProps {
  capacityProvider: AsgCapacityProvider;
  securityGroup: SecurityGroup,
}

export default class KineStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: KineStackProps) {
    super(scope, id, props);
    const {
      loadBalancerServiceBase: { cluster },
      securityGroup,
    } = props;

    const { taskDefinition } = this;
    const nginxContainer = taskDefinition.addContainer('nginx', {
      memoryLimitMiB: 32,
      logging: this.logDriver,
      image: ContainerImage.fromAsset('kine-nginx'),
      portMappings: [
        { containerPort: 80 },
      ],
      healthCheck: {
        command: ['grpcurl', '-plaintext', '127.0.0.1:80', 'grpc.health.v1.Health/Check'],
      },
    });
    const kineContainer = taskDefinition.addContainer('kine', {
      memoryLimitMiB: 64,
      logging: this.logDriver,
      image: ContainerImage.fromRegistry('rancher/kine'),
      entryPoint: ['sh', '-c'],
      command: [`set -eux
exec kine \
  --datastore-max-idle-connections 10 \
  --datastore-max-open-connections 20 \
  --endpoint "nats://kine:kine@$(ip route | awk '/^default/ {print $3}')?replicas=3&noEmbed=true"`,
      ],
      healthCheck: {
        command: ['wget', '--spider', '-q', 'http://127.0.0.1:8080/metrics'],
      },
    });
    nginxContainer.addLink(kineContainer);

    const { vpc } = cluster;
    const loadBalancer = ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'LoadBalancer', {
      vpc,
      loadBalancerArn: props.loadBalancerServiceBase.loadBalancer.loadBalancerArn,
      securityGroupId: securityGroup.securityGroupId,
      loadBalancerDnsName: props.loadBalancerServiceBase.loadBalancer.loadBalancerDnsName,
    });

    /** @link https://gist.github.com/riandyrn/049eaab390f604eae4bf2dfcc50fbab7 */
    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:ap-northeast-1:248837585826:certificate/81f4f190-c977-48e3-819b-930a0c30405b',
    );
    const { service, targetGroup } = new ApplicationLoadBalancedEc2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      capacityProviderStrategies: [{
        capacityProvider: props.capacityProvider.capacityProviderName,
        weight: 1,
      }],
      loadBalancer,
      listenerPort: 2379,
      protocol: ApplicationProtocol.HTTPS,
      protocolVersion: ApplicationProtocolVersion.HTTP2,
      certificate,
    });
    this.service = service;
    (service.node.defaultChild as CfnService).addPropertyOverride('AvailabilityZoneRebalancing', AvailabilityZoneRebalancing.ENABLED);
    targetGroup.configureHealthCheck({
      path: '/metrics',
    });

    const ipv6SecurityGroup = new SecurityGroup(this, 'Ipv6SecurityGroup', {
      vpc,
      allowAllIpv6Outbound: true,
    });
    service.connections.addSecurityGroup(ipv6SecurityGroup);
    service.connections.allowFrom(Peer.anyIpv4(), Port.tcp(8080));
  }
}
