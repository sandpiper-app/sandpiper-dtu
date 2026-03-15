/**
 * Shared fixture seeding for the full Slack bound-method surface proof (SLCK-14).
 *
 * Call `buildSlackMethodCallFixtures()` once per test context (e.g., in a
 * `beforeAll` or `beforeEach` hook). It resets the twin, seeds the required
 * state, and returns a fixtures object consumed by the full-surface matrix.
 *
 * All seeding happens here — individual matrix entries must not invent their
 * own seeding story.
 */

import type { WebClient } from '@slack/web-api';
import { resetSlack, seedSlackBotToken } from '../setup/seeders.js';
import { createSlackClient } from '../helpers/slack-client.js';

export interface SlackMethodCallFixtures {
  token: string;
  client: WebClient;
  teamId: string;
  botUserId: string;
  authedUserId: string;
  channelId: string;
  privateChannelId: string;
  dmId: string;
  messageTs: string;
  viewId: string;
  fileId: string;
  workflowStepExecuteId: string;
  workflowStepEditId: string;
  canvasId: string;
}

/**
 * Reset the Slack twin, seed minimal state, and return a ready-to-use fixtures
 * object for the full-surface method-call matrix.
 */
export async function buildSlackMethodCallFixtures(): Promise<SlackMethodCallFixtures> {
  // Reset twin to clean state and seed a known bot token
  await resetSlack();
  const token = await seedSlackBotToken();

  const slackApiUrl = process.env.SLACK_API_URL!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createSlackClient(token) as any;

  const teamId = 'T_TWIN';
  const botUserId = 'U_BOT_TWIN';
  const authedUserId = 'U_AUTHED';
  const channelId = 'C_GENERAL';

  // Seed a private channel via the twin admin endpoint
  const privateChannelId = await seedPrivateChannel(slackApiUrl, 'private-fixture-channel');

  // Create a DM via conversations.open
  let dmId: string;
  try {
    const dmRes = await client.conversations.open({ users: botUserId });
    dmId = (dmRes as { channel?: { id?: string } }).channel?.id ?? 'D_FIXTURE';
  } catch {
    dmId = 'D_FIXTURE';
  }

  // Post a message to get a stable timestamp
  let messageTs: string;
  try {
    const msgRes = await client.chat.postMessage({ channel: channelId, text: 'fixture message' });
    messageTs = (msgRes as { ts?: string }).ts ?? '1700000000.000001';
  } catch {
    messageTs = '1700000000.000001';
  }

  // Open a modal view to get a viewId
  let viewId: string;
  try {
    const viewRes = await client.views.open({
      trigger_id: 'fixture-trigger-id',
      view: {
        type: 'modal',
        title: { type: 'plain_text', text: 'Fixture' },
        blocks: [],
      },
    });
    viewId = (viewRes as { view?: { id?: string } }).view?.id ?? 'V_FIXTURE';
  } catch {
    viewId = 'V_FIXTURE';
  }

  // Get a file upload URL to have a fileId
  let fileId: string;
  try {
    const uploadRes = await client.files.getUploadURLExternal({
      filename: 'fixture.txt',
      length: 10,
    });
    fileId = (uploadRes as { file_id?: string }).file_id ?? 'F_FIXTURE';
  } catch {
    fileId = 'F_FIXTURE';
  }

  return {
    token,
    client,
    teamId,
    botUserId,
    authedUserId,
    channelId,
    privateChannelId,
    dmId,
    messageTs,
    viewId,
    fileId,
    // Stable stub IDs for workflow/canvas methods that the twin stubs with ok:true
    workflowStepExecuteId: 'WS_FIXTURE',
    workflowStepEditId: 'WE_FIXTURE',
    canvasId: 'F_FIXTURE_CANVAS',
  };
}

/**
 * Seed a private channel in the Slack twin via the admin fixtures endpoint.
 */
async function seedPrivateChannel(slackApiUrl: string, name: string): Promise<string> {
  const id = `C_PRIV_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  try {
    const res = await fetch(slackApiUrl + '/admin/fixtures/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channels: [{ id, name, is_private: true }],
      }),
    });
    if (!res.ok) {
      return id; // fall back to the predicted ID even if seeding failed
    }
  } catch {
    // ignore seeding errors — use the predicted ID
  }
  return id;
}
