/**
 * Slack client-visible behavior parity tests (SLCK-22)
 *
 * Covers:
 * - filesUploadV2 returns nested completed metadata with id, name, and permalink
 * - files.completeUploadExternal accepts files as a JSON string payload
 * - response_url replace_original updates the original message instead of appending
 * - response_url delete_original removes the original message from conversation history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackClient } from '../helpers/slack-client.js';
import { resetSlack, seedSlackBotToken, seedSlackChannel } from '../setup/seeders.js';

describe('Slack client-visible behavior parity (SLCK-22)', () => {
  let token: string;
  let slackApiUrl: string;

  beforeEach(async () => {
    await resetSlack();
    token = await seedSlackBotToken('xoxb-client-behavior-parity');
    slackApiUrl = process.env.SLACK_API_URL!;
  });

  it('filesUploadV2 returns nested completed metadata with id, name, and permalink', async () => {
    const channel = await seedSlackChannel('uploads-parity');
    const client = createSlackClient(token);

    const response = await client.filesUploadV2({
      content: 'wave0 text',
      filename: 'wave0.txt',
      channel_id: channel,
    });

    // Upstream WebClient.filesUploadV2 returns { ok, files: [completion] }
    // where each completion is { ok, files: [{ id, name, permalink, ... }] }
    expect(response.ok).toBe(true);
    expect(Array.isArray(response.files)).toBe(true);
    expect(response.files!.length).toBeGreaterThan(0);

    const completion = response.files![0] as any;
    expect(completion.ok).toBe(true);
    expect(Array.isArray(completion.files)).toBe(true);
    expect(completion.files.length).toBeGreaterThan(0);

    const fileObj = completion.files[0];
    expect(fileObj.id).toMatch(/^F_/);
    expect(fileObj.name).toBe('wave0.txt');
    expect(fileObj.permalink).toContain('/files/');
  });

  it('files.completeUploadExternal accepts files as a JSON string payload', async () => {
    // The upstream SDK serializes the files array as a JSON string when posting
    // form-encoded: POST body is { files: '[{"id":"F_WAVE0","title":"wave0.txt"}]' }
    const res = await fetch(`${slackApiUrl}/api/files.completeUploadExternal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: '[{"id":"F_WAVE0","title":"wave0.txt"}]',
      }),
    });
    const body = await res.json() as any;

    expect(body.ok).toBe(true);
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.files.length).toBe(1);
    expect(body.files[0].name).toBe('wave0.txt');
  });

  it('response_url replace_original updates the original message instead of appending a new message', async () => {
    // Seed a message via chat.postMessage
    const postRes = await fetch(`${slackApiUrl}/api/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'C_GENERAL', text: 'original message' }),
    });
    const postBody = await postRes.json() as any;
    expect(postBody.ok).toBe(true);
    const originalTs = postBody.ts;

    // Trigger an interaction so we get a response_url
    const triggerRes = await fetch(`${slackApiUrl}/admin/interactions/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_ts: originalTs,
        channel: 'C_GENERAL',
        action_id: 'approve',
        user_id: 'U_BOT_TWIN',
      }),
    });
    const triggerBody = await triggerRes.json() as any;
    expect(triggerBody.ok).toBe(true);
    const responseUrl = triggerBody.response_url;

    // POST replace_original to the response_url
    const replaceRes = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'replacement text', replace_original: true }),
    });
    const replaceBody = await replaceRes.json() as any;
    expect(replaceBody.ok).toBe(true);

    // conversations.history should still contain the original ts with updated text
    const historyRes = await fetch(`${slackApiUrl}/api/conversations.history`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'C_GENERAL' }),
    });
    const historyBody = await historyRes.json() as any;
    expect(historyBody.ok).toBe(true);

    // The original ts message should now have replacement text
    const original = historyBody.messages.find((m: any) => m.ts === originalTs);
    expect(original).toBeDefined();
    expect(original.text).toBe('replacement text');

    // There should not be a second message with 'replacement text' (no append)
    const extras = historyBody.messages.filter((m: any) => m.text === 'replacement text');
    expect(extras.length).toBe(1);
  });

  it('response_url delete_original removes the original message from conversations.history', async () => {
    // Seed a fresh message
    const postRes = await fetch(`${slackApiUrl}/api/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'C_GENERAL', text: 'message to delete' }),
    });
    const postBody = await postRes.json() as any;
    expect(postBody.ok).toBe(true);
    const originalTs = postBody.ts;

    // Trigger an interaction
    const triggerRes = await fetch(`${slackApiUrl}/admin/interactions/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_ts: originalTs,
        channel: 'C_GENERAL',
        action_id: 'delete-action',
        user_id: 'U_BOT_TWIN',
      }),
    });
    const triggerBody = await triggerRes.json() as any;
    expect(triggerBody.ok).toBe(true);
    const responseUrl = triggerBody.response_url;

    // POST delete_original to the response_url
    const deleteRes = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete_original: true }),
    });
    const deleteBody = await deleteRes.json() as any;
    expect(deleteBody.ok).toBe(true);

    // conversations.history should no longer include the original ts
    const historyRes = await fetch(`${slackApiUrl}/api/conversations.history`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'C_GENERAL' }),
    });
    const historyBody = await historyRes.json() as any;
    expect(historyBody.ok).toBe(true);

    const deleted = historyBody.messages.find((m: any) => m.ts === originalTs);
    expect(deleted).toBeUndefined();
  });
});
