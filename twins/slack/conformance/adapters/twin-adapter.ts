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

    // Seed a broad-scope token directly — bypasses OAuth flow which hardcodes botScopes
    // and requires client_id/client_secret in exchange (Phase 31 tightening).
    // Pattern: same as seedSlackBotToken() in tests/sdk-verification/setup/seeders.ts
    const BROAD_SCOPE = [
      'chat:write',
      'channels:read',
      'channels:history',
      'groups:read',
      'groups:history',
      'im:read',
      'im:history',
      'mpim:read',
      'mpim:history',
      'users:read',
      'reactions:read',
      'reactions:write',
      'pins:read',
      'pins:write',
      'files:read',
      'files:write',
    ].join(',');

    const seedRes = await this.app.inject({
      method: 'POST',
      url: '/admin/tokens',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: 'xoxb-conformance-token',
        tokenType: 'bot',
        teamId: 'T_TEST',
        userId: 'U_BOT',
        scope: BROAD_SCOPE,
        appId: 'A_CONFORMANCE',
      },
    });
    if (seedRes.statusCode !== 200) {
      throw new Error(`Token seed failed: ${seedRes.statusCode} ${seedRes.body}`);
    }
    this.botToken = 'xoxb-conformance-token';
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
