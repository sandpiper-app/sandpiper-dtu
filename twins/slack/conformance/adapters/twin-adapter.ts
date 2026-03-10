/**
 * Slack twin conformance adapter
 *
 * Uses buildApp() and app.inject() for in-process testing
 * without starting a real HTTP server.
 */

import { buildApp } from '../../src/index.js';
import type { ConformanceAdapter, ConformanceOperation, ConformanceResponse } from '@dtu/conformance';

export class SlackTwinAdapter implements ConformanceAdapter {
  readonly name = 'Slack Twin';
  private app: Awaited<ReturnType<typeof buildApp>> | null = null;
  private botToken: string = '';

  async init(): Promise<void> {
    // Use compressed timing and sync mode for conformance testing predictability
    process.env.WEBHOOK_TIME_SCALE = process.env.WEBHOOK_TIME_SCALE ?? '0.001';

    this.app = await buildApp({ logger: false });
    await this.app.ready();

    // Get an authorization code via the authorize endpoint
    const authzResponse = await this.app.inject({
      method: 'GET',
      url: '/oauth/v2/authorize?client_id=test&scope=chat:write&redirect_uri=https://localhost/callback&state=test',
    });
    // Extract code from redirect Location header
    const location = authzResponse.headers.location as string;
    const code = new URL(location).searchParams.get('code');
    if (!code) throw new Error('No code in authorize redirect');

    // Exchange code for bot token
    const oauthResponse = await this.app.inject({
      method: 'POST',
      url: '/api/oauth.v2.access',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `code=${code}`,
    });

    const body = JSON.parse(oauthResponse.body);
    if (!body.ok) throw new Error(`OAuth failed: ${JSON.stringify(body)}`);
    this.botToken = body.access_token;
  }

  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    if (!this.app) throw new Error('Adapter not initialized — call init() first');

    const response = await this.app.inject({
      method: op.method,
      url: op.path,
      headers: {
        authorization: `Bearer ${this.botToken}`,
        'content-type': 'application/json',
        ...op.headers,
      },
      payload: op.body,
    });

    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = response.body;
    }

    return {
      status: response.statusCode,
      headers: Object.fromEntries(
        Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), String(v)])
      ),
      body,
    };
  }

  async teardown(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
      this.botToken = '';
    }
  }
}

export default SlackTwinAdapter;
