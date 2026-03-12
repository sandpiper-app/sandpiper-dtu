/**
 * SHOP-10: shopify.auth helpers — live twin + mock adapter tests.
 *
 * 15 tests total:
 *   - token flows (live twin): tokenExchange, refreshToken, clientCredentials (3)
 *   - begin redirect (mock adapter): redirect to /admin/oauth/authorize (1)
 *   - callback OAuth exchange (begin→authorize→callback flow, live twin): (1)
 *   - access_token validation and grant branching (live twin): empty body, missing fields,
 *     unknown code, replayed code, invalid_client cases, client_credentials preservation (8)
 *   - embedded URL helpers (pure): getEmbeddedAppUrl, buildEmbeddedAppUrl (2)
 *
 * Live twin calls use resetShopify() in beforeEach to clear token state.
 * Tests 4, 6, 7 are pure / mock-only — no twin reset needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RequestedTokenType } from '@shopify/shopify-api';
import {
  createShopifyApiClient,
  mintSessionToken,
} from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

// Module-level instance — setAbstractFetchFunc is called here once.
// All live twin calls in this suite use the same redirected abstractFetch.
const shopify = createShopifyApiClient();

function shopifyTwinUrl(): string {
  return process.env.SHOPIFY_API_URL!;
}

function rewriteToTwin(url: string): string {
  const originalUrl = new URL(url);
  const twinUrl = new URL(shopifyTwinUrl());
  originalUrl.protocol = twinUrl.protocol;
  originalUrl.host = twinUrl.host;
  return originalUrl.toString();
}

async function fetchRedirectLocation(url: string): Promise<URL> {
  const response = await fetch(url, { redirect: 'manual' });
  expect(response.status).toBe(302);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location!);
}

async function getAuthorizeRedirectFromTwin(options?: {
  redirectUri?: string;
  state?: string;
  clientId?: string;
}): Promise<URL> {
  const authorizeUrl = new URL('/admin/oauth/authorize', shopifyTwinUrl());
  authorizeUrl.searchParams.set(
    'redirect_uri',
    options?.redirectUri ?? 'https://test-app.example.com/auth/callback',
  );
  authorizeUrl.searchParams.set('state', options?.state ?? 'test-state');
  authorizeUrl.searchParams.set('client_id', options?.clientId ?? 'test-api-key');
  return fetchRedirectLocation(authorizeUrl.toString());
}

async function postAccessToken(body?: Record<string, string>): Promise<Response> {
  return fetch(`${shopifyTwinUrl()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
    // Step 2: Hit the twin authorize URL and use its real redirect params
    // -----------------------------------------------------------------------
    const callbackRedirectUrl = await fetchRedirectLocation(rewriteToTwin(location));
    expect(callbackRedirectUrl.searchParams.get('code')).toBeTruthy();
    expect(callbackRedirectUrl.searchParams.get('hmac')).toBeTruthy();
    expect(callbackRedirectUrl.searchParams.get('state')).toBe(state);

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
// POST /admin/oauth/access_token validation — SHOP-18 (live twin)
// ---------------------------------------------------------------------------

describe('POST /admin/oauth/access_token — SHOP-18 validation', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('returns 400 for an empty body', async () => {
    const response = await postAccessToken();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('returns 400 when client_secret is missing', async () => {
    const response = await postAccessToken({
      client_id: 'test-api-key',
      code: 'missing-secret',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('returns 400 for an unknown authorization code', async () => {
    const response = await postAccessToken({
      client_id: 'test-api-key',
      client_secret: 'test-api-secret',
      code: 'unknown-code',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('returns 400 when an authorization code is replayed', async () => {
    const callbackRedirectUrl = await getAuthorizeRedirectFromTwin({
      state: 'replayed-state',
    });
    const code = callbackRedirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    const firstResponse = await postAccessToken({
      client_id: 'test-api-key',
      client_secret: 'test-api-secret',
      code: code!,
    });
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({
      access_token: expect.any(String),
      scope: expect.any(String),
    });

    const replayResponse = await postAccessToken({
      client_id: 'test-api-key',
      client_secret: 'test-api-secret',
      code: code!,
    });
    expect(replayResponse.status).toBe(400);
    expect(await replayResponse.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('returns 401 when client_id is wrong for a real authorization code', async () => {
    const callbackRedirectUrl = await getAuthorizeRedirectFromTwin({
      state: 'wrong-client-id',
    });
    const code = callbackRedirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    const response = await postAccessToken({
      client_id: 'wrong-api-key',
      client_secret: 'test-api-secret',
      code: code!,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: 'invalid_client',
      error_description: 'client_id or client_secret is invalid',
    });
  });

  it('returns 401 when client_secret is wrong for a real authorization code', async () => {
    const callbackRedirectUrl = await getAuthorizeRedirectFromTwin({
      state: 'wrong-client-secret',
    });
    const code = callbackRedirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    const response = await postAccessToken({
      client_id: 'test-api-key',
      client_secret: 'wrong-api-secret',
      code: code!,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: 'invalid_client',
      error_description: 'client_id or client_secret is invalid',
    });
  });

  it('returns 401 for client_credentials when client_secret is wrong', async () => {
    const response = await postAccessToken({
      grant_type: 'client_credentials',
      client_id: 'test-api-key',
      client_secret: 'wrong-api-secret',
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: 'invalid_client',
      error_description: 'client_id or client_secret is invalid',
    });
  });

  it('preserves the client_credentials grant flow', async () => {
    const response = await postAccessToken({
      grant_type: 'client_credentials',
      client_id: 'test-api-key',
      client_secret: 'test-api-secret',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      access_token: expect.any(String),
      scope: expect.any(String),
    });
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
