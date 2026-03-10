/**
 * SLCK-12: SocketModeReceiver conformance test
 *
 * Uses a ws.Server broker to exercise SocketModeReceiver end-to-end:
 * - apps.connections.open call redirected to Slack twin (returns broker wss URL)
 * - hello frame exchange to unblock receiver.start()
 * - events_api envelope delivery with correct ack format
 *
 * Teardown: receiver.stop() MUST be called before wss.close() to prevent
 * reconnect-loop open handles that prevent Vitest from exiting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { App, SocketModeReceiver } from '@slack/bolt';
import { WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

const SLACK_API_URL = process.env.SLACK_API_URL!;
const APP_TOKEN = 'xapp-1-slck12-app-level-token';

let TOKEN: string;
let wss: WebSocketServer;
let wsPort: number;

beforeAll(async () => {
  await resetSlack();
  TOKEN = await seedSlackBotToken('xoxb-slck12-sm-bot-token');
  await seedSlackBotToken(APP_TOKEN);

  // Boot broker on OS-assigned port
  await new Promise<void>((resolve) => {
    wss = new WebSocketServer({ port: 0 });
    wss.once('listening', () => {
      wsPort = (wss.address() as AddressInfo).port;
      resolve();
    });
  });

  // Seed broker URL into twin
  await fetch(SLACK_API_URL + '/admin/set-wss-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `ws://127.0.0.1:${wsPort}/?app_token=${APP_TOKEN}` }),
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

describe('SocketModeReceiver (SLCK-12)', () => {
  it('delivers events_api envelope and receives ack from listener', async () => {
    const receiver = new SocketModeReceiver({
      appToken: APP_TOKEN,
      installerOptions: { clientOptions: { slackApiUrl: SLACK_API_URL + '/api/' } },
    });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: SLACK_API_URL + '/api/' },
    });

    const envelopeId = 'env-slck12-sm-01';
    let listenerFired = false;

    // NOTE: app.event() listeners do NOT receive ack — SocketModeClient auto-acks
    // the envelope_id before dispatching to middleware. Use a Promise to detect
    // listener completion instead of relying on broker ack timing.
    const listenerPromise = new Promise<void>((resolve) => {
      app.event('app_mention', async ({ event: _event }) => {
        listenerFired = true;
        resolve();
      });
    });

    // Set up broker to deliver event on next connection
    const ackReceived = new Promise<string>((resolve) => {
      wss.once('connection', (ws) => {
        ws.send(JSON.stringify({ type: 'hello', num_connections: 1 }));
        // Small delay to let receiver register before sending event
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'events_api',
            envelope_id: envelopeId,
            payload: {
              token: 'x',
              team_id: 'T_TWIN',
              api_app_id: 'A_TWIN',
              event: {
                type: 'app_mention',
                user: 'U_TEST',
                text: '<@U_BOT_TWIN> hello slck12',
                channel: 'C_GENERAL',
                event_ts: '1234567890.000100',
              },
              type: 'event_callback',
              event_id: 'Ev_SLCK12_SM_01',
              event_time: 1234567890,
              authorizations: [{
                enterprise_id: null,
                team_id: 'T_TWIN',
                user_id: 'U_BOT_TWIN',
                is_bot: true,
                is_enterprise_install: false,
              }],
            },
            accepts_response_payload: false,
          }));
        }, 200);
        ws.once('message', (data) => {
          const msg = JSON.parse(data.toString()) as { envelope_id: string };
          resolve(msg.envelope_id);
        });
      });
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SocketModeReceiver test timed out')), 8000)
    );

    try {
      await receiver.start();
      // Wait for BOTH broker ack AND listener completion to avoid race condition.
      // SocketModeClient auto-acks before dispatching to middleware, so broker ack
      // can arrive before the listener fires. Await both to be safe.
      const [ackedId] = await Promise.race([
        Promise.all([ackReceived, listenerPromise]),
        timeout.then(() => { throw new Error('SocketModeReceiver test timed out'); }),
      ]) as [string, void];
      expect(ackedId).toBe(envelopeId);
      expect(listenerFired).toBe(true);
    } finally {
      await receiver.stop();
    }
  }, 15_000);
});
