/**
 * Slack live API conformance adapter
 *
 * Connects to the real Slack API using environment credentials.
 * Discovers real channel/user IDs during init() and translates twin-specific
 * IDs (C_GENERAL, U_BOT_TWIN) in requests to real workspace IDs.
 */

import type { ConformanceAdapter, ConformanceOperation, ConformanceResponse } from '@dtu/conformance';

export class SlackLiveAdapter implements ConformanceAdapter {
  readonly name = 'Slack Live API';
  private baseUrl: string;
  private botToken: string;
  private channelId = '';
  private botUserId = '';

  constructor() {
    this.botToken = process.env.SLACK_BOT_TOKEN ?? '';
    this.baseUrl = (process.env.SLACK_BASE_URL ?? 'https://slack.com').replace(/\/$/, '');

    if (!this.botToken) {
      throw new Error(
        'SLACK_BOT_TOKEN is required for live conformance mode. ' +
          'Provide an xoxb- bot token for a test Slack workspace.'
      );
    }
  }

  async init(): Promise<void> {
    // Validate credentials and discover bot user ID
    const authRes = await fetch(`${this.baseUrl}/api/auth.test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
    });
    const authBody = (await authRes.json()) as { ok: boolean; error?: string; user_id?: string };
    if (!authBody.ok) {
      throw new Error(`Slack live adapter authentication failed: ${authBody.error}`);
    }
    this.botUserId = authBody.user_id ?? '';

    // Discover a real channel ID for the workspace
    const chRes = await fetch(`${this.baseUrl}/api/conversations.list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: 10 }),
    });
    const chBody = (await chRes.json()) as { ok: boolean; channels?: Array<{ id: string; is_member: boolean }> };
    if (chBody.ok && chBody.channels && chBody.channels.length > 0) {
      // Prefer a channel the bot is a member of
      const memberChannel = chBody.channels.find(c => c.is_member);
      this.channelId = memberChannel?.id ?? chBody.channels[0].id;
    }

    if (!this.channelId) {
      throw new Error('Could not discover any channels in the Slack workspace');
    }

    // If the bot is not already a member of the selected channel, attempt to join it
    // so that conversations.history is accessible during conformance testing.
    const memberChannel = chBody.channels?.find(c => c.id === this.channelId && c.is_member);
    if (!memberChannel) {
      const joinRes = await fetch(`${this.baseUrl}/api/conversations.join`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams([['channel', this.channelId]]).toString(),
      });
      const joinBody = (await joinRes.json()) as { ok: boolean; error?: string };
      if (!joinBody.ok) {
        console.warn(`[live-adapter] Could not join channel ${this.channelId}: ${joinBody.error}. History tests may fail.`);
      }
    }
  }

  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    // Translate twin IDs to real IDs in path and body
    let path = op.path;
    path = path.replace(/C_GENERAL/g, this.channelId);
    path = path.replace(/U_BOT_TWIN/g, this.botUserId);

    const url = `${this.baseUrl}${path}`;

    let body: string | undefined;
    let contentType = 'application/json';
    if (op.body) {
      if (typeof op.body === 'string') {
        // Already form-encoded string
        body = op.body.replace(/C_GENERAL/g, this.channelId).replace(/U_BOT_TWIN/g, this.botUserId);
        contentType = op.headers?.['content-type'] ?? 'application/x-www-form-urlencoded';
      } else {
        // Convert object body to form-urlencoded (Slack API reliably accepts this for all methods)
        const replaced: Record<string, unknown> = JSON.parse(
          JSON.stringify(op.body)
            .replace(/C_GENERAL/g, this.channelId)
            .replace(/U_BOT_TWIN/g, this.botUserId)
        );
        const entries: [string, string][] = [];
        for (const [key, val] of Object.entries(replaced)) {
          if (val === null || val === undefined) continue;
          entries.push([key, typeof val === 'object' ? JSON.stringify(val) : String(val)]);
        }
        body = new URLSearchParams(entries).toString();
        contentType = 'application/x-www-form-urlencoded';
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.botToken}`,
      'Content-Type': contentType,
      ...op.headers,
    };

    const response = await fetch(url, { method: op.method, headers, body });

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    return { status: response.status, headers: responseHeaders, body: responseBody };
  }

  async teardown(): Promise<void> {}
}

export default SlackLiveAdapter;
