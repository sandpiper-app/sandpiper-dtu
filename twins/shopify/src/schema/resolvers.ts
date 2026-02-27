/**
 * GraphQL resolvers for Shopify Admin API
 *
 * Implements queries and mutations for orders, products, customers
 * with Shopify-realistic response structures including GID format IDs.
 * Mutations check error simulation and trigger webhook delivery.
 */

import { GraphQLScalarType, GraphQLError, Kind } from 'graphql';
import { createGID, parseGID } from '../services/gid.js';
import { sendWebhook } from '../services/webhook-sender.js';
import type { StateManager } from '@dtu/state';
import type { ErrorSimulator } from '../services/error-simulator.js';

interface Context {
  stateManager: StateManager;
  errorSimulator: ErrorSimulator;
  webhookSecret: string;
  shopDomain: string;
  authorized: boolean;
}

/** Throw GraphQLError if the request is not authenticated */
function requireAuth(context: Context): void {
  if (!context.authorized) {
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHORIZED' },
    });
  }
}

interface UserError {
  field: string[];
  message: string;
}

// DateTime scalar - converts Unix timestamp (seconds) to ISO string
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type (ISO 8601 string)',
  serialize(value: unknown): string {
    // From DB (Unix timestamp in seconds) to GraphQL response (ISO string)
    if (typeof value === 'number') {
      return new Date(value * 1000).toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    throw new Error('DateTime must be a number (Unix timestamp) or string (ISO 8601)');
  },
  parseValue(value: unknown): number {
    // From GraphQL input to DB (Unix timestamp in seconds)
    if (typeof value === 'string') {
      return Math.floor(new Date(value).getTime() / 1000);
    }
    throw new Error('DateTime input must be an ISO 8601 string');
  },
  parseLiteral(ast): number {
    if (ast.kind === Kind.STRING) {
      return Math.floor(new Date(ast.value).getTime() / 1000);
    }
    throw new Error('DateTime literal must be a string');
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,

  // Query resolvers
  QueryRoot: {
    orders: async (_parent: unknown, args: { first?: number }, context: Context) => {
      requireAuth(context);
      const orders = context.stateManager.listOrders();
      const limit = args.first ?? 10;
      return {
        edges: orders.slice(0, limit).map((order: any) => ({
          node: order,
        })),
      };
    },

    order: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const order = context.stateManager.getOrder(parseInt(id, 10));
      return order ?? null;
    },

    products: async (_parent: unknown, args: { first?: number }, context: Context) => {
      requireAuth(context);
      const products = context.stateManager.listProducts();
      const limit = args.first ?? 10;
      return {
        edges: products.slice(0, limit).map((product: any) => ({
          node: product,
        })),
      };
    },

    product: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const gid = createGID('Product', id);
      const product = context.stateManager.getProductByGid(gid);
      return product ?? null;
    },

    customers: async (_parent: unknown, args: { first?: number }, context: Context) => {
      requireAuth(context);
      const customers = context.stateManager.listCustomers();
      const limit = args.first ?? 10;
      return {
        edges: customers.slice(0, limit).map((customer: any) => ({
          node: customer,
        })),
      };
    },

    customer: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const gid = createGID('Customer', id);
      const customer = context.stateManager.getCustomerByGid(gid);
      return customer ?? null;
    },
  },

  // Mutation resolvers
  MutationType: {
    orderCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      // Check error simulation first
      await context.errorSimulator.throwIfConfigured('orderCreate');

      const { input } = args;
      const errors: UserError[] = [];

      // Validate required fields
      if (!input.lineItems || input.lineItems.length === 0) {
        errors.push({
          field: ['lineItems'],
          message: 'Line items are required',
        });
      }

      if (!input.totalPrice) {
        errors.push({
          field: ['totalPrice'],
          message: 'Total price is required',
        });
      }

      if (!input.currencyCode) {
        errors.push({
          field: ['currencyCode'],
          message: 'Currency code is required',
        });
      }

      if (errors.length > 0) {
        return { order: null, userErrors: errors };
      }

      // Create order — use unique placeholder GID, then update with actual ID
      const tempId = Date.now() + Math.floor(Math.random() * 100000);
      const orderId = context.stateManager.createOrder({
        gid: createGID('Order', tempId),
        name: `#${Math.floor(1000 + Math.random() * 9000)}`, // Generate order name
        total_price: input.totalPrice,
        currency_code: input.currencyCode,
        customer_gid: input.customerId ?? null,
        line_items: input.lineItems,
      });

      const order = context.stateManager.getOrder(orderId);

      // Send webhooks (fire and forget)
      if (order) {
        const subscriptions = context.stateManager.listWebhookSubscriptions();
        const orderSubs = subscriptions.filter((s: any) => s.topic === 'orders/create');
        for (const sub of orderSubs) {
          sendWebhook(
            sub.callback_url,
            'orders/create',
            {
              id: order.id,
              admin_graphql_api_id: createGID('Order', order.id),
              created_at: new Date(order.created_at * 1000).toISOString(),
              name: order.name,
              total_price: order.total_price,
              line_items: JSON.parse(order.line_items || '[]'),
            },
            context.webhookSecret,
          );
        }
      }

      return { order, userErrors: [] };
    },

    orderUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      // Check error simulation first
      await context.errorSimulator.throwIfConfigured('orderUpdate');

      const { input } = args;
      const errors: UserError[] = [];

      // Parse GID to get internal ID
      let orderId: number;
      try {
        const { id } = parseGID(input.id);
        orderId = parseInt(id, 10);
      } catch (err) {
        errors.push({
          field: ['id'],
          message: 'Invalid order ID format',
        });
        return { order: null, userErrors: errors };
      }

      // Check if order exists
      const existingOrder = context.stateManager.getOrder(orderId);
      if (!existingOrder) {
        errors.push({
          field: ['id'],
          message: 'Order not found',
        });
        return { order: null, userErrors: errors };
      }

      // Build update data, preserving existing values for fields not provided
      const updateData: any = {
        name: existingOrder.name,
        total_price: input.totalPrice ?? existingOrder.total_price,
        currency_code: input.currencyCode ?? existingOrder.currency_code,
        customer_gid: existingOrder.customer_gid,
        line_items: input.lineItems ? JSON.stringify(input.lineItems) : existingOrder.line_items,
      };

      context.stateManager.updateOrder(orderId, updateData);
      const updatedOrder = context.stateManager.getOrder(orderId);

      // Send webhooks (fire and forget)
      if (updatedOrder) {
        const subscriptions = context.stateManager.listWebhookSubscriptions();
        const orderUpdateSubs = subscriptions.filter((s: any) => s.topic === 'orders/update');
        for (const sub of orderUpdateSubs) {
          sendWebhook(
            sub.callback_url,
            'orders/update',
            {
              id: updatedOrder.id,
              admin_graphql_api_id: createGID('Order', updatedOrder.id),
              created_at: new Date(updatedOrder.created_at * 1000).toISOString(),
              updated_at: new Date(updatedOrder.updated_at * 1000).toISOString(),
              name: updatedOrder.name,
              total_price: updatedOrder.total_price,
              line_items: JSON.parse(updatedOrder.line_items || '[]'),
            },
            context.webhookSecret,
          );
        }
      }

      return { order: updatedOrder, userErrors: [] };
    },

    productCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      // Check error simulation first
      await context.errorSimulator.throwIfConfigured('productCreate');

      const { input } = args;
      const errors: UserError[] = [];

      if (!input.title) {
        errors.push({
          field: ['title'],
          message: 'Title is required',
        });
      }

      if (errors.length > 0) {
        return { product: null, userErrors: errors };
      }

      const productTempId = Date.now() + Math.floor(Math.random() * 100000);
      const productId = context.stateManager.createProduct({
        gid: createGID('Product', productTempId),
        title: input.title,
        description: input.description ?? null,
        vendor: input.vendor ?? null,
        product_type: input.productType ?? null,
      });

      const product = context.stateManager.getProduct(productId);

      // Send webhooks (fire and forget)
      if (product) {
        const subscriptions = context.stateManager.listWebhookSubscriptions();
        const productSubs = subscriptions.filter((s: any) => s.topic === 'products/create');
        for (const sub of productSubs) {
          sendWebhook(
            sub.callback_url,
            'products/create',
            {
              id: product.id,
              admin_graphql_api_id: createGID('Product', product.id),
              created_at: new Date(product.created_at * 1000).toISOString(),
              title: product.title,
            },
            context.webhookSecret,
          );
        }
      }

      return { product, userErrors: [] };
    },

    productUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      await context.errorSimulator.throwIfConfigured('productUpdate');

      const { input } = args;
      const errors: UserError[] = [];

      // Parse GID to get internal ID
      let productId: number;
      try {
        const { id } = parseGID(input.id);
        productId = parseInt(id, 10);
      } catch (err) {
        errors.push({ field: ['id'], message: 'Invalid product ID format' });
        return { product: null, userErrors: errors };
      }

      // Check if product exists
      const existingProduct = context.stateManager.getProduct(productId);
      if (!existingProduct) {
        errors.push({ field: ['id'], message: 'Product not found' });
        return { product: null, userErrors: errors };
      }

      // Build update data, preserving existing values for fields not provided
      const updateData = {
        title: input.title ?? existingProduct.title,
        description: input.description ?? existingProduct.description,
        vendor: input.vendor ?? existingProduct.vendor,
        product_type: input.productType ?? existingProduct.product_type,
      };

      context.stateManager.updateProduct(productId, updateData);
      const updatedProduct = context.stateManager.getProduct(productId);

      // Send webhooks (fire and forget)
      if (updatedProduct) {
        const subscriptions = context.stateManager.listWebhookSubscriptions();
        const productUpdateSubs = subscriptions.filter((s: any) => s.topic === 'products/update');
        for (const sub of productUpdateSubs) {
          sendWebhook(
            sub.callback_url,
            'products/update',
            {
              id: updatedProduct.id,
              admin_graphql_api_id: createGID('Product', updatedProduct.id),
              created_at: new Date(updatedProduct.created_at * 1000).toISOString(),
              updated_at: new Date(updatedProduct.updated_at * 1000).toISOString(),
              title: updatedProduct.title,
            },
            context.webhookSecret,
          );
        }
      }

      return { product: updatedProduct, userErrors: [] };
    },

    fulfillmentCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      await context.errorSimulator.throwIfConfigured('fulfillmentCreate');

      const { input } = args;
      const errors: UserError[] = [];

      // Validate orderId
      if (!input.orderId) {
        errors.push({ field: ['orderId'], message: 'Order ID is required' });
        return { fulfillment: null, userErrors: errors };
      }

      // Parse order GID to verify format
      try {
        parseGID(input.orderId);
      } catch (err) {
        errors.push({ field: ['orderId'], message: 'Invalid order ID format' });
        return { fulfillment: null, userErrors: errors };
      }

      if (errors.length > 0) {
        return { fulfillment: null, userErrors: errors };
      }

      const tempId = Date.now() + Math.floor(Math.random() * 100000);
      const fulfillmentId = context.stateManager.createFulfillment({
        gid: createGID('Fulfillment', tempId),
        order_gid: input.orderId,
        status: input.status ?? 'success',
        tracking_number: input.trackingNumber ?? null,
      });

      const fulfillment = context.stateManager.getFulfillment(fulfillmentId);

      // Send webhooks (fire and forget)
      if (fulfillment) {
        const subscriptions = context.stateManager.listWebhookSubscriptions();
        const fulfillmentSubs = subscriptions.filter((s: any) => s.topic === 'fulfillments/create');
        for (const sub of fulfillmentSubs) {
          sendWebhook(
            sub.callback_url,
            'fulfillments/create',
            {
              id: fulfillment.id,
              admin_graphql_api_id: createGID('Fulfillment', fulfillment.id),
              created_at: new Date(fulfillment.created_at * 1000).toISOString(),
              order_id: fulfillment.order_gid,
              status: fulfillment.status,
              tracking_number: fulfillment.tracking_number,
            },
            context.webhookSecret,
          );
        }
      }

      return { fulfillment, userErrors: [] };
    },

    customerCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      // Check error simulation first
      await context.errorSimulator.throwIfConfigured('customerCreate');

      const { input } = args;
      const errors: UserError[] = [];

      if (!input.email) {
        errors.push({
          field: ['email'],
          message: 'Email is required',
        });
      }

      if (errors.length > 0) {
        return { customer: null, userErrors: errors };
      }

      const customerTempId = Date.now() + Math.floor(Math.random() * 100000);
      const customerId = context.stateManager.createCustomer({
        gid: createGID('Customer', customerTempId),
        email: input.email,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      });

      const customer = context.stateManager.getCustomer(customerId);

      // Send webhooks (fire and forget)
      if (customer) {
        const subscriptions = context.stateManager.listWebhookSubscriptions();
        const customerSubs = subscriptions.filter((s: any) => s.topic === 'customers/create');
        for (const sub of customerSubs) {
          sendWebhook(
            sub.callback_url,
            'customers/create',
            {
              id: customer.id,
              admin_graphql_api_id: createGID('Customer', customer.id),
              created_at: new Date(customer.created_at * 1000).toISOString(),
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name,
            },
            context.webhookSecret,
          );
        }
      }

      return { customer, userErrors: [] };
    },
  },

  // Type resolvers
  Order: {
    id: (parent: any) => createGID('Order', parent.id),
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    lineItems: (parent: any) => {
      const items = JSON.parse(parent.line_items || '[]');
      return {
        edges: items.map((item: any, index: number) => ({
          node: {
            id: createGID('LineItem', `${parent.id}-${index}`),
            ...item,
          },
        })),
      };
    },
    totalPriceSet: (parent: any) => ({
      shopMoney: {
        amount: parent.total_price,
        currencyCode: parent.currency_code,
      },
    }),
    customer: async (parent: any, _args: unknown, context: Context) => {
      if (!parent.customer_gid) return null;
      const customer = context.stateManager.getCustomerByGid(parent.customer_gid);
      return customer ?? null;
    },
  },

  Product: {
    id: (parent: any) => createGID('Product', parent.id),
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    productType: (parent: any) => parent.product_type,
  },

  Customer: {
    id: (parent: any) => createGID('Customer', parent.id),
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    firstName: (parent: any) => parent.first_name,
    lastName: (parent: any) => parent.last_name,
  },

  InventoryItem: {
    id: (parent: any) => createGID('InventoryItem', parent.id),
  },

  Fulfillment: {
    id: (parent: any) => createGID('Fulfillment', parent.id),
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    trackingNumber: (parent: any) => parent.tracking_number,
    order: async (parent: any, _args: unknown, context: Context) => {
      if (!parent.order_gid) return null;
      const order = context.stateManager.getOrderByGid(parent.order_gid);
      return order ?? null;
    },
  },
};
