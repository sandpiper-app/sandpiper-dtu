/**
 * Error configuration endpoints for Slack twin
 *
 * Admin API for configuring error simulation per Web API method.
 * Unlike Shopify's ErrorSimulator (global toggle + GraphQL exception throwing),
 * Slack uses per-method inline error checking (HTTP 200 + {ok: false}).
 * The DB schema and state manager methods already exist — this plugin
 * only exposes the admin API surface to configure them.
 */

import type { FastifyPluginAsync } from 'fastify';

export const slackErrorsPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/errors/configure
  // Creates or replaces an error config for a specific Web API method.
  // Once configured, the method's route handler will short-circuit with the error response.
  fastify.post<{
    Body: {
      methodName: string;
      statusCode?: number;
      errorBody?: object;
      delayMs?: number;
    };
  }>('/admin/errors/configure', async (request) => {
    const { methodName, statusCode, errorBody, delayMs } = request.body;
    fastify.slackStateManager.createErrorConfig(methodName, {
      status_code: statusCode,
      error_body: errorBody,
      delay_ms: delayMs,
      enabled: true,
    });
    return { configured: true, methodName };
  });

  // GET /admin/errors
  // Lists all configured error configs for inspection.
  fastify.get('/admin/errors', async () => {
    const rows = fastify.slackStateManager.database
      .prepare('SELECT * FROM slack_error_configs')
      .all();
    return { configs: rows };
  });

  // POST /admin/errors/clear
  // Removes all error configs. Methods resume normal behavior.
  fastify.post('/admin/errors/clear', async () => {
    fastify.slackStateManager.clearErrorConfigs();
    return { cleared: true };
  });
};
