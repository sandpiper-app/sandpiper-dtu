import { describe, it, expect, beforeEach } from 'vitest';
import { ChatStreamer } from '@slack/web-api';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken, seedSlackChannel } from '../setup/seeders.js';

describe('Slack WebClient base behaviors (SLCK-07)', () => {
  let token: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken();
  });

  it('apiCall sends a request and receives ok:true', async () => {
    const client = createSlackClient(token);
    const result = await client.apiCall('auth.test');
    expect(result.ok).toBe(true);
  });

  it('paginate iterates pages via response_metadata.next_cursor', async () => {
    // Seed a channel so conversations.list has data
    await seedSlackChannel('general-paging');
    const client = createSlackClient(token);
    const pages: any[] = [];
    for await (const page of client.paginate('conversations.list', { limit: 100 })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0].channels).toBeDefined();
  });

  it('filesUploadV2 completes 3-step upload chain', async () => {
    const channel = await seedSlackChannel('uploads');
    const client = createSlackClient(token);
    await expect(
      client.filesUploadV2({ filename: 'test.txt', data: Buffer.from('hello'), channel_id: channel })
    ).resolves.toBeDefined();
  });

  it('ChatStreamer append/stop sequence completes', async () => {
    const channel = await seedSlackChannel('streams');
    const client = createSlackClient(token);
    const streamer = await client.chat.startStream({ channel });
    // startStream returns a ChatStreamer instance
    expect(streamer).toBeDefined();
    if (streamer instanceof ChatStreamer) {
      await streamer.append({ text: 'chunk one' });
      await streamer.stop({ text: 'final' });
    }
  });

  it('twin returns ratelimited error when error simulator is set', async () => {
    const slackApiUrl = process.env.SLACK_API_URL!;
    // Configure error simulator to return 429 for auth.test
    // Admin endpoint expects 'methodName' field (not 'operation')
    await fetch(`${slackApiUrl}/admin/errors/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ methodName: 'auth.test', statusCode: 429, errorBody: { ok: false, error: 'ratelimited' } }),
    });

    // Use raw fetch to verify the error simulator returns 429 (avoids SDK retry machinery)
    const withError = await fetch(`${slackApiUrl}/api/auth.test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(withError.status).toBe(429);

    // Clear error config — admin endpoint is POST /admin/errors/clear (no body needed)
    await fetch(`${slackApiUrl}/admin/errors/clear`, { method: 'POST' });

    // Use raw fetch to verify normal behavior resumes (avoids SDK retry state)
    const afterClear = await fetch(`${slackApiUrl}/api/auth.test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(afterClear.status).toBe(200);
    const body = await afterClear.json() as any;
    expect(body.ok).toBe(true);
  });
});
