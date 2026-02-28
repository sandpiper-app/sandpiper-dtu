/**
 * UI integration tests for Shopify twin.
 * Validates list/detail/form/delete routes and admin pages.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Shopify Twin UI', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Orders', () => {
    it('GET /ui/orders returns 200 with orders list page', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/orders' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Orders');
      expect(res.body).toContain('data-twin="shopify"');
    });

    it('POST /ui/orders creates order and redirects', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/orders',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=%231001&total_price=29.99&currency_code=USD',
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/orders');

      // Verify order was created in state
      const orders = app.stateManager.listOrders();
      expect(orders.length).toBeGreaterThan(0);
      const order = orders.find((o: any) => o.name === '#1001');
      expect(order).toBeDefined();
      expect(order.total_price).toBe('29.99');
    });

    it('GET /ui/orders/:id shows order detail with Raw JSON', async () => {
      // Create an order first
      const gid = `gid://shopify/Order/${Date.now()}`;
      const id = app.stateManager.createOrder({ gid, name: '#TEST', total_price: '10.00', currency_code: 'USD' });

      const res = await app.inject({ method: 'GET', url: `/ui/orders/${id}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('#TEST');
      expect(res.body).toContain('Raw JSON');
      expect(res.body).toContain('10.00');
    });

    it('POST /ui/orders/:id updates order', async () => {
      const gid = `gid://shopify/Order/${Date.now()}`;
      const id = app.stateManager.createOrder({ gid, name: '#OLD', total_price: '5.00', currency_code: 'USD' });

      const res = await app.inject({
        method: 'POST',
        url: `/ui/orders/${id}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=%23NEW&total_price=15.00&currency_code=EUR',
      });
      expect(res.statusCode).toBe(302);

      const updated = app.stateManager.getOrder(id);
      expect(updated.name).toBe('#NEW');
      expect(updated.total_price).toBe('15.00');
    });

    it('DELETE /ui/orders/:id removes order', async () => {
      const gid = `gid://shopify/Order/${Date.now()}`;
      const id = app.stateManager.createOrder({ gid, name: '#DEL', total_price: '1.00', currency_code: 'USD' });

      const res = await app.inject({ method: 'DELETE', url: `/ui/orders/${id}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('');

      const deleted = app.stateManager.getOrder(id);
      expect(deleted).toBeUndefined();
    });

    it('GET /ui/orders/new shows create form', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/orders/new' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('New Order');
      expect(res.body).toContain('form');
    });
  });

  describe('Products', () => {
    it('GET /ui/products returns 200 with products list', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/products' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Products');
    });

    it('POST /ui/products creates product', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/products',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'title=Test+Widget&vendor=TestCo&product_type=Widget',
      });
      expect(res.statusCode).toBe(302);

      const products = app.stateManager.listProducts();
      const product = products.find((p: any) => p.title === 'Test Widget');
      expect(product).toBeDefined();
      expect(product.vendor).toBe('TestCo');
    });

    it('GET /ui/products/:id shows product detail', async () => {
      const gid = `gid://shopify/Product/${Date.now()}`;
      const id = app.stateManager.createProduct({ gid, title: 'Widget', vendor: 'ACME' });

      const res = await app.inject({ method: 'GET', url: `/ui/products/${id}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Widget');
      expect(res.body).toContain('Raw JSON');
    });
  });

  describe('Customers', () => {
    it('GET /ui/customers returns 200 with customers list', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/customers' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Customers');
    });

    it('POST /ui/customers creates customer', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ui/customers',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'email=test%40example.com&first_name=Jane&last_name=Doe',
      });
      expect(res.statusCode).toBe(302);

      const customers = app.stateManager.listCustomers();
      const customer = customers.find((c: any) => c.email === 'test@example.com');
      expect(customer).toBeDefined();
      expect(customer.first_name).toBe('Jane');
    });

    it('DELETE /ui/customers/:id removes customer', async () => {
      const gid = `gid://shopify/Customer/${Date.now()}`;
      const id = app.stateManager.createCustomer({ gid, email: 'del@test.com', first_name: 'Del', last_name: 'Ete' });

      const res = await app.inject({ method: 'DELETE', url: `/ui/customers/${id}` });
      expect(res.statusCode).toBe(200);

      const deleted = app.stateManager.getCustomer(id);
      expect(deleted).toBeUndefined();
    });
  });

  describe('Admin', () => {
    it('GET /ui/admin shows state counts', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/admin' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Admin Dashboard');
      expect(res.body).toContain('Orders');
      expect(res.body).toContain('Products');
    });

    it('POST /ui/admin/reset resets state and redirects', async () => {
      // Create some state
      app.stateManager.createOrder({ gid: `gid://shopify/Order/${Date.now()}`, name: '#1' });

      const res = await app.inject({ method: 'POST', url: '/ui/admin/reset' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/admin');

      // State should be reset
      const orders = app.stateManager.listOrders();
      expect(orders.length).toBe(0);
    });

    it('GET /ui/admin/webhooks shows webhook subscriptions', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/admin/webhooks' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Webhook Subscriptions');
    });
  });

  describe('Static Assets', () => {
    it('GET /ui/static/styles.css returns CSS with twin accent colors', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui/static/styles.css' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/css');
      expect(res.body).toContain('--twin-accent');
    });
  });

  describe('Navigation', () => {
    it('GET /ui redirects to /ui/orders', async () => {
      const res = await app.inject({ method: 'GET', url: '/ui' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/ui/orders');
    });
  });
});
