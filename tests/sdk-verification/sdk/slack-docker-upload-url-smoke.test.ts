/**
 * Docker upload URL smoke test — Phase 41 plan 04 (SLCK-22)
 *
 * Verifies that the Docker-composed Slack twin returns an absolute upload_url
 * rooted at the public API base URL when SLACK_API_URL is set.
 *
 * Prerequisites:
 *   - SLACK_API_URL env var must point to the running Slack twin
 *     (e.g. http://localhost:3001 — note: no /api suffix)
 *   - The twin must expose POST /admin/tokens to seed test tokens
 *   - The twin must expose POST /api/files.getUploadURLExternal
 *
 * This test is only meaningful when run against a real twin process (Docker or local).
 * It seeds a token via POST /admin/tokens, then calls files.getUploadURLExternal,
 * and asserts that the returned upload_url starts with the configured base URL's /api/ path.
 */

import { describe, it, expect } from 'vitest';

function slackUrl(): string {
  return process.env.SLACK_API_URL!;
}

describe('Slack Docker upload URL smoke (SLCK-22)', () => {
  it('files.getUploadURLExternal returns absolute upload_url rooted at SLACK_API_URL/api/', async () => {
    const base = slackUrl().replace(/\/api\/?$/, '');

    // Seed a token with files:write scope via the admin endpoint
    const seedToken = `xoxb-docker-smoke-${Date.now()}`;
    const seedRes = await fetch(`${base}/admin/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: seedToken,
        tokenType: 'bot',
        teamId: 'T_TWIN',
        userId: 'U_BOT_TWIN',
        scope: 'files:write,files:read',
        appId: 'A_TWIN',
      }),
    });

    expect(seedRes.ok, `POST /admin/tokens failed with ${seedRes.status}`).toBe(true);

    // Call files.getUploadURLExternal
    const uploadRes = await fetch(`${base}/api/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${seedToken}`,
      },
      body: JSON.stringify({ filename: 'smoke.txt', length: 5 }),
    });

    const body = await uploadRes.json() as { ok: boolean; file_id?: string; upload_url?: string };
    expect(body.ok).toBe(true);

    // The upload_url must be absolute and rooted at the API base
    expect(body.upload_url).toMatch(/^https?:\/\//);
    expect(body.upload_url).toMatch(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/`));
  });
});
