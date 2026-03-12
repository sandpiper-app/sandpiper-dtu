/**
 * SHOP-14: shopify.clients.Storefront — live twin tests.
 *
 * 10 tests total:
 *   - StorefrontClient.request returns shop name from twin (1)
 *   - StorefrontClient.request returns data object with shop key (1)
 *   - StorefrontClient rejects session with empty accessToken at construction (1)
 *   - Twin rejects invalid Storefront token (1)
 *   - Admin-typed token is rejected on Storefront endpoint (1)
 *   - products(first: 2) returns real seeded product data (1)
 *   - Storefront schema introspection has no mutations (1)
 *   - collections(first: 1) returns a valid CollectionConnection (1)
 *   - StorefrontClient with non-default version succeeds and twin echoes version header (2)
 *
 * Validates the full Storefront pipeline:
 *   StorefrontClient → storefront-api-client → setAbstractFetchFunc host rewrite
 *   → twin /api/:version/graphql.json → shop resolver
 *
 * URL path: {storeDomain}/api/{apiVersion}/graphql.json (NOT /admin/)
 * Auth header: Shopify-Storefront-Private-Token
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Session } from '@shopify/shopify-api';
import { ApiVersion } from '@shopify/shopify-api';
import { createShopifyApiClient } from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

const shopify = createShopifyApiClient();

function shopifyTwinUrl(): string {
  return process.env.SHOPIFY_API_URL ?? 'http://127.0.0.1:9999';
}

function createSession(accessToken: string): Session {
  return {
    accessToken,
    shop: 'dev.myshopify.com',
    state: '',
  } as Session;
}

async function seedStorefrontToken(token: string, tokenType: 'storefront' | 'admin' = 'storefront'): Promise<void> {
  const response = await fetch(shopifyTwinUrl() + '/admin/tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      tokenType,
      shopDomain: 'dev.myshopify.com',
      scopes: 'unauthenticated_read_product_listings,unauthenticated_read_content',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to seed Shopify token: ${response.status}`);
  }
}

async function seedStorefrontProduct(): Promise<void> {
  const response = await fetch(shopifyTwinUrl() + '/admin/fixtures/load', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      products: [{
        title: 'Storefront Seed Product',
        description: 'Seeded for storefront client tests',
        vendor: 'Sandpiper',
        product_type: 'Apparel',
        variants: [{
          title: 'Default Title',
          sku: 'STORE-1',
          price: '19.99',
          inventory_quantity: 5,
        }],
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to seed storefront product: ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// shopify.clients.Storefront — SHOP-14 (live twin)
// ---------------------------------------------------------------------------

describe('shopify.clients.Storefront — SHOP-14 (live twin)', () => {
  let session: Session;

  beforeEach(async () => {
    await resetShopify();
    const storefrontToken = `storefront-${randomUUID()}`;
    await seedStorefrontToken(storefrontToken, 'storefront');
    await seedStorefrontProduct();
    session = createSession(storefrontToken);
  });

  const StorefrontClient = shopify.clients.Storefront;

  it('request returns shop name from twin', async () => {
    const client = new StorefrontClient({ session });
    const response = await client.request<{ shop: { name: string } }>('{ shop { name } }');
    expect(response.data?.shop?.name).toBe('Sandpiper Dev Store');
  });

  it('request returns data object with shop key', async () => {
    const client = new StorefrontClient({ session });
    const response = await client.request('{ shop { name } }');
    expect(response.data).toBeDefined();
    expect(typeof response.data).toBe('object');
  });

  it('rejects session with empty accessToken at construction', () => {
    const emptySession = { ...session, accessToken: '' } as Session;
    // StorefrontClient throws synchronously — do NOT use async rejects
    expect(() => new StorefrontClient({ session: emptySession })).toThrow();
  });

  it('twin rejects invalid Storefront token', async () => {
    const badSession = { ...session, accessToken: 'invalid-token-12345' } as Session;
    const client = new StorefrontClient({ session: badSession });
    // Token is syntactically valid so constructor succeeds, but twin rejects it with 401
    await expect(client.request('{ shop { name } }')).rejects.toThrow();
  });

  it('admin-typed token is rejected on Storefront endpoint', async () => {
    const adminToken = `admin-${randomUUID()}`;
    await seedStorefrontToken(adminToken, 'admin');
    const client = new StorefrontClient({ session: createSession(adminToken) });
    await expect(client.request('{ shop { name } }')).rejects.toThrow();
  });

  it('products(first: 2) query returns valid ProductConnection with real data', async () => {
    const client = new StorefrontClient({ session });
    const response = await client.request<{
      products: {
        edges: Array<{
          node: {
            title: string;
            variants: { nodes: Array<{ title: string }> };
          };
        }>;
      };
    }>('{ products(first: 2) { edges { node { title variants(first: 1) { nodes { title } } } } } }');

    expect(response.data?.products?.edges.length).toBeGreaterThanOrEqual(1);
    expect(response.data?.products?.edges[0]?.node.title).toBeTruthy();
    expect(response.data?.products?.edges[0]?.node.variants).toBeDefined();
    expect(response.data?.products?.edges[0]?.node.variants.nodes[0]?.title).toBe('Default Title');
  });

  it('Storefront schema has no mutations (introspection)', async () => {
    const client = new StorefrontClient({ session });
    const response = await client.request<{
      __schema: {
        mutationType: { name: string } | null;
      };
    }>('{ __schema { mutationType { name } } }');

    expect(response.data?.__schema?.mutationType).toBeNull();
  });

  it('collections(first: 1) query returns valid CollectionConnection', async () => {
    const client = new StorefrontClient({ session });
    const response = await client.request<{
      collections: {
        edges: Array<{ node: { title: string } }>;
      };
    }>('{ collections(first: 1) { edges { node { title } } } }');

    expect(response.data?.collections?.edges).toBeDefined();
    expect(Array.isArray(response.data?.collections?.edges)).toBe(true);
  });

  // ── Non-default version and response-header assertions (Phase 22-02) ─────

  it('request with non-default version (2025-01) succeeds — twin routes /api/:version/', async () => {
    // apiVersion January25 → /api/2025-01/graphql.json — no longer normalized to 2024-01
    const client = new StorefrontClient({ session, apiVersion: ApiVersion.January25 });
    const response = await client.request('{ shop { name } }');
    expect(response.data).toBeDefined();
  });

  it('request with non-default version echoes x-shopify-api-version: 2025-01', async () => {
    const client = new StorefrontClient({ session, apiVersion: ApiVersion.January25 });
    const response = await client.request('{ shop { name } }');
    // The storefront-api-client passes response.headers (Fetch API Headers object) through directly.
    // Use get() via cast since the type signature says Record<string, string | string[]>.
    expect(response.headers).toBeDefined();
    const headers = response.headers as unknown as Headers;
    const version = headers.get('x-shopify-api-version');
    expect(version).toBe('2025-01');
  });
});
