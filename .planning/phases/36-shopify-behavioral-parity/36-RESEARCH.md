# Phase 36: Shopify Behavioral Parity - Research

**Researched:** 2026-03-13
**Domain:** Shopify twin behavioral gap closure — OAuth grant type differentiation, missing REST routes, GID canonicalization, list filter semantics
**Confidence:** HIGH

## Summary

Phase 36 closes four High-severity findings from the second adversarial review (findings #7-#10). All four are source-code-level bugs with confirmed root causes, not architectural problems. No new packages required. The work touches four distinct subsystems: the OAuth plugin (`oauth.ts`), the REST plugin (`rest.ts`), the GraphQL resolver (`resolvers.ts` + StateManager `createProduct`), and the list endpoint query parameter handling.

**Finding #7 (High: OAuth collapses grant types into one response):** `POST /admin/oauth/access_token` currently returns the same `{ access_token, scope }` shape regardless of `grant_type` or `requested_token_type`. The real Shopify API differentiates:
- `urn:ietf:params:oauth:grant-type:token-exchange` with `requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token'` → response includes `associated_user`, `associated_user_scope`, `expires_in`
- `urn:ietf:params:oauth:grant-type:token-exchange` with `requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token'` → response is plain `{ access_token, scope }`
- `refresh_token`, `client_credentials`, and authorization-code flows → plain `{ access_token, scope }`

The `@shopify/shopify-api` `createSession()` function determines `isOnline` by checking `accessTokenResponse.associated_user` presence (upstream `create-session.ts:26`). Without `associated_user`, `session.isOnline` is always `false` even when the caller explicitly requested an online token via `tokenExchange({ requestedTokenType: RequestedTokenType.OnlineAccessToken })`.

**Finding #8 (High: missing REST routes confirmed 404 live):** Five REST route families are absent from the twin, causing live 404 responses when SDK consumers call them:
1. `GET /admin/oauth/access_scopes.json` — accessed via `AccessScope.all({ session })` (uses `customPrefix: "/admin/oauth"` so the route is `/admin/oauth/access_scopes.json`, NOT versioned)
2. `GET /admin/api/:version/locations.json` — accessed via `Location.all({ session })`
3. `GET /admin/api/:version/locations/:id.json` — accessed via `Location.find({ session, id })`
4. `GET /admin/api/:version/locations/:id/inventory_levels.json` — accessed via `Location.inventory_levels({ session, id })`
5. `POST /admin/api/:version/inventory_levels/adjust.json` — accessed via `inventoryLevel.adjust(...)`
6. `POST /admin/api/:version/inventory_levels/connect.json` — accessed via `inventoryLevel.connect(...)`
7. `POST /admin/api/:version/inventory_levels/set.json` — accessed via `inventoryLevel.set(...)`
8. `DELETE /admin/api/:version/inventory_levels.json` — accessed via `InventoryLevel.delete({ session, ... })`
9. `GET /admin/api/:version/inventory_items/:id.json` — accessed via `InventoryItem.find({ session, id })`
10. `PUT /admin/api/:version/inventory_items/:id.json` — accessed via `inventoryItem.save()` (put operation)
11. `GET /admin/api/:version/locations/count.json` — accessed via `Location.count({ session })`

The existing `GET /admin/api/:version/inventory_items.json` is registered and `GET /admin/api/:version/inventory_levels.json` is a stub returning `[]`. What's missing are the single-item lookup, mutation routes, and the Location family.

**Finding #9 (High: GraphQL/REST IDs don't round-trip):** Products created via GraphQL `productCreate` mutation have GIDs in the form `gid://shopify/Product/{timestamp+random}` (line 552-554 of `resolvers.ts`). Products created via REST `POST /products.json` have GIDs in the canonical form `gid://shopify/Product/{rowId}` (via the two-step insert in `rest.ts:215-228`). This means:

- GraphQL create → `id: gid://shopify/Product/1711234567890` (timestamp)
- REST lookup via that ID: `GET /products/1711234567890.json` → 404 (no row with that numeric ID)
- REST create → `admin_graphql_api_id: gid://shopify/Product/1` (rowId)
- GraphQL lookup via that GID: `product(id: "gid://shopify/Product/1")` → works via `getProductByGid`

The fix is to apply the same two-step GID update pattern in the GraphQL `productCreate` resolver that `rest.ts` already uses. After `createProduct()` returns the `rowId`, immediately `UPDATE products SET gid = 'gid://shopify/Product/{rowId}' WHERE id = {rowId}`. The `admin.ts` fixture loader has the same bug (uses timestamp-based GID instead of two-step).

**Finding #10 (High: list endpoints ignore upstream filters):** The REST list endpoints (`/products.json`, `/orders.json`, `/customers.json`, `/inventory_items.json`) accept `page_info` for cursor pagination but silently ignore the `since_id` and `ids` query parameters that SDK consumers commonly pass. The Shopify SDK's `Product.all({ session, since_id: X })` and `Product.all({ session, ids: [1,2,3] })` send these as query params; the twin returns the full unfiltered list. For `inventory_items`, the `ids` filter is particularly important because `InventoryItem.all({ session, ids: '1,2,3' })` is used for batch lookups.

**Primary recommendation:** Fix all four findings as targeted source edits to `oauth.ts`, `rest.ts`, `resolvers.ts`, and `admin.ts`. All four fixes are contained, no new dependencies, no new SQLite tables.

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 4.x | Route registration | Already used in all twin plugins |
| TypeScript | 5.7.3 | Strict-mode type safety | Already used across all twins |
| better-sqlite3 | ~11.x | SQLite state layer | Already used in StateManager |
| Vitest | 3.x | Test runner | Already used for `pnpm test:sdk` |

### No New Dependencies

All fixes are pure source edits to existing files. No `npm install` required.

## Architecture Patterns

### Pattern 1: Grant Type Differentiation in OAuth Token Response

**What:** The `POST /admin/oauth/access_token` handler must inspect the request body to determine which response shape to return. For token-exchange with `requested_token_type` equal to `'urn:shopify:params:oauth:token-type:online-access-token'`, the response must include `associated_user`, `associated_user_scope`, and `expires_in`. All other flows return plain `{ access_token, scope }`.

**Key SDK behavior confirmed from upstream `create-session.ts:24-26`:**
```typescript
const associatedUser = (accessTokenResponse as OnlineAccessResponse).associated_user;
const isOnline = Boolean(associatedUser);
```

The SDK inspects the raw token response for `associated_user` presence. If present, session is online. If absent, offline.

**Correct implementation:**
```typescript
// In oauth.ts, inside the POST /admin/oauth/access_token handler,
// after issuing the access token:
const isOnlineTokenExchange =
  body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange' &&
  body.requested_token_type === 'urn:shopify:params:oauth:token-type:online-access-token';

if (isOnlineTokenExchange) {
  return {
    access_token: token,
    scope: ADMIN_SCOPES,
    expires_in: 86400,
    associated_user_scope: ADMIN_SCOPES,
    associated_user: {
      id: 1,
      first_name: 'Dev',
      last_name: 'Twin',
      email: 'twin@dev.myshopify.com',
      email_verified: true,
      account_owner: true,
      locale: 'en',
      collaborator: false,
    },
  };
}
return { access_token: token, scope: ADMIN_SCOPES };
```

**Caution:** The `OAuthTokenRequestBody` interface needs `requested_token_type?: string` added. The `OAuthTokenResponse` interface needs to allow optional online fields, or use a union type. Use a broad response type (`any`) or a proper union to avoid TypeScript errors.

**When to use:** Only when `grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange'` AND `requested_token_type === '...online-access-token'`. All other grant types including `client_credentials`, `refresh_token`, and authorization-code remain unchanged.

### Pattern 2: Missing REST Route Registration

**What:** Add stub or semi-functional routes for the missing REST endpoints. The pattern for all Tier 2 stubs in `rest.ts` is: `parseVersionHeader` + `requireToken` + return a minimal valid shape.

**Unversioned route for AccessScope:**
```typescript
// /admin/oauth/access_scopes.json — note: NO :version prefix, uses /admin/oauth path
// This is the ONLY Shopify REST resource with customPrefix "/admin/oauth"
// (confirmed from AccessScope class: protected static customPrefix = "/admin/oauth")
fastify.get('/admin/oauth/access_scopes.json', async (req: any, reply) => {
  const token = req.headers['x-shopify-access-token'] as string | undefined;
  if (!token) {
    return reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
  }
  const result = await validateAccessToken(token, (fastify as any).stateManager);
  if (!result.valid) {
    return reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
  }
  return {
    access_scopes: [
      { handle: 'read_orders' },
      { handle: 'write_orders' },
      { handle: 'read_products' },
      { handle: 'write_products' },
    ],
  };
});
```

**Versioned routes for Location family:**
```typescript
// GET /admin/api/:version/locations.json
fastify.get(adminPath('/locations.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  return {
    locations: [{
      id: 1,
      name: 'Default Location',
      active: true,
      address1: '1 Twin St',
      city: 'Dev City',
      country: 'US',
      country_code: 'US',
      admin_graphql_api_id: 'gid://shopify/Location/1',
    }],
  };
});

// GET /admin/api/:version/locations/count.json
fastify.get(adminPath('/locations/count.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  return { count: 1 };
});

// GET /admin/api/:version/locations/:id.json
fastify.get(adminPath('/locations/:id.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  return {
    location: {
      id: parseInt(req.params.id, 10),
      name: 'Default Location',
      active: true,
      admin_graphql_api_id: `gid://shopify/Location/${req.params.id}`,
    },
  };
});

// GET /admin/api/:version/locations/:id/inventory_levels.json
fastify.get(adminPath('/locations/:id/inventory_levels.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  return { inventory_levels: [] };
});
```

**InventoryLevel mutation routes:**
```typescript
// POST /admin/api/:version/inventory_levels/adjust.json
fastify.post(adminPath('/inventory_levels/adjust.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const body = (req.body as any) ?? {};
  return {
    inventory_level: {
      inventory_item_id: body.inventory_item_id ?? 1,
      location_id: body.location_id ?? 1,
      available: body.available_adjustment ?? 0,
    },
  };
});

// POST /admin/api/:version/inventory_levels/connect.json
fastify.post(adminPath('/inventory_levels/connect.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const body = (req.body as any) ?? {};
  return {
    inventory_level: {
      inventory_item_id: body.inventory_item_id ?? 1,
      location_id: body.location_id ?? 1,
      available: 0,
    },
  };
});

// POST /admin/api/:version/inventory_levels/set.json
fastify.post(adminPath('/inventory_levels/set.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const body = (req.body as any) ?? {};
  return {
    inventory_level: {
      inventory_item_id: body.inventory_item_id ?? 1,
      location_id: body.location_id ?? 1,
      available: body.available ?? 0,
    },
  };
});

// DELETE /admin/api/:version/inventory_levels.json
fastify.delete(adminPath('/inventory_levels.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  return {};
});
```

**InventoryItem single-item and put routes:**
```typescript
// GET /admin/api/:version/inventory_items/:id.json
fastify.get(adminPath('/inventory_items/:id.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const numericId = parseInt(req.params.id, 10);
  const item = (fastify as any).stateManager.getInventoryItemById?.(numericId);
  if (!item) {
    // Fallback stub when item not in state
    return {
      inventory_item: {
        id: numericId,
        sku: 'STUB-SKU',
        tracked: false,
        admin_graphql_api_id: `gid://shopify/InventoryItem/${numericId}`,
      },
    };
  }
  return { inventory_item: item };
});

// PUT /admin/api/:version/inventory_items/:id.json
fastify.put(adminPath('/inventory_items/:id.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const numericId = parseInt(req.params.id, 10);
  const body = (req.body as any) ?? {};
  return {
    inventory_item: {
      id: numericId,
      ...body.inventory_item,
      admin_graphql_api_id: `gid://shopify/InventoryItem/${numericId}`,
    },
  };
});
```

**Route ordering note:** `locations/count.json` must be registered BEFORE `locations/:id.json` in Fastify, otherwise `:id` captures `count` as the param.

### Pattern 3: Canonical GID Two-Step in GraphQL Resolver

**What:** The `productCreate` mutation in `resolvers.ts` stores a timestamp-based GID, which breaks cross-protocol ID round-trips. The fix applies the same two-step pattern that `rest.ts` already uses: insert with a temp GID, then update to use the actual SQLite AUTOINCREMENT row ID.

**Current (broken) code in resolvers.ts (~line 552):**
```typescript
const productTempId = Date.now() + Math.floor(Math.random() * 100000);
const productId = context.stateManager.createProduct({
  gid: createGID('Product', productTempId),
  ...
});
const product = context.stateManager.getProduct(productId);
```

**Fixed code:**
```typescript
const productId = context.stateManager.createProduct({
  gid: `gid://shopify/Product/temp-${Date.now()}`,  // temp GID
  ...
});
// Two-step: update GID to use actual row ID (same pattern as rest.ts:225-228)
const finalGid = `gid://shopify/Product/${productId}`;
context.stateManager.database
  .prepare('UPDATE products SET gid = ? WHERE id = ?')
  .run(finalGid, productId);
const product = context.stateManager.getProduct(productId);
```

**The same fix applies to `admin.ts` fixture loading.** The `POST /admin/fixtures/load` handler (lines 89-103) uses timestamp-based GIDs for products:
```typescript
const productTempId = Date.now() + Math.floor(Math.random() * 100000);
const productGid = createGID('Product', productTempId);
fastify.stateManager.createProduct({ ...productData, gid: productGid });
```
This needs the same two-step update. The fixture loader also does this for orders, customers, and inventory items — all have the same timestamp GID bug. Orders have independent GID tracking so the round-trip effect is less critical (GraphQL order lookup uses `getOrderByGid` which matches the stored GID). However, for consistency and correctness, all resource types in the fixture loader should use the two-step pattern.

**StateManager context in resolvers:** The `context.stateManager.database` property is already exposed (confirmed used in `rest.ts:225-228`). Access from resolver context: `context.stateManager.database.prepare(...).run(...)`.

### Pattern 4: List Filter Semantics (since_id, ids)

**What:** REST list endpoints need to honor `since_id` (return items with `id > since_id`) and `ids` (return only items whose `id` is in the comma-separated list). These are passed as query parameters.

**since_id filter:** Return items where `id > since_id`. This is simpler than cursor-based pagination — it's just a SQL WHERE clause or array filter.

```typescript
// In GET /admin/api/:version/products.json handler:
const sinceId = parseInt(String(req.query?.since_id ?? '0'), 10);
const idsParam = req.query?.ids as string | undefined;

let all = (fastify as any).stateManager.listProducts();

// Apply since_id filter first (before pagination cursor)
if (sinceId > 0) {
  all = all.filter((item: any) => item.id > sinceId);
}

// Apply ids filter (comma-separated numeric IDs)
if (idsParam) {
  const idSet = new Set(
    idsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  );
  all = all.filter((item: any) => idSet.has(item.id));
}

// Then apply existing cursor pagination
const { items, linkHeader } = paginateList(all, 'Product', version, '/products.json', limit, afterId);
```

**ids filter:** Return only items whose numeric `id` matches one of the comma-separated IDs. The real Shopify API accepts both numeric IDs and GIDs in the `ids` param. For simplicity, the twin should accept numeric IDs (matching the `id` field in the DB row).

**Important note on interaction with cursor pagination:** When `since_id` is provided, `page_info` cursors should not also be present (real Shopify docs say these filters are mutually exclusive with pagination). For the twin, the simplest approach: if `since_id` is provided, apply the filter then paginate the result; if `ids` is provided, apply the filter and skip pagination (just return matching items directly).

**Resources to apply filters to:** `products.json`, `orders.json`, `customers.json`, `inventory_items.json`. The `since_id` filter is supported on products, orders, and customers. The `ids` filter is supported on products and inventory_items.

### Anti-Patterns to Avoid

- **Adding `associated_user` unconditionally:** Only token-exchange with `requested_token_type = '...online-access-token'` should return online response. Other grant types must NOT include `associated_user`, or clients expecting offline sessions will get online sessions unexpectedly.
- **Using a non-versioned path for access_scopes:** The `AccessScope` REST resource uses `customPrefix: "/admin/oauth"`, meaning the route is `/admin/oauth/access_scopes.json` without a version prefix. Do NOT register it under `/admin/api/:version/access_scopes.json`.
- **Registering location count AFTER location by ID:** `locations/count.json` must come before `locations/:id.json` in Fastify registration order or `count` will be captured as the `:id` param.
- **Skipping the two-step GID update in fixtures:** The `admin.ts` fixture loader creates products for integration tests. If fixture-loaded products have timestamp GIDs, test-created products can't be looked up by REST numeric ID.
- **Parsing `ids` param as GIDs:** The IDs sent in the REST `ids` query param are numeric integers (not GIDs). Parse with `parseInt`, not `parseGID`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Online user object shape | Custom user schema | Hardcoded stub `{ id: 1, first_name: 'Dev', ... }` | SDK doesn't validate user fields for conformance |
| Two-step GID pattern | New StateManager method | Direct SQL `UPDATE ... SET gid = ?` via `database.prepare()` | Pattern already established in rest.ts; same approach |
| `ids` filter parsing | Complex filter parser | `idsParam.split(',').map(parseInt)` | Shopify sends comma-separated numeric IDs |
| Location data schema | Full location state table | Hardcoded minimal stub with `id: 1` | No SDK test requires location to be dynamic |
| InventoryLevel state | Real inventory state tracking | Stub responses with echo-back of request params | SDK checks only response shape, not values |

## Common Pitfalls

### Pitfall 1: OAuthTokenRequestBody Interface Missing Fields

**What goes wrong:** `oauth.ts` defines `OAuthTokenRequestBody` with `grant_type?: string` but not `requested_token_type?: string`. Adding the online token check without adding `requested_token_type` to the interface causes TypeScript to complain about accessing an unrecognized property.

**How to avoid:** Add `requested_token_type?: string` to the `OAuthTokenRequestBody` interface before referencing it in the handler body.

**Warning signs:** TypeScript error `Property 'requested_token_type' does not exist on type 'OAuthTokenRequestBody'`.

### Pitfall 2: OAuthTokenResponse Type Too Narrow

**What goes wrong:** `OAuthTokenResponse` is declared as `{ access_token: string; scope: string }`. Returning an object with additional fields (`expires_in`, `associated_user`, etc.) in TypeScript strict mode may cause a type error because the return type is wider than declared.

**How to avoid:** Two options: (a) Widen `OAuthTokenResponse` to a union with `OnlineAccessTokenResponse | OfflineAccessTokenResponse`, or (b) Return the online response as `Reply: OAuthTokenResponse | OAuthErrorResponse | OnlineAccessTokenResponse` using Fastify's `Reply` type annotation. Simplest: define a `OAuthOnlineTokenResponse extends OAuthTokenResponse` with optional fields added, and update the reply type annotation.

### Pitfall 3: StateManager.database Not Available in GraphQL Resolver Context

**What goes wrong:** If `context.stateManager.database` is not typed correctly in the resolver context type, TypeScript will reject the `database.prepare(...).run(...)` call.

**How to avoid:** Check that `Context` in `resolvers.ts` includes `stateManager: StateManager` and that `StateManager` exposes `database: Database.Database`. Confirmed: `rest.ts` already calls `(fastify as any).stateManager.database.prepare(...)` — same pattern is safe in resolvers using `context.stateManager.database.prepare(...)`.

**Warning signs:** TypeScript error `Property 'database' does not exist on type 'StateManager'`.

### Pitfall 4: `since_id` and `page_info` Mutual Exclusion

**What goes wrong:** If a caller passes both `since_id` and `page_info`, the filter results could be inconsistent (the `paginateList` function uses `all` as its base, but `all` is already filtered by `since_id`, then `afterId` cursor is applied to the filtered list). The cursor IDs encoded in `page_info` refer to the original unfiltered list, so using a cursor from a previous non-`since_id` request with a new `since_id` request will give unexpected results.

**How to avoid:** For the twin, applying filters before `paginateList` is sufficient. Real Shopify says `since_id` and `page_info` are mutually exclusive. For the twin, simply apply both and let the intersection define results — this is good enough for SDK conformance.

### Pitfall 5: access_scopes Route Conflict with oauth Plugin

**What goes wrong:** The `oauthPlugin` in `oauth.ts` already registers routes under `/admin/oauth/`. Adding `GET /admin/oauth/access_scopes.json` requires either (a) adding it to `oauth.ts`, or (b) adding it to `rest.ts` or a new plugin registered after the oauth plugin. Fastify will reject duplicate route registrations.

**How to avoid:** Add the `access_scopes` route to `oauth.ts` alongside the existing OAuth routes — it lives under the same `/admin/oauth/` prefix. It uses the same token validation pattern but returns scopes rather than issuing tokens.

**Alternatively:** Add it to `rest.ts` as a non-versioned route using a literal path (not `adminPath()`). Either location works; `oauth.ts` is semantically correct.

### Pitfall 6: Fixture Loader GID Bug Affects Integration Tests

**What goes wrong:** The `POST /admin/fixtures/load` endpoint creates products with timestamp GIDs. Integration tests that seed products via fixtures then look them up via REST ID will get 404. This is pre-existing but Phase 36 is the right time to fix it since we're already touching GID canonicalization.

**How to avoid:** Apply the two-step GID update in `admin.ts` for all resource types that use the timestamp pattern. Check if `listProducts()` is used after fixture load in existing tests — if so, the GID update is safe because `listProducts()` re-queries the DB.

## Code Examples

### Finding #7: Online Token Response in oauth.ts

```typescript
// Source: upstream create-session.ts:24-26
// const associatedUser = (accessTokenResponse as OnlineAccessResponse).associated_user;
// const isOnline = Boolean(associatedUser);

// In OAuthTokenRequestBody interface, add:
interface OAuthTokenRequestBody {
  client_id?: string;
  client_secret?: string;
  code?: string;
  grant_type?: string;
  expiring?: string;
  subject_token?: string;
  refresh_token?: string;
  requested_token_type?: string;  // ADD THIS
}

// In the issueAccessToken helper, differentiate online vs offline:
const isOnlineTokenExchange =
  body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange' &&
  body.requested_token_type === 'urn:shopify:params:oauth:token-type:online-access-token';

const accessToken = randomUUID();
fastify.stateManager.createToken(accessToken, TWIN_SHOP_DOMAIN, ADMIN_SCOPES, 'admin');

if (isOnlineTokenExchange) {
  return reply.send({
    access_token: accessToken,
    scope: ADMIN_SCOPES,
    expires_in: 86400,
    associated_user_scope: ADMIN_SCOPES,
    associated_user: {
      id: 1,
      first_name: 'Dev',
      last_name: 'Twin',
      email: 'twin@dev.myshopify.com',
      email_verified: true,
      account_owner: true,
      locale: 'en',
      collaborator: false,
    },
  });
}
return reply.send({ access_token: accessToken, scope: ADMIN_SCOPES });
```

### Finding #8: access_scopes Route in oauth.ts

```typescript
// Add to oauthPlugin in oauth.ts (after existing route handlers):
fastify.get('/admin/oauth/access_scopes.json', async (request: any, reply) => {
  const token = request.headers['x-shopify-access-token'] as string | undefined;
  if (!token) {
    return reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
  }
  const result = await validateAccessToken(token, (fastify as any).stateManager);
  if (!result.valid) {
    return reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
  }
  // Return the token's scopes as access scope handles
  return {
    access_scopes: ADMIN_SCOPES.split(',').map((s) => ({ handle: s.trim() })),
  };
});
```

**Note:** `validateAccessToken` must be imported in `oauth.ts`. Currently `oauth.ts` does not import it. Add: `import { validateAccessToken } from '../services/token-validator.js';`

### Finding #9: Two-Step GID in productCreate Resolver

```typescript
// In resolvers.ts, productCreate mutation (~line 552):
// BEFORE (timestamp GID — broken):
const productTempId = Date.now() + Math.floor(Math.random() * 100000);
const productId = context.stateManager.createProduct({
  gid: createGID('Product', productTempId),
  ...
});

// AFTER (canonical rowId GID — correct):
const productId = context.stateManager.createProduct({
  gid: `gid://shopify/Product/temp-${Date.now()}`,
  title: input.title,
  description: input.description ?? null,
  vendor: input.vendor ?? null,
  product_type: input.productType ?? null,
});
const finalGid = createGID('Product', productId);
context.stateManager.database
  .prepare('UPDATE products SET gid = ? WHERE id = ?')
  .run(finalGid, productId);
const product = context.stateManager.getProduct(productId);
```

### Finding #10: since_id and ids Filters in REST List Endpoints

```typescript
// In GET /admin/api/:version/products.json handler in rest.ts:
const limitParam = parseInt(String(req.query?.limit ?? '50'), 10);
const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 250);
const pageInfoToken = req.query?.page_info as string | undefined;
const sinceId = parseInt(String(req.query?.since_id ?? '0'), 10);
const idsParam = req.query?.ids as string | undefined;

let afterId = 0;
if (pageInfoToken) {
  try {
    afterId = decodeCursor(pageInfoToken, 'Product');
  } catch {
    return reply.status(400).send({ errors: 'Invalid page_info cursor' });
  }
}

let all = (fastify as any).stateManager.listProducts();

// Apply since_id filter
if (!isNaN(sinceId) && sinceId > 0) {
  all = all.filter((item: any) => item.id > sinceId);
}

// Apply ids filter
if (idsParam) {
  const idSet = new Set(
    idsParam.split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
  );
  all = all.filter((item: any) => idSet.has(item.id));
}

const { items, linkHeader } = paginateList(all, 'Product', version, '/products.json', limit, afterId);
if (linkHeader) reply.header('Link', linkHeader);
return { products: items };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All grant types return same response shape | Token-exchange with online type returns `associated_user` | Phase 36 | `session.isOnline` correctly reflects requested token type |
| `/admin/oauth/access_scopes.json` 404 | Route registered in oauth.ts | Phase 36 | `AccessScope.all()` no longer crashes with transport error |
| Location routes 404 | Location family registered in rest.ts | Phase 36 | `Location.all()`, `Location.find()`, `Location.inventory_levels()` work |
| InventoryLevel mutations 404 | Mutation routes registered in rest.ts | Phase 36 | `InventoryLevel.delete/adjust/connect/set()` no longer 404 |
| GraphQL productCreate uses timestamp GID | Two-step insert uses canonical rowId GID | Phase 36 | Products created via GraphQL are findable via REST numeric ID |
| Fixture loader uses timestamp GID | Two-step insert for all resource types | Phase 36 | Integration test products seeded via fixtures are findable by numeric ID |
| `since_id` and `ids` params silently ignored | Filters applied before pagination | Phase 36 | `Product.all({ since_id: X })` and `InventoryItem.all({ ids: '1,2' })` return correct subset |

**Deprecated/outdated:**
- `createGID('Product', productTempId)` in GraphQL resolver: replaced by two-step pattern
- `createGID('*', Date.now() + random)` in fixture loader: replaced by two-step pattern

## Open Questions

1. **Does `admin.ts` fixture loader need two-step for orders, customers, and inventory items?**
   - What we know: Same timestamp-based GID bug exists for all resource types in fixture loader. However, only products are subject to cross-protocol ID round-trips in current tests (REST uses numeric ID, GraphQL uses GID). Orders use `getOrderByGid` in GraphQL which will match the stored timestamp GID consistently within a session. Customers similarly.
   - What's unclear: Whether finding #9 extends to orders and customers or only products.
   - Recommendation: Fix all resource types in fixture loader for consistency. The cost is low (same two-step pattern, same SQL). It prevents future surprises.

2. **Does `validateAccessToken` need to be imported in oauth.ts for the access_scopes route?**
   - What we know: `oauth.ts` currently does NOT import `validateAccessToken`. The existing OAuth handlers validate credentials via `hasExactTwinCredentials()` and code consumption, not the token store.
   - Recommendation: Import `validateAccessToken` from `../services/token-validator.js` in `oauth.ts`. It is a pure function with no side effects.

3. **Should the access_scopes route return the token's actual granted scopes or hardcoded ADMIN_SCOPES?**
   - What we know: `validateAccessToken()` returns `{ valid: boolean }`. The token store has a `scopes` column. `getTokenRecord()` or similar may return scopes.
   - Recommendation: Return `ADMIN_SCOPES.split(',').map(s => ({ handle: s.trim() }))` as a hardcoded stub. The SDK `AccessScope.all()` just checks that it gets an array back — it doesn't validate the scope values for conformance. Check if `StateManager` exposes a method to get token scopes; if so, use it for correctness.

4. **Does finding #9 require fixing `orderCreate` in resolvers.ts too?**
   - What we know: `resolvers.ts` line 394 uses `createGID('Order', tempId)` with a timestamp-based tempId. However, the REST order lookup uses `getOrderById(numericId)` which works by numeric primary key, not by GID. The GraphQL order lookup uses `getOrderByGid(gid)` which looks up by stored GID string.
   - Recommendation: Fix orders in fixture loader for safety. The GraphQL resolver's orderCreate may also benefit but is lower priority than products since tests exercise `getOrderByGid` lookup (GID-based) not numeric ID lookup.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk --reporter=verbose 2>&1 \| tail -20` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements to Test Map

Phase 36 has no formal requirement IDs. The four findings map to existing tests and new wave-0 tests:

| Finding | Behavior | Test Type | Automated Command | File Exists? |
|---------|----------|-----------|-------------------|--------------|
| #7: Online OAuth response | `tokenExchange(OnlineAccessToken)` returns `session.isOnline === true` | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -i "online\|token-exchange\|isOnline"` | Partial — shopify-api-auth.test.ts tests tokenExchange but does not assert isOnline |
| #8: access_scopes route | `AccessScope.all()` returns array | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep access_scopes` | No — needs new test |
| #8: Location routes | `Location.all()` returns array | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep location` | No — needs new test |
| #8: InventoryLevel mutations | `InventoryLevel.delete/adjust` return without 404 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep inventory_level` | No — needs new test |
| #9: GID round-trip | Product created via GraphQL findable via REST by numeric ID | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep gid-round\|round-trip` | No — needs new test |
| #10: since_id filter | `Product.all({ since_id: X })` returns only products with id > X | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep since_id` | No — needs new test |
| #10: ids filter | `InventoryItem.all({ ids: '1,2' })` returns only matching items | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep ids.*filter` | No — needs new test |

### Sampling Rate

- **Per task commit:** `pnpm test:sdk 2>&1 | tail -10` (watch for no regressions in 253+ existing tests)
- **Per wave merge:** `pnpm test:sdk` full suite
- **Phase gate:** All tests GREEN (253+ passing) before phase complete

### Wave 0 Gaps

New test file needed: `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts`

Tests to write (RED before implementation):

- [ ] `shopify-behavioral-parity.test.ts` — covers Findings #7-#10:
  - Finding #7: `tokenExchange` with `RequestedTokenType.OnlineAccessToken` → `session.isOnline === true` (RED: currently returns `false`)
  - Finding #7: `tokenExchange` with `RequestedTokenType.OfflineAccessToken` → `session.isOnline === false` (already passes; regression guard)
  - Finding #8: `AccessScope.all({ session })` returns `access_scopes` array (RED: currently 404)
  - Finding #8: `Location.all({ session })` returns `locations` array (RED: currently 404)
  - Finding #8: `Location.find({ session, id: 1 })` returns location object (RED: currently 404)
  - Finding #8: `InventoryLevel.all({ session })` returns `inventory_levels` array (already passes — stub exists)
  - Finding #8: `InventoryLevel.delete({ session, inventory_item_id: 1, location_id: 1 })` resolves without error (RED: currently 404)
  - Finding #8: `inventoryLevel.adjust({ inventory_item_id: 1, location_id: 1, available_adjustment: 5 })` returns inventory_level (RED: currently 404)
  - Finding #9: Create product via GraphQL `productCreate`, then fetch via REST `GET /products/{numericId}.json` → returns the same product (RED: currently 404)
  - Finding #10: Seed 3 products, `Product.all({ session, since_id: firstId })` returns only products with id > firstId (RED: currently ignores since_id)
  - Finding #10: Seed 3 products, `InventoryItem.all({ session, ids: '1' })` returns only matching items (RED: currently ignores ids)

## Sources

### Primary (HIGH confidence)

- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/create-session.ts:24-26` — confirms `isOnline = Boolean(associated_user)` in SDK session creation
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts` — confirms `requested_token_type` param is sent in token-exchange request body
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/types.ts` — `OnlineAccessResponse`, `OfflineAccessResponse`, `OnlineAccessUser` interface definitions
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/__tests__/token-exchange.test.ts:37-51` — confirms expected online token response shape with `associated_user`
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/access_scope.ts` — `customPrefix: "/admin/oauth"` confirms route is NOT versioned
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/location.ts` — Location routes confirmed
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/inventory_level.ts` — InventoryLevel mutation routes confirmed (adjust/connect/set/delete)
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/inventory_item.ts` — single-item GET and PUT confirmed
- Direct source inspection: `twins/shopify/src/schema/resolvers.ts:552-554` — timestamp-based GID in productCreate confirmed
- Direct source inspection: `twins/shopify/src/plugins/rest.ts:215-228` — two-step GID update pattern confirmed (works correctly there)
- Direct source inspection: `twins/shopify/src/plugins/admin.ts:89-103` — timestamp-based GID in fixture loader confirmed
- Direct source inspection: `twins/shopify/src/plugins/rest.ts:185-207` — confirms no since_id or ids handling in list endpoints
- Direct source inspection: `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/product.ts:27,120,142` — confirms `since_id` and `ids` params in Product.all()

### Secondary (MEDIUM confidence)

- Upstream test file for token-exchange: `__tests__/token-exchange.test.ts` — verifies expected online session assertion `isOnline: true` (line 89)

### Tertiary (LOW confidence)

None — all claims verified from source code.

## Metadata

**Confidence breakdown:**
- Finding #7 (OAuth grant type differentiation): HIGH — confirmed from upstream create-session.ts and token-exchange.test.ts
- Finding #8 (missing REST routes): HIGH — confirmed by checking each route class's `paths` array against registered routes in rest.ts/oauth.ts
- Finding #9 (GID round-trip): HIGH — confirmed timestamp-based GID in resolver vs rowId-based GID in rest.ts; two-step pattern working in rest.ts
- Finding #10 (list filter semantics): HIGH — confirmed `since_id`/`ids` params defined in upstream REST resource classes but absent from rest.ts query handling

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase — no external dependencies changing)

---

## Appendix: Complete List of Missing Routes (Finding #8)

| Route | Method | Resource Class | Path in twin | Notes |
|-------|--------|----------------|--------------|-------|
| `/admin/oauth/access_scopes.json` | GET | AccessScope | NOT in twin | customPrefix "/admin/oauth" — unversioned |
| `/admin/api/:v/locations.json` | GET | Location | NOT in twin | Tier 2 stub sufficient |
| `/admin/api/:v/locations/count.json` | GET | Location | NOT in twin | Returns `{ count: 1 }` |
| `/admin/api/:v/locations/:id.json` | GET | Location | NOT in twin | Single location stub |
| `/admin/api/:v/locations/:id/inventory_levels.json` | GET | Location | NOT in twin | Nested route |
| `/admin/api/:v/inventory_levels.json` | DELETE | InventoryLevel | NOT in twin (GET exists) | Mutation |
| `/admin/api/:v/inventory_levels/adjust.json` | POST | InventoryLevel | NOT in twin | Mutation |
| `/admin/api/:v/inventory_levels/connect.json` | POST | InventoryLevel | NOT in twin | Mutation |
| `/admin/api/:v/inventory_levels/set.json` | POST | InventoryLevel | NOT in twin | Mutation |
| `/admin/api/:v/inventory_items/:id.json` | GET | InventoryItem | NOT in twin (list GET exists) | Single item |
| `/admin/api/:v/inventory_items/:id.json` | PUT | InventoryItem | NOT in twin | Update |

**Routes already present (not missing):**
- `GET /admin/api/:v/inventory_items.json` — exists, supports pagination
- `GET /admin/api/:v/inventory_levels.json` — exists as empty stub

## Appendix: GID Round-Trip Example (Finding #9)

GraphQL `productCreate` mutation currently:
```
1. productTempId = 1711234567890  (Date.now() + random)
2. DB INSERT with gid = "gid://shopify/Product/1711234567890"  → row id = 1
3. product.gid = "gid://shopify/Product/1711234567890"  (returned in GraphQL response)
4. REST lookup: GET /products/1711234567890.json  → 404  (row id is 1, not 1711234567890)
```

After fix:
```
1. DB INSERT with gid = "gid://shopify/Product/temp-..."  → row id = 1
2. UPDATE SET gid = "gid://shopify/Product/1"  WHERE id = 1
3. product.gid = "gid://shopify/Product/1"  (returned in GraphQL response)
4. REST lookup: GET /products/1.json  → 200  (row id is 1, matches numeric id in GID)
```
