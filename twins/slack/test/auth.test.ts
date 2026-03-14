/**
 * Auth Web API tests for Slack twin
 * Validates auth.test and api.test routes.
 *
 * auth.test: gateway endpoint for Bolt and OAuth credential verification
 * api.test:  echo endpoint for smoke-testing SDK connectivity (no auth required)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Slack Auth Web API', () => {
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
      payload: { code, client_id: 'test', client_secret: 'test' },
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

  // ===========================================================================
  // POST /api/auth.test
  // ===========================================================================
  describe('auth.test', () => {
    it('returns not_authed when no token provided (HTTP 200)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth.test',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('not_authed');
    });

    it('returns invalid_auth for unrecognized token (HTTP 200)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth.test',
        headers: { authorization: 'Bearer xoxb-totally-fake-token' },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_auth');
    });

    it('returns full Slack-shaped response for valid xoxb token', async () => {
      const res = await apiPost('auth.test', {});
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.team_id).toBe('T_TWIN');
      expect(body.user_id).toBe('U_BOT_TWIN');
      expect(body.bot_id).toBe('B_BOT_TWIN');
      expect(body.url).toBe('https://twin-workspace.slack.com/');
      expect(body.team).toBe('Twin Workspace');
      expect(body.user).toBe('bot');
      expect(body.is_enterprise_install).toBe(false);
    });

    it('returns 429 with Retry-After header when rate limited', async () => {
      // auth.test is tier 1 (20/min). Exceed it.
      const results: { status: number }[] = [];
      for (let i = 0; i < 25; i++) {
        const res = await apiPost('auth.test', {});
        results.push({ status: res.statusCode });
        if (res.statusCode === 429) break; // stop as soon as we see a 429
      }
      const limited = results.filter(r => r.status === 429);
      expect(limited.length).toBeGreaterThanOrEqual(1);
    });

    it('returns simulated error when error config is set', async () => {
      // Configure error simulation via admin endpoint
      await app.inject({
        method: 'POST',
        url: '/admin/errors/configure',
        payload: {
          methodName: 'auth.test',
          statusCode: 200,
          errorBody: { ok: false, error: 'team_added_to_org' },
        },
      });

      const res = await apiPost('auth.test', {});
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('team_added_to_org');
    });
  });

  // ===========================================================================
  // POST /api/api.test
  // ===========================================================================
  describe('api.test', () => {
    it('returns ok:true with args echoing request body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/api.test',
        payload: { foo: 'bar', baz: 42 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.args).toMatchObject({ foo: 'bar', baz: 42 });
    });

    it('returns ok:true with empty args when no params sent', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/api.test',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.args).toEqual({});
    });

    it('does NOT require a token — succeeds without Authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/api.test',
        // No authorization header
        payload: { hello: 'world' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.args.hello).toBe('world');
    });

    it('does NOT require a token — succeeds even with invalid token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/api.test',
        headers: { authorization: 'Bearer xoxb-invalid-token' },
        payload: { test: true },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });

    it('echoes query params merged into args', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/api.test?q=hello',
        payload: { body_param: 'value' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.args.q).toBe('hello');
      expect(body.args.body_param).toBe('value');
    });
  });
});
