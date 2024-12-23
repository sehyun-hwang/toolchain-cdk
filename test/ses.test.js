import test from 'node:test';

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const createSendEmailCommand = (toAddress, fromAddress) => new SendEmailCommand({
  Destination: {
    /* required */
    CcAddresses: [
      /* more items */
    ],
    ToAddresses: [
      toAddress,
      /* more To-email addresses */
    ],
  },
  Message: {
    /* required */
    Body: {
      /* required */
      Html: {
        Charset: 'UTF-8',
        Data: 'HTML_FORMAT_BODY https://google.com',
      },
      Text: {
        Charset: 'UTF-8',
        Data: 'TEXT_FORMAT_BODY https://google.com',
      },
    },
    Subject: {
      Charset: 'UTF-8',
      Data: 'EMAIL_SUBJECT',
    },
  },
  Source: fromAddress,
  ReplyToAddresses: [],
});

test('Test sending email to https://httpbin.org', async () => {
  process.env.AWS_ENDPOINT_URL_SES = 'https://eo20dnx5kq1d0eb.m.pipedream.net'; // hwanghyun3@gmail.com
  // process.env.AWS_ENDPOINT_URL_SES = 'https://eo6ngl1wxblatys.m.pipedream.net';
  const client = new SESClient({
    logger: console,
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
  });
  const sendEmailCommand = createSendEmailCommand(
    'D07HDTC5UQL',
    'sender@example.com',
  );

  try {
    return await client.send(sendEmailCommand);
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'MessageRejected') {
      /** @type { import('@aws-sdk/client-ses').MessageRejected} */
      const messageRejectedError = caught;
      return messageRejectedError;
    }
    console.log(caught);
    console.log(1111, caught.$response);
    throw caught;
  }
});
