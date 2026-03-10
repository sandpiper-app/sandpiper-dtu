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
 * Plus 25 new methods to reach full Tier 1 coverage (28 total).
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

  // ---------------------------------------------------------------------------
  // POST /api/conversations.create — create a new channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.create', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.create');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { name, is_private } = params;
    if (!name) {
      return reply.status(200).send({ ok: false, error: 'invalid_arguments' });
    }

    const newChannel = fastify.slackStateManager.createChannel({
      name,
      is_private: !!is_private,
    });

    return { ok: true, channel: formatChannel(newChannel) };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.join — join a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.join', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.join');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return { ok: true, channel: formatChannel(ch) };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.leave — leave a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.leave', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.leave');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.archive — archive a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.archive', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.archive');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    fastify.slackStateManager.updateChannel(channel, { is_archived: true });
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.unarchive — unarchive a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.unarchive', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.unarchive');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    fastify.slackStateManager.updateChannel(channel, { is_archived: false });
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.rename — rename a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.rename', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.rename');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel, name } = params;
    if (!channel || !name) {
      return reply.status(200).send({ ok: false, error: 'invalid_arguments' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    fastify.slackStateManager.updateChannel(channel, { name });
    return { ok: true, channel: { id: channel, name } };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.invite — invite users to a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.invite', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.invite');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return { ok: true, channel: formatChannel(ch) };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.kick — remove a user from a channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.kick', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.kick');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.open — open a DM or mpIM channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.open', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.open');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel, users } = params;

    if (channel) {
      const ch = fastify.slackStateManager.getChannel(channel);
      if (ch) {
        return { ok: true, already_open: true, channel: formatChannel(ch) };
      }
    }

    // If users provided, return a stub DM channel
    return {
      ok: true,
      already_open: false,
      channel: { id: 'D_TWIN', is_im: true },
    };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.close — close a DM or mpIM channel
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.close', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.close');
    if (!tokenRecord) return;

    return { ok: true, no_op: false, already_closed: false };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.mark — set the read cursor
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.mark', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.mark');
    if (!tokenRecord) return;

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.setPurpose — set channel purpose
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.setPurpose', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.setPurpose');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel, purpose } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    fastify.slackStateManager.updateChannel(channel, { purpose: purpose ?? '' });
    return { ok: true, purpose: purpose ?? '' };
  });

  // ---------------------------------------------------------------------------
  // POST /api/conversations.setTopic — set channel topic
  // ---------------------------------------------------------------------------
  fastify.post('/api/conversations.setTopic', async (request: FastifyRequest, reply: any) => {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.setTopic');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel, topic } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    fastify.slackStateManager.updateChannel(channel, { topic: topic ?? '' });
    return { ok: true, topic: topic ?? '' };
  });

  // ---------------------------------------------------------------------------
  // GET+POST /api/conversations.members — list channel members
  // ---------------------------------------------------------------------------
  async function handleConversationsMembers(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.members');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel } = params;
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return {
      ok: true,
      members: ['U_BOT_TWIN'],
      response_metadata: { next_cursor: '' },
    };
  }

  fastify.get('/api/conversations.members', handleConversationsMembers);
  fastify.post('/api/conversations.members', handleConversationsMembers);

  // ---------------------------------------------------------------------------
  // GET+POST /api/conversations.replies — get thread replies
  // ---------------------------------------------------------------------------
  async function handleConversationsReplies(request: FastifyRequest, reply: any) {
    const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.replies');
    if (!tokenRecord) return;

    const params = getParams(request);
    const { channel, ts } = params;
    if (!channel || !ts) {
      return reply.status(200).send({ ok: false, error: 'invalid_arguments' });
    }

    const ch = fastify.slackStateManager.getChannel(channel);
    if (!ch) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    // Fetch all messages for this channel and filter by thread_ts or ts match
    const allMessages = fastify.slackStateManager.listMessages(channel, { limit: 1000 });
    const threadMessages = allMessages
      .filter((m: any) => m.thread_ts === ts || m.ts === ts)
      .map(formatMessage);

    return {
      ok: true,
      messages: threadMessages,
      has_more: false,
      response_metadata: { next_cursor: '' },
    };
  }

  fastify.get('/api/conversations.replies', handleConversationsReplies);
  fastify.post('/api/conversations.replies', handleConversationsReplies);

  // ---------------------------------------------------------------------------
  // Slack Connect stub handlers (POST only, return { ok: true })
  // ---------------------------------------------------------------------------

  const slackConnectStubs = [
    'conversations.acceptSharedInvite',
    'conversations.approveSharedInvite',
    'conversations.declineSharedInvite',
    'conversations.inviteShared',
    'conversations.listConnectInvites',
    // conversations.requestSharedInvite is a sub-namespace in the SDK
    'conversations.requestSharedInvite.approve',
    'conversations.requestSharedInvite.deny',
    'conversations.requestSharedInvite.list',
    'conversations.externalInvitePermissions.set',
    'conversations.canvases.create',
    'conversations.canvases.delete',
    'conversations.canvases.sections.lookup',
  ];

  for (const methodName of slackConnectStubs) {
    const route = `/api/${methodName}`;
    fastify.post(route, async (request: FastifyRequest, reply: any) => {
      const tokenRecord = await checkAuth(fastify, request, reply, methodName);
      if (!tokenRecord) return;
      return { ok: true };
    });
  }
};

export default conversationsPlugin;
export { conversationsPlugin };
