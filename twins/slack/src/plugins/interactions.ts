/**
 * Interactions plugin for Slack twin
 *
 * POST /admin/interactions/trigger — simulate a user clicking a button
 * POST /response-url/:id — response URL endpoint for follow-up messages
 */

import type { FastifyPluginAsync } from 'fastify';
import type { InteractionHandler } from '../services/interaction-handler.js';

declare module 'fastify' {
  interface FastifyInstance {
    interactionHandler: InteractionHandler;
  }
}

const interactionsPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/interactions/trigger — simulate button click
  fastify.post<{
    Body: {
      message_ts: string;
      channel: string;
      action_id: string;
      user_id: string;
      block_id?: string;
    };
  }>('/admin/interactions/trigger', async (request, reply) => {
    const { message_ts, channel, action_id, user_id, block_id } = request.body ?? {};

    if (!message_ts || !channel || !action_id || !user_id) {
      return reply.status(400).send({
        ok: false,
        error: 'missing_params',
        required: ['message_ts', 'channel', 'action_id', 'user_id'],
      });
    }

    // Generate interaction payload
    const { payload, responseUrl } = fastify.interactionHandler.generateInteractionPayload({
      messageTs: message_ts,
      channelId: channel,
      actionId: action_id,
      userId: user_id,
      blockId: block_id,
    });

    // Deliver to subscribed app's request URL as form-encoded
    // (CRITICAL: Slack sends interaction payloads as application/x-www-form-urlencoded
    //  with a 'payload' field containing JSON, not as raw JSON)
    const subscriptions = fastify.slackStateManager.listEventSubscriptions();

    for (const sub of subscriptions) {
      try {
        const formBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
        await fetch(sub.request_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody,
        });
      } catch (err) {
        request.log.warn({ error: err, url: sub.request_url }, 'Failed to deliver interaction payload');
      }
    }

    return { ok: true, response_url: responseUrl };
  });

  // POST /admin/reactions/add — add a reaction and dispatch event
  fastify.post<{
    Body: {
      message_ts: string;
      channel: string;
      user_id: string;
      reaction: string;
    };
  }>('/admin/reactions/add', async (request, reply) => {
    const { message_ts, channel, user_id, reaction } = request.body ?? {};

    if (!message_ts || !channel || !user_id || !reaction) {
      return reply.status(400).send({
        ok: false,
        error: 'missing_params',
      });
    }

    // Look up message author for item_user field
    const message = fastify.slackStateManager.getMessage(message_ts);
    const itemUser = message?.user_id ?? 'U_UNKNOWN';

    // Store reaction
    fastify.slackStateManager.addReaction(message_ts, channel, user_id, reaction);

    // Dispatch reaction_added event
    if (fastify.eventDispatcher) {
      fastify.eventDispatcher.dispatch('reaction_added', {
        type: 'reaction_added',
        user: user_id,
        reaction,
        item: { type: 'message', channel, ts: message_ts },
        item_user: itemUser,
        event_ts: String(Date.now() / 1000),
      });
    }

    return { ok: true };
  });

  // POST /response-url/:id — response URL endpoint
  fastify.post<{
    Params: { id: string };
  }>('/response-url/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as any;

    const result = fastify.interactionHandler.handleResponseUrl(id, body);

    if (!result.ok) {
      return reply.status(410).send(result);
    }

    return result;
  });
};

export default interactionsPlugin;
export { interactionsPlugin };
