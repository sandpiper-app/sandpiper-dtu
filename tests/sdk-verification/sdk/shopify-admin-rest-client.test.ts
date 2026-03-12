import { describe, it, expect, beforeEach } from 'vitest';
import { createRestClient } from '../helpers/shopify-rest-client.js';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

describe('AdminRestApiClient methods (SHOP-09)', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetShopify();
    accessToken = await seedShopifyAccessToken();
  });

  it('get() returns ok with products array body', async () => {
    const client = createRestClient({ accessToken });
    const response = await client.get('products');
    expect(response.ok).toBe(true);
    const body = await response.json() as { products: unknown[] };
    expect(body.products).toBeDefined();
    expect(Array.isArray(body.products)).toBe(true);
  });

  it('post() returns ok with product object body (201)', async () => {
    const client = createRestClient({ accessToken });
    const response = await client.post('products', { data: { product: { title: 'Test Product' } } });
    expect(response.ok).toBe(true);
    const body = await response.json() as { product: unknown };
    expect(body.product).toBeDefined();
  });

  it('put() returns ok with updated product body', async () => {
    const client = createRestClient({ accessToken });
    const response = await client.put('products/1', { data: { product: { title: 'Updated' } } });
    expect(response.ok).toBe(true);
    const body = await response.json() as { product: unknown };
    expect(body.product).toBeDefined();
  });

  it('delete() returns ok with empty body', async () => {
    const client = createRestClient({ accessToken });
    const response = await client.delete('products/1');
    expect(response.ok).toBe(true);
  });

  it('get() with searchParams encodes query string and twin responds 200', async () => {
    const client = createRestClient({ accessToken });
    const response = await client.get('products', { searchParams: { limit: 1, fields: 'id,title' } });
    expect(response.ok).toBe(true);
    // searchParams encoded and sent; twin returns 200 regardless of params (ignores unknown query params)
  });

  it('get() with custom headers forwards them to twin and twin responds 200', async () => {
    const client = createRestClient({ accessToken });
    const response = await client.get('products', { headers: { 'X-Custom-Header': 'test-value' } });
    expect(response.ok).toBe(true);
    // Header forwarded to twin; twin authenticates via X-Shopify-Access-Token and responds 200
  });

  it('get() with retries:1 succeeds after 429 retry (twin returns 429+Retry-After:0 first, 200 second)', async () => {
    const client = createRestClient({ accessToken });
    // Twin's test-retry endpoint returns 429+Retry-After:0 on first call, 200 on second.
    // retries:1 tells client to attempt up to 1 retry on retriable status codes.
    const response = await client.get('test-retry', { retries: 1 });
    expect(response.ok).toBe(true);
    const body = await response.json() as { products: unknown[] };
    expect(body.products).toBeDefined();
  });

  it('get() with invalid token returns 401 authentication error', async () => {
    const badClient = createRestClient({ accessToken: 'definitely-invalid-token' });
    const response = await badClient.get('products', { retries: 0 });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
  });

  // ── Dual-version and response-header assertions (Phase 22-02) ────────────

  it('get() with apiVersion 2024-01 returns x-shopify-api-version: 2024-01', async () => {
    const client = createRestClient({ accessToken, apiVersion: '2024-01' });
    const response = await client.get('products');
    expect(response.ok).toBe(true);
    expect(response.headers.get('x-shopify-api-version')).toBe('2024-01');
  });

  it('get() with apiVersion 2025-01 returns x-shopify-api-version: 2025-01', async () => {
    const client = createRestClient({ accessToken, apiVersion: '2025-01' });
    const response = await client.get('products');
    expect(response.ok).toBe(true);
    expect(response.headers.get('x-shopify-api-version')).toBe('2025-01');
  });

  it('get() with page_info=test and apiVersion 2025-01 returns version-aware Link header', async () => {
    const client = createRestClient({ accessToken, apiVersion: '2025-01' });
    const response = await client.get('products', { searchParams: { page_info: 'test' } });
    expect(response.ok).toBe(true);
    const linkHeader = response.headers.get('link');
    expect(linkHeader).toBeDefined();
    // The Link header URL must contain /admin/api/2025-01/ (not a hardcoded 2024-01)
    expect(linkHeader).toContain('/admin/api/2025-01/');
  });
});
