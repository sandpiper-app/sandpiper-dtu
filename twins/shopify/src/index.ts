/**
 * Shopify Twin - DTU implementation of Shopify Admin API
 *
 * Demonstrates:
 * - OAuth token exchange
 * - GraphQL Admin API
 * - Webhook delivery
 * - Admin test control endpoints
 */

import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { StateManager } from '@dtu/state';
import healthPlugin from './plugins/health.js';
import oauthPlugin from './plugins/oauth.js';
import adminPlugin from './plugins/admin.js';
import { graphqlPlugin } from './plugins/graphql.js';
import { errorsPlugin } from './plugins/errors.js';
import { ErrorSimulator } from './services/error-simulator.js';

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
  const dbPath = process.env.DB_PATH ?? ':memory:';
  const stateManager = new StateManager({ dbPath });
  stateManager.init();

  // Initialize error simulator
  const errorSimulator = new ErrorSimulator(stateManager);

  // Configure webhook secret
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || 'dev-secret';

  // Decorate Fastify with stateManager, errorSimulator, and webhookSecret for plugin access
  fastify.decorate('stateManager', stateManager);
  fastify.decorate('errorSimulator', errorSimulator);
  fastify.decorate('webhookSecret', webhookSecret);

  // Register plugins
  await fastify.register(healthPlugin);
  await fastify.register(oauthPlugin);
  await fastify.register(adminPlugin);
  await fastify.register(errorsPlugin);
  await fastify.register(graphqlPlugin);

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
