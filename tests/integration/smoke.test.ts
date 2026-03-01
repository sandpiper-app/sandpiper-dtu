/**
 * Integration smoke tests for DTU twins.
 *
 * Validates both twins respond to the same HTTP patterns Sandpiper's
 * IntegrationClient uses. Tests exercise health, OAuth, API, admin, and
 * UI endpoints — proving the base URL swap mechanism works (INTG-01).
 *
 * Base URLs are read from environment variables:
 *   SHOPIFY_API_URL  (default: derived from in-process twin)
 *   SLACK_API_URL    (default: derived from in-process twin)
 *
 * When env vars are NOT set, twins are started in-process on random ports
 * via buildApp() — enabling `pnpm exec vitest run tests/integration/smoke.test.ts`
 * to work without Docker.
 *
 * When env vars ARE set (CI with Docker), the tests target those URLs directly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let shopifyApp: any = null;
let slackApp: any = null;
let shopifyBaseUrl: string;
let slackBaseUrl: string;

beforeAll(async () => {
  const shopifyEnvUrl = process.env.SHOPIFY_API_URL;
  const slackEnvUrl = process.env.SLACK_API_URL;

  if (shopifyEnvUrl) {
    // External mode: use env var URLs (Docker containers running)
    shopifyBaseUrl = shopifyEnvUrl.replace(/\/$/, '');
  } else {
    // In-process mode: import via relative path and start on random ports
    const { buildApp } = await import('../../twins/shopify/src/index.js');
    shopifyApp = await buildApp({ logger: false });
    await shopifyApp.listen({ port: 0, host: '127.0.0.1' });
    const shopifyAddr = shopifyApp.addresses()[0];
    shopifyBaseUrl = `http://127.0.0.1:${shopifyAddr.port}`;
  }

  if (slackEnvUrl) {
    slackBaseUrl = slackEnvUrl.replace(/\/$/, '');
  } else {
    const { buildApp } = await import('../../twins/slack/src/index.js');
    slackApp = await buildApp({ logger: false });
    await slackApp.listen({ port: 0, host: '127.0.0.1' });
    const slackAddr = slackApp.addresses()[0];
    slackBaseUrl = `http://127.0.0.1:${slackAddr.port}`;
  }
}, 30_000);

afterAll(async () => {
  if (shopifyApp) await shopifyApp.close();
  if (slackApp) await slackApp.close();
});

describe('Shopify Twin Smoke Tests', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${shopifyBaseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST /admin/oauth/access_token responds to OAuth token exchange', async () => {
    const res = await fetch(`${shopifyBaseUrl}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'test-code', client_id: 'test', client_secret: 'test' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('access_token');
  });

  it('POST /admin/api/2024-01/graphql.json responds to GraphQL with valid token', async () => {
    // Get a token first
    const tokenRes = await fetch(`${shopifyBaseUrl}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'gql-test-code', client_id: 'test', client_secret: 'test' }),
    });
    const { access_token } = await tokenRes.json();

    const res = await fetch(`${shopifyBaseUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': access_token,
      },
      body: JSON.stringify({ query: '{ shop { name } }' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // GraphQL should return data (or errors), not HTTP errors
    expect(body).toBeDefined();
  });

  it('POST /admin/reset resets twin state', async () => {
    const res = await fetch(`${shopifyBaseUrl}/admin/reset`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reset).toBe(true);
  });

  it('GET /ui serves the web interface', async () => {
    const res = await fetch(`${shopifyBaseUrl}/ui`);
    // UI redirects or renders a page
    expect([200, 302]).toContain(res.status);
  });
});

describe('Slack Twin Smoke Tests', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${slackBaseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST /api/oauth.v2.access responds to OAuth token exchange', async () => {
    const res = await fetch(`${slackBaseUrl}/api/oauth.v2.access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'code=test-code&client_id=test&client_secret=test',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Slack returns ok:true with token or ok:false with error
    expect(body).toHaveProperty('ok');
  });

  it('POST /api/chat.postMessage responds with valid token', async () => {
    // Get a token first via OAuth
    const tokenRes = await fetch(`${slackBaseUrl}/api/oauth.v2.access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'code=chat-test-code&client_id=test&client_secret=test',
    });
    const tokenBody = await tokenRes.json();
    const token = tokenBody.access_token || tokenBody.authed_user?.access_token || 'xoxb-test';

    const res = await fetch(`${slackBaseUrl}/api/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: 'C_GENERAL', text: 'smoke test message' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should return ok:true or ok:false with specific error
    expect(body).toHaveProperty('ok');
  });

  it('POST /admin/reset resets twin state', async () => {
    const res = await fetch(`${slackBaseUrl}/admin/reset`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reset).toBe(true);
  });

  it('GET /ui serves the web interface', async () => {
    const res = await fetch(`${slackBaseUrl}/ui`);
    // UI redirects or renders a page
    expect([200, 302]).toContain(res.status);
  });
});

describe('Cross-Twin: Base URL Swap Validation', () => {
  it('SHOPIFY_API_URL and SLACK_API_URL env vars configure target URLs', () => {
    // This test documents and validates the env var mechanism
    // In CI: env vars point to Docker containers
    // In local dev: env vars are absent, twins start in-process
    expect(shopifyBaseUrl).toBeDefined();
    expect(slackBaseUrl).toBeDefined();
    expect(shopifyBaseUrl).toMatch(/^https?:\/\//);
    expect(slackBaseUrl).toMatch(/^https?:\/\//);
    // URLs must be different (different twins)
    expect(shopifyBaseUrl).not.toBe(slackBaseUrl);
  });
});
