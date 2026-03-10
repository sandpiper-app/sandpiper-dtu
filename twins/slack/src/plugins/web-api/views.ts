/**
 * Views Web API routes for Slack twin
 *
 * POST /api/views.open    — open a modal (returns synthetic view object)
 * POST /api/views.publish — publish an App Home view (returns home-type view)
 * POST /api/views.push    — push a modal onto the view stack
 * POST /api/views.update  — update an existing view by view_id or external_id
 *
 * View state is NOT persisted — each call returns a freshly generated synthetic
 * view object. This satisfies Tier 1 conformance: the SDK only needs ok:true and
 * a view object with id/type/blocks to proceed; modal lifecycle is not required.
 */

import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../../services/rate-limiter.js';

declare module 'fastify' {
  interface FastifyInstance {
    slackStateManager: SlackStateManager;
    rateLimiter: SlackRateLimiter;
  }
}

function generateViewId(): string {
  return 'V_' + Math.random().toString(36).substring(2, 11).toUpperCase();
}

const viewsPlugin: FastifyPluginAsync = async (fastify) => {
  // Shared auth + rate-limit + error-sim preamble
  function authCheck(request: any, reply: any, method: string) {
    const token = extractToken(request);
    if (!token) { reply.send({ ok: false, error: 'not_authed' }); return null; }
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) { reply.send({ ok: false, error: 'invalid_auth' }); return null; }
    const limited = fastify.rateLimiter.check(method, token);
    if (limited) {
      reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' });
      return null;
    }
    const errorConfig = fastify.slackStateManager.getErrorConfig(method);
    if (errorConfig) {
      const body = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      reply.status(errorConfig.status_code ?? 200).send(body);
      return null;
    }
    return tokenRecord;
  }

  function buildView(viewInput: any, type: 'modal' | 'home' = 'modal') {
    return {
      id: generateViewId(),
      type,
      title: viewInput?.title ?? { type: 'plain_text', text: type === 'home' ? 'Home' : 'Modal' },
      blocks: viewInput?.blocks ?? [],
      callback_id: viewInput?.callback_id ?? '',
      state: { values: {} },
    };
  }

  // POST /api/views.open — trigger_id + view required
  fastify.post('/api/views.open', async (request, reply) => {
    if (!authCheck(request, reply, 'views.open')) return;
    const { view } = (request.body as any) ?? {};
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    return { ok: true, view: buildView(view, 'modal') };
  });

  // POST /api/views.publish — user_id + view required
  fastify.post('/api/views.publish', async (request, reply) => {
    if (!authCheck(request, reply, 'views.publish')) return;
    const { view } = (request.body as any) ?? {};
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    return { ok: true, view: buildView(view, 'home') };
  });

  // POST /api/views.push — trigger_id + view required
  fastify.post('/api/views.push', async (request, reply) => {
    if (!authCheck(request, reply, 'views.push')) return;
    const { view } = (request.body as any) ?? {};
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    return { ok: true, view: buildView(view, 'modal') };
  });

  // POST /api/views.update — view_id or external_id + view required
  fastify.post('/api/views.update', async (request, reply) => {
    if (!authCheck(request, reply, 'views.update')) return;
    const { view } = (request.body as any) ?? {};
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    return { ok: true, view: buildView(view, 'modal') };
  });
};

export default viewsPlugin;
export { viewsPlugin };
