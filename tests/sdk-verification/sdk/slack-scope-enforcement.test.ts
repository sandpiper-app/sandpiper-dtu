/**
 * SLCK-15, SLCK-18, SLCK-19: Scope enforcement and OAuth header tests
 *
 * Wave 0 failing tests — covers chat.update/delete ownership enforcement,
 * token scope validation, and OAuth response header assertions.
 *
 * Expected state: ALL tests FAIL against the current implementation.
 * Plans 02 and 03 will implement the enforcement to make these pass.
 *
 * SLCK-15: chat.update and chat.delete enforce channel + userId ownership
 *   - 15a: update with wrong channel → cant_update_message
 *   - 15b: update by different userId (attacker) → cant_update_message
 *   - 15c: delete with wrong channel → cant_delete_message
 *   - 15d: delete by different userId (attacker) → cant_delete_message
 *   - 15e: owner update on correct channel → ok:true (regression guard)
 *
 * SLCK-18: Missing-scope and invalid-argument enforcement
 *   - 18a: narrow-scope token calling chat.postMessage → missing_scope error
 *   - 18b: oauth.v2.access without client_id → invalid_arguments
 *   - 18c: broad-scope token calling chat.postMessage → ok:true (regression guard)
 *   - 18d: narrow chat:write-only token calling conversations.list → missing_scope
 *   - 18e: narrow chat:write-only token calling users.list → missing_scope
 *
 * SLCK-19: OAuth scope headers on successful API responses
 *   - 19a: x-oauth-scopes header is truthy on successful chat.postMessage
 *   - 19b: x-accepted-oauth-scopes is 'chat:write' on chat.postMessage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken, seedSlackChannel } from '../setup/seeders.js';
import { checkScope } from '../../../twins/slack/src/services/method-scopes.js';

// ============================================================================
// checkScope() unit tests — default-deny behavior (Finding #7)
// ============================================================================

describe('checkScope() default-deny behavior', () => {
  it('returns missing_scope for an uncatalogued method', () => {
    const result = checkScope('nonexistent.method', 'read');
    expect(result).toEqual({
      error: 'missing_scope',
      needed: 'unknown (method not in scope catalog)',
      provided: 'read',
    });
  });

  it('returns null for auth.test (explicitly empty scope list)', () => {
    expect(checkScope('auth.test', 'read')).toBeNull();
  });

  it('returns null for chat.postMessage with chat:write scope (regression guard)', () => {
    expect(checkScope('chat.postMessage', 'chat:write')).toBeNull();
  });

  it('returns missing_scope for chat.postMessage with insufficient scope', () => {
    const result = checkScope('chat.postMessage', 'read');
    expect(result).not.toBeNull();
    expect(result?.error).toBe('missing_scope');
    expect(result?.needed).toBe('chat:write');
    expect(result?.provided).toBe('read');
  });
});

// Broad scope string for attacker token (has permission but wrong userId)
const BROAD_SCOPE = 'chat:write,channels:read,channels:history,users:read';

// ============================================================================
// SLCK-15: chat.update / chat.delete ownership enforcement
// ============================================================================

describe('SLCK-15: chat.update / chat.delete ownership enforcement', () => {
  let ownerToken: string;
  let attackerToken: string;
  let channelId: string;
  let otherChannelId: string;
  let messageTs: string;

  beforeEach(async () => {
    await resetSlack();

    // Seed the primary channel for the owner's message
    channelId = await seedSlackChannel('scope-test');

    // Seed a second channel to test cross-channel violations
    otherChannelId = await seedSlackChannel('other');

    // Seed the owner token — userId is U_BOT_TWIN (default in seedSlackBotToken)
    ownerToken = await seedSlackBotToken('xoxb-owner');

    // Seed the attacker token — different userId, same broad scope
    const slackUrl = process.env.SLACK_API_URL!;
    await fetch(slackUrl + '/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'xoxb-attacker',
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_ATTACKER',
        scope: BROAD_SCOPE,
        appId: 'A_TWIN',
      }),
    });
    attackerToken = 'xoxb-attacker';

    // Post a message as owner to channelId
    const ownerClient = createSlackClient(ownerToken);
    const postResult = await ownerClient.chat.postMessage({ channel: channelId, text: 'original message' });
    messageTs = postResult.ts!;
  });

  // SLCK-15a: chat.update with wrong channel returns cant_update_message
  it('SLCK-15a: chat.update with wrong channel returns cant_update_message', async () => {
    const ownerClient = createSlackClient(ownerToken);
    // Owner updates their message but sends to wrong channel
    // WebClient throws on ok:false — catch the error and assert its data field
    let thrownError: any;
    try {
      await ownerClient.chat.update({
        channel: otherChannelId,
        ts: messageTs,
        text: 'updated text',
      });
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.data?.error).toBe('cant_update_message');
  });

  // SLCK-15b: chat.update by different userId returns cant_update_message
  it('SLCK-15b: chat.update by different userId returns cant_update_message', async () => {
    const attackerClient = createSlackClient(attackerToken);
    // Attacker tries to update owner's message on the correct channel
    let thrownError: any;
    try {
      await attackerClient.chat.update({
        channel: channelId,
        ts: messageTs,
        text: 'attacker text',
      });
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.data?.error).toBe('cant_update_message');
  });

  // SLCK-15c: chat.delete with wrong channel returns cant_delete_message
  it('SLCK-15c: chat.delete with wrong channel returns cant_delete_message', async () => {
    const ownerClient = createSlackClient(ownerToken);
    // Owner deletes their message but sends to wrong channel
    let thrownError: any;
    try {
      await ownerClient.chat.delete({
        channel: otherChannelId,
        ts: messageTs,
      });
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.data?.error).toBe('cant_delete_message');
  });

  // SLCK-15d: chat.delete by different userId returns cant_delete_message
  it('SLCK-15d: chat.delete by different userId returns cant_delete_message', async () => {
    const attackerClient = createSlackClient(attackerToken);
    // Attacker tries to delete owner's message on the correct channel
    let thrownError: any;
    try {
      await attackerClient.chat.delete({
        channel: channelId,
        ts: messageTs,
      });
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.data?.error).toBe('cant_delete_message');
  });

  // SLCK-15e: owner update on correct channel succeeds (regression guard)
  it('SLCK-15e: owner update on correct channel succeeds (regression guard)', async () => {
    const ownerClient = createSlackClient(ownerToken);
    // Owner updates their own message on the correct channel — must still work
    const result = await ownerClient.chat.update({
      channel: channelId,
      ts: messageTs,
      text: 'owner updated text',
    });
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// SLCK-18: Missing-scope enforcement and oauth.v2.access validation
// ============================================================================

describe('SLCK-18: Missing-scope enforcement', () => {
  let broadToken: string;
  let narrowToken: string;
  let channelId: string;

  beforeEach(async () => {
    await resetSlack();

    // Seed a channel for test messages
    channelId = await seedSlackChannel('scope-channel');

    // Seed a narrow-scope token — only channels:read, not chat:write
    const slackUrl = process.env.SLACK_API_URL!;
    await fetch(slackUrl + '/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'xoxb-narrow',
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_NARROW',
        scope: 'channels:read',
        appId: 'A_TWIN',
      }),
    });
    narrowToken = 'xoxb-narrow';

    // Seed a broad-scope token for regression guard
    broadToken = await seedSlackBotToken('xoxb-broad');
  });

  // SLCK-18a: narrow-scope token calling chat.postMessage returns missing_scope
  it('SLCK-18a: token with scope channels:read calling chat.postMessage returns missing_scope', async () => {
    const slackUrl = process.env.SLACK_API_URL!;
    const res = await fetch(slackUrl + '/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${narrowToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text: 'should fail' }),
    });
    const body = await res.json() as { ok: boolean; error?: string; needed?: string; provided?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_scope');
    expect(body.needed).toBe('chat:write');
    expect(body.provided).toBe('channels:read');
  });

  // SLCK-18b: oauth.v2.access POST without client_id returns invalid_arguments
  it('SLCK-18b: oauth.v2.access without client_id returns invalid_arguments', async () => {
    const slackUrl = process.env.SLACK_API_URL!;
    const res = await fetch(slackUrl + '/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_arguments');
  });

  // SLCK-18c: broad-scope token calling chat.postMessage still succeeds (regression guard)
  it('SLCK-18c: broad-scope token calling chat.postMessage succeeds (regression guard)', async () => {
    const broadClient = createSlackClient(broadToken);
    const result = await broadClient.chat.postMessage({ channel: channelId, text: 'regression check' });
    expect(result.ok).toBe(true);
    expect(typeof result.ts).toBe('string');
  });

  // SLCK-18d: chat:write-only token calling conversations.list returns missing_scope
  it('SLCK-18d: chat:write-only token calling conversations.list returns missing_scope', async () => {
    const slackUrl = process.env.SLACK_API_URL!;
    // Seed a token with only chat:write (not channels:read)
    await fetch(slackUrl + '/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'xoxb-chat-only',
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_CHAT_ONLY',
        scope: 'chat:write',
        appId: 'A_TWIN',
      }),
    });

    const res = await fetch(slackUrl + '/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-chat-only',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { ok: boolean; error?: string; needed?: string; provided?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_scope');
    expect(body.needed).toBe('channels:read');
    expect(body.provided).toBe('chat:write');
  });

  // SLCK-18e: chat:write-only token calling users.list returns missing_scope
  it('SLCK-18e: chat:write-only token calling users.list returns missing_scope', async () => {
    const slackUrl = process.env.SLACK_API_URL!;
    // Re-seed the chat-only token (state reset per beforeEach)
    await fetch(slackUrl + '/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'xoxb-chat-only',
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_CHAT_ONLY',
        scope: 'chat:write',
        appId: 'A_TWIN',
      }),
    });

    const res = await fetch(slackUrl + '/api/users.list', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-chat-only',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { ok: boolean; error?: string; needed?: string; provided?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_scope');
    expect(body.needed).toBe('users:read');
    expect(body.provided).toBe('chat:write');
  });

  // SLCK-18f: oauth.v2.access with mismatched redirect_uri returns redirect_uri_mismatch
  it('SLCK-18f: oauth.v2.access with redirect_uri that does not match authorize-time value returns redirect_uri_mismatch', async () => {
    const slackUrl = process.env.SLACK_API_URL!;

    // Step 1: Authorize with redirect_uri=http://localhost/correct
    const authorizeRes = await fetch(
      slackUrl + '/oauth/v2/authorize?client_id=test-client&scope=chat:write&redirect_uri=http%3A%2F%2Flocalhost%2Fcorrect&state=test',
      { method: 'GET', redirect: 'manual' }
    );
    // Extract code from the redirect Location header
    const location = authorizeRes.headers.get('location') ?? '';
    const codeMatch = location.match(/[?&]code=([^&]+)/);
    expect(codeMatch).not.toBeNull();
    const code = codeMatch![1];

    // Step 2: Exchange with a DIFFERENT redirect_uri — must fail
    const res = await fetch(slackUrl + '/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: 'test-client',
        redirect_uri: 'http://localhost/wrong',  // mismatch
      }),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('redirect_uri_mismatch');
  });

  // SLCK-18g: GET /oauth/v2/authorize without scope returns invalid_scope
  it('SLCK-18g: GET /oauth/v2/authorize without scope parameter returns invalid_scope', async () => {
    const slackUrl = process.env.SLACK_API_URL!;

    // Authorize without scope — must be rejected
    const res = await fetch(
      slackUrl + '/oauth/v2/authorize?client_id=test-client&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&state=test',
      { method: 'GET', redirect: 'manual' }
    );
    // Should return 400, not 302
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_scope');
  });
});

// ============================================================================
// SLCK-19: OAuth scope headers on successful API responses
// ============================================================================

describe('SLCK-19: OAuth scope response headers', () => {
  let broadToken: string;
  let channelId: string;

  beforeEach(async () => {
    await resetSlack();
    channelId = await seedSlackChannel('header-test');
    broadToken = await seedSlackBotToken('xoxb-header-test');
  });

  // SLCK-19a: x-oauth-scopes header is truthy on successful chat.postMessage
  it('SLCK-19a: successful chat.postMessage carries x-oauth-scopes header', async () => {
    const slackUrl = process.env.SLACK_API_URL!;
    const res = await fetch(slackUrl + '/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${broadToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text: 'header test message' }),
    });
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    // x-oauth-scopes must be present and non-empty on successful responses
    expect(res.headers.get('x-oauth-scopes')).toBeTruthy();
  });

  // SLCK-19b: x-accepted-oauth-scopes is 'chat:write' on chat.postMessage
  it('SLCK-19b: successful chat.postMessage carries x-accepted-oauth-scopes: chat:write', async () => {
    const slackUrl = process.env.SLACK_API_URL!;
    const res = await fetch(slackUrl + '/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${broadToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text: 'header test message 2' }),
    });
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    // x-accepted-oauth-scopes must reflect the required scope for this method
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('chat:write');
  });
});
