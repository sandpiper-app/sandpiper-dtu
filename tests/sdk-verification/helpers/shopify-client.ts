import { createAdminApiClient } from '@shopify/admin-api-client';

/**
 * Create a Shopify admin-api-client wired to the local Shopify twin.
 *
 * CRITICAL: The SDK forces https:// on the storeDomain via validateDomainAndGetStoreUrl.
 * customFetchApi receives an https:// URL and must rewrite:
 *   1. Protocol + host + port → local HTTP twin (e.g. https://dev.myshopify.com → http://127.0.0.1:PORT)
 *   2. API version segment → /admin/api/2024-01/ (the twin only serves this version)
 *
 * Version normalization is the surgical fix: the SDK constructs the URL with whatever
 * apiVersion is passed (e.g. '2025-07'), but the twin only routes /admin/api/2024-01/.
 * The customFetchApi has full URL control and normalizes the version in-flight.
 * No twin route changes are needed.
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
    // Step 1: rewrite host (swap https://dev.myshopify.com → http://127.0.0.1:PORT)
    const hostRewritten = rawUrl.replace(
      'https://dev.myshopify.com',
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    // Step 2: normalize version segment to the one the twin serves
    const normalized = hostRewritten.replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/');
    return fetch(normalized, init);
  };

  return createAdminApiClient({
    storeDomain: 'dev.myshopify.com',
    apiVersion: options.apiVersion ?? '2025-07',
    accessToken: options.accessToken,
    customFetchApi,
    isTesting: true,
  });
}
