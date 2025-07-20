import assert from 'assert/strict';
import { fileURLToPath } from 'url';

import { EventbridgeToLambda } from '@aws-solutions-constructs/aws-eventbridge-lambda';
import type { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  AvailabilityZoneRebalancing, type ContainerDefinitionOptions, ContainerImage, Ec2Service,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListener, ApplicationProtocol, ApplicationTargetGroup, ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Architecture, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib/core';

import NestedServiceStack, { type NestedServiceStackProps } from './base';
import { NATS_SERVER_CONFIG } from './nats-seed';

const natsJetStreamPrunerPath = fileURLToPath(import.meta.resolve('./lambda/nats-jetstream-pruner'));

interface NatsJetStreamStackProps extends NestedServiceStackProps {
  autoScalingGroup: AutoScalingGroup;
  natsSecurityGroup: SecurityGroup;
}

export const natsServerConfPath = '/tmp/nats-server.conf';
export const natsContainerOptions: ContainerDefinitionOptions = {
  memoryLimitMiB: 32,
  image: ContainerImage.fromRegistry('nats:alpine'),
  portMappings: [{
    containerPort: 4222,
  }, {
    containerPort: 6222,
  }],
  environment: {
    NATS_SERVER_NAMES: Array.from({
      // JetStream node (4) + Leaf node (1) + Reserve (1)
      length: 6,
    }, (_, i) => 'jetstream-' + (i + 1).toString())
      .join('\\n') + '\\n',
  },
  entryPoint: ['sh', '-c'],
  command: [`set -eux
sleep $(shuf -i 3-10 -n 1)

NATS_BASE_URL=$(ip route | awk '/^default/ { print $3":8222/nats" }')
HOST_IP=$(wget -O- $NATS_BASE_URL/varz \
  | tee /dev/stderr \
  | sed -n 's/.*"addr":[[:space:]]*"\\([0-9.]\\+\\)",/\\1/p')
printf "$NATS_SERVER_NAMES" | tee /tmp/server-names.txt
wget -O- $NATS_BASE_URL/routez \
  | tee /dev/stderr \
  | sed -n 's/.*"\\(remote_name\\|server_name\\)":[[:space:]]*"\\(jetstream-[0-9]\\+\\)",/\\2/p' \
  | uniq \
  | tee -a /tmp/server-names.txt
SERVER_NAME=$(sort /tmp/server-names.txt | uniq -u | head -n 1)

wget -O /tmp/task.json $ECS_CONTAINER_METADATA_URI_V4/task
cat /tmp/task.json

if [ -z \${SERVER_TAG+x} ]; then
  export SERVER_TAG=az:$(sed -n 's/.*"AvailabilityZone":[[:space:]]*"\\([a-z0-9-]\\+\\)".*/\\1/p' /tmp/task.json)
fi
HOST_CLUSTER_PORT=$(sed -n 's/.*{"ContainerPort":6222,"Protocol":"tcp","HostPort":\\([0-9]\\+\\),"HostIp":"0.0.0.0"}.*/\\1/p' /tmp/task.json)
HOST_CLIENT_PORT=$(sed -n 's/.*{"ContainerPort":4222,"Protocol":"tcp","HostPort":\\([0-9]\\+\\),"HostIp":"0.0.0.0"}.*/\\1/p' /tmp/task.json)

printf "$NATS_SERVER_CONFIG" true 0.0.0.0 "nats://$HOST_IP:6222" | tee ${natsServerConfPath}
exec nats-server -c ${natsServerConfPath} -js \
  -n $SERVER_NAME \
  --cluster_advertise $HOST_IP:$HOST_CLUSTER_PORT \
  --client_advertise $HOST_IP:$HOST_CLIENT_PORT`,
  ],
  healthCheck: {
    command: ['wget', '--spider', '-q', 'http://127.0.0.1:8222/nats/healthz?js-enabled-only=true'],
  },
};

export default class NatsJetStreamStack extends NestedServiceStack {
  service: Ec2Service;

  constructor(scope: cdk.Stack, id: string, props: NatsJetStreamStackProps) {
    super(scope, id, props);
    const { autoScalingGroup, loadBalancerServiceBase } = props;

    const { taskDefinition, logDriver } = this;
    const container = taskDefinition.addContainer('nats', {
      ...natsContainerOptions,
      logging: logDriver,
    });
    container.addEnvironment('NATS_SERVER_CONFIG', NATS_SERVER_CONFIG);
    container.addPortMappings({
      containerPort: 8222,
    });

    const { cluster } = loadBalancerServiceBase;
    this.service = new Ec2Service(this, 'Service', {
      desiredCount: 4,
      cluster,
      taskDefinition,
      availabilityZoneRebalancing: AvailabilityZoneRebalancing.ENABLED,
      minHealthyPercent: 75 - 1,
      maxHealthyPercent: 125 + 1,
      capacityProviderStrategies: [{
        capacityProvider: props.capacityProvider.capacityProviderName,
        weight: 1,
      }],
    });
    Object.defineProperty(this.service, 'defaultLoadBalancerTarget', {
      get(this: Ec2Service) {
        return this.loadBalancerTarget({
          containerPort: 8222,
          containerName: this.taskDefinition.defaultContainer.containerName,
        });
      },
    });

    /**
     * @link https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html
     * @example `cat /proc/sys/net/ipv4/ip_local_port_range`
     */
    autoScalingGroup.connections.allowInternally(Port.tcpRange(32768, 60999));

    const { securityGroupId } = loadBalancerServiceBase.loadBalancer.connections
      .securityGroups.at(0) || {};
    assert(securityGroupId);
    const listener = ApplicationListener.fromApplicationListenerAttributes(this, 'ApplicationListener', {
      listenerArn: loadBalancerServiceBase.listener.listenerArn,
      securityGroup: SecurityGroup.fromSecurityGroupId(this, 'LoadBalancerSecurityGroup', securityGroupId),
    });

    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      targets: [this.service],
      vpc: cluster.vpc,
      protocol: ApplicationProtocol.HTTP,
      port: 8222,
      healthCheck: {
        path: '/nats/healthz?js-enabled-only=true',
      },
      deregistrationDelay: cdk.Duration.seconds(0),
    });

    listener.addTargetGroups('ListenerRule', {
      targetGroups: [targetGroup],
      conditions: [
        ListenerCondition.pathPatterns(['/nats', '/nats/*']),
      ],
      priority: 200,
    });

    const powerToolsLambdaLayer = LayerVersion.fromLayerVersionArn(
      this,
      'PowerToolsLambdaLayer',
      'arn:aws:lambda:ap-northeast-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:25',
    );
    const { vpc, clusterArn } = cluster;
    const existingLambdaObj = new NodejsFunction(this, 'NodejsFunction', {
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      entry: natsJetStreamPrunerPath,
      bundling: {
        // format: OutputFormat.ESM,
        externalModules: [
          '@aws-lambda-powertools/*',
        ],
      },
      layers: [powerToolsLambdaLayer],
      timeout: cdk.Duration.seconds(10),
      environment: {
        VARZ_URL: `http://${loadBalancerServiceBase.loadBalancer.loadBalancerDnsName}/nats/varz`,
        NATS_USER: 'kine',
        NATS_PASS: 'kine',
      },
      vpc,
      allowPublicSubnet: true,
      securityGroups: [props.natsSecurityGroup],
    });
    autoScalingGroup.connections.allowFrom(existingLambdaObj, Port.tcp(4222));

    const eventBridgeToLambda = new EventbridgeToLambda(this, 'EventBridgeToLambda', {
      existingLambdaObj,
      eventRuleProps: {
        eventPattern: {
          source: ['aws.ecs'],
          detailType: ['ECS Task State Change'],
          detail: {
            lastStatus: ['STOPPED'],
            clusterArn: [clusterArn],
            taskDefinitionArn: [{
              prefix: cdk.Fn.split(':', taskDefinition.taskDefinitionArn, 7)
                .slice(0, 6).join(':'),
            }],
          },
        },
      },
    });
    this.service.node.addDependency(eventBridgeToLambda);
  }
}
