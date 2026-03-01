/**
 * UI plugin for Shopify twin
 * Serves web UI at /ui for inspecting and manipulating twin state.
 * Uses shared @dtu/ui partials for consistent styling.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { StateManager } from '@dtu/state';
import type { WebhookQueue } from '@dtu/webhooks';
import { registerUI, formatDate, formatJson } from '@dtu/ui';
import { createGID } from '../services/gid.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare module 'fastify' {
  interface FastifyInstance {
    stateManager: StateManager;
    webhookQueue: WebhookQueue;
    webhookSecret: string;
  }
}

const navItems = [
  { label: 'Orders', href: '/ui/orders' },
  { label: 'Products', href: '/ui/products' },
  { label: 'Customers', href: '/ui/customers' },
];

const adminItems = [
  { label: 'Admin', href: '/ui/admin' },
  { label: 'Webhooks', href: '/ui/admin/webhooks' },
];

function pageData(nav: string, pageTitle: string, extra: Record<string, any> = {}) {
  return {
    twin: 'shopify',
    twinName: 'Shopify',
    navItems,
    adminItems,
    nav,
    pageTitle,
    formatDate,
    formatJson,
    ...extra,
  };
}

function normalizePrice(value: string | undefined): string | undefined {
  if (!value) return value;
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  return n.toFixed(2);
}

function parseLineItems(lineItemsJson: string | null): Record<number, number> {
  if (!lineItemsJson) return {};
  try {
    const items = JSON.parse(lineItemsJson);
    const map: Record<number, number> = {};
    for (const item of items) {
      map[item.product_id] = item.quantity;
    }
    return map;
  } catch {
    return {};
  }
}

function extractLineItems(data: Record<string, string>, stateManager: StateManager): any[] | undefined {
  const lineItems: any[] = [];
  for (const key of Object.keys(data)) {
    if (key.startsWith('line_product_')) {
      const productId = parseInt(data[key]);
      const qtyKey = `line_qty_${productId}`;
      const quantity = parseInt(data[qtyKey]) || 1;
      const product = stateManager.getProduct(productId);
      lineItems.push({
        product_id: productId,
        title: product?.title || '',
        price: product?.price || '0.00',
        quantity,
      });
    }
  }
  return lineItems.length > 0 ? lineItems : undefined;
}

async function dispatchWebhooks(
  stateManager: StateManager,
  webhookQueue: WebhookQueue,
  webhookSecret: string,
  topic: string,
  payload: any
) {
  const subs = stateManager.listWebhookSubscriptions()
    .filter((s: any) => s.topic === topic);
  for (const sub of subs) {
    await webhookQueue.enqueue({
      id: randomUUID(),
      topic,
      callbackUrl: sub.callback_url,
      payload,
      secret: webhookSecret,
    });
  }
}

const uiPlugin: FastifyPluginAsync = async (fastify) => {
  await registerUI(fastify, {
    viewsDir: path.join(__dirname, '../views'),
    twin: 'shopify',
  });

  // Root redirect
  fastify.get('/ui', async (_req, reply) => {
    return reply.redirect('/ui/orders');
  });

  // ========================
  // ORDERS
  // ========================

  fastify.get('/ui/orders/new', async (_req, reply) => {
    return reply.viewAsync('orders/form.eta', pageData('orders', 'New Order', {
      formTitle: 'New Order',
      action: '/ui/orders',
      submitLabel: 'Create Order',
      cancelHref: '/ui/orders',
      fields: [
        { name: 'name', label: 'Order Name', type: 'text', placeholder: '#1001' },
        { name: 'total_price', label: 'Total Price', type: 'text', placeholder: '29.99' },
        { name: 'currency_code', label: 'Currency', type: 'text', placeholder: 'USD', value: 'USD' },
      ],
      products: fastify.stateManager.listProducts(),
    }));
  });

  fastify.get('/ui/orders', async (_req, reply) => {
    const orders = fastify.stateManager.listOrders();
    return reply.viewAsync('orders/list.eta', pageData('orders', 'Orders', {
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'total_price', label: 'Total' },
        { key: 'currency_code', label: 'Currency' },
        { key: 'display_financial_status', label: 'Financial' },
        { key: 'display_fulfillment_status', label: 'Fulfillment' },
      ],
      rows: orders,
      basePath: '/ui/orders',
      idKey: 'id',
      createHref: '/ui/orders/new',
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/orders/:id/edit', async (req, reply) => {
    const order = fastify.stateManager.getOrder(parseInt(req.params.id));
    if (!order) return reply.status(404).send('Order not found');
    return reply.viewAsync('orders/form.eta', pageData('orders', 'Edit Order', {
      formTitle: `Edit Order ${order.name || '#' + order.id}`,
      action: `/ui/orders/${order.id}`,
      submitLabel: 'Update Order',
      cancelHref: `/ui/orders/${order.id}`,
      fields: [
        { name: 'name', label: 'Order Name', type: 'text', value: order.name },
        { name: 'total_price', label: 'Total Price', type: 'text', value: order.total_price },
        { name: 'currency_code', label: 'Currency', type: 'text', value: order.currency_code },
      ],
      products: fastify.stateManager.listProducts(),
      selectedProducts: parseLineItems(order.line_items),
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/orders/:id', async (req, reply) => {
    const order = fastify.stateManager.getOrder(parseInt(req.params.id));
    if (!order) return reply.status(404).send('Order not found');
    return reply.viewAsync('orders/detail.eta', pageData('orders', 'Order Detail', {
      entityTitle: `Order ${order.name || '#' + order.id}`,
      editHref: `/ui/orders/${order.id}/edit`,
      deleteHref: `/ui/orders/${order.id}`,
      listHref: '/ui/orders',
      fields: [
        { label: 'ID', value: order.id },
        { label: 'GID', value: order.gid },
        { label: 'Name', value: order.name },
        { label: 'Total Price', value: order.total_price },
        { label: 'Currency', value: order.currency_code },
        { label: 'Financial Status', value: order.display_financial_status },
        { label: 'Fulfillment Status', value: order.display_fulfillment_status },
        { label: 'Created', value: formatDate(order.created_at) },
        { label: 'Updated', value: formatDate(order.updated_at) },
      ],
      rawJson: formatJson(order),
    }));
  });

  fastify.post('/ui/orders', async (req, reply) => {
    const data = req.body as Record<string, string>;
    const lineItems = extractLineItems(data, fastify.stateManager);
    let totalPrice = data.total_price;
    if (lineItems && lineItems.length > 0 && !totalPrice) {
      totalPrice = lineItems.reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.price) || 0) * item.quantity;
      }, 0).toFixed(2);
    }
    const gid = createGID('Order', Date.now() + Math.floor(Math.random() * 100000));
    const id = fastify.stateManager.createOrder({
      gid,
      name: data.name || `#${Date.now()}`,
      total_price: totalPrice || '0.00',
      currency_code: data.currency_code || 'USD',
      line_items: lineItems,
    });
    const order = fastify.stateManager.getOrder(id);
    await dispatchWebhooks(fastify.stateManager, fastify.webhookQueue, fastify.webhookSecret, 'orders/create', order);
    return reply.redirect('/ui/orders');
  });

  fastify.post<{ Params: { id: string } }>('/ui/orders/:id', async (req, reply) => {
    const id = parseInt(req.params.id);
    const data = req.body as Record<string, string>;
    const lineItems = extractLineItems(data, fastify.stateManager);
    let totalPrice = data.total_price;
    if (lineItems && lineItems.length > 0 && !totalPrice) {
      totalPrice = lineItems.reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.price) || 0) * item.quantity;
      }, 0).toFixed(2);
    }
    fastify.stateManager.updateOrder(id, {
      name: data.name,
      total_price: totalPrice,
      currency_code: data.currency_code,
      line_items: lineItems,
    });
    const order = fastify.stateManager.getOrder(id);
    await dispatchWebhooks(fastify.stateManager, fastify.webhookQueue, fastify.webhookSecret, 'orders/update', order);
    return reply.redirect(`/ui/orders/${id}`);
  });

  fastify.delete<{ Params: { id: string } }>('/ui/orders/:id', async (req, reply) => {
    fastify.stateManager.database.prepare('DELETE FROM orders WHERE id = ?').run(parseInt(req.params.id));
    return reply.send('');
  });

  // ========================
  // PRODUCTS
  // ========================

  fastify.get('/ui/products/new', async (_req, reply) => {
    return reply.viewAsync('products/form.eta', pageData('products', 'New Product', {
      formTitle: 'New Product',
      action: '/ui/products',
      submitLabel: 'Create Product',
      cancelHref: '/ui/products',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'vendor', label: 'Vendor', type: 'text' },
        { name: 'product_type', label: 'Product Type', type: 'text' },
        { name: 'price', label: 'Price', type: 'text', placeholder: '29.99' },
      ],
    }));
  });

  fastify.get('/ui/products', async (_req, reply) => {
    const products = fastify.stateManager.listProducts();
    return reply.viewAsync('products/list.eta', pageData('products', 'Products', {
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'product_type', label: 'Type' },
        { key: 'price', label: 'Price' },
      ],
      rows: products,
      basePath: '/ui/products',
      idKey: 'id',
      createHref: '/ui/products/new',
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/products/:id/edit', async (req, reply) => {
    const product = fastify.stateManager.getProduct(parseInt(req.params.id));
    if (!product) return reply.status(404).send('Product not found');
    return reply.viewAsync('products/form.eta', pageData('products', 'Edit Product', {
      formTitle: `Edit ${product.title || 'Product'}`,
      action: `/ui/products/${product.id}`,
      submitLabel: 'Update Product',
      cancelHref: `/ui/products/${product.id}`,
      fields: [
        { name: 'title', label: 'Title', type: 'text', value: product.title, required: true },
        { name: 'description', label: 'Description', type: 'textarea', value: product.description },
        { name: 'vendor', label: 'Vendor', type: 'text', value: product.vendor },
        { name: 'product_type', label: 'Product Type', type: 'text', value: product.product_type },
        { name: 'price', label: 'Price', type: 'text', value: product.price },
      ],
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/products/:id', async (req, reply) => {
    const product = fastify.stateManager.getProduct(parseInt(req.params.id));
    if (!product) return reply.status(404).send('Product not found');
    return reply.viewAsync('products/detail.eta', pageData('products', 'Product Detail', {
      entityTitle: product.title || `Product #${product.id}`,
      editHref: `/ui/products/${product.id}/edit`,
      deleteHref: `/ui/products/${product.id}`,
      listHref: '/ui/products',
      fields: [
        { label: 'ID', value: product.id },
        { label: 'GID', value: product.gid },
        { label: 'Title', value: product.title },
        { label: 'Description', value: product.description },
        { label: 'Vendor', value: product.vendor },
        { label: 'Product Type', value: product.product_type },
        { label: 'Price', value: product.price },
        { label: 'Created', value: formatDate(product.created_at) },
        { label: 'Updated', value: formatDate(product.updated_at) },
      ],
      rawJson: formatJson(product),
    }));
  });

  fastify.post('/ui/products', async (req, reply) => {
    const data = req.body as Record<string, string>;
    const gid = createGID('Product', Date.now() + Math.floor(Math.random() * 100000));
    const id = fastify.stateManager.createProduct({
      gid,
      title: data.title,
      description: data.description,
      vendor: data.vendor,
      product_type: data.product_type,
      price: normalizePrice(data.price),
    });
    const product = fastify.stateManager.getProduct(id);
    await dispatchWebhooks(fastify.stateManager, fastify.webhookQueue, fastify.webhookSecret, 'products/create', product);
    return reply.redirect('/ui/products');
  });

  fastify.post<{ Params: { id: string } }>('/ui/products/:id', async (req, reply) => {
    const id = parseInt(req.params.id);
    const data = req.body as Record<string, string>;
    fastify.stateManager.updateProduct(id, {
      title: data.title,
      description: data.description,
      vendor: data.vendor,
      product_type: data.product_type,
      price: normalizePrice(data.price),
    });
    const product = fastify.stateManager.getProduct(id);
    await dispatchWebhooks(fastify.stateManager, fastify.webhookQueue, fastify.webhookSecret, 'products/update', product);
    return reply.redirect(`/ui/products/${id}`);
  });

  fastify.delete<{ Params: { id: string } }>('/ui/products/:id', async (req, reply) => {
    fastify.stateManager.database.prepare('DELETE FROM products WHERE id = ?').run(parseInt(req.params.id));
    return reply.send('');
  });

  // ========================
  // CUSTOMERS
  // ========================

  fastify.get('/ui/customers/new', async (_req, reply) => {
    return reply.viewAsync('customers/form.eta', pageData('customers', 'New Customer', {
      formTitle: 'New Customer',
      action: '/ui/customers',
      submitLabel: 'Create Customer',
      cancelHref: '/ui/customers',
      fields: [
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'first_name', label: 'First Name', type: 'text' },
        { name: 'last_name', label: 'Last Name', type: 'text' },
      ],
    }));
  });

  fastify.get('/ui/customers', async (_req, reply) => {
    const customers = fastify.stateManager.listCustomers();
    return reply.viewAsync('customers/list.eta', pageData('customers', 'Customers', {
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'email', label: 'Email' },
        { key: 'first_name', label: 'First Name' },
        { key: 'last_name', label: 'Last Name' },
      ],
      rows: customers,
      basePath: '/ui/customers',
      idKey: 'id',
      createHref: '/ui/customers/new',
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/customers/:id/edit', async (req, reply) => {
    const customer = fastify.stateManager.getCustomer(parseInt(req.params.id));
    if (!customer) return reply.status(404).send('Customer not found');
    return reply.viewAsync('customers/form.eta', pageData('customers', 'Edit Customer', {
      formTitle: `Edit ${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Customer',
      action: `/ui/customers/${customer.id}`,
      submitLabel: 'Update Customer',
      cancelHref: `/ui/customers/${customer.id}`,
      fields: [
        { name: 'email', label: 'Email', type: 'email', value: customer.email },
        { name: 'first_name', label: 'First Name', type: 'text', value: customer.first_name },
        { name: 'last_name', label: 'Last Name', type: 'text', value: customer.last_name },
      ],
    }));
  });

  fastify.get<{ Params: { id: string } }>('/ui/customers/:id', async (req, reply) => {
    const customer = fastify.stateManager.getCustomer(parseInt(req.params.id));
    if (!customer) return reply.status(404).send('Customer not found');
    return reply.viewAsync('customers/detail.eta', pageData('customers', 'Customer Detail', {
      entityTitle: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || `Customer #${customer.id}`,
      editHref: `/ui/customers/${customer.id}/edit`,
      deleteHref: `/ui/customers/${customer.id}`,
      listHref: '/ui/customers',
      fields: [
        { label: 'ID', value: customer.id },
        { label: 'GID', value: customer.gid },
        { label: 'Email', value: customer.email },
        { label: 'First Name', value: customer.first_name },
        { label: 'Last Name', value: customer.last_name },
        { label: 'Created', value: formatDate(customer.created_at) },
        { label: 'Updated', value: formatDate(customer.updated_at) },
      ],
      rawJson: formatJson(customer),
    }));
  });

  fastify.post('/ui/customers', async (req, reply) => {
    const data = req.body as Record<string, string>;
    const gid = createGID('Customer', Date.now() + Math.floor(Math.random() * 100000));
    fastify.stateManager.createCustomer({
      gid,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
    });
    return reply.redirect('/ui/customers');
  });

  fastify.post<{ Params: { id: string } }>('/ui/customers/:id', async (req, reply) => {
    const id = parseInt(req.params.id);
    const data = req.body as Record<string, string>;
    fastify.stateManager.database.prepare(
      'UPDATE customers SET email = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?'
    ).run(data.email, data.first_name, data.last_name, Math.floor(Date.now() / 1000), id);
    return reply.redirect(`/ui/customers/${id}`);
  });

  fastify.delete<{ Params: { id: string } }>('/ui/customers/:id', async (req, reply) => {
    fastify.stateManager.database.prepare('DELETE FROM customers WHERE id = ?').run(parseInt(req.params.id));
    return reply.send('');
  });

  // ========================
  // ADMIN
  // ========================

  fastify.get('/ui/admin', async (_req, reply) => {
    const tokenCount = fastify.stateManager.database
      .prepare('SELECT COUNT(*) as count FROM tokens')
      .get() as { count: number };

    return reply.viewAsync('admin/index.eta', pageData('admin', 'Admin', {
      stats: {
        orders: fastify.stateManager.listOrders().length,
        products: fastify.stateManager.listProducts().length,
        customers: fastify.stateManager.listCustomers().length,
        tokens: tokenCount.count,
        webhooks: fastify.stateManager.listWebhookSubscriptions().length,
      },
    }));
  });

  fastify.post('/ui/admin/reset', async (_req, reply) => {
    fastify.stateManager.reset();
    (fastify as any).rateLimiter?.reset?.();
    return reply.redirect('/ui/admin');
  });

  fastify.get('/ui/admin/webhooks', async (_req, reply) => {
    const subs = fastify.stateManager.listWebhookSubscriptions();
    return reply.viewAsync('admin/webhooks.eta', pageData('admin', 'Webhooks', {
      subscriptions: subs,
    }));
  });

  fastify.post('/ui/admin/webhooks', async (req, reply) => {
    const data = req.body as Record<string, string>;
    if (data.topic && data.callback_url) {
      fastify.stateManager.createWebhookSubscription(data.topic, data.callback_url);
    }
    return reply.redirect('/ui/admin/webhooks');
  });

  fastify.post('/ui/admin/fixtures', async (_req, reply) => {
    const gidSuffix = () => Date.now() + Math.floor(Math.random() * 100000);

    // Sample products
    fastify.stateManager.createProduct({
      gid: createGID('Product', gidSuffix()),
      title: 'Sample T-Shirt',
      description: 'A comfortable cotton t-shirt',
      vendor: 'Sample Vendor',
      product_type: 'Apparel',
      price: '29.99',
    });
    fastify.stateManager.createProduct({
      gid: createGID('Product', gidSuffix()),
      title: 'Sample Mug',
      description: 'A ceramic coffee mug',
      vendor: 'Sample Vendor',
      product_type: 'Accessories',
      price: '12.99',
    });

    // Sample customers
    fastify.stateManager.createCustomer({
      gid: createGID('Customer', gidSuffix()),
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
    });
    fastify.stateManager.createCustomer({
      gid: createGID('Customer', gidSuffix()),
      email: 'bob@example.com',
      first_name: 'Bob',
      last_name: 'Jones',
    });

    // Sample orders
    fastify.stateManager.createOrder({
      gid: createGID('Order', gidSuffix()),
      name: '#1001',
      total_price: '29.99',
      currency_code: 'USD',
    });
    fastify.stateManager.createOrder({
      gid: createGID('Order', gidSuffix()),
      name: '#1002',
      total_price: '42.98',
      currency_code: 'USD',
    });

    return reply.redirect('/ui/admin');
  });
};

export default uiPlugin;
