/**
 * SLCK-17: State tables for membership, views, pins, reactions
 *
 * Wave 0 failing tests — five test groups that verify state-backed behaviors
 * currently missing from the twin. All tests are expected to FAIL against the
 * current implementation. Plan 04 will add the state tables and update handlers.
 *
 * Group 1: Channel membership (conversations.invite / kick / members)
 *   - Currently fails: invite/kick return ok:true but write no membership rows;
 *     conversations.members always returns ['U_BOT_TWIN'] regardless.
 *
 * Group 2: conversations.open returns real DM channel (not D_TWIN)
 *   - Currently fails: hardcoded return { id: 'D_TWIN', is_im: true }.
 *
 * Group 3: views.open → views.update lifecycle with stable view ID
 *   - Currently fails: views.update ignores view_id and returns a fresh generic view.
 *
 * Group 4: pins.add deduplication
 *   - Currently fails: pins.add is stateless, never returns 'already_pinned'.
 *
 * Group 5: reactions.add deduplication and reactions.remove
 *   - Currently fails: reactions.add has no UNIQUE constraint; reactions.remove is a no-op.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken, seedSlackChannel } from '../setup/seeders.js';

// ============================================================================
// Group 1: Channel membership — conversations.invite / kick / members
// ============================================================================

describe('SLCK-17: Channel membership state (conversations.invite/kick/members)', () => {
  let token: string;
  let channelId: string;
  let userId: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
    channelId = await seedSlackChannel('membership-test');

    // Seed a user to invite
    const baseUrl = process.env.SLACK_API_URL!;
    const res = await fetch(baseUrl + '/admin/fixtures/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users: [{ id: 'U_INVITEE', name: 'invitee', team_id: 'T_TWIN' }],
      }),
    });
    if (!res.ok) throw new Error(`Failed to seed user: ${res.status}`);
    userId = 'U_INVITEE';
  });

  it('invited user appears in conversations.members', async () => {
    const client = createSlackClient(token);

    // Invite the user to the channel
    const inviteRes = await client.conversations.invite({ channel: channelId, users: userId });
    expect(inviteRes.ok).toBe(true);

    // Now members should include the invited user
    // This FAILS because invite currently writes no membership row
    const membersRes = await client.conversations.members({ channel: channelId });
    expect(membersRes.ok).toBe(true);
    expect(membersRes.members).toContain(userId);
  });

  it('kicked user no longer appears in conversations.members', async () => {
    const client = createSlackClient(token);

    // Invite first
    await client.conversations.invite({ channel: channelId, users: userId });

    // Then kick
    const kickRes = await client.conversations.kick({ channel: channelId, user: userId });
    expect(kickRes.ok).toBe(true);

    // User should be gone from members list
    // This FAILS because kick currently writes no membership row
    const membersRes = await client.conversations.members({ channel: channelId });
    expect(membersRes.ok).toBe(true);
    expect(membersRes.members).not.toContain(userId);
  });
});

// ============================================================================
// Group 2: conversations.open returns real DM channel (not D_TWIN)
// ============================================================================

describe('SLCK-17: conversations.open returns real DM channel', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();

    // Seed another user for DM
    const baseUrl = process.env.SLACK_API_URL!;
    await fetch(baseUrl + '/admin/fixtures/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users: [{ id: 'U_DM_TARGET', name: 'dm-target', team_id: 'T_TWIN' }],
      }),
    });
  });

  it('conversations.open returns a DM channel with a real stable ID (not D_TWIN)', async () => {
    const client = createSlackClient(token);

    // Open DM with a user
    const result = await client.conversations.open({ users: 'U_DM_TARGET' });
    expect(result.ok).toBe(true);
    expect(result.channel).toBeDefined();

    // This FAILS because current implementation hardcodes { id: 'D_TWIN' }
    expect(result.channel!.id).not.toBe('D_TWIN');
    expect(result.channel!.is_im).toBe(true);
  });

  it('opening the same DM twice returns already_open:true with consistent channel ID', async () => {
    const client = createSlackClient(token);

    const first = await client.conversations.open({ users: 'U_DM_TARGET' });
    expect(first.ok).toBe(true);
    const firstId = first.channel!.id;

    const second = await client.conversations.open({ users: 'U_DM_TARGET' });
    expect(second.ok).toBe(true);

    // This FAILS because hardcoded D_TWIN doesn't track whether it was "already open"
    expect(second.already_open).toBe(true);
    expect(second.channel!.id).toBe(firstId);
  });
});

// ============================================================================
// Group 3: views.open → views.update lifecycle with stable view ID
// ============================================================================

describe('SLCK-17: views.open / views.update persistent lifecycle', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  it('views.update with returned view_id updates the stored view title', async () => {
    const client = createSlackClient(token);

    const sampleView = {
      type: 'modal' as const,
      title: { type: 'plain_text' as const, text: 'Original Title' },
      blocks: [],
      callback_id: 'test_modal',
    };

    // Open a modal and capture its view_id
    const openRes = await client.views.open({ trigger_id: 'TRIGGER_TEST', view: sampleView });
    expect(openRes.ok).toBe(true);
    const viewId = openRes.view?.id;
    expect(viewId).toBeDefined();

    // Update the view using the returned view_id
    const updatedView = {
      type: 'modal' as const,
      title: { type: 'plain_text' as const, text: 'Updated Title' },
      blocks: [],
      callback_id: 'test_modal',
    };
    const updateRes = await client.views.update({ view_id: viewId!, view: updatedView });
    expect(updateRes.ok).toBe(true);

    // The returned view should have the new title, not the original
    // This FAILS because views.update ignores view_id and returns a fresh generic view
    expect(updateRes.view?.title?.text).toBe('Updated Title');
    expect(updateRes.view?.id).toBe(viewId);
  });

  it('views.update with unknown view_id returns view_not_found error', async () => {
    const client = createSlackClient(token);

    try {
      await client.views.update({
        view_id: 'V_NONEXISTENT',
        view: {
          type: 'modal' as const,
          title: { type: 'plain_text' as const, text: 'Should Fail' },
          blocks: [],
        },
      });
      expect.fail('Should have thrown view_not_found');
    } catch (e: any) {
      expect(e.data?.error ?? e.message).toBe('view_not_found');
    }
  });
});

// ============================================================================
// Group 4: pins.add deduplication
// ============================================================================

describe('SLCK-17: pins.add deduplication (already_pinned)', () => {
  let token: string;
  const testChannel = 'C_GENERAL';
  const testTimestamp = '1700000000.000001';

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  it('pins.add adds a pin and returns ok:true', async () => {
    const client = createSlackClient(token);
    const res = await client.pins.add({ channel: testChannel, timestamp: testTimestamp });
    expect(res.ok).toBe(true);
  });

  it('pins.add with duplicate channel+timestamp returns already_pinned error', async () => {
    const client = createSlackClient(token);

    // First add succeeds
    await client.pins.add({ channel: testChannel, timestamp: testTimestamp });

    // Second add for same channel+timestamp should fail with already_pinned
    try {
      await client.pins.add({ channel: testChannel, timestamp: testTimestamp });
      expect.fail('Should have thrown already_pinned');
    } catch (e: any) {
      expect(e.data?.error ?? e.message).toBe('already_pinned');
    }
  });

  it('pins.list returns the added pin', async () => {
    const client = createSlackClient(token);

    await client.pins.add({ channel: testChannel, timestamp: testTimestamp });

    // This FAILS because pins.add is stateless (no rows stored)
    const listRes = await client.pins.list({ channel: testChannel });
    expect(listRes.ok).toBe(true);
    const items = (listRes as any).items as any[];
    expect(items).toBeDefined();
    expect(items.length).toBeGreaterThan(0);
    const pin = items.find((p: any) => p.message?.ts === testTimestamp);
    expect(pin).toBeDefined();
  });
});

// ============================================================================
// Group 5: reactions.add deduplication and reactions.remove
// ============================================================================

describe('SLCK-17: reactions deduplication and remove', () => {
  let token: string;
  const testChannel = 'C_GENERAL';
  const testTimestamp = '1700000001.000001';
  const reaction = 'thumbsup';

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();

    // Seed a message to react to
    const baseUrl = process.env.SLACK_API_URL!;
    await fetch(baseUrl + '/admin/fixtures/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ ts: testTimestamp, channel_id: testChannel, text: 'reaction target', user_id: 'U_BOT_TWIN' }],
      }),
    });
  });

  it('reactions.add returns ok:true on first call', async () => {
    const client = createSlackClient(token);
    const res = await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });
    expect(res.ok).toBe(true);
  });

  it('reactions.add with same reaction returns already_reacted error', async () => {
    const client = createSlackClient(token);

    // First add succeeds
    await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });

    // Second add with same reaction should fail
    try {
      await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });
      expect.fail('Should have thrown already_reacted');
    } catch (e: any) {
      expect(e.data?.error ?? e.message).toBe('already_reacted');
    }
  });

  it('reactions.remove decrements reaction count', async () => {
    const client = createSlackClient(token);

    // Add reaction
    await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });

    // Remove reaction
    // This FAILS because reactions.remove is a no-op
    const removeRes = await client.reactions.remove({ channel: testChannel, timestamp: testTimestamp, name: reaction });
    expect(removeRes.ok).toBe(true);

    // Verify reaction count is 0 after remove
    const getRes = await client.reactions.get({ channel: testChannel, timestamp: testTimestamp });
    expect(getRes.ok).toBe(true);
    const reactionEntry = (getRes.message as any)?.reactions?.find((r: any) => r.name === reaction);
    // Reaction should be absent (removed) — count should be 0 or the reaction entry shouldn't exist
    expect(reactionEntry?.count ?? 0).toBe(0);
  });

  it('reactions.add after remove succeeds (no phantom dedup)', async () => {
    const client = createSlackClient(token);

    // Add, remove, then re-add — should succeed
    await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });

    // This FAILS because reactions.remove is a no-op — re-add would hit the dedup constraint
    await client.reactions.remove({ channel: testChannel, timestamp: testTimestamp, name: reaction });

    const reAddRes = await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });
    expect(reAddRes.ok).toBe(true);
  });
});
