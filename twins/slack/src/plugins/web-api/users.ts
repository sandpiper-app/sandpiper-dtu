/**
 * Users Web API routes for Slack twin
 *
 * GET  /api/users.list — list workspace users (query params)
 * POST /api/users.list — list workspace users (JSON or form-urlencoded body)
 * GET  /api/users.info — get user details (query params)
 * POST /api/users.info — get user details (JSON or form-urlencoded body)
 *
 * Real Slack Web API accepts GET with query params for read methods in addition to POST.
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
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

/**
 * Extract API parameters from GET query string or POST body.
 * Real Slack Web API accepts both for read methods.
 */
function getParams(request: FastifyRequest): Record<string, any> {
  if (request.method === 'GET') {
    return (request.query as Record<string, any>) ?? {};
  }
  return (request.body as Record<string, any>) ?? {};
}

const usersPlugin: FastifyPluginAsync = async (fastify) => {
  // Shared handler for users.list
  async function handleUsersList(request: FastifyRequest, reply: any) {
    // Auth check
    const token = extractToken(request);
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

    const params = getParams(request);
    const limit = params.limit ?? 100;
    const cursor = params.cursor;

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
  }

  // Shared handler for users.info
  async function handleUsersInfo(request: FastifyRequest, reply: any) {
    // Auth check
    const token = extractToken(request);
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

    const params = getParams(request);
    const userId = params.user;
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
  }

  // GET /api/users.list — query params
  fastify.get('/api/users.list', handleUsersList);
  // POST /api/users.list — JSON or form-urlencoded body
  fastify.post('/api/users.list', handleUsersList);

  // GET /api/users.info — query params
  fastify.get('/api/users.info', handleUsersInfo);
  // POST /api/users.info — JSON or form-urlencoded body
  fastify.post('/api/users.info', handleUsersInfo);
};

export default usersPlugin;
export { usersPlugin };
