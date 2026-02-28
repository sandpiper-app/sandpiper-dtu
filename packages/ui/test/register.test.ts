/**
 * Integration test for @dtu/ui registerUI function.
 * Validates that Fastify correctly wires up view engine, static files, and form parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerUI } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureViewsDir = path.join(__dirname, 'fixtures', 'views');

describe('@dtu/ui registerUI', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    await registerUI(app, {
      viewsDir: fixtureViewsDir,
      twin: 'test',
    });

    // Register a test route that uses the view engine
    app.get('/ui/test', async (_req, reply) => {
      return reply.viewAsync('test.eta', {
        twin: 'test',
        twinName: 'Test',
        pageTitle: 'Test Page',
        navItems: [],
        adminItems: [],
      });
    });

    // Register a test route that uses layout partial
    app.get('/ui/layout-test', async (_req, reply) => {
      return reply.viewAsync('test.eta', {
        twin: 'test',
        twinName: 'Test',
        pageTitle: 'Layout Test',
        navItems: [{ label: 'Items', href: '/ui/items' }],
        adminItems: [{ label: 'Admin', href: '/ui/admin' }],
      });
    });

    // Register a form POST route to test formbody
    app.post('/ui/form-test', async (req) => {
      return { received: req.body };
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('renders a template via reply.viewAsync', async () => {
    const res = await app.inject({ method: 'GET', url: '/ui/test' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Hello from test template');
    expect(res.body).toContain('Twin: test');
  });

  it('serves static CSS at /ui/static/styles.css', async () => {
    const res = await app.inject({ method: 'GET', url: '/ui/static/styles.css' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
    expect(res.body).toContain('--twin-accent');
    expect(res.body).toContain('[data-twin="shopify"]');
    expect(res.body).toContain('[data-twin="slack"]');
  });

  it('parses URL-encoded form body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ui/form-test',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'name=Test+Order&total_price=29.99',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.received).toEqual({
      name: 'Test Order',
      total_price: '29.99',
    });
  });
});
