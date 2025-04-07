import assert from 'node:assert/strict';

import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  type AsgCapacityProvider,
  ContainerImage, type Ec2Service, EcrImage,
  NetworkMode,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedEc2Service } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import * as cdk from 'aws-cdk-lib/core';

import type { NestedServiceStackProps } from './base';
import NestedServiceStack from './base';

interface KineStackProps extends NestedServiceStackProps {
  capacityProvider: AsgCapacityProvider;
  securityGroup: SecurityGroup,
  pgBouncerEnv: {
    DB_HOST: string;
    DB_USER: string;
    DB_NAME: string;
    DB_CA_BUNDLE: string;
  };
}

export default class KineStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: KineStackProps) {
    super(scope, id, {
      ...props,
      networkMode: NetworkMode.AWS_VPC,
    });
    const {
      loadBalancerServiceBase: { cluster },
      pgBouncerEnv,
      securityGroup,
    } = props;

    const repository = Repository.fromRepositoryArn(this, 'Repository', 'arn:aws:ecr:ap-northeast-1:248837585826:repository/c8d557/iam-pgbouncer');
    const database = DatabaseInstance.fromDatabaseInstanceAttributes(this, 'Database', {
      instanceEndpointAddress: pgBouncerEnv.DB_HOST,
      port: 5432,
      instanceResourceId: 'db-R4XUY7T35NHLEA3FNCS6AZGJYQ',
      instanceIdentifier: 'default-postgres',
      securityGroups: [],
    });

    const { taskDefinition } = this;
    const { principalStatements: [principalStatement] } = database.grantConnect(taskDefinition.taskRole, 'k3s');
    assert(principalStatement);
    assert(principalStatement.resources[0]);
    principalStatement.addResources(
      cdk.Arn.format({
        ...cdk.Arn.split(principalStatement.resources[0], cdk.ArnFormat.COLON_RESOURCE_NAME),
        region: 'us-west-2',
      }),
    );

    // enableRestartPolicy: true,
    // restartAttemptPeriod: cdk.Duration.hours(1),
    taskDefinition.addContainer('nginx', {
      memoryLimitMiB: 32,
      logging: this.logDriver,
      image: ContainerImage.fromAsset('kine-nginx'),
      portMappings: [
        { containerPort: 80 },
      ],
    });

    const kineContainer = taskDefinition.addContainer('kine', {
      memoryLimitMiB: 50,
      logging: this.logDriver,
      image: ContainerImage.fromRegistry('rancher/kine'),
      command: [
        '--datastore-max-idle-connections', '10',
        '--datastore-max-open-connections', '20',
        '--endpoint', `postgres://${pgBouncerEnv.DB_USER}@localhost:6432/${pgBouncerEnv.DB_NAME}`,
      ],
    });

    const pgBouncerContainer = taskDefinition.addContainer('pgbouncer', {
      memoryLimitMiB: 50,
      image: EcrImage.fromEcrRepository(repository, 'arm64'),
      logging: this.logDriver,
      environment: {
        ...pgBouncerEnv,
      },
      healthCheck: {
        command: [
          'pg_isready',
          '-h', 'localhost',
          '-p', '6432',
          '-d', pgBouncerEnv.DB_NAME,
          '-U', pgBouncerEnv.DB_USER,
        ],
        interval: cdk.Duration.seconds(5),
      },
    });
    kineContainer.addContainerDependencies({
      container: pgBouncerContainer,
    });

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
      desiredCount: 1,
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
