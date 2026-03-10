import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack pins family (SLCK-08)', () => {
  let token: string;
  const channelId = 'C_GENERAL';

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  it('pins.add returns ok:true', async () => {
    const client = createSlackClient(token);
    const msg = await client.chat.postMessage({ channel: channelId, text: 'pin me' });
    const result = await client.pins.add({ channel: channelId, timestamp: msg.ts! });
    expect(result.ok).toBe(true);
  });

  it('pins.list returns ok:true and items array', async () => {
    const client = createSlackClient(token);
    const result = await client.pins.list({ channel: channelId });
    expect(result.ok).toBe(true);
    expect(Array.isArray((result as any).items)).toBe(true);
  });

  it('pins.remove returns ok:true', async () => {
    const client = createSlackClient(token);
    const msg = await client.chat.postMessage({ channel: channelId, text: 'unpin me' });
    const result = await client.pins.remove({ channel: channelId, timestamp: msg.ts! });
    expect(result.ok).toBe(true);
  });
});
