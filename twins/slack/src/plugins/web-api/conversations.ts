/**
 * Conversations Web API routes for Slack twin
 *
 * POST /api/conversations.list — list channels
 * POST /api/conversations.info — get channel details
 * POST /api/conversations.history — get messages in a channel
 *
 * Note: Slack uses POST even for read operations.
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

const conversationsPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/conversations.list
  fastify.post<{
    Body: { limit?: number; cursor?: string; types?: string };
  }>('/api/conversations.list', async (request, reply) => {
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

    const limit = (request.body as any)?.limit ?? 100;
    const cursor = (request.body as any)?.cursor;

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
  });

  // POST /api/conversations.info
  fastify.post<{
    Body: { channel: string };
  }>('/api/conversations.info', async (request, reply) => {
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

    const channelId = (request.body as any)?.channel;
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
  });

  // POST /api/conversations.history
  fastify.post<{
    Body: { channel: string; limit?: number; cursor?: string; oldest?: string; latest?: string };
  }>('/api/conversations.history', async (request, reply) => {
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

    const { channel: channelId, limit = 100, cursor, oldest, latest } = (request.body as any) ?? {};

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
  });
};

export default conversationsPlugin;
export { conversationsPlugin };
