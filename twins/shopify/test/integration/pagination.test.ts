/**
 * Integration tests for cursor-based pagination across Shopify twin connections.
 *
 * Tests verify (SHOP-05):
 * - orders(first: N) returns N edges with cursors, correct pageInfo
 * - Forward navigation via endCursor as after argument
 * - Exhaustive forward traversal totals match fixture count
 * - products(first: N) with fixture data returns correct page
 * - Ordering is deterministic (id ASC) across separate queries
 * - Invalid cursor (wrong resource type) returns appropriate error
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';

/** Helper to make a GraphQL request to the twin (defaults to 2024-01 for existing tests) */
async function gql(app: any, token: string, query: string, version = '2024-01'): Promise<any> {
  const response = await app.inject({
    method: 'POST',
    url: `/admin/api/${version}/graphql.json`,
    headers: { 'X-Shopify-Access-Token': token },
    payload: { query },
  });
  return JSON.parse(response.body);
}

/** Make a raw REST request and return the full inject response (including headers) */
async function restRequest(app: any, token: string, path: string): Promise<any> {
  return app.inject({
    method: 'GET',
    url: path,
    headers: { 'X-Shopify-Access-Token': token },
  });
}

/** Load N orders as fixtures */
async function loadOrders(app: any, count: number): Promise<void> {
  const orders = Array.from({ length: count }, (_, i) => ({
    gid: `gid://shopify/Order/${i + 1}`,
    name: `#${1000 + i}`,
    total_price: `${(i + 1) * 10}.00`,
    currency_code: 'USD',
    line_items: [{ title: `Item ${i + 1}`, quantity: 1, price: `${(i + 1) * 10}.00` }],
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/admin/fixtures/load',
    payload: { orders },
  });
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body).loaded.orders).toBe(count);
}

/** Load N products as fixtures */
async function loadProducts(app: any, count: number): Promise<void> {
  const products = Array.from({ length: count }, (_, i) => ({
    gid: `gid://shopify/Product/${i + 1}`,
    title: `Product ${i + 1}`,
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/admin/fixtures/load',
    payload: { products },
  });
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body).loaded.products).toBe(count);
}

describe('Pagination Integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();

    // Seed token directly — POST /admin/tokens bypasses Phase 23 OAuth tightening
    // (client_id + client_secret required for /admin/oauth/access_token)
    const t = randomUUID();
    await app.inject({
      method: 'POST',
      url: '/admin/tokens',
      payload: { token: t, shopDomain: 'twin.myshopify.com' },
    });
    token = t;
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 1: orders(first: 5) with 15 orders — returns 5 edges, hasNextPage=true
  // ---------------------------------------------------------------------------
  it('orders(first: 5) returns 5 edges with cursors, hasNextPage=true, hasPreviousPage=false', async () => {
    await loadOrders(app, 15);

    const body = await gql(app, token, `{
      orders(first: 5) {
        edges {
          cursor
          node { id name }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`);

    expect(body.errors).toBeUndefined();
    const { edges, pageInfo } = body.data.orders;

    expect(edges).toHaveLength(5);
    // Every edge must have a cursor
    for (const edge of edges) {
      expect(edge.cursor).toBeTruthy();
      expect(typeof edge.cursor).toBe('string');
    }

    expect(pageInfo.hasNextPage).toBe(true);
    expect(pageInfo.hasPreviousPage).toBe(false);
    expect(pageInfo.startCursor).toBe(edges[0].cursor);
    expect(pageInfo.endCursor).toBe(edges[4].cursor);
  });

  // ---------------------------------------------------------------------------
  // Test 2: forward navigation — use endCursor as after
  // ---------------------------------------------------------------------------
  it('forward navigation: using endCursor from page 1 as after returns next 5 orders', async () => {
    await loadOrders(app, 15);

    // Page 1
    const page1 = await gql(app, token, `{
      orders(first: 5) {
        edges { cursor node { id } }
        pageInfo { hasNextPage hasPreviousPage endCursor }
      }
    }`);
    const endCursor1 = page1.data.orders.pageInfo.endCursor;
    const page1Ids = page1.data.orders.edges.map((e: any) => e.node.id);

    // Page 2
    const page2 = await gql(app, token, `{
      orders(first: 5, after: "${endCursor1}") {
        edges { cursor node { id } }
        pageInfo { hasNextPage hasPreviousPage endCursor }
      }
    }`);

    expect(page2.errors).toBeUndefined();
    const { edges: edges2, pageInfo: pageInfo2 } = page2.data.orders;

    expect(edges2).toHaveLength(5);
    expect(pageInfo2.hasNextPage).toBe(true);
    expect(pageInfo2.hasPreviousPage).toBe(true);

    // Page 2 IDs must not overlap with page 1 IDs
    const page2Ids = edges2.map((e: any) => e.node.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: exhaustive forward traversal — total items should equal 15
  // ---------------------------------------------------------------------------
  it('exhaustive forward traversal of 15 orders yields total of 15 unique items', async () => {
    await loadOrders(app, 15);

    const allIds: string[] = [];
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const afterArg = after ? `, after: "${after}"` : '';
      const body = await gql(app, token, `{
        orders(first: 5${afterArg}) {
          edges { cursor node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }`);

      expect(body.errors).toBeUndefined();
      const { edges, pageInfo } = body.data.orders;

      for (const edge of edges) {
        allIds.push(edge.node.id);
      }

      hasNextPage = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }

    expect(allIds).toHaveLength(15);
    // All IDs must be unique
    expect(new Set(allIds).size).toBe(15);
  });

  // ---------------------------------------------------------------------------
  // Test 4: products(first: 3) with 5 products — hasNextPage=true
  // ---------------------------------------------------------------------------
  it('products(first: 3) with 5 products returns 3 edges with hasNextPage=true', async () => {
    await loadProducts(app, 5);

    const body = await gql(app, token, `{
      products(first: 3) {
        edges {
          cursor
          node { id title }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`);

    expect(body.errors).toBeUndefined();
    const { edges, pageInfo } = body.data.products;

    expect(edges).toHaveLength(3);
    expect(pageInfo.hasNextPage).toBe(true);
    expect(pageInfo.hasPreviousPage).toBe(false);
    for (const edge of edges) {
      expect(edge.cursor).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: ordering is deterministic — same query twice returns same order
  // ---------------------------------------------------------------------------
  it('ordering is deterministic: same query twice returns same id sequence', async () => {
    await loadOrders(app, 10);

    const query = `{
      orders(first: 10) {
        edges { node { id } }
      }
    }`;

    const body1 = await gql(app, token, query);
    const body2 = await gql(app, token, query);

    expect(body1.errors).toBeUndefined();
    expect(body2.errors).toBeUndefined();

    const ids1 = body1.data.orders.edges.map((e: any) => e.node.id);
    const ids2 = body2.data.orders.edges.map((e: any) => e.node.id);

    expect(ids1).toEqual(ids2);
  });

  // ---------------------------------------------------------------------------
  // Test 6: invalid cursor (wrong resource type) returns error
  // ---------------------------------------------------------------------------
  it('using a Product cursor as after on orders query returns a GraphQL error', async () => {
    await loadOrders(app, 5);
    await loadProducts(app, 3);

    // Get a product cursor
    const productsBody = await gql(app, token, `{
      products(first: 1) {
        edges { cursor }
        pageInfo { endCursor }
      }
    }`);
    const productCursor = productsBody.data.products.pageInfo.endCursor;

    // Inject that cursor into an orders query
    const body = await gql(app, token, `{
      orders(first: 5, after: "${productCursor}") {
        edges { node { id } }
        pageInfo { hasNextPage }
      }
    }`);

    // Should return a GraphQL error due to cross-resource cursor rejection
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].message).toMatch(/resource type/i);
  });

  it('GraphQL via 2025-01 route returns valid data (transport parity)', async () => {
    await loadOrders(app, 3);
    const body = await gql(app, token, `{
      orders(first: 3) {
        edges { node { id } }
        pageInfo { hasNextPage }
      }
    }`, '2025-01');
    expect(body.errors).toBeUndefined();
    expect(body.data.orders.edges).toHaveLength(3);
  });

  // ---------------------------------------------------------------------------
  // Bonus: customers pagination works identically
  // ---------------------------------------------------------------------------
  it('customers(first: 2) with 4 customers returns 2 edges with hasNextPage=true', async () => {
    // Load 4 customers via fixtures
    const customers = Array.from({ length: 4 }, (_, i) => ({
      gid: `gid://shopify/Customer/${i + 1}`,
      email: `customer${i + 1}@example.com`,
    }));

    const loadRes = await app.inject({
      method: 'POST',
      url: '/admin/fixtures/load',
      payload: { customers },
    });
    expect(JSON.parse(loadRes.body).loaded.customers).toBe(4);

    const body = await gql(app, token, `{
      customers(first: 2) {
        edges {
          cursor
          node { id email }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }`);

    expect(body.errors).toBeUndefined();
    const { edges, pageInfo } = body.data.customers;
    expect(edges).toHaveLength(2);
    expect(pageInfo.hasNextPage).toBe(true);
    expect(pageInfo.hasPreviousPage).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // REST cursor pagination (SHOP-23) — RED until Plan 02
  // ---------------------------------------------------------------------------
  describe('REST cursor pagination (SHOP-23)', () => {
    it('GET products.json page 1 with 5 products returns Link rel=next header with page_info cursor', async () => {
      // Seed 5 products via fixtures/load
      await loadProducts(app, 5);

      const response = await restRequest(app, token, '/admin/api/2025-01/products.json?limit=3');
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.products).toHaveLength(3);

      const link = response.headers['link'] as string;
      expect(link).toBeDefined();
      expect(link).toContain('rel="next"');
      expect(link).toContain('page_info=');
      expect(link).toContain('limit=3');
    });

    it('GET products.json page 2 via cursor returns remaining items with Link rel=previous only', async () => {
      // Seed 5 products via fixtures/load
      await loadProducts(app, 5);

      // Get page 1 to obtain the cursor
      const page1Response = await restRequest(app, token, '/admin/api/2025-01/products.json?limit=3');
      expect(page1Response.statusCode).toBe(200);

      const page1Link = page1Response.headers['link'] as string;
      expect(page1Link).toBeDefined();
      expect(page1Link).toContain('rel="next"');

      // Extract page_info cursor from Link header
      // Link header format: <URL?page_info=CURSOR&limit=3>; rel="next"
      const match = page1Link.match(/page_info=([^&>]+)/);
      expect(match).toBeTruthy();
      const cursor = match![1];

      // Get page 2 via cursor
      const page2Response = await restRequest(
        app,
        token,
        `/admin/api/2025-01/products.json?page_info=${cursor}&limit=3`
      );
      expect(page2Response.statusCode).toBe(200);

      const page2Body = JSON.parse(page2Response.body);
      // 5 products total, page 1 has 3, page 2 should have remaining 2
      expect(page2Body.products).toHaveLength(2);

      // Page 1 and page 2 products must not overlap
      const page1Body = JSON.parse(page1Response.body);
      const page1Ids = page1Body.products.map((p: any) => p.id);
      const page2Ids = page2Body.products.map((p: any) => p.id);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }

      // Page 2 (last page) Link header must have rel="previous" but NOT rel="next"
      const page2Link = page2Response.headers['link'] as string | undefined;
      if (page2Link) {
        expect(page2Link).toContain('rel="previous"');
        expect(page2Link).not.toContain('rel="next"');
      } else {
        // If no link header at all, that's also wrong — we expect a previous link
        expect(page2Link).toBeDefined();
      }
    });

    it('GET products.json with invalid page_info cursor returns 400', async () => {
      const response = await restRequest(
        app,
        token,
        '/admin/api/2025-01/products.json?page_info=notvalidbase64!!!'
      );
      expect(response.statusCode).toBe(400);
    });

    it('GET orders.json paginates with correct resource type', async () => {
      // Seed 3 orders via fixtures/load
      await loadOrders(app, 3);

      const response = await restRequest(app, token, '/admin/api/2025-01/orders.json?limit=2');
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.orders).toHaveLength(2);

      const link = response.headers['link'] as string;
      expect(link).toBeDefined();
      expect(link).toContain('page_info=');
    });
  });

  // ---------------------------------------------------------------------------
  // Collection-filter version routing regression (Phase 39-04)
  // ---------------------------------------------------------------------------
  describe('Collection-filter version-routing regression (Phase 39-04)', () => {
    it('collection_id filter returns same products for 2025-01 and 2024-01 and echoes x-shopify-api-version', async () => {
      // Create a product
      const productRes = await app.inject({
        method: 'POST',
        url: '/admin/api/2025-01/products.json',
        headers: { 'X-Shopify-Access-Token': token, 'content-type': 'application/json' },
        payload: { product: { title: 'Version Parity Product' } },
      });
      expect(productRes.statusCode).toBe(201);
      const productBody = JSON.parse(productRes.body) as { product: { id: number } };
      const productId = productBody.product.id;

      // Create a custom collection via 2025-01
      const collRes = await app.inject({
        method: 'POST',
        url: '/admin/api/2025-01/custom_collections.json',
        headers: { 'X-Shopify-Access-Token': token, 'content-type': 'application/json' },
        payload: { custom_collection: { title: 'Version Regression Collection' } },
      });
      expect(collRes.statusCode).toBe(201);
      const collBody = JSON.parse(collRes.body) as { custom_collection: { id: number } };
      const collectionId = collBody.custom_collection.id;

      // Create a collect via 2024-01
      const collectRes = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/collects.json',
        headers: { 'X-Shopify-Access-Token': token, 'content-type': 'application/json' },
        payload: { collect: { product_id: productId, collection_id: collectionId } },
      });
      expect(collectRes.statusCode).toBe(201);

      // GET /admin/api/2025-01/products.json?collection_id=<id>
      const res2501 = await restRequest(
        app, token,
        `/admin/api/2025-01/products.json?collection_id=${collectionId}`
      );
      expect(res2501.statusCode).toBe(200);
      const body2501 = JSON.parse(res2501.body) as { products: Array<{ id: number }> };
      const ids2501 = body2501.products.map((p: any) => p.id);

      // GET /admin/api/2024-01/products.json?collection_id=<id>
      const res2401 = await restRequest(
        app, token,
        `/admin/api/2024-01/products.json?collection_id=${collectionId}`
      );
      expect(res2401.statusCode).toBe(200);
      const body2401 = JSON.parse(res2401.body) as { products: Array<{ id: number }> };
      const ids2401 = body2401.products.map((p: any) => p.id);

      // Both versions must return the same product IDs
      expect(ids2501.sort()).toEqual(ids2401.sort());
      expect(ids2501).toContain(productId);

      // 2025-01 response must echo x-shopify-api-version: 2025-01
      expect(res2501.headers['x-shopify-api-version']).toBe('2025-01');
    });
  });

  // ---------------------------------------------------------------------------
  // Version policy (SHOP-17) — RED until Plan 03
  // ---------------------------------------------------------------------------
  describe('Version policy (SHOP-17)', () => {
    it('GET with invalid month 2024-99 returns 400', async () => {
      const response = await restRequest(app, token, '/admin/api/2024-99/products.json');
      expect(response.statusCode).toBe(400);
    });

    it('GET with sunset version 2023-01 returns 400', async () => {
      const response = await restRequest(app, token, '/admin/api/2023-01/products.json');
      expect(response.statusCode).toBe(400);
    });
  });
});
