/**
 * SHOP-14: shopify.clients.Graphql and shopify.clients.graphqlProxy — live twin tests.
 *
 * 9 tests total:
 *   - GraphqlClient.request() — products query returns array (1)
 *   - GraphqlClient.request() with variables — returns null product after reset (1)
 *   - GraphqlClient.request() bad query — throws GraphqlQueryError (1)
 *   - GraphqlClient.query() deprecated compat — returns body (1)
 *   - graphqlProxy round-trip with string rawBody — result.body defined (1)
 *   - graphqlProxy round-trip with object rawBody { query } — result.body defined (1)
 *   - graphqlProxy rejects rawBody { data } key (wrong key) — throws (1)
 *   - graphqlProxy rejects session with empty accessToken — throws (1)
 *   - GraphqlClient API version override (ApiVersion.January24) — succeeds (1)
 *
 * All tests acquire a session via clientCredentials in beforeEach after resetShopify().
 *
 * GraphqlClient is accessed via shopify.clients.Graphql (NOT a direct import) to
 * respect the SDK's public surface (Pattern 3 anti-pattern from RESEARCH.md).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GraphqlQueryError, ApiVersion } from '@shopify/shopify-api';
import type { Session } from '@shopify/shopify-api';
import { createShopifyApiClient } from '../helpers/shopify-api-client.js';
import { resetShopify } from '../setup/seeders.js';

// Module-level instance — reused across tests (setAbstractFetchFunc is idempotent)
const shopify = createShopifyApiClient();

// ---------------------------------------------------------------------------
// shopify.clients.Graphql — SHOP-14 (live twin)
// ---------------------------------------------------------------------------

describe('shopify.clients.Graphql — SHOP-14 (live twin)', () => {
  let session: Session;

  beforeEach(async () => {
    await resetShopify();
    // clientCredentials is the simplest way to get a valid session with accessToken.
    const result = await shopify.auth.clientCredentials({ shop: 'dev.myshopify.com' });
    session = result.session;
  });

  it('request() returns products edges as an array', async () => {
    const GraphqlClient = shopify.clients.Graphql;
    const client = new GraphqlClient({ session });
    const response = await client.request<{
      products: { edges: Array<{ node: { id: string } }> };
    }>('{ products(first: 1) { edges { node { id } } } }');
    // After reset, the twin seeds default data — edges must be an array (even if empty)
    expect(Array.isArray(response.data?.products?.edges)).toBe(true);
  });

  it('request() with variables returns null product (no seeded product after reset)', async () => {
    const GraphqlClient = shopify.clients.Graphql;
    const client = new GraphqlClient({ session });
    const response = await client.request<{ product: { title: string } | null }>(
      'query GetProduct($id: ID!) { product(id: $id) { title } }',
      { variables: { id: 'gid://shopify/Product/9999999' } }
    );
    // Product 9999999 does not exist — twin returns null for missing IDs, not an error
    expect(response.data?.product).toBeNull();
  });

  it('request() with a bad query throws GraphqlQueryError', async () => {
    const GraphqlClient = shopify.clients.Graphql;
    const client = new GraphqlClient({ session });
    // '{ __badField }' is an invalid query that the twin returns GQL errors for
    await expect(client.request('{ __badField }')).rejects.toThrow(GraphqlQueryError);
  });

  it('query() deprecated compat — throws FeatureDeprecatedError in SDK >= v12', async () => {
    const GraphqlClient = shopify.clients.Graphql;
    const client = new GraphqlClient({ session });
    // query() was deprecated at v12.0.0. In SDK >= 12.0.0 the logger.deprecated() helper
    // throws FeatureDeprecatedError rather than logging a warning. This verifies the SDK
    // surface: the method exists but is hard-removed, signalling callers to migrate to request().
    await expect(
      client.query({ data: '{ products(first: 1) { edges { node { id } } } }' })
    ).rejects.toThrow('Feature was deprecated in version 12.0.0');
  });

  it('graphqlProxy round-trip with string rawBody — result.body is defined', async () => {
    const result = await shopify.clients.graphqlProxy({
      session,
      rawBody: '{ products(first: 1) { edges { node { id } } } }',
    });
    expect(result.body).toBeDefined();
    expect(typeof result.body).toBe('object');
  });

  it('graphqlProxy round-trip with object rawBody { query } — result.body is defined', async () => {
    const result = await shopify.clients.graphqlProxy({
      session,
      rawBody: { query: '{ products(first: 1) { edges { node { id } } } }' },
    });
    expect(result.body).toBeDefined();
  });

  it('graphqlProxy rejects rawBody with { data } key (not { query }) — throws', async () => {
    // graphqlProxy only recognizes rawBody.query, not rawBody.data
    await expect(
      shopify.clients.graphqlProxy({
        session,
        rawBody: { data: '{ products(first:1) { edges { node { id } } } }' } as any,
      })
    ).rejects.toThrow();
  });

  it('graphqlProxy rejects session with empty accessToken — throws', async () => {
    const emptySession = { ...session, accessToken: '' } as Session;
    await expect(
      shopify.clients.graphqlProxy({
        session: emptySession,
        rawBody: '{ products(first:1) { edges { node { id } } } }',
      })
    ).rejects.toThrow();
  });

  it('GraphqlClient with API version override (ApiVersion.January24) — request succeeds', async () => {
    const GraphqlClient = shopify.clients.Graphql;
    // apiVersion override is accepted by the SDK; the twin routes it via :version param
    const client = new GraphqlClient({ session, apiVersion: ApiVersion.January24 });
    const response = await client.request<{
      products: { edges: Array<{ node: { id: string } }> };
    }>('{ products(first: 1) { edges { node { id } } } }');
    expect(Array.isArray(response.data?.products?.edges)).toBe(true);
  });

  // ── Version echo and non-default version routing (Phase 22-02) ───────────

  it('GraphqlClient with non-default version — twin echoes x-shopify-api-version', async () => {
    const GraphqlClient = shopify.clients.Graphql;
    // January25 is a non-default version; the twin must route and echo it correctly
    const client = new GraphqlClient({ session, apiVersion: ApiVersion.January25 });
    const response = await client.request<{
      products: { edges: Array<{ node: { id: string } }> };
    }>('{ products(first: 1) { edges { node { id } } } }');
    expect(Array.isArray(response.data?.products?.edges)).toBe(true);
    // shopify-api canonicalizes header names to Title-Case and stores values as string[].
    // X-Shopify-Api-Version is the canonicalized form of x-shopify-api-version.
    expect(response.headers).toBeDefined();
    const versionHeader = response.headers?.['X-Shopify-Api-Version'];
    const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;
    expect(version).toBe('2025-01');
  });
});
