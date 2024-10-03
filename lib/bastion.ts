import * as cdk from 'aws-cdk-lib';
import {
  ContainerImage, CpuArchitecture, FargateService, FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { DnsRecordType, IService } from 'aws-cdk-lib/aws-servicediscovery';
import type { ApplicationLoadBalancedServiceBase } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import type { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationListenerRule, ApplicationProtocol, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  Architecture, Code, Function as LambdaFunction, Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { type IRole, ManagedPolicy } from 'aws-cdk-lib/aws-iam';

interface BastionStackProps extends cdk.StackProps {
  vpc: IVpc,
  loadBalancerServiceBase: ApplicationLoadBalancedServiceBase,
}

export default class BastionStack extends cdk.Stack {
  vpc: IVpc;

  targetGroupUrl: string;

  proxyFunction: LambdaFunction;

  constructor(scope: Construct, id: string, props: BastionStackProps) {
    super(scope, id, props);
    const { loadBalancerServiceBase, vpc } = props;
    this.vpc = props.vpc;

    const nginxAsset = new DockerImageAsset(this, 'NginxImageAsset', {
      directory: 'bastion',
    });
    const taskDefinition = new FargateTaskDefinition(this, 'FargateTaskDefinition', {
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });
    // @ts-expect-error protected
    const logDriver = loadBalancerServiceBase.createAWSLogDriver(this.node.id);
    taskDefinition.addContainer('nginx', {
      memoryLimitMiB: 256,
      logging: logDriver,
      image: ContainerImage.fromDockerImageAsset(nginxAsset),
      portMappings: [{
        containerPort: 80,
      }],
    });

    const ttydAsset = new DockerImageAsset(this, 'ttydImageAsset', {
      directory: 'bastion/ttyd',
    });
    taskDefinition.addContainer('ttyd', {
      image: ContainerImage.fromDockerImageAsset(ttydAsset),
      memoryLimitMiB: 256,
      logging: logDriver,
    });

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
    });
    const targetGroup = loadBalancerServiceBase.listener.addTargets('Bastion', {
      protocol: ApplicationProtocol.HTTP,
    });
    // targetGroup.addTarget(fargateService);
    const applicationListenerRule = new ApplicationListenerRule(this, 'ApplicationListenerRule', {
      listener: loadBalancerServiceBase.listener,
      priority: 123,

      // the properties below are optional
      conditions: [ListenerCondition.pathPatterns(['/'])],
      targetGroups: [targetGroup],
    });

    const { namespace: { namespaceName }, serviceName } = fargateService
      .cloudMapService as IService;
    this.targetGroupUrl = '';

    // Lambda
    this.proxyFunction = new LambdaFunction(this, 'ReverseProxyPythonFunction', {
      runtime: Runtime.PYTHON_3_11,
      handler: 'lambda_function.proxy_handler',
      code: Code.fromAsset('node_modules/aws-lambda-reverse-proxy.git'),
      environment: {
        REMOTE_URL: `http://${namespaceName}.${serviceName}`,
      },

      vpc,
      allowPublicSubnet: true,
      architecture: Architecture.ARM_64,
    });
    (this.proxyFunction.role as IRole).addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'));
  }
}
