/**
 * SHOP-16: shopify-app-framework auth/admin seam smoke coverage.
 *
 * Scope: Framework readiness, not full framework rollout.
 * These tests prove that the begin/callback/tokenExchange auth seams work
 * correctly against the twin after Plan 39-02 grant validation hardening,
 * and that a post-auth admin client can make requests against versioned routes.
 *
 * Intentionally does NOT import framework app packages — SHOP-16 is framed
 * as readiness smoke, not a v2 app framework integration phase.
 *
 * 2 tests:
 *   1. auth.begin -> authorize -> auth.callback produces a session that can
 *      GET /admin/api/2025-01/products.json
 *   2. auth.tokenExchange -> admin Graphql client can request shop { name }
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RequestedTokenType } from '@shopify/shopify-api';
import {
  createShopifyApiClient,
  mintSessionToken,
} from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

// Module-level instance — setAbstractFetchFunc is called once here.
const shopify = createShopifyApiClient();

function shopifyTwinUrl(): string {
  return process.env.SHOPIFY_API_URL!;
}

async function fetchRedirectLocation(url: string): Promise<URL> {
  const response = await fetch(url, { redirect: 'manual' });
  expect(response.status).toBe(302);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location!);
}

// ---------------------------------------------------------------------------
// SHOP-16 smoke — auth/admin seam
// ---------------------------------------------------------------------------

describe('SHOP-16: app-framework auth/admin seam smoke', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('auth.begin -> authorize -> auth.callback produces a session that can GET /admin/api/2025-01/products.json', async () => {
    // -----------------------------------------------------------------------
    // Step 1: Call auth.begin() to get the signed state cookie and Location
    // -----------------------------------------------------------------------
    const capturedBeginHeaders: Record<string, string | string[]> = {};
    const mockBeginReq = {
      method: 'GET',
      url: 'https://test-app.example.com/auth?shop=dev.myshopify.com',
      headers: { host: 'test-app.example.com' },
    };
    const mockBeginRes = {
      statusCode: 200,
      statusMessage: 'OK',
      getHeaders(): Record<string, string | string[]> { return capturedBeginHeaders; },
      setHeader(name: string, value: string | string[]): void { capturedBeginHeaders[name.toLowerCase()] = value; },
      getHeader(name: string): string | string[] | undefined { return capturedBeginHeaders[name.toLowerCase()]; },
      removeHeader(_name: string): void {},
      write(_chunk: unknown): void {},
      end(): void {},
      headersSent: false,
    };

    await shopify.auth.begin({
      shop: 'dev.myshopify.com',
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: mockBeginReq as any,
      rawResponse: mockBeginRes as any,
    });

    const location = capturedBeginHeaders['location'] as string;
    expect(location).toBeDefined();
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get('state')!;
    expect(state).toBeTruthy();

    // Extract both state cookie and its .sig companion for the callback
    const setCookieHeaders = capturedBeginHeaders['set-cookie'];
    const setCookieArr = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : setCookieHeaders ? [setCookieHeaders as string] : [];
    const stateCookies = setCookieArr
      .filter(c => c.includes('shopify_app_state'))
      .map(c => c.split(';')[0].trim());
    const cookieHeader = stateCookies.join('; ');

    // -----------------------------------------------------------------------
    // Step 2: Hit the twin's authorize endpoint and get the callback params
    // -----------------------------------------------------------------------
    const twinAuthorizeUrl = location.replace(
      /https?:\/\/[^/]+/,
      shopifyTwinUrl()
    );
    const callbackRedirectUrl = await fetchRedirectLocation(twinAuthorizeUrl);
    expect(callbackRedirectUrl.searchParams.get('code')).toBeTruthy();
    expect(callbackRedirectUrl.searchParams.get('hmac')).toBeTruthy();
    expect(callbackRedirectUrl.searchParams.get('state')).toBe(state);

    // -----------------------------------------------------------------------
    // Step 3: Complete the flow with auth.callback()
    // -----------------------------------------------------------------------
    const mockCallbackReq = {
      method: 'GET',
      url: callbackRedirectUrl.toString(),
      headers: {
        host: 'test-app.example.com',
        cookie: cookieHeader,
      },
    };
    const mockCallbackRes = {
      statusCode: 200,
      statusMessage: 'OK',
      getHeaders(): Record<string, string | string[]> { return {}; },
      setHeader(_name: string, _value: string | string[]): void {},
      getHeader(_name: string): string | string[] | undefined { return undefined; },
      removeHeader(_name: string): void {},
      write(_chunk: unknown): void {},
      end(): void {},
      headersSent: false,
    };

    const { session } = await shopify.auth.callback({
      rawRequest: mockCallbackReq as any,
      rawResponse: mockCallbackRes as any,
    });

    expect(session.shop).toBe('dev.myshopify.com');
    expect(session.accessToken).toBeDefined();

    // -----------------------------------------------------------------------
    // Step 4: Use the session to hit a versioned admin REST route (2025-01)
    // -----------------------------------------------------------------------
    const response = await fetch(
      `${shopifyTwinUrl()}/admin/api/2025-01/products.json`,
      {
        headers: { 'X-Shopify-Access-Token': session.accessToken! },
      }
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { products: unknown[] };
    expect(Array.isArray(body.products)).toBe(true);
  });

  it('auth.tokenExchange -> admin Graphql client can request shop { name }', async () => {
    // Mint a valid session token for the token-exchange flow
    const sessionToken = await mintSessionToken(
      shopify.config.apiKey,
      shopify.config.apiSecretKey,
    );

    // Perform token exchange — uses the hardened grant-specific validation
    const { session } = await shopify.auth.tokenExchange({
      shop: 'dev.myshopify.com',
      sessionToken,
      requestedTokenType: RequestedTokenType.OnlineAccessToken,
    });

    expect(session.shop).toBe('dev.myshopify.com');
    expect(session.accessToken).toBeDefined();

    // Use the session to hit the versioned GraphQL admin route (2025-01)
    const response = await fetch(
      `${shopifyTwinUrl()}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': session.accessToken!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: '{ shop { name } }' }),
      }
    );
    expect(response.status).toBe(200);
    const result = await response.json() as { data: { shop: { name: string } } };
    expect(result.data?.shop?.name).toBeDefined();
    expect(typeof result.data.shop.name).toBe('string');
  });
});
