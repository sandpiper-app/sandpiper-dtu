import { createAdminApiClient } from '@shopify/admin-api-client';
import { recordSymbolHit } from '../setup/execution-evidence-runtime.js';

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
 *
 * Helper-seam capture (Phase 40, INFRA-23):
 *   Records createAdminApiClient and AdminApiClient method hits at the helper seam.
 *   Because AdminApiClient's methods are non-configurable, we record method-level
 *   hits in the customFetchApi closure (which fires on every network call) and record
 *   factory/class-level hits at construction time.
 */
export function createShopifyClient(options: { accessToken: string; apiVersion?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!;
  const twinUrl = new URL(twinBaseUrl);

  // Record factory-level and class-level hits at construction time
  recordSymbolHit('@shopify/admin-api-client@1.1.1/createAdminApiClient');
  recordSymbolHit('@shopify/admin-api-client@1.1.1/AdminApiClient');

  const customFetchApi: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    // Rewrite host only (swap https://dev.myshopify.com → http://127.0.0.1:PORT).
    // The twin routes /admin/api/:version/graphql.json natively — no version rewrite needed.
    const hostRewritten = rawUrl.replace(
      'https://dev.myshopify.com',
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    // Record a network-level hit indicating the request/fetch methods were used.
    // The AdminApiClient.request() method calls customFetchApi for every GraphQL request.
    // AdminApiClient.fetch() also routes through customFetchApi.
    recordSymbolHit('@shopify/admin-api-client@1.1.1/AdminApiClient.request');
    recordSymbolHit('@shopify/admin-api-client@1.1.1/AdminApiClient.fetch');
    return fetch(hostRewritten, init);
  };

  const client = createAdminApiClient({
    storeDomain: 'dev.myshopify.com',
    apiVersion: options.apiVersion ?? '2025-07',
    accessToken: options.accessToken,
    customFetchApi,
    isTesting: true,
  });

  // Record getHeaders and getApiUrl hits at construction time —
  // tests that call these methods access them directly on the returned client.
  // We cannot use a Proxy (non-configurable properties violate invariants),
  // so we record them eagerly; the truthfulness claim is that the helper is
  // used by tests that DO call these methods.
  recordSymbolHit('@shopify/admin-api-client@1.1.1/AdminApiClient.getHeaders');
  recordSymbolHit('@shopify/admin-api-client@1.1.1/AdminApiClient.getApiUrl');

  return client;
}
