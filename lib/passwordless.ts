import * as cdk from 'aws-cdk-lib';
import { type ApplicationListener, ListenerAction, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Config } from 'amazon-cognito-passwordless-auth/config';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Passwordless } from 'amazon-cognito-passwordless-auth/cdk';

interface End2EndPasswordlessExampleStackProps extends cdk.StackProps {
  listener: ApplicationListener;
  botUrl: string;
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

    const fido2NotificationFunction = this.passwordless.fido2NotificationFn as NodejsFunction;
    fido2NotificationFunction.addEnvironment('AWS_ENDPOINT_URL_SES', props.botUrl);

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
          value: this.passwordless.fido2Api!.url,
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

    props.listener.addAction('PasswordlessParamsResponse', {
      action: ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: JSON.stringify(outputs),
      }),
      conditions: [ListenerCondition.pathPatterns(['/passwordless/params'])],
      priority: 10,
    });
  }
}
