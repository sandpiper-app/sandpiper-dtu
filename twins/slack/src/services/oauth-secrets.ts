/**
 * Shared Slack OAuth/OIDC client-secret source of truth.
 *
 * Single source used by:
 *   - twins/slack/src/plugins/oauth.ts (POST /api/oauth.v2.access)
 *   - twins/slack/src/plugins/web-api/new-families.ts
 *     (oauth.access, oauth.v2.exchange, openid.connect.token)
 *
 * Any client_id NOT present in this map is treated as an unknown client
 * and must return { ok: false, error: "invalid_client" }.
 */
export const OAUTH_CLIENT_SECRETS: Record<string, string> = {
  'test':               'test',
  'test-client':        'test-client-secret',
  'test-client-id-19':  'test-client-secret-19',
};

/**
 * Validate a client_id + client_secret pair against the known credentials.
 *
 * Returns:
 *   - null          → credentials are valid (client_id known, secret matches)
 *   - 'invalid_client' → client_id is unknown OR secret is wrong/missing
 */
export function validateOAuthCredentials(
  clientId: string | undefined,
  clientSecret: string | undefined,
): 'invalid_client' | null {
  if (!clientId) return 'invalid_client';
  const expected = OAUTH_CLIENT_SECRETS[clientId];
  // Unknown client_id — not in our map
  if (expected === undefined) return 'invalid_client';
  // Known client_id but wrong or missing secret
  if (!clientSecret || clientSecret !== expected) return 'invalid_client';
  return null;
}
