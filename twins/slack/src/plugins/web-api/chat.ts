/**
 * Chat Web API routes for Slack twin
 *
 * POST /api/chat.postMessage — post a message to a channel
 * POST /api/chat.update — update an existing message
 *
 * CRITICAL: Slack returns HTTP 200 with { ok: false, error } for ALL errors
 * except rate limits (HTTP 429). Do NOT return 401/403/404 status codes.
 */

import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { validateBlocks } from '../../services/block-kit-validator.js';
import { generateMessageTs } from '../../services/id-generator.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../../services/rate-limiter.js';
import type { EventDispatcher } from '../../services/event-dispatcher.js';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    rateLimiter: SlackRateLimiter;
    eventDispatcher: EventDispatcher;
  }
}

/** Shared auth/rate/error-sim preamble — returns error reply or null if all clear */
async function checkAuthRateError(
  fastify: any,
  request: any,
  reply: any,
  method: string,
): Promise<string | null> {
  const token = extractToken(request);
  if (!token) { await reply.status(200).send({ ok: false, error: 'not_authed' }); return null; }

  const tokenRecord = fastify.slackStateManager.getToken(token);
  if (!tokenRecord) { await reply.status(200).send({ ok: false, error: 'invalid_auth' }); return null; }

  const limited = fastify.rateLimiter.check(method, token);
  if (limited) {
    await reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' });
    return null;
  }

  const errorConfig = fastify.slackStateManager.getErrorConfig(method);
  if (errorConfig) {
    const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
    await reply.status(errorConfig.status_code ?? 200).send(errorBody);
    return null;
  }

  return token;
}

const chatPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/chat.postMessage
  fastify.post<{
    Body: { channel: string; text?: string; blocks?: any[] | string };
  }>('/api/chat.postMessage', async (request, reply) => {
    // 1. Extract and validate token (Bearer header, body param, or query param)
    const token = extractToken(request);
    if (!token) {
      return reply.status(200).send({ ok: false, error: 'not_authed' });
    }

    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) {
      return reply.status(200).send({ ok: false, error: 'invalid_auth' });
    }

    // 2. Rate limit check
    const limited = fastify.rateLimiter.check('chat.postMessage', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // 3. Check error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('chat.postMessage');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    // 4. Validate request
    const { channel, text, blocks: rawBlocks } = request.body ?? {};
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    if (!text && !rawBlocks) {
      return reply.status(200).send({ ok: false, error: 'no_text' });
    }

    // Parse blocks from JSON string when sent via form-urlencoded
    let blocks = rawBlocks;
    if (typeof blocks === 'string') {
      try { blocks = JSON.parse(blocks); } catch { /* leave as-is */ }
    }

    // 5. Validate Block Kit blocks if present
    if (blocks && Array.isArray(blocks)) {
      const validation = validateBlocks(blocks);
      if (!validation.valid) {
        return reply.status(200).send({ ok: false, error: validation.error });
      }
    }

    // 6. Verify channel exists
    const channelRecord = fastify.slackStateManager.getChannel(channel);
    if (!channelRecord) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    // 7. Create message
    const ts = generateMessageTs();
    const userId = tokenRecord.user_id ?? 'U_BOT_TWIN';

    fastify.slackStateManager.createMessage({
      channel_id: channel,
      user_id: userId,
      text: text ?? undefined,
      blocks: blocks ? JSON.stringify(blocks) : undefined,
      ts,
    });

    // 8. Dispatch Events API events (fire-and-forget, like real Slack)
    // Dispatch message event
    fastify.eventDispatcher.dispatch('message', {
      channel,
      user: userId,
      text: text ?? '',
      ts,
      channel_type: 'channel',
    });

    // Dispatch app_mention if message mentions bot
    if (text && text.includes('<@U_BOT_TWIN>')) {
      fastify.eventDispatcher.dispatch('app_mention', {
        type: 'app_mention',
        user: userId,
        text,
        ts,
        channel,
        channel_type: 'channel',
      });
    }

    // 9. Return Slack-format response (ts is STRING, not number)
    return {
      ok: true,
      channel,
      ts,
      message: {
        text: text ?? '',
        ts,
        type: 'message',
        user: userId,
      },
    };
  });

  // POST /api/chat.update
  fastify.post<{
    Body: { channel: string; ts: string; text?: string; blocks?: any[] | string };
  }>('/api/chat.update', async (request, reply) => {
    // 1. Extract and validate token (Bearer header, body param, or query param)
    const token = extractToken(request);
    if (!token) {
      return reply.status(200).send({ ok: false, error: 'not_authed' });
    }

    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) {
      return reply.status(200).send({ ok: false, error: 'invalid_auth' });
    }

    // 2. Rate limit check
    const limited = fastify.rateLimiter.check('chat.update', token);
    if (limited) {
      return reply
        .status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // 3. Check error simulation
    const errorConfig = fastify.slackStateManager.getErrorConfig('chat.update');
    if (errorConfig) {
      const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      return reply.status(errorConfig.status_code ?? 200).send(errorBody);
    }

    const { channel, ts, text, blocks: rawBlocks } = request.body ?? {};

    if (!channel || !ts) {
      return reply.status(200).send({ ok: false, error: 'message_not_found' });
    }

    // Parse blocks from JSON string when sent via form-urlencoded
    let blocks = rawBlocks;
    if (typeof blocks === 'string') {
      try { blocks = JSON.parse(blocks); } catch { /* leave as-is */ }
    }

    // 4. Validate Block Kit blocks if present
    if (blocks && Array.isArray(blocks)) {
      const validation = validateBlocks(blocks);
      if (!validation.valid) {
        return reply.status(200).send({ ok: false, error: validation.error });
      }
    }

    // 5. Verify message exists
    const message = fastify.slackStateManager.getMessage(ts);
    if (!message) {
      return reply.status(200).send({ ok: false, error: 'message_not_found' });
    }

    // 6. Update message
    fastify.slackStateManager.updateMessage(ts, {
      text: text ?? message.text,
      blocks: blocks ? JSON.stringify(blocks) : message.blocks,
    });

    return {
      ok: true,
      channel,
      ts,
      text: text ?? message.text,
    };
  });

  // POST /api/chat.delete
  fastify.post<{
    Body: { channel: string; ts: string };
  }>('/api/chat.delete', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.delete');
    if (!token) return;

    const { channel, ts } = request.body ?? {};
    if (!channel || !ts) {
      return reply.status(200).send({ ok: false, error: 'message_not_found' });
    }

    // Lenient delete — remove message if it exists, otherwise no-op
    if (fastify.slackStateManager.getMessage(ts)) {
      fastify.slackStateManager.database
        .prepare('DELETE FROM slack_messages WHERE ts = ?')
        .run(ts);
    }

    return { ok: true, channel, ts };
  });

  // POST /api/chat.postEphemeral
  fastify.post<{
    Body: { channel: string; user: string; text?: string };
  }>('/api/chat.postEphemeral', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.postEphemeral');
    if (!token) return;

    const { channel, user } = request.body ?? {};
    if (!channel || !user) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return { ok: true, message_ts: generateMessageTs() };
  });

  // GET+POST /api/chat.getPermalink
  const getPermalinkHandler = async (request: any, reply: any) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.getPermalink');
    if (!token) return;

    const params = (request.method === 'GET' ? request.query : request.body) as any;
    const { channel, message_ts } = params ?? {};
    if (!channel || !message_ts) {
      return reply.status(200).send({ ok: false, error: 'message_not_found' });
    }

    const permalink = `https://twin-workspace.slack.com/archives/${channel}/p${String(message_ts).replace('.', '')}`;
    return { ok: true, channel, permalink };
  };
  fastify.get('/api/chat.getPermalink', getPermalinkHandler);
  fastify.post('/api/chat.getPermalink', getPermalinkHandler);

  // POST /api/chat.meMessage
  fastify.post<{
    Body: { channel: string; text: string };
  }>('/api/chat.meMessage', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.meMessage');
    if (!token) return;

    const { channel, text } = request.body ?? {};
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const channelRecord = fastify.slackStateManager.getChannel(channel);
    if (!channelRecord) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ts = generateMessageTs();
    const tokenRecord = fastify.slackStateManager.getToken(token);
    const userId = tokenRecord?.user_id ?? 'U_BOT_TWIN';

    fastify.slackStateManager.createMessage({
      channel_id: channel,
      user_id: userId,
      text: text ?? '',
      ts,
      subtype: 'me_message',
    });

    return { ok: true, channel, ts };
  });

  // POST /api/chat.scheduleMessage
  fastify.post<{
    Body: { channel: string; text?: string; post_at: number | string };
  }>('/api/chat.scheduleMessage', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.scheduleMessage');
    if (!token) return;

    const { channel, post_at } = request.body ?? {};
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    return {
      ok: true,
      channel,
      scheduled_message_id: `SM${Date.now()}`,
      post_at: Number(post_at),
    };
  });

  // GET+POST /api/chat.scheduledMessages.list
  const scheduledMessagesListHandler = async (request: any, reply: any) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.scheduledMessages.list');
    if (!token) return;

    return {
      ok: true,
      scheduled_messages: [],
      response_metadata: { next_cursor: '' },
    };
  };
  fastify.get('/api/chat.scheduledMessages.list', scheduledMessagesListHandler);
  fastify.post('/api/chat.scheduledMessages.list', scheduledMessagesListHandler);

  // POST /api/chat.deleteScheduledMessage
  fastify.post<{
    Body: { channel: string; scheduled_message_id: string };
  }>('/api/chat.deleteScheduledMessage', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.deleteScheduledMessage');
    if (!token) return;

    return { ok: true };
  });

  // POST /api/chat.unfurl
  fastify.post<{
    Body: { channel: string; ts: string; unfurls?: Record<string, any> };
  }>('/api/chat.unfurl', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.unfurl');
    if (!token) return;

    return { ok: true };
  });

  // POST /api/chat.startStream
  // Returns a ts that ChatStreamer uses to track the stream session.
  fastify.post<{
    Body: { channel: string };
  }>('/api/chat.startStream', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.startStream');
    if (!token) return;

    const { channel } = request.body ?? {};
    if (!channel) {
      return reply.status(200).send({ ok: false, error: 'channel_not_found' });
    }

    const ts = generateMessageTs();
    return { ok: true, ts };
  });

  // POST /api/chat.appendStream
  fastify.post<{
    Body: { ts: string; text?: string };
  }>('/api/chat.appendStream', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.appendStream');
    if (!token) return;

    return { ok: true };
  });

  // POST /api/chat.stopStream
  fastify.post<{
    Body: { ts: string; text?: string };
  }>('/api/chat.stopStream', async (request, reply) => {
    const token = await checkAuthRateError(fastify, request, reply, 'chat.stopStream');
    if (!token) return;

    return { ok: true };
  });
};

export default chatPlugin;
export { chatPlugin };
