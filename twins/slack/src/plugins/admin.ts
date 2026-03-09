/**
 * Admin plugin for Slack twin
 * Provides test control endpoints: reset, fixtures, state inspection,
 * and DLQ management (same pattern as Shopify twin).
 */

import type { FastifyPluginAsync } from 'fastify';
import type { SlackStateManager } from '../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../services/rate-limiter.js';
import type { WebhookQueue, DeadLetterStore } from '@dtu/webhooks';
import {
  generateChannelId,
  generateUserId,
  generateTeamId,
  generateMessageTs,
} from '../services/id-generator.js';
import { randomUUID } from 'node:crypto';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    webhookQueue: WebhookQueue;
    deadLetterStore: DeadLetterStore;
    signingSecret: string;
    rateLimiter: SlackRateLimiter;
  }
}

const adminPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/reset - reset all Slack state
  fastify.post('/admin/reset', async (request) => {
    request.log.info('Resetting Slack twin state');
    // NOTE: deadLetterStore.clear() is NOT called here because StateManager.reset()
    // closes and reopens the shared SQLite DB connection. The DLQ store holds a
    // reference to the old DB instance, making it unusable after reset.
    // DLQ can be cleared explicitly via DELETE /admin/dead-letter-queue.
    fastify.slackStateManager.reset();
    // Reset rate limiter buckets alongside state
    fastify.rateLimiter.reset();
    return {
      reset: true,
      timestamp: Date.now(),
    };
  });

  // POST /admin/fixtures/load - load test fixtures
  fastify.post<{
    Body: {
      channels?: any[];
      users?: any[];
      messages?: any[];
      teams?: any[];
    };
  }>('/admin/fixtures/load', async (request) => {
    const { channels = [], users = [], messages = [], teams = [] } = request.body ?? {};

    request.log.info(
      { channels: channels.length, users: users.length, messages: messages.length, teams: teams.length },
      'Loading Slack fixtures'
    );

    // Load teams
    for (const team of teams) {
      const id = team.id ?? generateTeamId();
      fastify.slackStateManager.createTeam(id, team.name ?? 'Test Team', team.domain ?? 'test-team');
    }

    // Load channels
    for (const channel of channels) {
      const id = channel.id ?? generateChannelId();
      fastify.slackStateManager.createChannel({ ...channel, id });
    }

    // Load users
    for (const user of users) {
      const id = user.id ?? generateUserId();
      fastify.slackStateManager.createUser({
        ...user,
        id,
        team_id: user.team_id ?? 'T_TWIN',
      });
    }

    // Load messages
    for (const message of messages) {
      const ts = message.ts ?? generateMessageTs();
      fastify.slackStateManager.createMessage({
        ...message,
        ts,
        channel_id: message.channel_id ?? 'C_GENERAL',
        blocks: message.blocks ? JSON.stringify(message.blocks) : null,
      });
    }

    return {
      loaded: {
        teams: teams.length,
        channels: channels.length,
        users: users.length,
        messages: messages.length,
      },
    };
  });

  // GET /admin/state - inspect current state counts
  fastify.get('/admin/state', async () => {
    const db = fastify.slackStateManager.database;
    const count = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      return row.count;
    };

    return {
      channels: count('slack_channels'),
      users: count('slack_users'),
      messages: count('slack_messages'),
      tokens: count('slack_tokens'),
      event_subscriptions: count('slack_event_subscriptions'),
    };
  });

  // ---------------------------------------------------------------------------
  // Token seeding endpoint — for sdk-verification tests
  // ---------------------------------------------------------------------------

  // POST /admin/tokens - seed a known bot token directly (bypasses OAuth flow)
  // Used by seedSlackBotToken() in tests/sdk-verification/setup/seeders.ts.
  // The OAuth flow (/api/oauth.v2.access) returns a dynamically generated token
  // that may not match a hardcoded expected value; this endpoint creates a token
  // with an exact, known value via slackStateManager.createToken().
  fastify.post<{
    Body: {
      token: string;
      tokenType: string;
      teamId: string;
      userId: string;
      scope: string;
      appId: string;
    };
  }>('/admin/tokens', async (request, reply) => {
    const { token, tokenType, teamId, userId, scope, appId } = request.body ?? {};
    if (!token || !tokenType || !teamId || !userId || !scope || !appId) {
      return reply.status(400).send({
        error: 'Missing required fields: token, tokenType, teamId, userId, scope, appId',
      });
    }
    fastify.slackStateManager.createToken(token, tokenType, teamId, userId, scope, appId);
    request.log.info({ token, tokenType, teamId }, 'Seeded Slack token via admin endpoint');
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // Dead Letter Queue (DLQ) inspection endpoints
  // ---------------------------------------------------------------------------

  // GET /admin/dead-letter-queue - list all DLQ entries
  fastify.get('/admin/dead-letter-queue', async () => {
    return fastify.deadLetterStore.list();
  });

  // GET /admin/dead-letter-queue/:id - get single DLQ entry
  fastify.get<{ Params: { id: string } }>('/admin/dead-letter-queue/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const entry = fastify.deadLetterStore.get(id);
    if (!entry) {
      return reply.status(404).send({ error: 'Dead letter entry not found' });
    }
    return entry;
  });

  // POST /admin/dead-letter-queue/:id/retry - remove from DLQ and re-enqueue
  fastify.post<{ Params: { id: string } }>('/admin/dead-letter-queue/:id/retry', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const entry = fastify.deadLetterStore.get(id);
    if (!entry) {
      return reply.status(404).send({ error: 'Dead letter entry not found' });
    }

    // Remove from DLQ
    fastify.deadLetterStore.remove(id);

    // Re-enqueue for retry
    await fastify.webhookQueue.enqueue({
      id: randomUUID(),
      topic: entry.topic,
      callbackUrl: entry.callbackUrl,
      payload: JSON.parse(entry.payload),
      secret: fastify.signingSecret,
    });

    request.log.info({ dlqId: id, topic: entry.topic }, 'Re-enqueued dead letter entry');
    return { retried: true, topic: entry.topic, callbackUrl: entry.callbackUrl };
  });

  // DELETE /admin/dead-letter-queue - clear all DLQ entries
  fastify.delete('/admin/dead-letter-queue', async () => {
    fastify.deadLetterStore.clear();
    return { cleared: true };
  });

  // DELETE /admin/dead-letter-queue/:id - remove single DLQ entry
  fastify.delete<{ Params: { id: string } }>('/admin/dead-letter-queue/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const removed = fastify.deadLetterStore.remove(id);
    if (!removed) {
      return reply.status(404).send({ error: 'Dead letter entry not found' });
    }
    return { removed: true };
  });
};

export default adminPlugin;
export { adminPlugin };
