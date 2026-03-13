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
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
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
    // SLCK-18: scope enforcement
    const scopeCheck = checkScope(method, tokenRecord.scope);
    if (scopeCheck) { reply.status(200).send({ ok: false, ...scopeCheck }); return null; }
    // SLCK-19: scope response headers
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', METHOD_SCOPES[method]?.join(',') ?? '');
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

  function formatStoredView(v: any): any {
    return {
      id: v.id,
      type: v.type,
      title: v.title ? JSON.parse(v.title) : { type: 'plain_text', text: 'Modal' },
      blocks: v.blocks ? JSON.parse(v.blocks) : [],
      callback_id: v.callback_id ?? '',
      state: v.state ? JSON.parse(v.state) : { values: {} },
    };
  }

  // POST /api/views.open — create persistent view
  fastify.post('/api/views.open', async (request, reply) => {
    if (!authCheck(request, reply, 'views.open')) return;
    // Normalize: view may arrive as JSON string (form-encoded) or object (JSON)
    const rawView = (request.body as any)?.view;
    const view = typeof rawView === 'string' ? JSON.parse(rawView) : rawView;
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    const id = generateViewId();
    const stored = fastify.slackStateManager.createView({
      id,
      type: view.type ?? 'modal',
      title: view.title ? JSON.stringify(view.title) : null,
      blocks: view.blocks ? JSON.stringify(view.blocks) : '[]',
      callback_id: view.callback_id ?? '',
    });
    return { ok: true, view: formatStoredView(stored) };
  });

  // POST /api/views.publish — user_id + view required (home tab, no lifecycle)
  fastify.post('/api/views.publish', async (request, reply) => {
    if (!authCheck(request, reply, 'views.publish')) return;
    const { view } = (request.body as any) ?? {};
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    return { ok: true, view: buildView(view, 'home') };
  });

  // POST /api/views.push — same as open (new view on stack)
  fastify.post('/api/views.push', async (request, reply) => {
    if (!authCheck(request, reply, 'views.push')) return;
    // Normalize: view may arrive as JSON string (form-encoded) or object (JSON)
    const rawView = (request.body as any)?.view;
    const view = typeof rawView === 'string' ? JSON.parse(rawView) : rawView;
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });
    const id = generateViewId();
    const stored = fastify.slackStateManager.createView({
      id,
      type: view.type ?? 'modal',
      title: view.title ? JSON.stringify(view.title) : null,
      blocks: view.blocks ? JSON.stringify(view.blocks) : '[]',
      callback_id: view.callback_id ?? '',
    });
    return { ok: true, view: formatStoredView(stored) };
  });

  // POST /api/views.update — look up by view_id and update stored record
  fastify.post('/api/views.update', async (request, reply) => {
    if (!authCheck(request, reply, 'views.update')) return;
    const { view_id } = (request.body as any) ?? {};
    // Normalize: view may arrive as JSON string (form-encoded) or object (JSON)
    const rawView = (request.body as any)?.view;
    const view = typeof rawView === 'string' ? JSON.parse(rawView) : rawView;
    if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });

    if (view_id) {
      const storedView = fastify.slackStateManager.getView(view_id);
      if (storedView) {
        fastify.slackStateManager.updateView(view_id, {
          title: view.title ? JSON.stringify(view.title) : undefined,
          blocks: view.blocks ? JSON.stringify(view.blocks) : undefined,
          callback_id: view.callback_id,
        });
        const updated = fastify.slackStateManager.getView(view_id);
        return { ok: true, view: formatStoredView(updated) };
      }
      // view_id was provided but not found in store
      return reply.send({ ok: false, error: 'view_not_found' });
    }

    // No view_id provided — generate a new view (external_id path, not tested)
    const newId = generateViewId();
    return { ok: true, view: { ...buildView(view), id: newId } };
  });
};

export default viewsPlugin;
export { viewsPlugin };
