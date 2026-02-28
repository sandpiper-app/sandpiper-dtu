/**
 * Shopify live API conformance adapter
 *
 * Connects to a real Shopify dev store using environment credentials.
 * Requires SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN env vars.
 */

import type { ConformanceAdapter, ConformanceOperation, ConformanceResponse } from '@dtu/conformance';

export class ShopifyLiveAdapter implements ConformanceAdapter {
  readonly name = 'Shopify Dev Store';
  private baseUrl: string;
  private accessToken: string;

  constructor() {
    this.baseUrl = process.env.SHOPIFY_STORE_URL ?? '';
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN ?? '';

    if (!this.baseUrl || !this.accessToken) {
      throw new Error(
        'SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN are required for live conformance mode'
      );
    }

    // Normalize: remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  async init(): Promise<void> {
    // Validate credentials with a simple API health check
    const url = `${this.baseUrl}/admin/api/2024-01/shop.json`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Shopify live adapter authentication failed (${response.status}). Check SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.`
      );
    }
  }

  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    const url = op.graphql
      ? `${this.baseUrl}/admin/api/2024-01/graphql.json`
      : `${this.baseUrl}${op.path}`;

    const body = op.graphql
      ? JSON.stringify({ query: op.graphql.query, variables: op.graphql.variables })
      : op.body
      ? JSON.stringify(op.body)
      : undefined;

    const response = await fetch(url, {
      method: op.graphql ? 'POST' : op.method,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...op.headers,
      },
      body,
    });

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return { status: response.status, headers, body: responseBody };
  }

  async teardown(): Promise<void> {
    // No persistent connections to clean up for fetch-based adapter.
    // In a real implementation, you might delete test resources created
    // in the dev store during the conformance run.
  }
}

export default ShopifyLiveAdapter;
