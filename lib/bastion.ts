import assert from 'assert/strict';

import type { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Port } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import {
  ContainerImage, CpuArchitecture, FargateService, FargateTaskDefinition, type ScratchSpace,
  type Volume,
} from 'aws-cdk-lib/aws-ecs';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import {
  ApplicationListener,
  ApplicationListenerRule,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
  type QueryStringCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

interface BastionStackProps extends cdk.StackProps {
  vpc: IVpc;
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;
  nginxEnvironment: {
    API_GATEWAY_AUTH_URL: string;
    ALLOWED_ORIGIN: string;
  };
  securityGroup: SecurityGroup;
}

export default class BastionStack extends cdk.Stack {
  vpc: IVpc;

  constructor(scope: Construct, id: string, props: BastionStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase, vpc } = props;
    this.vpc = vpc;

    const taskDefinition = new FargateTaskDefinition(this, 'FargateTaskDefinition', {
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });
    const arnComponents: cdk.ArnComponents = {
      service: 'ec2',
      resource: 'instance',
      resourceName: '*',
    };
    taskDefinition.addToTaskRolePolicy(new PolicyStatement({
      actions: [
        'ec2:DescribeInstances',
        'ec2:DescribeImages',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'ec2:Region': [this.region, 'us-west-2'],
        },
      },
    }));
    taskDefinition.addToTaskRolePolicy(new PolicyStatement({
      actions: ['ec2-instance-connect:SendSSHPublicKey'],
      resources: [
        cdk.Arn.format(arnComponents, this),
        cdk.Arn.format({
          ...arnComponents,
          region: 'us-west-2',
        }, this),
      ],
    }));

    // @ts-expect-error Protected method
    const logDriver = loadBalancerServiceBase.createAWSLogDriver(this.node.id);
    const scratchSpace: ScratchSpace = {
      containerPath: '/run/ttyd',
      readOnly: false,
      sourcePath: undefined as unknown as string,
      name: 'run-ttyd',
    };

    const nginxAsset = new DockerImageAsset(this, 'NginxImageAsset', {
      directory: 'bastion',
    });
    const nginxContainer = taskDefinition.addContainer('nginx', {
      memoryLimitMiB: 256,
      logging: logDriver,
      image: ContainerImage.fromDockerImageAsset(nginxAsset),
      portMappings: [{
        name: 'nginx',
        containerPort: 80,
      }],
      environment: props.nginxEnvironment,
    });
    nginxContainer.addScratch(scratchSpace);

    const ttydAsset = new DockerImageAsset(this, 'ttydImageAsset', {
      directory: 'bastion/ttyd',
    });
    taskDefinition.addContainer('ttyd', {
      image: ContainerImage.fromDockerImageAsset(ttydAsset),
      memoryLimitMiB: 256,
      logging: logDriver,
    })
      .addScratch(scratchSpace);
    // @ts-expect-error Private property
    (taskDefinition.volumes as Volume[]).pop();

    // Service
    const { cluster } = loadBalancerServiceBase;
    const service = new FargateService(this, 'Service', {
      securityGroups: [props.securityGroup],
      cluster,
      taskDefinition,
      assignPublicIp: true,
      cloudMapOptions: {
        dnsRecordType: DnsRecordType.A,
      },
      desiredCount: 1,
      serviceConnectConfiguration: {
        services: [{
          portMappingName: 'nginx',
          dnsName: 'bastion',
          port: 80,
        }],
      },
    });

    // @TODO Refactor from here
    const securityGroup = loadBalancerServiceBase.loadBalancer.connections
      .securityGroups.at(0);
    assert(securityGroup);

    const listener = ApplicationListener.fromApplicationListenerAttributes(this, 'ApplicationListner', {
      listenerArn: loadBalancerServiceBase.listener.listenerArn,
      securityGroup,
    });
    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      targets: [service],
      vpc: cluster.vpc,
      protocol: ApplicationProtocol.HTTP,
      // port: 80,
    });
    service.connections.allowFrom(loadBalancerServiceBase.loadBalancer, Port.tcp(80));
    // to here

    listener.addTargetGroups('ListenerRule-Options', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/spawn', '/ttyd/*']),
        ListenerCondition.httpRequestMethods(['OPTIONS']),
      ],
      priority: 22,
    });

    listener.addTargetGroups('ListenerRule-Spawn', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/spawn']),
        ListenerCondition.httpHeader('Authorization', ['*']),
        ListenerCondition.httpRequestMethods(['POST']),
      ],
      priority: 31,
    });

    {
      const statusCode = 401;
      new ApplicationListenerRule(this, 'ListenerRule-UnauthorizedSpawn', {
        listener,
        action: ListenerAction.fixedResponse(statusCode, {
          contentType: 'application/json',
          messageBody: JSON.stringify({ statusCode }),
        }),
        conditions: [
          ListenerCondition.pathPatterns(['/spawn']),
          ListenerCondition.httpRequestMethods(['GET']),
        ],
        priority: 41,
      });
    }

    {
      const queryStringConditions: QueryStringCondition[] = [{
        key: 'token',
        // value: '?'.repeat(32),
        value: '*',
      },
      {
        key: 'user_id',
        // value: '????????-????-????-????-????????????',
        value: '*-*-*-*',
      }];
      listener.addTargetGroups('ListenerRule-ttyd', {
        targetGroups: [targetGroup],
        conditions: [
          ListenerCondition.pathPatterns(['/ttyd/*']),
          ListenerCondition.queryStrings(queryStringConditions),
        ],
        priority: 51,
      });

      const statusCode = 400;
      new ApplicationListenerRule(this, 'ListenerRule-ttydBadRequest', {
        listener,
        action: ListenerAction.fixedResponse(statusCode, {
          contentType: 'application/json',
          messageBody: JSON.stringify({
            statusCode,
            queryStringConditions,
          }),
        }),
        conditions: [ListenerCondition.pathPatterns(['/spawn'])],
        priority: 61,
      });
    }
  }
}
