/**
 * Users Web API routes for Slack twin
 *
 * GET  /api/users.list — list workspace users (query params)
 * POST /api/users.list — list workspace users (JSON or form-urlencoded body)
 * GET  /api/users.info — get user details (query params)
 * POST /api/users.info — get user details (JSON or form-urlencoded body)
 *
 * Plus 10 new methods to reach full Tier 1 coverage (12 total).
 *
 * Real Slack Web API accepts GET with query params for read methods in addition to POST.
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
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

/** Auth + rate-limit + error-sim preamble. Returns tokenRecord or sends error and returns null. */
async function checkAuth(
  fastify: any,
  request: FastifyRequest,
  reply: any,
  methodName: string,
): Promise<any | null> {
  const token = extractToken(request);
  if (!token) {
    reply.status(200).send({ ok: false, error: 'not_authed' });
    return null;
  }
  const tokenRecord = fastify.slackStateManager.getToken(token);
  if (!tokenRecord) {
    reply.status(200).send({ ok: false, error: 'invalid_auth' });
    return null;
  }

  // SLCK-18: scope enforcement
  const scopeCheck = checkScope(methodName, tokenRecord.scope);
  if (scopeCheck) {
    reply.status(200).send({ ok: false, ...scopeCheck });
    return null;
  }

  // SLCK-19: pre-set scope response headers
  const accepted = METHOD_SCOPES[methodName]?.join(',') ?? '';
  reply.header('X-OAuth-Scopes', tokenRecord.scope);
  reply.header('X-Accepted-OAuth-Scopes', accepted);

  const limited = fastify.rateLimiter.check(methodName, token);
  if (limited) {
    reply
      .status(429)
      .header('Retry-After', String(limited.retryAfter))
      .send({ ok: false, error: 'ratelimited' });
    return null;
  }

  const errorConfig = fastify.slackStateManager.getErrorConfig(methodName);
  if (errorConfig) {
    const errorBody = errorConfig.error_body
      ? JSON.parse(errorConfig.error_body)
      : { ok: false, error: 'simulated_error' };
    reply.status(errorConfig.status_code ?? 200).send(errorBody);
    return null;
  }

  return tokenRecord;
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

    // SLCK-18: scope enforcement
    const scopeCheck = checkScope('users.list', tokenRecord.scope);
    if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });
    // SLCK-19: scope response headers
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', METHOD_SCOPES['users.list']?.join(',') ?? '');

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

    // SLCK-18: scope enforcement
    const scopeCheck = checkScope('users.info', tokenRecord.scope);
    if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });
    // SLCK-19: scope response headers
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', METHOD_SCOPES['users.info']?.join(',') ?? '');

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

  // ---------------------------------------------------------------------------
  // GET+POST /api/users.conversations — list channels for a user
  // ---------------------------------------------------------------------------
  async function handleUsersConversations(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.conversations');
    if (!tokenRecord) return;

    const channels = fastify.slackStateManager.listChannels();
    return {
      ok: true,
      channels: channels.map((ch: any) => ({ id: ch.id, name: ch.name })),
      response_metadata: { next_cursor: '' },
    };
  }

  fastify.get('/api/users.conversations', handleUsersConversations);
  fastify.post('/api/users.conversations', handleUsersConversations);

  // ---------------------------------------------------------------------------
  // GET+POST /api/users.getPresence — get user presence
  // ---------------------------------------------------------------------------
  async function handleUsersGetPresence(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.getPresence');
    if (!tokenRecord) return;

    return { ok: true, presence: 'active', online: true };
  }

  fastify.get('/api/users.getPresence', handleUsersGetPresence);
  fastify.post('/api/users.getPresence', handleUsersGetPresence);

  // ---------------------------------------------------------------------------
  // GET+POST /api/users.lookupByEmail — find user by email
  // ---------------------------------------------------------------------------
  async function handleUsersLookupByEmail(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.lookupByEmail');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { email } = params;
    if (!email) {
      return reply.status(200).send({ ok: false, error: 'invalid_arguments' });
    }

    const allUsers = fastify.slackStateManager.listUsers();
    const user = allUsers.find((u: any) => u.email === email);
    if (!user) {
      return reply.status(200).send({ ok: false, error: 'users_not_found' });
    }

    return { ok: true, user: formatMember(user) };
  }

  fastify.get('/api/users.lookupByEmail', handleUsersLookupByEmail);
  fastify.post('/api/users.lookupByEmail', handleUsersLookupByEmail);

  // ---------------------------------------------------------------------------
  // GET+POST /api/users.profile.get — get user profile
  // ---------------------------------------------------------------------------
  async function handleUsersProfileGet(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.profile.get');
    if (!tokenRecord) return;

    const params = getParams(request);
    const userId = params.user ?? tokenRecord.user_id ?? 'U_BOT_TWIN';

    const user = fastify.slackStateManager.getUser(userId);
    if (!user) {
      return reply.status(200).send({ ok: false, error: 'user_not_found' });
    }

    return {
      ok: true,
      profile: {
        display_name: user.display_name ?? user.name ?? '',
        email: user.email ?? '',
        real_name: user.real_name ?? '',
      },
    };
  }

  fastify.get('/api/users.profile.get', handleUsersProfileGet);
  fastify.post('/api/users.profile.get', handleUsersProfileGet);

  // ---------------------------------------------------------------------------
  // GET+POST /api/users.identity — get caller identity
  // ---------------------------------------------------------------------------
  async function handleUsersIdentity(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.identity');
    if (!tokenRecord) return;

    return {
      ok: true,
      user: { id: tokenRecord.user_id ?? 'U_BOT_TWIN', name: 'bot' },
      team: { id: 'T_TWIN' },
    };
  }

  fastify.get('/api/users.identity', handleUsersIdentity);
  fastify.post('/api/users.identity', handleUsersIdentity);

  // ---------------------------------------------------------------------------
  // POST /api/users.profile.set — update user profile
  // ---------------------------------------------------------------------------
  fastify.post('/api/users.profile.set', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.profile.set');
    if (!tokenRecord) return;

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/users.setPresence — set user presence
  // ---------------------------------------------------------------------------
  fastify.post('/api/users.setPresence', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.setPresence');
    if (!tokenRecord) return;

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/users.deletePhoto — delete user photo
  // ---------------------------------------------------------------------------
  fastify.post('/api/users.deletePhoto', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.deletePhoto');
    if (!tokenRecord) return;

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/users.setPhoto — set user photo
  // ---------------------------------------------------------------------------
  fastify.post('/api/users.setPhoto', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.setPhoto');
    if (!tokenRecord) return;

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/users.setActive — mark user as active (bonus)
  // ---------------------------------------------------------------------------
  fastify.post('/api/users.setActive', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'users.setActive');
    if (!tokenRecord) return;

    return { ok: true };
  });
};

export default usersPlugin;
export { usersPlugin };
