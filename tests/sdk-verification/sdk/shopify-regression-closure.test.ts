/**
 * Phase 41 — RED contracts for currently open Shopify regressions.
 *
 * This file creates explicit failing contracts for every open Shopify regression
 * cluster so later plans have exact targets and cannot claim success by inference.
 *
 * ALL tests must FAIL on the current branch with assertion-style failures.
 * None should fail with SyntaxError, module-load errors, or fixture crashes.
 *
 * Regressions under contract:
 *   1. Unsupported API version 2025-02 accepted instead of rejected (api-version.ts)
 *   2. Product.delete() returns success without removing the product (rest.ts)
 *   3. refreshToken() returns bare { access_token, scope } without refresh token metadata (oauth.ts)
 *   4. offline tokenExchange with expiring=true returns bare response without refresh token metadata (oauth.ts)
 *   5. orderUpdate double-stringifies line_items corrupting subsequent reads (resolvers.ts)
 *   6. InventoryLevel.adjust() without prior connect fails (adjust must work against a seeded item + returns inventory_level visible via Location.inventory_levels)
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
const shopify = createShopifyApiClient({ restResources });

function twinUrl(): string {
  return process.env.SHOPIFY_API_URL!;
}

// ---------------------------------------------------------------------------
// Regression 1: unsupported API version 2025-02
// ---------------------------------------------------------------------------

describe('Shopify regression contracts — Phase 41', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('returns 404 for unsupported API version 2025-02 on Admin REST and GraphQL routes', async () => {
    const token = await seedShopifyAccessToken();

    // Probe REST route with unsupported version 2025-02
    const restRes = await fetch(
      `${twinUrl()}/admin/api/2025-02/products.json`,
      {
        headers: { 'X-Shopify-Access-Token': token },
      },
    );

    // Probe GraphQL route with unsupported version 2025-02
    const gqlRes = await fetch(
      `${twinUrl()}/admin/api/2025-02/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query: '{ __typename }' }),
      },
    );

    // Both should reject with non-200 status
    expect(restRes.status).not.toBe(200);
    expect(gqlRes.status).not.toBe(200);

    // Neither response should echo back the unsupported version in X-Shopify-API-Version
    const restApiVersion = restRes.headers.get('X-Shopify-API-Version');
    const gqlApiVersion = gqlRes.headers.get('X-Shopify-API-Version');
    expect(restApiVersion).not.toBe('2025-02');
    expect(gqlApiVersion).not.toBe('2025-02');
  });

  // ---------------------------------------------------------------------------
  // Regression 2: Product.delete() does not persist
  // ---------------------------------------------------------------------------

  it('Product.delete() removes the product from subsequent GET /products/:id.json', async () => {
    const token = await seedShopifyAccessToken();
    const session = { shop: 'dev.myshopify.com', accessToken: token };

    // Create a product through the pinned REST resource (instance-style save)
    const product = new shopify.rest.Product({ session: session as any });
    (product as any).title = 'Delete Test Product';
    await (product as any).save({ update: true });
    const productId = (product as any).id;
    expect(productId).toBeTruthy();

    // Delete through the pinned REST resource
    await shopify.rest.Product.delete({ session: session as any, id: productId });

    // Subsequent GET should return 404 — product must be gone
    const getRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/products/${productId}.json`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );

    // RED: currently DELETE returns {} without removing the product,
    // so GET still returns 200 with the product data.
    // After the fix, GET should return 404.
    expect(getRes.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Regression 3: refreshToken() returns refresh token metadata for offline sessions
  // ---------------------------------------------------------------------------

  it('refreshToken() returns refresh token metadata for offline sessions', async () => {
    // Call shopify.auth.refreshToken with a dummy refresh token
    // The twin must return refresh_token + refresh_token_expires_in in the response body
    // for createSession() to populate session.refreshToken and session.refreshTokenExpires.
    const { session } = await shopify.auth.refreshToken({
      shop: 'dev.myshopify.com',
      refreshToken: 'dummy-refresh-token',
    });

    // RED: currently the twin returns { access_token, scope } only.
    // createSession() only sets refreshToken/refreshTokenExpires when the response
    // includes refresh_token AND refresh_token_expires_in (both must be truthy).
    // After the fix, these fields must be present on the session.
    expect(session.refreshToken).toBeDefined();
    expect(session.refreshTokenExpires).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Regression 4: offline tokenExchange with expiring=true returns refresh token metadata
  // ---------------------------------------------------------------------------

  it('offline tokenExchange with expiring=true returns refresh token metadata', async () => {
    const sessionToken = await mintSessionToken(
      shopify.config.apiKey,
      shopify.config.apiSecretKey,
    );

    // Offline token exchange with expiring=true: the twin should include
    // refresh_token and refresh_token_expires_in in the response body.
    const { session } = await shopify.auth.tokenExchange({
      shop: 'dev.myshopify.com',
      sessionToken,
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
      expiring: true,
    });

    // RED: currently the twin ignores the expiring=true flag and returns
    // { access_token, scope } only — no refresh token metadata.
    // After the fix, refreshToken and refreshTokenExpires must be set on the session.
    expect(session.refreshToken).toBeDefined();
    expect(session.refreshTokenExpires).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Regression 5: orderUpdate preserves lineItems arrays for subsequent order queries
  // ---------------------------------------------------------------------------

  it('orderUpdate preserves lineItems arrays for subsequent order queries', async () => {
    const token = await seedShopifyAccessToken();
    const gqlHeaders = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    };
    const gqlUrl = `${twinUrl()}/admin/api/2024-01/graphql.json`;

    // Step 1: Create an order with line items
    // Note: orderCreate uses positional arg `order:` not `input:` per schema.graphql
    const createMutation = `
      mutation {
        orderCreate(order: {
          lineItems: [{ title: "Test Item", quantity: 2, priceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } } }]
          totalPrice: "20.00"
          currencyCode: "USD"
        }) {
          order { id lineItems { edges { node { title } } } }
          userErrors { field message }
        }
      }
    `;
    const createRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: gqlHeaders,
      body: JSON.stringify({ query: createMutation }),
    });
    expect(createRes.status).toBe(200);
    const createBody = await createRes.json() as {
      data: { orderCreate: { order: { id: string }; userErrors: unknown[] } };
    };
    expect(createBody.data.orderCreate.userErrors).toHaveLength(0);
    const orderId = createBody.data.orderCreate.order.id;
    expect(orderId).toBeTruthy();

    // Step 2: Run orderUpdate to change the order (e.g. add another line item)
    const updateMutation = `
      mutation {
        orderUpdate(input: {
          id: "${orderId}",
          lineItems: [
            { title: "Updated Item", quantity: 3, priceSet: { shopMoney: { amount: "15.00", currencyCode: "USD" } } }
          ]
        }) {
          order { id lineItems { edges { node { title } } } }
          userErrors { field message }
        }
      }
    `;
    const updateRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: gqlHeaders,
      body: JSON.stringify({ query: updateMutation }),
    });
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json() as {
      data: { orderUpdate: { order: { id: string; lineItems: { edges: Array<{ node: { title: string } }> } }; userErrors: unknown[] } };
    };
    expect(updateBody.data.orderUpdate.userErrors).toHaveLength(0);

    // Step 3: Query the order again — lineItems.edges should be an array of nodes
    const queryOp = `
      query {
        orders(first: 10) {
          edges {
            node {
              id
              lineItems { edges { node { title } } }
            }
          }
        }
      }
    `;
    const queryRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: gqlHeaders,
      body: JSON.stringify({ query: queryOp }),
    });
    expect(queryRes.status).toBe(200);
    const queryBody = await queryRes.json() as {
      data: { orders: { edges: Array<{ node: { id: string; lineItems: { edges: Array<{ node: unknown }> } } }> } };
    };

    // Find our order in the list
    const orderEdge = queryBody.data.orders.edges.find(
      (e) => e.node.id === orderId,
    );
    expect(orderEdge).toBeDefined();

    // RED: after orderUpdate, line_items is stored as JSON.stringify(input.lineItems)
    // but the existing row already has line_items as a JSON string from orderCreate.
    // On next read, JSON.parse(updatedOrder.line_items) should yield an array of objects,
    // NOT a string or parse error. If double-stringified, lineItems.edges will be empty
    // or the resolver will throw when trying to map over a string.
    const lineItemEdges = orderEdge!.node.lineItems.edges;
    expect(Array.isArray(lineItemEdges)).toBe(true);
    expect(lineItemEdges.length).toBeGreaterThan(0);
    // Each edge must have a node with title (not a string-parsing failure)
    for (const edge of lineItemEdges) {
      expect(typeof edge.node).toBe('object');
      expect(edge.node).not.toBeNull();
    }
  });

  // ---------------------------------------------------------------------------
  // Regression 6: InventoryLevel.adjust() returns inventory_level and Location.inventory_levels sees the same row
  // ---------------------------------------------------------------------------

  it('InventoryLevel.adjust() returns inventory_level and Location.inventory_levels sees the same row', async () => {
    const token = await seedShopifyAccessToken();
    const session = { shop: 'dev.myshopify.com', accessToken: token };
    const headers = { 'X-Shopify-Access-Token': token };

    // Step 1: Get a location to work with (same approach as shopify-behavioral-parity.test.ts)
    const { data: locations } = await shopify.rest.Location.all({ session: session as any });
    expect(Array.isArray(locations)).toBe(true);
    expect(locations.length).toBeGreaterThan(0);
    const locationId = Number((locations[0] as any).id);

    // Step 2: Seed an inventory item using the same code path as behavioral parity
    // This ensures the failure is from actual parity, not a missing fixture
    await fetch(`${twinUrl()}/admin/fixtures/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventoryItems: [{ sku: 'PARITY-TEST-41', tracked: true }],
      }),
    });

    // Get the inventory item ID — same pattern as behavioral parity test
    const listRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_items.json`,
      { headers },
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as { inventory_items: Array<{ id: number }> };
    expect(listBody.inventory_items.length).toBeGreaterThan(0);
    const inventoryItemId = listBody.inventory_items[0].id;

    // Step 3: Call InventoryLevel.adjust via REST — WITHOUT prior connect().
    // On the real Shopify API, adjust() implicitly creates the level if it doesn't exist.
    // On the twin, adjust() returns 404 when (inventory_item_id, location_id) is not
    // already in the database (no prior connect). This is the parity gap.
    const adjustRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_levels/adjust.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available_adjustment: 10,
        }),
      },
    );

    // RED: adjust() returns 404 because no prior connect() was called.
    // The real Shopify API returns 200 + inventory_level even without explicit connect.
    // After the fix, this should be 200 with an inventory_level record.
    expect(adjustRes.status).toBe(200);
    const adjustBody = await adjustRes.json() as {
      inventory_level: { inventory_item_id: number; location_id: number; available: number };
    };
    expect(adjustBody.inventory_level).toBeDefined();
    const adjustedAvailable = adjustBody.inventory_level.available;

    // Step 4: Confirm parity — Location.inventory_levels must see the same row
    const locationLevelsRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/locations/${locationId}/inventory_levels.json`,
      { headers },
    );
    expect(locationLevelsRes.status).toBe(200);
    const locationLevelsBody = await locationLevelsRes.json() as {
      inventory_levels: Array<{ inventory_item_id: number; location_id: number; available: number }>;
    };

    const matchingLevel = locationLevelsBody.inventory_levels.find(
      (lvl) =>
        lvl.inventory_item_id === inventoryItemId &&
        lvl.location_id === locationId,
    );

    expect(matchingLevel).toBeDefined();
    expect(matchingLevel!.available).toBe(adjustedAvailable);
  });
});
