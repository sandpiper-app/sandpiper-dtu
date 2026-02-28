/**
 * Health check plugin for Slack twin
 */

import type { FastifyPluginAsync } from 'fastify';

const healthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      twin: 'slack',
      uptime: process.uptime(),
    };
  });
};

export default healthPlugin;
