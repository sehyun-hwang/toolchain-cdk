import * as cdk from 'aws-cdk-lib';
import {
  ApplicationListener,
  ApplicationListenerRule,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
  type QueryStringCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  ContainerImage, CpuArchitecture, FargateService, FargateTaskDefinition, ScratchSpace, type Volume,
} from 'aws-cdk-lib/aws-ecs';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import type { IVpc } from 'aws-cdk-lib/aws-ec2';

interface BastionStackProps extends cdk.StackProps {
  vpc: IVpc;
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase;
  nginxEnvironment: {
    API_GATEWAY_AUTH_URL: string;
    ALLOWED_ORIGIN: string;
  };
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
    const policy = new Policy(this, 'EC2SshPolicy', {
      statements: [
        new PolicyStatement({
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
        }),
        new PolicyStatement({
          actions: ['ec2-instance-connect:SendSSHPublicKey'],
          resources: [
            cdk.Arn.format(arnComponents, this),
            cdk.Arn.format({
              ...arnComponents,
              region: 'us-west-2',
            }, this),
          ],
        }),
      ],
    });
    taskDefinition.taskRole.attachInlinePolicy(policy);

    // @ts-expect-error protected
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
    taskDefinition.addContainer('nginx', {
      memoryLimitMiB: 256,
      logging: logDriver,
      image: ContainerImage.fromDockerImageAsset(nginxAsset),
      portMappings: [{
        containerPort: 80,
      }],
      environment: props.nginxEnvironment,
    })
      .addScratch(scratchSpace);

    const ttydAsset = new DockerImageAsset(this, 'ttydImageAsset', {
      directory: 'bastion/ttyd',
    });
    taskDefinition.addContainer('ttyd', {
      image: ContainerImage.fromDockerImageAsset(ttydAsset),
      memoryLimitMiB: 256,
      logging: logDriver,
    })
      .addScratch(scratchSpace);
    (taskDefinition.volumes as Volume[]).pop();

    // Service
    const { cluster } = loadBalancerServiceBase;
    const fargateService = new FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      assignPublicIp: true,
      cloudMapOptions: {
        // Create A records - useful for AWSVPC network mode.
        dnsRecordType: DnsRecordType.A,
      },
      desiredCount: 1,
    });

    const listener = ApplicationListener.fromApplicationListenerAttributes(this, 'ApplicationListner', {
      listenerArn: loadBalancerServiceBase.listener.listenerArn,
      securityGroup: SecurityGroup.fromSecurityGroupId(this, 'LoadBalancerSecurityGroup', loadBalancerServiceBase.loadBalancer.connections.securityGroups[0].securityGroupId),
    });

    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      targets: [fargateService],
      vpc: cluster.vpc,
      protocol: ApplicationProtocol.HTTP,
      // port: 80,
    });
    fargateService.connections.allowFrom(loadBalancerServiceBase.loadBalancer, Port.tcp(80));

    listener.addTargetGroups('ListenerRule-Options', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/spawn', '/ttyd/*']),
        ListenerCondition.httpRequestMethods(['OPTIONS']),
      ],
      priority: 16,
    });

    listener.addTargetGroups('ListenerRule-Spawn', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/spawn']),
        ListenerCondition.httpHeader('Authorization', ['*']),
        ListenerCondition.httpRequestMethods(['POST']),
      ],
      priority: 20,
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
        priority: 30,
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
        priority: 40,
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
        priority: 50,
      });
    }
  }
}
