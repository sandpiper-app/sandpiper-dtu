import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack conversations API (SLCK-08)', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  // ---------------------------------------------------------------------------
  // Existing methods — regression guard
  // ---------------------------------------------------------------------------

  it('conversations.list returns channels array', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.list();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.channels)).toBe(true);
    // C_GENERAL is always seeded
    expect(result.channels!.some((ch) => ch.id === 'C_GENERAL')).toBe(true);
  });

  it('conversations.info returns channel for C_GENERAL', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.info({ channel: 'C_GENERAL' });
    expect(result.ok).toBe(true);
    expect(result.channel!.id).toBe('C_GENERAL');
    expect(result.channel!.name).toBe('general');
  });

  it('conversations.history returns messages array', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.history({ channel: 'C_GENERAL' });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // State-mutating methods
  // ---------------------------------------------------------------------------

  it('conversations.create creates a new channel', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.create({ name: 'new-channel' });
    expect(result.ok).toBe(true);
    expect(result.channel).toBeDefined();
    expect(result.channel!.id).toBeTruthy();
    expect(result.channel!.name).toBe('new-channel');
  });

  it('conversations.join returns ok and channel', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.join({ channel: 'C_GENERAL' });
    expect(result.ok).toBe(true);
    expect(result.channel).toBeDefined();
    expect((result.channel as any).id).toBe('C_GENERAL');
  });

  it('conversations.leave returns ok', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.leave({ channel: 'C_GENERAL' });
    expect(result.ok).toBe(true);
  });

  it('conversations.archive archives a channel', async () => {
    const client = createSlackClient(token);
    // Create a fresh channel to archive (can't archive the only channel easily)
    const created = await client.conversations.create({ name: 'to-archive-' + Date.now() });
    expect(created.ok).toBe(true);
    const result = await client.conversations.archive({ channel: created.channel!.id! });
    expect(result.ok).toBe(true);
  });

  it('conversations.unarchive unarchives a channel', async () => {
    const client = createSlackClient(token);
    const created = await client.conversations.create({ name: 'to-unarchive-' + Date.now() });
    await client.conversations.archive({ channel: created.channel!.id! });
    const result = await client.conversations.unarchive({ channel: created.channel!.id! });
    expect(result.ok).toBe(true);
  });

  it('conversations.rename renames a channel', async () => {
    const client = createSlackClient(token);
    const created = await client.conversations.create({ name: 'before-rename-' + Date.now() });
    const result = await client.conversations.rename({
      channel: created.channel!.id!,
      name: 'after-rename',
    });
    expect(result.ok).toBe(true);
    expect((result as any).channel?.name).toBe('after-rename');
  });

  it('conversations.invite invites a user to a channel', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.invite({
      channel: 'C_GENERAL',
      users: 'U_BOT_TWIN',
    });
    expect(result.ok).toBe(true);
    expect(result.channel).toBeDefined();
  });

  it('conversations.kick removes a user from a channel', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.kick({
      channel: 'C_GENERAL',
      user: 'U_BOT_TWIN',
    });
    expect(result.ok).toBe(true);
  });

  it('conversations.open opens a DM channel', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.open({ users: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect(result.channel).toBeDefined();
    expect((result.channel as any).id).toBeTruthy();
  });

  it('conversations.close closes a channel', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.close({ channel: 'C_GENERAL' });
    expect(result.ok).toBe(true);
  });

  it('conversations.mark marks the read position', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.mark({
      channel: 'C_GENERAL',
      ts: '1234567890.000001',
    });
    expect(result.ok).toBe(true);
  });

  it('conversations.setPurpose sets channel purpose', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.setPurpose({
      channel: 'C_GENERAL',
      purpose: 'test purpose',
    });
    expect(result.ok).toBe(true);
    expect((result as any).purpose).toBe('test purpose');
  });

  it('conversations.setTopic sets channel topic', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.setTopic({
      channel: 'C_GENERAL',
      topic: 'test topic',
    });
    expect(result.ok).toBe(true);
    expect((result as any).topic).toBe('test topic');
  });

  it('conversations.members returns members array', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.members({ channel: 'C_GENERAL' });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.response_metadata).toBeDefined();
    expect((result.response_metadata as any).next_cursor).toBe('');
  });

  it('conversations.replies returns thread messages', async () => {
    const client = createSlackClient(token);
    // Use a timestamp that may not exist — should still return ok: true with empty array
    const result = await client.conversations.replies({
      channel: 'C_GENERAL',
      ts: '1234567890.000001',
    });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.has_more).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Slack Connect stubs
  // ---------------------------------------------------------------------------

  it('conversations.acceptSharedInvite returns ok: true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await (client.conversations as any).acceptSharedInvite({});
    expect(result.ok).toBe(true);
  });

  it('conversations.approveSharedInvite returns ok: true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await (client.conversations as any).approveSharedInvite({});
    expect(result.ok).toBe(true);
  });

  it('conversations.declineSharedInvite returns ok: true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await (client.conversations as any).declineSharedInvite({});
    expect(result.ok).toBe(true);
  });

  it('conversations.inviteShared returns ok: true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await (client.conversations as any).inviteShared({});
    expect(result.ok).toBe(true);
  });

  it('conversations.listConnectInvites returns ok: true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await (client.conversations as any).listConnectInvites({});
    expect(result.ok).toBe(true);
  });

  it('conversations.requestSharedInvite.list returns ok: true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.conversations.requestSharedInvite.list();
    expect(result.ok).toBe(true);
  });
});
