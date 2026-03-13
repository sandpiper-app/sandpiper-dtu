/**
 * Reactions Web API routes for Slack twin
 *
 * POST /api/reactions.add    — store a reaction on a message
 * POST /api/reactions.get    — retrieve reactions grouped by emoji name
 * POST /api/reactions.list   — list all reactions by a user (stub: empty items)
 * POST /api/reactions.remove — remove a reaction (no-op, ok:true)
 *
 * State is backed by SlackStateManager.addReaction / listReactions which write
 * to the slack_reactions table. reactions.remove is a conformance no-op because
 * the state manager has no removeReaction method; callers simply receive ok:true.
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

const reactionsPlugin: FastifyPluginAsync = async (fastify) => {
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
    return { token, tokenRecord };
  }

  // POST /api/reactions.add
  fastify.post('/api/reactions.add', async (request, reply) => {
    const auth = authCheck(request, reply, 'reactions.add');
    if (!auth) return;
    const { channel, name, timestamp } = (request.body as any) ?? {};
    if (!channel || !name || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
    try {
      fastify.slackStateManager.addReaction(timestamp, channel, auth.tokenRecord.user_id ?? 'U_BOT_TWIN', name);
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.message?.includes('UNIQUE constraint failed')) {
        return reply.send({ ok: false, error: 'already_reacted' });
      }
      throw e;
    }
    return { ok: true };
  });

  // POST /api/reactions.get
  fastify.post('/api/reactions.get', async (request, reply) => {
    const auth = authCheck(request, reply, 'reactions.get');
    if (!auth) return;
    const { channel, timestamp } = (request.body as any) ?? {};
    if (!channel || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
    const rawReactions = fastify.slackStateManager.listReactions(timestamp);
    // Group by reaction name → { name, count, users }
    const reactionMap = new Map<string, { count: number; users: string[] }>();
    for (const r of rawReactions) {
      const entry = reactionMap.get(r.reaction) ?? { count: 0, users: [] };
      entry.count++;
      entry.users.push(r.user_id);
      reactionMap.set(r.reaction, entry);
    }
    const reactions = Array.from(reactionMap.entries()).map(([name, data]) => ({
      name, count: data.count, users: data.users,
    }));
    return { ok: true, type: 'message', channel, message: { reactions } };
  });

  // POST /api/reactions.list
  fastify.post('/api/reactions.list', async (request, reply) => {
    const auth = authCheck(request, reply, 'reactions.list');
    if (!auth) return;
    return { ok: true, items: [], response_metadata: { next_cursor: '' } };
  });

  // POST /api/reactions.remove
  fastify.post('/api/reactions.remove', async (request, reply) => {
    const auth = authCheck(request, reply, 'reactions.remove');
    if (!auth) return;
    const { channel, name, timestamp } = (request.body as any) ?? {};
    if (!channel || !name || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
    fastify.slackStateManager.removeReaction(timestamp, channel, auth.tokenRecord.user_id ?? 'U_BOT_TWIN', name);
    return { ok: true };
  });
};

export default reactionsPlugin;
export { reactionsPlugin };
