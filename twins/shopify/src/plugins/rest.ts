/**
 * REST plugin for Shopify Admin API
 *
 * Serves GET/POST/PUT/DELETE routes under /admin/api/2024-01/ that validate
 * X-Shopify-Access-Token. Provides test infrastructure for Plan 03 REST tests.
 *
 * Routes:
 *   GET    /admin/api/2024-01/products.json       → { products: [...] }
 *   POST   /admin/api/2024-01/products.json       → { product: {} } 201
 *   PUT    /admin/api/2024-01/products/:id.json   → { product: {} } 200
 *   DELETE /admin/api/2024-01/products/:id.json   → {} 200
 *   GET    /admin/api/2024-01/test-retry.json     → 429 first call, 200 second
 */

import type { FastifyPluginAsync } from 'fastify';
import { validateAccessToken } from '../services/token-validator.js';

const restPlugin: FastifyPluginAsync = async (fastify) => {
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

  // GET /admin/api/2024-01/products.json
  fastify.get('/admin/api/2024-01/products.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
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
