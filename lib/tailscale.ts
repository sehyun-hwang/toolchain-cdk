import { Ec2Service } from 'aws-cdk-lib/aws-ecs';
import type * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';

export default class TailscaleStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NestedServiceStackProps) {
    super(scope, id, props);
    this.addTailscaleContainer('ecs-standalone');

    const { cluster, taskDefinition } = this;
    this.service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      capacityProviderStrategies: [{
        capacityProvider: props.capacityProvider.capacityProviderName,
        weight: 1,
      }],
    });
  }
}
