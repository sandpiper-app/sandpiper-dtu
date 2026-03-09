/**
 * Shared fixture seeding helpers for sdk-verification tests.
 *
 * Call these in beforeEach hooks to reset state and seed test data.
 * Both reset helpers POST to /admin/reset, which triggers state manager
 * reset + rate limiter reset on each twin.
 */

/** Reset Shopify twin state to default seed data. Call in beforeEach. */
export async function resetShopify(): Promise<void> {
  await fetch(process.env.SHOPIFY_API_URL! + '/admin/reset', { method: 'POST' });
}

/** Reset Slack twin state to default seed data. Call in beforeEach. */
export async function resetSlack(): Promise<void> {
  await fetch(process.env.SLACK_API_URL! + '/admin/reset', { method: 'POST' });
}

/**
 * Obtain a valid access token from the Shopify twin via the OAuth endpoint.
 *
 * The Shopify twin validates tokens via token-validator.ts which checks
 * StateManager. Hardcoded tokens like 'test-access-token' will fail auth
 * unless seeded. This function obtains a real token through the twin's
 * OAuth endpoint, ensuring it's stored in state and accepted by all
 * authenticated endpoints.
 */
export async function seedShopifyAccessToken(): Promise<string> {
  const shopifyUrl = process.env.SHOPIFY_API_URL!;
  const res = await fetch(shopifyUrl + '/admin/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      code: 'test-auth-code',
    }),
  });
  if (!res.ok) {
    throw new Error(
      `seedShopifyAccessToken: POST /admin/oauth/access_token failed with ${res.status}. ` +
      `Ensure the Shopify twin is running and exposes the OAuth endpoint.`
    );
  }
  const body = await res.json() as { access_token: string };
  return body.access_token;
}

/**
 * Seed a channel in the Slack twin and return its ID.
 *
 * Uses the Slack twin's POST /admin/fixtures/load endpoint to create a channel
 * with the given name. Returns the channel ID for use in SDK calls.
 */
export async function seedSlackChannel(name: string): Promise<string> {
  const slackUrl = process.env.SLACK_API_URL!;
  const id = `C_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const res = await fetch(slackUrl + '/admin/fixtures/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channels: [{ id, name }],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `seedSlackChannel: POST /admin/fixtures/load failed with ${res.status}. ` +
      `Ensure the Slack twin is running and exposes /admin/fixtures/load.`
    );
  }
  return id;
}

/**
 * Seed a known bot token in the Slack twin for SDK tests.
 *
 * Uses the Slack twin's POST /admin/tokens endpoint to create a token record
 * with an exact, known value. This bypasses the OAuth flow entirely — the OAuth
 * flow (/api/oauth.v2.access) returns a dynamically generated token that may not
 * match the seeded value, which would cause auth.test to return invalid_auth.
 *
 * If POST /admin/tokens does not exist in the twin, fall back to POST /admin/fixtures
 * with a token payload, or add the endpoint to the twin's admin plugin. The twin's
 * slackStateManager.createToken() is the underlying call — any admin endpoint that
 * invokes it with a deterministic token string is acceptable.
 */
export async function seedSlackBotToken(token = 'xoxb-test-token'): Promise<string> {
  const slackUrl = process.env.SLACK_API_URL!;
  const res = await fetch(slackUrl + '/admin/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      tokenType: 'bot',
      teamId: 'T_TWIN',
      userId: 'U_BOT_TWIN',
      scope: 'chat:write',
      appId: 'A_TWIN',
    }),
  });
  if (!res.ok) {
    throw new Error(
      `seedSlackBotToken: POST /admin/tokens failed with ${res.status}. ` +
      `The Slack twin must expose a POST /admin/tokens endpoint that calls ` +
      `slackStateManager.createToken(). Add this route to twins/slack/src/plugins/admin.ts ` +
      `if it does not exist. Do NOT use /api/oauth.v2.access — it returns a dynamic token ` +
      `that will not match the seeded value.`
    );
  }
  return token;
}
