/**
 * UI integration tests for Slack twin.
 * Validates channel list/detail/timeline, user management, message posting,
 * admin dashboard, and static asset serving.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Slack Twin UI', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Navigation', () => {
    it('GET /ui redirects to /ui/channels', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/channels');
    });
  });

  describe('Channels', () => {
    it('GET /ui/channels returns 200 with channel list page including C_GENERAL', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/channels' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Channels');
      expect(res.body).toContain('general');
      expect(res.body).toContain('data-twin="slack"');
    });

    it('POST /ui/channels creates channel and redirects', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/channels',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=test-channel&topic=Testing+topic',
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/channels');

      // Verify channel was created in state
      const channels = app.slackStateManager.listChannels();
      const ch = channels.find((c: any) => c.name === 'test-channel');
      expect(ch).toBeDefined();
      expect(ch.topic).toBe('Testing topic');
    });

    it('POST /ui/channels channel visible through API conversations.list', async () => {
      // First get a token via OAuth (must use a real code from /oauth/v2/authorize)
      const authzRes = await app.inject({
        method: 'GET',
        url: '/oauth/v2/authorize?client_id=test&scope=chat:write&redirect_uri=https://localhost/callback&state=test',
      });
      const authCode = new URL(authzRes.headers.location as string).searchParams.get('code');
      const oauthRes = await app.inject({
        method: 'POST',
        url: '/api/oauth.v2.access',
        payload: { code: authCode },
      });
      const { access_token } = JSON.parse(oauthRes.body);

      // Create channel via UI
      await app.inject({
        method: 'POST',
        url: '/ui/channels',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=api-visible-channel',
      });

      // Verify it shows up in conversations.list API
      const apiRes = await app.inject({
        method: 'POST',
        url: '/api/conversations.list',
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const apiBody = JSON.parse(apiRes.body);
      expect(apiBody.ok).toBe(true);
      const found = apiBody.channels.find((c: any) => c.name === 'api-visible-channel');
      expect(found).toBeDefined();
    });

    it('GET /ui/channels/:id shows channel detail with message timeline', async () => {
      // Seed some messages
      app.slackStateManager.createMessage({
        ts: '1700000001.000001',
        channel_id: 'C_GENERAL',
        user_id: 'U_BOT_TWIN',
        text: 'Hello from twin bot',
      });

      const res = await app.inject({ method: 'GET', url: '/ui/channels/C_GENERAL' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('general');
      expect(res.body).toContain('Hello from twin bot');
      expect(res.body).toContain('Message Timeline');
    });

    it('GET /ui/channels/:id shows raw JSON toggle', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/channels/C_GENERAL' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Raw JSON');
    });

    it('GET /ui/channels/:id has inline Post Message form', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/channels/C_GENERAL' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Post a Message');
      expect(res.body).toContain('Post Message');
    });

    it('POST /ui/channels/:id/message posts message and redirects', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/channels/C_GENERAL/message',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'text=hello+from+ui&user_id=U_BOT_TWIN',
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/channels/C_GENERAL');

      // Verify message was created in state
      const messages = app.slackStateManager.listMessages('C_GENERAL');
      const msg = messages.find((m: any) => m.text === 'hello from ui');
      expect(msg).toBeDefined();
      expect(msg.user_id).toBe('U_BOT_TWIN');
    });

    it('GET /ui/channels/new shows create form', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/channels/new' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('New Channel');
      expect(res.body).toContain('form');
    });

    it('DELETE /ui/channels/:id removes channel and returns empty body', async () => {
      // Create a channel to delete
      const ch = app.slackStateManager.createChannel({
        name: 'to-delete',
        creator: 'U_BOT_TWIN',
      });

      const res = await app.inject({ method: 'DELETE', url: `/ui/channels/${ch.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('');

      // Verify channel is gone
      const channels = app.slackStateManager.listChannels();
      expect(channels.find((c: any) => c.id === ch.id)).toBeUndefined();
    });
  });

  describe('Users', () => {
    it('GET /ui/users returns 200 with user list page including U_BOT_TWIN', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/users' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Users');
      expect(res.body).toContain('twin-bot');
    });

    it('POST /ui/users creates user and redirects', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/users',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=testuser&real_name=Test+User&email=test%40example.com',
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/users');

      // Verify user was created
      const users = app.slackStateManager.listUsers();
      const user = users.find((u: any) => u.name === 'testuser');
      expect(user).toBeDefined();
      expect(user.real_name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
    });

    it('GET /ui/users/:id shows user detail with Raw JSON', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/users/U_BOT_TWIN' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('twin-bot');
      expect(res.body).toContain('Raw JSON');
      expect(res.body).toContain('U_BOT_TWIN');
    });

    it('GET /ui/users/new shows create form', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/users/new' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('New User');
    });

    it('DELETE /ui/users/:id removes user and returns empty body', async () => {
      // Create a user to delete
      const user = app.slackStateManager.createUser({
        name: 'user-to-delete',
        team_id: 'T_TWIN',
      });

      const res = await app.inject({ method: 'DELETE', url: `/ui/users/${user.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('');

      const users = app.slackStateManager.listUsers();
      expect(users.find((u: any) => u.id === user.id)).toBeUndefined();
    });
  });

  describe('Admin', () => {
    it('GET /ui/admin shows state counts', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/admin' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Admin Dashboard');
      expect(res.body).toContain('Channels');
      expect(res.body).toContain('Users');
      expect(res.body).toContain('Messages');
      expect(res.body).toContain('Tokens');
      expect(res.body).toContain('Event Subscriptions');
    });

    it('POST /ui/admin/reset resets state and redirects', async () => {
      // Create some extra state
      app.slackStateManager.createChannel({ name: 'extra-channel', creator: 'U_BOT_TWIN' });

      const res = await app.inject({ method: 'POST', url: '/ui/admin/reset' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/admin');

      // After reset, only the default C_GENERAL should remain
      const channels = app.slackStateManager.listChannels();
      expect(channels.length).toBe(1);
      expect(channels[0].id).toBe('C_GENERAL');
    });

    it('GET /ui/admin/events shows event subscriptions page', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/admin/events' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Event Subscriptions');
    });

    it('load fixtures button creates sample data', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/admin/fixtures',
      });
      expect(res.statusCode).toBe(302);
      // Should have more channels than just the default C_GENERAL
      const channels = app.slackStateManager.listChannels();
      expect(channels.length).toBeGreaterThan(1);
    });
  });

  describe('Static Assets', () => {
    it('GET /ui/static/styles.css returns CSS with twin accent variables', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/static/styles.css' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/css');
      expect(res.body).toContain('--twin-accent');
    });
  });
});
