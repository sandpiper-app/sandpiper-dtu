/**
 * GraphQL resolvers for Shopify Admin API
 *
 * Implements queries and mutations for orders, products, customers
 * with Shopify-realistic response structures including GID format IDs.
 * Mutations check error simulation and trigger webhook delivery via @dtu/webhooks queue.
 *
 * All connection queries (orders, products, customers) support Relay-spec cursor pagination:
 *   first, after, last, before arguments with pageInfo and cursor on edges.
 */

import { randomUUID } from 'node:crypto';
import { GraphQLScalarType, GraphQLError, Kind } from 'graphql';
import { createGID, parseGID } from '../services/gid.js';
import { encodeCursor, decodeCursor } from '../services/cursor.js';
import { validateFulfillment, validateClose } from '../services/order-lifecycle.js';
import type { StateManager } from '@dtu/state';
import type { WebhookQueue } from '@dtu/webhooks';
import type { ErrorSimulator } from '../services/error-simulator.js';

interface Context {
  stateManager: StateManager;
  errorSimulator: ErrorSimulator;
  webhookSecret: string;
  shopDomain: string;
  authorized: boolean;
  webhookQueue: WebhookQueue;
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

/** Enqueue a webhook delivery to all subscriptions for a given topic */
async function enqueueWebhooks(
  context: Context,
  topic: string,
  payload: Record<string, unknown>
): Promise<void> {
  const subscriptions = context.stateManager.listWebhookSubscriptions();
  const matching = subscriptions.filter((s: any) => s.topic === topic);
  for (const sub of matching) {
    await context.webhookQueue.enqueue({
      id: randomUUID(),
      topic,
      callbackUrl: sub.callback_url,
      payload,
      secret: context.webhookSecret,
      headers: {
        'X-Shopify-Shop-Domain': context.shopDomain,
        'X-Shopify-API-Version': '2024-01',
      },
    });
  }
}

/**
 * Relay-spec cursor pagination helper.
 *
 * Accepts items sorted by id ASC (guaranteed by listOrders/listProducts/listCustomers ORDER BY id ASC).
 * Applies after/before cursor filtering, then first/last slicing.
 * Returns { edges, pageInfo } compatible with Relay-spec connection types.
 *
 * Throws GraphQLError on invalid cursors (wrong resource type, malformed).
 */
function paginate<T extends { id: number }>(
  items: T[],
  args: { first?: number | null; after?: string | null; last?: number | null; before?: string | null },
  resourceType: string
): {
  edges: Array<{ node: T; cursor: string }>;
  nodes: T[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
} {
  // Defensive sort by id ASC (DB should already guarantee this)
  const sorted = [...items].sort((a, b) => a.id - b.id);

  let filtered = sorted;

  // Apply `after` cursor: filter items where id > afterId
  if (args.after) {
    let afterId: number;
    try {
      afterId = decodeCursor(args.after, resourceType);
    } catch (err) {
      throw new GraphQLError(err instanceof Error ? err.message : 'Invalid cursor', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    filtered = filtered.filter(item => item.id > afterId);
  }

  // Apply `before` cursor: filter items where id < beforeId
  if (args.before) {
    let beforeId: number;
    try {
      beforeId = decodeCursor(args.before, resourceType);
    } catch (err) {
      throw new GraphQLError(err instanceof Error ? err.message : 'Invalid cursor', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    filtered = filtered.filter(item => item.id < beforeId);
  }

  // Track count after cursor filtering, before slicing — needed for hasNextPage/hasPreviousPage
  const totalAfterCursors = filtered.length;

  // Apply `first` or `last` slicing
  if (args.first != null) {
    filtered = filtered.slice(0, args.first);
  } else if (args.last != null) {
    filtered = filtered.slice(Math.max(0, filtered.length - args.last));
  }

  // Build edges with cursor on each
  const edges = filtered.map(item => ({
    node: item,
    cursor: encodeCursor(resourceType, item.id),
  }));

  // Build pageInfo
  const hasNextPage = args.first != null ? totalAfterCursors > args.first : false;
  const hasPreviousPage =
    args.after != null ||
    (args.last != null && totalAfterCursors > args.last);

  const pageInfo = {
    hasNextPage,
    hasPreviousPage,
    startCursor: edges.length > 0 ? edges[0].cursor : null,
    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
  };

  return { edges, nodes: edges.map(e => e.node), pageInfo };
}

// Decimal scalar — accepts both numeric and string values for money amounts.
// The SDK sends amount as a number (e.g., 10.0) but MoneyInput.amount needs to
// accept it. Serializes to string for consistent output (matching MoneyV2.amount).
const DecimalScalar = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Decimal scalar — accepts numeric or string money amount values',
  serialize(value: unknown): string {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    throw new Error('Decimal must be a number or string');
  },
  parseValue(value: unknown): string {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    throw new Error('Decimal input must be a number or string');
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.FLOAT || ast.kind === Kind.INT) return ast.value;
    if (ast.kind === Kind.STRING) return ast.value;
    throw new Error('Decimal literal must be a number or string');
  },
});

// URL scalar — pass-through (accepts and returns URL strings as-is)
const URLScalar = new GraphQLScalarType({
  name: 'URL',
  description: 'URL custom scalar type (string URL)',
  serialize(value: unknown): string {
    if (typeof value === 'string') return value;
    throw new Error('URL must be a string');
  },
  parseValue(value: unknown): string {
    if (typeof value === 'string') return value;
    throw new Error('URL input must be a string');
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.STRING) return ast.value;
    throw new Error('URL literal must be a string');
  },
});

// CurrencyCode scalar — accepts both string literals ("USD") and enum literals (USD)
// Shopify uses CurrencyCode as an enum; the twin accepts both forms for compatibility.
const CurrencyCodeScalar = new GraphQLScalarType({
  name: 'CurrencyCode',
  description: 'ISO 4217 currency code (e.g. USD, EUR). Accepts both string and enum-literal syntax.',
  serialize(value: unknown): string {
    if (typeof value === 'string') return value;
    throw new Error('CurrencyCode must be a string');
  },
  parseValue(value: unknown): string {
    if (typeof value === 'string') return value;
    throw new Error('CurrencyCode input must be a string');
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.STRING) return ast.value;
    if (ast.kind === Kind.ENUM) return ast.value;
    throw new Error('CurrencyCode literal must be a string or enum value');
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,
  URL: URLScalar,
  Decimal: DecimalScalar,
  CurrencyCode: CurrencyCodeScalar,

  // Query resolvers
  QueryRoot: {
    orders: async (
      _parent: unknown,
      args: { first?: number; after?: string; last?: number; before?: string },
      context: Context
    ) => {
      requireAuth(context);
      const orders = context.stateManager.listOrders();
      return paginate(orders, args, 'Order');
    },

    order: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const gid = createGID('Order', id);
      const order = context.stateManager.getOrderByGid(gid);
      return order ?? null;
    },

    products: async (
      _parent: unknown,
      args: { first?: number; after?: string; last?: number; before?: string },
      context: Context
    ) => {
      requireAuth(context);
      const products = context.stateManager.listProducts();
      return paginate(products, args, 'Product');
    },

    product: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const gid = createGID('Product', id);
      const product = context.stateManager.getProductByGid(gid);
      return product ?? null;
    },

    customers: async (
      _parent: unknown,
      args: { first?: number; after?: string; last?: number; before?: string },
      context: Context
    ) => {
      requireAuth(context);
      const customers = context.stateManager.listCustomers();
      return paginate(customers, args, 'Customer');
    },

    customer: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const gid = createGID('Customer', id);
      const customer = context.stateManager.getCustomerByGid(gid);
      return customer ?? null;
    },

    inventoryItems: async (
      _parent: unknown,
      args: { first?: number; after?: string; last?: number; before?: string },
      context: Context
    ) => {
      requireAuth(context);
      const items = context.stateManager.listInventoryItems();
      return paginate(items, args, 'InventoryItem');
    },

    inventoryItem: async (_parent: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      const { id } = parseGID(args.id);
      const gid = createGID('InventoryItem', id);
      const item = context.stateManager.getInventoryItemByGid(gid);
      return item ?? null;
    },

    // nodes(ids: [ID!]!) — used by ShopifyClient.getInventoryLevels() for bulk lookup
    // Returns InventoryItem objects for any inventory item IDs; ignores unknown IDs.
    nodes: async (_parent: unknown, args: { ids: string[] }, context: Context) => {
      requireAuth(context);
      return args.ids.map((id: string) => {
        const item = context.stateManager.getInventoryItemByGid(id);
        return item ?? null;
      }).filter((item: unknown) => item !== null);
    },

    currentAppInstallation: (_: unknown, _args: unknown, context: Context) => {
      requireAuth(context);
      const activeSubscriptions = context.stateManager.listActiveAppSubscriptions(context.shopDomain);
      return {
        activeSubscriptions: activeSubscriptions.map((sub: any) => {
          const subItems: any[] = sub.line_items ? JSON.parse(sub.line_items) : [];
          const lineItems = subItems.map((item: any, idx: number) => ({
            id: `gid://shopify/AppSubscriptionLineItem/${idx + 1}`,
            plan: {
              pricingDetails: item.plan?.appRecurringPricingDetails
                ? {
                    interval: item.plan.appRecurringPricingDetails.interval,
                    price: item.plan.appRecurringPricingDetails.price
                      ?? { amount: String(item.plan.appRecurringPricingDetails.amount ?? '0.00'), currencyCode: item.plan.appRecurringPricingDetails.currencyCode ?? 'USD' },
                  }
                : { interval: 'EVERY_30_DAYS', price: { amount: '0.00', currencyCode: 'USD' } },
            },
          }));
          return {
            id: sub.gid,
            name: sub.name,
            status: sub.status,
            test: sub.test === 1,
            returnUrl: sub.return_url ?? 'https://example.com',
            currentPeriodEnd: null,
            trialDays: sub.trial_days ?? 0,
            lineItems,
            createdAt: new Date(sub.created_at * 1000).toISOString(),
          };
        }),
        oneTimePurchases: (() => {
          const purchases = context.stateManager.listOneTimePurchasesByShop(context.shopDomain);
          return {
            edges: purchases.map((p: any) => ({
              node: {
                id: p.gid,
                name: p.name,
                status: p.status,
                test: p.test === 1,
                price: { amount: p.price_amount, currencyCode: p.price_currency_code },
                createdAt: new Date(p.created_at * 1000).toISOString(),
              },
            })),
            pageInfo: { hasNextPage: false, endCursor: null },
          };
        })(),
      };
    },

    shop: () => ({ name: 'Sandpiper Dev Store' }),
  },

  // Node interface type resolver — determines the concrete type for nodes(ids: [ID!]!)
  Node: {
    __resolveType(obj: unknown) {
      // All nodes returned by the twin's nodes() resolver are InventoryItem
      return 'InventoryItem';
    },
  },

  // Mutation resolvers
  MutationType: {
    orderCreate: async (_parent: unknown, args: { order: any }, context: Context) => {
      requireAuth(context);
      // Check error simulation first
      await context.errorSimulator.throwIfConfigured('orderCreate');

      const input = args.order;
      const errors: UserError[] = [];

      // Validate required fields
      if (!input.lineItems || input.lineItems.length === 0) {
        errors.push({
          field: ['lineItems'],
          message: 'Line items are required',
        });
      }

      if (errors.length > 0) {
        return { order: null, userErrors: errors };
      }

      // Derive totalPrice from line items if not explicitly provided
      let totalPrice = input.totalPrice;
      if (!totalPrice) {
        let sum = 0;
        for (const item of input.lineItems) {
          if (item.priceSet?.shopMoney?.amount) {
            sum += parseFloat(item.priceSet.shopMoney.amount) * (item.quantity ?? 1);
          }
        }
        totalPrice = sum > 0 ? sum.toFixed(2) : '0.00';
      }

      // Derive currencyCode from line items or default
      let currencyCode = input.currencyCode;
      if (!currencyCode) {
        for (const item of input.lineItems) {
          if (item.priceSet?.shopMoney?.currencyCode) {
            currencyCode = item.priceSet.shopMoney.currencyCode;
            break;
          }
        }
        currencyCode = currencyCode ?? 'USD';
      }

      // Two-step GID pattern: insert with temp GID, get row ID, UPDATE to canonical GID
      const tempOrderGid = `gid://shopify/Order/temp-${Date.now()}`;
      const orderId = context.stateManager.createOrder({
        gid: tempOrderGid,
        name: `#${Math.floor(1000 + Math.random() * 9000)}`, // Generate order name
        total_price: totalPrice,
        currency_code: currencyCode,
        customer_gid: input.customerId ?? null,
        line_items: input.lineItems,
        financial_status: input.financialStatus ?? 'PENDING',
      });
      const canonicalOrderGid = createGID('Order', orderId);
      context.stateManager.database
        .prepare('UPDATE orders SET gid = ? WHERE id = ?')
        .run(canonicalOrderGid, orderId);

      const order = context.stateManager.getOrder(orderId);

      // Enqueue webhooks via async queue
      if (order) {
        await enqueueWebhooks(context, 'orders/create', {
          id: order.id,
          admin_graphql_api_id: order.gid,
          created_at: new Date(order.created_at * 1000).toISOString(),
          name: order.name,
          total_price: order.total_price,
          line_items: JSON.parse(order.line_items || '[]'),
        });
      }

      return { order, userErrors: [] };
    },

    orderUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      // Check error simulation first
      await context.errorSimulator.throwIfConfigured('orderUpdate');

      const { input } = args;
      const errors: UserError[] = [];

      // Parse GID to get order by stored GID
      let orderGid: string;
      try {
        const { id } = parseGID(input.id);
        orderGid = createGID('Order', id);
      } catch (err) {
        errors.push({
          field: ['id'],
          message: 'Invalid order ID format',
        });
        return { order: null, userErrors: errors };
      }

      // Check if order exists
      const existingOrder = context.stateManager.getOrderByGid(orderGid);
      if (!existingOrder) {
        errors.push({
          field: ['id'],
          message: 'Order not found',
        });
        return { order: null, userErrors: errors };
      }

      // Build update data, preserving existing values for fields not provided.
      // Pass raw line_items (not pre-stringified) — stateManager.updateOrder() calls
      // JSON.stringify() internally, so double-stringifying would corrupt reads.
      // When lineItems is absent, pass the already-stored JSON string through the
      // existing_line_items path so the state layer treats it as a raw value.
      let lineItemsValue: any;
      if (input.lineItems !== undefined && input.lineItems !== null) {
        // Resolver received structured data — pass it raw; state layer will stringify once.
        lineItemsValue = input.lineItems;
      } else {
        // No update to line items — preserve existing stored JSON string by parsing it
        // back to an object so the state layer re-stringifies it consistently.
        lineItemsValue = existingOrder.line_items
          ? (() => { try { return JSON.parse(existingOrder.line_items); } catch { return null; } })()
          : null;
      }
      const updateData: any = {
        name: existingOrder.name,
        total_price: input.totalPrice ?? existingOrder.total_price,
        currency_code: input.currencyCode ?? existingOrder.currency_code,
        customer_gid: existingOrder.customer_gid,
        line_items: lineItemsValue,
      };

      context.stateManager.updateOrder(existingOrder.id, updateData);
      const updatedOrder = context.stateManager.getOrder(existingOrder.id);

      // Enqueue webhooks via async queue
      if (updatedOrder) {
        await enqueueWebhooks(context, 'orders/update', {
          id: updatedOrder.id,
          admin_graphql_api_id: updatedOrder.gid,
          created_at: new Date(updatedOrder.created_at * 1000).toISOString(),
          updated_at: new Date(updatedOrder.updated_at * 1000).toISOString(),
          name: updatedOrder.name,
          total_price: updatedOrder.total_price,
          line_items: JSON.parse(updatedOrder.line_items || '[]'),
        });
      }

      return { order: updatedOrder, userErrors: [] };
    },

    orderClose: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      await context.errorSimulator.throwIfConfigured('orderClose');

      const { input } = args;
      const errors: UserError[] = [];

      // Parse GID to look up order by stored GID
      let orderGid: string;
      try {
        const { id } = parseGID(input.id);
        orderGid = createGID('Order', id);
      } catch (err) {
        errors.push({ field: ['id'], message: 'Invalid order ID format' });
        return { order: null, userErrors: errors };
      }

      // Look up order
      const existingOrder = context.stateManager.getOrderByGid(orderGid);
      if (!existingOrder) {
        errors.push({ field: ['id'], message: 'Order not found' });
        return { order: null, userErrors: errors };
      }

      // Validate the close transition
      const closeError = validateClose({
        fulfillmentStatus: existingOrder.display_fulfillment_status ?? 'UNFULFILLED',
        financialStatus: existingOrder.display_financial_status ?? 'PENDING',
        closedAt: existingOrder.closed_at ?? null,
      });
      if (closeError) {
        return { order: null, userErrors: [{ field: ['id'], message: closeError }] };
      }

      // Close the order
      context.stateManager.closeOrder(existingOrder.id);

      // Fetch updated order
      const closedOrder = context.stateManager.getOrder(existingOrder.id);

      // Enqueue orders/update webhook
      if (closedOrder) {
        await enqueueWebhooks(context, 'orders/update', {
          id: closedOrder.id,
          admin_graphql_api_id: closedOrder.gid,
          updated_at: new Date(closedOrder.updated_at * 1000).toISOString(),
          closed_at: new Date(closedOrder.closed_at * 1000).toISOString(),
          name: closedOrder.name,
        });
      }

      return { order: closedOrder, userErrors: [] };
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

      const productId = context.stateManager.createProduct({
        gid: `gid://shopify/Product/temp-${Date.now()}`,
        title: input.title,
        description: input.description ?? null,
        vendor: input.vendor ?? null,
        product_type: input.productType ?? null,
      });
      const finalGid = createGID('Product', productId);
      context.stateManager.database
        .prepare('UPDATE products SET gid = ? WHERE id = ?')
        .run(finalGid, productId);

      const product = context.stateManager.getProduct(productId);

      // Enqueue webhooks via async queue
      if (product) {
        await enqueueWebhooks(context, 'products/create', {
          id: product.id,
          admin_graphql_api_id: product.gid,
          created_at: new Date(product.created_at * 1000).toISOString(),
          title: product.title,
        });
      }

      return { product, userErrors: [] };
    },

    productUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      await context.errorSimulator.throwIfConfigured('productUpdate');

      const { input } = args;
      const errors: UserError[] = [];

      // Parse GID to look up product by stored GID
      let productGid: string;
      try {
        const { id } = parseGID(input.id);
        productGid = createGID('Product', id);
      } catch (err) {
        errors.push({ field: ['id'], message: 'Invalid product ID format' });
        return { product: null, userErrors: errors };
      }

      // Check if product exists
      const existingProduct = context.stateManager.getProductByGid(productGid);
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

      context.stateManager.updateProduct(existingProduct.id, updateData);
      const updatedProduct = context.stateManager.getProduct(existingProduct.id);

      // Enqueue webhooks via async queue
      if (updatedProduct) {
        await enqueueWebhooks(context, 'products/update', {
          id: updatedProduct.id,
          admin_graphql_api_id: updatedProduct.gid,
          created_at: new Date(updatedProduct.created_at * 1000).toISOString(),
          updated_at: new Date(updatedProduct.updated_at * 1000).toISOString(),
          title: updatedProduct.title,
        });
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

      // Parse order GID to look up by stored GID
      let orderGid: string;
      try {
        const { id } = parseGID(input.orderId);
        orderGid = createGID('Order', id);
      } catch (err) {
        errors.push({ field: ['orderId'], message: 'Invalid order ID format' });
        return { fulfillment: null, userErrors: errors };
      }

      // Look up the parent order
      const parentOrder = context.stateManager.getOrderByGid(orderGid);
      if (!parentOrder) {
        errors.push({ field: ['orderId'], message: 'Order not found' });
        return { fulfillment: null, userErrors: errors };
      }

      // Validate the fulfillment transition
      const fulfillmentError = validateFulfillment({
        fulfillmentStatus: parentOrder.display_fulfillment_status ?? 'UNFULFILLED',
        closedAt: parentOrder.closed_at ?? null,
      });
      if (fulfillmentError) {
        return { fulfillment: null, userErrors: [{ field: ['orderId'], message: fulfillmentError }] };
      }

      const tempId = Date.now() + Math.floor(Math.random() * 100000);
      const fulfillmentId = context.stateManager.createFulfillment({
        gid: createGID('Fulfillment', tempId),
        order_gid: input.orderId,
        status: input.status ?? 'success',
        tracking_number: input.trackingNumber ?? null,
      });

      const fulfillment = context.stateManager.getFulfillment(fulfillmentId);

      // Update parent order's fulfillment status to FULFILLED
      context.stateManager.updateOrderFulfillmentStatus(parentOrder.id, 'FULFILLED');

      // Fetch the updated order for webhook payload
      const updatedOrder = context.stateManager.getOrder(parentOrder.id);

      // Enqueue fulfillments/create webhook
      if (fulfillment) {
        await enqueueWebhooks(context, 'fulfillments/create', {
          id: fulfillment.id,
          admin_graphql_api_id: fulfillment.gid,
          created_at: new Date(fulfillment.created_at * 1000).toISOString(),
          order_id: fulfillment.order_gid,
          status: fulfillment.status,
          tracking_number: fulfillment.tracking_number,
        });
      }

      // Enqueue orders/update webhook (status change triggers order update)
      if (updatedOrder) {
        await enqueueWebhooks(context, 'orders/update', {
          id: updatedOrder.id,
          admin_graphql_api_id: updatedOrder.gid,
          updated_at: new Date(updatedOrder.updated_at * 1000).toISOString(),
          name: updatedOrder.name,
          display_fulfillment_status: updatedOrder.display_fulfillment_status,
        });
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

      // Two-step GID pattern: insert with temp GID, get row ID, UPDATE to canonical GID
      const tempCustomerGid = `gid://shopify/Customer/temp-${Date.now()}`;
      const customerId = context.stateManager.createCustomer({
        gid: tempCustomerGid,
        email: input.email,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      });
      const canonicalCustomerGid = createGID('Customer', customerId);
      context.stateManager.database
        .prepare('UPDATE customers SET gid = ? WHERE id = ?')
        .run(canonicalCustomerGid, customerId);

      const customer = context.stateManager.getCustomer(customerId);

      // Enqueue webhooks via async queue
      if (customer) {
        await enqueueWebhooks(context, 'customers/create', {
          id: customer.id,
          admin_graphql_api_id: customer.gid,
          created_at: new Date(customer.created_at * 1000).toISOString(),
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
        });
      }

      return { customer, userErrors: [] };
    },

    inventoryItemUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
      requireAuth(context);
      await context.errorSimulator.throwIfConfigured('inventoryItemUpdate');

      const { input } = args;
      const errors: UserError[] = [];

      let itemGid: string;
      try {
        const { id } = parseGID(input.id);
        itemGid = createGID('InventoryItem', id);
      } catch (err) {
        errors.push({ field: ['id'], message: 'Invalid inventory item ID format' });
        return { inventoryItem: null, userErrors: errors };
      }

      const existing = context.stateManager.getInventoryItemByGid(itemGid);
      if (!existing) {
        errors.push({ field: ['id'], message: 'Inventory item not found' });
        return { inventoryItem: null, userErrors: errors };
      }

      context.stateManager.updateInventoryItem(existing.id, {
        sku: input.sku ?? existing.sku,
        tracked: input.tracked ?? (existing.tracked === 1 ? true : false),
        available: input.available ?? existing.available,
      });
      const updated = context.stateManager.getInventoryItem(existing.id);
      return { inventoryItem: updated, userErrors: [] };
    },

    appSubscriptionCreate: (_: unknown, args: any, context: Context) => {
      requireAuth(context);
      const id = context.stateManager.createAppSubscription({
        name: args.name,
        return_url: args.returnUrl,
        test: args.test ?? true,
        trial_days: args.trialDays ?? 0,
        shop_domain: context.shopDomain,
        line_items: args.lineItems,
      });
      const subscription = context.stateManager.getAppSubscription(id);
      const confirmationUrl = `https://dev.myshopify.com/admin/charges/${id}/confirm_recurring`;
      const storedItems: any[] = subscription.line_items
        ? JSON.parse(subscription.line_items)
        : [];
      const lineItems = storedItems.map((item: any, idx: number) => ({
        id: `gid://shopify/AppSubscriptionLineItem/${idx + 1}`,
        plan: {
          pricingDetails: item.plan?.appRecurringPricingDetails
            ? {
                interval: item.plan.appRecurringPricingDetails.interval,
                price: item.plan.appRecurringPricingDetails.price
                  ?? { amount: String(item.plan.appRecurringPricingDetails.amount ?? '0.00'), currencyCode: item.plan.appRecurringPricingDetails.currencyCode ?? 'USD' },
              }
            : { interval: 'EVERY_30_DAYS', price: { amount: '0.00', currencyCode: 'USD' } },
        },
      }));
      return {
        appSubscription: {
          id: subscription.gid,
          name: subscription.name,
          status: 'PENDING',
          test: subscription.test === 1,
          returnUrl: subscription.return_url ?? 'https://example.com',
          currentPeriodEnd: null,
          trialDays: subscription.trial_days ?? 0,
          lineItems,
          createdAt: new Date(subscription.created_at * 1000).toISOString(),
        },
        confirmationUrl,
        userErrors: [],
      };
    },

    appPurchaseOneTimeCreate: (_: unknown, args: any, context: Context) => {
      requireAuth(context);
      const rowId = context.stateManager.createOneTimePurchase({
        name: args.name,
        return_url: args.returnUrl,
        test: args.test ?? true,
        price_amount: args.price?.amount ?? '0.00',
        price_currency_code: args.price?.currencyCode ?? 'USD',
        shop_domain: context.shopDomain,
      });
      const numericId = rowId;
      const gid = `gid://shopify/AppPurchaseOneTime/${numericId}`;
      const confirmationUrl = `https://dev.myshopify.com/admin/charges/${numericId}/confirm`;
      return {
        appPurchaseOneTime: {
          id: gid,
          name: args.name ?? 'One Time Purchase',
          status: 'PENDING',
          test: args.test !== false,
          price: {
            amount: args.price?.amount ?? '0.00',
            currencyCode: args.price?.currencyCode ?? 'USD',
          },
          createdAt: new Date().toISOString(),
        },
        confirmationUrl,
        userErrors: [],
      };
    },

    appSubscriptionCancel: (_: unknown, args: { id: string }, context: Context) => {
      requireAuth(context);
      // Parse numeric ID from GID string: 'gid://shopify/AppSubscription/42' → 42
      const numericIdMatch = args.id.match(/\/(\d+)$/);
      if (!numericIdMatch) {
        return {
          appSubscription: null,
          userErrors: [{ field: ['id'], message: 'Invalid subscription ID' }],
        };
      }
      const numericId = parseInt(numericIdMatch[1], 10);
      const subscription = context.stateManager.getAppSubscription(numericId);
      if (!subscription) {
        return {
          appSubscription: null,
          userErrors: [{ field: ['id'], message: 'Subscription not found' }],
        };
      }
      if (subscription.shop_domain !== context.shopDomain) {
        return {
          appSubscription: null,
          userErrors: [{ field: ['id'], message: 'Subscription does not belong to this installation' }],
        };
      }
      if (subscription.status !== 'ACTIVE') {
        return {
          appSubscription: null,
          userErrors: [{
            field: ['id'],
            message: 'Only ACTIVE subscriptions can be cancelled',
          }],
        };
      }
      context.stateManager.updateAppSubscriptionStatus(numericId, 'CANCELLED');
      const updated = context.stateManager.getAppSubscription(numericId);
      const cancelledItems: any[] = updated.line_items
        ? JSON.parse(updated.line_items)
        : [];
      const cancelledLineItems = cancelledItems.map((item: any, idx: number) => ({
        id: `gid://shopify/AppSubscriptionLineItem/${idx + 1}`,
        plan: {
          pricingDetails: item.plan?.appRecurringPricingDetails
            ? {
                interval: item.plan.appRecurringPricingDetails.interval,
                price: item.plan.appRecurringPricingDetails.price
                  ?? { amount: String(item.plan.appRecurringPricingDetails.amount ?? '0.00'), currencyCode: item.plan.appRecurringPricingDetails.currencyCode ?? 'USD' },
              }
            : { interval: 'EVERY_30_DAYS', price: { amount: '0.00', currencyCode: 'USD' } },
        },
      }));
      return {
        appSubscription: {
          id: updated.gid,
          name: updated.name,
          status: 'CANCELLED',
          test: updated.test === 1,
          returnUrl: updated.return_url ?? 'https://example.com',
          currentPeriodEnd: null,
          trialDays: updated.trial_days ?? 0,
          lineItems: cancelledLineItems,
          createdAt: new Date(updated.created_at * 1000).toISOString(),
        },
        userErrors: [],
      };
    },

    webhookSubscriptionCreate: async (
      _parent: unknown,
      args: { topic: string; webhookSubscription: { callbackUrl: string } },
      context: Context
    ) => {
      requireAuth(context);

      // Map GraphQL enum (ORDERS_CREATE) to topic string (orders/create)
      const topicMap: Record<string, string> = {
        ORDERS_CREATE: 'orders/create', ORDERS_UPDATED: 'orders/update', ORDERS_DELETE: 'orders/delete',
        PRODUCTS_CREATE: 'products/create', PRODUCTS_UPDATE: 'products/update', PRODUCTS_DELETE: 'products/delete',
        CUSTOMERS_CREATE: 'customers/create', CUSTOMERS_UPDATE: 'customers/update', CUSTOMERS_DELETE: 'customers/delete',
        FULFILLMENTS_CREATE: 'fulfillments/create', FULFILLMENTS_UPDATE: 'fulfillments/update',
      };
      const rawTopic = args.topic;
      const topic = topicMap[rawTopic] ?? rawTopic;
      const { webhookSubscription } = args;
      const { callbackUrl } = webhookSubscription;

      if (!topic) {
        return {
          webhookSubscription: null,
          userErrors: [{ field: ['topic'], message: 'Topic is required' }],
        };
      }

      if (!callbackUrl) {
        return {
          webhookSubscription: null,
          userErrors: [{ field: ['webhookSubscription', 'callbackUrl'], message: 'Callback URL is required' }],
        };
      }

      context.stateManager.createWebhookSubscription(topic, callbackUrl);

      // Retrieve the subscription that was just created (most recently created with this topic+url)
      const subscriptions = context.stateManager.listWebhookSubscriptions();
      const created = subscriptions.find(
        (s: any) => s.topic === topic && s.callback_url === callbackUrl
      );

      const subId = created?.id ?? Date.now();

      return {
        webhookSubscription: {
          id: createGID('WebhookSubscription', subId),
          topic,
          callbackUrl,
        },
        userErrors: [],
      };
    },
  },

  // Abstract type resolvers for billing (required by makeExecutableSchema)
  AppPricingDetails: {
    __resolveType(obj: Record<string, unknown>): string {
      if ('price' in obj && 'interval' in obj) return 'AppRecurringPricing';
      if ('balanceUsed' in obj || 'cappedAmount' in obj) return 'AppUsagePricing';
      return 'AppRecurringPricing'; // default fallback
    },
  },

  AppSubscriptionDiscountValue: {
    __resolveType(obj: Record<string, unknown>): string {
      if ('percentage' in obj) return 'AppSubscriptionDiscountPercentage';
      return 'AppSubscriptionDiscountAmount';
    },
  },

  // Type resolvers
  Order: {
    id: (parent: any) => parent.gid,
    // name may be null from seed data — ShopifyClient maps null to "" safely
    name: (parent: any) => parent.name ?? `#${parent.id}`,
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    closedAt: (parent: any) => parent.closed_at ?? null,
    displayFulfillmentStatus: (parent: any) => parent.display_fulfillment_status ?? 'UNFULFILLED',
    displayFinancialStatus: (parent: any) => parent.display_financial_status ?? 'PENDING',
    // Extra fields expected by ShopifyClient.listOrders()
    email: (parent: any) => parent.email ?? null,
    status: (parent: any) => parent.status ?? null,
    tags: (parent: any) => {
      const tags = parent.tags;
      if (!tags) return [];
      if (Array.isArray(tags)) return tags;
      try { return JSON.parse(tags); } catch { return []; }
    },
    shippingAddress: (parent: any) => {
      const addr = parent.shipping_address;
      if (!addr) return null;
      try { return JSON.parse(addr); } catch { return null; }
    },
    lineItems: (parent: any) => {
      const items = JSON.parse(parent.line_items || '[]');
      const nodeList = items.map((item: any, index: number) => ({
        id: createGID('LineItem', `${parent.id}-${index}`),
        ...item,
        // Provide required fields for ShopifyClient
        originalUnitPriceSet: item.price ? { shopMoney: { amount: String(item.price), currencyCode: 'USD' } } : null,
        sku: item.sku ?? null,
      }));
      const edges = nodeList.map((node: any, index: number) => ({
        node,
        // LineItem cursors use a synthetic composite key since they're JSON-stored
        cursor: encodeCursor('LineItem', parent.id * 10000 + index),
      }));
      return {
        edges,
        nodes: nodeList,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        },
      };
    },
    totalPriceSet: (parent: any) => ({
      shopMoney: {
        amount: parent.total_price ?? '0',
        currencyCode: parent.currency_code ?? 'USD',
      },
    }),
    customer: async (parent: any, _args: unknown, context: Context) => {
      if (!parent.customer_gid) return null;
      const customer = context.stateManager.getCustomerByGid(parent.customer_gid);
      return customer ?? null;
    },
  },

  Product: {
    id: (parent: any) => parent.gid,
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    productType: (parent: any) => parent.product_type,
    status: (parent: any) => parent.status ?? 'ACTIVE',
    variants: (parent: any, args: { first?: number }, context: Context) => {
      const rows = context.stateManager.listVariantsByProductGid(parent.gid);
      let nodes = rows.map((v: any) => ({
        id: v.gid,
        title: v.title,
        sku: v.sku ?? null,
        price: v.price,
        inventoryQuantity: v.inventory_quantity ?? 0,
        inventoryItem: null,
      }));
      if (args.first != null) nodes = nodes.slice(0, args.first);
      return { nodes };
    },
  },

  Customer: {
    id: (parent: any) => parent.gid,
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    firstName: (parent: any) => parent.first_name,
    lastName: (parent: any) => parent.last_name,
    phone: (parent: any) => parent.phone ?? null,
    numberOfOrders: (parent: any) => parent.number_of_orders ?? 0,
    amountSpent: (parent: any) => parent.amount_spent != null
      ? { amount: String(parent.amount_spent) }
      : { amount: '0' },
    tags: (parent: any) => {
      const tags = parent.tags;
      if (!tags) return [];
      if (Array.isArray(tags)) return tags;
      try { return JSON.parse(tags); } catch { return []; }
    },
  },

  InventoryItem: {
    id: (parent: any) => parent.gid,
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at,
    // inventoryLevels returns an empty list — the twin does not simulate inventory levels.
    // ShopifyClient.getInventoryLevels() returns [] when nodes have no inventoryLevels.
    inventoryLevels: () => ({ nodes: [] }),
  },

  Fulfillment: {
    id: (parent: any) => parent.gid,
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
