/**
 * Shared factory and helpers for @shopify/shopify-api tests (Phase 16).
 *
 * Uses setAbstractFetchFunc to redirect all SDK HTTP calls to the local twin —
 * a different intercept point from shopify-client.ts (which uses customFetchApi
 * on createAdminApiClient). shopifyApi() does not accept customFetchApi; it uses
 * the global abstractFetch set by the node adapter.
 *
 * Import order is critical:
 *   1. @shopify/shopify-api/adapters/node  — sets abstractFetch + abstractConvertRequest
 *   2. @shopify/shopify-api/runtime        — exports setAbstractFetchFunc for override
 *   3. @shopify/shopify-api               — main factory
 */

// 1. MUST be first: sets abstractFetch to globalThis.fetch and registers nodeConvertRequest
import '@shopify/shopify-api/adapters/node';

// 2. Import override function after adapter is registered
import { setAbstractFetchFunc } from '@shopify/shopify-api/runtime';

// 3. Main factory and constants
import { shopifyApi, ApiVersion, LogSeverity } from '@shopify/shopify-api';

// JWT signing for session token helper
import * as jose from 'jose';

// HMAC computation
import { createHmac } from 'node:crypto';

// Billing config type
import type { BillingConfig, ShopifyRestResources } from '@shopify/shopify-api';

/**
 * Create a @shopify/shopify-api instance wired to the local Shopify twin.
 *
 * Overrides abstractFetch (set by the node adapter) with a wrapper that:
 *   - Rewrites any *.myshopify.com host to the twin's base URL
 *
 * The twin accepts any valid Shopify API version for both Admin and Storefront paths
 * (version-parameterized routes added in Phase 22). No version normalization is needed.
 *
 * @param options Optional overrides for billing, isEmbeddedApp, scopes, and restResources.
 *   - billing: required by Plan 16-04 (billing.request reads plan definitions from config.billing)
 *   - isEmbeddedApp: default false (webhooks/flow/fulfillment tests don't need embedded mode)
 *   - scopes: optional scope list for OAuth tests
 *   - restResources: optional REST resource classes from @shopify/shopify-api/rest/admin/{version}
 *     When provided, populates shopify.rest.* with resource classes configured against the twin.
 */
export function createShopifyApiClient<Resources extends ShopifyRestResources = ShopifyRestResources>(options?: {
  billing?: BillingConfig;
  isEmbeddedApp?: boolean;
  scopes?: string[];
  restResources?: Resources;
}) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL ?? 'http://127.0.0.1:9999';
  const twinUrl = new URL(twinBaseUrl);

  // Override abstractFetch to redirect SDK HTTP calls to the twin.
  // Rewrites host only — the twin routes /admin/api/:version/ and /api/:version/graphql.json
  // natively, so no version normalization is required.
  setAbstractFetchFunc(async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    // Rewrite any *.myshopify.com host → twin URL (handles any shop domain)
    const hostRewritten = rawUrl.replace(
      /https?:\/\/[^/]+\.myshopify\.com/,
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    return fetch(hostRewritten, init);
  });

  return shopifyApi({
    apiKey: 'test-api-key',
    apiSecretKey: 'test-api-secret',
    hostName: 'test-app.example.com',
    hostScheme: 'https',
    apiVersion: ApiVersion.January24,
    isEmbeddedApp: options?.isEmbeddedApp ?? false,
    isTesting: true,
    logger: {
      level: LogSeverity.Error,
      httpRequests: false,
      timestamps: false,
    },
    ...(options?.billing && { billing: options.billing }),
    ...(options?.scopes && { scopes: options.scopes }),
    ...(options?.restResources && { restResources: options.restResources }),
  });
}

/**
 * Mint a valid HS256 Shopify session token (JWT) for testing auth flows.
 *
 * Contains all required fields per Shopify's session token spec:
 * iss, dest, aud, sub, exp, nbf, iat, jti, sid
 *
 * @param apiKey     The app's API key (aud claim)
 * @param apiSecretKey The app's API secret (signing key)
 */
export async function mintSessionToken(apiKey: string, apiSecretKey: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    iss: 'https://dev.myshopify.com/admin',
    dest: 'https://dev.myshopify.com',
    aud: apiKey,
    sub: '1',
    exp: nowSec + 3600,
    nbf: nowSec - 5,
    iat: nowSec,
    jti: `jti-${Date.now()}`,
    sid: `sid-${Date.now()}`,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(apiSecretKey));
}

/**
 * Compute a Shopify-compatible HMAC-SHA256 in Base64 format.
 *
 * Matches HashFormat.Base64 used by shopify-api's webhook validator:
 *   createHmac('sha256', secret).update(body).digest('base64')
 *
 * @param secret The API secret key
 * @param body   The raw request body string
 */
export function computeShopifyHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

/**
 * Build a minimal IncomingMessage-compatible mock request for validate() calls.
 *
 * The node adapter's nodeConvertRequest reads rawRequest.method, rawRequest.url,
 * and rawRequest.headers — this shape satisfies all three.
 *
 * Headers are lowercased to match HTTP/1.1 conventions; the SDK canonicalizes
 * them internally via canonicalizeHeaders().
 *
 * @param headers  HTTP headers for the mock request (case-insensitive; stored lowercase)
 */
export function buildMockWebhookRequest(headers: Record<string, string>): unknown {
  return {
    method: 'POST',
    url: '/webhooks',
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
  };
}
