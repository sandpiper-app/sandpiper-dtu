/**
 * Integration tests for GraphQL rate limiting.
 *
 * Verifies:
 * - Successful responses include extensions.cost with throttleStatus
 * - High-cost queries exhaust the bucket and return HTTP 429 with Retry-After
 * - 429 response body matches Shopify throttled format
 * - /admin/reset clears the rate limiter (next request succeeds)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';

describe('GraphQL Rate Limiting', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();

    // Get a valid access token
    const oauthResponse = await app.inject({
      method: 'POST',
      url: '/admin/oauth/access_token',
      payload: { code: 'test-rate-limit' },
    });
    token = JSON.parse(oauthResponse.body).access_token;
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Successful response includes extensions.cost
  // ---------------------------------------------------------------------------
  describe('extensions.cost on successful responses', () => {
    it('includes extensions.cost with requestedQueryCost and throttleStatus', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: '{ orders(first: 10) { edges { node { id name } } } }',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have data
      expect(body.data).toBeDefined();
      expect(body.data.orders).toBeDefined();

      // Should have extensions.cost
      expect(body.extensions).toBeDefined();
      expect(body.extensions.cost).toBeDefined();

      const cost = body.extensions.cost;
      expect(typeof cost.requestedQueryCost).toBe('number');
      expect(cost.requestedQueryCost).toBeGreaterThan(0);
      expect(cost.actualQueryCost).toBeLessThanOrEqual(cost.requestedQueryCost);

      // throttleStatus must match Shopify format
      expect(cost.throttleStatus).toBeDefined();
      expect(cost.throttleStatus.maximumAvailable).toBe(1000);
      expect(typeof cost.throttleStatus.currentlyAvailable).toBe('number');
      expect(cost.throttleStatus.currentlyAvailable).toBeGreaterThanOrEqual(0);
      expect(cost.throttleStatus.restoreRate).toBe(50);
    });

    it('currentlyAvailable decreases after each query', async () => {
      const sendQuery = () => app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: '{ orders(first: 10) { edges { node { id } } } }',
        },
      });

      const res1 = await sendQuery();
      const res2 = await sendQuery();

      const cost1 = JSON.parse(res1.body).extensions.cost;
      const cost2 = JSON.parse(res2.body).extensions.cost;

      // Second request should have less available than the first
      expect(cost2.throttleStatus.currentlyAvailable).toBeLessThan(
        cost1.throttleStatus.currentlyAvailable
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Throttling — exhausting the bucket returns HTTP 429
  // ---------------------------------------------------------------------------
  describe('throttling', () => {
    it('returns HTTP 429 with Retry-After when bucket is depleted', async () => {
      // Use a very expensive query to exhaust the 1000-point bucket quickly.
      // orders(first:250) within integration test needs to resolve — but since
      // we're testing throttling (HTTP level), we can use a high-cost query
      // that the twin would accept schema-wise.
      // Cost: orders(first:250) = 2+250=252, edges=1*250=250, node=1*250=250, id=0 → total=752
      // Two such queries would exhaust 1504 > 1000 so second gets throttled.

      const expensiveQuery = `{
        orders(first: 250) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`;

      // Reset first to ensure we start from a fresh bucket
      await app.inject({ method: 'POST', url: '/admin/reset' });

      const responses: number[] = [];
      let throttledResponse: any = null;

      // Send requests until we get a 429
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/api/2024-01/graphql.json',
          headers: { 'X-Shopify-Access-Token': token },
          payload: { query: expensiveQuery },
        });
        responses.push(res.statusCode);
        if (res.statusCode === 429) {
          throttledResponse = res;
          break;
        }
      }

      // At least one 429 should have been returned
      expect(responses).toContain(429);
      expect(throttledResponse).not.toBeNull();

      // Verify Retry-After header is present
      const retryAfter = throttledResponse.headers['retry-after'];
      expect(retryAfter).toBeDefined();
      expect(parseInt(retryAfter, 10)).toBeGreaterThan(0);

      // Verify Shopify-format error body
      const body = JSON.parse(throttledResponse.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toBe('Throttled');

      expect(body.extensions).toBeDefined();
      expect(body.extensions.cost).toBeDefined();
      expect(body.extensions.cost.requestedQueryCost).toBeGreaterThan(0);
      expect(body.extensions.cost.actualQueryCost).toBeNull();
      expect(body.extensions.cost.throttleStatus).toBeDefined();
      expect(body.extensions.cost.throttleStatus.maximumAvailable).toBe(1000);
      expect(body.extensions.cost.throttleStatus.restoreRate).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: /admin/reset clears rate limiter state
  // ---------------------------------------------------------------------------
  describe('/admin/reset clears rate limiter', () => {
    it('subsequent query succeeds after reset', async () => {
      // Use a high-cost query to consume most of the bucket
      const expensiveQuery = `{
        orders(first: 100) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`;

      // Exhaust budget with multiple requests
      let throttled = false;
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/api/2024-01/graphql.json',
          headers: { 'X-Shopify-Access-Token': token },
          payload: { query: expensiveQuery },
        });
        if (res.statusCode === 429) {
          throttled = true;
          break;
        }
      }

      // Should have been throttled at some point
      expect(throttled).toBe(true);

      // Call admin reset
      const resetRes = await app.inject({
        method: 'POST',
        url: '/admin/reset',
      });
      expect(resetRes.statusCode).toBe(200);
      expect(JSON.parse(resetRes.body).reset).toBe(true);

      // After reset, a simple query should succeed immediately
      const afterReset = await app.inject({
        method: 'POST',
        url: '/admin/api/2024-01/graphql.json',
        headers: { 'X-Shopify-Access-Token': token },
        payload: {
          query: '{ orders(first: 10) { edges { node { id } } } }',
        },
      });

      expect(afterReset.statusCode).toBe(200);
      const body = JSON.parse(afterReset.body);
      expect(body.data).toBeDefined();
      // extensions.cost.currentlyAvailable should be near max (fresh bucket)
      expect(body.extensions.cost.throttleStatus.currentlyAvailable).toBeGreaterThan(900);
    });
  });
});

// ---------------------------------------------------------------------------
// SHOP-24b: actualQueryCost differs from requestedQueryCost on sparse results
// ---------------------------------------------------------------------------
describe('actualQueryCost vs requestedQueryCost', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    process.env.WEBHOOK_TIME_SCALE = '0.001';
    app = await buildApp({ logger: false });
    await app.ready();

    const oauthResponse = await app.inject({
      method: 'POST',
      url: '/admin/oauth/access_token',
      payload: { code: 'test-rate-limit' },
    });
    token = JSON.parse(oauthResponse.body).access_token;
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_TIME_SCALE;
    await app.close();
  });

  it('actualQueryCost is less than requestedQueryCost for sparse connection results', async () => {
    // Query requesting many items but returning fewer (e.g., first: 100 but 0 seeded)
    // orders(first: 100) will return 0 items from the empty twin state
    const response = await app.inject({
      method: 'POST',
      url: '/admin/api/2024-01/graphql.json',
      headers: { 'X-Shopify-Access-Token': token },
      payload: { query: '{ orders(first: 100) { edges { node { id } } } }' },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const cost = body.extensions.cost;
    expect(cost.requestedQueryCost).toBeGreaterThan(0);
    expect(cost.actualQueryCost).toBeLessThan(cost.requestedQueryCost);
  });
});
