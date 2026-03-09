/**
 * SHOP-10: shopify.auth helpers — live twin + mock adapter tests.
 *
 * 7 tests total:
 *   - token flows (live twin): tokenExchange, refreshToken, clientCredentials (3)
 *   - begin redirect (mock adapter): redirect to /admin/oauth/authorize (1)
 *   - callback OAuth exchange (begin→callback flow, live twin): (1)
 *   - embedded URL helpers (pure): getEmbeddedAppUrl, buildEmbeddedAppUrl (2)
 *
 * Live twin calls use resetShopify() in beforeEach to clear token state.
 * Tests 4, 6, 7 are pure / mock-only — no twin reset needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { RequestedTokenType } from '@shopify/shopify-api';
import {
  createShopifyApiClient,
  mintSessionToken,
} from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

// Module-level instance — setAbstractFetchFunc is called here once.
// All live twin calls in this suite use the same redirected abstractFetch.
const shopify = createShopifyApiClient();

// ---------------------------------------------------------------------------
// Helper: compute OAuth callback HMAC (Hex format, URLSearchParams-sorted)
//
// The SDK's validateHmac uses:
//   1. Exclude `hmac` (and `signature`) from query params
//   2. Sort keys with localeCompare
//   3. Encode via URLSearchParams (key=value&key=value)
//   4. createSHA256HMAC with HashFormat.Hex
//
// Note: computeShopifyHmac (in the helper) uses base64 format (for webhooks).
// This helper uses hex format for OAuth callback query params.
// ---------------------------------------------------------------------------
function computeCallbackHmac(secret: string, params: Record<string, string>): string {
  // Exclude hmac/signature from the computation
  const { hmac: _h, signature: _s, ...rest } = params;
  // Sort keys alphabetically (localeCompare matches the SDK's sort)
  const sortedKeys = Object.keys(rest).sort((a, b) => a.localeCompare(b));
  // Build URLSearchParams-encoded query string
  const qs = new URLSearchParams(sortedKeys.map(k => [k, rest[k]])).toString();
  // SHA256 HMAC in hex format
  return createHmac('sha256', secret).update(qs).digest('hex');
}

// ---------------------------------------------------------------------------
// shopify.auth — token flows — SHOP-10 (live twin)
// ---------------------------------------------------------------------------

describe('shopify.auth — token flows — SHOP-10 (live twin)', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('tokenExchange returns a Session with accessToken', async () => {
    const sessionToken = await mintSessionToken(
      shopify.config.apiKey,
      shopify.config.apiSecretKey,
    );
    const { session } = await shopify.auth.tokenExchange({
      shop: 'dev.myshopify.com',
      sessionToken,
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
    });
    expect(session.shop).toBe('dev.myshopify.com');
    expect(session.accessToken).toBeDefined();
    expect(typeof session.accessToken).toBe('string');
  });

  it('refreshToken returns a new Session with accessToken', async () => {
    // Get a token via tokenExchange first — refreshToken takes { shop, refreshToken: string }
    const sessionToken = await mintSessionToken(
      shopify.config.apiKey,
      shopify.config.apiSecretKey,
    );
    const { session: initial } = await shopify.auth.tokenExchange({
      shop: 'dev.myshopify.com',
      sessionToken,
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
    });
    // refreshToken signature: { shop: string, refreshToken: string }
    // Pass the access token as the refresh token — the twin accepts any value
    const { session: refreshed } = await shopify.auth.refreshToken({
      shop: 'dev.myshopify.com',
      refreshToken: initial.accessToken!,
    });
    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.shop).toBe('dev.myshopify.com');
  });

  it('clientCredentials returns a Session with accessToken', async () => {
    const { session } = await shopify.auth.clientCredentials({
      shop: 'dev.myshopify.com',
    });
    expect(session.shop).toBe('dev.myshopify.com');
    expect(session.accessToken).toBeDefined();
    expect(typeof session.accessToken).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// shopify.auth — begin redirect — SHOP-10 (mock adapter)
// ---------------------------------------------------------------------------

describe('shopify.auth — begin redirect — SHOP-10 (mock adapter)', () => {
  it('begin returns a redirect to the Shopify OAuth authorize URL', async () => {
    // Build a minimal IncomingMessage-like mock for begin()
    const mockReq = {
      method: 'GET',
      url: 'https://test-app.example.com/auth?shop=dev.myshopify.com',
      headers: { host: 'test-app.example.com' },
    };

    // Build a mock ServerResponse that captures what the node adapter writes.
    // The node adapter's nodeConvertIncomingResponse reads:
    //   rawResponse.statusCode, rawResponse.statusMessage, rawResponse.getHeaders()
    // The node adapter's nodeConvertAndSendResponse calls:
    //   rawResponse.setHeader(), rawResponse.write(), rawResponse.statusCode setter,
    //   rawResponse.statusMessage setter, rawResponse.end()
    const capturedHeaders: Record<string, string | string[]> = {};
    const mockRes = {
      statusCode: 200,
      statusMessage: 'OK',
      // getHeaders() is called by nodeConvertIncomingResponse to read current response headers
      getHeaders(): Record<string, string | string[]> {
        return capturedHeaders;
      },
      setHeader(name: string, value: string | string[]): void {
        capturedHeaders[name.toLowerCase()] = value;
      },
      getHeader(name: string): string | string[] | undefined {
        return capturedHeaders[name.toLowerCase()];
      },
      removeHeader(_name: string): void {},
      write(_chunk: unknown): void {},
      end(): void {},
      headersSent: false,
    };

    await shopify.auth.begin({
      shop: 'dev.myshopify.com',
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: mockReq as any,
      rawResponse: mockRes as any,
    });

    // The Location header is written to rawResponse.setHeader('Location', redirectUrl)
    const location = capturedHeaders['location'] as string;
    expect(location).toBeDefined();
    expect(location).toMatch(/\/admin\/oauth\/authorize/);
    expect(location).toMatch(/client_id=test-api-key/);
  });
});

// ---------------------------------------------------------------------------
// shopify.auth — callback — SHOP-10 (begin→callback flow via live twin)
// ---------------------------------------------------------------------------

describe('shopify.auth — callback — SHOP-10 (begin+callback flow via live twin)', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('callback completes OAuth via begin→callback flow', async () => {
    // -----------------------------------------------------------------------
    // Step 1: Call begin() to get the signed state cookie
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
      getHeaders(): Record<string, string | string[]> {
        return capturedBeginHeaders;
      },
      setHeader(name: string, value: string | string[]): void {
        capturedBeginHeaders[name.toLowerCase()] = value;
      },
      getHeader(name: string): string | string[] | undefined {
        return capturedBeginHeaders[name.toLowerCase()];
      },
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

    // Extract Location redirect URL to get the state nonce
    const location = capturedBeginHeaders['location'] as string;
    expect(location).toBeDefined();
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get('state')!;
    expect(state).toBeTruthy();

    // Extract Set-Cookie headers — the SDK sets both:
    //   shopify_app_state=<nonce>
    //   shopify_app_state.sig=<sha256_hmac>
    const setCookieHeaders = capturedBeginHeaders['set-cookie'];
    const setCookieArr = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : setCookieHeaders
        ? [setCookieHeaders as string]
        : [];

    // Build cookie string with both the state cookie and its .sig companion
    const stateCookies = setCookieArr
      .filter(c => c.includes('shopify_app_state'))
      .map(c => c.split(';')[0].trim()); // Extract "name=value" part

    expect(stateCookies.length).toBeGreaterThanOrEqual(2); // state + state.sig

    const cookieHeader = stateCookies.join('; ');

    // -----------------------------------------------------------------------
    // Step 2: Build callback request with valid HMAC, state, shop, code
    // -----------------------------------------------------------------------
    const callbackParams: Record<string, string> = {
      code: 'test-code-123',
      host: Buffer.from('dev.myshopify.com/admin').toString('base64'),
      shop: 'dev.myshopify.com',
      state,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };

    // Compute HMAC: hex format, URLSearchParams-sorted, excludes hmac
    const hmac = computeCallbackHmac(shopify.config.apiSecretKey, callbackParams);
    callbackParams.hmac = hmac;

    const queryString = new URLSearchParams(callbackParams).toString();
    const mockCallbackReq = {
      method: 'GET',
      url: `https://test-app.example.com/auth/callback?${queryString}`,
      headers: {
        host: 'test-app.example.com',
        cookie: cookieHeader,
      },
    };
    const mockCallbackRes = {
      statusCode: 200,
      statusMessage: 'OK',
      getHeaders(): Record<string, string | string[]> {
        return {};
      },
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
    expect(typeof session.accessToken).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// shopify.auth — embedded URL helpers — SHOP-10 (pure)
// ---------------------------------------------------------------------------

describe('shopify.auth — embedded URL helpers — SHOP-10 (pure)', () => {
  it('getEmbeddedAppUrl returns the Shopify admin embedded app URL', async () => {
    // host encodes the Shopify admin domain path — must end with .myshopify.com
    // sanitizeHost validates the decoded hostname matches the Shopify domains list
    const host = Buffer.from('dev.myshopify.com/admin').toString('base64');
    const mockReq = {
      method: 'GET',
      url: `https://test-app.example.com/?host=${host}`,
      headers: { host: 'test-app.example.com' },
    };
    const url = await shopify.auth.getEmbeddedAppUrl({
      rawRequest: mockReq as any,
    });
    expect(typeof url).toBe('string');
    // Returns: https://{decodedHost}/apps/{apiKey}
    expect(url).toContain('dev.myshopify.com');
    expect(url).toContain('/apps/test-api-key');
  });

  it('buildEmbeddedAppUrl returns the Shopify admin embedded app URL from a base64 host', () => {
    const host = Buffer.from('dev.myshopify.com/admin').toString('base64');
    // buildEmbeddedAppUrl takes a PLAIN STRING (not an object)
    const url = shopify.auth.buildEmbeddedAppUrl(host);
    expect(typeof url).toBe('string');
    // Returns: https://{decodedHost}/apps/{apiKey}
    expect(url).toContain('dev.myshopify.com');
    expect(url).toContain('/apps/test-api-key');
  });
});
