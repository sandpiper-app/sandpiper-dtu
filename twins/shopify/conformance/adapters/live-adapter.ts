/**
 * Shopify live API conformance adapter
 *
 * Connects to a real Shopify dev store using one of two credential modes:
 *
 * Mode 1 (recommended): SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
 *   Custom App client credentials. Exchanged for an offline (non-expiring) access token
 *   at init() time via POST /admin/oauth/access_token with grant_type=client_credentials.
 *   Tokens issued this way never expire, making scheduled CI runs reliable without rotation.
 *
 * Mode 2 (legacy): SHOPIFY_ACCESS_TOKEN
 *   A short-lived access token issued by an OAuth flow (online access mode).
 *   Expires after 24 hours. Kept for backward compatibility with existing setups.
 *
 * Always required: SHOPIFY_STORE_URL
 *
 * Startup fails fast with a clear error if neither credential set is provided.
 */

import type { ConformanceAdapter, ConformanceOperation, ConformanceResponse } from '@dtu/conformance';

export class ShopifyLiveAdapter implements ConformanceAdapter {
  readonly name = 'Shopify Dev Store';
  private baseUrl: string;
  private accessToken: string;
  private useClientCredentials: boolean;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.baseUrl = process.env.SHOPIFY_STORE_URL ?? '';

    if (!this.baseUrl) {
      throw new Error('SHOPIFY_STORE_URL is required for live conformance mode');
    }

    // Normalize: remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, '');

    const clientId = process.env.SHOPIFY_CLIENT_ID ?? '';
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? '';
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN ?? '';

    if (clientId && clientSecret) {
      // Mode 1: client credentials — exchange for offline token at init() time
      this.useClientCredentials = true;
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.accessToken = ''; // Populated in init()
    } else if (accessToken) {
      // Mode 2: pre-issued access token (legacy, expires in 24h)
      this.useClientCredentials = false;
      this.clientId = '';
      this.clientSecret = '';
      this.accessToken = accessToken;
    } else {
      throw new Error(
        'Provide SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (recommended, long-lived) or SHOPIFY_ACCESS_TOKEN (expires in 24h)'
      );
    }
  }

  async init(): Promise<void> {
    if (this.useClientCredentials) {
      // Exchange client credentials for an offline access token
      const tokenUrl = `${this.baseUrl}/admin/oauth/access_token`;
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(
          `Shopify token exchange failed (${tokenResponse.status}). ` +
            'Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET — ensure the Custom App has the required scopes.'
        );
      }

      const tokenData = (await tokenResponse.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        throw new Error(
          `Shopify token exchange response did not include access_token (status ${tokenResponse.status}). ` +
            'Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET — ensure the Custom App has the required scopes.'
        );
      }

      this.accessToken = tokenData.access_token;
    }

    // Validate the token (whether freshly obtained or pre-supplied) with a shop health check
    const url = `${this.baseUrl}/admin/api/2024-01/shop.json`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      const credHint = this.useClientCredentials
        ? 'Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.'
        : 'Check SHOPIFY_ACCESS_TOKEN.';
      throw new Error(
        `Shopify live adapter authentication failed (${response.status}). Check SHOPIFY_STORE_URL and ${credHint}`
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
