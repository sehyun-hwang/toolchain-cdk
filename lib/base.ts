import {
  type AsgCapacityProvider, AwsLogDriver, type Ec2Service, Ec2TaskDefinition,
  type FargateService, type FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import * as cdk from 'aws-cdk-lib/core';

export interface NestedServiceStackProps extends cdk.NestedStackProps {
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;
  capacityProvider: AsgCapacityProvider;
  TaskDefinitionClass?: typeof FargateTaskDefinition | typeof Ec2TaskDefinition;
}

export default abstract class NestedServiceStack extends cdk.NestedStack {
  logDriver: AwsLogDriver;

  taskDefinition: Ec2TaskDefinition;

  abstract service: Ec2Service | FargateService;

  constructor(scope: cdk.Stack, id: string, {
    TaskDefinitionClass = Ec2TaskDefinition,
    ...props
  }: NestedServiceStackProps) {
    super(scope, id, props);
    this.logDriver = new AwsLogDriver({ streamPrefix: this.node.id });
    this.taskDefinition = new TaskDefinitionClass(this, 'TaskDefinition');
  }
}
