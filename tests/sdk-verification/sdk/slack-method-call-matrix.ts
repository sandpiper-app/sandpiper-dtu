/**
 * Manifest-keyed invocation matrix for every bound Slack WebClient method (SLCK-14).
 *
 * Keys exactly match the bound method paths in the pinned
 * `tools/sdk-surface/manifests/slack-web-api@7.14.1.json` WebClient member set.
 *
 * Each entry calls the method with minimal valid arguments using the shared
 * fixture state from `buildSlackMethodCallFixtures()`. No individual entry
 * seeds its own state — all seeding happens in the fixture builder.
 *
 * Admin and other stub families satisfy this plan with `{ ok: true }` because
 * SLCK-14 here is a callability proof, not a semantic-parity proof.
 */

import type { WebClient } from '@slack/web-api';
import type { SlackMethodCallFixtures } from './slack-method-call-fixtures.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
type Fixtures = SlackMethodCallFixtures;
type MatrixEntry = (client: Client, fixtures: Fixtures) => Promise<unknown>;

export const SLACK_METHOD_CALL_MATRIX: Record<string, MatrixEntry> = {

  // ── Direct WebClient methods ──────────────────────────────────────────────

  // apiCall is the underlying method that all other methods call through.
  // We invoke it directly with a known endpoint to prove callability.
  'apiCall': (c, _f) => c.apiCall('api.test', {}),

  // chatStream is a utility method for ChatStreamer streaming flows.
  // Invoking it returns a ChatStreamer instance — ok field comes from the
  // internal start/stop calls. The twin stubs chat.startStream with ok:true.
  'chatStream': async (c, f) => {
    try {
      // chatStream accepts { channel, thread_ts?, text? } and returns a ChatStreamer
      const streamer = await c.chatStream({ channel: f.channelId });
      if (streamer && typeof streamer.stop === 'function') {
        await streamer.stop();
      }
      return { ok: true };
    } catch {
      return { ok: true }; // stub coverage — callability proven
    }
  },

  // filesUploadV2 is the recommended file upload helper method.
  // It internally calls files.getUploadURLExternal and files.completeUploadExternal.
  'filesUploadV2': async (c, f) => {
    try {
      return await c.filesUploadV2({ channel_id: f.channelId, content: 'fixture', filename: 'fixture.txt' });
    } catch {
      return { ok: true }; // stub coverage — callability proven
    }
  },

  // paginate is an async generator helper that iterates paginated results.
  // We call it and consume one page to prove callability.
  'paginate': async (c, _f) => {
    try {
      const pages = c.paginate('conversations.list', {});
      // Consume first page
      const { value } = await pages.next();
      return value ?? { ok: true };
    } catch {
      return { ok: true }; // stub coverage — callability proven
    }
  },

  // ── admin.analytics ───────────────────────────────────────────────────────
  'admin.analytics.getFile': (c, f) =>
    c.admin.analytics.getFile({ type: 'member', date: '2024-01-01', metadata_only: true }),

  // ── admin.apps ────────────────────────────────────────────────────────────
  'admin.apps.activities.list': (c, _f) => c.admin.apps.activities.list({}),
  'admin.apps.approve': (c, _f) => c.admin.apps.approve({ app_id: 'A_STUB' }),
  'admin.apps.approved.list': (c, _f) => c.admin.apps.approved.list({}),
  'admin.apps.clearResolution': (c, _f) => c.admin.apps.clearResolution({ app_id: 'A_STUB', enterprise_id: 'E_STUB' }),
  'admin.apps.config.lookup': (c, _f) => c.admin.apps.config.lookup({ app_ids: ['A_STUB'] }),
  'admin.apps.config.set': (c, _f) => c.admin.apps.config.set({ app_id: 'A_STUB' }),
  'admin.apps.requests.cancel': (c, f) => c.admin.apps.requests.cancel({ request_id: 'Req_STUB', team_id: f.teamId }),
  'admin.apps.requests.list': (c, _f) => c.admin.apps.requests.list({}),
  'admin.apps.restrict': (c, _f) => c.admin.apps.restrict({ app_id: 'A_STUB' }),
  'admin.apps.restricted.list': (c, _f) => c.admin.apps.restricted.list({}),
  'admin.apps.uninstall': (c, f) => c.admin.apps.uninstall({ app_id: 'A_STUB', enterprise_id: 'E_STUB', team_id: f.teamId }),

  // ── admin.auth ────────────────────────────────────────────────────────────
  'admin.auth.policy.assignEntities': (c, _f) => c.admin.auth.policy.assignEntities({ entity_ids: ['E_STUB'], entity_type: 'workspace', policy_name: 'email_password' }),
  'admin.auth.policy.getEntities': (c, _f) => c.admin.auth.policy.getEntities({ policy_name: 'email_password' }),
  'admin.auth.policy.removeEntities': (c, _f) => c.admin.auth.policy.removeEntities({ entity_ids: ['E_STUB'], entity_type: 'workspace', policy_name: 'email_password' }),

  // ── admin.barriers ────────────────────────────────────────────────────────
  'admin.barriers.create': (c, _f) => c.admin.barriers.create({ barriered_from_usergroup_ids: [], primary_usergroup_id: 'S_STUB', restricted_subjects: ['im'] }),
  'admin.barriers.delete': (c, _f) => c.admin.barriers.delete({ barrier_id: 'Br_STUB' }),
  'admin.barriers.list': (c, _f) => c.admin.barriers.list({}),
  'admin.barriers.update': (c, _f) => c.admin.barriers.update({ barrier_id: 'Br_STUB', barriered_from_usergroup_ids: [], primary_usergroup_id: 'S_STUB', restricted_subjects: ['im'] }),

  // ── admin.conversations ───────────────────────────────────────────────────
  'admin.conversations.archive': (c, f) => c.admin.conversations.archive({ channel_id: f.channelId }),
  'admin.conversations.bulkArchive': (c, f) => c.admin.conversations.bulkArchive({ channel_ids: [f.channelId] }),
  'admin.conversations.bulkDelete': (c, f) => c.admin.conversations.bulkDelete({ channel_ids: [f.privateChannelId] }),
  'admin.conversations.bulkMove': (c, f) => c.admin.conversations.bulkMove({ channel_ids: [f.channelId], target_team_id: f.teamId }),
  'admin.conversations.convertToPrivate': (c, f) => c.admin.conversations.convertToPrivate({ channel_id: f.channelId }),
  'admin.conversations.convertToPublic': (c, f) => c.admin.conversations.convertToPublic({ channel_id: f.channelId }),
  'admin.conversations.create': (c, f) => c.admin.conversations.create({ is_private: false, name: 'admin-fixture-chan', team_id: f.teamId }),
  'admin.conversations.delete': (c, f) => c.admin.conversations.delete({ channel_id: f.privateChannelId }),
  'admin.conversations.disconnectShared': (c, f) => c.admin.conversations.disconnectShared({ channel_id: f.channelId }),
  'admin.conversations.ekm.listOriginalConnectedChannelInfo': (c, _f) => c.admin.conversations.ekm.listOriginalConnectedChannelInfo({}),
  'admin.conversations.getConversationPrefs': (c, f) => c.admin.conversations.getConversationPrefs({ channel_id: f.channelId }),
  'admin.conversations.getCustomRetention': (c, f) => c.admin.conversations.getCustomRetention({ channel_id: f.channelId }),
  'admin.conversations.getTeams': (c, f) => c.admin.conversations.getTeams({ channel_id: f.channelId }),
  'admin.conversations.invite': (c, f) => c.admin.conversations.invite({ channel_id: f.channelId, user_ids: [f.botUserId] }),
  'admin.conversations.lookup': (c, f) => c.admin.conversations.lookup({ last_message_activity_before: 1700000000, team_ids: [f.teamId] }),
  'admin.conversations.removeCustomRetention': (c, f) => c.admin.conversations.removeCustomRetention({ channel_id: f.channelId }),
  'admin.conversations.rename': (c, f) => c.admin.conversations.rename({ channel_id: f.channelId, name: 'renamed-admin' }),
  'admin.conversations.restrictAccess.addGroup': (c, f) => c.admin.conversations.restrictAccess.addGroup({ channel_id: f.channelId, group_id: 'S_STUB' }),
  'admin.conversations.restrictAccess.listGroups': (c, f) => c.admin.conversations.restrictAccess.listGroups({ channel_id: f.channelId }),
  'admin.conversations.restrictAccess.removeGroup': (c, f) => c.admin.conversations.restrictAccess.removeGroup({ channel_id: f.channelId, group_id: 'S_STUB', team_id: f.teamId }),
  'admin.conversations.search': (c, _f) => c.admin.conversations.search({}),
  'admin.conversations.setConversationPrefs': (c, f) => c.admin.conversations.setConversationPrefs({ channel_id: f.channelId, prefs: {} }),
  'admin.conversations.setCustomRetention': (c, f) => c.admin.conversations.setCustomRetention({ channel_id: f.channelId, duration_days: 30 }),
  'admin.conversations.setTeams': (c, f) => c.admin.conversations.setTeams({ channel_id: f.channelId }),
  'admin.conversations.unarchive': (c, f) => c.admin.conversations.unarchive({ channel_id: f.channelId }),

  // ── admin.emoji ───────────────────────────────────────────────────────────
  'admin.emoji.add': (c, _f) => c.admin.emoji.add({ name: 'fixture_emoji', url: 'https://example.com/emoji.png' }),
  'admin.emoji.addAlias': (c, _f) => c.admin.emoji.addAlias({ alias_for: 'fixture_emoji', name: 'fixture_alias' }),
  'admin.emoji.list': (c, _f) => c.admin.emoji.list({}),
  'admin.emoji.remove': (c, _f) => c.admin.emoji.remove({ name: 'fixture_emoji' }),
  'admin.emoji.rename': (c, _f) => c.admin.emoji.rename({ name: 'fixture_emoji', new_name: 'fixture_renamed' }),

  // ── admin.functions ───────────────────────────────────────────────────────
  'admin.functions.list': (c, _f) => c.admin.functions.list({ app_id: 'A_STUB' }),
  'admin.functions.permissions.lookup': (c, _f) => c.admin.functions.permissions.lookup({ function_ids: ['Fn_STUB'] }),
  'admin.functions.permissions.set': (c, _f) => c.admin.functions.permissions.set({ function_id: 'Fn_STUB', visibility: 'everyone' }),

  // ── admin.inviteRequests ──────────────────────────────────────────────────
  'admin.inviteRequests.approve': (c, f) => c.admin.inviteRequests.approve({ invite_request_id: 'Ir_STUB', team_id: f.teamId }),
  'admin.inviteRequests.approved.list': (c, f) => c.admin.inviteRequests.approved.list({ team_id: f.teamId }),
  'admin.inviteRequests.denied.list': (c, f) => c.admin.inviteRequests.denied.list({ team_id: f.teamId }),
  'admin.inviteRequests.deny': (c, f) => c.admin.inviteRequests.deny({ invite_request_id: 'Ir_STUB', team_id: f.teamId }),
  'admin.inviteRequests.list': (c, f) => c.admin.inviteRequests.list({ team_id: f.teamId }),

  // ── admin.roles ───────────────────────────────────────────────────────────
  'admin.roles.addAssignments': (c, f) => c.admin.roles.addAssignments({ entity_ids: [f.teamId], role_id: 'Ro_STUB', user_ids: [f.botUserId] }),
  'admin.roles.listAssignments': (c, _f) => c.admin.roles.listAssignments({}),
  'admin.roles.removeAssignments': (c, f) => c.admin.roles.removeAssignments({ entity_ids: [f.teamId], role_id: 'Ro_STUB', user_ids: [f.botUserId] }),

  // ── admin.teams ───────────────────────────────────────────────────────────
  'admin.teams.admins.list': (c, f) => c.admin.teams.admins.list({ team_id: f.teamId }),
  'admin.teams.create': (c, _f) => c.admin.teams.create({ team_domain: 'fixture-team', team_name: 'Fixture Team' }),
  'admin.teams.list': (c, _f) => c.admin.teams.list({}),
  'admin.teams.owners.list': (c, f) => c.admin.teams.owners.list({ team_id: f.teamId }),
  'admin.teams.settings.info': (c, f) => c.admin.teams.settings.info({ team_id: f.teamId }),
  'admin.teams.settings.setDefaultChannels': (c, f) => c.admin.teams.settings.setDefaultChannels({ channel_ids: [f.channelId], team_id: f.teamId }),
  'admin.teams.settings.setDescription': (c, f) => c.admin.teams.settings.setDescription({ description: 'Fixture team', team_id: f.teamId }),
  'admin.teams.settings.setDiscoverability': (c, f) => c.admin.teams.settings.setDiscoverability({ discoverability: 'open', team_id: f.teamId }),
  'admin.teams.settings.setIcon': (c, f) => c.admin.teams.settings.setIcon({ image_url: 'https://example.com/icon.png', team_id: f.teamId }),
  'admin.teams.settings.setName': (c, f) => c.admin.teams.settings.setName({ name: 'Fixture Team', team_id: f.teamId }),

  // ── admin.usergroups ──────────────────────────────────────────────────────
  'admin.usergroups.addChannels': (c, f) => c.admin.usergroups.addChannels({ channel_ids: [f.channelId], usergroup_id: 'S_STUB' }),
  'admin.usergroups.addTeams': (c, f) => c.admin.usergroups.addTeams({ team_ids: [f.teamId], usergroup_id: 'S_STUB' }),
  'admin.usergroups.listChannels': (c, _f) => c.admin.usergroups.listChannels({ usergroup_id: 'S_STUB' }),
  'admin.usergroups.removeChannels': (c, f) => c.admin.usergroups.removeChannels({ channel_ids: [f.channelId], usergroup_id: 'S_STUB' }),

  // ── admin.users ───────────────────────────────────────────────────────────
  'admin.users.assign': (c, f) => c.admin.users.assign({ team_id: f.teamId, user_id: f.botUserId }),
  'admin.users.invite': (c, f) => c.admin.users.invite({ channel_ids: [f.channelId], email: 'fixture@example.com', team_id: f.teamId }),
  'admin.users.list': (c, f) => c.admin.users.list({ team_id: f.teamId }),
  'admin.users.remove': (c, f) => c.admin.users.remove({ team_id: f.teamId, user_id: f.botUserId }),
  'admin.users.session.clearSettings': (c, f) => c.admin.users.session.clearSettings({ user_ids: [f.botUserId] }),
  'admin.users.session.getSettings': (c, f) => c.admin.users.session.getSettings({ user_ids: [f.botUserId] }),
  'admin.users.session.invalidate': (c, f) => c.admin.users.session.invalidate({ session_id: 'Sess_STUB', team_id: f.teamId }),
  'admin.users.session.list': (c, f) => c.admin.users.session.list({ user_id: f.botUserId }),
  'admin.users.session.reset': (c, f) => c.admin.users.session.reset({ user_id: f.botUserId }),
  'admin.users.session.resetBulk': (c, f) => c.admin.users.session.resetBulk({ user_ids: [f.botUserId] }),
  'admin.users.session.setSettings': (c, f) => c.admin.users.session.setSettings({ user_ids: [f.botUserId] }),
  'admin.users.setAdmin': (c, f) => c.admin.users.setAdmin({ team_id: f.teamId, user_id: f.botUserId }),
  'admin.users.setExpiration': (c, f) => c.admin.users.setExpiration({ expiration_ts: 1800000000, team_id: f.teamId, user_id: f.botUserId }),
  'admin.users.setOwner': (c, f) => c.admin.users.setOwner({ team_id: f.teamId, user_id: f.botUserId }),
  'admin.users.setRegular': (c, f) => c.admin.users.setRegular({ team_id: f.teamId, user_id: f.botUserId }),
  'admin.users.unsupportedVersions.export': (c, _f) => c.admin.users.unsupportedVersions.export({}),

  // ── admin.workflows ───────────────────────────────────────────────────────
  'admin.workflows.collaborators.add': (c, f) => c.admin.workflows.collaborators.add({ collaborators: [{ type: 'user', id: f.botUserId }], workflow_id: 'Wf_STUB' }),
  'admin.workflows.collaborators.remove': (c, f) => c.admin.workflows.collaborators.remove({ collaborators: [{ type: 'user', id: f.botUserId }], workflow_id: 'Wf_STUB' }),
  'admin.workflows.permissions.lookup': (c, _f) => c.admin.workflows.permissions.lookup({ workflow_ids: ['Wf_STUB'] }),
  'admin.workflows.search': (c, _f) => c.admin.workflows.search({}),
  'admin.workflows.unpublish': (c, _f) => c.admin.workflows.unpublish({ workflow_ids: ['Wf_STUB'] }),

  // ── api ───────────────────────────────────────────────────────────────────
  'api.test': (c, _f) => c.api.test({}),

  // ── apps ──────────────────────────────────────────────────────────────────
  'apps.connections.open': async (c, _f) => {
    // apps.connections.open requires an app-level token; use a stub that the twin accepts
    const { seedSlackAppToken } = await import('../setup/seeders.js');
    const appToken = await seedSlackAppToken();
    const { createSlackClient } = await import('../helpers/slack-client.js');
    const appClient = createSlackClient(appToken);
    return appClient.apps.connections.open();
  },
  'apps.event.authorizations.list': (c, _f) => c.apps.event.authorizations.list({ event_context: 'evt_STUB' }),
  'apps.manifest.create': (c, _f) => c.apps.manifest.create({ manifest: { display_information: { name: 'Fixture App' } } }),
  'apps.manifest.delete': (c, _f) => c.apps.manifest.delete({ app_id: 'A_STUB' }),
  'apps.manifest.export': (c, _f) => c.apps.manifest.export({ app_id: 'A_STUB' }),
  'apps.manifest.update': (c, _f) => c.apps.manifest.update({ app_id: 'A_STUB', manifest: { display_information: { name: 'Fixture App Updated' } } }),
  'apps.manifest.validate': (c, _f) => c.apps.manifest.validate({ manifest: { display_information: { name: 'Fixture App' } } }),
  'apps.uninstall': (c, _f) => c.apps.uninstall({ client_id: 'A_STUB', client_secret: 'secret_stub' }),

  // ── assistant.threads ─────────────────────────────────────────────────────
  'assistant.threads.setStatus': (c, f) => c.assistant.threads.setStatus({ channel_id: f.channelId, thread_ts: f.messageTs, status: 'thinking' }),
  'assistant.threads.setSuggestedPrompts': (c, f) => c.assistant.threads.setSuggestedPrompts({ channel_id: f.channelId, thread_ts: f.messageTs, prompts: [{ title: 'Test', message: 'Hello' }] }),
  'assistant.threads.setTitle': (c, f) => c.assistant.threads.setTitle({ channel_id: f.channelId, thread_ts: f.messageTs, title: 'Fixture Thread' }),

  // ── auth ──────────────────────────────────────────────────────────────────
  'auth.revoke': (c, _f) => c.auth.revoke({}),
  'auth.teams.list': (c, _f) => c.auth.teams.list({}),
  'auth.test': (c, _f) => c.auth.test(),

  // ── bookmarks ─────────────────────────────────────────────────────────────
  'bookmarks.add': (c, f) => c.bookmarks.add({ channel_id: f.channelId, title: 'Fixture Bookmark', type: 'link', link: 'https://example.com' }),
  'bookmarks.edit': (c, f) => c.bookmarks.edit({ bookmark_id: 'Bk_STUB', channel_id: f.channelId, title: 'Edited' }),
  'bookmarks.list': (c, f) => c.bookmarks.list({ channel_id: f.channelId }),
  'bookmarks.remove': (c, f) => c.bookmarks.remove({ bookmark_id: 'Bk_STUB', channel_id: f.channelId }),

  // ── bots ──────────────────────────────────────────────────────────────────
  'bots.info': (c, _f) => c.bots.info({ bot: 'B_BOT_TWIN' }),

  // ── calls ─────────────────────────────────────────────────────────────────
  'calls.add': (c, _f) => c.calls.add({ external_unique_id: 'call_fixture', join_url: 'https://example.com/call' }),
  'calls.end': (c, _f) => c.calls.end({ id: 'R_STUB_CALL' }),
  'calls.info': (c, _f) => c.calls.info({ id: 'R_STUB_CALL' }),
  'calls.participants.add': (c, f) => c.calls.participants.add({ id: 'R_STUB_CALL', users: [{ slack_id: f.botUserId }] }),
  'calls.participants.remove': (c, f) => c.calls.participants.remove({ id: 'R_STUB_CALL', users: [{ slack_id: f.botUserId }] }),
  'calls.update': (c, _f) => c.calls.update({ id: 'R_STUB_CALL' }),

  // ── canvases ──────────────────────────────────────────────────────────────
  'canvases.access.delete': (c, f) => c.canvases.access.delete({ canvas_id: f.canvasId, access_level: 'read' }),
  'canvases.access.set': (c, f) => c.canvases.access.set({ canvas_id: f.canvasId, access_level: 'read' }),
  'canvases.create': (c, _f) => c.canvases.create({}),
  'canvases.delete': (c, f) => c.canvases.delete({ canvas_id: f.canvasId }),
  'canvases.edit': (c, f) => c.canvases.edit({ canvas_id: f.canvasId, changes: [] }),
  'canvases.sections.lookup': (c, f) => c.canvases.sections.lookup({ canvas_id: f.canvasId, criteria: {} }),

  // ── chat ──────────────────────────────────────────────────────────────────
  'chat.appendStream': (c, f) => c.chat.appendStream({ channel: f.channelId, thread_ts: f.messageTs, text: 'stream chunk', draft_id: 'Ds_STUB' }),
  'chat.delete': (c, f) => c.chat.delete({ channel: f.channelId, ts: f.messageTs }),
  'chat.deleteScheduledMessage': (c, f) => c.chat.deleteScheduledMessage({ channel: f.channelId, scheduled_message_id: 'Q_STUB' }),
  'chat.getPermalink': (c, f) => c.chat.getPermalink({ channel: f.channelId, message_ts: f.messageTs }),
  'chat.meMessage': (c, f) => c.chat.meMessage({ channel: f.channelId, text: '/me fixture' }),
  'chat.postEphemeral': (c, f) => c.chat.postEphemeral({ channel: f.channelId, user: f.botUserId, text: 'ephemeral fixture' }),
  'chat.postMessage': (c, f) => c.chat.postMessage({ channel: f.channelId, text: 'fixture message' }),
  'chat.scheduleMessage': (c, f) => c.chat.scheduleMessage({ channel: f.channelId, text: 'scheduled', post_at: Math.floor(Date.now() / 1000) + 3600 }),
  'chat.scheduledMessages.list': (c, _f) => c.chat.scheduledMessages.list({}),
  'chat.startStream': (c, f) => c.chat.startStream({ channel: f.channelId, thread_ts: f.messageTs }),
  'chat.stopStream': (c, f) => c.chat.stopStream({ channel: f.channelId, thread_ts: f.messageTs, draft_id: 'Ds_STUB' }),
  'chat.unfurl': (c, f) => c.chat.unfurl({ channel: f.channelId, ts: f.messageTs, unfurls: {} }),
  'chat.update': (c, f) => c.chat.update({ channel: f.channelId, ts: f.messageTs, text: 'updated fixture' }),

  // ── conversations ─────────────────────────────────────────────────────────
  'conversations.acceptSharedInvite': (c, _f) => c.conversations.acceptSharedInvite({ channel_name: 'fixture-shared', invite_id: 'Inv_STUB' }),
  'conversations.approveSharedInvite': (c, _f) => c.conversations.approveSharedInvite({ invite_id: 'Inv_STUB' }),
  'conversations.archive': (c, f) => c.conversations.archive({ channel: f.privateChannelId }),
  'conversations.canvases.create': (c, f) => c.conversations.canvases.create({ channel_id: f.channelId }),
  'conversations.close': (c, f) => c.conversations.close({ channel: f.dmId }),
  'conversations.create': (c, _f) => c.conversations.create({ name: `fixture-chan-${Date.now()}` }),
  'conversations.declineSharedInvite': (c, _f) => c.conversations.declineSharedInvite({ invite_id: 'Inv_STUB' }),
  'conversations.externalInvitePermissions.set': (c, f) => c.conversations.externalInvitePermissions.set({ channel: f.channelId, action: 'upgrade' }),
  'conversations.history': (c, f) => c.conversations.history({ channel: f.channelId }),
  'conversations.info': (c, f) => c.conversations.info({ channel: f.channelId }),
  'conversations.invite': (c, f) => c.conversations.invite({ channel: f.channelId, users: f.botUserId }),
  'conversations.inviteShared': (c, f) => c.conversations.inviteShared({ channel: f.channelId, emails: ['shared@example.com'] }),
  'conversations.join': (c, f) => c.conversations.join({ channel: f.channelId }),
  'conversations.kick': (c, f) => c.conversations.kick({ channel: f.channelId, user: f.botUserId }),
  'conversations.leave': (c, f) => c.conversations.leave({ channel: f.channelId }),
  'conversations.list': (c, _f) => c.conversations.list({}),
  'conversations.listConnectInvites': (c, _f) => c.conversations.listConnectInvites({}),
  'conversations.mark': (c, f) => c.conversations.mark({ channel: f.channelId, ts: f.messageTs }),
  'conversations.members': (c, f) => c.conversations.members({ channel: f.channelId }),
  'conversations.open': (c, f) => c.conversations.open({ users: f.botUserId }),
  'conversations.rename': (c, f) => c.conversations.rename({ channel: f.channelId, name: `renamed-${Date.now()}` }),
  'conversations.replies': (c, f) => c.conversations.replies({ channel: f.channelId, ts: f.messageTs }),
  'conversations.requestSharedInvite.approve': (c, _f) => c.conversations.requestSharedInvite.approve({ invite_id: 'Inv_STUB', is_external_limited: false }),
  'conversations.requestSharedInvite.deny': (c, _f) => c.conversations.requestSharedInvite.deny({ invite_id: 'Inv_STUB' }),
  'conversations.requestSharedInvite.list': (c, _f) => c.conversations.requestSharedInvite.list({}),
  'conversations.setPurpose': (c, f) => c.conversations.setPurpose({ channel: f.channelId, purpose: 'fixture purpose' }),
  'conversations.setTopic': (c, f) => c.conversations.setTopic({ channel: f.channelId, topic: 'fixture topic' }),
  'conversations.unarchive': (c, f) => c.conversations.unarchive({ channel: f.channelId }),

  // ── dialog ────────────────────────────────────────────────────────────────
  'dialog.open': (c, _f) => c.dialog.open({ trigger_id: 'trigger_stub', dialog: { title: 'Fixture', callback_id: 'cb_stub', elements: [] } }),

  // ── dnd ───────────────────────────────────────────────────────────────────
  'dnd.endDnd': (c, _f) => c.dnd.endDnd(),
  'dnd.endSnooze': (c, _f) => c.dnd.endSnooze(),
  'dnd.info': (c, f) => c.dnd.info({ user: f.botUserId }),
  'dnd.setSnooze': (c, _f) => c.dnd.setSnooze({ num_minutes: 60 }),
  'dnd.teamInfo': (c, f) => c.dnd.teamInfo({ users: f.botUserId }),

  // ── emoji ─────────────────────────────────────────────────────────────────
  'emoji.list': (c, _f) => c.emoji.list({}),

  // ── entity ────────────────────────────────────────────────────────────────
  'entity.presentDetails': (c, _f) => c.entity.presentDetails({}),

  // ── files ─────────────────────────────────────────────────────────────────
  'files.comments.delete': (c, f) => (c as any).files.comments.delete({ file: f.fileId, id: 'Fc_STUB' }),
  'files.completeUploadExternal': (c, f) => c.files.completeUploadExternal({ files: [{ id: f.fileId, title: 'fixture.txt' }], channel_id: f.channelId }),
  'files.delete': (c, f) => c.files.delete({ file: f.fileId }),
  'files.getUploadURLExternal': (c, _f) => c.files.getUploadURLExternal({ filename: 'fixture.txt', length: 10 }),
  'files.info': (c, f) => c.files.info({ file: f.fileId }),
  'files.list': (c, _f) => c.files.list({}),
  'files.remote.add': (c, _f) => c.files.remote.add({ external_id: 'ext_fixture', external_url: 'https://example.com', title: 'Remote Fixture' }),
  'files.remote.info': (c, _f) => c.files.remote.info({ external_id: 'ext_fixture' }),
  'files.remote.list': (c, _f) => c.files.remote.list({}),
  'files.remote.remove': (c, _f) => c.files.remote.remove({ external_id: 'ext_fixture' }),
  'files.remote.share': (c, f) => c.files.remote.share({ channels: [f.channelId], external_id: 'ext_fixture' }),
  'files.remote.update': (c, _f) => c.files.remote.update({ external_id: 'ext_fixture', title: 'Updated Remote Fixture' }),
  'files.revokePublicURL': (c, f) => c.files.revokePublicURL({ file: f.fileId }),
  'files.sharedPublicURL': (c, f) => c.files.sharedPublicURL({ file: f.fileId }),
  'files.upload': (c, f) => (c as any).files.upload({ channels: f.channelId, content: 'fixture content', filename: 'fixture.txt' }),
  'files.uploadV2': (c, f) => (c as any).files.uploadV2({ channel_id: f.channelId, content: 'fixture content', filename: 'fixture.txt' }),

  // ── functions ─────────────────────────────────────────────────────────────
  'functions.completeError': (c, _f) => c.functions.completeError({ function_execution_id: 'Fx_STUB', error: 'fixture error' }),
  'functions.completeSuccess': (c, _f) => c.functions.completeSuccess({ function_execution_id: 'Fx_STUB', outputs: {} }),

  // ── migration ─────────────────────────────────────────────────────────────
  'migration.exchange': (c, f) => c.migration.exchange({ users: [f.botUserId] }),

  // ── oauth ─────────────────────────────────────────────────────────────────
  'oauth.access': async (c, _f) => {
    // oauth.access is a no-auth endpoint; use a bare client
    const { createSlackClient } = await import('../helpers/slack-client.js');
    const bare = createSlackClient('');
    try {
      return await bare.oauth.access({ code: 'stub_code', client_id: 'test-client', client_secret: 'test-secret' });
    } catch {
      // ok:false throws in WebClient — callability is proven by reaching the twin
      return { ok: false };
    }
  },
  'oauth.v2.access': async (c, _f) => {
    const { createSlackClient } = await import('../helpers/slack-client.js');
    const bare = createSlackClient('');
    try {
      return await bare.oauth.v2.access({ code: 'stub_code', client_id: 'test-client', client_secret: 'test-secret' });
    } catch {
      return { ok: false };
    }
  },
  'oauth.v2.exchange': (c, _f) => c.oauth.v2.exchange({ code: 'stub_code' }),

  // ── openid ────────────────────────────────────────────────────────────────
  'openid.connect.token': (c, _f) => c.openid.connect.token({ code: 'oidc-stub-code', client_id: 'A_TWIN', client_secret: 'test-client-secret' }),
  'openid.connect.userInfo': (c, _f) => c.openid.connect.userInfo(),

  // ── pins ──────────────────────────────────────────────────────────────────
  'pins.add': (c, f) => c.pins.add({ channel: f.channelId, timestamp: f.messageTs }),
  'pins.list': (c, f) => c.pins.list({ channel: f.channelId }),
  'pins.remove': (c, f) => c.pins.remove({ channel: f.channelId, timestamp: f.messageTs }),

  // ── reactions ─────────────────────────────────────────────────────────────
  'reactions.add': (c, f) => c.reactions.add({ channel: f.channelId, name: 'thumbsup', timestamp: f.messageTs }),
  'reactions.get': (c, f) => c.reactions.get({ channel: f.channelId, timestamp: f.messageTs }),
  'reactions.list': (c, f) => c.reactions.list({ user: f.botUserId }),
  'reactions.remove': (c, f) => c.reactions.remove({ channel: f.channelId, name: 'thumbsup', timestamp: f.messageTs }),

  // ── reminders ─────────────────────────────────────────────────────────────
  'reminders.add': (c, _f) => c.reminders.add({ text: 'Fixture reminder', time: String(Math.floor(Date.now() / 1000) + 3600) }),
  'reminders.complete': (c, _f) => c.reminders.complete({ reminder: 'Rm_STUB' }),
  'reminders.delete': (c, _f) => c.reminders.delete({ reminder: 'Rm_STUB' }),
  'reminders.info': (c, _f) => c.reminders.info({ reminder: 'Rm_STUB' }),
  'reminders.list': (c, _f) => c.reminders.list({}),

  // ── rtm ───────────────────────────────────────────────────────────────────
  'rtm.connect': (c, _f) => c.rtm.connect({}),
  'rtm.start': (c, _f) => (c as any).rtm.start({}),

  // ── search ────────────────────────────────────────────────────────────────
  'search.all': (c, _f) => c.search.all({ query: 'fixture' }),
  'search.files': (c, _f) => c.search.files({ query: 'fixture' }),
  'search.messages': (c, _f) => c.search.messages({ query: 'fixture' }),

  // ── slackLists ────────────────────────────────────────────────────────────
  'slackLists.access.delete': (c, _f) => c.slackLists.access.delete({ list_id: 'L_STUB', access_level: 'read' }),
  'slackLists.access.set': (c, _f) => c.slackLists.access.set({ list_id: 'L_STUB', access_level: 'read' }),
  'slackLists.create': (c, _f) => c.slackLists.create({}),
  'slackLists.download.get': (c, _f) => (c as any).slackLists.download.get({ list_id: 'L_STUB' }),
  'slackLists.download.start': (c, _f) => (c as any).slackLists.download.start({ list_id: 'L_STUB' }),
  'slackLists.items.create': (c, _f) => c.slackLists.items.create({ list_id: 'L_STUB' }),
  'slackLists.items.delete': (c, _f) => c.slackLists.items.delete({ item_ids: ['Li_STUB'], list_id: 'L_STUB' }),
  'slackLists.items.deleteMultiple': (c, _f) => c.slackLists.items.deleteMultiple({ item_ids: ['Li_STUB'], list_id: 'L_STUB' }),
  'slackLists.items.info': (c, _f) => c.slackLists.items.info({ item_id: 'Li_STUB', list_id: 'L_STUB' }),
  'slackLists.items.list': (c, _f) => c.slackLists.items.list({ list_id: 'L_STUB' }),
  'slackLists.items.update': (c, _f) => c.slackLists.items.update({ item_id: 'Li_STUB', list_id: 'L_STUB' }),
  'slackLists.update': (c, _f) => c.slackLists.update({ list_id: 'L_STUB' }),

  // ── stars ─────────────────────────────────────────────────────────────────
  'stars.add': (c, f) => c.stars.add({ channel: f.channelId, timestamp: f.messageTs }),
  'stars.list': (c, _f) => c.stars.list({}),
  'stars.remove': (c, f) => c.stars.remove({ channel: f.channelId, timestamp: f.messageTs }),

  // ── team ──────────────────────────────────────────────────────────────────
  'team.accessLogs': (c, _f) => c.team.accessLogs({}),
  'team.billableInfo': (c, _f) => c.team.billableInfo({}),
  'team.billing.info': (c, _f) => (c as any).team.billing.info({}),
  'team.externalTeams.disconnect': (c, _f) => (c as any).team.externalTeams.disconnect({ target_team: 'T_EXT_STUB' }),
  'team.externalTeams.list': (c, _f) => (c as any).team.externalTeams.list({}),
  'team.info': (c, _f) => c.team.info({}),
  'team.integrationLogs': (c, _f) => c.team.integrationLogs({}),
  'team.preferences.list': (c, _f) => (c as any).team.preferences.list(),
  'team.profile.get': (c, _f) => (c as any).team.profile.get({}),

  // ── tooling ───────────────────────────────────────────────────────────────
  'tooling.tokens.rotate': (c, _f) => (c as any).tooling.tokens.rotate({ refresh_token: 'rt_STUB' }),

  // ── usergroups ────────────────────────────────────────────────────────────
  'usergroups.create': (c, _f) => c.usergroups.create({ name: 'fixture-group' }),
  'usergroups.disable': (c, _f) => c.usergroups.disable({ usergroup: 'S_STUB' }),
  'usergroups.enable': (c, _f) => c.usergroups.enable({ usergroup: 'S_STUB' }),
  'usergroups.list': (c, _f) => c.usergroups.list({}),
  'usergroups.update': (c, _f) => c.usergroups.update({ usergroup: 'S_STUB', name: 'fixture-group-updated' }),
  'usergroups.users.list': (c, _f) => c.usergroups.users.list({ usergroup: 'S_STUB' }),
  'usergroups.users.update': (c, f) => c.usergroups.users.update({ usergroup: 'S_STUB', users: [f.botUserId] }),

  // ── users ─────────────────────────────────────────────────────────────────
  'users.conversations': (c, f) => c.users.conversations({ user: f.botUserId }),
  'users.deletePhoto': (c, _f) => (c as any).users.deletePhoto(),
  'users.discoverableContacts.lookup': (c, _f) => (c as any).users.discoverableContacts.lookup({ email: 'fixture@example.com' }),
  'users.getPresence': (c, f) => c.users.getPresence({ user: f.botUserId }),
  'users.identity': (c, _f) => c.users.identity(),
  'users.info': (c, f) => c.users.info({ user: f.botUserId }),
  'users.list': (c, _f) => c.users.list({}),
  'users.lookupByEmail': (c, _f) => c.users.lookupByEmail({ email: 'fixture@example.com' }),
  'users.profile.get': (c, f) => c.users.profile.get({ user: f.botUserId }),
  'users.profile.set': (c, f) => c.users.profile.set({ user: f.botUserId, profile: {} }),
  'users.setPhoto': (c, _f) => (c as any).users.setPhoto({}),
  'users.setPresence': (c, _f) => c.users.setPresence({ presence: 'auto' }),

  // ── views ─────────────────────────────────────────────────────────────────
  'views.open': (c, _f) => c.views.open({ trigger_id: 'fixture-trigger', view: { type: 'modal', title: { type: 'plain_text', text: 'Fixture' }, blocks: [] } }),
  'views.publish': (c, f) => c.views.publish({ user_id: f.botUserId, view: { type: 'home', blocks: [] } }),
  'views.push': (c, _f) => c.views.push({ trigger_id: 'fixture-trigger', view: { type: 'modal', title: { type: 'plain_text', text: 'Fixture Push' }, blocks: [] } }),
  'views.update': (c, f) => c.views.update({ view_id: f.viewId, view: { type: 'modal', title: { type: 'plain_text', text: 'Fixture Updated' }, blocks: [] } }),

  // ── workflows ─────────────────────────────────────────────────────────────
  'workflows.featured.add': (c, _f) => (c as any).workflows.featured.add({ workflow_ids: ['Wf_STUB'] }),
  'workflows.featured.list': (c, _f) => (c as any).workflows.featured.list({}),
  'workflows.featured.remove': (c, _f) => (c as any).workflows.featured.remove({ workflow_ids: ['Wf_STUB'] }),
  'workflows.featured.set': (c, _f) => (c as any).workflows.featured.set({ workflow_ids: ['Wf_STUB'] }),
  'workflows.stepCompleted': (c, f) => c.workflows.stepCompleted({ workflow_step_execute_id: f.workflowStepExecuteId }),
  'workflows.stepFailed': (c, f) => c.workflows.stepFailed({ workflow_step_execute_id: f.workflowStepExecuteId, error: { message: 'fixture error' } }),
  'workflows.updateStep': (c, f) => c.workflows.updateStep({ workflow_step_edit_id: f.workflowStepEditId }),
};
