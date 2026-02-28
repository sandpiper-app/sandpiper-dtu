/**
 * Slack live API conformance adapter
 *
 * Connects to the real Slack API using environment credentials.
 * Requires SLACK_BOT_TOKEN env var. Optionally SLACK_BASE_URL (default: https://slack.com).
 *
 * SLACK_BOT_TOKEN — xoxb- bot token for a test workspace
 * SLACK_BASE_URL  — defaults to https://slack.com (override for enterprise grid)
 */

import type { ConformanceAdapter, ConformanceOperation, ConformanceResponse } from '@dtu/conformance';

export class SlackLiveAdapter implements ConformanceAdapter {
  readonly name = 'Slack Live API';
  private baseUrl: string;
  private botToken: string;

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
    // Validate credentials with auth.test
    const response = await fetch(`${this.baseUrl}/api/auth.test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const body = (await response.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      throw new Error(
        `Slack live adapter authentication failed: ${body.error}. Check SLACK_BOT_TOKEN.`
      );
    }
  }

  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    const url = `${this.baseUrl}${op.path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.botToken}`,
      'Content-Type': 'application/json',
      ...op.headers,
    };

    const body = op.body ? JSON.stringify(op.body) : undefined;

    const response = await fetch(url, {
      method: op.method,
      headers,
      body,
    });

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

  async teardown(): Promise<void> {
    // No persistent connections to clean up for fetch-based adapter.
  }
}

export default SlackLiveAdapter;
