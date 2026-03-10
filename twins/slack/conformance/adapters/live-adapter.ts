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
  }

  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    // Translate twin IDs to real IDs in path and body
    let path = op.path;
    path = path.replace(/C_GENERAL/g, this.channelId);
    path = path.replace(/U_BOT_TWIN/g, this.botUserId);

    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.botToken}`,
      'Content-Type': 'application/json',
      ...op.headers,
    };

    let body: string | undefined;
    if (op.body) {
      if (typeof op.body === 'string') {
        // Form-encoded: replace IDs in string
        body = op.body.replace(/C_GENERAL/g, this.channelId).replace(/U_BOT_TWIN/g, this.botUserId);
      } else {
        // JSON body: replace IDs in serialized form
        body = JSON.stringify(op.body)
          .replace(/C_GENERAL/g, this.channelId)
          .replace(/U_BOT_TWIN/g, this.botUserId);
      }
    }

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
