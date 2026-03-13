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
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const newFamiliesPlugin: FastifyPluginAsync = async (fastify) => {
  function stub(extra: Record<string, unknown> = {}) {
    return async (request: any, reply: any) => {
      const token = extractToken(request);
      if (!token) return reply.send({ ok: false, error: 'not_authed' });
      const tokenRecord = fastify.slackStateManager.getToken(token);
      if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
      return { ok: true, response_metadata: { next_cursor: '' }, ...extra };
    };
  }

  // ── canvases.* ────────────────────────────────────────────────────
  fastify.post('/api/canvases.create', stub({ canvas_id: 'Cv_STUB' }));
  fastify.post('/api/canvases.delete', stub());
  fastify.post('/api/canvases.edit', stub());
  fastify.post('/api/canvases.access.delete', stub());
  fastify.post('/api/canvases.access.set', stub());
  fastify.post('/api/canvases.sections.lookup', stub({ results: [] }));

  // ── openid.connect.* ──────────────────────────────────────────────
  fastify.post('/api/openid.connect.token', stub({ access_token: 'oidc-stub', id_token: 'jwt-stub' }));
  fastify.post('/api/openid.connect.userInfo', stub({ sub: 'U_STUB', email: 'stub@twin.dev' }));

  // ── stars.* ───────────────────────────────────────────────────────
  fastify.post('/api/stars.add', stub());
  fastify.post('/api/stars.list', stub({ items: [] }));
  fastify.post('/api/stars.remove', stub());

  // ── workflows.* ───────────────────────────────────────────────────
  fastify.post('/api/workflows.stepCompleted', stub());
  fastify.post('/api/workflows.stepFailed', stub());
  fastify.post('/api/workflows.updateStep', stub());
  fastify.post('/api/workflows.featured.add', stub());
  fastify.post('/api/workflows.featured.list', stub({ workflows: [] }));
  fastify.post('/api/workflows.featured.remove', stub());
  fastify.post('/api/workflows.featured.set', stub());

  // ── slackLists.* ──────────────────────────────────────────────────
  fastify.post('/api/slackLists.create', stub({ list: { id: 'SL_STUB' } }));
  fastify.post('/api/slackLists.update', stub({ list: { id: 'SL_STUB' } }));
  fastify.post('/api/slackLists.access.delete', stub());
  fastify.post('/api/slackLists.access.set', stub());
  fastify.post('/api/slackLists.download.get', stub({ download_url: '' }));
  fastify.post('/api/slackLists.download.start', stub({ download_id: 'DL_STUB' }));
  fastify.post('/api/slackLists.items.create', stub({ list_item: { id: 'SLI_STUB' } }));
  fastify.post('/api/slackLists.items.delete', stub());
  fastify.post('/api/slackLists.items.deleteMultiple', stub({ deleted_ids: [] }));
  fastify.post('/api/slackLists.items.info', stub({ list_item: { id: 'SLI_STUB' } }));
  fastify.post('/api/slackLists.items.list', stub({ items: [] }));
  fastify.post('/api/slackLists.items.update', stub({ list_item: { id: 'SLI_STUB' } }));

  // ── rtm.* ─────────────────────────────────────────────────────────
  fastify.post('/api/rtm.connect', stub({ url: 'wss://twin.rtm.stub', self: { id: 'U_BOT_TWIN' } }));
  fastify.post('/api/rtm.start', stub({ url: 'wss://twin.rtm.stub', self: { id: 'U_BOT_TWIN' } }));

  // ── entity.* ──────────────────────────────────────────────────────
  fastify.post('/api/entity.presentDetails', stub({ entity: {} }));

  // ── apps.manifest.*, oauth.*, team.extended, users.extended,
  //    files.upload, conversations.extended are already registered
  //    in their respective plugin files (stubs.ts, conversations.ts,
  //    oauth.ts, etc.) — no duplicates needed here
};

export default newFamiliesPlugin;
export { newFamiliesPlugin };
