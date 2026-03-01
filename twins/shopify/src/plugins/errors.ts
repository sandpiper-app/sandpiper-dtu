/**
 * Error configuration endpoints
 *
 * Admin API for configuring error simulation per GraphQL operation
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ErrorSimulator } from '../services/error-simulator.js';

declare module 'fastify' {
  interface FastifyInstance {
    errorSimulator: ErrorSimulator;
    webhookSecret: string;
  }
}

export const errorsPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/errors/configure
  fastify.post<{
    Body: {
      operationName: string;
      statusCode: number;
      errorBody?: object;
      delayMs?: number;
    };
  }>('/admin/errors/configure', async (request) => {
    const { operationName, statusCode, errorBody, delayMs } = request.body;
    fastify.stateManager.createErrorConfig(operationName, {
      status_code: statusCode,
      error_body: errorBody,
      delay_ms: delayMs,
      enabled: true,
    });
    return { configured: true, operationName };
  });

  // POST /admin/errors/enable
  fastify.post('/admin/errors/enable', async () => {
    fastify.errorSimulator.enable();
    return { enabled: true };
  });

  // POST /admin/errors/disable
  fastify.post('/admin/errors/disable', async () => {
    fastify.errorSimulator.disable();
    return { enabled: false };
  });

  // GET /admin/errors
  // Lists all configured error configs for inspection.
  fastify.get('/admin/errors', async () => {
    const rows = fastify.stateManager.database
      .prepare('SELECT * FROM error_configs')
      .all();
    return { configs: rows };
  });

  // GET /admin/errors/:operation
  // Returns config for a specific operation, or { config: null } if not found.
  fastify.get<{ Params: { operation: string } }>('/admin/errors/:operation', async (request) => {
    const config = fastify.stateManager.getErrorConfig(request.params.operation);
    return { config: config ?? null };
  });
};
