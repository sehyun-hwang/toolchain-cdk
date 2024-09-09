import * as cdk from 'aws-cdk-lib';
import {
  Architecture, Code, Function, Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { type IRole, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { IVpc } from 'aws-cdk-lib/aws-ec2';

interface BastionStackProps extends cdk.StackProps {
  vpc: IVpc
}

export default class BastionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BastionStackProps) {
    super(scope, id, props);

    const proxyFunction = new Function(this, 'ReverseProxyPythonFunction', {
      runtime: Runtime.PYTHON_3_11,
      handler: 'lambda_function.proxy_handler',
      code: Code.fromAsset('node_modules/aws-lambda-reverse-proxy.git'),
      environment: {
        REMOTE_URL: 'http://172.31.35.222:8000',
      },

      vpc: props.vpc,
      allowPublicSubnet: true,
      architecture: Architecture.ARM_64,
    });

    (proxyFunction.role as IRole).addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'));
  }
}
