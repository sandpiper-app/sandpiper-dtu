/**
 * Conversations Web API routes for Slack twin
 *
 * GET  /api/conversations.list    — list channels (query params)
 * POST /api/conversations.list    — list channels (JSON or form-urlencoded body)
 * GET  /api/conversations.info    — get channel details (query params)
 * POST /api/conversations.info    — get channel details (JSON or form-urlencoded body)
 * GET  /api/conversations.history — get messages in a channel (query params)
 * POST /api/conversations.history — get messages in a channel (JSON or form-urlencoded body)
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

/** Format a channel row into Slack API response format */
function formatChannel(ch: any): any {
  return {
    id: ch.id,
    name: ch.name,
    is_channel: !!ch.is_channel,
    is_private: !!ch.is_private,
    is_archived: !!ch.is_archived,
    topic: { value: ch.topic ?? '', creator: '', last_set: 0 },
    purpose: { value: ch.purpose ?? '', creator: '', last_set: 0 },
    num_members: ch.num_members ?? 0,
    created: ch.created ?? 0,
  };
}

/** Format a message row into Slack API response format */
function formatMessage(msg: any): any {
  const formatted: any = {
    type: 'message',
    user: msg.user_id,
    text: msg.text ?? '',
    ts: msg.ts,
  };

  if (msg.blocks) {
    try {
      formatted.blocks = JSON.parse(msg.blocks);
    } catch {
      formatted.blocks = msg.blocks;
    }
  }

  if (msg.thread_ts) {
    formatted.thread_ts = msg.thread_ts;
  }

  if (msg.edited_ts) {
    formatted.edited = {
      user: msg.edited_user,
      ts: msg.edited_ts,
    };
  }

  return formatted;
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

const conversationsPlugin: FastifyPluginAsync = async (fastify) => {
  // Shared handler for conversations.list
  async function handleConversationsList(request: FastifyRequest, reply: any) {
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
    const limited = fastify.rateLimiter.check('conversations.list', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // Error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('conversations.list');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    const params = getParams(request);
    const limit = params.limit ?? 100;
    const cursor = params.cursor;

    const allChannels = fastify.slackStateManager.listChannels();

    // Cursor-based pagination: cursor is base64-encoded channel ID
    let startIdx = 0;
    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
      const idx = allChannels.findIndex((ch: any) => ch.id === decodedCursor);
      if (idx >= 0) startIdx = idx + 1;
    }

    const page = allChannels.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < allChannels.length;
    const nextCursor = hasMore
      ? Buffer.from(page[page.length - 1].id).toString('base64')
      : '';

    return {
      ok: true,
      channels: page.map(formatChannel),
      response_metadata: { next_cursor: nextCursor },
    };
  }

  // Shared handler for conversations.info
  async function handleConversationsInfo(request: FastifyRequest, reply: any) {
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
    const limited = fastify.rateLimiter.check('conversations.info', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // Error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('conversations.info');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    const params = getParams(request);
    const channelId = params.channel;
    if (!channelId) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const channel = fastify.slackStateManager.getChannel(channelId);
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return {
      ok: true,
      channel: formatChannel(channel),
    };
  }

  // Shared handler for conversations.history
  async function handleConversationsHistory(request: FastifyRequest, reply: any) {
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
    const limited = fastify.rateLimiter.check('conversations.history', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // Error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('conversations.history');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    const params = getParams(request);
    const { channel: channelId, limit = 100, cursor, oldest, latest } = params;

    if (!channelId) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    // Verify channel exists
    const channel = fastify.slackStateManager.getChannel(channelId);
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    // Query messages (listMessages fetches limit+1 for has_more detection)
    const messages = fastify.slackStateManager.listMessages(channelId, {
      limit,
      cursor,
      oldest,
      latest,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? Buffer.from(page[page.length - 1].ts).toString('base64')
      : '';

    return {
      ok: true,
      messages: page.map(formatMessage),
      has_more: hasMore,
      response_metadata: { next_cursor: nextCursor },
    };
  }

  // GET /api/conversations.list — query params
  fastify.get('/api/conversations.list', handleConversationsList);
  // POST /api/conversations.list — JSON or form-urlencoded body
  fastify.post('/api/conversations.list', handleConversationsList);

  // GET /api/conversations.info — query params
  fastify.get('/api/conversations.info', handleConversationsInfo);
  // POST /api/conversations.info — JSON or form-urlencoded body
  fastify.post('/api/conversations.info', handleConversationsInfo);

  // GET /api/conversations.history — query params
  fastify.get('/api/conversations.history', handleConversationsHistory);
  // POST /api/conversations.history — JSON or form-urlencoded body
  fastify.post('/api/conversations.history', handleConversationsHistory);
};

export default conversationsPlugin;
export { conversationsPlugin };
