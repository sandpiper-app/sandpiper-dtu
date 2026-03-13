/**
 * Phase 25 SLCK-14: admin.* method stubs — 97 routes
 *
 * All admin.* WebClient methods from @slack/web-api@7.14.1 manifest.
 * High-value sub-families return semantically shaped responses;
 * remaining families return { ok: true, response_metadata: { next_cursor: '' } }.
 */
import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';

declare module 'fastify' {
  interface FastifyInstance { slackStateManager: SlackStateManager; }
}

const adminWebApiPlugin: FastifyPluginAsync = async (fastify) => {
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

  // ── admin.users.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.users.list', stub('admin.users.list', { members: [] }));
  fastify.post('/api/admin.users.invite', stub('admin.users.invite', { user: { id: 'U_STUB', email: '' } }));
  fastify.post('/api/admin.users.assign', stub('admin.users.assign', { user: { id: 'U_STUB' } }));
  fastify.post('/api/admin.users.remove', stub('admin.users.remove'));
  fastify.post('/api/admin.users.setAdmin', stub('admin.users.setAdmin'));
  fastify.post('/api/admin.users.setExpiration', stub('admin.users.setExpiration'));
  fastify.post('/api/admin.users.setOwner', stub('admin.users.setOwner'));
  fastify.post('/api/admin.users.setRegular', stub('admin.users.setRegular'));
  fastify.post('/api/admin.users.unsupportedVersions.export', stub('admin.users.unsupportedVersions.export'));
  fastify.post('/api/admin.users.session.clearSettings', stub('admin.users.session.clearSettings'));
  fastify.post('/api/admin.users.session.getSettings', stub('admin.users.session.getSettings', { session_settings: {} }));
  fastify.post('/api/admin.users.session.invalidate', stub('admin.users.session.invalidate'));
  fastify.post('/api/admin.users.session.list', stub('admin.users.session.list', { active_sessions: [], paginate_cursor: '' }));
  fastify.post('/api/admin.users.session.reset', stub('admin.users.session.reset'));
  fastify.post('/api/admin.users.session.resetBulk', stub('admin.users.session.resetBulk'));
  fastify.post('/api/admin.users.session.setSettings', stub('admin.users.session.setSettings'));

  // ── admin.conversations.* ─────────────────────────────────────────
  fastify.post('/api/admin.conversations.archive', stub('admin.conversations.archive'));
  fastify.post('/api/admin.conversations.bulkArchive', stub('admin.conversations.bulkArchive', { channel_ids: [], failed_channels: [] }));
  fastify.post('/api/admin.conversations.bulkDelete', stub('admin.conversations.bulkDelete', { channel_ids: [], failed_channels: [] }));
  fastify.post('/api/admin.conversations.bulkMove', stub('admin.conversations.bulkMove', { channel_ids: [], failed_channels: [] }));
  fastify.post('/api/admin.conversations.convertToPrivate', stub('admin.conversations.convertToPrivate'));
  fastify.post('/api/admin.conversations.convertToPublic', stub('admin.conversations.convertToPublic'));
  fastify.post('/api/admin.conversations.create', stub('admin.conversations.create', { channel_id: 'C_STUB' }));
  fastify.post('/api/admin.conversations.delete', stub('admin.conversations.delete'));
  fastify.post('/api/admin.conversations.disconnectShared', stub('admin.conversations.disconnectShared'));
  fastify.post('/api/admin.conversations.ekm.listOriginalConnectedChannelInfo', stub('admin.conversations.ekm.listOriginalConnectedChannelInfo', { channels: [] }));
  fastify.post('/api/admin.conversations.getConversationPrefs', stub('admin.conversations.getConversationPrefs', { prefs: {} }));
  fastify.post('/api/admin.conversations.getCustomRetention', stub('admin.conversations.getCustomRetention', { duration: 0 }));
  fastify.post('/api/admin.conversations.getTeams', stub('admin.conversations.getTeams', { teams: [] }));
  fastify.post('/api/admin.conversations.invite', stub('admin.conversations.invite'));
  fastify.post('/api/admin.conversations.lookup', stub('admin.conversations.lookup', { results: [] }));
  fastify.post('/api/admin.conversations.removeCustomRetention', stub('admin.conversations.removeCustomRetention'));
  fastify.post('/api/admin.conversations.rename', stub('admin.conversations.rename'));
  fastify.post('/api/admin.conversations.restrictAccess.addGroup', stub('admin.conversations.restrictAccess.addGroup'));
  fastify.post('/api/admin.conversations.restrictAccess.listGroups', stub('admin.conversations.restrictAccess.listGroups', { group_ids: [] }));
  fastify.post('/api/admin.conversations.restrictAccess.removeGroup', stub('admin.conversations.restrictAccess.removeGroup'));
  fastify.post('/api/admin.conversations.search', stub('admin.conversations.search', { conversations: [] }));
  fastify.post('/api/admin.conversations.setConversationPrefs', stub('admin.conversations.setConversationPrefs'));
  fastify.post('/api/admin.conversations.setCustomRetention', stub('admin.conversations.setCustomRetention'));
  fastify.post('/api/admin.conversations.setTeams', stub('admin.conversations.setTeams'));
  fastify.post('/api/admin.conversations.unarchive', stub('admin.conversations.unarchive'));

  // ── admin.teams.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.teams.admins.list', stub('admin.teams.admins.list', { admin_ids: [] }));
  fastify.post('/api/admin.teams.create', stub('admin.teams.create', { team: { id: 'T_STUB', name: 'stub' } }));
  fastify.post('/api/admin.teams.list', stub('admin.teams.list', { teams: [] }));
  fastify.post('/api/admin.teams.owners.list', stub('admin.teams.owners.list', { owner_ids: [] }));
  fastify.post('/api/admin.teams.settings.info', stub('admin.teams.settings.info', { team: { id: 'T_STUB' } }));
  fastify.post('/api/admin.teams.settings.setDefaultChannels', stub('admin.teams.settings.setDefaultChannels'));
  fastify.post('/api/admin.teams.settings.setDescription', stub('admin.teams.settings.setDescription'));
  fastify.post('/api/admin.teams.settings.setDiscoverability', stub('admin.teams.settings.setDiscoverability'));
  fastify.post('/api/admin.teams.settings.setIcon', stub('admin.teams.settings.setIcon'));
  fastify.post('/api/admin.teams.settings.setName', stub('admin.teams.settings.setName'));

  // ── admin.apps.* ──────────────────────────────────────────────────
  fastify.post('/api/admin.apps.activities.list', stub('admin.apps.activities.list', { activities: [] }));
  fastify.post('/api/admin.apps.approve', stub('admin.apps.approve'));
  fastify.post('/api/admin.apps.approved.list', stub('admin.apps.approved.list', { approved_apps: [] }));
  fastify.post('/api/admin.apps.clearResolution', stub('admin.apps.clearResolution'));
  fastify.post('/api/admin.apps.config.lookup', stub('admin.apps.config.lookup', { app_configs: [] }));
  fastify.post('/api/admin.apps.config.set', stub('admin.apps.config.set'));
  fastify.post('/api/admin.apps.requests.cancel', stub('admin.apps.requests.cancel'));
  fastify.post('/api/admin.apps.requests.list', stub('admin.apps.requests.list', { app_requests: [] }));
  fastify.post('/api/admin.apps.restrict', stub('admin.apps.restrict'));
  fastify.post('/api/admin.apps.restricted.list', stub('admin.apps.restricted.list', { restricted_apps: [] }));
  fastify.post('/api/admin.apps.uninstall', stub('admin.apps.uninstall'));

  // ── admin.barriers.* ──────────────────────────────────────────────
  fastify.post('/api/admin.barriers.create', stub('admin.barriers.create'));
  fastify.post('/api/admin.barriers.delete', stub('admin.barriers.delete'));
  fastify.post('/api/admin.barriers.list', stub('admin.barriers.list', { barriers: [] }));
  fastify.post('/api/admin.barriers.update', stub('admin.barriers.update'));

  // ── admin.emoji.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.emoji.add', stub('admin.emoji.add'));
  fastify.post('/api/admin.emoji.addAlias', stub('admin.emoji.addAlias'));
  fastify.post('/api/admin.emoji.list', stub('admin.emoji.list', { emoji: [] }));
  fastify.post('/api/admin.emoji.remove', stub('admin.emoji.remove'));
  fastify.post('/api/admin.emoji.rename', stub('admin.emoji.rename'));

  // ── admin.functions.* ─────────────────────────────────────────────
  fastify.post('/api/admin.functions.list', stub('admin.functions.list', { functions: [] }));
  fastify.post('/api/admin.functions.permissions.lookup', stub('admin.functions.permissions.lookup', { permissions: {} }));
  fastify.post('/api/admin.functions.permissions.set', stub('admin.functions.permissions.set'));

  // ── admin.inviteRequests.* ────────────────────────────────────────
  fastify.post('/api/admin.inviteRequests.approve', stub('admin.inviteRequests.approve'));
  fastify.post('/api/admin.inviteRequests.deny', stub('admin.inviteRequests.deny'));
  fastify.post('/api/admin.inviteRequests.list', stub('admin.inviteRequests.list', { invite_requests: [] }));
  fastify.post('/api/admin.inviteRequests.approved.list', stub('admin.inviteRequests.approved.list', { invite_requests: [] }));
  fastify.post('/api/admin.inviteRequests.denied.list', stub('admin.inviteRequests.denied.list', { invite_requests: [] }));

  // ── admin.roles.* ─────────────────────────────────────────────────
  fastify.post('/api/admin.roles.addAssignments', stub('admin.roles.addAssignments'));
  fastify.post('/api/admin.roles.listAssignments', stub('admin.roles.listAssignments', { role_assignments: [] }));
  fastify.post('/api/admin.roles.removeAssignments', stub('admin.roles.removeAssignments'));

  // ── admin.usergroups.* ────────────────────────────────────────────
  fastify.post('/api/admin.usergroups.addChannels', stub('admin.usergroups.addChannels'));
  fastify.post('/api/admin.usergroups.addTeams', stub('admin.usergroups.addTeams'));
  fastify.post('/api/admin.usergroups.listChannels', stub('admin.usergroups.listChannels', { channels: [] }));
  fastify.post('/api/admin.usergroups.removeChannels', stub('admin.usergroups.removeChannels'));

  // ── admin.auth.* ──────────────────────────────────────────────────
  fastify.post('/api/admin.auth.policy.assignEntities', stub('admin.auth.policy.assignEntities'));
  fastify.post('/api/admin.auth.policy.getEntities', stub('admin.auth.policy.getEntities', { entities: [] }));
  fastify.post('/api/admin.auth.policy.removeEntities', stub('admin.auth.policy.removeEntities'));

  // ── admin.workflows.* ─────────────────────────────────────────────
  fastify.post('/api/admin.workflows.collaborators.add', stub('admin.workflows.collaborators.add'));
  fastify.post('/api/admin.workflows.collaborators.remove', stub('admin.workflows.collaborators.remove'));
  fastify.post('/api/admin.workflows.permissions.lookup', stub('admin.workflows.permissions.lookup', { permissions: {} }));
  fastify.post('/api/admin.workflows.unpublish', stub('admin.workflows.unpublish'));

  // ── admin.analytics.* ─────────────────────────────────────────────
  fastify.post('/api/admin.analytics.getFile', stub('admin.analytics.getFile', { data: [] }));
};

export default adminWebApiPlugin;
export { adminWebApiPlugin };
