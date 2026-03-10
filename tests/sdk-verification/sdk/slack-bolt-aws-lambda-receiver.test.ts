/**
 * SLCK-12: AwsLambdaReceiver conformance test
 *
 * Pure in-process harness — no network, no HTTP server, no AWS SDK required.
 * AwsLambdaReceiver.toHandler() returns an async function that the test calls
 * directly with shaped AwsEventV1 objects and asserts on AwsResponse.
 *
 * HMAC scheme: v0=${sha256(secret, "v0:{ts}:{body}")} — identical to HTTPReceiver.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AwsLambdaReceiver, App } from '@slack/bolt';
import { createHmac } from 'node:crypto';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

const SIGNING_SECRET = 'test-signing-secret-slck12-lambda';
let TOKEN: string;

beforeAll(async () => {
  await resetSlack();
  TOKEN = await seedSlackBotToken('xoxb-slck12-lambda-bot-token');
});

/**
 * Build a shaped AwsEventV1 with correct HMAC headers.
 * Pass a different secret to produce an invalid signature.
 */
function makeAwsEvent(body: string, secret = SIGNING_SECRET) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
  return {
    body,
    headers: {
      'X-Slack-Signature': sig,
      'X-Slack-Request-Timestamp': String(ts),
      'Content-Type': 'application/json',
    },
    isBase64Encoded: false,
    httpMethod: 'POST',
    path: '/slack/events',
    resource: '/slack/events',
    pathParameters: null as Record<string, string | undefined> | null,
    queryStringParameters: null as Record<string, string | undefined> | null,
    multiValueHeaders: {} as Record<string, string[] | undefined>,
    multiValueQueryStringParameters: {} as Record<string, string[] | undefined>,
    requestContext: {} as any,
    stageVariables: null as Record<string, string | undefined> | null,
  };
}

describe('AwsLambdaReceiver (SLCK-12)', () => {
  it('returns 200 with challenge for url_verification', async () => {
    const receiver = new AwsLambdaReceiver({
      signingSecret: SIGNING_SECRET,
      unhandledRequestTimeoutMillis: 100,
    });
    const handler = await receiver.start();
    const body = JSON.stringify({ type: 'url_verification', challenge: 'test-challenge-slck12' });
    const response = await handler(makeAwsEvent(body), {} as any, () => {}) as any;
    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body);
    expect(parsed.challenge).toBe('test-challenge-slck12');
  });

  it('returns 401 for invalid HMAC signature', async () => {
    const receiver = new AwsLambdaReceiver({
      signingSecret: SIGNING_SECRET,
      unhandledRequestTimeoutMillis: 100,
    });
    const handler = await receiver.start();
    const body = JSON.stringify({ type: 'url_verification', challenge: 'test-challenge' });
    // Sign with a DIFFERENT secret to produce invalid sig
    const response = await handler(makeAwsEvent(body, 'wrong-secret'), {} as any, () => {}) as any;
    expect(response.statusCode).toBe(401);
  });

  it('delivers event_callback payload to app.event() listener', async () => {
    const receiver = new AwsLambdaReceiver({
      signingSecret: SIGNING_SECRET,
      unhandledRequestTimeoutMillis: 100,
    });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });

    let listenerFired = false;
    // NOTE: app.event() listeners do NOT receive ack as a callable function.
    // AwsLambdaReceiver auto-acks the HTTP response. Track listener invocation
    // via a simple flag and verify the handler's response separately.
    app.event('app_mention', async ({ event }) => {
      listenerFired = true;
    });

    const handler = await receiver.start();

    const eventBody = JSON.stringify({
      token: 'x',
      type: 'event_callback',
      team_id: 'T_TWIN',
      api_app_id: 'A_TWIN',
      event: {
        type: 'app_mention',
        user: 'U_TEST',
        text: '<@U_BOT_TWIN> hello lambda',
        channel: 'C_GENERAL',
        event_ts: '1234567890.000200',
      },
      event_id: 'Ev_SLCK12_LAMBDA',
      event_time: 1234567890,
      authorizations: [{
        enterprise_id: null,
        team_id: 'T_TWIN',
        user_id: 'U_BOT_TWIN',
        is_bot: true,
        is_enterprise_install: false,
      }],
    });

    const response = await handler(makeAwsEvent(eventBody), {} as any, () => {}) as any;
    expect(response.statusCode).toBe(200);
    expect(listenerFired).toBe(true);
  });
});
