/**
 * GraphQL resolvers for Shopify Admin API
 *
 * Implements queries and mutations for orders, products, customers
 * with Shopify-realistic response structures including GID format IDs.
 */

import { GraphQLScalarType, Kind } from 'graphql';
import { createGID, parseGID } from '../services/gid.js';
import type { StateManager } from '@dtu/state';

interface Context {
  stateManager: StateManager;
  shopDomain: string;
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
      const orders = context.stateManager.listOrders();
      const limit = args.first ?? 10;
      return {
        edges: orders.slice(0, limit).map((order: any) => ({
          node: order,
        })),
      };
    },

    order: async (_parent: unknown, args: { id: string }, context: Context) => {
      const { id } = parseGID(args.id);
      const order = context.stateManager.getOrder(parseInt(id, 10));
      return order ?? null;
    },

    products: async (_parent: unknown, args: { first?: number }, context: Context) => {
      const products = context.stateManager.listProducts();
      const limit = args.first ?? 10;
      return {
        edges: products.slice(0, limit).map((product: any) => ({
          node: product,
        })),
      };
    },

    product: async (_parent: unknown, args: { id: string }, context: Context) => {
      const { id } = parseGID(args.id);
      const gid = createGID('Product', id);
      const product = context.stateManager.getProductByGid(gid);
      return product ?? null;
    },

    customers: async (_parent: unknown, args: { first?: number }, context: Context) => {
      const customers = context.stateManager.listCustomers();
      const limit = args.first ?? 10;
      return {
        edges: customers.slice(0, limit).map((customer: any) => ({
          node: customer,
        })),
      };
    },

    customer: async (_parent: unknown, args: { id: string }, context: Context) => {
      const { id } = parseGID(args.id);
      const gid = createGID('Customer', id);
      const customer = context.stateManager.getCustomerByGid(gid);
      return customer ?? null;
    },
  },

  // Mutation resolvers
  MutationType: {
    orderCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
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

      // Create order
      const orderId = context.stateManager.createOrder({
        gid: createGID('Order', 0), // Placeholder - actual GID computed from ID in type resolver
        name: `#${Math.floor(1000 + Math.random() * 9000)}`, // Generate order name
        total_price: input.totalPrice,
        currency_code: input.currencyCode,
        customer_gid: input.customerId ?? null,
        line_items: input.lineItems,
      });

      const order = context.stateManager.getOrder(orderId);

      return { order, userErrors: [] };
    },

    orderUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
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

      // Update order
      const updateData: any = {};
      if (input.lineItems) {
        updateData.line_items = JSON.stringify(input.lineItems);
      }
      if (input.totalPrice) {
        updateData.total_price = input.totalPrice;
      }
      if (input.currencyCode) {
        updateData.currency_code = input.currencyCode;
      }

      context.stateManager.updateOrder(orderId, updateData);
      const updatedOrder = context.stateManager.getOrder(orderId);

      return { order: updatedOrder, userErrors: [] };
    },

    productCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
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

      const productId = context.stateManager.createProduct({
        gid: createGID('Product', 0), // Placeholder - actual GID computed from ID in type resolver
        title: input.title,
        description: input.description ?? null,
        vendor: input.vendor ?? null,
        product_type: input.productType ?? null,
      });

      const product = context.stateManager.getProduct(productId);

      return { product, userErrors: [] };
    },

    customerCreate: async (_parent: unknown, args: { input: any }, context: Context) => {
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

      const customerId = context.stateManager.createCustomer({
        gid: createGID('Customer', 0), // Placeholder - actual GID computed from ID in type resolver
        email: input.email,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      });

      const customer = context.stateManager.getCustomer(customerId);

      return { customer, userErrors: [] };
    },
  },

  // Type resolvers
  Order: {
    id: (parent: any) => createGID('Order', parent.id),
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
  },

  Customer: {
    id: (parent: any) => createGID('Customer', parent.id),
  },

  InventoryItem: {
    id: (parent: any) => createGID('InventoryItem', parent.id),
  },

  Fulfillment: {
    id: (parent: any) => createGID('Fulfillment', parent.id),
  },
};
