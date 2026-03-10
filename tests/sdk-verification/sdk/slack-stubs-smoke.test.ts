import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

/**
 * Tier 2 stub smoke tests (SLCK-08)
 * Verifies that stub methods return ok:true from the twin.
 * These methods do not have full state backing — they exist to prevent
 * WebClient from receiving 404 transport errors when SDK consumers call them.
 */
describe('Slack Tier 2 stubs smoke (SLCK-08)', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

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

  it('search.messages returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.search.messages({ query: 'hello' });
    expect(result.ok).toBe(true);
  });

  it('reminders.add returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.add({
      text: 'Test reminder',
      time: String(Math.floor(Date.now() / 1000) + 3600),
    });
    expect(result.ok).toBe(true);
  });

  it('reminders.list returns ok:true and empty array (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.reminders.list({});
    expect(result.ok).toBe(true);
    expect(Array.isArray((result as any).reminders)).toBe(true);
  });

  it('bots.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.bots.info({ bot: 'B_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect((result as any).bot?.id).toBe('B_BOT_TWIN');
  });

  it('emoji.list returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.emoji.list({});
    expect(result.ok).toBe(true);
  });

  it('team.info returns ok:true and team id (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.team.info({});
    expect(result.ok).toBe(true);
    expect((result as any).team?.id).toBe('T_TWIN');
  });

  it('dnd.info returns ok:true (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.dnd.info({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
  });

  it('usergroups.list returns ok:true and empty array (stub)', async () => {
    const client = createSlackClient(token);
    const result = await client.usergroups.list({});
    expect(result.ok).toBe(true);
    expect(Array.isArray((result as any).usergroups)).toBe(true);
  });
});
