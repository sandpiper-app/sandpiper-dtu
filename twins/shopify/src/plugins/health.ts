/**
 * Health check plugin for Shopify twin
 */

import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@dtu/types';

const healthPlugin: FastifyPluginAsync = async (fastify) => {
  const startTime = Date.now();

  fastify.get<{ Reply: HealthResponse }>('/health', async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    return {
      status: 'ok',
      uptime,
    };
  });
};

export default healthPlugin;
