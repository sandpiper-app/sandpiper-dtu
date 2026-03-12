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

    // Get auth token
    const oauthResponse = await app.inject({
      method: 'POST',
      url: '/admin/oauth/access_token',
      payload: { code: 'test' },
    });
    token = JSON.parse(oauthResponse.body).access_token;
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

  // ---------------------------------------------------------------------------
  // Transport: version-aware Link header in REST pagination (SHOP-17, SHOP-22)
  // ---------------------------------------------------------------------------
  it('2024-01 REST products?page_info=test Link header preserves requested version', async () => {
    const response = await restRequest(app, token, '/admin/api/2024-01/products.json?page_info=test');
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-shopify-api-version']).toBe('2024-01');
    const link = response.headers['link'] as string;
    expect(link).toBeDefined();
    expect(link).toContain('/admin/api/2024-01/products.json');
  });

  it('2025-01 REST products?page_info=test Link header preserves requested version', async () => {
    const response = await restRequest(app, token, '/admin/api/2025-01/products.json?page_info=test');
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-shopify-api-version']).toBe('2025-01');
    const link = response.headers['link'] as string;
    expect(link).toBeDefined();
    expect(link).toContain('/admin/api/2025-01/products.json');
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
});
