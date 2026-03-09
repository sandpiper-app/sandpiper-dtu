/**
 * SHOP-12: webhook/flow/fulfillmentService validate — pure in-process tests.
 *
 * These tests verify the HMAC-based validation helpers of @shopify/shopify-api
 * without any live twin calls. The shopify instance is created once at module
 * level since no state mutation occurs.
 *
 * 7 tests total:
 *   - webhooks.validate: valid, bad HMAC, missing header (3)
 *   - flow.validate:     valid, bad HMAC (2)
 *   - fulfillmentService.validate: valid, bad HMAC (2)
 */

import { describe, it, expect } from 'vitest';
import {
  createShopifyApiClient,
  computeShopifyHmac,
  buildMockWebhookRequest,
} from '../helpers/shopify-api-client.js';

// Module-level instance — safe because these tests make no twin HTTP calls.
// The setAbstractFetchFunc override in createShopifyApiClient is called here,
// but validate() is a pure in-process crypto operation that never calls fetch.
const shopify = createShopifyApiClient();

// Shared test fixtures
const rawBody = JSON.stringify({ id: 'gid://shopify/Product/1', title: 'Test Product' });
const secret = 'test-api-secret'; // must match apiSecretKey in createShopifyApiClient
const validHmac = computeShopifyHmac(secret, rawBody);

/** Full set of required webhook headers with a valid HMAC */
const fullHeaders: Record<string, string> = {
  'x-shopify-hmac-sha256': validHmac,
  'x-shopify-topic': 'products/create',
  'x-shopify-api-version': '2024-01',
  'x-shopify-shop-domain': 'dev.myshopify.com',
  'x-shopify-webhook-id': 'wh-test-001',
};

// ---------------------------------------------------------------------------
// shopify.webhooks.validate — SHOP-12
// ---------------------------------------------------------------------------

describe('shopify.webhooks.validate — SHOP-12', () => {
  it('returns { valid: true } for correct HMAC and all five required headers', async () => {
    const result = await shopify.webhooks.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest(fullHeaders) as any,
    });
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false, reason: "invalid_hmac" } for a tampered HMAC', async () => {
    const headersWithBadHmac = {
      ...fullHeaders,
      'x-shopify-hmac-sha256': 'invalid-bad-hmac',
    };
    const result = await shopify.webhooks.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest(headersWithBadHmac) as any,
    });
    expect(result.valid).toBe(false);
    expect((result as any).reason).toBe('invalid_hmac');
  });

  it('returns { valid: false } when x-shopify-topic header is missing', async () => {
    const { 'x-shopify-topic': _omit, ...headersWithoutTopic } = fullHeaders;
    const result = await shopify.webhooks.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest(headersWithoutTopic) as any,
    });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shopify.flow.validate — SHOP-12
// ---------------------------------------------------------------------------

describe('shopify.flow.validate — SHOP-12', () => {
  it('returns { valid: true } for a correctly HMAC-signed request', async () => {
    const result = await shopify.flow.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest({
        'x-shopify-hmac-sha256': validHmac,
      }) as any,
    });
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false } for a bad HMAC string', async () => {
    const result = await shopify.flow.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest({
        'x-shopify-hmac-sha256': 'bad-hmac-value',
      }) as any,
    });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shopify.fulfillmentService.validate — SHOP-12
// ---------------------------------------------------------------------------

describe('shopify.fulfillmentService.validate — SHOP-12', () => {
  it('returns { valid: true } for a correctly HMAC-signed request', async () => {
    const result = await shopify.fulfillmentService.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest({
        'x-shopify-hmac-sha256': validHmac,
      }) as any,
    });
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false } for a bad HMAC string', async () => {
    const result = await shopify.fulfillmentService.validate({
      rawBody,
      rawRequest: buildMockWebhookRequest({
        'x-shopify-hmac-sha256': 'bad-hmac-value',
      }) as any,
    });
    expect(result.valid).toBe(false);
  });
});
