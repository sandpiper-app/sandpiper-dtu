/**
 * Integration tests for order lifecycle: fulfillment and close state transitions.
 *
 * Tests verify (SHOP-06):
 * - New orders default to UNFULFILLED/PENDING status
 * - fulfillmentCreate updates parent order displayFulfillmentStatus to FULFILLED
 * - orderClose succeeds when order is FULFILLED and financially complete
 * - Invalid transitions return GraphQL userErrors
 * - State transitions trigger orders/update webhook delivery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';

/** Helper: make a GraphQL request to the twin */
async function gql(app: any, token: string, query: string): Promise<any> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/api/2024-01/graphql.json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: { query },
  });
  return JSON.parse(response.body);
}

/** Helper: get a fresh auth token */
async function getToken(app: any, code = 'test-order-lifecycle'): Promise<string> {
  const oauthResponse = await app.inject({
    method: 'POST',
    url: '/admin/oauth/access_token',
    payload: { code },
  });
  return JSON.parse(oauthResponse.body).access_token;
}

/** Helper: create an order and return its GID */
async function createOrder(
  app: any,
  token: string,
  financialStatus?: string
): Promise<string> {
  const financialStatusArg = financialStatus ? `, financialStatus: ${financialStatus}` : '';
  const body = await gql(app, token, `mutation {
    orderCreate(input: {
      lineItems: [{ title: "Test Item", quantity: 1, price: "10.00" }],
      totalPrice: "10.00",
      currencyCode: "USD"
      ${financialStatusArg}
    }) {
      order {
        id
        displayFulfillmentStatus
        displayFinancialStatus
        closedAt
      }
      userErrors { field message }
    }
  }`);
  expect(body.errors).toBeUndefined();
  expect(body.data.orderCreate.userErrors).toHaveLength(0);
  return body.data.orderCreate.order.id;
}

/** Helper: create a fulfillment for an order, return the full response body */
async function fulfillOrder(app: any, token: string, orderId: string): Promise<any> {
  return gql(app, token, `mutation {
    fulfillmentCreate(input: {
      orderId: "${orderId}",
      status: "success"
    }) {
      fulfillment { id status }
      userErrors { field message }
    }
  }`);
}

/** Helper: close an order, return the full response body */
async function closeOrder(app: any, token: string, orderId: string): Promise<any> {
  return gql(app, token, `mutation {
    orderClose(input: { id: "${orderId}" }) {
      order {
        id
        displayFulfillmentStatus
        displayFinancialStatus
        closedAt
      }
      userErrors { field message }
    }
  }`);
}

/** Helper: query an order by ID */
async function queryOrder(app: any, token: string, orderId: string): Promise<any> {
  const body = await gql(app, token, `{
    order(id: "${orderId}") {
      id
      displayFulfillmentStatus
      displayFinancialStatus
      closedAt
    }
  }`);
  return body.data?.order;
}

describe('Order Lifecycle Integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();
    token = await getToken(app);
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Happy path — create -> fulfill -> close
  // ---------------------------------------------------------------------------
  it('happy path: create (UNFULFILLED/PENDING) -> fulfill (FULFILLED) -> close (closedAt set)', async () => {
    // Create order with PAID financial status (needed for close)
    const createBody = await gql(app, token, `mutation {
      orderCreate(input: {
        lineItems: [{ title: "Widget", quantity: 1, price: "99.00" }],
        totalPrice: "99.00",
        currencyCode: "USD",
        financialStatus: PAID
      }) {
        order {
          id
          displayFulfillmentStatus
          displayFinancialStatus
          closedAt
        }
        userErrors { field message }
      }
    }`);

    expect(createBody.errors).toBeUndefined();
    expect(createBody.data.orderCreate.userErrors).toHaveLength(0);

    const order = createBody.data.orderCreate.order;
    expect(order.displayFulfillmentStatus).toBe('UNFULFILLED');
    expect(order.displayFinancialStatus).toBe('PAID');
    expect(order.closedAt).toBeNull();

    const orderId = order.id;

    // Fulfill the order
    const fulfillBody = await fulfillOrder(app, token, orderId);
    expect(fulfillBody.errors).toBeUndefined();
    expect(fulfillBody.data.fulfillmentCreate.userErrors).toHaveLength(0);
    expect(fulfillBody.data.fulfillmentCreate.fulfillment).not.toBeNull();

    // Verify order status updated to FULFILLED
    const afterFulfill = await queryOrder(app, token, orderId);
    expect(afterFulfill.displayFulfillmentStatus).toBe('FULFILLED');
    expect(afterFulfill.closedAt).toBeNull();

    // Close the order
    const closeBody = await closeOrder(app, token, orderId);
    expect(closeBody.errors).toBeUndefined();
    expect(closeBody.data.orderClose.userErrors).toHaveLength(0);
    expect(closeBody.data.orderClose.order).not.toBeNull();
    expect(closeBody.data.orderClose.order.closedAt).not.toBeNull();
    expect(closeBody.data.orderClose.order.displayFulfillmentStatus).toBe('FULFILLED');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Fulfill already-fulfilled order -> userErrors
  // ---------------------------------------------------------------------------
  it('fulfilling an already-fulfilled order returns userErrors', async () => {
    const orderId = await createOrder(app, token, 'PAID');

    // First fulfillment succeeds
    const first = await fulfillOrder(app, token, orderId);
    expect(first.data.fulfillmentCreate.userErrors).toHaveLength(0);

    // Second fulfillment should fail
    const second = await fulfillOrder(app, token, orderId);
    expect(second.errors).toBeUndefined();
    expect(second.data.fulfillmentCreate.fulfillment).toBeNull();
    expect(second.data.fulfillmentCreate.userErrors).toHaveLength(1);
    expect(second.data.fulfillmentCreate.userErrors[0].message).toContain('already fulfilled');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Close unfulfilled order -> userErrors
  // ---------------------------------------------------------------------------
  it('closing an unfulfilled order returns userErrors', async () => {
    const orderId = await createOrder(app, token, 'PAID');

    const closeBody = await closeOrder(app, token, orderId);
    expect(closeBody.errors).toBeUndefined();
    expect(closeBody.data.orderClose.order).toBeNull();
    expect(closeBody.data.orderClose.userErrors).toHaveLength(1);
    expect(closeBody.data.orderClose.userErrors[0].message).toContain('fully fulfilled');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Close already-closed order -> userErrors
  // ---------------------------------------------------------------------------
  it('closing an already-closed order returns userErrors', async () => {
    const orderId = await createOrder(app, token, 'PAID');

    // Fulfill it
    await fulfillOrder(app, token, orderId);

    // Close it the first time
    const first = await closeOrder(app, token, orderId);
    expect(first.data.orderClose.userErrors).toHaveLength(0);

    // Close it again — should fail
    const second = await closeOrder(app, token, orderId);
    expect(second.errors).toBeUndefined();
    expect(second.data.orderClose.order).toBeNull();
    expect(second.data.orderClose.userErrors).toHaveLength(1);
    expect(second.data.orderClose.userErrors[0].message).toContain('already closed');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Close order with PENDING financial status -> userErrors
  // ---------------------------------------------------------------------------
  it('closing an order with PENDING financial status returns userErrors', async () => {
    // Default financial status is PENDING
    const orderId = await createOrder(app, token);

    // Fulfill it
    await fulfillOrder(app, token, orderId);

    // Try to close — financial status is PENDING, should fail
    const closeBody = await closeOrder(app, token, orderId);
    expect(closeBody.errors).toBeUndefined();
    expect(closeBody.data.orderClose.order).toBeNull();
    expect(closeBody.data.orderClose.userErrors).toHaveLength(1);
    expect(closeBody.data.orderClose.userErrors[0].message).toContain('financial transactions');
  });

  // ---------------------------------------------------------------------------
  // Test 6: fulfillmentCreate triggers orders/update webhook
  // ---------------------------------------------------------------------------
  it('fulfillmentCreate triggers orders/update webhook', async () => {
    // Subscribe to orders/update via stateManager (no real server — will go to DLQ)
    app.stateManager.createWebhookSubscription('orders/update', 'http://localhost:19999/webhook');

    const orderId = await createOrder(app, token, 'PAID');

    // Fulfill the order
    const fulfillBody = await fulfillOrder(app, token, orderId);
    expect(fulfillBody.data.fulfillmentCreate.userErrors).toHaveLength(0);

    // Wait for webhook retry attempts to fail and land in DLQ (compressed timing: 0.001x)
    // Retry schedule at 0.001x: immediate, 60ms, 300ms = max ~360ms total, +buffer
    await new Promise(resolve => setTimeout(resolve, 600));

    // Verify orders/update webhook was enqueued (it landed in DLQ since localhost:19999 is not listening)
    const dlqRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
    expect(dlqRes.statusCode).toBe(200);
    const dlq = JSON.parse(dlqRes.body);

    const ordersUpdateEntry = dlq.find((entry: any) => entry.topic === 'orders/update');
    expect(ordersUpdateEntry).toBeDefined();
    expect(ordersUpdateEntry.callbackUrl).toBe('http://localhost:19999/webhook');
  });

  // ---------------------------------------------------------------------------
  // Test 7: orderClose triggers orders/update webhook
  // ---------------------------------------------------------------------------
  it('orderClose triggers orders/update webhook', async () => {
    // Subscribe to orders/update via stateManager (no real server — will go to DLQ)
    app.stateManager.createWebhookSubscription('orders/update', 'http://localhost:19999/webhook');

    const orderId = await createOrder(app, token, 'PAID');
    await fulfillOrder(app, token, orderId);

    // Clear the DLQ from the fulfillment's webhook before testing close
    await app.inject({ method: 'DELETE', url: '/admin/dead-letter-queue' });

    // Close the order
    const closeBody = await closeOrder(app, token, orderId);
    expect(closeBody.data.orderClose.userErrors).toHaveLength(0);

    // Wait for webhook retries to exhaust
    await new Promise(resolve => setTimeout(resolve, 600));

    // Verify orders/update webhook was enqueued by orderClose
    const dlqRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
    expect(dlqRes.statusCode).toBe(200);
    const dlq = JSON.parse(dlqRes.body);

    const ordersUpdateEntry = dlq.find((entry: any) => entry.topic === 'orders/update');
    expect(ordersUpdateEntry).toBeDefined();
    expect(ordersUpdateEntry.callbackUrl).toBe('http://localhost:19999/webhook');
  });
});
