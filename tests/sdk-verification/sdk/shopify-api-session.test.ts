/**
 * SHOP-11: @shopify/shopify-api session helpers — pure in-process tests.
 *
 * All 7 tests run entirely in-process using JWT operations via jose and
 * pure formatting functions. No twin HTTP calls are required.
 *
 * 7 tests total:
 *   - decodeSessionToken: valid JWT, wrong secret, wrong aud (3)
 *   - pure utility: getOfflineId, getJwtSessionId, customAppSession (3)
 *   - getCurrentId: extracts session ID from Bearer Authorization header (1)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as jose from 'jose';
import { createShopifyApiClient, mintSessionToken } from '../helpers/shopify-api-client.js';

// Shared shopify instance for decodeSessionToken and utility function tests.
// isEmbeddedApp: false (default) — appropriate for webhook/non-embedded tests.
let shopify: ReturnType<typeof createShopifyApiClient>;

// Separate embedded shopify instance for getCurrentId test.
// getCurrentId only checks the Authorization header when isEmbeddedApp: true;
// with isEmbeddedApp: false it falls back to cookie extraction and ignores the header.
let embeddedShopify: ReturnType<typeof createShopifyApiClient>;

beforeAll(() => {
  shopify = createShopifyApiClient();
  embeddedShopify = createShopifyApiClient({ isEmbeddedApp: true });
});

// ---------------------------------------------------------------------------
// shopify.session.decodeSessionToken — SHOP-11
// ---------------------------------------------------------------------------

describe('shopify.session.decodeSessionToken — SHOP-11', () => {
  it('decodes a valid HS256 JWT and returns expected payload fields', async () => {
    const token = await mintSessionToken(shopify.config.apiKey, shopify.config.apiSecretKey);
    const payload = await shopify.session.decodeSessionToken(token);
    expect(payload.dest).toBe('https://dev.myshopify.com');
    expect(payload.aud).toBe(shopify.config.apiKey);
    expect(payload.sub).toBe('1');
  });

  it('throws for a JWT signed with the wrong secret', async () => {
    const wrongKey = new TextEncoder().encode('bad-secret');
    const token = await new jose.SignJWT({
      iss: 'https://dev.myshopify.com/admin',
      dest: 'https://dev.myshopify.com',
      aud: shopify.config.apiKey,
      sub: '1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: Math.floor(Date.now() / 1000) - 5,
      iat: Math.floor(Date.now() / 1000),
      jti: 'jti-bad',
      sid: 'sid-bad',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(wrongKey);
    await expect(shopify.session.decodeSessionToken(token)).rejects.toThrow();
  });

  it('throws InvalidJwtError when aud does not match apiKey', async () => {
    const key = new TextEncoder().encode(shopify.config.apiSecretKey);
    const token = await new jose.SignJWT({
      iss: 'https://dev.myshopify.com/admin',
      dest: 'https://dev.myshopify.com',
      aud: 'wrong-api-key', // aud mismatch
      sub: '1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: Math.floor(Date.now() / 1000) - 5,
      iat: Math.floor(Date.now() / 1000),
      jti: 'jti-aud',
      sid: 'sid-aud',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(key);
    await expect(shopify.session.decodeSessionToken(token)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// shopify.session pure utility functions — SHOP-11
// ---------------------------------------------------------------------------

describe('shopify.session pure utility functions — SHOP-11', () => {
  it('getOfflineId returns offline_{shop}', () => {
    expect(shopify.session.getOfflineId('dev.myshopify.com')).toBe('offline_dev.myshopify.com');
  });

  it('getJwtSessionId returns {shop}_{userId}', () => {
    expect(shopify.session.getJwtSessionId('dev.myshopify.com', '42')).toBe('dev.myshopify.com_42');
  });

  it('customAppSession returns Session with correct shop and isOnline=false', () => {
    const session = shopify.session.customAppSession('dev.myshopify.com');
    expect(session.shop).toBe('dev.myshopify.com');
    expect(session.isOnline).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shopify.session.getCurrentId — SHOP-11
// ---------------------------------------------------------------------------

describe('shopify.session.getCurrentId — SHOP-11', () => {
  it('extracts session ID from a Bearer token in Authorization header', async () => {
    // Use the embedded shopify instance: getCurrentId only reads the Authorization header
    // when isEmbeddedApp: true. With isEmbeddedApp: false it falls back to cookie extraction.
    const token = await mintSessionToken(
      embeddedShopify.config.apiKey,
      embeddedShopify.config.apiSecretKey,
    );
    // Mock request object matching node adapter's expected shape:
    //   nodeConvertRequest reads rawRequest.method, rawRequest.url, rawRequest.headers
    //   canonicalizeHeaders converts 'authorization' → 'Authorization'
    const mockRequest = {
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    };
    // getCurrentId with isEmbeddedApp: true extracts JWT from Authorization header,
    // decodes it, and returns getJwtSessionId(dest-shop, sub-userId).
    // mintSessionToken sets dest='https://dev.myshopify.com' and sub='1'
    // → getJwtSessionId('dev.myshopify.com', '1') = 'dev.myshopify.com_1'
    const sessionId = await embeddedShopify.session.getCurrentId({
      rawRequest: mockRequest as any,
      isOnline: true,
    });
    expect(sessionId).toBe('dev.myshopify.com_1');
  });
});
