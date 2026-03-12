import { createAdminApiClient } from '@shopify/admin-api-client';

/**
 * Create a Shopify admin-api-client wired to the local Shopify twin.
 *
 * CRITICAL: The SDK forces https:// on the storeDomain via validateDomainAndGetStoreUrl.
 * customFetchApi receives an https:// URL and must rewrite:
 *   1. Protocol + host + port → local HTTP twin (e.g. https://dev.myshopify.com → http://127.0.0.1:PORT)
 *
 * The twin accepts any valid Shopify API version via /admin/api/:version/graphql.json
 * (version-parameterized routes added in Phase 22). No version normalization is needed.
 *
 * CRITICAL: accessToken is REQUIRED. Do NOT hardcode tokens — the Shopify twin
 * validates tokens via token-validator.ts against StateManager. Use
 * seedShopifyAccessToken() to obtain a valid token before calling this.
 */
export function createShopifyClient(options: { accessToken: string; apiVersion?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!;
  const twinUrl = new URL(twinBaseUrl);

  const customFetchApi: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    // Rewrite host only (swap https://dev.myshopify.com → http://127.0.0.1:PORT).
    // The twin routes /admin/api/:version/graphql.json natively — no version rewrite needed.
    const hostRewritten = rawUrl.replace(
      'https://dev.myshopify.com',
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    return fetch(hostRewritten, init);
  };

  return createAdminApiClient({
    storeDomain: 'dev.myshopify.com',
    apiVersion: options.apiVersion ?? '2025-07',
    accessToken: options.accessToken,
    customFetchApi,
    isTesting: true,
  });
}
