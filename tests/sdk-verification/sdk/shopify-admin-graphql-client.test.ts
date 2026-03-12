import { describe, it, expect, beforeEach } from 'vitest';
import { createShopifyClient } from '../helpers/shopify-client.js';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

describe('AdminApiClient GraphQL methods (SHOP-08)', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetShopify();
    accessToken = await seedShopifyAccessToken();
  });

  // ── Live twin tests ──────────────────────────────────────────────────────

  it('request() executes GraphQL query and returns products data', async () => {
    const client = createShopifyClient({ accessToken });
    const result = await client.request('{ products(first: 1) { edges { node { id } } } }');
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.products).toBeDefined();
    expect(result.data.products.edges).toBeDefined();
  });

  it('fetch() returns raw Response with status 200', async () => {
    const client = createShopifyClient({ accessToken });
    const response = await client.fetch('{ products(first: 1) { edges { node { id } } } }');
    expect(response.status).toBe(200);
  });

  it('fetch() raw Response has application/json content-type and products in body', async () => {
    const client = createShopifyClient({ accessToken });
    const response = await client.fetch('{ products(first: 1) { edges { node { id } } } }');
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
    const body = await response.json() as { data: { products: unknown } };
    expect(body.data).toBeDefined();
    expect(body.data.products).toBeDefined();
  });

  // ── Client-side tests (no twin call) ─────────────────────────────────────

  it('getHeaders() merges custom headers while config X-Shopify-Access-Token wins', () => {
    const client = createShopifyClient({ accessToken: 'known-token-value', apiVersion: '2025-07' });
    const headers = client.getHeaders({ 'X-App-Context': 'test-context' });
    expect(headers['X-App-Context']).toBe('test-context');
    expect(headers['X-Shopify-Access-Token']).toBe('known-token-value');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('getApiUrl() with no args contains configured version and correct URL shape', () => {
    const client = createShopifyClient({ accessToken: 'tok', apiVersion: '2025-07' });
    const url = client.getApiUrl();
    expect(url).toContain('2025-07');
    expect(url).toContain('/admin/api/');
    expect(url).toContain('graphql.json');
  });

  it('getApiUrl("2025-01") contains per-request version override', () => {
    const client = createShopifyClient({ accessToken: 'tok', apiVersion: '2025-07' });
    const url = client.getApiUrl('2025-01');
    expect(url).toContain('2025-01');
  });

  // ── Live twin test with per-request apiVersion ───────────────────────────

  it('request() with per-request apiVersion executes successfully against twin', async () => {
    const client = createShopifyClient({ accessToken, apiVersion: '2025-07' });
    const result = await client.request(
      '{ products(first: 1) { edges { node { id } } } }',
      { apiVersion: '2025-01' },
    );
    expect(result.data).toBeDefined();
    expect(result.data.products).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  // ── Dual-version and response-header assertions (Phase 22-02) ────────────

  it('fetch() with version 2024-01 returns x-shopify-api-version: 2024-01', async () => {
    const client = createShopifyClient({ accessToken, apiVersion: '2024-01' });
    const response = await client.fetch('{ products(first: 1) { edges { node { id } } } }');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-shopify-api-version')).toBe('2024-01');
  });

  it('fetch() with version 2025-01 returns x-shopify-api-version: 2025-01', async () => {
    const client = createShopifyClient({ accessToken, apiVersion: '2025-01' });
    const response = await client.fetch('{ products(first: 1) { edges { node { id } } } }');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-shopify-api-version')).toBe('2025-01');
  });
});
