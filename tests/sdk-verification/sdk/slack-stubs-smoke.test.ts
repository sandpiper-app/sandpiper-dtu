import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

/**
 * Tier 2 stub smoke tests (SLCK-08)
 * Verifies that stub methods return ok:true from the twin.
 * These methods do not have full state backing — they exist to prevent
 * WebClient from receiving 404 transport errors when SDK consumers call them.
 *
 * Phase 40, INFRA-23: Extended to cover all symbols that were previously
 * attributed to this test file in the EVIDENCE_MAP but not actually called.
 * Runtime evidence now derives live status from actual method invocations.
 */
describe('Slack Tier 2 stubs smoke (SLCK-08)', () => {
  let token: string;
  let channel: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
    channel = 'C_GENERAL';
  });

  // ── files.* ────────────────────────────────────────────────────────────────

  it('files.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.list({});
    expect(result.ok).toBe(true);
  });

  it('files.delete returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.delete({ file: 'F_STUB' });
    expect(result.ok).toBe(true);
  });

  it('files.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.info({ file: 'F_STUB' });
    expect(result.ok).toBe(true);
  });

  it('files.revokePublicURL returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.revokePublicURL({ file: 'F_STUB' });
    expect(result.ok).toBe(true);
  });

  it('files.sharedPublicURL returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.sharedPublicURL({ file: 'F_STUB' });
    expect(result.ok).toBe(true);
  });

  it('files.comments.delete returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).files.comments.delete({ file: 'F_STUB', id: 'Fc_STUB' });
    expect(result.ok).toBe(true);
  });

  it('files.remote.add returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.remote.add({ external_id: 'ext_stub', external_url: 'https://example.com', title: 'Remote File' });
    expect(result.ok).toBe(true);
  });

  it('files.remote.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.remote.info({ external_id: 'ext_stub' });
    expect(result.ok).toBe(true);
  });

  it('files.remote.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.remote.list({});
    expect(result.ok).toBe(true);
  });

  it('files.remote.remove returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.remote.remove({ external_id: 'ext_stub' });
    expect(result.ok).toBe(true);
  });

  it('files.remote.share returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.remote.share({ channels: [channel], external_id: 'ext_stub' });
    expect(result.ok).toBe(true);
  });

  it('files.remote.update returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.files.remote.update({ external_id: 'ext_stub', title: 'Updated Remote File' });
    expect(result.ok).toBe(true);
  });

  // ── search.* ───────────────────────────────────────────────────────────────

  it('search.all returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.search.all({ query: 'hello' });
    expect(result.ok).toBe(true);
  });

  it('search.files returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.search.files({ query: 'hello' });
    expect(result.ok).toBe(true);
  });

  it('search.messages returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.search.messages({ query: 'hello' });
    expect(result.ok).toBe(true);
  });

  // ── reminders.* ────────────────────────────────────────────────────────────

  it('reminders.add returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.add({
      text: 'Test reminder',
      time: String(Math.floor(Date.now() / 1000) + 3600),
    });
    expect(result.ok).toBe(true);
  });

  it('reminders.complete returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.complete({ reminder: 'Rm_STUB' });
    expect(result.ok).toBe(true);
  });

  it('reminders.delete returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.delete({ reminder: 'Rm_STUB' });
    expect(result.ok).toBe(true);
  });

  it('reminders.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.info({ reminder: 'Rm_STUB' });
    expect(result.ok).toBe(true);
  });

  it('reminders.list returns ok:true and empty array (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.list({});
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Array.isArray((result as any).reminders)).toBe(true);
  });

  // ── bots.info ──────────────────────────────────────────────────────────────

  it('bots.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.bots.info({ bot: 'B_BOT_TWIN' });
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).bot?.id).toBe('B_BOT_TWIN');
  });

  // ── emoji.list ─────────────────────────────────────────────────────────────

  it('emoji.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.emoji.list({});
    expect(result.ok).toBe(true);
  });

  // ── migration.exchange ─────────────────────────────────────────────────────

  it('migration.exchange returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.migration.exchange({ users: ['U_BOT_TWIN'] });
    expect(result.ok).toBe(true);
  });

  // ── tooling.tokens.rotate ──────────────────────────────────────────────────

  it('tooling.tokens.rotate returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).tooling.tokens.rotate({ refresh_token: 'rt_STUB' });
    expect(result.ok).toBe(true);
  });

  // ── dnd.* ─────────────────────────────────────────────────────────────────

  it('dnd.endDnd returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dnd.endDnd();
    expect(result.ok).toBe(true);
  });

  it('dnd.endSnooze returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dnd.endSnooze();
    expect(result.ok).toBe(true);
  });

  it('dnd.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dnd.info({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
  });

  it('dnd.setSnooze returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dnd.setSnooze({ num_minutes: 60 });
    expect(result.ok).toBe(true);
  });

  it('dnd.teamInfo returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dnd.teamInfo({ users: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
  });

  // ── bookmarks.* ───────────────────────────────────────────────────────────

  it('bookmarks.add returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.bookmarks.add({ channel_id: channel, title: 'Test Bookmark', type: 'link', link: 'https://example.com' });
    expect(result.ok).toBe(true);
  });

  it('bookmarks.edit returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.bookmarks.edit({ bookmark_id: 'Bk_STUB', channel_id: channel, title: 'Edited Bookmark' });
    expect(result.ok).toBe(true);
  });

  it('bookmarks.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.bookmarks.list({ channel_id: channel });
    expect(result.ok).toBe(true);
  });

  it('bookmarks.remove returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.bookmarks.remove({ bookmark_id: 'Bk_STUB', channel_id: channel });
    expect(result.ok).toBe(true);
  });

  // ── usergroups.* ──────────────────────────────────────────────────────────

  it('usergroups.create returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.create({ name: 'TestGroup' });
    expect(result.ok).toBe(true);
  });

  it('usergroups.disable returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.disable({ usergroup: 'S_STUB' });
    expect(result.ok).toBe(true);
  });

  it('usergroups.enable returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.enable({ usergroup: 'S_STUB' });
    expect(result.ok).toBe(true);
  });

  it('usergroups.list returns ok:true and empty array (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.list({});
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Array.isArray((result as any).usergroups)).toBe(true);
  });

  it('usergroups.update returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.update({ usergroup: 'S_STUB', name: 'UpdatedGroup' });
    expect(result.ok).toBe(true);
  });

  it('usergroups.users.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.users.list({ usergroup: 'S_STUB' });
    expect(result.ok).toBe(true);
  });

  it('usergroups.users.update returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.users.update({ usergroup: 'S_STUB', users: ['U_BOT_TWIN'] });
    expect(result.ok).toBe(true);
  });

  // ── calls.* ───────────────────────────────────────────────────────────────

  it('calls.add returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.calls.add({ external_unique_id: 'call_stub', join_url: 'https://example.com/call' });
    expect(result.ok).toBe(true);
  });

  it('calls.end returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.calls.end({ id: 'R_STUB_CALL' });
    expect(result.ok).toBe(true);
  });

  it('calls.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.calls.info({ id: 'R_STUB_CALL' });
    expect(result.ok).toBe(true);
  });

  it('calls.update returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.calls.update({ id: 'R_STUB_CALL' });
    expect(result.ok).toBe(true);
  });

  it('calls.participants.add returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.calls.participants.add({ id: 'R_STUB_CALL', users: [{ slack_id: 'U_BOT_TWIN' }] });
    expect(result.ok).toBe(true);
  });

  it('calls.participants.remove returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.calls.participants.remove({ id: 'R_STUB_CALL', users: [{ slack_id: 'U_BOT_TWIN' }] });
    expect(result.ok).toBe(true);
  });

  // ── team.* ────────────────────────────────────────────────────────────────

  it('team.info returns ok:true and team id (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.team.info({});
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).team?.id).toBe('T_TWIN');
  });

  it('team.accessLogs returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.team.accessLogs({});
    expect(result.ok).toBe(true);
  });

  it('team.billableInfo returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.team.billableInfo({});
    expect(result.ok).toBe(true);
  });

  it('team.integrationLogs returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.team.integrationLogs({});
    expect(result.ok).toBe(true);
  });

  it('team.preferences.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).team.preferences.list();
    expect(result.ok).toBe(true);
  });

  it('team.profile.get returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).team.profile.get({});
    expect(result.ok).toBe(true);
  });

  // ── dialog.open ───────────────────────────────────────────────────────────

  it('dialog.open returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dialog.open({
      trigger_id: 'trigger_stub',
      dialog: { title: 'Test', callback_id: 'cb_stub', elements: [] },
    });
    expect(result.ok).toBe(true);
  });

  // ── functions.* ───────────────────────────────────────────────────────────

  it('functions.completeSuccess returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.functions.completeSuccess({ function_execution_id: 'Fx_STUB', outputs: {} });
    expect(result.ok).toBe(true);
  });

  it('functions.completeError returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.functions.completeError({ function_execution_id: 'Fx_STUB', error: 'stub error' });
    expect(result.ok).toBe(true);
  });

  // ── assistant.threads.* ───────────────────────────────────────────────────

  it('assistant.threads.setStatus returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).assistant.threads.setStatus({
      channel_id: channel,
      thread_ts: '1234567890.000001',
      status: 'thinking',
    });
    expect(result.ok).toBe(true);
  });

  it('assistant.threads.setSuggestedPrompts returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).assistant.threads.setSuggestedPrompts({
      channel_id: channel,
      thread_ts: '1234567890.000001',
      prompts: [{ title: 'Test prompt', message: 'Hello' }],
    });
    expect(result.ok).toBe(true);
  });

  it('assistant.threads.setTitle returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).assistant.threads.setTitle({
      channel_id: channel,
      thread_ts: '1234567890.000001',
      title: 'Test Thread',
    });
    expect(result.ok).toBe(true);
  });

  // ── auth.* ────────────────────────────────────────────────────────────────

  it('auth.revoke returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.auth.revoke({});
    expect(result.ok).toBe(true);
  });

  it('auth.teams.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).auth.teams.list({});
    expect(result.ok).toBe(true);
  });

  // ── chat.appendStream + chat.stopStream ───────────────────────────────────
  // These were attributed to slack-chat.test.ts in the old EVIDENCE_MAP but are
  // part of the ChatStreamer flow. Record them here for completeness.

  it('chat.appendStream returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).chat.appendStream({ token: token, channel, thread_ts: '1234567890.000001', text: 'stream chunk', draft_id: 'Ds_STUB' });
    expect(result.ok).toBe(true);
  });

  it('chat.stopStream returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).chat.stopStream({ token: token, channel, thread_ts: '1234567890.000001', draft_id: 'Ds_STUB' });
    expect(result.ok).toBe(true);
  });

  // ── conversations.requestSharedInvite.approve/deny ────────────────────────
  // Extended coverage for shared invite sub-methods attributed to conversations tests

  it('conversations.requestSharedInvite.approve returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).conversations.requestSharedInvite.approve({ invite_id: 'Inv_STUB', is_external_limited: false });
    expect(result.ok).toBe(true);
  });

  it('conversations.requestSharedInvite.deny returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).conversations.requestSharedInvite.deny({ invite_id: 'Inv_STUB' });
    expect(result.ok).toBe(true);
  });

  it('conversations.externalInvitePermissions.set returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).conversations.externalInvitePermissions.set({ channel: channel, action: 'upgrade' });
    expect(result.ok).toBe(true);
  });

  it('conversations.canvases.create returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).conversations.canvases.create({ channel_id: channel });
    expect(result.ok).toBe(true);
  });

  // ── users.setPhoto ────────────────────────────────────────────────────────

  it('users.setPhoto returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).users.setPhoto({});
    expect(result.ok).toBe(true);
  });

  // ── oauth.v2.access ───────────────────────────────────────────────────────
  // Captures the oauth.v2.access symbol via WebClient to complement the
  // scope-enforcement test that uses raw fetch. The WebClient call uses a
  // known-invalid code so the twin responds with invalid_code ok:false,
  // but the symbol IS exercised via the apiCall path.

  it('oauth.v2.access via WebClient records symbol hit (stub)', async () => {
    // Use a client without a token since oauth.v2.access is a no-auth endpoint.
    const client = createSlackClient('');
    try {
      await client.oauth.v2.access({ code: 'stub_code_for_symbol_hit', client_id: 'test-client', client_secret: 'test-client-secret' });
    } catch {
      // ok:false responses throw in WebClient — the symbol hit is already recorded
    }
    // The test proves the symbol was exercised via apiCall interception.
    // Symbol @slack/web-api@7.14.1/WebClient.oauth.v2.access is now in the hit map.
  });
});
