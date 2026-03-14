/**
 * Wave 0 auth/token parity tests for Slack twin (SLCK-20 + SLCK-23)
 *
 * These tests prove the current auth/token defects before Plan 38-02 fixes them:
 * - OIDC tokens are not persisted, so openid.connect.userInfo fails
 * - oauth.v2.access ignores client_secret
 * - oauth.v2.access returns hardcoded scopes, not the authorize-time granted scope
 * - apps.connections.open accepts bot tokens (should only accept xapp tokens)
 * - auth.test collapses user identity into bot identity
 *
 * After Plan 38-02 all six tests must be GREEN.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebClient } from '@slack/web-api';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';
import { createSlackClient } from '../helpers/slack-client.js';

const SLACK_API_URL = process.env.SLACK_API_URL!;

// ── helpers ──────────────────────────────────────────────────────────────────

async function authorizeCode(opts: {
  clientId: string;
  scope: string;
  redirectUri: string;
}): Promise<string> {
  const url = new URL(SLACK_API_URL + '/oauth/v2/authorize');
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('scope', opts.scope);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('state', 'wave0-state');
  const res = await fetch(url.toString(), { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error(`authorizeCode: no code in redirect ${location}`);
  return code;
}

async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}): Promise<any> {
  const body: Record<string, string> = {
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  };
  if (opts.redirectUri) body.redirect_uri = opts.redirectUri;
  const res = await fetch(SLACK_API_URL + '/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Slack auth/token parity (SLCK-20 + SLCK-23)', () => {
  beforeEach(async () => {
    await resetSlack();
  });

  it('openid.connect.token round-trips into openid.connect.userInfo using the returned access_token', async () => {
    const client = createSlackClient();
    const oidc = await client.openid.connect.token({
      code: 'oidc-wave0',
      client_id: 'test-client',
      client_secret: 'test-client-secret',
    } as any);
    expect(oidc.ok).toBe(true);
    const oidcClient = new WebClient(oidc.access_token as string, {
      slackApiUrl: SLACK_API_URL.replace(/\/$/, '') + '/api/',
    });
    const userInfo = await oidcClient.openid.connect.userInfo();
    expect(userInfo.ok).toBe(true);
    expect((userInfo as any).sub).toBe('U_AUTHED');
    expect((userInfo as any).email).toBe('authed-user@twin.dev');
  });

  it('oauth.v2.access rejects a mismatched client_secret with invalid_client', async () => {
    const code = await authorizeCode({
      clientId: 'test-client',
      scope: 'openid,channels:read',
      redirectUri: 'http://localhost/slack/oauth_redirect',
    });
    const body = await exchangeCode({
      code,
      clientId: 'test-client',
      clientSecret: 'wrong-client-secret',
      redirectUri: 'http://localhost/slack/oauth_redirect',
    });
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_client');
  });

  it('oauth.v2.access echoes the authorize-time granted scope string in scope and authed_user.scope', async () => {
    const code = await authorizeCode({
      clientId: 'test-client',
      scope: 'channels:read,openid',
      redirectUri: 'http://localhost/slack/oauth_redirect',
    });
    const body = await exchangeCode({
      code,
      clientId: 'test-client',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost/slack/oauth_redirect',
    });
    expect(body.ok).toBe(true);
    expect(body.scope).toBe('channels:read,openid');
    expect(body.authed_user.scope).toBe('channels:read,openid');
  });

  it('apps.connections.open rejects a bot token with connections:write when tokenType is bot', async () => {
    await fetch(SLACK_API_URL + '/admin/set-wss-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'ws://127.0.0.1:3099/socket-mode' }),
    });
    await fetch(SLACK_API_URL + '/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'xoxb-connections-bot',
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_BOT_TWIN',
        scope: 'connections:write',
        appId: 'A_TWIN',
      }),
    });
    const res = await fetch(SLACK_API_URL + '/api/apps.connections.open', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer xoxb-connections-bot',
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json() as any;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_auth');
  });

  it('apps.connections.open returns the seeded WebSocket URL for an xapp token with connections:write', async () => {
    await fetch(SLACK_API_URL + '/admin/set-wss-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'ws://127.0.0.1:3099/socket-mode' }),
    });
    await fetch(SLACK_API_URL + '/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'xapp-1-A_TWIN-wave0',
        tokenType: 'app',
        teamId: 'T_TWIN',
        userId: 'U_APP_TWIN',
        scope: 'connections:write',
        appId: 'A_TWIN',
      }),
    });
    const res = await fetch(SLACK_API_URL + '/api/apps.connections.open', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer xapp-1-A_TWIN-wave0',
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.url).toBe('ws://127.0.0.1:3099/socket-mode');
  });

  it('auth.test returns bot identity for xoxb token and user identity for oauth.v2.access authed_user token', async () => {
    await seedSlackBotToken('xoxb-bot-auth-parity');

    const code = await authorizeCode({
      clientId: 'test',
      scope: 'chat:write',
      redirectUri: 'https://localhost/callback',
    });
    const exchangeBody = await exchangeCode({
      code,
      clientId: 'test',
      clientSecret: 'test',
      redirectUri: 'https://localhost/callback',
    });
    expect(exchangeBody.ok).toBe(true);
    const userToken = exchangeBody.authed_user.access_token;

    // Bot identity check
    const botRes = await fetch(SLACK_API_URL + '/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer xoxb-bot-auth-parity',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const botBody = await botRes.json() as any;
    expect(botBody.ok).toBe(true);
    expect(botBody.user).toBe('bot');
    expect(botBody.user_id).toBe('U_BOT_TWIN');
    expect(botBody.bot_id).toBe('B_BOT_TWIN');

    // User identity check
    const userRes = await fetch(SLACK_API_URL + '/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const userBody = await userRes.json() as any;
    expect(userBody.ok).toBe(true);
    expect(userBody.user).toBe('authed-user');
    expect(userBody.user_id).toBe('U_AUTHED');
    expect(userBody.bot_id).toBeUndefined();
  });
});
