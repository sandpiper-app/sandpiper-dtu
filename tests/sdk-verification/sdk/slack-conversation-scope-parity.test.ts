/**
 * SLCK-21: Dynamic conversation scope resolution parity
 *
 * Wave 0 tests proving conversations.list/info/history still require all
 * family scopes instead of resolving scopes from request types or channel class.
 *
 * These tests become GREEN after Plan 38-03 implements dynamic scope resolution.
 *
 * Scope matrix:
 *   conversations.list types=public_channel  -> requires channels:read
 *   conversations.list types=private_channel -> requires groups:read
 *   conversations.info on public channel     -> requires channels:read
 *   conversations.info on private channel    -> requires groups:read
 *   conversations.history on DM channel     -> requires im:history
 *   conversations.history on public channel -> requires channels:history
 *   X-Accepted-OAuth-Scopes should reflect only the resolved scope set
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

const SLACK_URL = () => process.env.SLACK_API_URL!;

/** Seed a token with an explicit scope string (not the broad seed). */
async function seedNarrowToken(token: string, scope: string): Promise<void> {
  await fetch(SLACK_URL() + '/admin/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      tokenType: 'bot',
      teamId: 'T_TWIN',
      userId: 'U_SCOPE_TEST',
      scope,
      appId: 'A_TWIN',
    }),
  });
}

/** Load channels with exact IDs and properties into the twin. */
async function seedScopeChannels(): Promise<void> {
  await fetch(SLACK_URL() + '/admin/fixtures/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channels: [
        { id: 'C_SCOPE_PUBLIC',  name: 'scope-public',  is_channel: true,  is_private: false },
        { id: 'G_SCOPE_PRIVATE', name: 'scope-private', is_channel: true,  is_private: true  },
        { id: 'D_SCOPE_DM',      name: 'scope-dm',      is_channel: false, is_private: true  },
        { id: 'G_SCOPE_MPIM',    name: 'scope-mpim',    is_channel: false, is_private: true  },
      ],
    }),
  });
}

describe('SLCK-21: conversations.list dynamic scope resolution', () => {
  beforeEach(async () => {
    await resetSlack();
    await seedScopeChannels();
  });

  it('conversations.list types=public_channel succeeds with channels:read and x-accepted-oauth-scopes=channels:read', async () => {
    await seedNarrowToken('xoxb-channels-read-only', 'channels:read');

    const res = await fetch(SLACK_URL() + '/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-channels-read-only',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ types: 'public_channel' }),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(true);
    // X-Accepted-OAuth-Scopes must reflect only channels:read (not all family scopes)
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('channels:read');
  });

  it('conversations.list without types defaults to public_channel and requires only channels:read', async () => {
    await seedNarrowToken('xoxb-channels-default', 'channels:read');

    const res = await fetch(SLACK_URL() + '/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-channels-default',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    // Default type is public_channel — channels:read alone should be sufficient
    expect(body.ok).toBe(true);
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('channels:read');
  });

  it('conversations.list types=private_channel fails with needed=groups:read when the token only has channels:read', async () => {
    await seedNarrowToken('xoxb-no-groups-read', 'channels:read');

    const res = await fetch(SLACK_URL() + '/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-no-groups-read',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ types: 'private_channel' }),
    });
    const body = await res.json() as { ok: boolean; error?: string; needed?: string; provided?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_scope');
    expect(body.needed).toBe('groups:read');
    expect(body.provided).toBe('channels:read');
  });
});

describe('SLCK-21: conversations.info dynamic scope resolution from channel class', () => {
  beforeEach(async () => {
    await resetSlack();
    await seedScopeChannels();
  });

  it('conversations.info uses channels:read for C_SCOPE_PUBLIC (public channel)', async () => {
    await seedNarrowToken('xoxb-info-channels', 'channels:read');

    const res = await fetch(SLACK_URL() + '/api/conversations.info', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-info-channels',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'C_SCOPE_PUBLIC' }),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(true);
    // X-Accepted-OAuth-Scopes for a public channel info lookup = channels:read only
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('channels:read');
  });

  it('conversations.info uses groups:read for G_SCOPE_PRIVATE (private channel)', async () => {
    await seedNarrowToken('xoxb-info-groups', 'groups:read');

    const res = await fetch(SLACK_URL() + '/api/conversations.info', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-info-groups',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'G_SCOPE_PRIVATE' }),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(true);
    // X-Accepted-OAuth-Scopes for a private channel info lookup = groups:read only
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('groups:read');
  });

  it('conversations.info fails with needed=groups:read for G_SCOPE_PRIVATE when token only has channels:read', async () => {
    await seedNarrowToken('xoxb-info-wrong-scope', 'channels:read');

    const res = await fetch(SLACK_URL() + '/api/conversations.info', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-info-wrong-scope',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'G_SCOPE_PRIVATE' }),
    });
    const body = await res.json() as { ok: boolean; error?: string; needed?: string; provided?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_scope');
    expect(body.needed).toBe('groups:read');
    expect(body.provided).toBe('channels:read');
  });
});

describe('SLCK-21: conversations.history dynamic scope resolution from channel class', () => {
  beforeEach(async () => {
    await resetSlack();
    await seedScopeChannels();
  });

  it('conversations.history uses channels:history for C_SCOPE_PUBLIC (public channel)', async () => {
    await seedNarrowToken('xoxb-history-channels', 'channels:history');

    const res = await fetch(SLACK_URL() + '/api/conversations.history', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-history-channels',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'C_SCOPE_PUBLIC' }),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(true);
    // X-Accepted-OAuth-Scopes for a public channel history = channels:history only
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('channels:history');
  });

  it('conversations.history uses im:history for D_SCOPE_DM (DM channel)', async () => {
    await seedNarrowToken('xoxb-history-im', 'im:history');

    const res = await fetch(SLACK_URL() + '/api/conversations.history', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-history-im',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'D_SCOPE_DM' }),
    });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(true);
    // X-Accepted-OAuth-Scopes for a DM channel history = im:history only
    expect(res.headers.get('x-accepted-oauth-scopes')).toBe('im:history');
  });

  it('conversations.history fails with needed=im:history for D_SCOPE_DM when token only has channels:history', async () => {
    await seedNarrowToken('xoxb-history-wrong', 'channels:history');

    const res = await fetch(SLACK_URL() + '/api/conversations.history', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-history-wrong',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'D_SCOPE_DM' }),
    });
    const body = await res.json() as { ok: boolean; error?: string; needed?: string; provided?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_scope');
    expect(body.needed).toBe('im:history');
    expect(body.provided).toBe('channels:history');
  });
});
