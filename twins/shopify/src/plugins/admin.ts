/**
 * Admin plugin for Shopify twin
 * Provides test control endpoints: reset, fixtures, state inspection
 */

import type { FastifyPluginAsync } from 'fastify';
import type { StateManager } from '@dtu/state';
import type { ResetResponse } from '@dtu/types';

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

    // Load orders
    for (const order of orders) {
      fastify.stateManager.createOrder(order);
    }

    // Load products
    for (const product of products) {
      fastify.stateManager.createProduct(product);
    }

    // Load customers
    for (const customer of customers) {
      fastify.stateManager.createCustomer(customer);
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
