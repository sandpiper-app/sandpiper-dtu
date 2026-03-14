/**
 * Tier 2 stub routes for Slack twin.
 * Returns { ok: true } for methods that don't need state for SDK conformance.
 * Auth check is still required — SDK sends tokens to all methods.
 *
 * CRITICAL: Slack returns HTTP 200 with { ok: false, error } for ALL errors.
 * Stubs that don't exist would cause SDK to receive a 404 and throw a
 * transport error rather than an API error — breaking consumer test suites.
 */
import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const stubsPlugin: FastifyPluginAsync = async (fastify) => {
  // Auth-gated stub: returns { ok: true, ...extra } after token + scope check
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

  // ── files family ──────────────────────────────────────────────────
  fastify.post('/api/files.delete', stub('files.delete'));
  fastify.post('/api/files.info', stub('files.info', { file: { id: 'F_STUB', name: 'stub.txt' } }));
  fastify.get('/api/files.info', stub('files.info', { file: { id: 'F_STUB', name: 'stub.txt' } }));
  fastify.post('/api/files.list', stub('files.list', { files: [] }));
  fastify.get('/api/files.list', stub('files.list', { files: [] }));
  fastify.post('/api/files.revokePublicURL', stub('files.revokePublicURL'));
  fastify.post('/api/files.sharedPublicURL', stub('files.sharedPublicURL'));
  fastify.post('/api/files.comments.delete', stub('files.comments.delete'));
  fastify.post('/api/files.remote.add', stub('files.remote.add'));
  fastify.post('/api/files.remote.info', stub('files.remote.info', { file: {} }));
  fastify.post('/api/files.remote.list', stub('files.remote.list', { files: [] }));
  fastify.post('/api/files.remote.remove', stub('files.remote.remove'));
  fastify.post('/api/files.remote.share', stub('files.remote.share'));
  fastify.post('/api/files.remote.update', stub('files.remote.update'));

  // ── search family ─────────────────────────────────────────────────
  fastify.post('/api/search.all', stub('search.all', { messages: { matches: [], total: 0, pagination: {} }, files: { matches: [], total: 0 } }));
  fastify.get('/api/search.all', stub('search.all', { messages: { matches: [], total: 0, pagination: {} }, files: { matches: [], total: 0 } }));
  fastify.post('/api/search.messages', stub('search.messages', { messages: { matches: [], total: 0, pagination: {} } }));
  fastify.get('/api/search.messages', stub('search.messages', { messages: { matches: [], total: 0, pagination: {} } }));
  fastify.post('/api/search.files', stub('search.files', { files: { matches: [], total: 0 } }));
  fastify.get('/api/search.files', stub('search.files', { files: { matches: [], total: 0 } }));

  // ── reminders family ──────────────────────────────────────────────
  fastify.post('/api/reminders.add', stub('reminders.add', { reminder: { id: 'Rm_STUB', text: '', time: 0, complete_ts: 0 } }));
  fastify.post('/api/reminders.complete', stub('reminders.complete'));
  fastify.post('/api/reminders.delete', stub('reminders.delete'));
  fastify.post('/api/reminders.info', stub('reminders.info', { reminder: { id: 'Rm_STUB' } }));
  fastify.get('/api/reminders.info', stub('reminders.info', { reminder: { id: 'Rm_STUB' } }));
  fastify.post('/api/reminders.list', stub('reminders.list', { reminders: [] }));
  fastify.get('/api/reminders.list', stub('reminders.list', { reminders: [] }));

  // ── bots / emoji / migration / tooling ───────────────────────────
  fastify.post('/api/bots.info', stub('bots.info', { bot: { id: 'B_BOT_TWIN', name: 'twin-bot' } }));
  fastify.get('/api/bots.info', stub('bots.info', { bot: { id: 'B_BOT_TWIN', name: 'twin-bot' } }));
  fastify.post('/api/emoji.list', stub('emoji.list', { emoji: {} }));
  fastify.get('/api/emoji.list', stub('emoji.list', { emoji: {} }));
  fastify.post('/api/migration.exchange', stub('migration.exchange', { token_map: {} }));
  fastify.post('/api/tooling.tokens.rotate', stub('tooling.tokens.rotate', { token: 'xoxb-rotated', refresh_token: 'xoxe-refresh' }));

  // ── dnd family ────────────────────────────────────────────────────
  fastify.post('/api/dnd.endDnd', stub('dnd.endDnd'));
  fastify.post('/api/dnd.endSnooze', stub('dnd.endSnooze', { dnd_status: {} }));
  fastify.post('/api/dnd.info', stub('dnd.info', { dnd_enabled: false }));
  fastify.get('/api/dnd.info', stub('dnd.info', { dnd_enabled: false }));
  fastify.post('/api/dnd.setSnooze', stub('dnd.setSnooze', { snooze_enabled: true }));
  fastify.post('/api/dnd.teamInfo', stub('dnd.teamInfo', { users: {} }));
  fastify.get('/api/dnd.teamInfo', stub('dnd.teamInfo', { users: {} }));

  // ── bookmarks family ──────────────────────────────────────────────
  fastify.post('/api/bookmarks.add', stub('bookmarks.add', { bookmark: { id: 'Bk_STUB' } }));
  fastify.post('/api/bookmarks.edit', stub('bookmarks.edit', { bookmark: { id: 'Bk_STUB' } }));
  fastify.post('/api/bookmarks.list', stub('bookmarks.list', { bookmarks: [] }));
  fastify.get('/api/bookmarks.list', stub('bookmarks.list', { bookmarks: [] }));
  fastify.post('/api/bookmarks.remove', stub('bookmarks.remove'));

  // ── usergroups family ─────────────────────────────────────────────
  fastify.post('/api/usergroups.create', stub('usergroups.create', { usergroup: { id: 'S_STUB', name: 'stub' } }));
  fastify.post('/api/usergroups.disable', stub('usergroups.disable', { usergroup: { id: 'S_STUB' } }));
  fastify.post('/api/usergroups.enable', stub('usergroups.enable', { usergroup: { id: 'S_STUB' } }));
  fastify.post('/api/usergroups.list', stub('usergroups.list', { usergroups: [] }));
  fastify.get('/api/usergroups.list', stub('usergroups.list', { usergroups: [] }));
  fastify.post('/api/usergroups.update', stub('usergroups.update', { usergroup: { id: 'S_STUB' } }));
  fastify.post('/api/usergroups.users.list', stub('usergroups.users.list', { users: [] }));
  fastify.get('/api/usergroups.users.list', stub('usergroups.users.list', { users: [] }));
  fastify.post('/api/usergroups.users.update', stub('usergroups.users.update', { usergroup: { id: 'S_STUB' } }));

  // ── calls family ──────────────────────────────────────────────────
  fastify.post('/api/calls.add', stub('calls.add', { call: { id: 'R_STUB' } }));
  fastify.post('/api/calls.end', stub('calls.end'));
  fastify.post('/api/calls.info', stub('calls.info', { call: { id: 'R_STUB' } }));
  fastify.get('/api/calls.info', stub('calls.info', { call: { id: 'R_STUB' } }));
  fastify.post('/api/calls.update', stub('calls.update', { call: { id: 'R_STUB' } }));
  fastify.post('/api/calls.participants.add', stub('calls.participants.add'));
  fastify.post('/api/calls.participants.remove', stub('calls.participants.remove'));

  // ── team family ───────────────────────────────────────────────────
  fastify.post('/api/team.info', stub('team.info', { team: { id: 'T_TWIN', name: 'Twin Workspace' } }));
  fastify.get('/api/team.info', stub('team.info', { team: { id: 'T_TWIN', name: 'Twin Workspace' } }));
  fastify.post('/api/team.accessLogs', stub('team.accessLogs', { logins: [] }));
  fastify.get('/api/team.accessLogs', stub('team.accessLogs', { logins: [] }));
  fastify.post('/api/team.billableInfo', stub('team.billableInfo', { billable_info: {} }));
  fastify.get('/api/team.billableInfo', stub('team.billableInfo', { billable_info: {} }));
  fastify.post('/api/team.integrationLogs', stub('team.integrationLogs', { logs: [] }));
  fastify.get('/api/team.integrationLogs', stub('team.integrationLogs', { logs: [] }));
  fastify.post('/api/team.preferences.list', stub('team.preferences.list', { allow_message_deletion: false }));
  fastify.get('/api/team.preferences.list', stub('team.preferences.list', { allow_message_deletion: false }));
  fastify.post('/api/team.profile.get', stub('team.profile.get', { profile: { fields: [] } }));
  fastify.get('/api/team.profile.get', stub('team.profile.get', { profile: { fields: [] } }));

  // ── dialog / functions / assistant / workflows / apps (non-OAuth) ─
  fastify.post('/api/dialog.open', stub('dialog.open'));
  fastify.post('/api/functions.completeSuccess', stub('functions.completeSuccess'));
  fastify.post('/api/functions.completeError', stub('functions.completeError'));
  fastify.post('/api/assistant.threads.setStatus', stub('assistant.threads.setStatus'));
  fastify.post('/api/assistant.threads.setSuggestedPrompts', stub('assistant.threads.setSuggestedPrompts'));
  fastify.post('/api/assistant.threads.setTitle', stub('assistant.threads.setTitle'));

  // ── auth additional ───────────────────────────────────────────────
  // auth.revoke and auth.teams.list are Tier 1 in rate-limiter but can be stubs
  // (no state changes needed for conformance)
  fastify.post('/api/auth.revoke', stub('auth.revoke', { revoked: true }));
  fastify.post('/api/auth.teams.list', stub('auth.teams.list', { teams: [] }));
  fastify.get('/api/auth.teams.list', stub('auth.teams.list', { teams: [] }));

  // ── Socket Mode ───────────────────────────────────────────────────
  // apps.connections.open returns a dynamic wss URL seeded via POST /admin/set-wss-url.
  // Cannot use the generic stub() helper because the response body is dynamic.
  // Only xapp- app tokens are accepted — bot and user tokens return invalid_auth even
  // if they have connections:write scope.
  fastify.post('/api/apps.connections.open', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.send({ ok: false, error: 'not_authed' });
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
    // Require app token: must be stored with token_type === 'app' AND prefixed with xapp-
    if (tokenRecord.token_type !== 'app' || !token.startsWith('xapp-')) {
      return reply.send({ ok: false, error: 'invalid_auth' });
    }
    // SLCK-18: scope enforcement
    const scopeCheck = checkScope('apps.connections.open', tokenRecord.scope);
    if (scopeCheck) return reply.status(200).send({ ok: false, ...scopeCheck });
    // SLCK-19: scope headers
    reply.header('X-OAuth-Scopes', tokenRecord.scope);
    reply.header('X-Accepted-OAuth-Scopes', METHOD_SCOPES['apps.connections.open']?.join(',') ?? '');
    const wssUrl = fastify.slackStateManager.getWssUrl();
    if (!wssUrl) return reply.send({ ok: false, error: 'no_wss_url_configured' });
    return reply.send({ ok: true, url: wssUrl });
  });
};

export default stubsPlugin;
export { stubsPlugin };
