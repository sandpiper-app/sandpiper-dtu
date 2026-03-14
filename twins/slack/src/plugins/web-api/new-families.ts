/**
 * Phase 25/35 SLCK-14 + behavioral parity: new method family stubs
 *
 * Covers all non-admin missing families from @slack/web-api@7.14.1 manifest:
 *   - canvases.* (6 routes)
 *   - openid.connect.* (2 routes — openid.connect.token is a no-auth code-exchange)
 *   - stars.* (3 routes)
 *   - workflows.* (7 routes — stepCompleted/stepFailed/updateStep + triggers.*)
 *   - slackLists.* (13 routes)
 *   - rtm.* (2 routes)
 *   - entity.* (1 route)
 *   - apps.manifest.* (5 routes)
 *   - apps.uninstall (1 route)
 *   - apps.event.authorizations.list (1 route)
 *   - files.upload + files.uploadV2 legacy stubs (2 routes)
 *   - oauth.access (no-auth, 1 route)
 *   - oauth.v2.exchange (no-auth, 1 route)
 *   - team.billing.info + team.externalTeams.disconnect/list (3 routes)
 *   - users.discoverableContacts.lookup (1 route)
 *   - admin.workflows.search (1 route)
 *   - workflows.featured.* (4 routes)
 *
 * NOTE: oauth.v2.access is handled in oauth.ts — only METHOD_SCOPES needs its entry.
 * NOTE: conversations.* extended methods are handled in conversations.ts.
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
  // openid.connect.token: no bearer auth — authenticates via client_id + client_secret.
  // Real Slack exchanges client_id + client_secret + code for OIDC identity tokens.
  // The WebClient also sends an Authorization header but the handler must NOT require it.
  // Client credential map (same shape as oauth.ts CLIENT_SECRETS)
  const OIDC_CLIENT_SECRETS: Record<string, string> = {
    'test': 'test',
    'test-client': 'test-client-secret',
    'test-client-id-19': 'test-client-secret-19',
  };
  fastify.post('/api/openid.connect.token', async (request, reply) => {
    const body = (request.body as any) ?? {};
    const { client_id, client_secret, code } = body;
    if (!client_id || !client_secret) {
      return reply.send({ ok: false, error: 'invalid_arguments' });
    }
    // Validate credentials
    const expectedSecret = OIDC_CLIENT_SECRETS[client_id];
    if (!expectedSecret || client_secret !== expectedSecret) {
      return reply.send({ ok: false, error: 'invalid_client' });
    }
    const suffix = code ?? 'anon';
    const oidcToken = `xoxp-oidc-${suffix}`;

    // Ensure U_AUTHED user exists for identity lookups
    const existingUser = fastify.slackStateManager.getUser('U_AUTHED');
    if (!existingUser) {
      fastify.slackStateManager.createUser({
        id: 'U_AUTHED',
        team_id: 'T_TWIN',
        name: 'authed-user',
        real_name: 'Authed User',
        email: 'authed-user@twin.dev',
      });
    }

    // Persist the OIDC token so openid.connect.userInfo can look it up
    fastify.slackStateManager.createToken(oidcToken, 'user', 'T_TWIN', 'U_AUTHED', 'openid', 'A_TWIN');

    return reply.send({
      ok: true,
      access_token: oidcToken,
      token_type: 'Bearer',
      id_token: 'eyJhbGciOiJSUzI1NiJ9.stub.oidc',
      refresh_token: `xoxe-oidc-${suffix}`,
      expires_in: 43200,
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    });
  });

  // openid.connect.userInfo: bearer-auth handler — looks up the persisted OIDC token
  fastify.post('/api/openid.connect.userInfo', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.send({ ok: false, error: 'not_authed' });
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });

    // Scope enforcement
    const scopeCheck = checkScope('openid.connect.userInfo', tokenRecord.scope);
    if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });

    // Scope headers
    const accepted = METHOD_SCOPES['openid.connect.userInfo']?.join(',') ?? '';
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', accepted);

    // Load user identity
    const user = fastify.slackStateManager.getUser(tokenRecord.user_id);

    return reply.send({
      ok: true,
      sub: tokenRecord.user_id,
      'https://slack.com/user_id': tokenRecord.user_id,
      email: user?.email ?? 'authed-user@twin.dev',
      email_verified: true,
      name: user?.real_name ?? user?.name ?? 'Authed User',
    });
  });

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

  // ── apps.manifest.* (5 routes) ────────────────────────────────────────────
  fastify.post('/api/apps.manifest.create', stub('apps.manifest.create', { manifest: {} }));
  fastify.post('/api/apps.manifest.delete', stub('apps.manifest.delete'));
  fastify.post('/api/apps.manifest.export', stub('apps.manifest.export', { manifest: {} }));
  fastify.post('/api/apps.manifest.update', stub('apps.manifest.update'));
  fastify.post('/api/apps.manifest.validate', stub('apps.manifest.validate'));

  // ── apps.uninstall ────────────────────────────────────────────────────────
  fastify.post('/api/apps.uninstall', stub('apps.uninstall'));

  // ── apps.event.authorizations.list ────────────────────────────────────────
  fastify.post('/api/apps.event.authorizations.list', stub('apps.event.authorizations.list', { authorizations: [] }));

  // ── files.upload + files.uploadV2 (legacy apiCall stubs only) ─────────────
  // NOTE: files.upload/uploadV2 here are legacy apiCall stubs only.
  // The filesUploadV2() convenience method uses the 3-step chain in files.ts.
  fastify.post('/api/files.upload', stub('files.upload', { file: { id: 'F_STUB', name: 'stub.txt' } }));
  fastify.post('/api/files.uploadV2', stub('files.uploadV2', { files: [] }));

  // ── oauth.access (legacy, no-auth) ────────────────────────────────────────
  // No bearer auth — authenticates via client_id/client_secret in body
  fastify.post('/api/oauth.access', async (request, reply) => {
    const body = (request.body as any) ?? {};
    if (!body.client_id) return reply.send({ ok: false, error: 'invalid_arguments' });
    return reply.send({ ok: true, access_token: `xoxp-legacy-${Date.now()}`, scope: 'read' });
  });

  // ── oauth.v2.exchange (no-auth) ───────────────────────────────────────────
  fastify.post('/api/oauth.v2.exchange', async (request, reply) => {
    const body = (request.body as any) ?? {};
    if (!body.client_id) return reply.send({ ok: false, error: 'invalid_arguments' });
    return reply.send({ ok: true, token: `xoxb-exchanged-${Date.now()}`, token_type: 'bot' });
  });

  // ── team extended ─────────────────────────────────────────────────────────
  fastify.post('/api/team.billing.info', stub('team.billing.info', { plan: { type: 'free' } }));
  fastify.post('/api/team.externalTeams.disconnect', stub('team.externalTeams.disconnect'));
  fastify.post('/api/team.externalTeams.list', stub('team.externalTeams.list', { external_teams: [] }));
  fastify.get('/api/team.externalTeams.list', stub('team.externalTeams.list', { external_teams: [] }));

  // ── users extended ────────────────────────────────────────────────────────
  fastify.post('/api/users.discoverableContacts.lookup', stub('users.discoverableContacts.lookup', { users: [] }));

  // ── admin.workflows.search (missing from admin.ts) ────────────────────────
  fastify.post('/api/admin.workflows.search', stub('admin.workflows.search', { workflows: [], response_metadata: { next_cursor: '' } }));
};

export default newFamiliesPlugin;
export { newFamiliesPlugin };
