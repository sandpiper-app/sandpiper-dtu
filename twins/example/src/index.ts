/**
 * Example Twin - DTU reference implementation
 *
 * Demonstrates the twin application pattern with:
 * - Fastify server with structured JSON logging (Pino)
 * - Correlation IDs via X-Request-Id header
 * - StateManager for SQLite-backed state
 * - Health check and admin reset endpoints
 * - Entity CRUD endpoints
 */

import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { StateManager } from '@dtu/state';
import healthPlugin from './plugins/health.js';
import adminPlugin from './plugins/admin.js';

export interface CreateEntityBody {
  type: string;
  data: unknown;
}

/**
 * Build the Fastify application instance.
 * Exported for testing via app.inject() without starting the server.
 */
export async function buildApp(options: { logger?: boolean | object } = {}) {
  const fastify = Fastify({
    logger: options.logger ?? {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  // Initialize state manager
  const stateManager = new StateManager();
  stateManager.init();

  // Decorate Fastify with stateManager for plugin access
  fastify.decorate('stateManager', stateManager);

  // Register plugins
  await fastify.register(healthPlugin);
  await fastify.register(adminPlugin);

  // Entity CRUD routes
  fastify.get<{ Params: { id: string } }>('/api/entities/:id', async (request, reply) => {
    const { id } = request.params;
    request.log.info({ entityId: id }, 'get entity');
    const entity = stateManager.getEntity(id);
    if (!entity) {
      return reply.status(404).send({ error: 'Entity not found', id });
    }
    return entity;
  });

  fastify.post<{ Body: CreateEntityBody }>('/api/entities', async (request, reply) => {
    const { type, data } = request.body;
    request.log.info({ entityType: type }, 'create entity');
    const entity = stateManager.createEntity(type, data);
    return reply.status(201).send(entity);
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    stateManager.close();
  });

  return fastify;
}

// Start server if run directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  const port = parseInt(process.env.PORT ?? '3000', 10);

  const app = await buildApp();

  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown handlers
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
