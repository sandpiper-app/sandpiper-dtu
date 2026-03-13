/**
 * Phase 25 SLCK-14: new method family stubs
 *
 * Covers all non-admin missing families from @slack/web-api@7.14.1 manifest:
 *   - canvases.* (6 routes)
 *   - openid.connect.* (2 routes)
 *   - stars.* (3 routes)
 *   - workflows.* (7 routes — stepCompleted/stepFailed/updateStep + triggers.*)
 *   - slackLists.* (13 routes)
 *   - rtm.* (2 routes)
 *   - entity.* (1 route)
 *   - apps.manifest.* + apps.uninstall + apps.event.authorizations.list (7 routes)
 *   - conversations.* extended methods (7 routes)
 *   - team.* extended methods (3 routes)
 *   - users.* extended methods (1 route)
 *   - oauth.* (3 routes)
 *   - files.upload + files.uploadV2 (2 routes)
 *   - workflows.featured.* (4 routes)
 */
import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const newFamiliesPlugin: FastifyPluginAsync = async (fastify) => {
  function stub(method: string, extra: Record<string, unknown> = {}) {
    return async (request: any, reply: any) => {
      const token = extractToken(request);
      if (!token) return reply.send({ ok: false, error: 'not_authed' });
      const tokenRecord = fastify.slackStateManager.getToken(token);
      if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });

      // SLCK-18: scope enforcement
      const scopeCheck = checkScope(method, tokenRecord.scope);
      if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });

      // SLCK-19: scope headers
      const accepted = METHOD_SCOPES[method]?.join(',') ?? '';
      reply.header('X-OAuth-Scopes', tokenRecord.scope);
      reply.header('X-Accepted-OAuth-Scopes', accepted);

      return { ok: true, response_metadata: { next_cursor: '' }, ...extra };
    };
  }

  // ── canvases.* ────────────────────────────────────────────────────
  fastify.post('/api/canvases.create', stub('canvases.create', { canvas_id: 'Cv_STUB' }));
  fastify.post('/api/canvases.delete', stub('canvases.delete'));
  fastify.post('/api/canvases.edit', stub('canvases.edit'));
  fastify.post('/api/canvases.access.delete', stub('canvases.access.delete'));
  fastify.post('/api/canvases.access.set', stub('canvases.access.set'));
  fastify.post('/api/canvases.sections.lookup', stub('canvases.sections.lookup', { results: [] }));

  // ── openid.connect.* ──────────────────────────────────────────────
  fastify.post('/api/openid.connect.token', stub('openid.connect.token', { access_token: 'oidc-stub', id_token: 'jwt-stub' }));
  fastify.post('/api/openid.connect.userInfo', stub('openid.connect.userInfo', { sub: 'U_STUB', email: 'stub@twin.dev' }));

  // ── stars.* ───────────────────────────────────────────────────────
  fastify.post('/api/stars.add', stub('stars.add'));
  fastify.post('/api/stars.list', stub('stars.list', { items: [] }));
  fastify.post('/api/stars.remove', stub('stars.remove'));

  // ── workflows.* ───────────────────────────────────────────────────
  fastify.post('/api/workflows.stepCompleted', stub('workflows.stepCompleted'));
  fastify.post('/api/workflows.stepFailed', stub('workflows.stepFailed'));
  fastify.post('/api/workflows.updateStep', stub('workflows.updateStep'));
  fastify.post('/api/workflows.featured.add', stub('workflows.featured.add'));
  fastify.post('/api/workflows.featured.list', stub('workflows.featured.list', { workflows: [] }));
  fastify.post('/api/workflows.featured.remove', stub('workflows.featured.remove'));
  fastify.post('/api/workflows.featured.set', stub('workflows.featured.set'));

  // ── slackLists.* ──────────────────────────────────────────────────
  fastify.post('/api/slackLists.create', stub('slackLists.create', { list: { id: 'SL_STUB' } }));
  fastify.post('/api/slackLists.update', stub('slackLists.update', { list: { id: 'SL_STUB' } }));
  fastify.post('/api/slackLists.access.delete', stub('slackLists.access.delete'));
  fastify.post('/api/slackLists.access.set', stub('slackLists.access.set'));
  fastify.post('/api/slackLists.download.get', stub('slackLists.download.get', { download_url: '' }));
  fastify.post('/api/slackLists.download.start', stub('slackLists.download.start', { download_id: 'DL_STUB' }));
  fastify.post('/api/slackLists.items.create', stub('slackLists.items.create', { list_item: { id: 'SLI_STUB' } }));
  fastify.post('/api/slackLists.items.delete', stub('slackLists.items.delete'));
  fastify.post('/api/slackLists.items.deleteMultiple', stub('slackLists.items.deleteMultiple', { deleted_ids: [] }));
  fastify.post('/api/slackLists.items.info', stub('slackLists.items.info', { list_item: { id: 'SLI_STUB' } }));
  fastify.post('/api/slackLists.items.list', stub('slackLists.items.list', { items: [] }));
  fastify.post('/api/slackLists.items.update', stub('slackLists.items.update', { list_item: { id: 'SLI_STUB' } }));

  // ── rtm.* ─────────────────────────────────────────────────────────
  fastify.post('/api/rtm.connect', stub('rtm.connect', { url: 'wss://twin.rtm.stub', self: { id: 'U_BOT_TWIN' } }));
  fastify.post('/api/rtm.start', stub('rtm.start', { url: 'wss://twin.rtm.stub', self: { id: 'U_BOT_TWIN' } }));

  // ── entity.* ──────────────────────────────────────────────────────
  fastify.post('/api/entity.presentDetails', stub('entity.presentDetails', { entity: {} }));

  // ── apps.manifest.*, oauth.*, team.extended, users.extended,
  //    files.upload, conversations.extended are already registered
  //    in their respective plugin files (stubs.ts, conversations.ts,
  //    oauth.ts, etc.) — no duplicates needed here
};

export default newFamiliesPlugin;
export { newFamiliesPlugin };
