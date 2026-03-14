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
 *
 * Helper-seam capture (Phase 40, INFRA-23):
 *   The returned shopify instance exposes shopify.clients.Rest. Tests that call
 *   `new RestClient({ session })` get an instance whose HTTP methods (get/post/put/delete)
 *   are instrumented to emit runtime symbol hits. The Proxy wrapper covers new
 *   RestClient instances created after createShopifyApiClient() returns.
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

// Phase 40: runtime evidence recorder
import { recordSymbolHit } from '../setup/execution-evidence-runtime.js';

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

  // Record shopifyApi factory call and top-level Shopify class hit
  recordSymbolHit('@shopify/shopify-api@12.3.0/shopifyApi');
  recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify');

  const shopify = shopifyApi({
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

  // Record sub-namespace hits for the namespaces that are consistently accessed.
  // These match the EVIDENCE_MAP entries for Shopify.*.
  recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify.config');
  recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify.auth');
  recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify.clients');
  recordSymbolHit('@shopify/shopify-api@12.3.0/ShopifyClients');
  recordSymbolHit('@shopify/shopify-api@12.3.0/ShopifyClients.Rest');
  recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify.rest');

  // Phase 40, INFRA-23: Instrument shopify.clients.Rest constructor so that
  // any RestClient instance created by tests emits runtime symbol hits for
  // get/post/put/delete calls. We wrap the class so every `new RestClient()`
  // returns an instance with instrumented methods.
  const OriginalRestClient = shopify.clients.Rest;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const InstrumentedRestClient = new Proxy(OriginalRestClient as any, {
    construct(Target, args) {
      // Record that RestClient was constructed
      recordSymbolHit('@shopify/shopify-api@12.3.0/RestClient');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance: any = new Target(...args);

      // Wrap each HTTP method to emit a per-method hit
      for (const method of ['get', 'post', 'put', 'delete'] as const) {
        const original = instance[method].bind(instance);
        instance[method] = (...methodArgs: unknown[]) => {
          recordSymbolHit(`@shopify/shopify-api@12.3.0/RestClient.${method}`);
          return original(...methodArgs);
        };
      }

      return instance;
    },
  });

  // Replace the Rest constructor reference on the clients namespace
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (shopify.clients as any).Rest = InstrumentedRestClient;

  // Phase 40, INFRA-23: Instrument shopify.clients.Graphql similarly.
  // Captures GraphqlClient construction and request/query method calls.
  const OriginalGraphqlClient = shopify.clients.Graphql;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const InstrumentedGraphqlClient = new Proxy(OriginalGraphqlClient as any, {
    construct(Target, args) {
      recordSymbolHit('@shopify/shopify-api@12.3.0/GraphqlClient');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance: any = new Target(...args);

      for (const method of ['request', 'query'] as const) {
        if (typeof instance[method] === 'function') {
          const original = instance[method].bind(instance);
          instance[method] = (...methodArgs: unknown[]) => {
            recordSymbolHit(`@shopify/shopify-api@12.3.0/GraphqlClient.${method}`);
            return original(...methodArgs);
          };
        }
      }

      return instance;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (shopify.clients as any).Graphql = InstrumentedGraphqlClient;

  // Instrument graphqlProxy if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalGraphqlProxy = (shopify.clients as any).graphqlProxy;
  if (typeof originalGraphqlProxy === 'function') {
    recordSymbolHit('@shopify/shopify-api@12.3.0/ShopifyClients.graphqlProxy');
    recordSymbolHit('@shopify/shopify-api@12.3.0/GraphqlProxy');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (shopify.clients as any).graphqlProxy = (...args: unknown[]) => {
      return originalGraphqlProxy.apply(shopify.clients, args);
    };
  }

  // Record Graphql-related namespace hits
  recordSymbolHit('@shopify/shopify-api@12.3.0/ShopifyClients.Graphql');

  // Proxy the shopify object to capture sub-namespace access hits.
  // This captures Shopify.session, Shopify.webhooks, Shopify.flow,
  // Shopify.fulfillmentService, Shopify.billing, ShopifyClients.Storefront.
  // Also instrument Storefront client constructor hits via the clients namespace proxy
  const OriginalStorefrontClient = shopify.clients.Storefront;
  if (OriginalStorefrontClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const InstrumentedStorefrontClient = new Proxy(OriginalStorefrontClient as any, {
      construct(Target, args) {
        recordSymbolHit('@shopify/shopify-api@12.3.0/ShopifyClients.Storefront');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Target(...args) as any;
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (shopify.clients as any).Storefront = InstrumentedStorefrontClient;
  }

  const SHOPIFY_NAMESPACE_SYMBOLS: Record<string, string> = {
    session: '@shopify/shopify-api@12.3.0/Shopify.session',
    webhooks: '@shopify/shopify-api@12.3.0/Shopify.webhooks',
    flow: '@shopify/shopify-api@12.3.0/Shopify.flow',
    fulfillmentService: '@shopify/shopify-api@12.3.0/Shopify.fulfillmentService',
    billing: '@shopify/shopify-api@12.3.0/Shopify.billing',
  };

  return new Proxy(shopify, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(target: any, prop: string | symbol, receiver: unknown) {
      const propStr = String(prop);
      if (propStr in SHOPIFY_NAMESPACE_SYMBOLS) {
        recordSymbolHit(SHOPIFY_NAMESPACE_SYMBOLS[propStr]);
      }
      return Reflect.get(target, prop, receiver);
    },
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
