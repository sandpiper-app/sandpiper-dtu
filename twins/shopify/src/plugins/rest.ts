/**
 * REST plugin for Shopify Admin API
 *
 * Serves GET/POST/PUT/DELETE routes under /admin/api/2024-01/ that validate
 * X-Shopify-Access-Token. Provides test infrastructure for Plan 03 REST tests.
 *
 * Routes:
 *   GET    /admin/api/2024-01/products.json               → { products: [...] }
 *   POST   /admin/api/2024-01/products.json               → { product: {} } 201
 *   PUT    /admin/api/2024-01/products/:id.json           → { product: {} } 200
 *   DELETE /admin/api/2024-01/products/:id.json           → {} 200
 *   GET    /admin/api/2024-01/test-retry.json             → 429 first call, 200 second
 *
 * Tier 1 resource routes (backed by stateManager):
 *   GET    /admin/api/2024-01/customers.json              → { customers: [...] }
 *   GET    /admin/api/2024-01/customers/:id.json          → { customer: {} | null }
 *   GET    /admin/api/2024-01/orders.json                 → { orders: [...] }
 *   GET    /admin/api/2024-01/orders/:id.json             → { order: null } stub
 *   GET    /admin/api/2024-01/orders/:order_id/fulfillments.json → { fulfillments: [] }
 *   GET    /admin/api/2024-01/inventory_items.json        → { inventory_items: [...] }
 *   GET    /admin/api/2024-01/inventory_levels.json       → { inventory_levels: [] } stub
 *
 * Tier 2 stub routes (hardcoded minimal valid shapes, no state):
 *   GET    /admin/api/2024-01/custom_collections.json     → { custom_collections: [] }
 *   GET    /admin/api/2024-01/metafields.json             → { metafields: [] }
 *   GET    /admin/api/2024-01/pages.json                  → { pages: [] }
 *   GET    /admin/api/2024-01/webhooks.json               → { webhooks: [] }
 *   POST   /admin/api/2024-01/webhooks.json               → { webhook: {...} } 201
 *   DELETE /admin/api/2024-01/webhooks/:id.json           → {} 200
 *   GET    /admin/api/2024-01/blogs.json                  → { blogs: [] }
 *   GET    /admin/api/2024-01/blogs/:blog_id/articles.json → { articles: [] }
 *   GET    /admin/api/2024-01/articles.json               → { articles: [] }
 */

import type { FastifyPluginAsync } from 'fastify';
import { validateAccessToken } from '../services/token-validator.js';

const restPlugin: FastifyPluginAsync = async (fastify) => {
  /**
   * Allow DELETE (and other) requests that send Content-Type: application/json
   * with no body. The Shopify admin-api-client always sends this header even
   * for DELETE requests. Without this parser, Fastify v5 returns 400 when the
   * JSON content-type parser encounters an empty body.
   */
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (body as string).trim() === '') {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  /**
   * Validate X-Shopify-Access-Token header.
   * Returns true if valid, false if reply was already sent with 401.
   */
  const requireToken = async (request: any, reply: any): Promise<boolean> => {
    const token = request.headers['x-shopify-access-token'] as string | undefined;
    if (!token) {
      await reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
      return false;
    }
    const result = await validateAccessToken(token, (fastify as any).stateManager);
    if (!result.valid) {
      await reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
      return false;
    }
    return true;
  };

  // Per-instance call counter for the retry test endpoint
  const retryCounts = new Map<string, number>();

  // ---------------------------------------------------------------------------
  // Products — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/2024-01/products.json
  // Supports pagination test: ?page_info=test → returns Link header
  fastify.get('/admin/api/2024-01/products.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    const pageInfo = req.query?.page_info;
    if (pageInfo === 'test') {
      reply.header(
        'Link',
        '<https://dev.myshopify.com/admin/api/2024-01/products.json?page_info=next123>; rel="next"'
      );
    }
    return { products: (fastify as any).stateManager.listProducts() };
  });

  // POST /admin/api/2024-01/products.json
  fastify.post('/admin/api/2024-01/products.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    reply.status(201);
    return { product: { id: 'gid://shopify/Product/1', title: 'New Product' } };
  });

  // PUT /admin/api/2024-01/products/:id.json
  fastify.put('/admin/api/2024-01/products/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    // Strip .json suffix from params.id (Fastify captures without .json in :id when route ends in .json)
    const id = (req.params.id as string).replace(/\.json$/, '');
    return { product: { id: `gid://shopify/Product/${id}`, title: 'Updated Product' } };
  });

  // DELETE /admin/api/2024-01/products/:id.json
  fastify.delete('/admin/api/2024-01/products/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    return {};
  });

  // ---------------------------------------------------------------------------
  // Customers — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/2024-01/customers.json
  fastify.get('/admin/api/2024-01/customers.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { customers: (fastify as any).stateManager.listCustomers() };
  });

  // GET /admin/api/2024-01/customers/:id.json
  fastify.get('/admin/api/2024-01/customers/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    const id = (req.params.id as string).replace(/\.json$/, '');
    const customer = (fastify as any).stateManager.getCustomerByGid(`gid://shopify/Customer/${id}`) ?? null;
    return { customer };
  });

  // ---------------------------------------------------------------------------
  // Orders — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/2024-01/orders.json
  fastify.get('/admin/api/2024-01/orders.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { orders: (fastify as any).stateManager.listOrders() };
  });

  // GET /admin/api/2024-01/orders/:id.json
  fastify.get('/admin/api/2024-01/orders/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    return { order: null };
  });

  // GET /admin/api/2024-01/orders/:order_id/fulfillments.json
  fastify.get('/admin/api/2024-01/orders/:order_id/fulfillments.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    return { fulfillments: [] };
  });

  // ---------------------------------------------------------------------------
  // Inventory — Tier 1 (state-backed) + Tier 1 stub
  // ---------------------------------------------------------------------------

  // GET /admin/api/2024-01/inventory_items.json
  fastify.get('/admin/api/2024-01/inventory_items.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { inventory_items: (fastify as any).stateManager.listInventoryItems() };
  });

  // GET /admin/api/2024-01/inventory_levels.json — stub (no state)
  fastify.get('/admin/api/2024-01/inventory_levels.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { inventory_levels: [] };
  });

  // ---------------------------------------------------------------------------
  // Tier 2 stub routes — hardcoded minimal valid shapes, no state
  // ---------------------------------------------------------------------------

  // GET /admin/api/2024-01/custom_collections.json
  fastify.get('/admin/api/2024-01/custom_collections.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { custom_collections: [] };
  });

  // GET /admin/api/2024-01/metafields.json
  fastify.get('/admin/api/2024-01/metafields.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { metafields: [] };
  });

  // GET /admin/api/2024-01/pages.json
  fastify.get('/admin/api/2024-01/pages.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { pages: [] };
  });

  // GET /admin/api/2024-01/webhooks.json
  fastify.get('/admin/api/2024-01/webhooks.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { webhooks: [] };
  });

  // POST /admin/api/2024-01/webhooks.json
  fastify.post('/admin/api/2024-01/webhooks.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    reply.status(201);
    return {
      webhook: {
        id: 1,
        topic: 'orders/create',
        address: 'https://example.com/webhook',
      },
    };
  });

  // DELETE /admin/api/2024-01/webhooks/:id.json
  fastify.delete('/admin/api/2024-01/webhooks/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    return {};
  });

  // GET /admin/api/2024-01/blogs.json
  fastify.get('/admin/api/2024-01/blogs.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { blogs: [] };
  });

  // GET /admin/api/2024-01/blogs/:blog_id/articles.json (nested under blogs)
  fastify.get('/admin/api/2024-01/blogs/:blog_id/articles.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    return { articles: [] };
  });

  // GET /admin/api/2024-01/articles.json (top-level convenience)
  fastify.get('/admin/api/2024-01/articles.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { articles: [] };
  });

  // ---------------------------------------------------------------------------
  // Test infrastructure
  // ---------------------------------------------------------------------------

  // GET /admin/api/2024-01/test-retry.json — dedicated retry-on-429 test endpoint
  fastify.get('/admin/api/2024-01/test-retry.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    const key = req.headers['x-shopify-access-token'] as string;
    const count = retryCounts.get(key) ?? 0;
    retryCounts.set(key, count + 1);
    if (count === 0) {
      reply.status(429).header('Retry-After', '0');
      return { errors: 'Too Many Requests' };
    }
    // Reset counter after responding 200 so the test can be re-run
    retryCounts.delete(key);
    return { products: [] };
  });
};

export default restPlugin;
