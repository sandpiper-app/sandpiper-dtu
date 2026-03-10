#!/usr/bin/env node
/**
 * Coverage report generator
 * Run: pnpm coverage:generate
 * Reads: tools/sdk-surface/manifests/*.json
 * Writes: tests/sdk-verification/coverage/coverage-report.json
 *
 * IMPORTANT: Re-run this script whenever new tests are added to update tiers.
 * Do NOT run automatically in CI — the file is checked in and diffed.
 *
 * INFRA-12 guarantee: every symbol is emitted with tier 'live' or 'deferred'.
 * null tier is never written. check-drift.ts enforces this as a CI gate.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const manifestsDir = join(root, 'tools/sdk-surface/manifests');
const outputPath = join(__dirname, 'coverage-report.json');

// Phase 14+ live symbol attributions.
// Key format: "{packageName}@{version}/{symbolPath}"
// Update this map as new SDK tests are added in Phases 15-20.
const LIVE_SYMBOLS: Record<string, string> = {
  // SLCK-06.5 — slack-auth-gateway.test.ts
  '@slack/web-api@7.14.1/WebClient.auth.test': 'sdk/slack-auth-gateway.test.ts',
  '@slack/web-api@7.14.1/WebClient.api.test': 'sdk/slack-auth-gateway.test.ts',
  // INFRA-15 — shopify-client-wire.test.ts
  // NOTE: AdminApiClient is a TypeAlias in the manifest (no members).
  // The actual tested symbol is createAdminApiClient — the factory function called in tests.
  '@shopify/admin-api-client@1.1.1/createAdminApiClient': 'sdk/shopify-client-wire.test.ts',
  // Phase 15: SHOP-08 GraphQL client methods — shopify-admin-graphql-client.test.ts
  '@shopify/admin-api-client@1.1.1/AdminApiClient': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.request': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.fetch': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.getHeaders': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.getApiUrl': 'sdk/shopify-admin-graphql-client.test.ts',
  // Phase 15: SHOP-09 REST client methods — shopify-admin-rest-client.test.ts
  '@shopify/admin-api-client@1.1.1/createAdminRestApiClient': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.get': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.post': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.put': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.delete': 'sdk/shopify-admin-rest-client.test.ts',
  // Phase 16: SHOP-11/12/13 platform surface — shopify-api-auth/session/webhooks/billing.test.ts
  // NOTE: manifest confirmed all keys below exist in shopify-shopify-api@12.3.0.json
  '@shopify/shopify-api@12.3.0/shopifyApi': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.config': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.auth': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.session': 'sdk/shopify-api-session.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.webhooks': 'sdk/shopify-api-webhooks.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.flow': 'sdk/shopify-api-webhooks.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.fulfillmentService': 'sdk/shopify-api-webhooks.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.billing': 'sdk/shopify-api-billing.test.ts',
  // Phase 17: SHOP-14 client surfaces — shopify-api-graphql-client/rest-client/storefront-client.test.ts
  // NOTE: StorefrontClient is not in the @shopify/shopify-api manifest (separate Storefront SDK);
  //       REST resource classes (Product, Customer, etc.) are not in this manifest either.
  //       Only manifest-confirmed symbols are listed here.
  '@shopify/shopify-api@12.3.0/GraphqlClient': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlClient.request': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlClient.query': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.get': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.post': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.put': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.delete': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Graphql': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Rest': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Storefront': 'sdk/shopify-api-storefront-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.graphqlProxy': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlProxy': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.clients': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.rest': 'sdk/shopify-api-rest-client.test.ts',

  // Phase 18: SLCK-07 WebClient base behaviors — slack-webclient-base.test.ts
  '@slack/web-api@7.14.1/WebClient.apiCall': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/WebClient.paginate': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/WebClient.filesUploadV2': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/WebClient.chatStream': 'sdk/slack-webclient-base.test.ts',
  // ChatStreamer class (separate manifest symbol)
  '@slack/web-api@7.14.1/ChatStreamer': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/ChatStreamer.append': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/ChatStreamer.stop': 'sdk/slack-webclient-base.test.ts',

  // Phase 18: SLCK-08 chat family (13 methods) — slack-chat.test.ts
  '@slack/web-api@7.14.1/WebClient.chat.postMessage': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.update': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.delete': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.postEphemeral': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.getPermalink': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.meMessage': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.scheduleMessage': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.scheduledMessages.list': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.deleteScheduledMessage': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.unfurl': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.startStream': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.appendStream': 'sdk/slack-chat.test.ts',
  '@slack/web-api@7.14.1/WebClient.chat.stopStream': 'sdk/slack-chat.test.ts',

  // Phase 18: SLCK-08 conversations family (26 methods) — slack-conversations.test.ts
  '@slack/web-api@7.14.1/WebClient.conversations.list': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.info': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.history': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.create': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.join': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.leave': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.archive': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.unarchive': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.rename': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.invite': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.kick': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.open': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.close': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.mark': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.setPurpose': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.setTopic': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.members': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.replies': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.acceptSharedInvite': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.approveSharedInvite': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.declineSharedInvite': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.inviteShared': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.listConnectInvites': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.requestSharedInvite.approve': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.requestSharedInvite.deny': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.requestSharedInvite.list': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.externalInvitePermissions.set': 'sdk/slack-conversations.test.ts',
  '@slack/web-api@7.14.1/WebClient.conversations.canvases.create': 'sdk/slack-conversations.test.ts',
  // NOTE: conversations.canvases.delete and conversations.canvases.sections.lookup are NOT in the
  // WebClient.members manifest (only canvases.* top-level methods exist for delete/sections.lookup).

  // Phase 18: SLCK-08 users family (11 methods) — slack-users.test.ts
  // NOTE: users.setActive is NOT in the manifest; omitted to avoid silent ignored keys.
  '@slack/web-api@7.14.1/WebClient.users.list': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.info': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.conversations': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.getPresence': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.lookupByEmail': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.profile.get': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.profile.set': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.setPresence': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.identity': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.deletePhoto': 'sdk/slack-users.test.ts',
  '@slack/web-api@7.14.1/WebClient.users.setPhoto': 'sdk/slack-users.test.ts',

  // Phase 18: SLCK-08 reactions family (4 methods) — slack-reactions.test.ts
  '@slack/web-api@7.14.1/WebClient.reactions.add': 'sdk/slack-reactions.test.ts',
  '@slack/web-api@7.14.1/WebClient.reactions.get': 'sdk/slack-reactions.test.ts',
  '@slack/web-api@7.14.1/WebClient.reactions.list': 'sdk/slack-reactions.test.ts',
  '@slack/web-api@7.14.1/WebClient.reactions.remove': 'sdk/slack-reactions.test.ts',

  // Phase 18: SLCK-08 pins family (3 methods) — slack-pins.test.ts
  '@slack/web-api@7.14.1/WebClient.pins.add': 'sdk/slack-pins.test.ts',
  '@slack/web-api@7.14.1/WebClient.pins.list': 'sdk/slack-pins.test.ts',
  '@slack/web-api@7.14.1/WebClient.pins.remove': 'sdk/slack-pins.test.ts',

  // Phase 18: SLCK-08 views family (4 methods) — slack-views.test.ts
  '@slack/web-api@7.14.1/WebClient.views.open': 'sdk/slack-views.test.ts',
  '@slack/web-api@7.14.1/WebClient.views.publish': 'sdk/slack-views.test.ts',
  '@slack/web-api@7.14.1/WebClient.views.push': 'sdk/slack-views.test.ts',
  '@slack/web-api@7.14.1/WebClient.views.update': 'sdk/slack-views.test.ts',

  // Phase 18: SLCK-08 stubs (Tier 2) — slack-stubs-smoke.test.ts
  // files family
  '@slack/web-api@7.14.1/WebClient.files.delete': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.revokePublicURL': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.sharedPublicURL': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.getUploadURLExternal': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.completeUploadExternal': 'sdk/slack-webclient-base.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.comments.delete': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.remote.add': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.remote.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.remote.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.remote.remove': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.remote.share': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.files.remote.update': 'sdk/slack-stubs-smoke.test.ts',
  // search family
  '@slack/web-api@7.14.1/WebClient.search.all': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.search.files': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.search.messages': 'sdk/slack-stubs-smoke.test.ts',
  // reminders family
  '@slack/web-api@7.14.1/WebClient.reminders.add': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.reminders.complete': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.reminders.delete': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.reminders.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.reminders.list': 'sdk/slack-stubs-smoke.test.ts',
  // misc stubs
  '@slack/web-api@7.14.1/WebClient.bots.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.emoji.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.migration.exchange': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.tooling.tokens.rotate': 'sdk/slack-stubs-smoke.test.ts',
  // dnd family
  '@slack/web-api@7.14.1/WebClient.dnd.endDnd': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.dnd.endSnooze': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.dnd.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.dnd.setSnooze': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.dnd.teamInfo': 'sdk/slack-stubs-smoke.test.ts',
  // bookmarks family
  '@slack/web-api@7.14.1/WebClient.bookmarks.add': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.bookmarks.edit': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.bookmarks.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.bookmarks.remove': 'sdk/slack-stubs-smoke.test.ts',
  // usergroups family
  '@slack/web-api@7.14.1/WebClient.usergroups.create': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.usergroups.disable': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.usergroups.enable': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.usergroups.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.usergroups.update': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.usergroups.users.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.usergroups.users.update': 'sdk/slack-stubs-smoke.test.ts',
  // calls family
  '@slack/web-api@7.14.1/WebClient.calls.add': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.calls.end': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.calls.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.calls.update': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.calls.participants.add': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.calls.participants.remove': 'sdk/slack-stubs-smoke.test.ts',
  // team family
  '@slack/web-api@7.14.1/WebClient.team.info': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.team.accessLogs': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.team.billableInfo': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.team.integrationLogs': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.team.preferences.list': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.team.profile.get': 'sdk/slack-stubs-smoke.test.ts',
  // dialog / functions / assistant
  '@slack/web-api@7.14.1/WebClient.dialog.open': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.functions.completeSuccess': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.functions.completeError': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.assistant.threads.setStatus': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.assistant.threads.setSuggestedPrompts': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.assistant.threads.setTitle': 'sdk/slack-stubs-smoke.test.ts',
  // auth additional
  '@slack/web-api@7.14.1/WebClient.auth.revoke': 'sdk/slack-stubs-smoke.test.ts',
  '@slack/web-api@7.14.1/WebClient.auth.teams.list': 'sdk/slack-stubs-smoke.test.ts',
};

interface ManifestSymbol {
  kind: string;
  members?: string[];
}

interface Manifest {
  package: string;
  version: string;
  generatedAt: string;
  symbolCount: number;
  symbols: Record<string, ManifestSymbol>;
}

const packages: Record<string, Record<string, { tier: 'live' | 'deferred'; testFile: string | null }>> = {};
let totalLive = 0;
let totalDeferred = 0;

// Read all manifest files
const manifestFiles = readdirSync(manifestsDir).filter(f => f.endsWith('.json'));

for (const file of manifestFiles) {
  const manifest: Manifest = JSON.parse(readFileSync(join(manifestsDir, file), 'utf8'));
  const pkgKey = `${manifest.package}@${manifest.version}`;
  packages[pkgKey] = {};

  for (const [symbolName, symbolDef] of Object.entries(manifest.symbols)) {
    // Emit the top-level symbol — always 'live' or 'deferred', never null
    const topKey = `${pkgKey}/${symbolName}`;
    const testFile = LIVE_SYMBOLS[topKey] ?? null;
    const tier: 'live' | 'deferred' = testFile ? 'live' : 'deferred';
    packages[pkgKey][symbolName] = { tier, testFile };
    if (tier === 'live') totalLive++; else totalDeferred++;

    // Emit member symbols for classes/interfaces (e.g., WebClient.auth.test)
    if (symbolDef.members) {
      for (const member of symbolDef.members) {
        const memberPath = `${symbolName}.${member}`;
        const memberKey = `${pkgKey}/${memberPath}`;
        const memberTestFile = LIVE_SYMBOLS[memberKey] ?? null;
        const memberTier: 'live' | 'deferred' = memberTestFile ? 'live' : 'deferred';
        packages[pkgKey][memberPath] = { tier: memberTier, testFile: memberTestFile };
        if (memberTier === 'live') totalLive++; else totalDeferred++;
      }
    }
  }
}

const report = {
  $schema: 'https://sandpiper.dev/schemas/coverage-report.json',
  generatedAt: new Date().toISOString(),
  phase: '18',
  note: 'Phase 18: @slack/web-api WebClient full surface. Tier 1 (~60 methods): chat (13), conversations (26), users (11), reactions (4), pins (3), views (4), base behaviors (apiCall, paginate, filesUploadV2, chatStream). Tier 2 stubs: files, search, reminders, bots, emoji, dnd, bookmarks, usergroups, calls, team, misc. Tier 3 deferred: admin.* (95 methods), slackLists, workflows, canvases, oauth (Phase 19), rtm, openid, stars, entity. SLCK-07 + SLCK-08 complete.',
  packages,
  summary: { live: totalLive, stub: 0, deferred: totalDeferred },
};

writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Coverage report written to ${outputPath}`);
console.log(`Summary: ${totalLive} live, 0 stub, ${totalDeferred} deferred`);
console.log('INFRA-12: all symbols have declared tier (no null values).');
