/**
 * Phase 36 — Wave 0 RED tests for Shopify behavioral parity findings.
 *
 * 11 tests total covering Findings #7-#10:
 *   Finding #7 (2 tests):  tokenExchange online vs offline isOnline flag
 *   Finding #8 (4 tests):  missing REST routes (AccessScope, Location, InventoryLevel adjust)
 *   Finding #9 (1 test):   GraphQL productCreate GID round-trip to REST numeric ID
 *   Finding #10 (4 tests): list endpoint filter semantics (since_id, ids)
 *
 * ALL tests (except #7 offline regression guard) must FAIL before implementation
 * and PASS after Plans 02-04 close the findings.
 *
 * Uses:
 *   - createShopifyApiClient() with restResources for SDK-based tests
 *   - raw fetch() for routes the REST resource SDK doesn't surface cleanly
 *   - resetShopify() + seedShopifyAccessToken() in beforeEach hooks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RequestedTokenType } from '@shopify/shopify-api';
import { restResources } from '@shopify/shopify-api/rest/admin/2024-01';
import {
  createShopifyApiClient,
  mintSessionToken,
} from '../helpers/shopify-api-client.js';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

// Module-level shopify instance with all restResources wired.
// shopify.rest.AccessScope, shopify.rest.Location, etc. are available after init.
const shopify = createShopifyApiClient({ restResources });

function twinUrl(): string {
  return process.env.SHOPIFY_API_URL!;
}

/** Build a minimal session-like object accepted by REST resource classes. */
async function getSession(): Promise<{ shop: string; accessToken: string }> {
  const token = await seedShopifyAccessToken();
  return { shop: 'dev.myshopify.com', accessToken: token };
}

// ---------------------------------------------------------------------------
// Finding #7: OAuth online token exchange
// ---------------------------------------------------------------------------

describe('Finding #7: OAuth online token exchange', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('tokenExchange with OnlineAccessToken → session.isOnline === true', async () => {
    // This test MUST FAIL before implementation (currently session.isOnline === false
    // because the twin returns the same flat { access_token, scope } shape for all
    // grant types — the SDK detects isOnline by the presence of associated_user in
    // the token response, which the twin does not include yet).
    const sessionToken = await mintSessionToken(
      shopify.config.apiKey,
      shopify.config.apiSecretKey,
    );
    const { session } = await shopify.auth.tokenExchange({
      shop: 'dev.myshopify.com',
      sessionToken,
      requestedTokenType: RequestedTokenType.OnlineAccessToken,
    });
    expect(session.isOnline).toBe(true);
  });

  it('tokenExchange with OfflineAccessToken → session.isOnline === false (regression guard)', async () => {
    // This test MUST PASS now and continue to pass after Plan 02 implements the fix.
    // Offline token exchange must never return associated_user — if it does, this test
    // will catch the regression.
    const sessionToken = await mintSessionToken(
      shopify.config.apiKey,
      shopify.config.apiSecretKey,
    );
    const { session } = await shopify.auth.tokenExchange({
      shop: 'dev.myshopify.com',
      sessionToken,
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
    });
    expect(session.isOnline).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finding #8: Missing REST routes
// ---------------------------------------------------------------------------

describe('Finding #8: Missing REST routes', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('AccessScope.all() returns access_scopes array', async () => {
    // This test MUST FAIL before implementation (currently 404 — the route
    // /admin/oauth/access_scopes.json does not exist in the twin yet).
    const session = await getSession();
    // AccessScope.all() returns { data: AccessScope[], headers, pageInfo } — not { body }.
    // Each AccessScope instance has a `handle` field populated from { access_scopes: [...] }.
    const { data } = await shopify.rest.AccessScope.all({ session } as any);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect((data[0] as any).handle).toBeTruthy();
  });

  it('Location.all() returns locations array', async () => {
    // This test MUST FAIL before implementation (currently 404 — the route
    // /admin/api/:version/locations.json does not exist in the twin yet).
    // Location.all() returns { data: Location[], headers, pageInfo } — use data not body.
    const session = await getSession();
    const { data } = await shopify.rest.Location.all({ session } as any);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('Location.find(id=1) returns location object', async () => {
    // This test MUST FAIL before implementation (currently 404 — the route
    // /admin/api/:version/locations/:id.json does not exist in the twin yet).
    // Location.find() returns the Location instance directly (not { body }) —
    // access fields via instance.id, instance.name, etc.
    const session = await getSession();
    const location = await shopify.rest.Location.find({ session, id: 1 } as any);
    expect(location).toBeDefined();
    // SDK REST client converts numeric id fields to strings (lossless-json behavior)
    expect(Number((location as any).id)).toBe(1);
  });

  it('InventoryLevel.adjust() returns inventory_level', async () => {
    // This test MUST FAIL before implementation (currently 404 — the route
    // POST /admin/api/:version/inventory_levels/adjust.json does not exist yet).
    // Use raw fetch to avoid REST resource class quirks with the adjust endpoint.
    const token = await seedShopifyAccessToken();
    const res = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_levels/adjust.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({
          inventory_item_id: 1,
          location_id: 1,
          available_adjustment: 5,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { inventory_level: unknown };
    expect(body.inventory_level).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Finding #9: GraphQL-to-REST GID round-trip
// ---------------------------------------------------------------------------

describe('Finding #9: GraphQL-to-REST GID round-trip', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('productCreate via GraphQL is findable via REST numeric ID', async () => {
    // This test MUST FAIL before implementation.
    // Currently graphQL productCreate stores a timestamp-based GID like
    // gid://shopify/Product/1711234567890 (not the DB row id), so the numeric
    // part does not correspond to any row's integer primary key. The REST lookup
    // GET /products/1711234567890.json returns 404.
    const token = await seedShopifyAccessToken();

    // Step 1: Create a product via GraphQL mutation.
    const mutation = `
      mutation {
        productCreate(input: { title: "GID Round-Trip Test" }) {
          product {
            id
            title
          }
        }
      }
    `;
    const gqlRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query: mutation }),
      },
    );
    expect(gqlRes.status).toBe(200);
    const gqlBody = await gqlRes.json() as {
      data: { productCreate: { product: { id: string; title: string } } };
    };
    const gid = gqlBody.data.productCreate.product.id;
    expect(gid).toMatch(/^gid:\/\/shopify\/Product\//);

    // Step 2: Extract numeric ID from GID.
    const numericId = gid.split('/').pop();
    expect(numericId).toBeTruthy();
    // numericId must be a small integer (DB row id), not a large timestamp.
    // Before the fix, numericId would be something like "1711234567890".
    // After the fix, numericId would be "1" (the actual row id).

    // Step 3: Fetch the product via REST using the numeric ID.
    const restRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/products/${numericId}.json`,
      {
        headers: { 'X-Shopify-Access-Token': token },
      },
    );
    expect(restRes.status).toBe(200);
    const restBody = await restRes.json() as { product: { id: number; title: string } };
    expect(restBody.product).toBeDefined();
    expect(String(restBody.product.id)).toBe(numericId);
    expect(restBody.product.title).toBe('GID Round-Trip Test');
  });
});

// ---------------------------------------------------------------------------
// Finding #10: List endpoint filter semantics
// ---------------------------------------------------------------------------

describe('Finding #10: List endpoint filter semantics', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('Product.all({ since_id }) returns only products with id > since_id', async () => {
    // This test MUST FAIL before implementation.
    // Currently since_id is silently ignored and all products are returned.
    // Seed 3 products and assert that since_id=firstId returns only 2 products.
    const productsToCreate = ['P1', 'P2', 'P3'];
    const createdIds: number[] = [];
    for (const title of productsToCreate) {
      const res = await fetch(`${twinUrl()}/admin/api/2024-01/products.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ product: { title } }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { product: { id: number } };
      createdIds.push(body.product.id);
    }

    const firstId = createdIds[0];
    const res = await fetch(
      `${twinUrl()}/admin/api/2024-01/products.json?since_id=${firstId}`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { products: Array<{ id: number }> };
    // All returned products must have id > firstId.
    const returnedIds = body.products.map((p) => p.id);
    expect(returnedIds.every((id) => id > firstId)).toBe(true);
    // There should be exactly 2 products: P2 and P3.
    expect(body.products).toHaveLength(2);
  });

  it('Product.all({ since_id: lastId }) returns empty array', async () => {
    // This test MUST FAIL before implementation.
    // since_id equal to the last product's ID should return nothing.
    const res1 = await fetch(`${twinUrl()}/admin/api/2024-01/products.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ product: { title: 'Solo Product' } }),
    });
    expect(res1.status).toBe(201);
    const created = await res1.json() as { product: { id: number } };
    const soloId = created.product.id;

    const res = await fetch(
      `${twinUrl()}/admin/api/2024-01/products.json?since_id=${soloId}`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { products: Array<unknown> };
    // since_id=lastProductId means "return items AFTER this one", so 0 items.
    expect(body.products).toHaveLength(0);
  });

  it('InventoryItem.all({ ids }) returns only matching items', async () => {
    // This test MUST FAIL before implementation.
    // Currently the ids filter is silently ignored and all inventory items are returned.
    // Seed 2 inventory items via the fixture loader, then filter by the first one's ID.
    const fixtureRes = await fetch(`${twinUrl()}/admin/fixtures/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventoryItems: [
          { sku: 'TEST-ITEM-1', tracked: true },
          { sku: 'TEST-ITEM-2', tracked: true },
        ],
      }),
    });
    // If fixture endpoint doesn't support inventoryItems, fall back gracefully.
    // In that case the test will fail at the filter assertion (still RED as expected).
    const fixtureOk = fixtureRes.ok;

    // Discover actual IDs by listing all inventory items.
    const listRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_items.json`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as {
      inventory_items: Array<{ id: number }>;
    };

    if (!fixtureOk || listBody.inventory_items.length === 0) {
      // No inventory items seeded — skip the filter assertion via a failing expectation
      // that makes the RED nature explicit.
      expect(listBody.inventory_items.length).toBeGreaterThan(0);
      return;
    }

    const firstItemId = listBody.inventory_items[0].id;

    const filterRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_items.json?ids=${firstItemId}`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(filterRes.status).toBe(200);
    const filterBody = await filterRes.json() as {
      inventory_items: Array<{ id: number }>;
    };
    // Only the item with id === firstItemId should be returned.
    expect(filterBody.inventory_items.every((item) => item.id === firstItemId)).toBe(true);
    expect(filterBody.inventory_items).toHaveLength(1);
  });

  it('InventoryItem.all({ ids: unknown }) returns empty array', async () => {
    // This test MUST FAIL before implementation.
    // ids=99999 (no such item) should return an empty array, not the full list.
    const res = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_items.json?ids=99999`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { inventory_items: Array<unknown> };
    expect(body.inventory_items).toHaveLength(0);
  });
});
