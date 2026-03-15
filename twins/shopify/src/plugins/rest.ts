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
import { encodeCursor, decodeCursor } from '../services/cursor.js';

// Route prefix helper — generates /admin/api/:version/{suffix} strings.
// Used only at registration time (Fastify route matching), not at request time.
const adminPath = (suffix: string): string => {
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `/admin/api/:version${normalizedSuffix}`;
};

// ---------------------------------------------------------------------------
// Cursor-based pagination helper
// ---------------------------------------------------------------------------

interface PaginationResult<T extends { id: number }> {
  items: T[];
  linkHeader: string | null;
}

/**
 * Slice `all` (sorted by id ASC) into a cursor-paginated page.
 *
 * @param all          - Full sorted list of items (id ASC)
 * @param resourceType - Resource type string used in cursor encoding (e.g. 'Product')
 * @param version      - API version string for building Link header URLs
 * @param path         - URL path suffix (e.g. '/products.json')
 * @param limit        - Maximum items per page (1–250)
 * @param afterId      - Decoded cursor: return items with id > afterId (0 = first page)
 */
function paginateList<T extends { id: number }>(
  all: T[],
  resourceType: string,
  version: string,
  path: string,
  limit: number,
  afterId: number,
): PaginationResult<T> {
  // When afterId=0 (first page), start from index 0.
  // When afterId>0 (subsequent page), start from the first item with id > afterId.
  const startIdx = afterId === 0 ? 0 : all.findIndex((item) => item.id > afterId);
  const slice = startIdx === -1 ? [] : all.slice(startIdx, startIdx + limit);
  const hasNext = startIdx !== -1 && startIdx + limit < all.length;
  const hasPrev = afterId > 0;

  const parts: string[] = [];

  if (hasPrev) {
    // Previous cursor: go back one full page from the current start.
    // prevStartIdx = max(0, startIdx - limit)
    // prevAfterId = prevStartIdx === 0 ? 0 : all[prevStartIdx - 1].id
    const prevStartIdx = Math.max(0, startIdx - limit);
    const prevAfterId = prevStartIdx === 0 ? 0 : all[prevStartIdx - 1].id;
    const prevCursor = encodeCursor(resourceType, prevAfterId);
    const prevUrl = `https://dev.myshopify.com${buildAdminApiPath(version, path)}?page_info=${prevCursor}&limit=${limit}`;
    parts.push(`<${prevUrl}>; rel="previous"`);
  }

  if (hasNext && slice.length > 0) {
    const lastId = slice[slice.length - 1].id;
    const nextCursor = encodeCursor(resourceType, lastId);
    const nextUrl = `https://dev.myshopify.com${buildAdminApiPath(version, path)}?page_info=${nextCursor}&limit=${limit}`;
    parts.push(`<${nextUrl}>; rel="next"`);
  }

  const linkHeader = parts.length > 0 ? parts.join(', ') : null;
  return { items: slice, linkHeader };
}

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
    } catch (err: any) {
      if (err.sunset) {
        reply.status(400).header('content-type', 'application/json').send({
          errors: 'This API version is no longer supported',
        });
      } else {
        reply.status(400).header('content-type', 'application/json').send({
          errors: 'Invalid API version',
        });
      }
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

  // GET /admin/api/:version/products.json — real cursor pagination
  fastify.get(adminPath('/products.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;

    const limitParam = parseInt(String(req.query?.limit ?? '50'), 10);
    const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 250);
    const pageInfoToken = req.query?.page_info as string | undefined;

    let afterId = 0;
    if (pageInfoToken) {
      try {
        afterId = decodeCursor(pageInfoToken, 'Product');
      } catch {
        return reply.status(400).send({ errors: 'Invalid page_info cursor' });
      }
    }

    const sinceId = parseInt(String(req.query?.since_id ?? '0'), 10);
    const idsParam = req.query?.ids as string | undefined;

    let all = (fastify as any).stateManager.listProducts();

    // Apply since_id filter (id strictly greater than since_id)
    if (!isNaN(sinceId) && sinceId > 0) {
      all = all.filter((item: any) => item.id > sinceId);
    }

    // Apply ids filter (comma-separated numeric IDs)
    if (idsParam) {
      const idSet = new Set(
        idsParam.split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n))
      );
      all = all.filter((item: any) => idSet.has(item.id));
    }

    // Apply collection_id filter — only return products linked via collects table
    const collectionIdParam = req.query?.collection_id as string | undefined;
    if (collectionIdParam) {
      const collectionId = parseInt(collectionIdParam, 10);
      if (!isNaN(collectionId)) {
        const collectionProducts = (fastify as any).stateManager.listProductsByCollectionId(collectionId);
        const collectionProductIds = new Set(collectionProducts.map((p: any) => p.id));
        all = all.filter((item: any) => collectionProductIds.has(item.id));
      }
    }

    const { items, linkHeader } = paginateList(all, 'Product', version, '/products.json', limit, afterId);
    if (linkHeader) reply.header('Link', linkHeader);
    return {
      products: items.map((p: any) => ({
        id: p.id,
        admin_graphql_api_id: p.gid,
        title: p.title,
        created_at: new Date(p.created_at * 1000).toISOString(),
        updated_at: new Date(p.updated_at * 1000).toISOString(),
      })),
    };
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
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const input = (req.body as any)?.product ?? {};
    (fastify as any).stateManager.updateProduct(numericId, {
      title: input.title,
      description: input.description,
      vendor: input.vendor,
      product_type: input.product_type,
      price: input.price,
    });
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

  // DELETE /admin/api/:version/products/:id.json
  fastify.delete(adminPath('/products/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const deleted = (fastify as any).stateManager.deleteProduct(numericId);
    if (!deleted) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {};
  });

  // ---------------------------------------------------------------------------
  // Customers — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/customers.json — real cursor pagination
  fastify.get(adminPath('/customers.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;

    const limitParam = parseInt(String(req.query?.limit ?? '50'), 10);
    const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 250);
    const pageInfoToken = req.query?.page_info as string | undefined;

    let afterId = 0;
    if (pageInfoToken) {
      try {
        afterId = decodeCursor(pageInfoToken, 'Customer');
      } catch {
        return reply.status(400).send({ errors: 'Invalid page_info cursor' });
      }
    }

    const sinceId = parseInt(String(req.query?.since_id ?? '0'), 10);
    const idsParam = req.query?.ids as string | undefined;
    let all = (fastify as any).stateManager.listCustomers();
    if (!isNaN(sinceId) && sinceId > 0) {
      all = all.filter((item: any) => item.id > sinceId);
    }
    // Apply ids filter (comma-separated numeric IDs)
    if (idsParam) {
      const idSet = new Set(
        idsParam.split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n))
      );
      all = all.filter((item: any) => idSet.has(item.id));
    }
    const { items, linkHeader } = paginateList(all, 'Customer', version, '/customers.json', limit, afterId);
    if (linkHeader) reply.header('Link', linkHeader);
    return {
      customers: items.map((c: any) => ({
        id: c.id,
        admin_graphql_api_id: c.gid,
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        created_at: new Date(c.created_at * 1000).toISOString(),
        updated_at: new Date(c.updated_at * 1000).toISOString(),
      })),
    };
  });

  // POST /admin/api/:version/customers.json
  fastify.post(adminPath('/customers.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    if (!(req.body as any)?.customer) {
      return reply.status(422).send({ errors: 'customer is required' });
    }
    const input = (req.body as any).customer;
    // Two-step insert: use temp GID, get row id, update GID to use actual row id
    const tempGid = `gid://shopify/Customer/temp-${Date.now()}`;
    const rowId = (fastify as any).stateManager.createCustomer({
      gid: tempGid,
      email: input.email ?? null,
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
    });
    const finalGid = `gid://shopify/Customer/${rowId}`;
    (fastify as any).stateManager.database
      .prepare('UPDATE customers SET gid = ? WHERE id = ?')
      .run(finalGid, rowId);
    const customer = (fastify as any).stateManager.getCustomer(rowId);
    reply.status(201);
    return {
      customer: {
        id: customer.id,
        admin_graphql_api_id: customer.gid,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: new Date(customer.created_at * 1000).toISOString(),
        updated_at: new Date(customer.updated_at * 1000).toISOString(),
      },
    };
  });

  // GET /admin/api/:version/customers/:id.json
  fastify.get(adminPath('/customers/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const customer = (fastify as any).stateManager.getCustomer(numericId);
    if (!customer) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      customer: {
        id: customer.id,
        admin_graphql_api_id: customer.gid,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: new Date(customer.created_at * 1000).toISOString(),
        updated_at: new Date(customer.updated_at * 1000).toISOString(),
      },
    };
  });

  // PUT /admin/api/:version/customers/:id.json
  fastify.put(adminPath('/customers/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    if (!(req.body as any)?.customer) {
      return reply.status(422).send({ errors: 'customer is required' });
    }
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const input = (req.body as any).customer;
    (fastify as any).stateManager.updateCustomer(numericId, {
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
    });
    const customer = (fastify as any).stateManager.getCustomer(numericId);
    if (!customer) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      customer: {
        id: customer.id,
        admin_graphql_api_id: customer.gid,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: new Date(customer.created_at * 1000).toISOString(),
        updated_at: new Date(customer.updated_at * 1000).toISOString(),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // Orders — Tier 1 (state-backed)
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/orders.json — real cursor pagination
  fastify.get(adminPath('/orders.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;

    const limitParam = parseInt(String(req.query?.limit ?? '50'), 10);
    const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 250);
    const pageInfoToken = req.query?.page_info as string | undefined;

    let afterId = 0;
    if (pageInfoToken) {
      try {
        afterId = decodeCursor(pageInfoToken, 'Order');
      } catch {
        return reply.status(400).send({ errors: 'Invalid page_info cursor' });
      }
    }

    const sinceId = parseInt(String(req.query?.since_id ?? '0'), 10);
    const idsParamOrders = req.query?.ids as string | undefined;
    let all = (fastify as any).stateManager.listOrders();
    if (!isNaN(sinceId) && sinceId > 0) {
      all = all.filter((item: any) => item.id > sinceId);
    }
    // Apply ids filter (comma-separated numeric IDs)
    if (idsParamOrders) {
      const idSet = new Set(
        idsParamOrders.split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n))
      );
      all = all.filter((item: any) => idSet.has(item.id));
    }
    const { items, linkHeader } = paginateList(all, 'Order', version, '/orders.json', limit, afterId);
    if (linkHeader) reply.header('Link', linkHeader);
    return {
      orders: items.map((o: any) => ({
        id: o.id,
        admin_graphql_api_id: o.gid,
        name: o.name,
        total_price: o.total_price,
        currency_code: o.currency_code,
        display_fulfillment_status: o.display_fulfillment_status,
        display_financial_status: o.display_financial_status,
        line_items: (() => { try { return JSON.parse(o.line_items || '[]'); } catch { return []; } })(),
        created_at: new Date(o.created_at * 1000).toISOString(),
        updated_at: new Date(o.updated_at * 1000).toISOString(),
      })),
    };
  });

  // POST /admin/api/:version/orders.json
  fastify.post(adminPath('/orders.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    if (!(req.body as any)?.order) {
      return reply.status(422).send({ errors: 'order is required' });
    }
    const input = (req.body as any).order;
    // Two-step insert: use temp GID, get row id, update GID to use actual row id
    const tempGid = `gid://shopify/Order/temp-${Date.now()}`;
    const rowId = (fastify as any).stateManager.createOrder({
      gid: tempGid,
      name: input.name ?? null,
      total_price: input.total_price ?? null,
      currency_code: input.currency_code ?? null,
      customer_gid: input.customer_gid ?? null,
      line_items: input.line_items ?? null,
      financial_status: input.financial_status ?? 'PENDING',
    });
    const finalGid = `gid://shopify/Order/${rowId}`;
    (fastify as any).stateManager.database
      .prepare('UPDATE orders SET gid = ? WHERE id = ?')
      .run(finalGid, rowId);
    const order = (fastify as any).stateManager.getOrderById(rowId);
    reply.status(201);
    return {
      order: {
        id: order.id,
        admin_graphql_api_id: order.gid,
        name: order.name,
        total_price: order.total_price,
        currency_code: order.currency_code,
        display_fulfillment_status: order.display_fulfillment_status,
        display_financial_status: order.display_financial_status,
        line_items: (() => { try { return JSON.parse(order.line_items || '[]'); } catch { return []; } })(),
        created_at: new Date(order.created_at * 1000).toISOString(),
        updated_at: new Date(order.updated_at * 1000).toISOString(),
      },
    };
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
        line_items: (() => { try { return JSON.parse(order.line_items || '[]'); } catch { return []; } })(),
        created_at: new Date(order.created_at * 1000).toISOString(),
        updated_at: new Date(order.updated_at * 1000).toISOString(),
      },
    };
  });

  // PUT /admin/api/:version/orders/:id.json
  fastify.put(adminPath('/orders/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    if (!(req.body as any)?.order) {
      return reply.status(422).send({ errors: 'order is required' });
    }
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const input = (req.body as any).order;
    (fastify as any).stateManager.updateOrder(numericId, {
      name: input.name,
      total_price: input.total_price,
      currency_code: input.currency_code,
      customer_gid: input.customer_gid,
      line_items: input.line_items,
    });
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
        line_items: (() => { try { return JSON.parse(order.line_items || '[]'); } catch { return []; } })(),
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

  // GET /admin/api/:version/inventory_items.json — real cursor pagination
  fastify.get(adminPath('/inventory_items.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;

    const limitParam = parseInt(String(req.query?.limit ?? '50'), 10);
    const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 250);
    const pageInfoToken = req.query?.page_info as string | undefined;

    let afterId = 0;
    if (pageInfoToken) {
      try {
        afterId = decodeCursor(pageInfoToken, 'InventoryItem');
      } catch {
        return reply.status(400).send({ errors: 'Invalid page_info cursor' });
      }
    }

    const idsParam = req.query?.ids as string | undefined;
    let all = (fastify as any).stateManager.listInventoryItems();
    if (idsParam) {
      const idSet = new Set(
        idsParam.split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n))
      );
      all = all.filter((item: any) => idSet.has(item.id));
    }
    const { items, linkHeader } = paginateList(all, 'InventoryItem', version, '/inventory_items.json', limit, afterId);
    if (linkHeader) reply.header('Link', linkHeader);
    return { inventory_items: items };
  });

  // GET /admin/api/:version/inventory_levels.json — state-backed
  fastify.get(adminPath('/inventory_levels.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;

    const inventoryItemIdsParam = req.query?.inventory_item_ids as string | undefined;
    const locationIdsParam = req.query?.location_ids as string | undefined;

    const inventoryItemIds = inventoryItemIdsParam
      ? inventoryItemIdsParam.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
      : undefined;
    const locationIds = locationIdsParam
      ? locationIdsParam.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
      : undefined;

    const rows = (fastify as any).stateManager.listInventoryLevels({ inventoryItemIds, locationIds });
    return {
      inventory_levels: rows.map((r: any) => ({
        inventory_item_id: r.inventory_item_id,
        location_id: r.location_id,
        available: r.available,
        created_at: new Date(r.created_at * 1000).toISOString(),
        updated_at: new Date(r.updated_at * 1000).toISOString(),
        admin_graphql_api_id: `gid://shopify/InventoryLevel/${r.location_id}?inventory_item_id=${r.inventory_item_id}`,
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // Location family — Tier 2 stubs (hardcoded minimal valid shapes)
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/locations.json
  fastify.get(adminPath('/locations.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return {
      locations: [{
        id: 1,
        name: 'Default Location',
        active: true,
        address1: '1 Twin St',
        city: 'Dev City',
        country: 'US',
        country_code: 'US',
        admin_graphql_api_id: 'gid://shopify/Location/1',
      }],
    };
  });

  // GET /admin/api/:version/locations/count.json — MUST come before /:id.json
  fastify.get(adminPath('/locations/count.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    return { count: 1 };
  });

  // GET /admin/api/:version/locations/:id.json
  fastify.get(adminPath('/locations/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    return {
      location: {
        id: numericId,
        name: 'Default Location',
        active: true,
        address1: '1 Twin St',
        city: 'Dev City',
        country: 'US',
        country_code: 'US',
        admin_graphql_api_id: `gid://shopify/Location/${numericId}`,
      },
    };
  });

  // GET /admin/api/:version/locations/:id/inventory_levels.json — state-backed
  fastify.get(adminPath('/locations/:id/inventory_levels.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const locationId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const rows = (fastify as any).stateManager.listInventoryLevels({ locationIds: [locationId] });
    return {
      inventory_levels: rows.map((r: any) => ({
        inventory_item_id: r.inventory_item_id,
        location_id: r.location_id,
        available: r.available,
        created_at: new Date(r.created_at * 1000).toISOString(),
        updated_at: new Date(r.updated_at * 1000).toISOString(),
        admin_graphql_api_id: `gid://shopify/InventoryLevel/${r.location_id}?inventory_item_id=${r.inventory_item_id}`,
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // InventoryLevel mutations — state-backed
  // Register sub-paths BEFORE DELETE /inventory_levels.json
  // ---------------------------------------------------------------------------

  // POST /admin/api/:version/inventory_levels/connect.json
  fastify.post(adminPath('/inventory_levels/connect.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const body = (req.body as any) ?? {};
    const inventoryItemId = Number(body.inventory_item_id ?? 1);
    const locationId = Number(body.location_id ?? 1);
    const row = (fastify as any).stateManager.connectInventoryLevel(inventoryItemId, locationId);
    return {
      inventory_level: {
        inventory_item_id: row.inventory_item_id,
        location_id: row.location_id,
        available: row.available,
        created_at: new Date(row.created_at * 1000).toISOString(),
        updated_at: new Date(row.updated_at * 1000).toISOString(),
        admin_graphql_api_id: `gid://shopify/InventoryLevel/${row.location_id}?inventory_item_id=${row.inventory_item_id}`,
      },
    };
  });

  // POST /admin/api/:version/inventory_levels/adjust.json
  fastify.post(adminPath('/inventory_levels/adjust.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const body = (req.body as any) ?? {};
    const inventoryItemId = Number(body.inventory_item_id ?? 1);
    const locationId = Number(body.location_id ?? 1);
    const availableAdjustment = Number(body.available_adjustment ?? 0);
    const row = (fastify as any).stateManager.adjustInventoryLevel(inventoryItemId, locationId, availableAdjustment);
    if (row === null) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      inventory_level: {
        inventory_item_id: row.inventory_item_id,
        location_id: row.location_id,
        available: row.available,
        created_at: new Date(row.created_at * 1000).toISOString(),
        updated_at: new Date(row.updated_at * 1000).toISOString(),
        admin_graphql_api_id: `gid://shopify/InventoryLevel/${row.location_id}?inventory_item_id=${row.inventory_item_id}`,
      },
    };
  });

  // POST /admin/api/:version/inventory_levels/set.json
  fastify.post(adminPath('/inventory_levels/set.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const body = (req.body as any) ?? {};
    const inventoryItemId = Number(body.inventory_item_id ?? 1);
    const locationId = Number(body.location_id ?? 1);
    const available = Number(body.available ?? 0);
    const row = (fastify as any).stateManager.setInventoryLevel(inventoryItemId, locationId, available);
    return {
      inventory_level: {
        inventory_item_id: row.inventory_item_id,
        location_id: row.location_id,
        available: row.available,
        created_at: new Date(row.created_at * 1000).toISOString(),
        updated_at: new Date(row.updated_at * 1000).toISOString(),
        admin_graphql_api_id: `gid://shopify/InventoryLevel/${row.location_id}?inventory_item_id=${row.inventory_item_id}`,
      },
    };
  });

  // DELETE /admin/api/:version/inventory_levels.json
  fastify.delete(adminPath('/inventory_levels.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const inventoryItemId = Number(req.query?.inventory_item_id ?? 0);
    const locationId = Number(req.query?.location_id ?? 0);
    const deleted = (fastify as any).stateManager.deleteInventoryLevel(inventoryItemId, locationId);
    if (!deleted) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {};
  });

  // ---------------------------------------------------------------------------
  // InventoryItem — single-item GET/PUT (list GET already exists above)
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/inventory_items/:id.json
  fastify.get(adminPath('/inventory_items/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const all = (fastify as any).stateManager.listInventoryItems() as Array<{ id: number; [k: string]: unknown }>;
    const item = all.find((i) => i.id === numericId);
    if (item) {
      return { inventory_item: item };
    }
    // Fallback stub — item not in state
    return {
      inventory_item: {
        id: numericId,
        sku: 'STUB-SKU',
        tracked: false,
        admin_graphql_api_id: `gid://shopify/InventoryItem/${numericId}`,
      },
    };
  });

  // PUT /admin/api/:version/inventory_items/:id.json — state-backed update
  fastify.put(adminPath('/inventory_items/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const body = (req.body as any) ?? {};
    const updates = body.inventory_item ?? {};
    // Persist the update if stateManager supports it
    if ((fastify as any).stateManager.updateInventoryItem) {
      (fastify as any).stateManager.updateInventoryItem(numericId, updates);
    }
    // Re-read from state to return persisted data
    const all = (fastify as any).stateManager.listInventoryItems() as Array<{ id: number; [k: string]: unknown }>;
    const item = all.find((i) => i.id === numericId);
    if (item) {
      return { inventory_item: { ...item, ...updates } };
    }
    return {
      inventory_item: {
        id: numericId,
        ...updates,
        admin_graphql_api_id: `gid://shopify/InventoryItem/${numericId}`,
      },
    };
  });

  // ---------------------------------------------------------------------------
  // CustomCollection — state-backed
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/custom_collections.json
  fastify.get(adminPath('/custom_collections.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const rows = (fastify as any).stateManager.listCustomCollections();
    return {
      custom_collections: rows.map((c: any) => ({
        id: c.id,
        admin_graphql_api_id: c.gid,
        title: c.title,
        handle: c.handle,
        created_at: new Date(c.created_at * 1000).toISOString(),
        updated_at: new Date(c.updated_at * 1000).toISOString(),
      })),
    };
  });

  // POST /admin/api/:version/custom_collections.json
  fastify.post(adminPath('/custom_collections.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const input = (req.body as any)?.custom_collection ?? {};
    const tempGid = `gid://shopify/Collection/temp-${Date.now()}`;
    const rowId = (fastify as any).stateManager.createCustomCollection({
      gid: tempGid,
      title: input.title ?? null,
      handle: input.handle ?? null,
    });
    const finalGid = `gid://shopify/Collection/${rowId}`;
    (fastify as any).stateManager.database
      .prepare('UPDATE custom_collections SET gid = ? WHERE id = ?')
      .run(finalGid, rowId);
    const coll = (fastify as any).stateManager.getCustomCollection(rowId);
    reply.status(201);
    return {
      custom_collection: {
        id: coll.id,
        admin_graphql_api_id: coll.gid,
        title: coll.title,
        handle: coll.handle,
        created_at: new Date(coll.created_at * 1000).toISOString(),
        updated_at: new Date(coll.updated_at * 1000).toISOString(),
      },
    };
  });

  // GET /admin/api/:version/custom_collections/:id.json
  fastify.get(adminPath('/custom_collections/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const coll = (fastify as any).stateManager.getCustomCollection(numericId);
    if (!coll) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      custom_collection: {
        id: coll.id,
        admin_graphql_api_id: coll.gid,
        title: coll.title,
        handle: coll.handle,
        created_at: new Date(coll.created_at * 1000).toISOString(),
        updated_at: new Date(coll.updated_at * 1000).toISOString(),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // Collects — state-backed
  // ---------------------------------------------------------------------------

  // GET /admin/api/:version/collects.json
  fastify.get(adminPath('/collects.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const collectionIdParam = req.query?.collection_id as string | undefined;
    const opts = collectionIdParam ? { collectionId: parseInt(collectionIdParam, 10) } : {};
    const rows = (fastify as any).stateManager.listCollects(opts);
    return {
      collects: rows.map((c: any) => ({
        id: c.id,
        collection_id: c.collection_id,
        product_id: c.product_id,
        position: c.position,
        created_at: new Date(c.created_at * 1000).toISOString(),
        updated_at: new Date(c.updated_at * 1000).toISOString(),
      })),
    };
  });

  // POST /admin/api/:version/collects.json
  fastify.post(adminPath('/collects.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const input = (req.body as any)?.collect ?? {};
    const rowId = (fastify as any).stateManager.createCollect({
      collection_id: Number(input.collection_id),
      product_id: Number(input.product_id),
      position: input.position ?? 1,
    });
    const collect = (fastify as any).stateManager.getCollect(rowId);
    reply.status(201);
    return {
      collect: {
        id: collect.id,
        collection_id: collect.collection_id,
        product_id: collect.product_id,
        position: collect.position,
        created_at: new Date(collect.created_at * 1000).toISOString(),
        updated_at: new Date(collect.updated_at * 1000).toISOString(),
      },
    };
  });

  // GET /admin/api/:version/collects/:id.json
  fastify.get(adminPath('/collects/:id.json'), async (req: any, reply) => {
    const version = parseVersionHeader(req, reply);
    if (version === null) return;
    if (!await requireToken(req, reply)) return;
    const numericId = parseInt((req.params.id as string).replace(/\.json$/, ''), 10);
    const collect = (fastify as any).stateManager.getCollect(numericId);
    if (!collect) {
      return reply.status(404).send({ errors: 'Not Found' });
    }
    return {
      collect: {
        id: collect.id,
        collection_id: collect.collection_id,
        product_id: collect.product_id,
        position: collect.position,
        created_at: new Date(collect.created_at * 1000).toISOString(),
        updated_at: new Date(collect.updated_at * 1000).toISOString(),
      },
    };
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
