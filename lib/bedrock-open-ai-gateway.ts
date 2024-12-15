import * as cdk from 'aws-cdk-lib';
import {
  ApplicationListener,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  ContainerImage, Ec2Service, Ec2TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';
import type { IVpc } from 'aws-cdk-lib/aws-ec2';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';

interface BedrockOpenAiGatewayStackProps extends cdk.StackProps {
  vpc: IVpc;
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;
}

export default class BedrockOpenAiGatewayStack extends cdk.Stack {
  vpc: IVpc;

  constructor(scope: Construct, id: string, props: BedrockOpenAiGatewayStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase, vpc } = props;
    this.vpc = vpc;

    const taskDefinition = new Ec2TaskDefinition(this, 'TaskDefinition');
    taskDefinition.addToTaskRolePolicy(new PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [cdk.Arn.format({
        service: 'bedrock',
        account: '',
        region: '*',
        resource: 'foundation-model',
        resourceName: '*',
      }, this), cdk.Arn.format({
        service: 'bedrock',
        region: 'us-west-2',
        resource: 'inference-profile',
        resourceName: '*',
      }, this)],
    }));

    const repository = Repository.fromRepositoryArn(this, 'Repository', Repository.arnForLocalRepository('bedrock-proxy-api-ecs', this, '366590864501'));
    // @ts-expect-error protected
    const logDriver = loadBalancerServiceBase.createAWSLogDriver(this.node.id);
    taskDefinition.addContainer('bedrock-proxy-fastapi', {
      memoryLimitMiB: 128,
      logging: logDriver,
      image: ContainerImage.fromEcrRepository(repository),
      portMappings: [{
        containerPort: 80,
      }],
      environment: {
        API_KEY: 'API_KEY',
        DEFAULT_MODEL: 'us.amazon.nova-lite-v1:0',
      },
    });

    // Service
    const { cluster } = loadBalancerServiceBase;
    const ec2Service = new Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
    });

    const { securityGroupId } = loadBalancerServiceBase.loadBalancer.connections
      .securityGroups.at(0) || {};
    if (!securityGroupId)
      throw new Error('loadBalancerServiceBase.loadBalancer has no security group');
    const listener = ApplicationListener.fromApplicationListenerAttributes(this, 'ApplicationListener', {
      listenerArn: loadBalancerServiceBase.listener.listenerArn,
      securityGroup: SecurityGroup.fromSecurityGroupId(this, 'LoadBalancerSecurityGroup', securityGroupId),
    });

    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      targets: [ec2Service],
      vpc: cluster.vpc,
      protocol: ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/health',
      },
      // port: 80,
    });

    listener.addTargetGroups('ListenerRule', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/api/v1/*']),
      ],
      priority: 100,
    });
  }
}
