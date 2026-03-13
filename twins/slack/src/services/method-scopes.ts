/**
 * Slack method-to-scope catalog.
 *
 * Single source of truth for:
 *   1. seedSlackBotToken() — passes allScopesString() as the token's granted scopes
 *   2. Phase 26 scope enforcement — validates incoming requests against METHOD_SCOPES[method]
 *
 * When adding new Slack method coverage in Phase 25, add entries here.
 * When adding scope enforcement in Phase 26, import METHOD_SCOPES from this file.
 */

export const METHOD_SCOPES: Record<string, string[]> = {
  'auth.test':               [],
  'api.test':                [],
  'chat.postMessage':        ['chat:write'],
  'chat.update':             ['chat:write'],
  'chat.delete':             ['chat:write'],
  'chat.postEphemeral':      ['chat:write'],
  'chat.getPermalink':       [],
  'chat.meMessage':          ['chat:write'],
  'chat.scheduleMessage':    ['chat:write'],
  'chat.scheduledMessages.list': ['chat:write'],
  'chat.deleteScheduledMessage': ['chat:write'],
  'chat.unfurl':             ['links:write'],
  'chat.startStream':        ['chat:write'],
  'conversations.list':      ['channels:read', 'groups:read', 'im:read', 'mpim:read'],
  'conversations.info':      ['channels:read', 'groups:read', 'im:read', 'mpim:read'],
  'conversations.history':   ['channels:history', 'groups:history', 'mpim:history', 'im:history'],
  'conversations.create':    ['channels:manage'],
  'conversations.join':      ['channels:join'],
  'conversations.leave':     ['channels:write', 'groups:write'],
  'conversations.archive':   ['channels:manage'],
  'conversations.unarchive': ['channels:manage'],
  'conversations.rename':    ['channels:manage'],
  'conversations.invite':    ['channels:manage'],
  'conversations.kick':      ['channels:manage'],
  'conversations.open':      ['im:write', 'mpim:write'],
  'conversations.close':     ['im:write', 'mpim:write'],
  'conversations.mark':      ['channels:write', 'groups:write', 'im:write', 'mpim:write'],
  'conversations.setPurpose':['channels:write', 'groups:write'],
  'conversations.setTopic':  ['channels:write', 'groups:write'],
  'conversations.members':   ['channels:read', 'groups:read', 'mpim:read', 'im:read'],
  'conversations.replies':   ['channels:history', 'groups:history', 'mpim:history', 'im:history'],
  'conversations.requestSharedInvite.list': ['channels:read'],
  'pins.add':                ['pins:write'],
  'pins.list':               ['pins:read'],
  'pins.remove':             ['pins:write'],
  'reactions.add':           ['reactions:write'],
  'reactions.get':           ['reactions:read'],
  'reactions.list':          ['reactions:read'],
  'reactions.remove':        ['reactions:write'],
  'files.list':              ['files:read'],
  'files.delete':            ['files:write'],
  'search.messages':         ['search:read'],
  'reminders.add':           ['reminders:write'],
  'reminders.list':          ['reminders:read'],
  'bots.info':               ['users:read'],
  'emoji.list':              ['emoji:read'],
  'team.info':               ['team:read'],
  'dnd.info':                ['dnd:read'],
  'usergroups.list':         ['usergroups:read'],
  'users.list':              ['users:read'],
  'users.info':              ['users:read'],
  'users.conversations':     ['channels:read', 'groups:read', 'im:read', 'mpim:read'],
  'users.getPresence':       ['users:read'],
  'users.lookupByEmail':     ['users:read.email'],
  'users.profile.get':       ['users.profile:read'],
  'users.identity':          ['identity.basic'],
  'users.profile.set':       ['users.profile:write'],
  'users.setPresence':       ['users:write'],
  'users.deletePhoto':       ['users:write'],
  'views.open':              [],
  'views.publish':           [],
  'views.push':              [],
  'views.update':            [],

  // ── admin.users.* ────────────────────────────────────────────────
  'admin.users.list':                         ['admin.users:read'],
  'admin.users.invite':                       ['admin.users:write'],
  'admin.users.assign':                       ['admin.users:write'],
  'admin.users.remove':                       ['admin.users:write'],
  'admin.users.setAdmin':                     ['admin.users:write'],
  'admin.users.setExpiration':                ['admin.users:write'],
  'admin.users.setOwner':                     ['admin.users:write'],
  'admin.users.setRegular':                   ['admin.users:write'],
  'admin.users.session.list':                 ['admin.users:read'],
  'admin.users.session.reset':                ['admin.users:write'],
  'admin.users.session.resetBulk':            ['admin.users:write'],
  'admin.users.session.invalidate':           ['admin.users:write'],
  'admin.users.session.getSettings':          ['admin.users:read'],
  'admin.users.session.setSettings':          ['admin.users:write'],
  'admin.users.session.clearSettings':        ['admin.users:write'],
  'admin.users.unsupportedVersions.export':   ['admin.users:write'],

  // ── admin.conversations.* ─────────────────────────────────────────
  'admin.conversations.archive':              ['admin.conversations:write'],
  'admin.conversations.bulkArchive':          ['admin.conversations:write'],
  'admin.conversations.bulkDelete':           ['admin.conversations:write'],
  'admin.conversations.bulkMove':             ['admin.conversations:write'],
  'admin.conversations.convertToPrivate':     ['admin.conversations:write'],
  'admin.conversations.convertToPublic':      ['admin.conversations:write'],
  'admin.conversations.create':               ['admin.conversations:write'],
  'admin.conversations.delete':               ['admin.conversations:write'],
  'admin.conversations.disconnectShared':     ['admin.conversations:write'],
  'admin.conversations.ekm.listOriginalConnectedChannelInfo': ['admin.conversations:read'],
  'admin.conversations.getConversationPrefs': ['admin.conversations:read'],
  'admin.conversations.getCustomRetention':   ['admin.conversations:read'],
  'admin.conversations.getTeams':             ['admin.conversations:read'],
  'admin.conversations.invite':               ['admin.conversations:write'],
  'admin.conversations.lookup':               ['admin.conversations:read'],
  'admin.conversations.removeCustomRetention':['admin.conversations:write'],
  'admin.conversations.rename':               ['admin.conversations:write'],
  'admin.conversations.restrictAccess.addGroup':    ['admin.conversations:write'],
  'admin.conversations.restrictAccess.listGroups':  ['admin.conversations:read'],
  'admin.conversations.restrictAccess.removeGroup': ['admin.conversations:write'],
  'admin.conversations.search':               ['admin.conversations:read'],
  'admin.conversations.setConversationPrefs': ['admin.conversations:write'],
  'admin.conversations.setCustomRetention':   ['admin.conversations:write'],
  'admin.conversations.setTeams':             ['admin.conversations:write'],
  'admin.conversations.unarchive':            ['admin.conversations:write'],

  // ── admin.teams.* ─────────────────────────────────────────────────
  'admin.teams.admins.list':                  ['admin.teams:read'],
  'admin.teams.create':                       ['admin.teams:write'],
  'admin.teams.list':                         ['admin.teams:read'],
  'admin.teams.owners.list':                  ['admin.teams:read'],
  'admin.teams.settings.info':                ['admin.teams:read'],
  'admin.teams.settings.setDefaultChannels':  ['admin.teams:write'],
  'admin.teams.settings.setDescription':      ['admin.teams:write'],
  'admin.teams.settings.setDiscoverability':  ['admin.teams:write'],
  'admin.teams.settings.setIcon':             ['admin.teams:write'],
  'admin.teams.settings.setName':             ['admin.teams:write'],

  // ── admin.apps.* ──────────────────────────────────────────────────
  'admin.apps.activities.list':               ['admin.apps:read'],
  'admin.apps.approve':                       ['admin.apps:write'],
  'admin.apps.approved.list':                 ['admin.apps:read'],
  'admin.apps.clearResolution':               ['admin.apps:write'],
  'admin.apps.config.lookup':                 ['admin.apps:read'],
  'admin.apps.config.set':                    ['admin.apps:write'],
  'admin.apps.requests.cancel':               ['admin.apps:write'],
  'admin.apps.requests.list':                 ['admin.apps:read'],
  'admin.apps.restrict':                      ['admin.apps:write'],
  'admin.apps.restricted.list':               ['admin.apps:read'],
  'admin.apps.uninstall':                     ['admin.apps:write'],

  // ── admin.barriers.* ──────────────────────────────────────────────
  'admin.barriers.create':                    ['admin.barriers:write'],
  'admin.barriers.delete':                    ['admin.barriers:write'],
  'admin.barriers.list':                      ['admin.barriers:read'],
  'admin.barriers.update':                    ['admin.barriers:write'],

  // ── admin.emoji.* ─────────────────────────────────────────────────
  'admin.emoji.add':                          ['admin.emoji:write'],
  'admin.emoji.addAlias':                     ['admin.emoji:write'],
  'admin.emoji.list':                         ['admin.emoji:read'],
  'admin.emoji.remove':                       ['admin.emoji:write'],
  'admin.emoji.rename':                       ['admin.emoji:write'],

  // ── admin.functions.* ─────────────────────────────────────────────
  'admin.functions.list':                     ['admin.workflows:read'],
  'admin.functions.permissions.lookup':       ['admin.workflows:read'],
  'admin.functions.permissions.set':          ['admin.workflows:write'],

  // ── admin.inviteRequests.* ────────────────────────────────────────
  'admin.inviteRequests.approve':             ['admin.invites:write'],
  'admin.inviteRequests.deny':                ['admin.invites:write'],
  'admin.inviteRequests.list':                ['admin.invites:read'],
  'admin.inviteRequests.approved.list':       ['admin.invites:read'],
  'admin.inviteRequests.denied.list':         ['admin.invites:read'],

  // ── admin.roles.* ─────────────────────────────────────────────────
  'admin.roles.addAssignments':               ['admin.roles:write'],
  'admin.roles.listAssignments':              ['admin.roles:read'],
  'admin.roles.removeAssignments':            ['admin.roles:write'],

  // ── admin.usergroups.* ────────────────────────────────────────────
  'admin.usergroups.addChannels':             ['admin.usergroups:write'],
  'admin.usergroups.addTeams':                ['admin.usergroups:write'],
  'admin.usergroups.listChannels':            ['admin.usergroups:read'],
  'admin.usergroups.removeChannels':          ['admin.usergroups:write'],

  // ── admin.auth.* ──────────────────────────────────────────────────
  'admin.auth.policy.assignEntities':         ['admin'],
  'admin.auth.policy.getEntities':            ['admin'],
  'admin.auth.policy.removeEntities':         ['admin'],

  // ── admin.workflows.* ─────────────────────────────────────────────
  'admin.workflows.collaborators.add':        ['admin.workflows:write'],
  'admin.workflows.collaborators.remove':     ['admin.workflows:write'],
  'admin.workflows.permissions.lookup':       ['admin.workflows:read'],
  'admin.workflows.unpublish':                ['admin.workflows:write'],

  // ── admin.analytics.* ─────────────────────────────────────────────
  'admin.analytics.getFile':                  ['admin.analytics:read'],

  // ── canvases.* ────────────────────────────────────────────────────
  'canvases.create':                          ['canvases:write'],
  'canvases.delete':                          ['canvases:write'],
  'canvases.edit':                            ['canvases:write'],
  'canvases.access.delete':                   ['canvases:write'],
  'canvases.access.set':                      ['canvases:write'],
  'canvases.sections.lookup':                 ['canvases:read'],

  // ── openid.connect.* ──────────────────────────────────────────────
  'openid.connect.token':                     ['openid'],
  'openid.connect.userInfo':                  ['openid'],

  // ── stars.* ───────────────────────────────────────────────────────
  'stars.add':                                ['stars:write'],
  'stars.list':                               ['stars:read'],
  'stars.remove':                             ['stars:write'],

  // ── workflows.* ───────────────────────────────────────────────────
  'workflows.stepCompleted':                  [],
  'workflows.stepFailed':                     [],
  'workflows.updateStep':                     [],
  'workflows.featured.add':                   ['workflows:write'],
  'workflows.featured.list':                  ['workflows:read'],
  'workflows.featured.remove':                ['workflows:write'],
  'workflows.featured.set':                   ['workflows:write'],

  // ── slackLists.* ──────────────────────────────────────────────────
  'slackLists.create':                        ['lists:write'],
  'slackLists.update':                        ['lists:write'],
  'slackLists.access.delete':                 ['lists:write'],
  'slackLists.access.set':                    ['lists:write'],
  'slackLists.download.get':                  ['lists:read'],
  'slackLists.download.start':                ['lists:read'],
  'slackLists.items.create':                  ['lists:write'],
  'slackLists.items.delete':                  ['lists:write'],
  'slackLists.items.deleteMultiple':          ['lists:write'],
  'slackLists.items.info':                    ['lists:read'],
  'slackLists.items.list':                    ['lists:read'],
  'slackLists.items.update':                  ['lists:write'],

  // ── rtm.* ─────────────────────────────────────────────────────────
  'rtm.connect':                              ['rtm:stream'],
  'rtm.start':                                ['rtm:stream'],

  // ── entity.* ──────────────────────────────────────────────────────
  'entity.presentDetails':                    [],

  // ── apps.* extended ───────────────────────────────────────────────
  'apps.manifest.create':                     ['apps.manifest:write'],
  'apps.manifest.delete':                     ['apps.manifest:write'],
  'apps.manifest.export':                     ['apps.manifest:read'],
  'apps.manifest.update':                     ['apps.manifest:write'],
  'apps.manifest.validate':                   ['apps.manifest:read'],
  'apps.uninstall':                           [],
  'apps.event.authorizations.list':           ['authorizations:read'],

  // ── conversations.* extended ──────────────────────────────────────
  'conversations.acceptSharedInvite':         ['channels:manage'],
  'conversations.approveSharedInvite':        ['channels:manage'],
  'conversations.canvases.create':            ['canvases:write'],
  'conversations.declineSharedInvite':        ['channels:manage'],
  'conversations.externalInvitePermissions.set': ['channels:manage'],
  'conversations.inviteShared':               ['channels:manage'],
  'conversations.listConnectInvites':         ['channels:read'],
  'conversations.requestSharedInvite.approve':['channels:manage'],
  'conversations.requestSharedInvite.deny':   ['channels:manage'],

  // ── team.* extended ───────────────────────────────────────────────
  'team.billing.info':                        ['team:read'],
  'team.externalTeams.disconnect':            ['team:write'],
  'team.externalTeams.list':                  ['team:read'],

  // ── users.* extended ──────────────────────────────────────────────
  'users.discoverableContacts.lookup':        ['users:read'],

  // ── oauth.* ───────────────────────────────────────────────────────
  'oauth.access':                             [],
  'oauth.v2.exchange':                        [],

  // ── files.* legacy ────────────────────────────────────────────────
  'files.upload':                             ['files:write'],
  'files.uploadV2':                           ['files:write'],
};

/** Return the union of all scopes in the catalog as a sorted, comma-separated string. */
export function allScopesString(): string {
  const set = new Set<string>();
  for (const scopes of Object.values(METHOD_SCOPES)) {
    for (const s of scopes) set.add(s);
  }
  return [...set].sort().join(',');
}
