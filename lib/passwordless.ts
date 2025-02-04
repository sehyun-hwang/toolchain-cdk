import { Passwordless } from 'amazon-cognito-passwordless-auth/cdk';
import type { Config } from 'amazon-cognito-passwordless-auth/config';
import * as cdk from 'aws-cdk-lib';
import {
  CognitoUserPoolsAuthorizer, MockIntegration, PassthroughBehavior, RequestValidator,
} from 'aws-cdk-lib/aws-apigateway';
import {
  type ApplicationListener, ApplicationListenerRule, ListenerAction, ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface End2EndPasswordlessExampleStackProps extends cdk.StackProps {
  listener: ApplicationListener;
  botUrl: string;
  distributionDomainName: string;
}

export default class End2EndPasswordlessExampleStack extends cdk.Stack {
  passwordless: Passwordless;

  verifyApiUrl: string;

  constructor(scope: Construct, id: string, props: End2EndPasswordlessExampleStackProps) {
    super(scope, id, props);

    const { distributionDomainName } = props;
    const sesEnvironment = { AWS_ENDPOINT_URL_SES: props.botUrl };
    this.passwordless = new Passwordless(this, 'Passwordless', {
      allowedOrigins: [
        'http://localhost:5173',
        'https://' + distributionDomainName,
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
          distributionDomainName,
        ],
        attestation: 'none',
        userVerification: 'required',
        updatedCredentialsNotification: {
          sesFromAddress: '',
        },
        api: {
          addWaf: false,
        },
      },
      magicLink: { sesFromAddress: '' },
      // smsOtpStepUp: {},
      userPoolClientProps: {
        // perrty short so you see token refreshes in action often:
        idTokenValidity: cdk.Duration.minutes(5),
        accessTokenValidity: cdk.Duration.minutes(5),
        refreshTokenValidity: cdk.Duration.days(1),
        // while testing/experimenting it's best to set this to false,
        // so that when you try to sign in with a user that doesn't exist,
        // Cognito will tell you that––and you don't wait for a magic link
        // that will never arrive in your inbox:
        preventUserExistenceErrors: false,
        generateSecret: true,
      },
      // while testing/experimenting it's helpful to see e.g. full request details in logs:
      logLevel: 'DEBUG',
      functionProps: {
        createAuthChallenge: { environment: sesEnvironment },
        fido2notification: { environment: sesEnvironment },
      },
    });
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.passwordless.userPool.userPoolId,
    });

    const [userPoolClient] = this.passwordless.userPoolClients || [];
    if (!userPoolClient)
      throw new Error('this.passwordless.userPoolClients is undefined');
    if (!this.passwordless.fido2Api)
      throw new Error('passwordless.fido2Api is undefined');
    const outputs: Config = {
      cognitoIdpEndpoint: this.region,
      clientId: new cdk.CfnOutput(this, 'UserPoolClientId', {
        value: userPoolClient.userPoolClientId,
      }).value,
      fido2: {
        baseUrl: new cdk.CfnOutput(this, 'Fido2Url', {
          value: this.passwordless.fido2Api.url,
        }).value,
        authenticatorSelection: {
          userVerification: 'required',
        },
      },
      clientSecret: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
    };

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
    const congitoIdentityHeaderKey = 'method.response.header.X-Cognito-Identity-Id';
    const integration = new MockIntegration({
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            [congitoIdentityHeaderKey]: 'context.authorizer.claims.sub',
          },
        },
      ],
      passthroughBehavior: PassthroughBehavior.NEVER,
      requestTemplates: {
        'application/json': '{"statusCode":200}',
      },
    });
    const authorizer = this.node.findChild('CognitoAuthorizer' + this.passwordless.node.id) as CognitoUserPoolsAuthorizer;
    const requestValidator = this.node.findChild('ReqValidator') as RequestValidator;

    const verifyResource = restApi.root.addResource('verify');
    verifyResource.addMethod('GET', integration, {
      authorizer,
      requestValidator,
      methodResponses: [{
        statusCode: '200',
        responseParameters: {
          [congitoIdentityHeaderKey]: true,
        },
      }],
    });

    this.verifyApiUrl = restApi.urlForPath(verifyResource.path);
  }
}
