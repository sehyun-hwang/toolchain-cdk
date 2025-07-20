import assert from 'node:assert/strict';

import { EventBridgeSchema } from '@aws-lambda-powertools/parser/schemas/eventbridge';
import type { EventBridgeEvent } from '@aws-lambda-powertools/parser/types';
import { JetStreamApiError, jetstreamManager, type JetStreamManager } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import type { Context } from 'aws-lambda';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      VARZ_URL: string;
      NATS_USER?: string;
      NATS_PASS?: string;
    }
  }
}

const { VARZ_URL } = process.env;
assert(VARZ_URL);

interface VarzApiResponse {
  connect_urls: string[];
}

const fechServers = () => fetch(VARZ_URL)
  .then(res => res.json() as Promise<VarzApiResponse>)
  .then(varzApiResponse => {
    console.log('varzApiResponse', varzApiResponse);
    return varzApiResponse.connect_urls
      .filter(url => !url.startsWith('[') && url.endsWith(':4222') && url !== '172.17.0.1:4222');
  });

async function updateStream(nc: NatsConnection) {
  let jsm: JetStreamManager;
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < 10; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      jsm = await jetstreamManager(nc);
      console.log('Connected jsm');
      break;
    } catch (error) {
      console.log(error);
      if (error instanceof JetStreamApiError && error.message === 'JetStream system temporarily unavailable')
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 1000));
      else
        throw error;
    }
  }
  assert(jsm);

  const streamName = 'KV_kine';
  const streamInfo = await jsm.streams.info(streamName);
  console.log('streamInfo', streamInfo);
  const offlineLength = streamInfo.cluster?.replicas?.filter(({ offline }) => offline).length;
  console.log('offlineLength', offlineLength);
  const streamConfig = streamInfo.config;
  if (offlineLength)
    streamConfig.num_replicas -= offlineLength;
  else
    streamConfig.num_replicas = 1;
  console.log('Updating num_replicas', streamConfig.num_replicas);
  const updateResponse1 = await jsm.streams.update(streamName, streamConfig);
  streamConfig.num_replicas = 3;
  const updateResponse2 = await jsm.streams.update(streamName, streamConfig);
  return {
    streamConfig,
    updateResponse1,
    updateResponse2,
  };
}

// eslint-disable-next-line import/prefer-default-export
export const handler = async (
  eventBridgeEvent: EventBridgeEvent,
  _context: Context,
) => {
  const event = EventBridgeSchema.parse(eventBridgeEvent);
  console.log('Event', JSON.stringify(event));
  const [taskArn] = event.resources;
  console.log('Task ARN', taskArn);
  assert(taskArn);
  const servers = await fechServers();
  const nc = await connect({
    servers,
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS,
  });
  console.log('Connected nc', servers);
  const updateStreamResult = await updateStream(nc);
  return {
    taskArn,
    servers,
    ...updateStreamResult,
  };
};
