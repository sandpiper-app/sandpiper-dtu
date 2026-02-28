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
import { readFileSync, existsSync } from 'node:fs';
import { StateManager } from '@dtu/state';
import { WebhookQueue, SqliteDeadLetterStore } from '@dtu/webhooks';
import healthPlugin from './plugins/health.js';
import oauthPlugin from './plugins/oauth.js';
import adminPlugin from './plugins/admin.js';
import { graphqlPlugin } from './plugins/graphql.js';
import { errorsPlugin } from './plugins/errors.js';
import { ErrorSimulator } from './services/error-simulator.js';
import { LeakyBucketRateLimiter } from './services/rate-limiter.js';

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

  // Initialize dead letter store (shares StateManager's DB connection)
  const deadLetterStore = new SqliteDeadLetterStore(stateManager.database);

  // Initialize webhook queue with configurable timing
  const webhookQueue = new WebhookQueue({
    timeScale: parseFloat(process.env.WEBHOOK_TIME_SCALE ?? '1.0'),
    deadLetterStore,
    syncMode: process.env.WEBHOOK_SYNC_MODE === 'true',
    logger: fastify.log as any,
  });

  // Load config-file webhook subscriptions if available
  const subsFile = process.env.WEBHOOK_SUBSCRIPTIONS_FILE;
  if (subsFile && existsSync(subsFile)) {
    try {
      const subsData = JSON.parse(readFileSync(subsFile, 'utf-8'));
      if (subsData.subscriptions && Array.isArray(subsData.subscriptions)) {
        for (const sub of subsData.subscriptions) {
          stateManager.createWebhookSubscription(sub.topic, sub.callback_url);
        }
        fastify.log.info({ count: subsData.subscriptions.length }, 'Loaded webhook subscriptions from config file');
      }
    } catch (err) {
      fastify.log.warn({ file: subsFile, error: err }, 'Failed to load webhook subscriptions file');
    }
  }

  // Initialize rate limiter (Shopify defaults: 1000 pts max, 50 pts/sec)
  const rateLimiter = new LeakyBucketRateLimiter(1000, 50);

  // Decorate Fastify with stateManager, errorSimulator, webhookSecret, queue, and rateLimiter
  fastify.decorate('stateManager', stateManager);
  fastify.decorate('errorSimulator', errorSimulator);
  fastify.decorate('webhookSecret', webhookSecret);
  fastify.decorate('webhookQueue', webhookQueue);
  fastify.decorate('deadLetterStore', deadLetterStore);
  fastify.decorate('rateLimiter', rateLimiter);

  // Register plugins
  await fastify.register(healthPlugin);
  await fastify.register(oauthPlugin);
  await fastify.register(adminPlugin);
  await fastify.register(errorsPlugin);
  await fastify.register(graphqlPlugin);

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    webhookQueue.shutdown();
    deadLetterStore.close();
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
