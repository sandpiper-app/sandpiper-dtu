import { describe, it, expect, beforeEach } from 'vitest';
import { createRestClient } from '../helpers/shopify-rest-client.js';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

/** Seed N products in the twin via the admin fixtures endpoint. */
async function seedProducts(count: number): Promise<void> {
  const twinUrl = process.env.SHOPIFY_API_URL!;
  const products = Array.from({ length: count }, (_, i) => ({
    title: `Pagination Product ${i + 1}`,
  }));
  const res = await fetch(twinUrl + '/admin/fixtures/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products }),
  });
  if (!res.ok) {
    throw new Error(`seedProducts: POST /admin/fixtures/load failed with ${res.status}`);
  }
}

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

  it('get() with limit=2 and 3 seeded products returns Link header with page_info cursor (RED until Plan 02)', async () => {
    // Seed 3 products so a limit=2 request has a second page
    await seedProducts(3);

    const client = createRestClient({ accessToken, apiVersion: '2025-01' });

    // Page 1: request with limit=2 via 2025-01
    const response = await client.get('products', { searchParams: { limit: 2 } });
    expect(response.ok).toBe(true);

    // Twin must return a Link header with page_info cursor
    // RED: link header will be absent (null) until Plan 02 implements cursor pagination
    const linkHeader = response.headers.get('link');
    expect(linkHeader).not.toBeNull();
    expect(linkHeader!).toContain('page_info=');
    expect(linkHeader!).toContain('/admin/api/2025-01/');
  });
});
