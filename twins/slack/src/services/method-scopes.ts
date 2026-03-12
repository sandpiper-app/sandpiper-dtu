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
};

/** Return the union of all scopes in the catalog as a sorted, comma-separated string. */
export function allScopesString(): string {
  const set = new Set<string>();
  for (const scopes of Object.values(METHOD_SCOPES)) {
    for (const s of scopes) set.add(s);
  }
  return [...set].sort().join(',');
}
