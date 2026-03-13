/**
 * REST plugin for Shopify Admin API
 *
 * Serves GET/POST/PUT/DELETE routes under /admin/api/:version/ that validate
 * X-Shopify-Access-Token and echo X-Shopify-API-Version on every response.
 *
 * Routes (all under /admin/api/:version/):
 *   GET    /products.json               → { products: [...] }
 *   POST   /products.json               → { product: { id, admin_graphql_api_id, title, ... } } 201
 *   GET    /products/:id.json           → { product: {} } or 404
 *   PUT    /products/:id.json           → { product: {} } 200
 *   DELETE /products/:id.json           → {} 200
 *   GET    /test-retry.json             → 429 first call, 200 second
 *
 * Tier 1 resource routes (backed by stateManager):
 *   GET    /customers.json              → { customers: [...] }
 *   GET    /customers/:id.json          → { customer: {} | null }
 *   GET    /orders.json                 → { orders: [...] }
 *   GET    /orders/:id.json             → { order: {} } state-backed by id
 *   GET    /orders/:order_id/fulfillments.json → { fulfillments: [] }
 *   GET    /inventory_items.json        → { inventory_items: [...] }
 *   GET    /inventory_levels.json       → { inventory_levels: [] } stub
 *
 * Tier 2 stub routes (hardcoded minimal valid shapes, no state):
 *   GET    /custom_collections.json     → { custom_collections: [] }
 *   GET    /metafields.json             → { metafields: [] }
 *   GET    /pages.json                  → { pages: [] }
 *   GET    /webhooks.json               → { webhooks: [] }
 *   POST   /webhooks.json               → { webhook: {...} } 201
 *   DELETE /webhooks/:id.json           → {} 200
 *   GET    /blogs.json                  → { blogs: [] }
 *   GET    /blogs/:blog_id/articles.json → { articles: [] }
 *   GET    /articles.json               → { articles: [] }
 */

import type { FastifyPluginAsync } from 'fastify';
import { validateAccessToken } from '../services/token-validator.js';
import {
  parseShopifyApiVersion,
  setApiVersionHeader,
  buildAdminApiPath,
} from '../services/api-version.js';

// Route prefix helper — generates /admin/api/:version/{suffix} strings.
// Used only at registration time (Fastify route matching), not at request time.
const adminPath = (suffix: string): string => {
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `/admin/api/:version${normalizedSuffix}`;
};

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
   * Parse and validate the :version param from the request, then set
   * X-Shopify-API-Version on the reply.
   *
   * Returns the validated version string, or sends a 400 response and
   * returns null when the version is invalid (callers must then return early).
   */
  const parseVersionHeader = (request: any, reply: any): string | null => {
    let version: string;
    try {
      version = parseShopifyApiVersion(request.params?.version);
    } catch {
      reply.status(400).header('content-type', 'application/json').send({
        errors: 'Invalid API version',
      });
      return null;
    }
    setApiVersionHeader(reply, version);
    return version;
  };

  /**
   * Validate X-Shopify-Access-Token header.
   * Returns true if valid, false if reply was already sent with 401.
   *
   * Note: X-Shopify-API-Version must be set by parseVersionHeader() before
   * calling this so that 401 responses also carry the version header.
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

  // GET /admin/api/:version/products.json
  // Supports pagination test: ?page_info=test → returns version-aware Link header
  fastify.get(adminPath('/products.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const pageInfo = req.query?.page_info;
    if (pageInfo === 'test') {
      // Build the pagination URL using the requested version so the Link header
      // is consistent with the route that was actually called.
      const nextUrl = `https://dev.myshopify.com${buildAdminApiPath(version, '/products.json')}?page_info=next123`;
      reply.header('Link', `<${nextUrl}>; rel="next"`);
    }
    return { products: (fastify as any).stateManager.listProducts() };
  });

  // POST /admin/api/:version/products.json
  fastify.post(adminPath('/products.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const input = (req.body as any)?.product ?? {};
    // Two-step insert: use temp GID, get row id, update GID to use actual row id
    const tempGid = `gid://shopify/Product/temp-${Date.now()}`;
    const rowId = (fastify as any).stateManager.createProduct({
      gid: tempGid,
      title: input.title ?? 'New Product',
      description: input.description ?? null,
      vendor: input.vendor ?? null,
      product_type: input.product_type ?? null,
    });
    const finalGid = `gid://shopify/Product/${rowId}`;
    (fastify as any).stateManager.database
      .prepare('UPDATE products SET gid = ? WHERE id = ?')
      .run(finalGid, rowId);
    const product = (fastify as any).stateManager.getProduct(rowId);
    reply.status(201);
    return {
      product: {
        id: product.id,
        admin_graphql_api_id: product.gid,
        title: product.title,
        created_at: new Date(product.created_at * 1000).toISOString(),
        updated_at: new Date(product.updated_at * 1000).toISOString(),
      },
    };
  });

  // GET /admin/api/:version/products/:id.json
  fastify.get(adminPath('/products/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const product = (fastify as any).stateManager.getProduct(numericId);
    if (!product) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      product: {
        id: product.id,
        admin_graphql_api_id: product.gid,
        title: product.title,
        created_at: new Date(product.created_at * 1000).toISOString(),
        updated_at: new Date(product.updated_at * 1000).toISOString(),
      },
    };
  });

  // PUT /admin/api/:version/products/:id.json
  fastify.put(adminPath('/products/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    // Strip .json suffix from params.id (Fastify captures without .json in :id when route ends in .json)
    const id = (req.params.id as string).replace(/\.json$/, '');
    return { product: { id: `gid://shopify/Product/${id}`, title: 'Updated Product' } };
  });

  // DELETE /admin/api/:version/products/:id.json
  fastify.delete(adminPath('/products/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return {};
  });

  // ---------------------------------------------------------------------------
  // Customers — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/customers.json
  fastify.get(adminPath('/customers.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { customers: (fastify as any).stateManager.listCustomers() };
  });

  // GET /admin/api/:version/customers/:id.json
  fastify.get(adminPath('/customers/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const id = (req.params.id as string).replace(/\.json$/, '');
    const customer = (fastify as any).stateManager.getCustomerByGid(`gid://shopify/Customer/${id}`) ?? null;
    return { customer };
  });

  // ---------------------------------------------------------------------------
  // Orders — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/orders.json
  fastify.get(adminPath('/orders.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { orders: (fastify as any).stateManager.listOrders() };
  });

  // GET /admin/api/:version/orders/:id.json — state-backed by id
  fastify.get(adminPath('/orders/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const order = (fastify as any).stateManager.getOrderById(numericId);
    if (!order) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      order: {
        id: order.id,
        admin_graphql_api_id: order.gid,
        name: order.name,
        total_price: order.total_price,
        currency_code: order.currency_code,
        display_fulfillment_status: order.display_fulfillment_status,
        display_financial_status: order.display_financial_status,
        created_at: new Date(order.created_at * 1000).toISOString(),
        updated_at: new Date(order.updated_at * 1000).toISOString(),
      },
    };
  });

  // GET /admin/api/:version/orders/:order_id/fulfillments.json
  fastify.get(adminPath('/orders/:order_id/fulfillments.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { fulfillments: [] };
  });

  // ---------------------------------------------------------------------------
  // Inventory — Tier 1 (state-backed) + Tier 1 stub
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/inventory_items.json
  fastify.get(adminPath('/inventory_items.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { inventory_items: (fastify as any).stateManager.listInventoryItems() };
  });

  // GET /admin/api/:version/inventory_levels.json — stub (no state)
  fastify.get(adminPath('/inventory_levels.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { inventory_levels: [] };
  });

  // ---------------------------------------------------------------------------
  // Tier 2 stub routes — hardcoded minimal valid shapes, no state
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/custom_collections.json
  fastify.get(adminPath('/custom_collections.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { custom_collections: [] };
  });

  // GET /admin/api/:version/metafields.json
  fastify.get(adminPath('/metafields.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { metafields: [] };
  });

  // GET /admin/api/:version/pages.json
  fastify.get(adminPath('/pages.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { pages: [] };
  });

  // GET /admin/api/:version/webhooks.json
  fastify.get(adminPath('/webhooks.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { webhooks: [] };
  });

  // POST /admin/api/:version/webhooks.json
  fastify.post(adminPath('/webhooks.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
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

  // DELETE /admin/api/:version/webhooks/:id.json
  fastify.delete(adminPath('/webhooks/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return {};
  });

  // GET /admin/api/:version/blogs.json
  fastify.get(adminPath('/blogs.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { blogs: [] };
  });

  // GET /admin/api/:version/blogs/:blog_id/articles.json (nested under blogs)
  fastify.get(adminPath('/blogs/:blog_id/articles.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { articles: [] };
  });

  // GET /admin/api/:version/articles.json (top-level convenience)
  fastify.get(adminPath('/articles.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { articles: [] };
  });

  // ---------------------------------------------------------------------------
  // Test infrastructure
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/test-retry.json — dedicated retry-on-429 test endpoint
  fastify.get(adminPath('/test-retry.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
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
