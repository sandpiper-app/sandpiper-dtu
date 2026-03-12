/**
 * Shopify twin conformance adapter
 *
 * Uses buildApp() and app.inject() for in-process testing
 * without starting a real HTTP server.
 */

import { buildApp } from '../../src/index.js';
import type { ConformanceAdapter, ConformanceOperation, ConformanceResponse } from '@dtu/conformance';
import { shopifyAdminGraphqlPath } from '../version.js';

export class ShopifyTwinAdapter implements ConformanceAdapter {
  readonly name = 'Shopify Twin';
  private app: Awaited<ReturnType<typeof buildApp>> | null = null;
  private accessToken: string = '';

  async init(): Promise<void> {
    // Use compressed timing and sync mode for conformance testing predictability
    process.env.WEBHOOK_TIME_SCALE = process.env.WEBHOOK_TIME_SCALE ?? '0.001';

    this.app = await buildApp({ logger: false });
    await this.app.ready();

    // Perform OAuth to get access token (simplified twin exchange)
    const oauthResponse = await this.app.inject({
      method: 'POST',
      url: '/admin/oauth/access_token',
      payload: { code: 'conformance-test-code' },
    });

    if (oauthResponse.statusCode !== 200) {
      throw new Error(`OAuth failed: ${oauthResponse.body}`);
    }

    const oauthBody = JSON.parse(oauthResponse.body);
    this.accessToken = oauthBody.access_token;
  }

  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    if (!this.app) {
      throw new Error('Adapter not initialized — call init() first');
    }

    if (op.graphql) {
      // Honor op.path when provided (suite declares the version);
      // fall back to the shared default helper only when the suite omitted it.
      const graphqlUrl = op.path ?? shopifyAdminGraphqlPath();
      const response = await this.app.inject({
        method: 'POST',
        url: graphqlUrl,
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
          ...op.headers,
        },
        payload: { query: op.graphql.query, variables: op.graphql.variables },
      });
      return {
        status: response.statusCode,
        headers: Object.fromEntries(
          Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), String(v)])
        ),
        body: JSON.parse(response.body),
      };
    }

    // Handle REST operations
    const response = await this.app.inject({
      method: op.method,
      url: op.path,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
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
      this.accessToken = '';
    }
  }
}

export default ShopifyTwinAdapter;
