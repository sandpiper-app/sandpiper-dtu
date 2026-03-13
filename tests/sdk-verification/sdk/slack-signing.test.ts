/**
 * SLCK-16: Event signing headers, absolute response_url, interaction routing
 *
 * Wave 0 failing tests — these tests verify three distinct bugs in the current
 * twin implementation. They are expected to FAIL against the current twin:
 *
 *   1. Event signing: events are delivered with X-Shopify-Hmac-Sha256 instead of
 *      X-Slack-Signature + X-Slack-Request-Timestamp (Bolt-compatible format).
 *
 *   2. Absolute response_url: interaction payloads carry a relative `/response-url/:id`
 *      path instead of an absolute `http://...` URL.
 *
 *   3. Interactivity URL routing: interactions are delivered to event subscription URLs
 *      instead of a dedicated interactivity URL. The `/admin/set-interactivity-url`
 *      endpoint does not exist yet.
 *
 * All three groups use buildApp() + app.inject() for in-process testing.
 * Plan 02 will implement the fixes that make these tests GREEN.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../../../twins/slack/src/index.js';
import { allScopesString } from '../../../twins/slack/src/services/method-scopes.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Helper: seed a bot token directly via state manager
// ---------------------------------------------------------------------------
function seedToken(token = 'xoxb-signing-test'): void {
  app.slackStateManager.createToken(token, 'bot', 'T_TWIN', 'U_BOT_TWIN', allScopesString(), 'A_TWIN');
}

// ---------------------------------------------------------------------------
// Helper: seed a message so interactions/trigger has something to reference
// ---------------------------------------------------------------------------
function seedMessage(): string {
  const ts = `${Math.floor(Date.now() / 1000)}.${String(Date.now() % 1000).padStart(6, '0')}`;
  app.slackStateManager.createMessage({
    ts,
    channel_id: 'C_GENERAL',
    user_id: 'U_BOT_TWIN',
    text: 'test message for signing tests',
    thread_ts: null,
  });
  return ts;
}

// ---------------------------------------------------------------------------
// Test group 1: Event signing headers (SLCK-16a)
// Tests that delivered events carry X-Slack-Signature and X-Slack-Request-Timestamp
// ---------------------------------------------------------------------------

describe('SLCK-16a: Event delivery uses Slack HMAC signature headers', () => {
  it('delivers events with X-Slack-Signature header in v0=<hex> format', async () => {
    // Start a local HTTP listener to capture incoming event delivery
    let capturedHeaders: Record<string, string> = {};
    let resolveEvent: () => void;
    const eventReceived = new Promise<void>((resolve) => {
      resolveEvent = resolve;
    });

    const server = createServer((req, res) => {
      capturedHeaders = Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, String(v)])
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      resolveEvent();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const callbackUrl = `http://127.0.0.1:${port}/events`;

    try {
      seedToken();

      // Register an event subscription pointing to our local server
      app.slackStateManager.createEventSubscription('A_TWIN', callbackUrl, ['message']);

      // Post a message to trigger event dispatch
      await app.inject({
        method: 'POST',
        url: '/api/chat.postMessage',
        headers: { Authorization: 'Bearer xoxb-signing-test' },
        payload: { channel: 'C_GENERAL', text: 'trigger event dispatch' },
      });

      // Wait up to 3 seconds for event delivery
      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Event not delivered within 3s')), 3000)
      );
      await Promise.race([eventReceived, timeout]);

      // The test asserts Slack-format signature headers
      // This FAILS now because current impl sends X-Shopify-Hmac-Sha256 instead
      expect(capturedHeaders['x-slack-signature']).toBeDefined();
      expect(capturedHeaders['x-slack-signature']).toMatch(/^v0=[0-9a-f]{64}$/);
      expect(capturedHeaders['x-slack-request-timestamp']).toBeDefined();
      const ts = Number(capturedHeaders['x-slack-request-timestamp']);
      expect(ts).toBeGreaterThan(0);
      expect(Math.abs(Date.now() / 1000 - ts)).toBeLessThan(300); // within 5 minutes
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Test group 2: Absolute response_url (SLCK-16b)
// ---------------------------------------------------------------------------

describe('SLCK-16b: Interaction payloads carry absolute response_url', () => {
  it('response_url starts with http:// (not a relative path)', async () => {
    seedToken();

    // Seed a message to reference in the trigger
    const messageTs = seedMessage();

    // Trigger an interaction
    const res = await app.inject({
      method: 'POST',
      url: '/admin/interactions/trigger',
      payload: {
        message_ts: messageTs,
        channel: 'C_GENERAL',
        action_id: 'test_action',
        user_id: 'U_BOT_TWIN',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);

    // This FAILS now because response_url is '/response-url/<id>' (relative path)
    expect(body.response_url).toBeDefined();
    expect(body.response_url).toMatch(/^https?:\/\//);
  });
});

// ---------------------------------------------------------------------------
// Test group 3: Interactivity URL routing (SLCK-16c)
// Tests that interactions are delivered to a dedicated interactivity URL,
// not the event subscription URL.
// ---------------------------------------------------------------------------

describe('SLCK-16c: Interactions route to dedicated interactivity URL', () => {
  it('POST /admin/set-interactivity-url exists and accepts a URL', async () => {
    // This FAILS now because the endpoint does not exist yet
    const res = await app.inject({
      method: 'POST',
      url: '/admin/set-interactivity-url',
      payload: { url: 'http://127.0.0.1:9999/slack/interactions' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it('interactions are delivered to interactivity URL, not event subscription URL', async () => {
    // Track which URL received requests
    const receivedAt: string[] = [];

    function createCapturingServer(label: string): Promise<{ port: number; close: () => void }> {
      return new Promise((resolve) => {
        const srv = createServer((req, res) => {
          receivedAt.push(label);
          res.writeHead(200);
          res.end('{"ok":true}');
        });
        srv.listen(0, '127.0.0.1', () => {
          const port = (srv.address() as AddressInfo).port;
          resolve({ port, close: () => srv.close() });
        });
      });
    }

    const eventSrv = await createCapturingServer('event');
    const interactSrv = await createCapturingServer('interact');

    try {
      seedToken();
      const messageTs = seedMessage();

      // Register event subscription
      app.slackStateManager.createEventSubscription(
        'A_TWIN',
        `http://127.0.0.1:${eventSrv.port}/slack/events`,
        ['message']
      );

      // Register interactivity URL — this FAILS now (endpoint doesn't exist)
      const setRes = await app.inject({
        method: 'POST',
        url: '/admin/set-interactivity-url',
        payload: { url: `http://127.0.0.1:${interactSrv.port}/slack/interact` },
      });
      expect(setRes.statusCode).toBe(200);

      // Trigger interaction
      await app.inject({
        method: 'POST',
        url: '/admin/interactions/trigger',
        payload: {
          message_ts: messageTs,
          channel: 'C_GENERAL',
          action_id: 'btn_click',
          user_id: 'U_BOT_TWIN',
        },
      });

      // Give time for async delivery
      await new Promise((r) => setTimeout(r, 500));

      // Interaction should have gone to 'interact', not 'event'
      expect(receivedAt).toContain('interact');
      expect(receivedAt).not.toContain('event');
    } finally {
      eventSrv.close();
      interactSrv.close();
    }
  });
});
