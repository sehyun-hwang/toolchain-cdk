import {
  ContainerImage, Ec2Service, Ec2TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

interface SimpleReverseProxyStackProps extends cdk.StackProps {
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;
}

export default class SimpleReverseProxyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SimpleReverseProxyStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase } = props;

    const taskDefinition = new Ec2TaskDefinition(this, 'TaskDefinition');

    // @ts-expect-error Protected method
    const logDriver = loadBalancerServiceBase.createAWSLogDriver(this.node.id);
    taskDefinition.addContainer('simple-reverse-proxy', {
      memoryLimitMiB: 128,
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

    // Service
    const { cluster } = loadBalancerServiceBase;
    new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
    });
  }
}
