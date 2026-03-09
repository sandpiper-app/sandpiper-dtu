import { describe, it, expect, beforeEach } from 'vitest';
import { createShopifyClient } from '../helpers/shopify-client.js';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

describe('Shopify SDK URL redirection (INFRA-15)', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetShopify();
    accessToken = await seedShopifyAccessToken();
  });

  it('executes GraphQL query against local twin via customFetchApi', async () => {
    const client = createShopifyClient({ accessToken });
    // The twin schema has QueryRoot with products, NOT shop.
    const result = await client.request('{ products(first: 1) { edges { node { id } } } }');
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.products).toBeDefined();
  });

  it('does not contact https://dev.myshopify.com (rewrite succeeds)', async () => {
    // If the rewrite fails, we get ECONNREFUSED or SSL error
    // A successful result proves the rewrite happened
    const client = createShopifyClient({ accessToken });
    const result = await client.request('{ products(first: 1) { edges { node { id } } } }');
    expect(result.errors).toBeUndefined();
  });
});
