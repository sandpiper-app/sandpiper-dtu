import { createAdminRestApiClient } from '@shopify/admin-api-client';

/**
 * Create a Shopify admin-api-client REST client wired to the local Shopify twin.
 *
 * CRITICAL: Both scheme:'http' AND customFetchApi host rewriting are required.
 * - scheme:'http' sets the URL protocol at construction time.
 * - customFetchApi rewrites dev.myshopify.com → 127.0.0.1:PORT before the HTTP call.
 * Without customFetchApi, scheme:'http' still sends to http://dev.myshopify.com (wrong host).
 *
 * URL construction with formatPaths:true (default):
 *   'products' → /admin/api/2024-01/products.json
 *   'products/123' → /admin/api/2024-01/products/123.json
 *
 * CRITICAL: Use seedShopifyAccessToken() to get a valid token.
 */
export function createRestClient(options: { accessToken: string; apiVersion?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!;
  const twinUrl = new URL(twinBaseUrl);

  const customFetchApi: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    // Rewrite host (handles both http:// and https:// prefix from scheme option)
    const hostRewritten = rawUrl.replace(
      /https?:\/\/dev\.myshopify\.com/,
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    // Normalize version segment to the one the twin serves
    const normalized = hostRewritten.replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/');
    return fetch(normalized, init);
  };

  return createAdminRestApiClient({
    storeDomain: 'dev.myshopify.com',
    apiVersion: options.apiVersion ?? '2025-07',
    accessToken: options.accessToken,
    customFetchApi,
    scheme: 'http',    // Sets http:// prefix at URL construction; customFetchApi then rewrites host
    isTesting: true,
  });
}
