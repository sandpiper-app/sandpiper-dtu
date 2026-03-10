/**
 * Web API integration tests for Slack twin
 * Validates all 7 Web API methods, auth, Block Kit validation, and rate limiting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Slack Web API', () => {
  let app: FastifyInstance;
  let botToken: string;

  beforeEach(async () => {
    app = await buildApp({ logger: false });

    // Get a valid bot token via OAuth (must first get a real code from /oauth/v2/authorize)
    const authzRes = await app.inject({
      method: 'GET',
      url: '/oauth/v2/authorize?client_id=test&scope=chat:write&redirect_uri=https://localhost/callback&state=test',
    });
    const code = new URL(authzRes.headers.location as string).searchParams.get('code');
    const oauthRes = await app.inject({
      method: 'POST',
      url: '/api/oauth.v2.access',
      payload: { code },
    });
    botToken = JSON.parse(oauthRes.body).access_token;
  });

  afterEach(async () => {
    await app.close();
  });

  // Helper to make authenticated requests
  function apiPost(method: string, body: any, token?: string) {
    return app.inject({
      method: 'POST',
      url: `/api/${method}`,
      headers: {
        authorization: `Bearer ${token ?? botToken}`,
      },
      payload: body,
    });
  }

  describe('chat.postMessage', () => {
    it('posts message with text and returns ok:true with ts', async () => {
      const res = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'Hello world',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channel).toBe('C_GENERAL');
      expect(body.ts).toMatch(/^\d+\.\d{6}$/); // epoch.sequence format
      expect(body.message.type).toBe('message');
      expect(body.message.text).toBe('Hello world');
    });

    it('posts message with blocks', async () => {
      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: 'Hello' } },
        { type: 'divider' },
      ];
      const res = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'fallback',
        blocks,
      });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.ts).toBeDefined();
    });

    it('returns not_authed without token (HTTP 200)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/chat.postMessage',
        payload: { channel: 'C_GENERAL', text: 'hi' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('not_authed');
    });

    it('returns invalid_auth with bad token (HTTP 200)', async () => {
      const res = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'hi',
      }, 'bad-token');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_auth');
    });

    it('rejects 51 blocks with invalid_blocks (HTTP 200)', async () => {
      const blocks = Array.from({ length: 51 }, (_, i) => ({
        type: 'section',
        text: { type: 'plain_text', text: `Block ${i}` },
      }));
      const res = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'fallback',
        blocks,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_blocks');
    });

    it('accepts exactly 50 blocks', async () => {
      const blocks = Array.from({ length: 50 }, (_, i) => ({
        type: 'section',
        text: { type: 'plain_text', text: `Block ${i}` },
      }));
      const res = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'fallback',
        blocks,
      });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });

    it('returns channel_not_found for non-existent channel', async () => {
      const res = await apiPost('chat.postMessage', {
        channel: 'C_NONEXISTENT',
        text: 'hi',
      });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('channel_not_found');
    });
  });

  describe('chat.update', () => {
    it('updates an existing message', async () => {
      // Post a message first
      const postRes = await apiPost('chat.postMessage', {
        channel: 'C_GENERAL',
        text: 'original',
      });
      const ts = JSON.parse(postRes.body).ts;

      // Update it
      const res = await apiPost('chat.update', {
        channel: 'C_GENERAL',
        ts,
        text: 'updated',
      });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.text).toBe('updated');
      expect(body.ts).toBe(ts);
    });

    it('returns message_not_found for bad ts', async () => {
      const res = await apiPost('chat.update', {
        channel: 'C_GENERAL',
        ts: '0000000000.000000',
        text: 'nope',
      });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('message_not_found');
    });
  });

  describe('conversations.list', () => {
    it('returns channels with correct format', async () => {
      const res = await apiPost('conversations.list', {});
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channels).toBeInstanceOf(Array);
      expect(body.channels.length).toBeGreaterThanOrEqual(1); // C_GENERAL
      const general = body.channels.find((ch: any) => ch.id === 'C_GENERAL');
      expect(general).toBeTruthy();
      expect(general.name).toBe('general');
      expect(general.is_channel).toBe(true);
      expect(general.topic).toHaveProperty('value');
      expect(general.purpose).toHaveProperty('value');
    });
  });

  describe('conversations.info', () => {
    it('returns channel details', async () => {
      const res = await apiPost('conversations.info', { channel: 'C_GENERAL' });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channel.id).toBe('C_GENERAL');
      expect(body.channel.name).toBe('general');
    });

    it('returns channel_not_found for non-existent channel', async () => {
      const res = await apiPost('conversations.info', { channel: 'C_NOPE' });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('channel_not_found');
    });
  });

  describe('conversations.history', () => {
    it('returns previously posted messages in order', async () => {
      // Post 3 messages
      for (const text of ['first', 'second', 'third']) {
        await apiPost('chat.postMessage', { channel: 'C_GENERAL', text });
      }

      const res = await apiPost('conversations.history', { channel: 'C_GENERAL' });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.messages).toHaveLength(3);
      // Newest first
      expect(body.messages[0].text).toBe('third');
      expect(body.messages[2].text).toBe('first');
      expect(body.has_more).toBe(false);
    });

    it('returns channel_not_found for non-existent channel', async () => {
      const res = await apiPost('conversations.history', { channel: 'C_NOPE' });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('channel_not_found');
    });
  });

  describe('users.list', () => {
    it('returns workspace users', async () => {
      const res = await apiPost('users.list', {});
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.members).toBeInstanceOf(Array);
      expect(body.members.length).toBeGreaterThanOrEqual(1); // U_BOT_TWIN
      const bot = body.members.find((m: any) => m.id === 'U_BOT_TWIN');
      expect(bot).toBeTruthy();
      expect(bot.is_bot).toBe(true);
      expect(bot.profile).toHaveProperty('display_name');
    });
  });

  describe('users.info', () => {
    it('returns user details', async () => {
      const res = await apiPost('users.info', { user: 'U_BOT_TWIN' });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.user.id).toBe('U_BOT_TWIN');
      expect(body.user.name).toBe('twin-bot');
      expect(body.user.is_bot).toBe(true);
    });

    it('returns user_not_found for non-existent user', async () => {
      const res = await apiPost('users.info', { user: 'U_NOPE' });
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('user_not_found');
    });
  });

  describe('Rate Limiting', () => {
    it('returns 429 with Retry-After on rapid calls exceeding tier limit', async () => {
      // conversations.list is tier 2 = 20/min
      const results = [];
      for (let i = 0; i < 22; i++) {
        const res = await apiPost('conversations.list', {});
        results.push({ status: res.statusCode, body: JSON.parse(res.body) });
      }

      // First 20 should succeed
      const successes = results.filter(r => r.status === 200 && r.body.ok === true);
      expect(successes.length).toBe(20);

      // 21st+ should be rate limited
      const limited = results.filter(r => r.status === 429);
      expect(limited.length).toBeGreaterThanOrEqual(1);
      expect(limited[0].body.error).toBe('ratelimited');
    });
  });

  // =========================================================================
  // API Conformance: GET access for read methods
  // =========================================================================
  describe('API Conformance: GET access for read methods', () => {
    it('GET /api/conversations.list with Bearer token returns channels', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/conversations.list',
        headers: { authorization: `Bearer ${botToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channels).toBeInstanceOf(Array);
      expect(body.channels.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/conversations.list without auth returns not_authed', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/conversations.list',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('not_authed');
    });

    it('GET /api/conversations.info?channel=C_GENERAL returns channel data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/conversations.info?channel=C_GENERAL',
        headers: { authorization: `Bearer ${botToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channel.id).toBe('C_GENERAL');
    });

    it('GET /api/conversations.history?channel=C_GENERAL returns messages', async () => {
      // Post a message first
      await apiPost('chat.postMessage', { channel: 'C_GENERAL', text: 'get-history-test' });

      const res = await app.inject({
        method: 'GET',
        url: '/api/conversations.history?channel=C_GENERAL',
        headers: { authorization: `Bearer ${botToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.messages).toBeInstanceOf(Array);
      expect(body.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/users.list with Bearer token returns members', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/users.list',
        headers: { authorization: `Bearer ${botToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.members).toBeInstanceOf(Array);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/users.info?user=U_BOT_TWIN returns user data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/users.info?user=U_BOT_TWIN',
        headers: { authorization: `Bearer ${botToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.user.id).toBe('U_BOT_TWIN');
    });
  });

  // =========================================================================
  // API Conformance: form-urlencoded body support
  // =========================================================================
  describe('API Conformance: form-urlencoded body', () => {
    it('POST /api/chat.postMessage with form-urlencoded body works', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/chat.postMessage',
        headers: {
          authorization: `Bearer ${botToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'channel=C_GENERAL&text=form-urlencoded+message',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.ts).toBeDefined();
    });

    it('POST /api/chat.postMessage with blocks as JSON string in form-urlencoded parses blocks', async () => {
      const blocks = JSON.stringify([{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }]);
      const payload = `channel=C_GENERAL&text=fallback&blocks=${encodeURIComponent(blocks)}`;

      const res = await app.inject({
        method: 'POST',
        url: '/api/chat.postMessage',
        headers: {
          authorization: `Bearer ${botToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });

    it('POST /api/oauth.v2.access with form-urlencoded body works', async () => {
      // Obtain a fresh authorization code via the authorize endpoint
      const authzRes = await app.inject({
        method: 'GET',
        url: '/oauth/v2/authorize?client_id=test&scope=chat:write&redirect_uri=https://localhost/callback&state=test',
      });
      const formCode = new URL(authzRes.headers.location as string).searchParams.get('code') as string;

      const res = await app.inject({
        method: 'POST',
        url: '/api/oauth.v2.access',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `code=${formCode}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.access_token).toMatch(/^xoxb-/);
    });
  });

  // =========================================================================
  // API Conformance: token-in-body and token-in-query auth
  // =========================================================================
  describe('API Conformance: token-in-body and token-in-query auth', () => {
    it('POST /api/conversations.list with token in JSON body (no Bearer header) authenticates', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/conversations.list',
        payload: { token: botToken },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channels).toBeInstanceOf(Array);
    });

    it('GET /api/conversations.list?token=... (no Bearer header) authenticates', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/conversations.list?token=${botToken}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channels).toBeInstanceOf(Array);
    });

    it('POST /api/conversations.list with token in form-urlencoded body authenticates', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/conversations.list',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `token=${botToken}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.channels).toBeInstanceOf(Array);
    });
  });
});
