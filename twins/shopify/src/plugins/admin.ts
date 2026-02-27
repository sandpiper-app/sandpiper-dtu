/**
 * Admin plugin for Shopify twin
 * Provides test control endpoints: reset, fixtures, state inspection
 */

import type { FastifyPluginAsync } from 'fastify';
import type { StateManager } from '@dtu/state';
import type { ResetResponse } from '@dtu/types';
import { createGID } from '../services/gid.js';

interface FixturesLoadBody {
  orders?: any[];
  products?: any[];
  customers?: any[];
}

interface FixturesLoadResponse {
  loaded: {
    orders: number;
    products: number;
    customers: number;
  };
}

interface StateResponse {
  orders: number;
  products: number;
  customers: number;
  tokens: number;
  webhooks: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    stateManager: StateManager;
  }
}

const adminPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/reset - reset all state
  fastify.post<{ Reply: ResetResponse }>('/admin/reset', async (request) => {
    request.log.info('Resetting twin state');
    fastify.stateManager.reset();
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
    const { orders = [], products = [], customers = [] } = request.body;

    request.log.info(
      { orderCount: orders.length, productCount: products.length, customerCount: customers.length },
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

    return {
      loaded: {
        orders: orders.length,
        products: products.length,
        customers: customers.length,
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
      tokens: tokenCount.count,
      webhooks: fastify.stateManager.listWebhookSubscriptions().length,
    };
  });
};

export default adminPlugin;
export { adminPlugin };
