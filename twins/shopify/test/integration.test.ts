/**
 * Integration tests for the Shopify twin application.
 *
 * Tests verify:
 * - OAuth token exchange (SHOP-02)
 * - Admin API endpoints (INFRA-03)
 * - GraphQL queries and mutations (SHOP-01)
 * - Token validation on API requests (SHOP-07)
 * - Error simulation (INFRA-04)
 * - Webhook triggering on mutations via @dtu/webhooks queue (SHOP-03)
 * - DLQ admin endpoints
 * - webhookSubscriptionCreate GraphQL mutation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';

describe('Shopify Twin Integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    // Use compressed timing and sync mode for test predictability
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // OAuth (SHOP-02)
  // ---------------------------------------------------------------------------
  describe('OAuth', () => {
    it('issues access token for authorization code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'test-code' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.access_token).toBeDefined();
      expect(body.scope).toContain('read_orders');
      expect(body.scope).toContain('write_orders');
    });

    it('issues unique tokens for different codes', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'code-1' },
      });
      const res2 = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'code-2' },
      });
      const body1 = JSON.parse(res1.body);
      const body2 = JSON.parse(res2.body);
      expect(body1.access_token).not.toBe(body2.access_token);
    });
  });

  // ---------------------------------------------------------------------------
  // Admin API (INFRA-03)
  // ---------------------------------------------------------------------------
  describe('Admin API', () => {
    it('resets state', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/reset',
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.reset).toBe(true);
      expect(body.timestamp).toBeGreaterThan(0);
    });

    it('loads fixtures', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/fixtures/load',
        payload: {
          orders: [
            {
              gid: 'gid://shopify/Order/0',
              name: '#1001',
              total_price: '100.00',
              currency_code: 'USD',
              line_items: [{ title: 'Widget', quantity: 1, price: '100.00' }],
            },
          ],
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.loaded.orders).toBe(1);
    });

    it('returns state summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/state',
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('orders');
      expect(body).toHaveProperty('products');
      expect(body).toHaveProperty('customers');
      expect(body).toHaveProperty('tokens');
      expect(body).toHaveProperty('webhooks');
    });

    it('state counts update after fixture load', async () => {
      await app.inject({
        method: 'POST',
        url: '/admin/fixtures/load',
        payload: {
          orders: [
            { gid: 'gid://shopify/Order/0', name: '#1001', total_price: '10.00', currency_code: 'USD' },
          ],
          products: [
            { gid: 'gid://shopify/Product/100', title: 'Widget' },
            { gid: 'gid://shopify/Product/101', title: 'Gadget' },
          ],
        },
      });

      const stateRes = await app.inject({ method: 'GET', url: '/admin/state' });
      const state = JSON.parse(stateRes.body);
      expect(state.orders).toBe(1);
      expect(state.products).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // GraphQL API (SHOP-01, SHOP-07)
  // ---------------------------------------------------------------------------
  describe('GraphQL API', () => {
    let token: string;

    beforeEach(async () => {
      const oauthResponse = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'test' },
      });
      token = JSON.parse(oauthResponse.body).access_token;
    });

    // -- Authentication (SHOP-07) --

    it('returns error without access token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        payload: { query: '{ orders(first:10) { edges { node { id } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].extensions.code).toBe('UNAUTHORIZED');
    });

    it('returns error with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': 'invalid-token-value' },
        payload: { query: '{ orders(first:10) { edges { node { id } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].extensions.code).toBe('UNAUTHORIZED');
    });

    // -- Queries --

    it('queries orders with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ orders(first:10) { edges { node { id name } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.orders.edges).toBeDefined();
      expect(Array.isArray(body.data.orders.edges)).toBe(true);
    });

    it('queries products with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ products(first:10) { edges { node { id title } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.products.edges).toBeDefined();
    });

    it('queries customers with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ customers(first:10) { edges { node { id email } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.customers.edges).toBeDefined();
    });

    // -- Mutations: orderCreate --

    it('creates order and returns GID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test Product", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id name }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.orderCreate.order.id).toMatch(/^gid:\/\/shopify\/Order\/\d+$/);
      expect(body.data.orderCreate.order.name).toBeDefined();
      expect(body.data.orderCreate.userErrors).toHaveLength(0);
    });

    it('returns userErrors for empty lineItems', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.orderCreate.userErrors.length).toBeGreaterThan(0);
      expect(body.data.orderCreate.order).toBeNull();
    });

    // -- Mutations: orderUpdate --

    it('updates existing order and observes state changes', async () => {
      // Create order first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id updatedAt }
              userErrors { field message }
            }
          }`,
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const orderId = createBody.data.orderCreate.order.id;
      const originalUpdatedAt = createBody.data.orderCreate.order.updatedAt;

      // Wait briefly so timestamp differs
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Update order
      const updateResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderUpdate(input: {
              id: "${orderId}",
              totalPrice: "20.00"
            }) {
              order { id totalPriceSet { shopMoney { amount } } updatedAt }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const updateBody = JSON.parse(updateResponse.body);
      expect(updateBody.data.orderUpdate.order.totalPriceSet.shopMoney.amount).toBe('20.00');
      expect(updateBody.data.orderUpdate.order.updatedAt).not.toBe(originalUpdatedAt);
      expect(updateBody.data.orderUpdate.userErrors).toHaveLength(0);
    });

    it('returns userError when updating non-existent order', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderUpdate(input: {
              id: "gid://shopify/Order/999999",
              totalPrice: "20.00"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.orderUpdate.order).toBeNull();
      expect(body.data.orderUpdate.userErrors.length).toBeGreaterThan(0);
      expect(body.data.orderUpdate.userErrors[0].message).toContain('not found');
    });

    // -- Mutations: productCreate --

    it('creates product and returns GID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            productCreate(input: {
              title: "Test Widget"
              vendor: "Acme"
            }) {
              product { id title }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.productCreate.product.id).toMatch(/^gid:\/\/shopify\/Product\/\d+$/);
      expect(body.data.productCreate.product.title).toBe('Test Widget');
      expect(body.data.productCreate.userErrors).toHaveLength(0);
    });

    // -- Mutations: productUpdate --

    it('updates existing product and observes state changes', async () => {
      // Create product first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            productCreate(input: {
              title: "Original Title"
              vendor: "Acme"
            }) {
              product { id title updatedAt }
              userErrors { field message }
            }
          }`,
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const productId = createBody.data.productCreate.product.id;
      const originalUpdatedAt = createBody.data.productCreate.product.updatedAt;

      // Wait briefly so timestamp differs
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Update product
      const updateResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            productUpdate(input: {
              id: "${productId}",
              title: "Updated Title"
            }) {
              product { id title updatedAt }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const updateBody = JSON.parse(updateResponse.body);
      expect(updateBody.data.productUpdate.product.title).toBe('Updated Title');
      expect(updateBody.data.productUpdate.product.updatedAt).not.toBe(originalUpdatedAt);
      expect(updateBody.data.productUpdate.userErrors).toHaveLength(0);
    });

    it('returns userError when updating non-existent product', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            productUpdate(input: {
              id: "gid://shopify/Product/999999",
              title: "Should Fail"
            }) {
              product { id }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.productUpdate.product).toBeNull();
      expect(body.data.productUpdate.userErrors.length).toBeGreaterThan(0);
      expect(body.data.productUpdate.userErrors[0].message).toContain('not found');
    });

    // -- Mutations: fulfillmentCreate --

    it('creates fulfillment linked to order and returns GID', async () => {
      // Create order first
      const orderResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      const orderId = JSON.parse(orderResponse.body).data.orderCreate.order.id;

      // Create fulfillment
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            fulfillmentCreate(input: {
              orderId: "${orderId}",
              status: "success",
              trackingNumber: "1Z999AA10123456784"
            }) {
              fulfillment { id status trackingNumber createdAt }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.fulfillmentCreate.fulfillment.id).toMatch(/^gid:\/\/shopify\/Fulfillment\/\d+$/);
      expect(body.data.fulfillmentCreate.fulfillment.status).toBe('success');
      expect(body.data.fulfillmentCreate.fulfillment.trackingNumber).toBe('1Z999AA10123456784');
      expect(body.data.fulfillmentCreate.userErrors).toHaveLength(0);
    });

    it('returns userError for fulfillmentCreate with invalid orderId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            fulfillmentCreate(input: {
              orderId: "not-a-gid"
            }) {
              fulfillment { id }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.fulfillmentCreate.fulfillment).toBeNull();
      expect(body.data.fulfillmentCreate.userErrors.length).toBeGreaterThan(0);
      expect(body.data.fulfillmentCreate.userErrors[0].message).toContain('Invalid order ID');
    });

    // -- Mutations: customerCreate --

    it('creates customer and returns GID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            customerCreate(input: {
              email: "test@example.com"
              firstName: "Test"
              lastName: "User"
            }) {
              customer { id email firstName lastName }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.customerCreate.customer.id).toMatch(/^gid:\/\/shopify\/Customer\/\d+$/);
      expect(body.data.customerCreate.customer.email).toBe('test@example.com');
      expect(body.data.customerCreate.userErrors).toHaveLength(0);
    });

    // -- Mutations: webhookSubscriptionCreate --

    it('registers webhook subscription via GraphQL mutation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            webhookSubscriptionCreate(
              topic: ORDERS_CREATE,
              webhookSubscription: { callbackUrl: "https://example.com/webhooks" }
            ) {
              webhookSubscription { id topic callbackUrl }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.webhookSubscriptionCreate.webhookSubscription).toBeDefined();
      expect(body.data.webhookSubscriptionCreate.webhookSubscription.id).toMatch(
        /^gid:\/\/shopify\/WebhookSubscription\/\d+$/
      );
      expect(body.data.webhookSubscriptionCreate.webhookSubscription.topic).toBe('orders/create');
      expect(body.data.webhookSubscriptionCreate.webhookSubscription.callbackUrl).toBe(
        'https://example.com/webhooks'
      );
      expect(body.data.webhookSubscriptionCreate.userErrors).toHaveLength(0);
    });

    it('webhookSubscriptionCreate is visible in state after creation', async () => {
      // Create subscription via mutation
      await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            webhookSubscriptionCreate(
              topic: PRODUCTS_CREATE,
              webhookSubscription: { callbackUrl: "https://example.com/webhooks" }
            ) {
              webhookSubscription { id }
              userErrors { field message }
            }
          }`,
        },
      });

      // Verify visible in state
      const stateRes = await app.inject({ method: 'GET', url: '/admin/state' });
      const state = JSON.parse(stateRes.body);
      expect(state.webhooks).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Simulation (INFRA-04)
  // ---------------------------------------------------------------------------
  describe('Error Simulation', () => {
    let token: string;

    beforeEach(async () => {
      const oauthResponse = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'test' },
      });
      token = JSON.parse(oauthResponse.body).access_token;
    });

    it('returns configured 429 THROTTLED error for operation', async () => {
      // Configure error
      await app.inject({
        method: 'POST',
        url: '/admin/errors/configure',
        payload: {
          operationName: 'orderCreate',
          statusCode: 429,
          errorBody: { message: 'Throttled' },
        },
      });

      // Enable error simulation
      await app.inject({
        method: 'POST',
        url: '/admin/errors/enable',
      });

      // Attempt mutation
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].extensions.code).toBe('THROTTLED');
    });

    it('does not simulate errors when disabled', async () => {
      // Configure error
      await app.inject({
        method: 'POST',
        url: '/admin/errors/configure',
        payload: { operationName: 'orderCreate', statusCode: 500 },
      });

      // Explicitly disable
      await app.inject({ method: 'POST', url: '/admin/errors/disable' });

      // Attempt mutation -- should succeed
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.data.orderCreate.order).toBeDefined();
      expect(body.data.orderCreate.order.id).toBeDefined();
      expect(body.errors).toBeUndefined();
    });

    it('error simulation can be toggled on and off', async () => {
      // Configure
      await app.inject({
        method: 'POST',
        url: '/admin/errors/configure',
        payload: {
          operationName: 'orderCreate',
          statusCode: 401,
          errorBody: { message: 'Unauthorized' },
        },
      });

      // Enable
      const enableRes = await app.inject({ method: 'POST', url: '/admin/errors/enable' });
      expect(JSON.parse(enableRes.body).enabled).toBe(true);

      // Verify error is thrown
      const errorRes = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "T", quantity: 1}],
              totalPrice: "1.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      expect(JSON.parse(errorRes.body).errors).toBeDefined();

      // Disable
      const disableRes = await app.inject({ method: 'POST', url: '/admin/errors/disable' });
      expect(JSON.parse(disableRes.body).enabled).toBe(false);

      // Verify mutation succeeds now
      const successRes = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "T", quantity: 1}],
              totalPrice: "1.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      const successBody = JSON.parse(successRes.body);
      expect(successBody.errors).toBeUndefined();
      expect(successBody.data.orderCreate.order).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Webhooks via @dtu/webhooks queue (SHOP-03)
  // ---------------------------------------------------------------------------
  describe('Webhooks', () => {
    let token: string;

    beforeEach(async () => {
      const oauthResponse = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'test' },
      });
      token = JSON.parse(oauthResponse.body).access_token;

      // Subscribe to webhooks via direct stateManager (fast setup)
      app.stateManager.createWebhookSubscription('orders/create', 'http://localhost:9999/webhook');
      app.stateManager.createWebhookSubscription('orders/update', 'http://localhost:9999/webhook');
      app.stateManager.createWebhookSubscription('products/update', 'http://localhost:9999/webhook');
      app.stateManager.createWebhookSubscription('fulfillments/create', 'http://localhost:9999/webhook');
    });

    it('triggers webhook on order creation (verifies order created successfully)', async () => {
      // Webhook is enqueued to localhost:9999 which won't be listening.
      // With async queue and no syncMode, delivery fails silently.
      // We verify the mutation itself succeeds.
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id name }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.orderCreate.order).toBeDefined();
      expect(body.data.orderCreate.order.id).toMatch(/^gid:\/\/shopify\/Order\/\d+$/);
    });

    it('triggers webhook on order update (verifies order updated successfully)', async () => {
      // Create order first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      const orderId = JSON.parse(createResponse.body).data.orderCreate.order.id;

      // Update order -- webhook enqueued to localhost:9999 (will fail silently)
      const updateResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderUpdate(input: { id: "${orderId}", totalPrice: "20.00" }) {
              order { id totalPriceSet { shopMoney { amount } } }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const body = JSON.parse(updateResponse.body);
      expect(body.data.orderUpdate.order).toBeDefined();
      expect(body.data.orderUpdate.order.totalPriceSet.shopMoney.amount).toBe('20.00');
    });

    it('triggers webhook on product update (verifies product updated successfully)', async () => {
      // Create product first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            productCreate(input: { title: "Original" }) {
              product { id }
              userErrors { field message }
            }
          }`,
        },
      });
      const productId = JSON.parse(createResponse.body).data.productCreate.product.id;

      // Update product -- webhook enqueued to localhost:9999 (will fail silently)
      const updateResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            productUpdate(input: { id: "${productId}", title: "Updated" }) {
              product { id title }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const body = JSON.parse(updateResponse.body);
      expect(body.data.productUpdate.product).toBeDefined();
      expect(body.data.productUpdate.product.title).toBe('Updated');
    });

    it('triggers webhook on fulfillment creation (verifies fulfillment created successfully)', async () => {
      // Create order first
      const orderResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });
      const orderId = JSON.parse(orderResponse.body).data.orderCreate.order.id;

      // Create fulfillment -- webhook enqueued to localhost:9999 (will fail silently)
      const fulfillmentResponse = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            fulfillmentCreate(input: {
              orderId: "${orderId}",
              trackingNumber: "TRACK123"
            }) {
              fulfillment { id status trackingNumber }
              userErrors { field message }
            }
          }`,
        },
      });

      expect(fulfillmentResponse.statusCode).toBe(200);
      const body = JSON.parse(fulfillmentResponse.body);
      expect(body.data.fulfillmentCreate.fulfillment).toBeDefined();
      expect(body.data.fulfillmentCreate.fulfillment.id).toMatch(/^gid:\/\/shopify\/Fulfillment\/\d+$/);
      expect(body.data.fulfillmentCreate.fulfillment.trackingNumber).toBe('TRACK123');
    });

    it('webhook subscriptions are visible in state', async () => {
      const stateRes = await app.inject({ method: 'GET', url: '/admin/state' });
      const state = JSON.parse(stateRes.body);
      expect(state.webhooks).toBe(4);
    });

    it('failed webhook deliveries appear in dead letter queue after retries (compressed timing)', { timeout: 15000 }, async () => {
      // With WEBHOOK_TIME_SCALE=0.001, the 3 retries (0, 60000ms, 300000ms)
      // complete in approximately (0 + 60 + 300) * 0.001 = 360ms
      // Use 127.0.0.1:1 (privileged port, guaranteed ECONNREFUSED) instead of
      // localhost:9999 which may have something listening in dev environments
      app.stateManager.createWebhookSubscription('orders/create', 'http://127.0.0.1:1/webhook');

      await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "Test", quantity: 1}],
              totalPrice: "10.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });

      // Poll for DLQ entry — wait for webhook queue to drain (all retries exhausted)
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const pollRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
        if (JSON.parse(pollRes.body).length > 0) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Check DLQ via admin endpoint
      const dlqRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
      expect(dlqRes.statusCode).toBe(200);
      const dlq = JSON.parse(dlqRes.body);
      expect(Array.isArray(dlq)).toBe(true);
      expect(dlq.length).toBeGreaterThan(0);
      const dlqEntry = dlq.find((e: any) => e.callbackUrl === 'http://127.0.0.1:1/webhook');
      expect(dlqEntry).toBeDefined();
      expect(dlqEntry.topic).toBe('orders/create');
    });
  });

  // ---------------------------------------------------------------------------
  // DLQ Admin Endpoints
  // ---------------------------------------------------------------------------
  describe('Dead Letter Queue Admin Endpoints', () => {
    it('GET /admin/dead-letter-queue returns empty array when queue is empty', async () => {
      const response = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    it('DELETE /admin/dead-letter-queue clears the queue', { timeout: 15000 }, async () => {
      // Add something to DLQ first by triggering a webhook failure with compressed timing.
      // Use 127.0.0.1:1 (privileged port, guaranteed ECONNREFUSED) instead of
      // localhost:9999 which may have something listening in dev environments
      const oauthResponse = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'dlq-test' },
      });
      const token = JSON.parse(oauthResponse.body).access_token;

      app.stateManager.createWebhookSubscription('orders/create', 'http://127.0.0.1:1/webhook');

      await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: `mutation {
            orderCreate(order: {
              lineItems: [{title: "T", quantity: 1}],
              totalPrice: "1.00",
              currencyCode: "USD"
            }) {
              order { id }
              userErrors { field message }
            }
          }`,
        },
      });

      // Poll for DLQ entry — wait for webhook queue to drain (all retries exhausted)
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const pollRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
        if (JSON.parse(pollRes.body).length > 0) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Clear DLQ
      const clearRes = await app.inject({ method: 'DELETE', url: '/admin/dead-letter-queue' });
      expect(clearRes.statusCode).toBe(200);
      expect(JSON.parse(clearRes.body).cleared).toBe(true);

      // Verify empty
      const listRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
      const dlq = JSON.parse(listRes.body);
      expect(dlq.length).toBe(0);
    });

    it('GET /admin/dead-letter-queue/:id returns 404 for missing entry', async () => {
      const response = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue/999' });
      expect(response.statusCode).toBe(404);
    });

    it('DELETE /admin/dead-letter-queue/:id returns 404 for missing entry', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/admin/dead-letter-queue/999' });
      expect(response.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------
  describe('Health Check', () => {
    it('returns 200 with status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  // ---------------------------------------------------------------------------
  // Version routing and response headers (SHOP-17, SHOP-22)
  // ---------------------------------------------------------------------------
  describe('Version routing and response headers', () => {
    let token: string;

    beforeEach(async () => {
      const oauthResponse = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        payload: { code: 'version-test' },
      });
      token = JSON.parse(oauthResponse.body).access_token;
    });

    it('2024-01 GraphQL route returns 200 with valid GraphQL response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ orders(first: 1) { edges { node { id } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.errors).toBeUndefined();
    });

    it('2025-01 GraphQL route returns 200 with valid GraphQL response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2025-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ orders(first: 1) { edges { node { id } } } }' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.errors).toBeUndefined();
    });

    it('2024-01 GraphQL route echoes x-shopify-api-version: 2024-01', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ orders(first: 1) { edges { node { id } } } }' },
      });
      expect(response.headers['x-shopify-api-version']).toBe('2024-01');
    });

    it('2025-01 GraphQL route echoes x-shopify-api-version: 2025-01', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2025-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: { query: '{ orders(first: 1) { edges { node { id } } } }' },
      });
      expect(response.headers['x-shopify-api-version']).toBe('2025-01');
    });

    it('unauthorized 2024-01 request still echoes x-shopify-api-version: 2024-01', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': 'invalid-token' },
        payload: { query: '{ orders(first: 1) { edges { node { id } } } }' },
      });
      // Yoga returns 200 with GraphQL UNAUTHORIZED error
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-shopify-api-version']).toBe('2024-01');
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].extensions.code).toBe('UNAUTHORIZED');
    });

    it('unauthorized 2025-01 request still echoes x-shopify-api-version: 2025-01', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2025-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': 'invalid-token' },
        payload: { query: '{ orders(first: 1) { edges { node { id } } } }' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-shopify-api-version']).toBe('2025-01');
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].extensions.code).toBe('UNAUTHORIZED');
    });
  });

  // ---------------------------------------------------------------------------
  // API Conformance: OAuth form-urlencoded (SHOP-02)
  // ---------------------------------------------------------------------------
  describe('API Conformance: OAuth form-urlencoded', () => {
    it('accepts form-urlencoded body for token exchange', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'code=test-auth-code',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.access_token).toBeDefined();
      expect(body.scope).toContain('read_orders');
    });

    it('issues unique token via form-urlencoded and it works for GraphQL auth', async () => {
      // Get token via form-urlencoded OAuth
      const oauthRes = await app.inject({
        method: 'POST',
        url: '/admin/oauth/access_token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'code=form-test-code',
      });
      expect(oauthRes.statusCode).toBe(200);
      const { access_token } = oauthRes.json();
      expect(access_token).toBeDefined();

      // Use that token for a GraphQL query
      const gqlRes = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': access_token },
        payload: { query: '{ orders(first:5) { edges { node { id } } } }' },
      });
      expect(gqlRes.statusCode).toBe(200);
      const gqlBody = gqlRes.json();
      expect(gqlBody.data.orders).toBeDefined();
      expect(gqlBody.errors).toBeUndefined();
    });
  });
});
