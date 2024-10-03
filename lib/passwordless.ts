import * as cdk from 'aws-cdk-lib';
import {
  type ApplicationListener, ApplicationListenerRule, ListenerAction, ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Config } from 'amazon-cognito-passwordless-auth/config';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Passwordless } from 'amazon-cognito-passwordless-auth/cdk';
import {
  type Authorizer, CognitoUserPoolsAuthorizer, LambdaIntegration, RequestValidator, type RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';

interface End2EndPasswordlessExampleStackProps extends cdk.StackProps {
  listener: ApplicationListener;
  botUrl: string;
  proxyFunction: LambdaFunction;
}

export default class End2EndPasswordlessExampleStack extends cdk.Stack {
  passwordless: Passwordless;

  constructor(scope: Construct, id: string, props: End2EndPasswordlessExampleStackProps) {
    super(scope, id, props);

    // const spa = cloudfrontServedEmptySpaBucket(this, "ExampleSpa");
    this.passwordless = new Passwordless(this, 'Passwordless', {
      allowedOrigins: [
        'http://localhost:5173',
        // `https://${spa.distribution.distributionDomainName}`,
      ],
      clientMetadataTokenKeys: ['consent_id'],
      userPoolProps: {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
      fido2: {
        authenticatorsTableProps: {
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        },
        relyingPartyName: 'Passwordless Fido2 Example',
        allowedRelyingPartyIds: [
          'localhost',
          // spa.distribution.distributionDomainName,
        ],
        attestation: 'none',
        userVerification: 'required',
        updatedCredentialsNotification: {
          sesFromAddress: '',
        },
      },
      magicLink: { sesFromAddress: '' },
      // smsOtpStepUp: {},
      userPoolClientProps: {
        // perrty short so you see token refreshes in action often:
        idTokenValidity: cdk.Duration.minutes(5),
        accessTokenValidity: cdk.Duration.minutes(5),
        refreshTokenValidity: cdk.Duration.hours(1),
        // while testing/experimenting it's best to set this to false,
        // so that when you try to sign in with a user that doesn't exist,
        // Cognito will tell you that––and you don't wait for a magic link
        // that will never arrive in your inbox:
        preventUserExistenceErrors: false,
      },
      // while testing/experimenting it's heplful to see e.g. full request details in logs:
      logLevel: 'DEBUG',
    });

    ([
      this.passwordless.createAuthChallengeFn,
      this.passwordless.fido2NotificationFn,
    ] as NodejsFunction[]).forEach(fn => fn.addEnvironment('AWS_ENDPOINT_URL_SES', props.botUrl));
    if (!this.passwordless.fido2Api)
      throw new Error('passwordless.fido2Api is undefined');

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.passwordless.userPool.userPoolId,
    });

    const outputs: Config = {
      cognitoIdpEndpoint: this.region,
      clientId: new cdk.CfnOutput(this, 'UserPoolClientId', {
        value: this.passwordless.userPoolClients!.at(0)!.userPoolClientId,
      }).value,
      fido2: {
        baseUrl: new cdk.CfnOutput(this, 'Fido2Url', {
          value: this.passwordless.fido2Api.url,
        }).value,
        authenticatorSelection: {
          userVerification: 'required',
        },
      },
    };

    // new cdk.CfnOutput(this, "SpaUrl", {
    //   value: `https://${spa.distribution.distributionDomainName}`,
    // });
    // new cdk.CfnOutput(this, "SpaBucket", {
    //   value: spa.bucket.bucketName,
    // });

    const { listener } = props;
    new ApplicationListenerRule(this, 'PasswordlessParamsResponse', {
      listener,
      action: ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: JSON.stringify(outputs),
      }),
      conditions: [ListenerCondition.pathPatterns(['/passwordless/params'])],
      priority: 10,
    });

    const restApi = this.passwordless.fido2Api;
    const integration = new LambdaIntegration(props.proxyFunction);
    const resource = restApi.root.addResource('spawn');
    const requestValidator = restApi.addRequestValidator('header-validator', {
      validateRequestParameters: true,
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      cognitoUserPools: [this.passwordless.userPool],
    });
    resource.addMethod('GET', integration, {
      authorizer,
      requestValidator,
      requestParameters: {
        'method.request.header.X-User-Id': true,
      },
    });
  }
}
