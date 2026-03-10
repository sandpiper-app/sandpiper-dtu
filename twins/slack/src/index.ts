/**
 * Slack Twin - DTU implementation of Slack Web API & Events
 *
 * Demonstrates:
 * - OAuth v2 token exchange (xoxb-/xoxp- tokens)
 * - Web API methods (chat, conversations, users)
 * - Events API delivery
 * - Block Kit validation
 * - Admin test control endpoints
 */

import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { randomUUID } from 'node:crypto';
import { SqliteDeadLetterStore, WebhookQueue } from '@dtu/webhooks';
import { SlackStateManager } from './state/slack-state-manager.js';
import { SlackRateLimiter } from './services/rate-limiter.js';
import { EventDispatcher } from './services/event-dispatcher.js';
import { InteractionHandler } from './services/interaction-handler.js';
import healthPlugin from './plugins/health.js';
import oauthPlugin from './plugins/oauth.js';
import adminPlugin from './plugins/admin.js';
import { slackErrorsPlugin } from './plugins/errors.js';
import authPlugin from './plugins/web-api/auth.js';
import chatPlugin from './plugins/web-api/chat.js';
import conversationsPlugin from './plugins/web-api/conversations.js';
import usersPlugin from './plugins/web-api/users.js';
import filesPlugin from './plugins/web-api/files.js';
import reactionsPlugin from './plugins/web-api/reactions.js';
import pinsPlugin from './plugins/web-api/pins.js';
import viewsPlugin from './plugins/web-api/views.js';
import stubsPlugin from './plugins/web-api/stubs.js';
import eventsApiPlugin from './plugins/events-api.js';
import interactionsPlugin from './plugins/interactions.js';
import uiPlugin from './plugins/ui.js';

import type { DeadLetterStore } from '@dtu/webhooks';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    webhookQueue: WebhookQueue;
    deadLetterStore: DeadLetterStore;
    signingSecret: string;
    rateLimiter: SlackRateLimiter;
    eventDispatcher: EventDispatcher;
    interactionHandler: InteractionHandler;
  }
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
    ignoreTrailingSlash: true,
  });

  // Initialize Slack state manager
  const dbPath = process.env.DB_PATH ?? ':memory:';
  const slackStateManager = new SlackStateManager({ dbPath });
  slackStateManager.init();

  // Configure signing secret
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? 'dev-signing-secret';

  // Initialize dead letter store (shares SlackStateManager's DB connection)
  const deadLetterStore = new SqliteDeadLetterStore(slackStateManager.database);

  // Initialize webhook queue with configurable timing
  const webhookQueue = new WebhookQueue({
    timeScale: parseFloat(process.env.WEBHOOK_TIME_SCALE ?? '1.0'),
    deadLetterStore,
    syncMode: process.env.WEBHOOK_SYNC_MODE === 'true',
    logger: fastify.log as any,
  });

  // Initialize rate limiter
  const rateLimiter = new SlackRateLimiter();

  // Initialize event dispatcher
  const eventDispatcher = new EventDispatcher({
    webhookQueue,
    slackStateManager,
    signingSecret,
  });

  // Initialize interaction handler
  const interactionHandler = new InteractionHandler({
    slackStateManager,
    signingSecret,
  });

  // Decorate Fastify with services
  fastify.decorate('slackStateManager', slackStateManager);
  fastify.decorate('webhookQueue', webhookQueue);
  fastify.decorate('deadLetterStore', deadLetterStore);
  fastify.decorate('signingSecret', signingSecret);
  fastify.decorate('rateLimiter', rateLimiter);
  fastify.decorate('eventDispatcher', eventDispatcher);
  fastify.decorate('interactionHandler', interactionHandler);

  // Register formbody at root scope so ALL plugins can parse form-urlencoded bodies.
  // This is required for oauth.v2.access (which requires form-urlencoded per real Slack API)
  // and for Web API methods that accept form-urlencoded bodies.
  await fastify.register(formbody);

  // Register plugins
  await fastify.register(healthPlugin);
  await fastify.register(oauthPlugin);
  await fastify.register(adminPlugin);
  await fastify.register(slackErrorsPlugin);
  await fastify.register(authPlugin);
  await fastify.register(chatPlugin);
  await fastify.register(conversationsPlugin);
  await fastify.register(usersPlugin);
  await fastify.register(filesPlugin);
  await fastify.register(reactionsPlugin);
  await fastify.register(pinsPlugin);
  await fastify.register(viewsPlugin);
  await fastify.register(stubsPlugin);
  await fastify.register(eventsApiPlugin);
  await fastify.register(interactionsPlugin);
  await fastify.register(uiPlugin);

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    webhookQueue.shutdown();
    deadLetterStore.close();
    slackStateManager.close();
  });

  return fastify;
}

// Start server if run directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  const port = parseInt(process.env.PORT ?? '3001', 10);

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
