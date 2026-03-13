/**
 * SHOP-14: shopify.clients.Rest — RestClient tests (live twin).
 * SHOP-15: shopify.rest.* resource classes — Tier 1 and Tier 2 stub tests.
 *
 * 10 tests total:
 *   Test 1  (RestClient.get):          client.get({ path: 'products' }) → body.products is array
 *   Test 1b (RestClient.get+multipage): client.get with limit=2 and 3 products → pageInfo.nextPage (RED until Plan 02)
 *   Test 2  (RestClient.post):         client.post products → body.product.id defined
 *   Test 3  (RestClient.put):          client.put products/1 → body.product.id defined
 *   Test 4  (RestClient.delete):       client.delete products/1 → resolves without throw
 *   Test 5  (RestClient.retry):        client.get test-retry with tries:2 → resolves (429→200)
 *   Test 5b (RestClient.version-page): client.get limit=2 apiVersion 2025-01 → pageInfo.nextPageUrl has 2025-01 (RED until Plan 02)
 *   Test 6  (Product.all Tier 1):      shopify.rest.Product.all({ session }) → data is array
 *   Test 7  (Customer.all Tier 1):     shopify.rest.Customer.all({ session }) → data is array
 *   Test 8  (Order.all Tier 1):        shopify.rest.Order.all({ session }) → data is array
 *   Test 9  (Metafield.all Tier 2):    shopify.rest.Metafield.all({ session }) → data is array
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@shopify/shopify-api';
import { ApiVersion } from '@shopify/shopify-api';
import { restResources } from '@shopify/shopify-api/rest/admin/2024-01';
import { createShopifyApiClient } from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

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

// Pass REST resources so shopify.rest.Product/Customer/Order/Metafield are populated
const shopify = createShopifyApiClient({ restResources });

// ---------------------------------------------------------------------------
// SHOP-14: shopify.clients.Rest — RestClient
// ---------------------------------------------------------------------------

describe('shopify.clients.Rest — SHOP-14 (live twin)', () => {
  let session: Session;

  beforeEach(async () => {
    await resetShopify();
    const result = await shopify.auth.clientCredentials({ shop: 'dev.myshopify.com' });
    session = result.session;
  });

  it('get() returns body.products as an array', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });
    const result = await client.get<{ products: unknown[] }>({ path: 'products' });
    expect(Array.isArray(result.body.products)).toBe(true);
    // No Link header on standard request → pageInfo.nextPageUrl should be absent
    // The SDK populates pageInfo with query params (limit) even without a Link header.
    expect(result.pageInfo?.nextPageUrl).toBeUndefined();
  });

  it('get() with limit=2 and 3 seeded products returns pageInfo.nextPage for second page (RED until Plan 02)', async () => {
    // Seed 3 products so a limit=2 request has a second page
    await seedProducts(3);

    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });

    // Page 1: request with limit=2
    const page1 = await client.get<{ products: unknown[] }>({
      path: 'products',
      query: { limit: '2' },
    });
    expect(Array.isArray(page1.body.products)).toBe(true);

    // Twin must return a Link header → SDK parses it into pageInfo.nextPage
    // RED: pageInfo.nextPage is undefined until Plan 02 implements cursor pagination
    expect(page1.pageInfo?.nextPage).toBeDefined();

    // Follow the next page
    const page2 = await client.get<{ products: unknown[] }>({
      path: page1.pageInfo!.nextPage!.path,
      query: page1.pageInfo!.nextPage!.query,
    });
    expect(Array.isArray(page2.body.products)).toBe(true);
    // Page 2 should have the remaining 1 product
    expect(page2.body.products).toHaveLength(1);
  });

  // ── Version echo and version-aware Link assertions (Phase 22-02) ─────────

  it('get() returns x-shopify-api-version header matching the default factory version', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });
    const result = await client.get<{ products: unknown[] }>({ path: 'products' });
    // shopify-api canonicalizes header names to Title-Case and stores values as string[].
    // shopify factory is configured with ApiVersion.January24 (2024-01)
    const versionHeader = result.headers['X-Shopify-Api-Version'];
    const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;
    expect(version).toBe('2024-01');
  });

  it('get() with apiVersion 2025-01 returns x-shopify-api-version: 2025-01', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session, apiVersion: ApiVersion.January25 });
    const result = await client.get<{ products: unknown[] }>({ path: 'products' });
    const versionHeader = result.headers['X-Shopify-Api-Version'];
    const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;
    expect(version).toBe('2025-01');
  });

  it('get() with apiVersion 2025-01 and limit=2 returns pageInfo.nextPageUrl containing 2025-01 (RED until Plan 02)', async () => {
    // Seed 3 products so a limit=2 request with apiVersion 2025-01 has a second page
    await seedProducts(3);

    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session, apiVersion: ApiVersion.January25 });

    // Page 1: request with limit=2 via 2025-01 version
    const page1 = await client.get<{ products: unknown[] }>({
      path: 'products',
      query: { limit: '2' },
    });
    expect(Array.isArray(page1.body.products)).toBe(true);

    // Link header must contain the 2025-01 version path
    // RED: pageInfo.nextPage is undefined until Plan 02 implements cursor pagination
    expect(page1.pageInfo?.nextPage).toBeDefined();
    expect(page1.pageInfo?.nextPageUrl).toContain('/admin/api/2025-01/');
  });

  it('post() returns body.product with id', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });
    const result = await client.post<{ product: { id: string } }>({
      path: 'products',
      data: { product: { title: 'T' } },
    });
    expect(result.body.product).toBeDefined();
    expect(result.body.product.id).toBeDefined();
  });

  it('put() returns body.product with id', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });
    const result = await client.put<{ product: { id: string } }>({
      path: 'products/1',
      data: { product: { title: 'U' } },
    });
    expect(result.body.product).toBeDefined();
    expect(result.body.product.id).toBeDefined();
  });

  it('delete() resolves without throwing', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });
    await expect(client.delete({ path: 'products/1' })).resolves.toBeDefined();
  });

  it('retries on 429 via test-retry endpoint', async () => {
    const RestClient = shopify.clients.Rest;
    const client = new RestClient({ session });
    // tries:2 → first attempt gets 429, second attempt gets 200
    const result = await client.get({ path: 'test-retry', tries: 2 });
    expect(result.body).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SHOP-15: shopify.rest resource classes — Tier 1 + Tier 2 stubs
// ---------------------------------------------------------------------------

describe('shopify.rest resource classes — SHOP-15 (live twin)', () => {
  let session: Session;

  beforeEach(async () => {
    await resetShopify();
    const result = await shopify.auth.clientCredentials({ shop: 'dev.myshopify.com' });
    session = result.session;
  });

  it('Product.all() returns data as array (Tier 1)', async () => {
    const Product = shopify.rest.Product;
    const { data: products } = await Product.all({ session });
    expect(Array.isArray(products)).toBe(true);
  });

  it('Customer.all() returns data as array (Tier 1)', async () => {
    const Customer = shopify.rest.Customer;
    const { data: customers } = await Customer.all({ session });
    expect(Array.isArray(customers)).toBe(true);
  });

  it('Order.all() returns data as array (Tier 1)', async () => {
    const Order = shopify.rest.Order;
    const { data: orders } = await Order.all({ session });
    expect(Array.isArray(orders)).toBe(true);
  });

  it('Metafield.all() returns data as array (Tier 2 stub)', async () => {
    const Metafield = shopify.rest.Metafield;
    const { data: metafields } = await Metafield.all({ session });
    expect(Array.isArray(metafields)).toBe(true);
  });
});
