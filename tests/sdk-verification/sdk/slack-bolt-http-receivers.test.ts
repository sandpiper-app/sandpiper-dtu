/**
 * SLCK-11: HTTPReceiver and ExpressReceiver tests
 *
 * Verifies the Bolt HTTP receiver stack end-to-end:
 * - URL verification challenge handling (HTTPReceiver + ExpressReceiver)
 * - HMAC signature validation / rejection
 * - Live event delivery via HTTP POST to a running server
 * - Custom routes on HTTPReceiver
 * - Slash command respond() flow
 *
 * Each test manages its own server lifecycle (start on port 0, stop in finally).
 * Port 0 lets the OS assign a free port — avoids conflicts between parallel tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { App, HTTPReceiver, ExpressReceiver } from '@slack/bolt';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

const SIGNING_SECRET = 'test-signing-secret-slck11';

/**
 * Sign a request body with the Bolt HMAC scheme.
 *
 * Bolt verifies: v0={hmac_sha256(signingSecret, "v0:{ts}:{body}")}
 * Timestamp must be within 5 minutes of current time.
 */
function signRequest(
  body: string,
  secret = SIGNING_SECRET,
  contentType = 'application/json',
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
  return {
    'x-slack-signature': sig,
    'x-slack-request-timestamp': String(ts),
    'content-type': contentType,
  };
}

// Shared bot token — seeded once before all tests in this file.
// Individual tests call resetSlack() only if they need a clean twin state.
let TOKEN: string;

beforeAll(async () => {
  await resetSlack();
  TOKEN = await seedSlackBotToken('xoxb-slck11-test-token');
});

// ---------------------------------------------------------------------------
// HTTPReceiver tests
// ---------------------------------------------------------------------------

describe('HTTPReceiver (SLCK-11)', () => {
  it('returns challenge for url_verification (HTTPReceiver)', async () => {
    const receiver = new HTTPReceiver({ signingSecret: SIGNING_SECRET });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });
    const server = await app.start(0) as import('node:http').Server;
    const port = (server.address() as AddressInfo).port;
    try {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'test-challenge-slck11' });
      const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
        method: 'POST',
        headers: signRequest(body),
        body,
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { challenge: string };
      expect(json.challenge).toBe('test-challenge-slck11');
    } finally {
      await app.stop();
    }
  });

  it('rejects requests with invalid HMAC signatures (HTTPReceiver)', async () => {
    const receiver = new HTTPReceiver({ signingSecret: SIGNING_SECRET });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });
    const server = await app.start(0) as import('node:http').Server;
    const port = (server.address() as AddressInfo).port;
    try {
      const body = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } });
      const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
        method: 'POST',
        headers: {
          'x-slack-signature': 'v0=invalidsignaturehex',
          'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
          'content-type': 'application/json',
        },
        body,
      });
      // HTTPReceiver returns 401 or 403 for invalid signatures
      expect(res.ok).toBe(false);
      expect([401, 403]).toContain(res.status);
    } finally {
      await app.stop();
    }
  });

  it('delivers a signed event_callback to an app.event listener (HTTPReceiver)', async () => {
    const receiver = new HTTPReceiver({ signingSecret: SIGNING_SECRET });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });

    // Coordination: listener resolves this promise when it fires.
    let resolveListenerFired: (eventType: string) => void;
    const listenerFired = new Promise<string>((resolve) => {
      resolveListenerFired = resolve;
    });

    app.event('app_mention', async ({ event }) => {
      resolveListenerFired(event.type);
    });

    const server = await app.start(0) as import('node:http').Server;
    const port = (server.address() as AddressInfo).port;
    try {
      const eventBody = JSON.stringify({
        token: 'fake-token',
        team_id: 'T_TWIN',
        api_app_id: 'A_TWIN',
        event: {
          type: 'app_mention',
          text: '<@U_BOT_TWIN> hello',
          user: 'U_HUMAN',
          channel: 'C_GENERAL',
          event_ts: String(Date.now() / 1000),
        },
        type: 'event_callback',
        event_id: `Ev_SLCK11_${Date.now()}`,
        event_time: Math.floor(Date.now() / 1000),
        authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
      });

      const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
        method: 'POST',
        headers: signRequest(eventBody),
        body: eventBody,
      });
      // HTTPReceiver acknowledges with 200 before listeners run
      expect(res.status).toBe(200);

      // Wait for the listener to fire (with a 5s timeout)
      const firedEventType = await Promise.race([
        listenerFired,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Listener did not fire within 5s')), 5000),
        ),
      ]);
      expect(firedEventType).toBe('app_mention');
    } finally {
      await app.stop();
    }
  });

  it('serves custom routes (GET /health returns 200)', async () => {
    const receiver = new HTTPReceiver({
      signingSecret: SIGNING_SECRET,
      customRoutes: [
        {
          path: '/health',
          method: ['GET'],
          handler: (_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          },
        },
      ],
    });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });
    const server = await app.start(0) as import('node:http').Server;
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const json = await res.json() as { ok: boolean };
      expect(json.ok).toBe(true);
    } finally {
      await app.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// ExpressReceiver tests
// ---------------------------------------------------------------------------

describe('ExpressReceiver (SLCK-11)', () => {
  it('returns challenge for url_verification (ExpressReceiver)', async () => {
    const receiver = new ExpressReceiver({
      signingSecret: SIGNING_SECRET,
      endpoints: '/slack/events',
    });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });

    const server = createServer(receiver.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'express-challenge-slck11' });
      const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
        method: 'POST',
        headers: signRequest(body),
        body,
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { challenge: string };
      expect(json.challenge).toBe('express-challenge-slck11');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('rejects requests with invalid HMAC signatures (ExpressReceiver)', async () => {
    const receiver = new ExpressReceiver({
      signingSecret: SIGNING_SECRET,
      endpoints: '/slack/events',
    });
    // App is needed to attach the receiver middleware properly
    new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });

    const server = createServer(receiver.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const body = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } });
      const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
        method: 'POST',
        headers: {
          'x-slack-signature': 'v0=badsignature',
          'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
          'content-type': 'application/json',
        },
        body,
      });
      expect(res.ok).toBe(false);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

// ---------------------------------------------------------------------------
// Slash command + respond() test
// ---------------------------------------------------------------------------

describe('Slash command respond() (SLCK-11)', () => {
  it('command handler receives respond() and invokes it without routing error', async () => {
    const receiver = new HTTPReceiver({ signingSecret: SIGNING_SECRET });
    const app = new App({
      receiver,
      token: TOKEN,
      clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
    });

    // Track whether the command listener was called and whether respond() was attempted
    let commandFired = false;
    let respondError: Error | null = null;

    app.command('/respond-test', async ({ ack, respond }) => {
      await ack();
      commandFired = true;
      try {
        await respond('pong from SLCK-11');
      } catch (err) {
        // Twin's /response-url/:id returns 410 for unregistered IDs.
        // Catching here proves: (a) the command handler fired, (b) respond() was called,
        // (c) the error is from the response_url POST — not from ack() or command routing.
        respondError = err as Error;
      }
    });

    const server = await app.start(0) as import('node:http').Server;
    const port = (server.address() as AddressInfo).port;
    try {
      // Slash commands use application/x-www-form-urlencoded
      const formBody = new URLSearchParams({
        command: '/respond-test',
        text: 'hello',
        team_id: 'T_TWIN',
        user_id: 'U_TEST',
        channel_id: 'C_GENERAL',
        trigger_id: 'trig-slck11',
        response_url: `${process.env.SLACK_API_URL}/response-url/test-resp-slck11`,
      }).toString();

      const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
        method: 'POST',
        headers: signRequest(formBody, SIGNING_SECRET, 'application/x-www-form-urlencoded'),
        body: formBody,
      });

      // Bolt acks the slash command with 200 before respond() runs
      expect(res.status).toBe(200);

      // Wait for the async command handler to complete (max 3s)
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      // Command listener must have fired
      expect(commandFired).toBe(true);

      // If respond() threw, it must be a response_url-related error (410 from twin)
      // not an internal Bolt routing error
      if (respondError !== null) {
        const errMsg = String(respondError.message ?? respondError);
        // The error should NOT be about Bolt internals — it should be from the HTTP POST
        // to the response_url (e.g., "response_url" or status 410 or network error)
        expect(errMsg).not.toMatch(/ack|listener|middleware|processEvent/i);
      }
    } finally {
      await app.stop();
    }
  });
});
