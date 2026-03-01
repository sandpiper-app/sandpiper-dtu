/**
 * Admin plugin for Shopify twin
 * Provides test control endpoints: reset, fixtures, state inspection
 * and DLQ inspection endpoints for webhook dead letter queue management.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { StateManager } from '@dtu/state';
import type { WebhookQueue, DeadLetterStore } from '@dtu/webhooks';
import type { ResetResponse } from '@dtu/types';
import { createGID } from '../services/gid.js';
import { randomUUID } from 'node:crypto';

interface FixturesLoadBody {
  orders?: any[];
  products?: any[];
  customers?: any[];
  inventoryItems?: any[];
}

interface FixturesLoadResponse {
  loaded: {
    orders: number;
    products: number;
    customers: number;
    inventoryItems: number;
  };
}

interface StateResponse {
  orders: number;
  products: number;
  customers: number;
  inventoryItems: number;
  tokens: number;
  webhooks: number;
}

import type { LeakyBucketRateLimiter } from '../services/rate-limiter.js';

declare module 'fastify' {
  interface FastifyInstance {
    stateManager: StateManager;
    webhookQueue: WebhookQueue;
    deadLetterStore: DeadLetterStore;
    webhookSecret: string;
    rateLimiter: LeakyBucketRateLimiter;
  }
}

const adminPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/reset - reset all state
  fastify.post<{ Reply: ResetResponse }>('/admin/reset', async (request) => {
    request.log.info('Resetting twin state');
    // NOTE: deadLetterStore.clear() is NOT called here because StateManager.reset()
    // closes and reopens the shared SQLite DB connection. The DLQ store holds a
    // reference to the old DB instance, making it unusable after reset.
    // DLQ can be cleared explicitly via DELETE /admin/dead-letter-queue.
    fastify.stateManager.reset();
    // Reset rate limiter buckets so rate limit state is cleared alongside
    // all other twin state.
    fastify.rateLimiter.reset();
    return {
      reset: true,
      timestamp: Date.now(),
    };
  });

  // POST /admin/fixtures/load - load test fixtures
  fastify.post<{
    Body: FixturesLoadBody;
    Reply: FixturesLoadResponse;
  }>('/admin/fixtures/load', async (request) => {
    const { orders = [], products = [], customers = [], inventoryItems = [] } = request.body;

    request.log.info(
      { orderCount: orders.length, productCount: products.length, customerCount: customers.length, inventoryItemCount: inventoryItems.length },
      'Loading fixtures'
    );

    // Load orders — generate GIDs before insertion (StateManager requires data.gid, DB enforces NOT NULL)
    for (const order of orders) {
      const orderId = Date.now() + Math.floor(Math.random() * 100000);
      const orderGid = createGID('Order', orderId);
      fastify.stateManager.createOrder({ ...order, gid: orderGid });
    }

    // Load products — generate GIDs before insertion
    for (const product of products) {
      const productId = Date.now() + Math.floor(Math.random() * 100000);
      const productGid = createGID('Product', productId);
      fastify.stateManager.createProduct({ ...product, gid: productGid });
    }

    // Load customers — generate GIDs before insertion
    for (const customer of customers) {
      const customerId = Date.now() + Math.floor(Math.random() * 100000);
      const customerGid = createGID('Customer', customerId);
      fastify.stateManager.createCustomer({ ...customer, gid: customerGid });
    }

    // Load inventory items — generate GIDs before insertion
    for (const item of inventoryItems) {
      const itemId = Date.now() + Math.floor(Math.random() * 100000);
      const itemGid = createGID('InventoryItem', itemId);
      fastify.stateManager.createInventoryItem({ ...item, gid: itemGid });
    }

    return {
      loaded: {
        orders: orders.length,
        products: products.length,
        customers: customers.length,
        inventoryItems: inventoryItems.length,
      },
    };
  });

  // GET /admin/state - inspect current state
  fastify.get<{ Reply: StateResponse }>('/admin/state', async (request) => {
    request.log.info('Inspecting twin state');

    // Count tokens by querying database directly
    const tokenCount = fastify.stateManager.database
      .prepare('SELECT COUNT(*) as count FROM tokens')
      .get() as { count: number };

    return {
      orders: fastify.stateManager.listOrders().length,
      products: fastify.stateManager.listProducts().length,
      customers: fastify.stateManager.listCustomers().length,
      inventoryItems: fastify.stateManager.listInventoryItems().length,
      tokens: tokenCount.count,
      webhooks: fastify.stateManager.listWebhookSubscriptions().length,
    };
  });

  // ---------------------------------------------------------------------------
  // Dead Letter Queue (DLQ) inspection endpoints
  // ---------------------------------------------------------------------------

  // GET /admin/dead-letter-queue - list all DLQ entries
  fastify.get('/admin/dead-letter-queue', async (request) => {
    request.log.info('Listing dead letter queue entries');
    return fastify.deadLetterStore.list();
  });

  // GET /admin/dead-letter-queue/:id - get single DLQ entry
  fastify.get<{ Params: { id: string } }>('/admin/dead-letter-queue/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const entry = fastify.deadLetterStore.get(id);
    if (!entry) {
      return reply.status(404).send({ error: 'Dead letter entry not found' });
    }
    return entry;
  });

  // POST /admin/dead-letter-queue/:id/retry - remove from DLQ and re-enqueue
  fastify.post<{ Params: { id: string } }>('/admin/dead-letter-queue/:id/retry', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const entry = fastify.deadLetterStore.get(id);
    if (!entry) {
      return reply.status(404).send({ error: 'Dead letter entry not found' });
    }

    // Remove from DLQ
    fastify.deadLetterStore.remove(id);

    // Re-enqueue for retry
    await fastify.webhookQueue.enqueue({
      id: randomUUID(),
      topic: entry.topic,
      callbackUrl: entry.callbackUrl,
      payload: JSON.parse(entry.payload),
      secret: fastify.webhookSecret,
    });

    request.log.info({ dlqId: id, topic: entry.topic }, 'Re-enqueued dead letter entry');
    return { retried: true, topic: entry.topic, callbackUrl: entry.callbackUrl };
  });

  // DELETE /admin/dead-letter-queue - clear all DLQ entries
  fastify.delete('/admin/dead-letter-queue', async (request) => {
    request.log.info('Clearing dead letter queue');
    fastify.deadLetterStore.clear();
    return { cleared: true };
  });

  // DELETE /admin/dead-letter-queue/:id - remove single DLQ entry
  fastify.delete<{ Params: { id: string } }>('/admin/dead-letter-queue/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const removed = fastify.deadLetterStore.remove(id);
    if (!removed) {
      return reply.status(404).send({ error: 'Dead letter entry not found' });
    }
    return { removed: true };
  });
};

export default adminPlugin;
export { adminPlugin };
