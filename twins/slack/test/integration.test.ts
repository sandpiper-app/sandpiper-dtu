/**
 * Comprehensive integration tests for Slack twin
 * Covers ALL 8 Phase 5 success criteria from ROADMAP.md.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Slack Twin Integration — Phase 5 Success Criteria', () => {
  let app: FastifyInstance;
  let botToken: string;

  beforeEach(async () => {
    // Build with sync mode for deterministic event delivery in tests
    process.env.WEBHOOK_SYNC_MODE = 'true';
    app = await buildApp({ logger: false });
    delete process.env.WEBHOOK_SYNC_MODE;

    // Get a valid bot token via OAuth (must first get a real code from /oauth/v2/authorize)
    // Request broad scope to cover all methods exercised in this test file
    const authzRes = await app.inject({
      method: 'GET',
      url: '/oauth/v2/authorize?client_id=test&scope=chat:write,channels:read,channels:history,users:read&redirect_uri=https://localhost/callback&state=test',
    });
    const code = new URL(authzRes.headers.location as string).searchParams.get('code');
    const oauthRes = await app.inject({
      method: 'POST',
      url: '/api/oauth.v2.access',
      payload: { code, client_id: 'test', client_secret: 'test' },
    });
    botToken = JSON.parse(oauthRes.body).access_token;
  });

  afterEach(async () => {
    await app.close();
  });

  function apiPost(method: string, body: any) {
    return app.inject({
      method: 'POST',
      url: `/api/${method}`,
      headers: { authorization: `Bearer ${botToken}` },
      payload: body,
    });
  }

  // =========================================================================
  // Success Criterion 1: OAuth installation flow
  // =========================================================================
  it('SC1: completes OAuth workspace installation and receives bot token', async () => {
    // Obtain a fresh authorization code from the authorize endpoint
    const authzRes = await app.inject({
      method: 'GET',
      url: '/oauth/v2/authorize?client_id=test&scope=chat:write&redirect_uri=https://localhost/callback&state=test',
    });
    const sc1Code = new URL(authzRes.headers.location as string).searchParams.get('code');
    const res = await app.inject({
      method: 'POST',
      url: '/api/oauth.v2.access',
      payload: { code: sc1Code, client_id: 'test', client_secret: 'test' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.access_token).toMatch(/^xoxb-T_TWIN-/);
    expect(body.token_type).toBe('bot');
    expect(body.bot_user_id).toBe('U_BOT_TWIN');
    expect(body.app_id).toBe('A_TWIN');
    expect(body.team.id).toBe('T_TWIN');
    expect(body.team.name).toBe('Twin Workspace');
    expect(body.authed_user.access_token).toMatch(/^xoxp-T_TWIN-/);
    expect(body.authed_user.token_type).toBe('user');
    expect(body.scope).toContain('chat:write');
  });

  // =========================================================================
  // Success Criterion 2: Post message with Block Kit
  // =========================================================================
  it('SC2: posts message via chat.postMessage with Block Kit blocks and message appears', async () => {
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: 'Hello from *test*' } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Click' }, action_id: 'btn' }] },
    ];
    const res = await apiPost('chat.postMessage', {
      channel: 'C_GENERAL',
      text: 'Hello from test',
      blocks,
    });
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.channel).toBe('C_GENERAL');
    expect(body.ts).toMatch(/^\d+\.\d{6}$/);
    expect(body.message.type).toBe('message');

    // Verify message appears in history
    const historyRes = await apiPost('conversations.history', { channel: 'C_GENERAL' });
    const historyBody = JSON.parse(historyRes.body);
    const msg = historyBody.messages.find((m: any) => m.ts === body.ts);
    expect(msg).toBeTruthy();
    expect(msg.text).toBe('Hello from test');
    expect(msg.blocks).toHaveLength(2);
  });

  // =========================================================================
  // Success Criterion 3: Query conversation history
  // =========================================================================
  it('SC3: queries conversation history and receives previously posted messages', async () => {
    // Post 3 messages
    const timestamps = [];
    for (const text of ['Message A', 'Message B', 'Message C']) {
      const res = await apiPost('chat.postMessage', { channel: 'C_GENERAL', text });
      timestamps.push(JSON.parse(res.body).ts);
    }

    // Query history
    const res = await apiPost('conversations.history', { channel: 'C_GENERAL' });
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.messages.length).toBe(3);
    // Newest first
    expect(body.messages[0].text).toBe('Message C');
    expect(body.messages[1].text).toBe('Message B');
    expect(body.messages[2].text).toBe('Message A');
  });

  // =========================================================================
  // Success Criterion 4: Events API delivery
  // =========================================================================
  it('SC4: receives Events API webhook (message event) when message posted', async () => {
    // Set up a local callback server to receive events
    const receivedEvents: any[] = [];
    const callbackServer = await createCallbackServer((body) => {
      receivedEvents.push(body);
    });
    const callbackPort = (callbackServer.address() as any).port;
    const callbackUrl = `http://localhost:${callbackPort}/events`;

    try {
      // Subscribe to events
      app.slackStateManager.createEventSubscription(
        'A_TWIN',
        callbackUrl,
        ['message', 'app_mention', 'reaction_added']
      );

      // Post a message — this should trigger event delivery
      await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'event test message',
      });

      // Wait a tiny bit for sync delivery
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify event received
      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      const messageEvent = receivedEvents.find(e => e.event?.type === 'message');
      expect(messageEvent).toBeTruthy();
      expect(messageEvent.type).toBe('event_callback');
      expect(messageEvent.event.type).toBe('message');
      expect(messageEvent.event.text).toBe('event test message');
      expect(messageEvent.event.channel).toBe('C_GENERAL');
      expect(messageEvent.team_id).toBe('T_TWIN');
      expect(messageEvent.api_app_id).toBe('A_TWIN');
      expect(messageEvent.event_id).toMatch(/^Ev/);
      expect(messageEvent.event_time).toBeGreaterThan(0);
      expect(messageEvent.authorizations).toBeInstanceOf(Array);
      expect(messageEvent.authorizations[0].is_bot).toBe(true);
    } finally {
      callbackServer.close();
    }
  });

  // =========================================================================
  // Success Criterion 4b: app_mention event
  // =========================================================================
  it('SC4b: receives app_mention event when message contains bot mention', async () => {
    const receivedEvents: any[] = [];
    const callbackServer = await createCallbackServer((body) => {
      receivedEvents.push(body);
    });
    const callbackPort = (callbackServer.address() as any).port;
    const callbackUrl = `http://localhost:${callbackPort}/events`;

    try {
      app.slackStateManager.createEventSubscription(
        'A_TWIN',
        callbackUrl,
        ['message', 'app_mention']
      );

      // Post message mentioning bot
      await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'Hey <@U_BOT_TWIN> what do you think?',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should receive BOTH message and app_mention events
      const messageEvents = receivedEvents.filter(e => e.event?.type === 'message');
      const mentionEvents = receivedEvents.filter(e => e.event?.type === 'app_mention');
      expect(messageEvents.length).toBe(1);
      expect(mentionEvents.length).toBe(1);
      expect(mentionEvents[0].event.text).toContain('<@U_BOT_TWIN>');
      expect(mentionEvents[0].type).toBe('event_callback');
    } finally {
      callbackServer.close();
    }
  });

  // =========================================================================
  // Success Criterion 5: Block Kit interaction payload
  // =========================================================================
  it('SC5: clicks button and receives interaction payload, response URL works', async () => {
    // Post a message with a button block
    const blocks = [
      {
        type: 'actions',
        block_id: 'actions_1',
        elements: [{ type: 'button', action_id: 'approve', text: { type: 'plain_text', text: 'Approve' } }],
      },
    ];
    const postRes = await apiPost('chat.postMessage', {
      channel: 'C_GENERAL',
      text: 'Approval needed',
      blocks,
    });
    const messageTs = JSON.parse(postRes.body).ts;

    // Set up callback to receive interaction payload
    const receivedPayloads: any[] = [];
    const callbackServer = await createCallbackServer((body) => {
      receivedPayloads.push(body);
    });
    const callbackPort = (callbackServer.address() as any).port;

    try {
      // Register dedicated interactivity URL for interaction delivery
      await app.inject({
        method: 'POST',
        url: '/admin/set-interactivity-url',
        payload: { url: `http://localhost:${callbackPort}/events` },
      });

      // Trigger button click via admin
      const triggerRes = await app.inject({
        method: 'POST',
        url: '/admin/interactions/trigger',
        payload: {
          message_ts: messageTs,
          channel: 'C_GENERAL',
          action_id: 'approve',
          user_id: 'U_BOT_TWIN',
          block_id: 'actions_1',
        },
      });
      const triggerBody = JSON.parse(triggerRes.body);
      expect(triggerBody.ok).toBe(true);
      // response_url must be absolute (http://...) for Bolt compatibility
      expect(triggerBody.response_url).toMatch(/^http:\/\//);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify interaction payload received at interactivity URL (form-encoded)
      // The callback server receives the parsed payload
      expect(receivedPayloads.length).toBeGreaterThanOrEqual(1);

      // Use response URL path to post a follow-up message via app.inject()
      const responseUrlPath = new URL(triggerBody.response_url).pathname;
      const responseRes = await app.inject({
        method: 'POST',
        url: responseUrlPath,
        payload: { text: 'Approved!' },
      });
      expect(JSON.parse(responseRes.body).ok).toBe(true);

      // Verify follow-up message appears in channel
      const historyRes = await apiPost('conversations.history', { channel: 'C_GENERAL' });
      const messages = JSON.parse(historyRes.body).messages;
      const followUp = messages.find((m: any) => m.text === 'Approved!');
      expect(followUp).toBeTruthy();
    } finally {
      callbackServer.close();
    }
  });

  // =========================================================================
  // Success Criterion 6: Block Kit validation (50-block limit)
  // =========================================================================
  it('SC6: rejects message with 51 blocks with validation error', async () => {
    const blocks = Array.from({ length: 51 }, (_, i) => ({
      type: 'section',
      text: { type: 'plain_text', text: `Block ${i}` },
    }));
    const res = await apiPost('chat.postMessage', {
      channel: 'C_GENERAL',
      text: 'too many blocks',
      blocks,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_blocks');
  });

  // =========================================================================
  // Success Criterion 7: Rate limiting
  // =========================================================================
  it('SC7: returns 429 with Retry-After on rapid calls exceeding tier limit', async () => {
    // conversations.list is tier 2 = 20/min
    let rateLimited = false;
    for (let i = 0; i < 25; i++) {
      const res = await apiPost('conversations.list', {});
      if (res.statusCode === 429) {
        const body = JSON.parse(res.body);
        expect(body.error).toBe('ratelimited');
        expect(res.headers['retry-after']).toBeDefined();
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });

  // =========================================================================
  // Success Criterion 8: url_verification challenge
  // =========================================================================
  it('SC8: responds to url_verification challenge', async () => {
    const challenge = 'test-challenge-abc123';
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        type: 'url_verification',
        challenge,
        token: 'some-token',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.challenge).toBe(challenge);
  });

  // =========================================================================
  // Bonus: reaction_added event
  // =========================================================================
  it('dispatches reaction_added event when reaction is added via admin', async () => {
    const receivedEvents: any[] = [];
    const callbackServer = await createCallbackServer((body) => {
      receivedEvents.push(body);
    });
    const callbackPort = (callbackServer.address() as any).port;

    try {
      app.slackStateManager.createEventSubscription(
        'A_TWIN',
        `http://localhost:${callbackPort}/events`,
        ['reaction_added']
      );

      // Post a message first
      const postRes = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'react to this',
      });
      const ts = JSON.parse(postRes.body).ts;

      // Add reaction via admin
      const reactRes = await app.inject({
        method: 'POST',
        url: '/admin/reactions/add',
        payload: {
          message_ts: ts,
          channel: 'C_GENERAL',
          user_id: 'U_BOT_TWIN',
          reaction: 'thumbsup',
        },
      });
      expect(JSON.parse(reactRes.body).ok).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 50));

      const reactionEvents = receivedEvents.filter(e => e.event?.type === 'reaction_added');
      expect(reactionEvents.length).toBe(1);
      expect(reactionEvents[0].event.reaction).toBe('thumbsup');
      expect(reactionEvents[0].event.item.ts).toBe(ts);
    } finally {
      callbackServer.close();
    }
  });
});

// =========================================================================
// Helper: Create a local HTTP server to receive webhooks
// =========================================================================
function createCallbackServer(
  onBody: (body: any) => void
): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let data = '';
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      req.on('end', () => {
        try {
          // Try to parse as JSON first
          const parsed = JSON.parse(data);
          onBody(parsed);
        } catch {
          // Try form-encoded (interaction payloads)
          const params = new URLSearchParams(data);
          const payload = params.get('payload');
          if (payload) {
            try {
              onBody(JSON.parse(payload));
            } catch {
              onBody(data);
            }
          } else {
            onBody(data);
          }
        }
        res.writeHead(200);
        res.end('ok');
      });
    });
    server.listen(0, () => resolve(server));
  });
}
