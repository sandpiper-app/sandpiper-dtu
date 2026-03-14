import { createAdminRestApiClient } from '@shopify/admin-api-client';
import { recordSymbolHit } from '../setup/execution-evidence-runtime.js';

/**
 * Create a Shopify admin-api-client REST client wired to the local Shopify twin.
 *
 * CRITICAL: Both scheme:'http' AND customFetchApi host rewriting are required.
 * - scheme:'http' sets the URL protocol at construction time.
 * - customFetchApi rewrites dev.myshopify.com → 127.0.0.1:PORT before the HTTP call.
 * Without customFetchApi, scheme:'http' still sends to http://dev.myshopify.com (wrong host).
 *
 * URL construction with formatPaths:true (default):
 *   'products' → /admin/api/{apiVersion}/products.json
 *   'products/123' → /admin/api/{apiVersion}/products/123.json
 *
 * The twin accepts any valid Shopify API version via /admin/api/:version/ routes
 * (version-parameterized routes added in Phase 22). No version normalization is needed.
 *
 * CRITICAL: Use seedShopifyAccessToken() to get a valid token.
 *
 * Helper-seam capture (Phase 40, INFRA-23):
 *   Records createAdminRestApiClient and AdminRestApiClient method hits at the helper seam.
 *   Because AdminRestApiClient's methods are non-configurable, per-method hits are recorded
 *   in the customFetchApi closure keyed on the HTTP verb from the request init.
 */
export function createRestClient(options: { accessToken: string; apiVersion?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!;
  const twinUrl = new URL(twinBaseUrl);

  // Record factory-level and class-level hits at construction time
  recordSymbolHit('@shopify/admin-api-client@1.1.1/createAdminRestApiClient');
  recordSymbolHit('@shopify/admin-api-client@1.1.1/AdminRestApiClient');

  const customFetchApi: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    // Rewrite host only (handles both http:// and https:// prefix from scheme option).
    // The twin routes /admin/api/:version/ natively — no version rewrite needed.
    const hostRewritten = rawUrl.replace(
      /https?:\/\/dev\.myshopify\.com/,
      `${twinUrl.protocol}//${twinUrl.host}`
    );

    // Record per-HTTP-method symbol hit based on the request's HTTP verb.
    // AdminRestApiClient.get/post/put/delete each dispatch through customFetchApi.
    const verb = (init?.method ?? 'GET').toLowerCase();
    if (verb === 'get' || verb === 'post' || verb === 'put' || verb === 'delete') {
      recordSymbolHit(`@shopify/admin-api-client@1.1.1/AdminRestApiClient.${verb}`);
    }

    return fetch(hostRewritten, init);
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
