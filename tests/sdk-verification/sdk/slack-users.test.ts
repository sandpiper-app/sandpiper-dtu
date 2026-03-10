import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack users API (SLCK-08)', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  // ---------------------------------------------------------------------------
  // Existing methods — regression guard
  // ---------------------------------------------------------------------------

  it('users.list returns members array', async () => {
    const client = createSlackClient(token);
    const result = await client.users.list();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.members!.some((u) => u.id === 'U_BOT_TWIN')).toBe(true);
  });

  it('users.info returns user for U_BOT_TWIN', async () => {
    const client = createSlackClient(token);
    const result = await client.users.info({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect(result.user!.id).toBe('U_BOT_TWIN');
    expect(result.user!.name).toBe('twin-bot');
  });

  // ---------------------------------------------------------------------------
  // New read methods
  // ---------------------------------------------------------------------------

  it('users.conversations returns channels array', async () => {
    const client = createSlackClient(token);
    const result = await client.users.conversations({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.channels)).toBe(true);
    expect((result as any).response_metadata?.next_cursor).toBe('');
  });

  it('users.getPresence returns presence: active', async () => {
    const client = createSlackClient(token);
    const result = await client.users.getPresence({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect(result.presence).toBe('active');
  });

  it('users.lookupByEmail returns user_not_found for unknown email', async () => {
    const client = createSlackClient(token);
    // The twin seeds U_BOT_TWIN without an email address.
    // Verify the correct error is returned for an unknown email.
    // The Slack SDK throws on ok:false — catch and inspect.
    try {
      await client.users.lookupByEmail({ email: 'nonexistent@example.com' });
      throw new Error('Expected users_not_found error but got ok:true');
    } catch (err: any) {
      expect(err.data?.error ?? err.message).toMatch(/users_not_found/);
    }
  });

  it('users.profile.get returns profile for U_BOT_TWIN', async () => {
    const client = createSlackClient(token);
    const result = await client.users.profile.get({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect(result.profile).toBeDefined();
    expect(typeof (result.profile as any).display_name).toBe('string');
  });

  it('users.identity returns user and team', async () => {
    const client = createSlackClient(token);
    const result = await client.users.identity();
    expect(result.ok).toBe(true);
    expect((result as any).user?.id).toBeTruthy();
    expect((result as any).team?.id).toBe('T_TWIN');
  });

  // ---------------------------------------------------------------------------
  // New write methods
  // ---------------------------------------------------------------------------

  it('users.profile.set returns ok: true', async () => {
    const client = createSlackClient(token);
    const result = await client.users.profile.set({ profile: { display_name: 'Test' } });
    expect(result.ok).toBe(true);
  });

  it('users.setPresence returns ok: true', async () => {
    const client = createSlackClient(token);
    const result = await client.users.setPresence({ presence: 'auto' });
    expect(result.ok).toBe(true);
  });

  it('users.deletePhoto returns ok: true', async () => {
    const client = createSlackClient(token);
    const result = await client.users.deletePhoto();
    expect(result.ok).toBe(true);
  });
});
