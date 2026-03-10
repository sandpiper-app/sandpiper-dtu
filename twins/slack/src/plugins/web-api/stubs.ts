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
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const stubsPlugin: FastifyPluginAsync = async (fastify) => {
  // Auth-gated stub: returns { ok: true, ...extra } after token check
  function stub(extra: Record<string, unknown> = {}) {
    return async (request: any, reply: any) => {
      const token = extractToken(request);
      if (!token) return reply.send({ ok: false, error: 'not_authed' });
      const tokenRecord = fastify.slackStateManager.getToken(token);
      if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
      return { ok: true, response_metadata: { next_cursor: '' }, ...extra };
    };
  }

  // ── files family ──────────────────────────────────────────────────
  fastify.post('/api/files.delete', stub());
  fastify.post('/api/files.info', stub({ file: { id: 'F_STUB', name: 'stub.txt' } }));
  fastify.get('/api/files.info', stub({ file: { id: 'F_STUB', name: 'stub.txt' } }));
  fastify.post('/api/files.list', stub({ files: [] }));
  fastify.get('/api/files.list', stub({ files: [] }));
  fastify.post('/api/files.revokePublicURL', stub());
  fastify.post('/api/files.sharedPublicURL', stub());
  fastify.post('/api/files.comments.delete', stub());
  fastify.post('/api/files.remote.add', stub());
  fastify.post('/api/files.remote.info', stub({ file: {} }));
  fastify.post('/api/files.remote.list', stub({ files: [] }));
  fastify.post('/api/files.remote.remove', stub());
  fastify.post('/api/files.remote.share', stub());
  fastify.post('/api/files.remote.update', stub());

  // ── search family ─────────────────────────────────────────────────
  fastify.post('/api/search.all', stub({ messages: { matches: [], total: 0, pagination: {} }, files: { matches: [], total: 0 } }));
  fastify.get('/api/search.all', stub({ messages: { matches: [], total: 0, pagination: {} }, files: { matches: [], total: 0 } }));
  fastify.post('/api/search.messages', stub({ messages: { matches: [], total: 0, pagination: {} } }));
  fastify.get('/api/search.messages', stub({ messages: { matches: [], total: 0, pagination: {} } }));
  fastify.post('/api/search.files', stub({ files: { matches: [], total: 0 } }));
  fastify.get('/api/search.files', stub({ files: { matches: [], total: 0 } }));

  // ── reminders family ──────────────────────────────────────────────
  fastify.post('/api/reminders.add', stub({ reminder: { id: 'Rm_STUB', text: '', time: 0, complete_ts: 0 } }));
  fastify.post('/api/reminders.complete', stub());
  fastify.post('/api/reminders.delete', stub());
  fastify.post('/api/reminders.info', stub({ reminder: { id: 'Rm_STUB' } }));
  fastify.get('/api/reminders.info', stub({ reminder: { id: 'Rm_STUB' } }));
  fastify.post('/api/reminders.list', stub({ reminders: [] }));
  fastify.get('/api/reminders.list', stub({ reminders: [] }));

  // ── bots / emoji / migration / tooling ───────────────────────────
  fastify.post('/api/bots.info', stub({ bot: { id: 'B_BOT_TWIN', name: 'twin-bot' } }));
  fastify.get('/api/bots.info', stub({ bot: { id: 'B_BOT_TWIN', name: 'twin-bot' } }));
  fastify.post('/api/emoji.list', stub({ emoji: {} }));
  fastify.get('/api/emoji.list', stub({ emoji: {} }));
  fastify.post('/api/migration.exchange', stub({ token_map: {} }));
  fastify.post('/api/tooling.tokens.rotate', stub({ token: 'xoxb-rotated', refresh_token: 'xoxe-refresh' }));

  // ── dnd family ────────────────────────────────────────────────────
  fastify.post('/api/dnd.endDnd', stub());
  fastify.post('/api/dnd.endSnooze', stub({ dnd_status: {} }));
  fastify.post('/api/dnd.info', stub({ dnd_enabled: false }));
  fastify.get('/api/dnd.info', stub({ dnd_enabled: false }));
  fastify.post('/api/dnd.setSnooze', stub({ snooze_enabled: true }));
  fastify.post('/api/dnd.teamInfo', stub({ users: {} }));
  fastify.get('/api/dnd.teamInfo', stub({ users: {} }));

  // ── bookmarks family ──────────────────────────────────────────────
  fastify.post('/api/bookmarks.add', stub({ bookmark: { id: 'Bk_STUB' } }));
  fastify.post('/api/bookmarks.edit', stub({ bookmark: { id: 'Bk_STUB' } }));
  fastify.post('/api/bookmarks.list', stub({ bookmarks: [] }));
  fastify.get('/api/bookmarks.list', stub({ bookmarks: [] }));
  fastify.post('/api/bookmarks.remove', stub());

  // ── usergroups family ─────────────────────────────────────────────
  fastify.post('/api/usergroups.create', stub({ usergroup: { id: 'S_STUB', name: 'stub' } }));
  fastify.post('/api/usergroups.disable', stub({ usergroup: { id: 'S_STUB' } }));
  fastify.post('/api/usergroups.enable', stub({ usergroup: { id: 'S_STUB' } }));
  fastify.post('/api/usergroups.list', stub({ usergroups: [] }));
  fastify.get('/api/usergroups.list', stub({ usergroups: [] }));
  fastify.post('/api/usergroups.update', stub({ usergroup: { id: 'S_STUB' } }));
  fastify.post('/api/usergroups.users.list', stub({ users: [] }));
  fastify.get('/api/usergroups.users.list', stub({ users: [] }));
  fastify.post('/api/usergroups.users.update', stub({ usergroup: { id: 'S_STUB' } }));

  // ── calls family ──────────────────────────────────────────────────
  fastify.post('/api/calls.add', stub({ call: { id: 'R_STUB' } }));
  fastify.post('/api/calls.end', stub());
  fastify.post('/api/calls.info', stub({ call: { id: 'R_STUB' } }));
  fastify.get('/api/calls.info', stub({ call: { id: 'R_STUB' } }));
  fastify.post('/api/calls.update', stub({ call: { id: 'R_STUB' } }));
  fastify.post('/api/calls.participants.add', stub());
  fastify.post('/api/calls.participants.remove', stub());

  // ── team family ───────────────────────────────────────────────────
  fastify.post('/api/team.info', stub({ team: { id: 'T_TWIN', name: 'Twin Workspace' } }));
  fastify.get('/api/team.info', stub({ team: { id: 'T_TWIN', name: 'Twin Workspace' } }));
  fastify.post('/api/team.accessLogs', stub({ logins: [] }));
  fastify.get('/api/team.accessLogs', stub({ logins: [] }));
  fastify.post('/api/team.billableInfo', stub({ billable_info: {} }));
  fastify.get('/api/team.billableInfo', stub({ billable_info: {} }));
  fastify.post('/api/team.integrationLogs', stub({ logs: [] }));
  fastify.get('/api/team.integrationLogs', stub({ logs: [] }));
  fastify.post('/api/team.preferences.list', stub({ allow_message_deletion: false }));
  fastify.get('/api/team.preferences.list', stub({ allow_message_deletion: false }));
  fastify.post('/api/team.profile.get', stub({ profile: { fields: [] } }));
  fastify.get('/api/team.profile.get', stub({ profile: { fields: [] } }));

  // ── dialog / functions / assistant / workflows / apps (non-OAuth) ─
  fastify.post('/api/dialog.open', stub());
  fastify.post('/api/functions.completeSuccess', stub());
  fastify.post('/api/functions.completeError', stub());
  fastify.post('/api/assistant.threads.setStatus', stub());
  fastify.post('/api/assistant.threads.setSuggestedPrompts', stub());
  fastify.post('/api/assistant.threads.setTitle', stub());

  // ── auth additional ───────────────────────────────────────────────
  // auth.revoke and auth.teams.list are Tier 1 in rate-limiter but can be stubs
  // (no state changes needed for conformance)
  fastify.post('/api/auth.revoke', stub({ revoked: true }));
  fastify.post('/api/auth.teams.list', stub({ teams: [] }));
  fastify.get('/api/auth.teams.list', stub({ teams: [] }));

  // ── Socket Mode ───────────────────────────────────────────────────
  // apps.connections.open returns a dynamic wss URL seeded via POST /admin/set-wss-url.
  // Cannot use the generic stub() helper because the response body is dynamic.
  fastify.post('/api/apps.connections.open', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.send({ ok: false, error: 'not_authed' });
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
    const wssUrl = fastify.slackStateManager.getWssUrl();
    if (!wssUrl) return reply.send({ ok: false, error: 'no_wss_url_configured' });
    return reply.send({ ok: true, url: wssUrl });
  });
};

export default stubsPlugin;
export { stubsPlugin };
