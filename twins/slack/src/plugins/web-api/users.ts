/**
 * Users Web API routes for Slack twin
 *
 * POST /api/users.list — list workspace users
 * POST /api/users.info — get user details
 */

import type { FastifyPluginAsync } from 'fastify';
import { extractBearerToken } from '../../services/token-validator.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../../services/rate-limiter.js';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    rateLimiter: SlackRateLimiter;
  }
}

/** Format a user row into Slack API response format */
function formatMember(user: any): any {
  return {
    id: user.id,
    team_id: user.team_id,
    name: user.name,
    real_name: user.real_name ?? '',
    profile: {
      display_name: user.display_name ?? '',
      email: user.email ?? undefined,
    },
    is_admin: !!user.is_admin,
    is_bot: !!user.is_bot,
    deleted: !!user.deleted,
    color: user.color ?? '000000',
    tz: user.tz ?? 'America/Los_Angeles',
  };
}

const usersPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/users.list
  fastify.post<{
    Body: { limit?: number; cursor?: string };
  }>('/api/users.list', async (request, reply) => {
    // Auth check
    const token = extractBearerToken(request);
    if (!token) {
      return reply.status(200).send({ ok: false, error: 'not_authed' });
    }
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) {
      return reply.status(200).send({ ok: false, error: 'invalid_auth' });
    }

    // Rate limit check
    const limited = fastify.rateLimiter.check('users.list', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // Error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('users.list');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    const limit = (request.body as any)?.limit ?? 100;
    const cursor = (request.body as any)?.cursor;

    const allUsers = fastify.slackStateManager.listUsers();

    // Cursor-based pagination
    let startIdx = 0;
    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
      const idx = allUsers.findIndex((u: any) => u.id === decodedCursor);
      if (idx >= 0) startIdx = idx + 1;
    }

    const page = allUsers.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < allUsers.length;
    const nextCursor = hasMore
      ? Buffer.from(page[page.length - 1].id).toString('base64')
      : '';

    return {
      ok: true,
      members: page.map(formatMember),
      response_metadata: { next_cursor: nextCursor },
    };
  });

  // POST /api/users.info
  fastify.post<{
    Body: { user: string };
  }>('/api/users.info', async (request, reply) => {
    // Auth check
    const token = extractBearerToken(request);
    if (!token) {
      return reply.status(200).send({ ok: false, error: 'not_authed' });
    }
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) {
      return reply.status(200).send({ ok: false, error: 'invalid_auth' });
    }

    // Rate limit check
    const limited = fastify.rateLimiter.check('users.info', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // Error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('users.info');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    const userId = (request.body as any)?.user;
    if (!userId) {
      return reply.status(200).send({ ok: false, error: 'user_not_found' });
    }

    const user = fastify.slackStateManager.getUser(userId);
    if (!user) {
      return reply.status(200).send({ ok: false, error: 'user_not_found' });
    }

    return {
      ok: true,
      user: formatMember(user),
    };
  });
};

export default usersPlugin;
export { usersPlugin };
