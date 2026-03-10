/**
 * Smoke tests for Slack twin foundation
 * Validates health, admin, and OAuth endpoints work correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Slack Twin Smoke Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok and twin slack', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.twin).toBe('slack');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /admin/reset', () => {
    it('returns reset:true and clears state', async () => {
      const res = await app.inject({ method: 'POST', url: '/admin/reset' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.reset).toBe(true);
      expect(body.timestamp).toBeGreaterThan(0);
    });

    it('re-seeds defaults after reset', async () => {
      await app.inject({ method: 'POST', url: '/admin/reset' });
      const state = await app.inject({ method: 'GET', url: '/admin/state' });
      const body = JSON.parse(state.body);
      // Default team, bot user, and general channel seeded
      expect(body.channels).toBe(1); // C_GENERAL
      expect(body.users).toBe(1); // U_BOT_TWIN
    });
  });

  describe('GET /admin/state', () => {
    it('returns counts for all entity types', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/state' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('channels');
      expect(body).toHaveProperty('users');
      expect(body).toHaveProperty('messages');
      expect(body).toHaveProperty('tokens');
      expect(body).toHaveProperty('event_subscriptions');
    });

    it('shows default seeded entities', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/state' });
      const body = JSON.parse(res.body);
      expect(body.channels).toBe(1); // C_GENERAL
      expect(body.users).toBe(1); // U_BOT_TWIN
      expect(body.messages).toBe(0);
      expect(body.tokens).toBe(0);
    });
  });

  describe('POST /admin/fixtures/load', () => {
    it('loads channels, users, and messages', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/fixtures/load',
        payload: {
          channels: [{ name: 'test-channel' }],
          users: [{ name: 'test-user', team_id: 'T_TWIN' }],
          messages: [{ text: 'hello', channel_id: 'C_GENERAL' }],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.loaded.channels).toBe(1);
      expect(body.loaded.users).toBe(1);
      expect(body.loaded.messages).toBe(1);

      // Verify state updated
      const state = await app.inject({ method: 'GET', url: '/admin/state' });
      const stateBody = JSON.parse(state.body);
      expect(stateBody.channels).toBe(2); // C_GENERAL + test-channel
      expect(stateBody.users).toBe(2); // U_BOT_TWIN + test-user
      expect(stateBody.messages).toBe(1);
    });
  });

  describe('POST /api/oauth.v2.access', () => {
    // Helper: obtain a valid one-time authorization code from the authorize endpoint
    async function getAuthCode() {
      const authzRes = await app.inject({
        method: 'GET',
        url: '/oauth/v2/authorize?client_id=test&scope=chat:write&redirect_uri=https://localhost/callback&state=test',
      });
      return new URL(authzRes.headers.location as string).searchParams.get('code') as string;
    }

    it('exchanges code for bot and user tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/oauth.v2.access',
        payload: { code: await getAuthCode() },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.access_token).toMatch(/^xoxb-/);
      expect(body.token_type).toBe('bot');
      expect(body.bot_user_id).toBe('U_BOT_TWIN');
      expect(body.app_id).toBe('A_TWIN');
      expect(body.team.id).toBe('T_TWIN');
      expect(body.authed_user.access_token).toMatch(/^xoxp-/);
      expect(body.authed_user.token_type).toBe('user');
    });

    it('stores tokens in state', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/oauth.v2.access',
        payload: { code: await getAuthCode() },
      });
      const state = await app.inject({ method: 'GET', url: '/admin/state' });
      const body = JSON.parse(state.body);
      expect(body.tokens).toBe(2); // bot + user tokens
    });
  });

  describe('Default seeding', () => {
    it('has T_TWIN team', () => {
      const team = app.slackStateManager.getTeam('T_TWIN');
      expect(team).toBeTruthy();
      expect(team.name).toBe('Twin Workspace');
      expect(team.domain).toBe('twin-workspace');
    });

    it('has U_BOT_TWIN user', () => {
      const user = app.slackStateManager.getUser('U_BOT_TWIN');
      expect(user).toBeTruthy();
      expect(user.name).toBe('twin-bot');
      expect(user.is_bot).toBe(1);
    });

    it('has C_GENERAL channel', () => {
      const channel = app.slackStateManager.getChannel('C_GENERAL');
      expect(channel).toBeTruthy();
      expect(channel.name).toBe('general');
      expect(channel.creator).toBe('U_BOT_TWIN');
    });
  });
});
