/**
 * Health check plugin for twin applications.
 *
 * Registers GET /health endpoint returning service status and uptime.
 * Does NOT use fastify-plugin — health check stays encapsulated.
 */

import type { FastifyPluginAsync } from 'fastify';

const healthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    request.log.info('health check');
    return {
      status: 'ok' as const,
      uptime: process.uptime(),
    };
  });
};

export default healthPlugin;
