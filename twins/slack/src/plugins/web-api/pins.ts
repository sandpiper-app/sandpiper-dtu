/**
 * Pins Web API routes for Slack twin
 *
 * POST /api/pins.add    — pin a message (stateless, returns ok:true)
 * POST /api/pins.list   — list pinned items (stateless, returns empty list)
 * GET  /api/pins.list   — same as POST (SDK uses POST; GET registered for parity)
 * POST /api/pins.remove — unpin a message (stateless, returns ok:true)
 *
 * No persistent pin state is maintained — these are conformance stubs that
 * confirm the Slack twin accepts pins method calls with correct response shapes.
 */

import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../../services/rate-limiter.js';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    rateLimiter: SlackRateLimiter;
  }
}

const pinsPlugin: FastifyPluginAsync = async (fastify) => {
  // Shared auth + rate-limit + error-sim preamble
  function authCheck(request: any, reply: any, method: string) {
    const token = extractToken(request);
    if (!token) { reply.send({ ok: false, error: 'not_authed' }); return null; }
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) { reply.send({ ok: false, error: 'invalid_auth' }); return null; }
    const limited = fastify.rateLimiter.check(method, token);
    if (limited) {
      reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' });
      return null;
    }
    const errorConfig = fastify.slackStateManager.getErrorConfig(method);
    if (errorConfig) {
      const body = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      reply.status(errorConfig.status_code ?? 200).send(body);
      return null;
    }
    return tokenRecord;
  }

  // POST /api/pins.add
  fastify.post('/api/pins.add', async (request, reply) => {
    if (!authCheck(request, reply, 'pins.add')) return;
    return { ok: true };
  });

  // POST /api/pins.list
  fastify.post('/api/pins.list', async (request, reply) => {
    if (!authCheck(request, reply, 'pins.list')) return;
    return { ok: true, items: [], response_metadata: { next_cursor: '' } };
  });

  // GET /api/pins.list — SDK always uses POST, but register GET for parity
  fastify.get('/api/pins.list', async (request, reply) => {
    if (!authCheck(request, reply, 'pins.list')) return;
    return { ok: true, items: [], response_metadata: { next_cursor: '' } };
  });

  // POST /api/pins.remove
  fastify.post('/api/pins.remove', async (request, reply) => {
    if (!authCheck(request, reply, 'pins.remove')) return;
    return { ok: true };
  });
};

export default pinsPlugin;
export { pinsPlugin };
