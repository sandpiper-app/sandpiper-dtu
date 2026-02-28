/**
 * Events API plugin for Slack twin
 *
 * POST /events — the endpoint apps configure as their Request URL
 * Handles:
 * - url_verification challenge-response (must respond in < 3 seconds)
 * - event_callback receipt (logging/acknowledgment)
 */

import type { FastifyPluginAsync } from 'fastify';

const eventsApiPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /events — Events API endpoint
  fastify.post('/events', async (request, reply) => {
    const body = request.body as any;

    // Handle url_verification challenge
    if (body?.type === 'url_verification') {
      return reply
        .header('content-type', 'application/json')
        .send({ challenge: body.challenge });
    }

    // Handle event_callback — acknowledge receipt
    if (body?.type === 'event_callback') {
      request.log.info(
        { event_type: body.event?.type, event_id: body.event_id },
        'Received event callback'
      );
      return reply.status(200).send();
    }

    // Unknown type
    return reply.status(200).send();
  });
};

export default eventsApiPlugin;
export { eventsApiPlugin };
