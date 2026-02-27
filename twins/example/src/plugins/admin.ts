/**
 * Admin plugin for twin applications.
 *
 * Registers POST /admin/reset endpoint for state management.
 * Does NOT use fastify-plugin — admin routes stay encapsulated.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { StateManager } from '@dtu/state';

const adminPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post('/admin/reset', async (request, reply) => {
    const stateManager = (fastify as any).stateManager as StateManager;
    request.log.info('state reset requested');
    stateManager.reset();
    request.log.info('state reset complete');
    return {
      reset: true,
      timestamp: Date.now(),
    };
  });
};

export default adminPlugin;
