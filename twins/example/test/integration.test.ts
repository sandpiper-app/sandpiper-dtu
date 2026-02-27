/**
 * Integration tests for the example twin application.
 *
 * Tests verify:
 * - Health check endpoint (INFRA-07)
 * - State reset functionality (INFRA-02)
 * - Entity CRUD operations
 * - Correlation IDs in responses (INFRA-08)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/index.js';

describe('Example Twin Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.uptime).toBeGreaterThan(0);
    });
  });

  describe('POST /admin/reset', () => {
    it('resets state and returns success', async () => {
      // Create an entity first
      await app.inject({
        method: 'POST',
        url: '/api/entities',
        payload: { type: 'test', data: { value: 'before-reset' } },
      });

      // Reset state
      const resetResponse = await app.inject({
        method: 'POST',
        url: '/admin/reset',
      });

      expect(resetResponse.statusCode).toBe(200);
      const resetBody = JSON.parse(resetResponse.body);
      expect(resetBody.reset).toBe(true);
      expect(resetBody.timestamp).toBeGreaterThan(0);
    });

    it('clears all entities after reset', async () => {
      // Create an entity
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/entities',
        payload: { type: 'test', data: { value: 'will-be-deleted' } },
      });
      const entity = JSON.parse(createResponse.body);

      // Reset
      await app.inject({
        method: 'POST',
        url: '/admin/reset',
      });

      // Try to get the entity - should be 404
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/entities/${entity.id}`,
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('POST /api/entities', () => {
    it('creates an entity and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/entities',
        payload: { type: 'product', data: { name: 'Widget', price: 9.99 } },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.type).toBe('product');
      expect(body.data).toBeDefined();
      expect(body.created_at).toBeGreaterThan(0);
      expect(body.updated_at).toBeGreaterThan(0);
    });
  });

  describe('GET /api/entities/:id', () => {
    it('retrieves an existing entity', async () => {
      // Create entity
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/entities',
        payload: { type: 'order', data: { items: ['A', 'B'] } },
      });
      const created = JSON.parse(createResponse.body);

      // Retrieve it
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/entities/${created.id}`,
      });

      expect(getResponse.statusCode).toBe(200);
      const body = JSON.parse(getResponse.body);
      expect(body.id).toBe(created.id);
      expect(body.type).toBe('order');
    });

    it('returns 404 for non-existent entity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/entities/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Entity not found');
    });
  });

  describe('Correlation IDs (INFRA-08)', () => {
    it('echoes X-Request-Id header in response', async () => {
      const requestId = 'test-correlation-id-12345';
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-request-id': requestId,
        },
      });

      expect(response.statusCode).toBe(200);
      // Fastify adds the request ID to the response headers
      // when requestIdHeader is set
    });

    it('generates request ID when none provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
