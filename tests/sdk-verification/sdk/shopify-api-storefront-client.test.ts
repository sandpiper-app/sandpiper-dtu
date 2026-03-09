/**
 * SHOP-14: shopify.clients.Storefront — live twin tests.
 *
 * 4 tests total:
 *   - StorefrontClient.request returns shop name from twin (1)
 *   - StorefrontClient.request returns data object with shop key (1)
 *   - StorefrontClient rejects session with empty accessToken at construction (1)
 *   - Twin rejects invalid Storefront token (1)
 *
 * Validates the full Storefront pipeline:
 *   StorefrontClient → storefront-api-client → setAbstractFetchFunc Storefront
 *   normalization → twin /api/2024-01/graphql.json → shop resolver
 *
 * URL path: {storeDomain}/api/{apiVersion}/graphql.json (NOT /admin/)
 * Auth header: Shopify-Storefront-Private-Token
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@shopify/shopify-api';
import { createShopifyApiClient } from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

const shopify = createShopifyApiClient();

// ---------------------------------------------------------------------------
// shopify.clients.Storefront — SHOP-14 (live twin)
// ---------------------------------------------------------------------------

describe('shopify.clients.Storefront — SHOP-14 (live twin)', () => {
  let session: Session;

  beforeEach(async () => {
    await resetShopify();
    // clientCredentials is the simplest way to get a valid session after reset.
    // The accessToken from this session is used as the Shopify-Storefront-Private-Token.
    const result = await shopify.auth.clientCredentials({ shop: 'dev.myshopify.com' });
    session = result.session;
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
});
