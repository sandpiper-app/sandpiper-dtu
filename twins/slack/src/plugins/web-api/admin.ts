/**
 * Phase 25 SLCK-14: admin.* method stubs — 97 routes
 *
 * All admin.* WebClient methods from @slack/web-api@7.14.1 manifest.
 * High-value sub-families return semantically shaped responses;
 * remaining families return { ok: true, response_metadata: { next_cursor: '' } }.
 */
import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const adminWebApiPlugin: FastifyPluginAsync = async (fastify) => {
  function stub(extra: Record<string, unknown> = {}) {
    return async (request: any, reply: any) => {
      const token = extractToken(request);
      if (!token) return reply.send({ ok: false, error: 'not_authed' });
      const tokenRecord = fastify.slackStateManager.getToken(token);
      if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
      return { ok: true, response_metadata: { next_cursor: '' }, ...extra };
    };
  }

  // ── admin.users.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.users.list', stub({ members: [] }));
  fastify.post('/api/admin.users.invite', stub({ user: { id: 'U_STUB', email: '' } }));
  fastify.post('/api/admin.users.assign', stub({ user: { id: 'U_STUB' } }));
  fastify.post('/api/admin.users.remove', stub());
  fastify.post('/api/admin.users.setAdmin', stub());
  fastify.post('/api/admin.users.setExpiration', stub());
  fastify.post('/api/admin.users.setOwner', stub());
  fastify.post('/api/admin.users.setRegular', stub());
  fastify.post('/api/admin.users.unsupportedVersions.export', stub());
  fastify.post('/api/admin.users.session.clearSettings', stub());
  fastify.post('/api/admin.users.session.getSettings', stub({ session_settings: {} }));
  fastify.post('/api/admin.users.session.invalidate', stub());
  fastify.post('/api/admin.users.session.list', stub({ active_sessions: [], paginate_cursor: '' }));
  fastify.post('/api/admin.users.session.reset', stub());
  fastify.post('/api/admin.users.session.resetBulk', stub());
  fastify.post('/api/admin.users.session.setSettings', stub());

  // ── admin.conversations.* ─────────────────────────────────────────
  fastify.post('/api/admin.conversations.archive', stub());
  fastify.post('/api/admin.conversations.bulkArchive', stub({ channel_ids: [], failed_channels: [] }));
  fastify.post('/api/admin.conversations.bulkDelete', stub({ channel_ids: [], failed_channels: [] }));
  fastify.post('/api/admin.conversations.bulkMove', stub({ channel_ids: [], failed_channels: [] }));
  fastify.post('/api/admin.conversations.convertToPrivate', stub());
  fastify.post('/api/admin.conversations.convertToPublic', stub());
  fastify.post('/api/admin.conversations.create', stub({ channel_id: 'C_STUB' }));
  fastify.post('/api/admin.conversations.delete', stub());
  fastify.post('/api/admin.conversations.disconnectShared', stub());
  fastify.post('/api/admin.conversations.ekm.listOriginalConnectedChannelInfo', stub({ channels: [] }));
  fastify.post('/api/admin.conversations.getConversationPrefs', stub({ prefs: {} }));
  fastify.post('/api/admin.conversations.getCustomRetention', stub({ duration: 0 }));
  fastify.post('/api/admin.conversations.getTeams', stub({ teams: [] }));
  fastify.post('/api/admin.conversations.invite', stub());
  fastify.post('/api/admin.conversations.lookup', stub({ results: [] }));
  fastify.post('/api/admin.conversations.removeCustomRetention', stub());
  fastify.post('/api/admin.conversations.rename', stub());
  fastify.post('/api/admin.conversations.restrictAccess.addGroup', stub());
  fastify.post('/api/admin.conversations.restrictAccess.listGroups', stub({ group_ids: [] }));
  fastify.post('/api/admin.conversations.restrictAccess.removeGroup', stub());
  fastify.post('/api/admin.conversations.search', stub({ conversations: [] }));
  fastify.post('/api/admin.conversations.setConversationPrefs', stub());
  fastify.post('/api/admin.conversations.setCustomRetention', stub());
  fastify.post('/api/admin.conversations.setTeams', stub());
  fastify.post('/api/admin.conversations.unarchive', stub());

  // ── admin.teams.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.teams.admins.list', stub({ admin_ids: [] }));
  fastify.post('/api/admin.teams.create', stub({ team: { id: 'T_STUB', name: 'stub' } }));
  fastify.post('/api/admin.teams.list', stub({ teams: [] }));
  fastify.post('/api/admin.teams.owners.list', stub({ owner_ids: [] }));
  fastify.post('/api/admin.teams.settings.info', stub({ team: { id: 'T_STUB' } }));
  fastify.post('/api/admin.teams.settings.setDefaultChannels', stub());
  fastify.post('/api/admin.teams.settings.setDescription', stub());
  fastify.post('/api/admin.teams.settings.setDiscoverability', stub());
  fastify.post('/api/admin.teams.settings.setIcon', stub());
  fastify.post('/api/admin.teams.settings.setName', stub());

  // ── admin.apps.* ──────────────────────────────────────────────────
  fastify.post('/api/admin.apps.activities.list', stub({ activities: [] }));
  fastify.post('/api/admin.apps.approve', stub());
  fastify.post('/api/admin.apps.approved.list', stub({ approved_apps: [] }));
  fastify.post('/api/admin.apps.clearResolution', stub());
  fastify.post('/api/admin.apps.config.lookup', stub({ app_configs: [] }));
  fastify.post('/api/admin.apps.config.set', stub());
  fastify.post('/api/admin.apps.requests.cancel', stub());
  fastify.post('/api/admin.apps.requests.list', stub({ app_requests: [] }));
  fastify.post('/api/admin.apps.restrict', stub());
  fastify.post('/api/admin.apps.restricted.list', stub({ restricted_apps: [] }));
  fastify.post('/api/admin.apps.uninstall', stub());

  // ── admin.barriers.* ──────────────────────────────────────────────
  fastify.post('/api/admin.barriers.create', stub());
  fastify.post('/api/admin.barriers.delete', stub());
  fastify.post('/api/admin.barriers.list', stub({ barriers: [] }));
  fastify.post('/api/admin.barriers.update', stub());

  // ── admin.emoji.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.emoji.add', stub());
  fastify.post('/api/admin.emoji.addAlias', stub());
  fastify.post('/api/admin.emoji.list', stub({ emoji: [] }));
  fastify.post('/api/admin.emoji.remove', stub());
  fastify.post('/api/admin.emoji.rename', stub());

  // ── admin.functions.* ─────────────────────────────────────────────
  fastify.post('/api/admin.functions.list', stub({ functions: [] }));
  fastify.post('/api/admin.functions.permissions.lookup', stub({ permissions: {} }));
  fastify.post('/api/admin.functions.permissions.set', stub());

  // ── admin.inviteRequests.* ────────────────────────────────────────
  fastify.post('/api/admin.inviteRequests.approve', stub());
  fastify.post('/api/admin.inviteRequests.deny', stub());
  fastify.post('/api/admin.inviteRequests.list', stub({ invite_requests: [] }));
  fastify.post('/api/admin.inviteRequests.approved.list', stub({ invite_requests: [] }));
  fastify.post('/api/admin.inviteRequests.denied.list', stub({ invite_requests: [] }));

  // ── admin.roles.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.roles.addAssignments', stub());
  fastify.post('/api/admin.roles.listAssignments', stub({ role_assignments: [] }));
  fastify.post('/api/admin.roles.removeAssignments', stub());

  // ── admin.usergroups.* ────────────────────────────────────────────
  fastify.post('/api/admin.usergroups.addChannels', stub());
  fastify.post('/api/admin.usergroups.addTeams', stub());
  fastify.post('/api/admin.usergroups.listChannels', stub({ channels: [] }));
  fastify.post('/api/admin.usergroups.removeChannels', stub());

  // ── admin.auth.* ──────────────────────────────────────────────────
  fastify.post('/api/admin.auth.policy.assignEntities', stub());
  fastify.post('/api/admin.auth.policy.getEntities', stub({ entities: [] }));
  fastify.post('/api/admin.auth.policy.removeEntities', stub());

  // ── admin.workflows.* ─────────────────────────────────────────────
  fastify.post('/api/admin.workflows.collaborators.add', stub());
  fastify.post('/api/admin.workflows.collaborators.remove', stub());
  fastify.post('/api/admin.workflows.permissions.lookup', stub({ permissions: {} }));
  fastify.post('/api/admin.workflows.unpublish', stub());

  // ── admin.analytics.* ─────────────────────────────────────────────
  fastify.post('/api/admin.analytics.getFile', stub({ data: [] }));
};

export default adminWebApiPlugin;
export { adminWebApiPlugin };
