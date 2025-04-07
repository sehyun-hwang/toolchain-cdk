/* eslint-disable max-classes-per-file */

import { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import { EventField, Rule, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets';
import { CfnChannelAssociation, CfnEventRule, CfnNotificationConfiguration } from 'aws-cdk-lib/aws-notifications';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { UrlSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

export class ChatBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const topic = new Topic(this, 'Topic');
    const deadLetterQueue = new Queue(this, 'DeadLetterQueue');
    topic.addSubscription(new UrlSubscription('https://global.sns-api.chatbot.amazonaws.com', {
      deadLetterQueue,
    }));

    new Alarm(this, 'Alarm', {
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Rule(this, 'CloudFormationRule', {
      eventPattern: {
        source: ['aws.cloudformation'],
        detailType: [
          'CloudFormation Stack Status Change',
          'CloudFormation Drift Detection Status Change',
        ],
      },
      targets: [new SnsTopic(topic, {
        deadLetterQueue,
        /** @link https://docs.aws.amazon.com/chatbot/latest/adminguide/custom-notifs.html */
        message: RuleTargetInput.fromObject({
          version: '1.0',
          source: 'custom',
          content: {
            title: `:information_source: ${EventField.fromPath('$.detail-type')}`,
            description: `- Stack: ${EventField.fromPath('$.detail.stack-id')}
- Status: ${EventField.fromPath('$.detail.status-details.status')}
- Reason: ${EventField.fromPath('$.detail.status-details.status-reason')}`,
          },
        }),
      })],
    });

    new Rule(this, 'Ec2Rule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: [
          'EC2 Instance State-change Notification',
          'EC2 Spot Instance Interruption Warning',
        ],
      },
      targets: [new SnsTopic(topic)],
    });

    new Rule(this, 'EcsRule', {
      eventPattern: {
        source: ['aws.ecs'],
        detailType: [
          'ECS Task State Change',
          'ECS Service Action',
          'ECS Deployment State Change',
        ],
      },
      targets: [new SnsTopic(topic)],
    });
  }
}

interface GlobalChatBotStackProps extends cdk.StackProps {
  regions: string[];
  chatConfigurationArn: string;
}

export class GlobalChatBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GlobalChatBotStackProps) {
    super(scope, id, props);
    const { regions, chatConfigurationArn } = props;

    const { attrArn: notificationConfigurationArn } = new CfnNotificationConfiguration(this, 'CfnNotificationConfiguration', {
      name: this.stackName,
      description: 'default',
    });

    new CfnChannelAssociation(this, 'CfnChannelAssociation', {
      arn: chatConfigurationArn,
      notificationConfigurationArn,
    });

    new CfnEventRule(this, 'CloudWatchRule', {
      source: 'aws.cloudwatch',
      eventType: 'CloudWatch Alarm State Change',
      notificationConfigurationArn,
      regions,
    });

    new CfnEventRule(this, 'CodePipelineRule', {
      source: 'aws.codepipeline',
      eventType: 'CodePipeline Pipeline Execution State Change',
      notificationConfigurationArn,
      regions,
    });

    new CfnEventRule(this, 'CodeBuildRule', {
      source: 'aws.codebuild',
      eventType: 'CodeBuild Build State Change',
      notificationConfigurationArn,
      regions,
      eventPattern: JSON.stringify({
        detail: {
          'build-status': [
            'FAILED',
            'STOPPED',
          ],
        },
      }),
    });
  }
}
