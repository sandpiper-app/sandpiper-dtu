/**
 * Integration tests for REST resource persistence (SHOP-20).
 *
 * Verifies:
 * - SHOP-20a: POST /products.json creates a product with numeric id and admin_graphql_api_id
 * - SHOP-20b: GET /products/:id.json retrieves a previously created product (and 404 for missing)
 * - SHOP-20c: GET /orders/:id.json returns a specific order by numeric ID, not first-order fallback
 *
 * These tests are written in RED state — they fail against the current stub implementation
 * and will be made green by Plan 02 (REST persistence implementation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/index.js';

describe('REST Resource Persistence', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();

    // Seed a token via POST /admin/tokens (bypasses OAuth — survives Phase 23 tightening)
    const seedToken = randomUUID();
    await app.inject({
      method: 'POST',
      url: '/admin/tokens',
      payload: { token: seedToken, shopDomain: 'twin.myshopify.com' },
    });
    token = seedToken;
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // SHOP-20a: POST /products.json creates product with numeric id + admin_graphql_api_id
  // ---------------------------------------------------------------------------
  describe('SHOP-20a — POST /products.json creates product with correct shape', () => {
    it('returns 201 with numeric id and admin_graphql_api_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/products.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { product: { title: 'Widget' } },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      expect(body.product).toBeDefined();

      // id must be a numeric integer, NOT a GID string
      expect(typeof body.product.id).toBe('number');
      expect(Number.isInteger(body.product.id)).toBe(true);
      expect(body.product.id).toBeGreaterThan(0);

      // admin_graphql_api_id must be a GID string derived from the numeric id
      expect(body.product.admin_graphql_api_id).toBe(
        `gid://shopify/Product/${body.product.id}`
      );

      // title must match what was sent
      expect(body.product.title).toBe('Widget');
    });
  });

  // ---------------------------------------------------------------------------
  // SHOP-20b: GET /products/:id.json retrieves a previously created product
  // ---------------------------------------------------------------------------
  describe('SHOP-20b — GET /products/:id.json retrieves created product', () => {
    it('returns the product with matching id and title after POST', async () => {
      // Create the product first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/products.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { product: { title: 'Widget' } },
      });
      expect(createResponse.statusCode).toBe(201);
      const created = JSON.parse(createResponse.body);
      const id = created.product.id;

      // Retrieve by numeric id
      const getResponse = await app.inject({
        method: 'GET',
        url: `/admin/api/2024-01/products/${id}.json`,
        headers: { 'X-Shopify-Access-Token': token },
      });

      expect(getResponse.statusCode).toBe(200);
      const body = JSON.parse(getResponse.body);

      expect(body.product).toBeDefined();
      expect(body.product.id).toBe(id);
      expect(body.product.title).toBe('Widget');
    });

    it('returns 404 with errors for a non-existent product id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/api/2024-01/products/99999999.json',
        headers: { 'X-Shopify-Access-Token': token },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // SHOP-20c: GET /orders/:id.json returns specific order by numeric ID
  //           (not first-order fallback — both orders must return correct data)
  // ---------------------------------------------------------------------------
  describe('SHOP-20c — GET /orders/:id.json returns specific order by id', () => {
    it('returns the correct order for each id (catches first-order fallback bug)', async () => {
      // Load two distinct orders as fixtures
      const fixtureResponse = await app.inject({
        method: 'POST',
        url: '/admin/fixtures/load',
        payload: {
          orders: [
            { name: '#1001', total_price: '50.00', currency_code: 'USD' },
            { name: '#1002', total_price: '75.00', currency_code: 'USD' },
          ],
        },
      });
      expect(fixtureResponse.statusCode).toBe(200);

      // List all orders to get both actual numeric ids from the response
      const listResponse = await app.inject({
        method: 'GET',
        url: '/admin/api/2024-01/orders.json',
        headers: { 'X-Shopify-Access-Token': token },
      });
      expect(listResponse.statusCode).toBe(200);
      const listBody = JSON.parse(listResponse.body);
      expect(listBody.orders).toBeDefined();
      expect(listBody.orders.length).toBeGreaterThanOrEqual(2);

      // Find our two orders by name
      const order1 = listBody.orders.find((o: any) => o.name === '#1001');
      const order2 = listBody.orders.find((o: any) => o.name === '#1002');
      expect(order1).toBeDefined();
      expect(order2).toBeDefined();

      const id1 = order1.id;
      const id2 = order2.id;

      // Both ids must be numeric integers
      expect(typeof id1).toBe('number');
      expect(typeof id2).toBe('number');

      // They must be distinct
      expect(id1).not.toBe(id2);

      // GET order 1 by id — must return #1001, not #1002
      const get1Response = await app.inject({
        method: 'GET',
        url: `/admin/api/2024-01/orders/${id1}.json`,
        headers: { 'X-Shopify-Access-Token': token },
      });
      expect(get1Response.statusCode).toBe(200);
      const body1 = JSON.parse(get1Response.body);
      expect(body1.order).toBeDefined();
      expect(body1.order.id).toBe(id1);
      expect(body1.order.name).toBe('#1001');

      // GET order 2 by id — must return #1002, not #1001
      const get2Response = await app.inject({
        method: 'GET',
        url: `/admin/api/2024-01/orders/${id2}.json`,
        headers: { 'X-Shopify-Access-Token': token },
      });
      expect(get2Response.statusCode).toBe(200);
      const body2 = JSON.parse(get2Response.body);
      expect(body2.order).toBeDefined();
      expect(body2.order.id).toBe(id2);
      expect(body2.order.name).toBe('#1002');
    });

    it('returns 404 with errors for a non-existent order id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/api/2024-01/orders/99999999.json',
        headers: { 'X-Shopify-Access-Token': token },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
    });
  });
});
