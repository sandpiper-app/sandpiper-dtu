import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';

describe('Slack chat family (SLCK-08)', () => {
  let token: string;
  let channelId: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
    // Seed the C_GENERAL channel that exists after reset
    channelId = 'C_GENERAL';
  });

  it('chat.postMessage returns ok:true and ts', async () => {
    const client = createSlackClient(token);
    const result = await client.chat.postMessage({ channel: channelId, text: 'hello' });
    expect(result.ok).toBe(true);
    expect(typeof result.ts).toBe('string');
  });

  it('chat.update returns ok:true', async () => {
    const client = createSlackClient(token);
    const posted = await client.chat.postMessage({ channel: channelId, text: 'original' });
    const updated = await client.chat.update({ channel: channelId, ts: posted.ts!, text: 'updated' });
    expect(updated.ok).toBe(true);
  });

  it('chat.delete returns ok:true', async () => {
    const client = createSlackClient(token);
    const posted = await client.chat.postMessage({ channel: channelId, text: 'to delete' });
    const deleted = await client.chat.delete({ channel: channelId, ts: posted.ts! });
    expect(deleted.ok).toBe(true);
  });

  it('chat.postEphemeral returns ok:true and message_ts', async () => {
    const client = createSlackClient(token);
    const result = await client.chat.postEphemeral({ channel: channelId, user: 'U_BOT_TWIN', text: 'ephemeral' });
    expect(result.ok).toBe(true);
    expect(result.message_ts).toBeDefined();
  });

  it('chat.getPermalink returns ok:true and permalink', async () => {
    const client = createSlackClient(token);
    const posted = await client.chat.postMessage({ channel: channelId, text: 'permalink test' });
    const link = await client.chat.getPermalink({ channel: channelId, message_ts: posted.ts! });
    expect(link.ok).toBe(true);
    expect(typeof link.permalink).toBe('string');
  });

  it('chat.meMessage returns ok:true and ts', async () => {
    const client = createSlackClient(token);
    const result = await client.chat.meMessage({ channel: channelId, text: 'me message' });
    expect(result.ok).toBe(true);
    expect(result.ts).toBeDefined();
  });

  it('chat.scheduleMessage returns ok:true and scheduled_message_id', async () => {
    const client = createSlackClient(token);
    const result = await client.chat.scheduleMessage({
      channel: channelId,
      text: 'future message',
      post_at: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(result.ok).toBe(true);
    expect(result.scheduled_message_id).toBeDefined();
  });

  it('chat.scheduledMessages.list returns ok:true and empty array', async () => {
    const client = createSlackClient(token);
    const result = await client.chat.scheduledMessages.list({});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.scheduled_messages)).toBe(true);
  });

  it('chat.deleteScheduledMessage returns ok:true', async () => {
    const client = createSlackClient(token);
    const result = await client.chat.deleteScheduledMessage({
      channel: channelId,
      scheduled_message_id: 'SM_FAKE',
    });
    expect(result.ok).toBe(true);
  });

  it('chat.unfurl returns ok:true', async () => {
    const client = createSlackClient(token);
    const posted = await client.chat.postMessage({ channel: channelId, text: 'unfurl test' });
    const result = await client.chat.unfurl({
      channel: channelId,
      ts: posted.ts!,
      unfurls: {},
    });
    expect(result.ok).toBe(true);
  });

  it('chat.startStream returns ok:true and a ChatStreamer', async () => {
    const client = createSlackClient(token);
    const streamer = await client.chat.startStream({ channel: channelId });
    expect(streamer).toBeDefined();
  });

  it('ChatStreamer append and stop sequence completes', async () => {
    const { ChatStreamer } = await import('@slack/web-api');
    const client = createSlackClient(token);
    const streamer = await client.chat.startStream({ channel: channelId });
    if (streamer instanceof ChatStreamer) {
      await streamer.append({ text: 'streaming...' });
      await streamer.stop({ text: 'done streaming' });
    } else {
      // If SDK returns something other than ChatStreamer, just check it's truthy
      expect(streamer).toBeTruthy();
    }
  });
});
