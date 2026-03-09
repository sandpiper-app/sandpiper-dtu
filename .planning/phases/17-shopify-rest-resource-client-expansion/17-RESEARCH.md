# Phase 17: Shopify Client Surfaces & Strategic REST Stubs - Research

**Researched:** 2026-03-09
**Domain:** @shopify/shopify-api client surfaces (GraphqlClient, RestClient, StorefrontClient, graphqlProxy) and REST resource class stubs
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Client surfaces scope:**
- `GraphqlClient` wraps `@shopify/admin-api-client`'s `createAdminApiClient` — uses `abstractFetch` (same as Phase 16's `setAbstractFetchFunc` redirect). Tests verify constructor, `request()`, `query()` with variables, error handling (`GraphqlQueryError`), and API version override
- `RestClient` wraps HTTP methods (get/post/put/delete) using `abstractFetch` — similar to `@shopify/admin-api-client` REST client already tested in Phase 15. Tests verify session-based auth, path construction, pagination via `Link` header, retry on 429/5xx
- `StorefrontClient` uses `@shopify/storefront-api-client`'s `createStorefrontApiClient` — requires `privateAppStorefrontAccessToken` or session token. Twin needs a `/admin/api/{version}/graphql.json` Storefront-compatible endpoint (or reuse existing GraphQL endpoint with Storefront access token validation)
- `graphqlProxy` is a thin wrapper: validates session, creates `GraphqlClient`, proxies `rawBody` as query — test verifies proxy round-trip works with valid session and rejects unauthenticated sessions

**REST resource strategy:**
- 77 REST resource classes exist in `@shopify/shopify-api/rest/admin/2024-01/`
- **Tier 1 (implement):** Resources the twin already supports with state — Product, Customer, Order, Fulfillment, InventoryItem, InventoryLevel (~6 resources). These map to existing twin REST plugin routes
- **Tier 2 (stub):** Resources that apps commonly use but twin has no state for — Collection, Page, Blog, Article, Metafield, Webhook (subscription CRUD). Return valid shapes with hardcoded/minimal data
- **Tier 3 (manifest-only):** Remaining deprecated resources — tracked in coverage ledger as `deferred` with note about REST deprecation. No twin implementation needed
- REST resource classes use `RestClient` internally — they call `this.request()` which delegates to the underlying HTTP client

**Storefront API approach:**
- StorefrontClient uses a different access token type (`privateAppStorefrontAccessToken`) and hits the Storefront API endpoint
- Twin can reuse existing GraphQL plugin with a separate token validation path for Storefront tokens
- Minimal Storefront schema needed: just enough to verify the client surface works (a simple query like `shop { name }`)

**Coverage ledger update:**
- All 77 REST resources added to coverage report with tier attributions
- `GraphqlClient`, `RestClient`, `StorefrontClient`, `graphqlProxy` tracked as live symbols
- Final Phase 17 coverage closes all `@shopify/shopify-api` symbols — remaining are type exports (deferred)

### Claude's Discretion

- Exact REST resource tier assignments beyond the core 6
- Storefront API schema depth (minimal is fine — just enough for client surface verification)
- Whether to test REST resource class inheritance pattern or just HTTP-level behavior
- Test file organization (one file per client surface vs grouped)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-14 | Developer can use `@shopify/shopify-api` client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) against the Shopify twin with the pinned package configuration | GraphqlClient, RestClient, StorefrontClient source analyzed; twin endpoint gaps identified; setAbstractFetchFunc redirect path confirmed |
| SHOP-15 | Developer can use Shopify client surfaces and strategically stubbed REST resource classes, with deprecated REST resources tracked in manifest but not fully implemented (reflects Shopify's April 2025 REST deprecation mandate) | 74 REST resource files enumerated; 3-tier strategy confirmed; coverage ledger LIVE_SYMBOLS update pattern understood from generate-report.ts |
</phase_requirements>

---

## Summary

Phase 17 covers four client surfaces from `shopify.clients` (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) and strategically attributes 74 REST resource classes from `@shopify/shopify-api/rest/admin/2024-01/`. The previous phase (16) established the `setAbstractFetchFunc` redirect pattern that routes all `shopify-api` HTTP calls through the Shopify twin — Phase 17 builds tests on top of that foundation.

Three of the four client surfaces (GraphqlClient, RestClient, graphqlProxy) will hit existing twin endpoints: `/admin/api/2024-01/graphql.json` and the REST plugin routes already tested in Phase 15. StorefrontClient is the only surface requiring a net-new twin endpoint: `GET/POST /api/2024-01/graphql.json` (without the `/admin` prefix) using `Shopify-Storefront-Private-Token` header instead of `X-Shopify-Access-Token`. This is a confirmed architectural difference from the admin API client.

REST resource class coverage is handled as a manifest ledger update with selective twin implementation. Tier 1 resources (Product, Customer, Order, Fulfillment, InventoryItem, InventoryLevel) already have backing routes in the existing REST plugin. Tier 2 resources (Collection, Page, Blog, Article, Metafield, Webhook) need minimal stub routes returning valid shapes. The remaining ~65+ resources are Tier 3 — added to the manifest with `deferred` attribution per Shopify's April 2025 deprecation mandate.

**Primary recommendation:** Implement in four sequential tasks: (1) GraphqlClient + graphqlProxy tests against existing twin GraphQL endpoint, (2) RestClient tests against existing REST plugin + Tier 1 resource class tests, (3) Storefront twin endpoint + StorefrontClient tests, (4) Tier 2 REST resource stubs + full manifest ledger update.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@shopify/shopify-api` | 12.3.0 | Main SDK under test — provides `shopify.clients.Graphql`, `Rest`, `Storefront`, `graphqlProxy`, and REST resource classes | Pinned workspace root dependency |
| `@shopify/storefront-api-client` | 1.0.9 | Underlying client used by `StorefrontClient` (transitive dep of `shopify-api`) | Auto-resolved via pnpm, available in `.pnpm` store |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^3.0.0 | Test runner with singleFork pool | All sdk-verification tests |
| Fastify | existing | Twin HTTP server for new Storefront endpoint | Adding `/api/{version}/graphql.json` route to graphql.ts plugin |
| graphql-yoga | existing | Twin GraphQL executor — can be reused for Storefront endpoint | Reuse same yoga instance with Storefront token auth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing yoga for Storefront | New Storefront-specific yoga | Reuse is sufficient — Storefront schema is minimal, only needs `shop { name }` query |
| Tier 2 stubs in rest.ts | Separate storefront.ts plugin | rest.ts is the right home — all REST resource routes belong with the existing REST plugin |

---

## Architecture Patterns

### Recommended Project Structure

```
tests/sdk-verification/sdk/
├── shopify-api-graphql-client.test.ts    # Plan 17-01: GraphqlClient + graphqlProxy (SHOP-14)
├── shopify-api-rest-client.test.ts       # Plan 17-02: RestClient + Tier 1 resource classes (SHOP-14, SHOP-15)
├── shopify-api-storefront-client.test.ts # Plan 17-03: StorefrontClient (SHOP-14)
└── [coverage regeneration in Plan 17-04]

twins/shopify/src/plugins/
├── graphql.ts    # Add /api/2024-01/graphql.json Storefront endpoint
└── rest.ts       # Add Tier 1 resource routes + Tier 2 stub routes
```

### Pattern 1: GraphqlClient Construction

The `shopify.clients.Graphql` constructor signature requires a `Session` object. A session is obtained via `shopify.auth.clientCredentials()` which calls the twin's token exchange endpoint.

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/graphql/client.ts
const GraphqlClient = shopify.clients.Graphql;
const client = new GraphqlClient({ session });
// request() delegates to @shopify/admin-api-client which uses abstractFetch
const response = await client.request('{ products(first: 1) { edges { node { id } } } }');
```

`GraphqlClient.query()` is deprecated since v12.0.0 and logs a warning. Test `request()` as primary, `query()` to verify backward compatibility.

`GraphqlQueryError` is thrown when the GraphQL response contains `errors`. To trigger it, send a query that produces a GQL error (e.g., malformed query string). The error has `.response` property containing raw fetch response.

### Pattern 2: RestClient Construction

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/rest/client.ts
const RestClient = shopify.clients.Rest;
const client = new RestClient({ session });
// Delegates to createAdminRestApiClient with abstractFetch
const result = await client.get<{ products: unknown[] }>({ path: 'products' });
// result.body.products — same shape as Phase 15 admin-api-client tests
// result.pageInfo — populated when Link header is present
```

`RestClient` path format: relative to `/admin/api/{version}/` (e.g., `'products'` → `/admin/api/2024-01/products.json`). The `formatPaths: true` default appends `.json`.

Link header pagination: twin's REST plugin currently returns no `Link` header. To test `pageInfo`, either mock a response or add a twin endpoint that returns a `Link` header.

### Pattern 3: REST Resource Classes (Tier 1)

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/product.ts
// Base.setClassProperties is called by shopifyApi() via shopify.rest loader
import { Product } from '@shopify/shopify-api/rest/admin/2024-01/product';
// Must call setClassProperties first — shopify instance provides rest loader:
const shopify = createShopifyApiClient();
// shopify.rest.Product, shopify.rest.Customer, etc. are pre-configured
const products = await shopify.rest.Product.all({ session });
// products.data — array of Product instances
// products.headers — response headers
```

REST resource classes must be loaded via `shopify.rest` accessor (auto-configures `Client` and `config` static properties via `Base.setClassProperties`). Do NOT import and call static methods without this setup — it will crash with missing `Client`.

### Pattern 4: StorefrontClient Construction

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/storefront/client.ts
// StorefrontClient requires privateAppStorefrontAccessToken OR session.accessToken
// For twin testing, session.accessToken is the access token the twin issued
const StorefrontClient = shopify.clients.Storefront;
const client = new StorefrontClient({ session });
// Delegates to createStorefrontApiClient({ privateAccessToken: session.accessToken })
// Hits: https://dev.myshopify.com/api/2024-01/graphql.json
// With: Shopify-Storefront-Private-Token header
const response = await client.request('{ shop { name } }');
```

The Storefront endpoint URL is `{storeDomain}/api/{apiVersion}/graphql.json` — NOT `/admin/api/`. This is confirmed from `@shopify/storefront-api-client`'s source: `return \`${storeUrl}/api/${urlApiVersion}/graphql.json\``.

### Pattern 5: graphqlProxy

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/graphql_proxy/graphql_proxy.ts
// graphqlProxy validates session and proxies rawBody to GraphqlClient
const result = await shopify.clients.graphqlProxy({
  session,
  rawBody: '{ products(first: 1) { edges { node { id } } } }',
});
// result.body — GraphQLClientResponse object
// Throws InvalidSession if session.accessToken is missing
// Throws MissingRequiredArgument if rawBody has no query
```

`rawBody` accepts either a string (raw query) or `{ query: string, variables?: Record<string, any> }` object. The `graphqlProxy` creates a `GraphqlClient` and calls `.request()`.

### Anti-Patterns to Avoid

- **Importing REST resource classes without shopify.rest:** `import { Product } from '@shopify/shopify-api/rest/admin/2024-01/product'` then calling `Product.all()` directly will fail because `Product.Client` and `Product.config` are undefined until `Base.setClassProperties` is called.
- **Using `shopify.clients.Storefront` with a missing token:** `StorefrontClient` throws `MissingRequiredArgument` if session has no accessToken AND config has no `privateAppStorefrontAccessToken`. Always ensure session has a valid token.
- **Sending Storefront requests to the admin GraphQL endpoint:** The twin's existing `/admin/api/2024-01/graphql.json` checks for `X-Shopify-Access-Token`. Storefront requests use `Shopify-Storefront-Private-Token` and hit `/api/2024-01/graphql.json` — a different path entirely.
- **Version normalization gap for Storefront:** The existing `createShopifyApiClient()` version normalization only rewrites `/admin/api/[version]/` paths. Storefront's `/api/[version]/graphql.json` requires an additional normalization rule in `setAbstractFetchFunc`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Storefront GraphQL execution | New Yoga instance | Reuse existing `yoga` instance from `graphql.ts` plugin | Same GraphQL Yoga can handle both admin and storefront endpoints with different auth middleware |
| REST resource class setup | Custom client wiring | `shopify.rest.Product` (and other resources via `shopify.rest`) | `shopifyApi()` pre-configures all REST resource classes via `shopify.rest` accessor |
| Session creation for tests | Building Session objects manually | `shopify.auth.clientCredentials({ shop: 'dev.myshopify.com' })` | Existing auth helper already tested in Phase 16; creates a twin-backed Session with valid accessToken |
| Coverage ledger update | New generator script | Update `LIVE_SYMBOLS` map in `generate-report.ts` + run `pnpm coverage:generate` | Existing infrastructure handles all symbol attribution and tier assignment |

**Key insight:** The existing `setAbstractFetchFunc` intercept handles host rewriting for ALL three admin client surfaces (GraphqlClient, RestClient, StorefrontClient). The only net-new plumbing is: (a) version normalization for the Storefront `/api/` path, and (b) a new twin route at `/api/2024-01/graphql.json` with Storefront token auth.

---

## Common Pitfalls

### Pitfall 1: Storefront URL Path Mismatch
**What goes wrong:** The existing `createShopifyApiClient()` version normalization regex (`/\/admin\/api\/[^/]+\//`) does not match the Storefront path `/api/2024-01/graphql.json`. Requests hit `/api/2025-04/graphql.json` (or whatever version `storefront-api-client` considers "current") instead of `/api/2024-01/graphql.json` — the twin returns 404.
**Why it happens:** `@shopify/storefront-api-client` 1.0.9 uses `/api/{version}/graphql.json` path (confirmed via `client.getApiUrl()` returning `https://dev.myshopify.com/api/2024-01/graphql.json`). The `storefront-api-client` also logs a deprecation warning for `2024-01` since it considers supported versions as 2025-04+.
**How to avoid:** Add a second normalization rule in `setAbstractFetchFunc`: `/\/api\/[^/]+\/graphql\.json/` → `/api/2024-01/graphql.json`. Or extend the helper to accept a `storefrontVersionOverride` flag.
**Warning signs:** Test fails with 404; or the storefront-api-client deprecation warning appears and version is different from `2024-01`.

### Pitfall 2: Storefront Auth Header Difference
**What goes wrong:** Twin's existing GraphQL endpoint (`/admin/api/2024-01/graphql.json`) checks for `X-Shopify-Access-Token`. StorefrontClient sends `Shopify-Storefront-Private-Token`. Reusing the admin endpoint without modification means token validation fails (returns 401 or unauthenticated context).
**Why it happens:** Storefront API and Admin API use different auth header names by design — they're separate APIs.
**How to avoid:** The Storefront twin endpoint (`/api/2024-01/graphql.json`) must check for `Shopify-Storefront-Private-Token` header (or accept either, since the twin uses the same token store). The twin can validate the Storefront token using the same `validateAccessToken` function with the token extracted from `Shopify-Storefront-Private-Token`.
**Warning signs:** GraphQL returns `{ errors: [{ message: 'Unauthorized' }] }` with status 200, or 401.

### Pitfall 3: REST Resource Class Not Configured
**What goes wrong:** Calling `shopify.rest.Product.all({ session })` works, but calling `Product.all({ session })` after a direct import fails with `TypeError: Cannot read properties of undefined (reading 'get')` because `Product.Client` is not set.
**Why it happens:** REST resource classes inherit from `Base` which requires `Base.setClassProperties({ Client, config })` before any HTTP calls. `shopifyApi()` calls this during initialization via the `rest` accessor.
**How to avoid:** Always use `shopify.rest.Product` (not direct import). In tests, use `const Product = shopify.rest.Product; await Product.all({ session })`.
**Warning signs:** Runtime error referencing `Client` being undefined.

### Pitfall 4: graphqlProxy rawBody Format
**What goes wrong:** Passing `rawBody` as a plain query string works, but passing it as `{ query: string }` object also works. However, `{ data: string }` format (old `GraphqlClient.query()` format) does NOT work — `graphqlProxy` checks `rawBody.query`, not `rawBody.data`.
**Why it happens:** `graphqlProxy` source: `if (typeof rawBody === 'string') { query = rawBody; } else { query = rawBody.query; ... }` — only `query` key is recognized.
**How to avoid:** Use either string format or `{ query: string, variables?: Record<string, any> }` format.
**Warning signs:** `MissingRequiredArgument: Query missing.` error when rawBody is an object without `.query` key.

### Pitfall 5: Link Header Pagination in Twin
**What goes wrong:** `RestClient.request()` parses the `Link` header to populate `result.pageInfo`. The existing twin REST plugin does not return `Link` headers. Tests expecting `pageInfo` to be populated will find `undefined`.
**Why it happens:** Twin's `GET /admin/api/2024-01/products.json` returns `{ products: [] }` with no pagination headers — it never had enough state volume to require pagination.
**How to avoid:** Either test that `pageInfo` is `undefined` when no `Link` header is present (valid behavior), or add a dedicated twin endpoint that returns a `Link` header for pagination tests. The CONTEXT.md specifies verifying pagination "via Link header" — a twin endpoint returning a `Link` header is needed.
**Warning signs:** `result.pageInfo` is `undefined` when test expects it to have `nextPage`.

### Pitfall 6: Storefront Schema Missing `shop` Query
**What goes wrong:** The twin's existing GraphQL schema (`schema.graphql`) has `QueryRoot` with `products`, `orders`, `customers` — but no `shop { name }` query. `StorefrontClient.request('{ shop { name } }')` returns a GraphQL error.
**Why it happens:** The twin schema was built for admin API shape, not the Storefront API shape.
**How to avoid:** Add a minimal `shop` type and `shop` query to the schema: `type ShopInfo { name: String! } extend type QueryRoot { shop: ShopInfo }`. The Storefront endpoint can serve the same schema with the `shop` resolver.
**Warning signs:** GraphQL validation error: `Cannot query field "shop" on type "QueryRoot"`.

---

## Code Examples

### GraphqlClient: Verified Construction and Request Patterns

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/graphql/client.ts
// GraphqlClient uses abstractFetch (redirected to twin by setAbstractFetchFunc)
// Always use shopify.clients.Graphql — not direct import from lib path
const GraphqlClient = shopify.clients.Graphql;
const client = new GraphqlClient({ session });

// request() — primary method (not deprecated)
const response = await client.request('{ products(first: 1) { edges { node { id } } } }');
// response.data.products.edges[0].node.id

// request() with variables
const response2 = await client.request(
  'query GetProduct($id: ID!) { product(id: $id) { title } }',
  { variables: { id: 'gid://shopify/Product/1' } }
);

// query() — deprecated but must still work
const legacyResponse = await client.query({ data: '{ products(first: 1) { edges { node { id } } } }' });
// legacyResponse.body — same structure

// API version override
const overrideClient = new GraphqlClient({ session, apiVersion: ApiVersion.January24 });
```

### RestClient: Verified HTTP Method Patterns

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/rest/client.ts
// RestClient delegates to createAdminRestApiClient (same as Phase 15 tests)
const RestClient = shopify.clients.Rest;
const client = new RestClient({ session });

// get() — path is relative to /admin/api/{version}/
const result = await client.get<{ products: unknown[] }>({ path: 'products' });
// result.body.products — products array
// result.headers — response headers
// result.pageInfo — undefined when no Link header

// post()
const created = await client.post({ path: 'products', data: { product: { title: 'Test' } } });

// put()
const updated = await client.put({ path: 'products/1', data: { product: { title: 'Updated' } } });

// delete()
const deleted = await client.delete({ path: 'products/1' });

// with query params
const filtered = await client.get({ path: 'products', query: { limit: '10' } });

// retry behavior (same pattern as Phase 15)
const retried = await client.get({ path: 'test-retry', tries: 2 });
```

### REST Resource Class: Verified Pattern

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/product.ts
// Access via shopify.rest — DO NOT import directly without setClassProperties
const Product = shopify.rest.Product;

// all() — lists products (uses GET /admin/api/2024-01/products.json)
const { data: products, headers } = await Product.all({ session });
// products[0] is a Product instance with .id, .title, etc.

// find() — get single product
const product = await Product.find({ session, id: 123 });

// save() — POST if no id, PUT if has id
const newProduct = new Product({ session });
newProduct.title = 'Test Product';
await newProduct.save();

// delete()
await Product.delete({ session, id: 123 });
```

### StorefrontClient: URL Verification

```typescript
// Source: @shopify/storefront-api-client/dist/storefront-api-client.mjs
// URL pattern: `${storeUrl}/api/${urlApiVersion}/graphql.json`
// Auth header: Shopify-Storefront-Private-Token (not X-Shopify-Access-Token)

const StorefrontClient = shopify.clients.Storefront;
const client = new StorefrontClient({ session });
// Internally calls createStorefrontApiClient({ privateAccessToken: session.accessToken })

// Minimal query for client surface verification
const response = await client.request('{ shop { name } }');
// response.data.shop.name — from twin's ShopInfo resolver
```

### Twin: New Storefront Endpoint (to add to graphql.ts)

```typescript
// Pattern for new /api/2024-01/graphql.json route in graphql.ts
fastify.route({
  url: '/api/2024-01/graphql.json',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: async (req, reply) => {
    // Validate Shopify-Storefront-Private-Token instead of X-Shopify-Access-Token
    const token = req.headers['shopify-storefront-private-token'];
    // Validate using same validateAccessToken() service
    // Reuse same yoga.fetch() call pattern as admin endpoint
  }
});
```

### setAbstractFetchFunc: Storefront Version Normalization Fix

```typescript
// Extend the existing version normalization in createShopifyApiClient
// to also handle the Storefront /api/{version}/ path:
const normalized = hostRewritten
  .replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/')
  .replace(/\/api\/[^/]+\/graphql\.json/, '/api/2024-01/graphql.json');
```

### Coverage Ledger Update Pattern

```typescript
// In tests/sdk-verification/coverage/generate-report.ts
// Add to LIVE_SYMBOLS map for Phase 17:
const LIVE_SYMBOLS: Record<string, string> = {
  // ... existing Phase 15-16 entries ...

  // Phase 17: SHOP-14 client surfaces
  '@shopify/shopify-api@12.3.0/GraphqlClient': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlClient.request': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlClient.query': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.get': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.post': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.put': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.delete': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Graphql': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Rest': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Storefront': 'sdk/shopify-api-storefront-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.graphqlProxy': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlProxy': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.clients': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.rest': 'sdk/shopify-api-rest-client.test.ts',
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `RestClient.query()` (GraphQL) | `RestClient.request()` | shopify-api v9/v12 | `query()` still works but deprecated; `request()` is the primary method |
| REST Resources as primary persistence | GraphQL API is primary; REST deprecated | April 2025 Shopify mandate | REST resources tracked in manifest as deferred; only commonly-used ones get twin coverage |
| `StorefrontClient.query()` | `StorefrontClient.request()` | shopify-api v12 | Same deprecation pattern as GraphqlClient |

**Deprecated/outdated:**
- `GraphqlClient.query()`: deprecated since v12.0.0; test for backward compatibility only, not as primary test case
- `StorefrontClient.query()`: same deprecation as GraphqlClient.query()
- REST resource classes: 74 classes exist, Shopify deprecated the REST Admin API (April 2025); Phase 17 uses 3-tier attribution

---

## Open Questions

1. **InventoryLevel REST resource path**
   - What we know: `InventoryItem` maps to `/admin/api/2024-01/inventory_items.json`, `InventoryLevel` maps to `/admin/api/2024-01/inventory_levels.json`
   - What's unclear: The twin REST plugin only has product CRUD and test-retry routes. InventoryItem and InventoryLevel are Tier 1 but need twin routes confirmed
   - Recommendation: Add `GET /admin/api/2024-01/inventory_items.json` and `GET /admin/api/2024-01/inventory_levels.json` routes to rest.ts returning state from `stateManager.listInventoryItems()`

2. **Storefront schema: shared vs separate GraphQL schema**
   - What we know: Twin serves a single `schema.graphql` file; Storefront API schema is different from Admin API schema
   - What's unclear: Whether to extend existing schema with `shop` query or create a separate Storefront schema file
   - Recommendation: Extend existing schema with `type ShopInfo { name: String! }` and `shop: ShopInfo` on `QueryRoot`; add a trivial resolver. Keep it minimal — just enough for client surface verification.

3. **Storefront token acceptance**
   - What we know: Twin validates tokens via `validateAccessToken()` which checks the `tokens` table. Storefront requests send `Shopify-Storefront-Private-Token` with a session's accessToken value
   - What's unclear: Whether the same token issued by `clientCredentials()` will be accepted by the twin's Storefront endpoint
   - Recommendation: Reuse `validateAccessToken()` with the token from `Shopify-Storefront-Private-Token` header. The twin's token store doesn't distinguish token type — any valid token will pass.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm vitest run --project sdk-verification --reporter=verbose tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-14 | `shopify.clients.Graphql` constructor + `request()` | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-graphql-client.test.ts` | Wave 0 |
| SHOP-14 | `GraphqlClient.query()` (deprecated compat) | live | same file | Wave 0 |
| SHOP-14 | `GraphqlClient` error handling (`GraphqlQueryError`) | live | same file | Wave 0 |
| SHOP-14 | `shopify.clients.Rest` constructor + get/post/put/delete | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-rest-client.test.ts` | Wave 0 |
| SHOP-14 | `RestClient` pagination via Link header | live | same file | Wave 0 |
| SHOP-14 | `shopify.clients.Storefront` constructor + `request()` | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-storefront-client.test.ts` | Wave 0 |
| SHOP-14 | `shopify.clients.graphqlProxy` round-trip | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-graphql-client.test.ts` | Wave 0 |
| SHOP-14 | `graphqlProxy` rejects unauthenticated session | unit | same file | Wave 0 |
| SHOP-15 | Tier 1 REST resource `Product.all()` | live | same as rest-client file | Wave 0 |
| SHOP-15 | Tier 1 REST resource `Customer.all()` | live | same file | Wave 0 |
| SHOP-15 | Tier 1 REST resource `Order.all()` | live | same file | Wave 0 |
| SHOP-15 | Tier 2 REST resource `Metafield.all()` (stub) | live | same file | Wave 0 |
| SHOP-15 | Coverage ledger update (generate-report.ts) | smoke | `pnpm coverage:generate && pnpm drift:check` | Existing files |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project sdk-verification` (full sdk suite, singleFork, ~30s)
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts` — covers GraphqlClient + graphqlProxy (SHOP-14)
- [ ] `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — covers RestClient + Tier 1/2 REST resource classes (SHOP-14, SHOP-15)
- [ ] `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` — covers StorefrontClient (SHOP-14)

*(Existing test infrastructure and global-setup.ts cover all other requirements — no new framework setup needed)*

---

## Sources

### Primary (HIGH confidence)
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/graphql/client.ts` — GraphqlClient source, constructor, request(), query() implementation
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/rest/client.ts` — RestClient source, HTTP method delegation, Link header pagination
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/storefront/client.ts` — StorefrontClient source, token handling
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/graphql_proxy/graphql_proxy.ts` — graphqlProxy source, ~35 lines
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/index.ts` — ShopifyClients type and clientClasses() factory
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/base.ts` — Base class for REST resources, setClassProperties, request delegation
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-01/product.ts` — canonical REST resource pattern
- `node_modules/.pnpm/@shopify+storefront-api-client@1.0.9/node_modules/@shopify/storefront-api-client/dist/storefront-api-client.mjs` — URL construction: `/api/{version}/graphql.json`
- `tests/sdk-verification/helpers/shopify-api-client.ts` — createShopifyApiClient() with setAbstractFetchFunc
- `tests/sdk-verification/coverage/generate-report.ts` — LIVE_SYMBOLS attribution pattern
- `twins/shopify/src/plugins/graphql.ts` — existing admin GraphQL endpoint
- `twins/shopify/src/plugins/rest.ts` — existing REST plugin routes

### Secondary (MEDIUM confidence)
- Live execution of `createStorefrontApiClient()` confirming URL: `https://dev.myshopify.com/api/2024-01/graphql.json` and auth header: `Shopify-Storefront-Private-Token`
- Coverage report analysis confirming `Shopify.clients`, `Shopify.rest`, `GraphqlClient`, `RestClient`, `ShopifyClients.*`, `GraphqlProxy` all at `deferred` tier

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all library sources read from upstream submodule and installed packages
- Architecture: HIGH — existing test patterns and twin structure directly observable
- Pitfalls: HIGH — URL pattern confirmed by live execution; auth header confirmed by source inspection
- REST resource tier assignments: MEDIUM — Tier 1/2 list is from CONTEXT.md (locked decisions), not independently verified against real Shopify usage data

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase; 30-day horizon)
