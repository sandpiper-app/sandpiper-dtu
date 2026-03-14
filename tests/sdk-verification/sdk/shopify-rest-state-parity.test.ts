/**
 * Phase 39-03 — REST state and ID parity tests (SHOP-14, SHOP-15).
 *
 * Covers:
 *   - customerCreate via GraphQL is findable via GET /customers/:id.json
 *   - orderCreate via GraphQL is findable via GET /orders/:id.json
 *   - fixture-loaded customer and order GIDs use REST numeric row ID suffix
 *   - Product.save() persists title through PUT /products/:id.json
 *   - Customer.save() persists first_name and last_name through PUT /customers/:id.json
 *   - Order.save() persists name and total_price through PUT /orders/:id.json
 *   - Customer.all({ ids }) returns only the requested numeric ids
 *   - Order.all({ ids }) returns only the requested numeric ids
 *
 * Uses:
 *   - createShopifyApiClient() with restResources for SDK-based tests
 *   - raw fetch() for GraphQL mutation calls and REST fixture seeding
 *   - resetShopify() + seedShopifyAccessToken() in beforeEach hooks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { restResources } from '@shopify/shopify-api/rest/admin/2024-01';
import { createShopifyApiClient } from '../helpers/shopify-api-client.js';
import { resetShopify, seedShopifyAccessToken } from '../setup/seeders.js';

const shopify = createShopifyApiClient({ restResources });

function twinUrl(): string {
  return process.env.SHOPIFY_API_URL!;
}

/** Build a minimal session-like object accepted by REST resource classes. */
async function getSession(token?: string): Promise<{ shop: string; accessToken: string }> {
  const accessToken = token ?? (await seedShopifyAccessToken());
  return { shop: 'dev.myshopify.com', accessToken };
}

// ---------------------------------------------------------------------------
// Task 1: GID canonicalization — GraphQL → REST round-trip
// ---------------------------------------------------------------------------

describe('customerCreate via GraphQL is findable via GET /customers/:id.json', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('customerCreate GID numeric suffix matches REST row id', async () => {
    const mutation = `
      mutation {
        customerCreate(input: { email: "parity@example.com", firstName: "Parity", lastName: "Test" }) {
          customer {
            id
            email
          }
          userErrors { field message }
        }
      }
    `;
    const gqlRes = await fetch(`${twinUrl()}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: mutation }),
    });
    expect(gqlRes.status).toBe(200);
    const gqlBody = await gqlRes.json() as {
      data: { customerCreate: { customer: { id: string; email: string }; userErrors: any[] } };
    };
    expect(gqlBody.data.customerCreate.userErrors).toHaveLength(0);
    const gid = gqlBody.data.customerCreate.customer.id;
    expect(gid).toMatch(/^gid:\/\/shopify\/Customer\/\d+$/);

    // Extract numeric suffix — must be a small integer (row id), not a timestamp
    const numericId = gid.split('/').pop()!;
    const numericIdInt = parseInt(numericId, 10);
    // Row IDs are small integers (1-based AUTOINCREMENT), not epoch timestamps
    expect(numericIdInt).toBeLessThan(1_000_000);

    // REST lookup by numeric id must find the same customer
    const restRes = await fetch(`${twinUrl()}/admin/api/2024-01/customers/${numericId}.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(restRes.status).toBe(200);
    const restBody = await restRes.json() as { customer: { id: number; email: string } };
    expect(restBody.customer).toBeDefined();
    expect(String(restBody.customer.id)).toBe(numericId);
    expect(restBody.customer.email).toBe('parity@example.com');
  });
});

describe('orderCreate via GraphQL is findable via GET /orders/:id.json', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('orderCreate GID numeric suffix matches REST row id', async () => {
    const mutation = `
      mutation {
        orderCreate(order: { lineItems: [{ title: "Test Item", quantity: 1, priceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } } }] }) {
          order {
            id
            name
          }
          userErrors { field message }
        }
      }
    `;
    const gqlRes = await fetch(`${twinUrl()}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: mutation }),
    });
    expect(gqlRes.status).toBe(200);
    const gqlBody = await gqlRes.json() as {
      data: { orderCreate: { order: { id: string; name: string }; userErrors: any[] } };
    };
    expect(gqlBody.data.orderCreate.userErrors).toHaveLength(0);
    const gid = gqlBody.data.orderCreate.order.id;
    expect(gid).toMatch(/^gid:\/\/shopify\/Order\/\d+$/);

    // Extract numeric suffix — must be a small integer (row id), not a timestamp
    const numericId = gid.split('/').pop()!;
    const numericIdInt = parseInt(numericId, 10);
    expect(numericIdInt).toBeLessThan(1_000_000);

    // REST lookup by numeric id must find the same order
    const restRes = await fetch(`${twinUrl()}/admin/api/2024-01/orders/${numericId}.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(restRes.status).toBe(200);
    const restBody = await restRes.json() as { order: { id: number; name: string } };
    expect(restBody.order).toBeDefined();
    expect(String(restBody.order.id)).toBe(numericId);
  });
});

describe('fixture-loaded customer and order GIDs use REST numeric row ID suffix', () => {
  beforeEach(async () => {
    await resetShopify();
  });

  it('fixture customer GID suffix matches REST numeric row id (not a timestamp)', async () => {
    const token = await seedShopifyAccessToken();

    // Load a fixture customer
    const fixtureRes = await fetch(`${twinUrl()}/admin/fixtures/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers: [{ email: 'fixture@example.com', first_name: 'Fix', last_name: 'Ture' }] }),
    });
    expect(fixtureRes.status).toBe(200);

    // List customers to get the actual row id
    const listRes = await fetch(`${twinUrl()}/admin/api/2024-01/customers.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as { customers: Array<{ id: number; email: string; admin_graphql_api_id: string }> };
    const customer = listBody.customers.find((c) => c.email === 'fixture@example.com');
    expect(customer).toBeDefined();

    // GID suffix must match the row id (not a timestamp like 1711234567890)
    const gidSuffix = customer!.admin_graphql_api_id.split('/').pop()!;
    expect(String(customer!.id)).toBe(gidSuffix);
    expect(parseInt(gidSuffix, 10)).toBeLessThan(1_000_000);
  });

  it('fixture order GID suffix matches REST numeric row id (not a timestamp)', async () => {
    const token = await seedShopifyAccessToken();

    // Load a fixture order
    const fixtureRes = await fetch(`${twinUrl()}/admin/fixtures/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: [{ name: '#9001', total_price: '42.00', currency_code: 'USD' }] }),
    });
    expect(fixtureRes.status).toBe(200);

    // List orders to get the actual row id
    const listRes = await fetch(`${twinUrl()}/admin/api/2024-01/orders.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as { orders: Array<{ id: number; name: string; admin_graphql_api_id: string }> };
    const order = listBody.orders.find((o) => o.name === '#9001');
    expect(order).toBeDefined();

    // GID suffix must match the row id
    const gidSuffix = order!.admin_graphql_api_id.split('/').pop()!;
    expect(String(order!.id)).toBe(gidSuffix);
    expect(parseInt(gidSuffix, 10)).toBeLessThan(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// Task 2: REST write and ids filter parity
// ---------------------------------------------------------------------------

describe('Product.save() persists title through PUT /admin/api/2024-01/products/:id.json', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('PUT /products/:id.json persists updated title', async () => {
    const session = await getSession(token);

    // Create product via SDK
    const product = new shopify.rest.Product({ session });
    product.title = 'Original Title';
    await product.save({ update: true });
    expect(product.id).toBeDefined();

    const productId = Number(product.id);

    // Update title via PUT
    const putRes = await fetch(`${twinUrl()}/admin/api/2024-01/products/${productId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ product: { title: 'Updated Title' } }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json() as { product: { id: number; title: string } };
    expect(putBody.product.title).toBe('Updated Title');

    // GET confirms persistence
    const getRes = await fetch(`${twinUrl()}/admin/api/2024-01/products/${productId}.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as { product: { id: number; title: string } };
    expect(getBody.product.title).toBe('Updated Title');
  });
});

describe('Customer.save() persists first_name and last_name through PUT /admin/api/2024-01/customers/:id.json', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('POST /customers.json creates customer with first_name and last_name', async () => {
    const postRes = await fetch(`${twinUrl()}/admin/api/2024-01/customers.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ customer: { email: 'save@example.com', first_name: 'Save', last_name: 'Test' } }),
    });
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json() as { customer: { id: number; email: string; first_name: string; last_name: string } };
    expect(postBody.customer).toBeDefined();
    expect(postBody.customer.email).toBe('save@example.com');
    expect(postBody.customer.first_name).toBe('Save');
    expect(postBody.customer.last_name).toBe('Test');
  });

  it('PUT /customers/:id.json persists first_name and last_name', async () => {
    // Create customer first
    const createRes = await fetch(`${twinUrl()}/admin/api/2024-01/customers.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ customer: { email: 'put@example.com', first_name: 'Before', last_name: 'Update' } }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json() as { customer: { id: number } };
    const customerId = createBody.customer.id;

    // Update via PUT
    const putRes = await fetch(`${twinUrl()}/admin/api/2024-01/customers/${customerId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ customer: { first_name: 'After', last_name: 'Updated' } }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json() as { customer: { id: number; first_name: string; last_name: string } };
    expect(putBody.customer.first_name).toBe('After');
    expect(putBody.customer.last_name).toBe('Updated');

    // GET confirms persistence
    const getRes = await fetch(`${twinUrl()}/admin/api/2024-01/customers/${customerId}.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as { customer: { first_name: string; last_name: string } };
    expect(getBody.customer.first_name).toBe('After');
    expect(getBody.customer.last_name).toBe('Updated');
  });
});

describe('Order.save() persists name and total_price through PUT /admin/api/2024-01/orders/:id.json', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('POST /orders.json creates order with name and total_price', async () => {
    const postRes = await fetch(`${twinUrl()}/admin/api/2024-01/orders.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ order: { name: '#2001', total_price: '99.99', currency_code: 'USD' } }),
    });
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json() as { order: { id: number; name: string; total_price: string } };
    expect(postBody.order).toBeDefined();
    expect(postBody.order.name).toBe('#2001');
    expect(postBody.order.total_price).toBe('99.99');
  });

  it('PUT /orders/:id.json persists name and total_price', async () => {
    // Create order first
    const createRes = await fetch(`${twinUrl()}/admin/api/2024-01/orders.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ order: { name: '#2002', total_price: '50.00', currency_code: 'USD' } }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json() as { order: { id: number } };
    const orderId = createBody.order.id;

    // Update via PUT
    const putRes = await fetch(`${twinUrl()}/admin/api/2024-01/orders/${orderId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ order: { name: '#2002-updated', total_price: '75.00' } }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json() as { order: { id: number; name: string; total_price: string } };
    expect(putBody.order.name).toBe('#2002-updated');
    expect(putBody.order.total_price).toBe('75.00');

    // GET confirms persistence
    const getRes = await fetch(`${twinUrl()}/admin/api/2024-01/orders/${orderId}.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as { order: { name: string; total_price: string } };
    expect(getBody.order.name).toBe('#2002-updated');
    expect(getBody.order.total_price).toBe('75.00');
  });
});

describe('Customer.all({ ids }) returns only the requested numeric ids', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('ids filter returns only matching customers', async () => {
    // Create 3 customers
    const emails = ['a@example.com', 'b@example.com', 'c@example.com'];
    const createdIds: number[] = [];
    for (const email of emails) {
      const res = await fetch(`${twinUrl()}/admin/api/2024-01/customers.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ customer: { email } }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { customer: { id: number } };
      createdIds.push(body.customer.id);
    }

    // Request only the first two
    const idsParam = createdIds.slice(0, 2).join(',');
    const session = await getSession(token);
    const result = await shopify.rest.Customer.all({ session, ids: idsParam });
    const returnedIds = (result.data as Array<{ id: number }>).map((c) => Number(c.id));

    // Must contain exactly the two requested ids
    expect(returnedIds).toHaveLength(2);
    expect(returnedIds).toContain(createdIds[0]);
    expect(returnedIds).toContain(createdIds[1]);
    expect(returnedIds).not.toContain(createdIds[2]);
  });
});

describe('Order.all({ ids }) returns only the requested numeric ids', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('ids filter returns only matching orders', async () => {
    // Create 3 orders
    const names = ['#3001', '#3002', '#3003'];
    const createdIds: number[] = [];
    for (const name of names) {
      const res = await fetch(`${twinUrl()}/admin/api/2024-01/orders.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ order: { name, total_price: '10.00', currency_code: 'USD' } }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { order: { id: number } };
      createdIds.push(body.order.id);
    }

    // Request only the first two
    const idsParam = createdIds.slice(0, 2).join(',');
    const session = await getSession(token);
    const result = await shopify.rest.Order.all({ session, ids: idsParam });
    const returnedIds = (result.data as Array<{ id: number }>).map((o) => Number(o.id));

    // Must contain exactly the two requested ids
    expect(returnedIds).toHaveLength(2);
    expect(returnedIds).toContain(createdIds[0]);
    expect(returnedIds).toContain(createdIds[1]);
    expect(returnedIds).not.toContain(createdIds[2]);
  });
});

// ---------------------------------------------------------------------------
// Task 3: InventoryLevel state round-trip
// ---------------------------------------------------------------------------

describe('InventoryLevel.adjust/connect/set/delete round-trips through stored inventory_levels state', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('connect/adjust/set/delete mutate a single inventory row surfaced by GET /inventory_levels.json', async () => {
    // Wave 0: the twin's connect/adjust/set/delete endpoints are stubs that do not
    // persist to a shared inventory_levels store. After connect, GET /inventory_levels.json
    // still returns [] because nothing was stored. Plans 39-03+ must add state persistence.
    const inventoryItemId = 1;
    const locationId = 1;

    // Step 1: connect — must return 200 with the connected row
    const connectRes = await fetch(`${twinUrl()}/admin/api/2024-01/inventory_levels/connect.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, relocate_if_necessary: false }),
    });
    expect(connectRes.status).toBe(200);
    const connectBody = await connectRes.json() as { inventory_level: { inventory_item_id: number; location_id: number; available: number } };
    expect(connectBody.inventory_level.inventory_item_id).toBe(inventoryItemId);
    expect(connectBody.inventory_level.location_id).toBe(locationId);

    // Step 2: adjust +10
    const adjustRes = await fetch(`${twinUrl()}/admin/api/2024-01/inventory_levels/adjust.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, available_adjustment: 10 }),
    });
    expect(adjustRes.status).toBe(200);
    const adjustBody = await adjustRes.json() as { inventory_level: { available: number } };
    expect(adjustBody.inventory_level.available).toBe(10);

    // Step 3: set to 25
    const setRes = await fetch(`${twinUrl()}/admin/api/2024-01/inventory_levels/set.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, available: 25 }),
    });
    expect(setRes.status).toBe(200);
    const setBody = await setRes.json() as { inventory_level: { available: number } };
    expect(setBody.inventory_level.available).toBe(25);

    // Step 4: GET /inventory_levels.json must surface the stored row
    const listRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as { inventory_levels: Array<{ inventory_item_id: number; location_id: number; available: number }> };
    expect(listBody.inventory_levels.length).toBe(1);
    expect(listBody.inventory_levels[0].inventory_item_id).toBe(inventoryItemId);
    expect(listBody.inventory_levels[0].available).toBe(25);

    // Step 5: DELETE removes the row
    const deleteRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_levels.json?inventory_item_id=${inventoryItemId}&location_id=${locationId}`,
      {
        method: 'DELETE',
        headers: { 'X-Shopify-Access-Token': token },
      },
    );
    expect(deleteRes.status).toBe(200);

    // Step 6: After DELETE, GET must return empty
    const afterRes = await fetch(
      `${twinUrl()}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    const afterBody = await afterRes.json() as { inventory_levels: unknown[] };
    expect(afterBody.inventory_levels).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 4: Location.inventory_levels round-trip
// ---------------------------------------------------------------------------

describe('Location.inventory_levels(id=1) returns the connected inventory_levels row', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('GET /locations/:id/inventory_levels.json surfaces a connected and set inventory row', async () => {
    // Wave 0: GET /locations/1/inventory_levels.json returns [] stub regardless of state.
    // After connecting and setting an inventory level, this route must surface the stored row.
    const inventoryItemId = 1;
    const locationId = 1;

    // Connect
    await fetch(`${twinUrl()}/admin/api/2024-01/inventory_levels/connect.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId }),
    });

    // Set available
    await fetch(`${twinUrl()}/admin/api/2024-01/inventory_levels/set.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, available: 42 }),
    });

    // GET /locations/:id/inventory_levels.json must surface the row
    const res = await fetch(
      `${twinUrl()}/admin/api/2024-01/locations/${locationId}/inventory_levels.json`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { inventory_levels: Array<{ inventory_item_id: number; location_id: number; available: number }> };
    expect(body.inventory_levels.length).toBeGreaterThan(0);
    const row = body.inventory_levels.find((l) => l.inventory_item_id === inventoryItemId);
    expect(row).toBeDefined();
    expect(row!.available).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Task 5: collection_id filter
// ---------------------------------------------------------------------------

describe('Product.all({ collection_id }) returns only products linked by Collect rows', () => {
  let token: string;

  beforeEach(async () => {
    await resetShopify();
    token = await seedShopifyAccessToken();
  });

  it('GET /products.json?collection_id=X returns only products in that collection', async () => {
    // Wave 0: GET /products.json?collection_id=X currently ignores the filter.
    // The twin needs custom_collections and collects tables. Plans 39-03+ implement this.

    // Create two products
    const createProduct = async (title: string): Promise<number> => {
      const res = await fetch(`${twinUrl()}/admin/api/2024-01/products.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ product: { title } }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { product: { id: number } };
      return body.product.id;
    };

    const productId1 = await createProduct('Collection Product');
    const productId2 = await createProduct('Standalone Product');
    expect(productId1).toBeGreaterThan(0);
    expect(productId2).toBeGreaterThan(0);

    // Create a custom collection
    const collectionRes = await fetch(`${twinUrl()}/admin/api/2024-01/custom_collections.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ custom_collection: { title: 'Test Collection' } }),
    });
    expect(collectionRes.status).toBe(201);
    const collectionBody = await collectionRes.json() as { custom_collection: { id: number } };
    const collectionId = collectionBody.custom_collection.id;
    expect(collectionId).toBeGreaterThan(0);

    // Create a collect (link product 1 to the collection)
    const collectRes = await fetch(`${twinUrl()}/admin/api/2024-01/collects.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ collect: { product_id: productId1, collection_id: collectionId } }),
    });
    expect(collectRes.status).toBe(201);

    // GET /products.json?collection_id=<id> must return only product 1
    const session = await getSession(token);
    const { data } = await shopify.rest.Product.all({ session, collection_id: collectionId } as any);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(Number((data[0] as any).id)).toBe(productId1);
  });
});
