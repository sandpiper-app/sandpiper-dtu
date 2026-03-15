/**
 * Phase 41 — RED contracts for currently open Slack regressions.
 *
 * This file creates explicit failing contracts for the open Slack regression clusters
 * so later plans have exact targets and cannot claim success by inference.
 *
 * ALL tests must FAIL on the current branch with assertion-style failures.
 * None should fail with SyntaxError, module-load errors, or fixture crashes.
 *
 * Regressions under contract:
 *   1-3. users.setPhoto / files.getUploadURLExternal / search.files: missing catalog entry
 *        means scope is NOT enforced even for chat:write-only tokens (method-scopes.ts)
 *   4.   files.getUploadURLExternal: must return absolute upload_url and reject missing args
 *   5.   files.completeUploadExternal: must reject empty files array
 *   6-7. oauth.access / oauth.v2.exchange: accept any client_secret without validation
 *   8.   openid.connect.token: unknown client_id accepted with any non-empty secret
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetSlack, seedSlackChannel } from '../setup/seeders.js';

function slackUrl(): string {
  return process.env.SLACK_API_URL!;
}

/**
 * Seed a narrow-scope token directly through POST /admin/tokens.
 * Returns the seeded token value.
 */
async function seedNarrowToken(token: string, scope: string): Promise<void> {
  const res = await fetch(`${slackUrl()}/admin/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      tokenType: 'bot',
      teamId: 'T_TWIN',
      userId: 'U_NARROW_TWIN',
      scope,
      appId: 'A_TWIN',
    }),
  });
  if (!res.ok) {
    throw new Error(`seedNarrowToken: POST /admin/tokens failed with ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Missing scope enforcement (tests 1–3)
// ---------------------------------------------------------------------------

describe('Slack regression contracts — Phase 41 (scope enforcement)', () => {
  const NARROW_TOKEN = 'xoxb-narrow-scope-token';

  beforeEach(async () => {
    await resetSlack();
    // Seed a narrow-scope token with only chat:write — must fail all non-chat scope checks
    await seedNarrowToken(NARROW_TOKEN, 'chat:write');
  });

  it('users.setPhoto returns missing_scope for a token seeded with chat:write only', async () => {
    const res = await fetch(`${slackUrl()}/api/users.setPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NARROW_TOKEN}`,
      },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: users.setPhoto is NOT in METHOD_SCOPES catalog, so checkScope returns null
    // and the method succeeds with ok:true instead of returning missing_scope.
    // After the fix, users.setPhoto must require users.profile:write scope.
    expect(body).toMatchObject({ ok: false, error: 'missing_scope' });
  });

  it('files.getUploadURLExternal returns missing_scope for a token seeded with chat:write only', async () => {
    const res = await fetch(`${slackUrl()}/api/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NARROW_TOKEN}`,
      },
      body: JSON.stringify({ filename: 'test.txt', length: 4 }),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: files.getUploadURLExternal is NOT in METHOD_SCOPES catalog.
    // Currently no scope check is applied — the endpoint returns ok:true.
    // After the fix, it must require files:write scope.
    expect(body).toMatchObject({ ok: false, error: 'missing_scope' });
  });

  it('search.files returns missing_scope for a token seeded with chat:write only', async () => {
    const res = await fetch(`${slackUrl()}/api/search.files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NARROW_TOKEN}`,
      },
      body: JSON.stringify({ query: 'test' }),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: search.files is NOT in METHOD_SCOPES catalog.
    // Currently no scope check is applied — the endpoint returns ok:true.
    // After the fix, it must require search:read scope.
    expect(body).toMatchObject({ ok: false, error: 'missing_scope' });
  });
});

// ---------------------------------------------------------------------------
// files.getUploadURLExternal URL shape and argument validation (test 4)
// ---------------------------------------------------------------------------

describe('Slack regression contracts — Phase 41 (files.getUploadURLExternal)', () => {
  const BROAD_TOKEN = 'xoxb-broad-scope-test-token';

  beforeEach(async () => {
    await resetSlack();
    // Seed a broad-scope token — this test does not exercise scope enforcement
    const res = await fetch(`${slackUrl()}/admin/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: BROAD_TOKEN,
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_BOT_TWIN',
        scope: 'files:write,files:read,chat:write',
        appId: 'A_TWIN',
      }),
    });
    if (!res.ok) throw new Error(`seed broad token failed: ${res.status}`);
  });

  it('files.getUploadURLExternal returns an absolute upload_url and rejects missing filename or length', async () => {
    // A valid call must return upload_url starting with http:// or https://
    const validRes = await fetch(`${slackUrl()}/api/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BROAD_TOKEN}`,
      },
      body: JSON.stringify({ filename: 'hello.txt', length: 5 }),
    });
    const validBody = await validRes.json() as { ok: boolean; upload_url?: string };

    // upload_url must be absolute (start with http:// or https://)
    // This test will fail if SLACK_API_URL is not set in the runtime environment,
    // causing upload_url to be relative (e.g. '/api/_upload/...').
    expect(validBody.ok).toBe(true);
    expect(validBody.upload_url).toMatch(/^https?:\/\//);

    // Call missing filename — must fail with invalid_arguments
    const noFilenameRes = await fetch(`${slackUrl()}/api/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BROAD_TOKEN}`,
      },
      body: JSON.stringify({ length: 5 }),
    });
    const noFilenameBody = await noFilenameRes.json() as { ok: boolean; error?: string };

    // RED: the twin currently does not validate filename/length — it generates an upload_url
    // regardless of whether filename is provided. After the fix, missing filename must
    // return invalid_arguments.
    expect(noFilenameBody).toMatchObject({ ok: false, error: 'invalid_arguments' });

    // Call missing length — must fail with invalid_arguments
    const noLengthRes = await fetch(`${slackUrl()}/api/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BROAD_TOKEN}`,
      },
      body: JSON.stringify({ filename: 'hello.txt' }),
    });
    const noLengthBody = await noLengthRes.json() as { ok: boolean; error?: string };
    expect(noLengthBody).toMatchObject({ ok: false, error: 'invalid_arguments' });
  });
});

// ---------------------------------------------------------------------------
// files.completeUploadExternal empty files rejection (test 5)
// ---------------------------------------------------------------------------

describe('Slack regression contracts — Phase 41 (files.completeUploadExternal)', () => {
  const BROAD_TOKEN = 'xoxb-complete-upload-token';

  beforeEach(async () => {
    await resetSlack();
    const res = await fetch(`${slackUrl()}/admin/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: BROAD_TOKEN,
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_BOT_TWIN',
        scope: 'files:write,files:read,chat:write',
        appId: 'A_TWIN',
      }),
    });
    if (!res.ok) throw new Error(`seed broad token failed: ${res.status}`);
  });

  it('files.completeUploadExternal rejects an empty files array', async () => {
    const res = await fetch(`${slackUrl()}/api/files.completeUploadExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BROAD_TOKEN}`,
      },
      body: JSON.stringify({ files: [] }),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: The twin currently returns ok:true with files:[] or attempts to process an empty
    // filesArray, returning { ok: true, files: [], response_metadata: {} }.
    // After the fix, an empty files array must return { ok: false, error: 'invalid_arguments' }.
    expect(body).toMatchObject({ ok: false, error: 'invalid_arguments' });
  });
});

// ---------------------------------------------------------------------------
// OAuth credential validation (tests 6–8)
// ---------------------------------------------------------------------------

describe('Slack regression contracts — Phase 41 (OAuth credential validation)', () => {
  beforeEach(async () => {
    await resetSlack();
  });

  it('oauth.access rejects an invalid client secret', async () => {
    const res = await fetch(`${slackUrl()}/api/oauth.access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test',
        client_secret: 'WRONG_SECRET_THAT_SHOULD_FAIL',
        code: 'some-code',
      }),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: oauth.access currently ignores client_secret entirely — it returns ok:true
    // for any non-empty client_id regardless of the provided secret.
    // After the fix, a wrong client_secret for a known client_id must return invalid_client.
    expect(body).toMatchObject({ ok: false, error: 'invalid_client' });
  });

  it('oauth.v2.exchange rejects an invalid client secret', async () => {
    const res = await fetch(`${slackUrl()}/api/oauth.v2.exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test',
        client_secret: 'WRONG_SECRET_THAT_SHOULD_FAIL',
        token: 'xoxb-test-token',
      }),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: oauth.v2.exchange currently ignores client_secret entirely — it returns ok:true
    // for any non-empty client_id regardless of the provided secret.
    // After the fix, a wrong client_secret for a known client_id must return invalid_client.
    expect(body).toMatchObject({ ok: false, error: 'invalid_client' });
  });

  it('openid.connect.token rejects an unknown client_id and wrong secret', async () => {
    const res = await fetch(`${slackUrl()}/api/openid.connect.token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'totally-unknown-client-id-xyz',
        client_secret: 'any-secret-at-all',
        code: 'some-code',
      }),
    });
    const body = await res.json() as { ok: boolean; error?: string };

    // RED: openid.connect.token currently accepts unknown client_ids with any non-empty
    // client_secret — the OIDC_CLIENT_SECRETS map is checked only for known IDs,
    // so unknown IDs pass through. After the fix, unknown client_ids must be rejected
    // with invalid_client.
    expect(body).toMatchObject({ ok: false, error: 'invalid_client' });
  });
});
