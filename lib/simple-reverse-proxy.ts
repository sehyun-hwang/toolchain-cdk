/* eslint-disable max-classes-per-file */
import { ContainerImage, Ec2Service } from 'aws-cdk-lib/aws-ecs';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';

export default class SimpleReverseProxyNestedStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NestedServiceStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase } = props;
    const { taskDefinition, logDriver } = this;
    taskDefinition.addContainer('simple-reverse-proxy', {
      memoryLimitMiB: 32,
      logging: logDriver,
      image: ContainerImage.fromRegistry('schmailzl/simple-reverse-proxy'),
      portMappings: [{
        containerPort: 80,
        hostPort: 80,
      }],
      environment: {
        PROXY_URL: 'http://' + loadBalancerServiceBase.loadBalancer.loadBalancerDnsName,
        ADDITIONAL_CONFIG: `proxy_ssl_server_name on;
 proxy_pass_request_headers on;
 proxy_http_version 1.1;
 proxy_set_header Upgrade $http_upgrade;
 proxy_set_header Connection "upgrade";`,
      },
    });

    const { cluster } = loadBalancerServiceBase;
    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
    });
  }
}
