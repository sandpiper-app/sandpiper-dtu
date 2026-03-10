import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack reactions family (SLCK-08)', () => {
  let token: string;
  const channelId = 'C_GENERAL';

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  it('reactions.add returns ok:true', async () => {
    const client = createSlackClient(token);
    const msg = await client.chat.postMessage({ channel: channelId, text: 'react to me' });
    const result = await client.reactions.add({ channel: channelId, name: 'thumbsup', timestamp: msg.ts! });
    expect(result.ok).toBe(true);
  });

  it('reactions.get returns message with reactions grouped by name', async () => {
    const client = createSlackClient(token);
    const msg = await client.chat.postMessage({ channel: channelId, text: 'react and get' });
    await client.reactions.add({ channel: channelId, name: 'fire', timestamp: msg.ts! });
    const result = await client.reactions.get({ channel: channelId, timestamp: msg.ts! });
    expect(result.ok).toBe(true);
    expect((result as any).type).toBe('message');
    const reactions = (result as any).message?.reactions ?? [];
    const fireReaction = reactions.find((r: any) => r.name === 'fire');
    expect(fireReaction).toBeDefined();
    expect(fireReaction.count).toBe(1);
  });

  it('reactions.list returns ok:true and items array', async () => {
    const client = createSlackClient(token);
    const result = await client.reactions.list({ user: 'U_BOT_TWIN' });
    expect(result.ok).toBe(true);
    expect(Array.isArray((result as any).items)).toBe(true);
  });

  it('reactions.remove returns ok:true', async () => {
    const client = createSlackClient(token);
    const msg = await client.chat.postMessage({ channel: channelId, text: 'remove reaction' });
    await client.reactions.add({ channel: channelId, name: 'wave', timestamp: msg.ts! });
    const result = await client.reactions.remove({ channel: channelId, name: 'wave', timestamp: msg.ts! });
    expect(result.ok).toBe(true);
  });
});
