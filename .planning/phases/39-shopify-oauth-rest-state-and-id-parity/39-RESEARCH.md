# Phase 39: Shopify OAuth, REST State, and ID Parity - Research

**Researched:** 2026-03-14
**Domain:** Shopify twin fidelity gap closure for OAuth grant validation, GraphQL/REST ID parity, REST resource persistence, and inventory/collection state
**Confidence:** HIGH

## Summary

Phase 39 is not a general Shopify expansion phase. Phase 36 already fixed the first-order gaps for product GIDs, access scopes, location routes, and basic `since_id` / `ids` filters. The remaining work is narrower and more structural: the twin still has several "good enough to stay green" seams that are wrong for real `@shopify/shopify-api` clients and for future app-framework validation.

The current codebase has four confirmed gap clusters:

1. **OAuth grant-specific validation drift**
   - [`twins/shopify/src/plugins/oauth.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/oauth.ts) only distinguishes the online token-exchange response shape. It does not validate grant-specific required fields for `client_credentials`, `refresh_token`, and token-exchange bodies.
   - The vendored client contracts show three distinct request bodies:
     - [`token-exchange.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts): `grant_type`, `subject_token`, `subject_token_type`, `requested_token_type`, optional `expiring`
     - [`client-credentials.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/client-credentials.ts): `grant_type=client_credentials` only
     - [`refresh-token.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/refresh-token.ts): `grant_type=refresh_token` plus `refresh_token`
   - Today, any request with valid credentials and a passthrough grant type can mint a token even when the grant-specific fields are missing or malformed.

2. **Order / customer GraphQL-to-REST ID parity drift**
   - [`orderCreate` in `resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts) and [`customerCreate` in `resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts) still generate timestamp-based GIDs before insert.
   - [`GET /customers/:id.json` in `rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts) looks up by `gid://shopify/Customer/{id}` instead of numeric primary key.
   - [`/admin/fixtures/load` in `admin.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/admin.ts) still seeds orders, customers, and inventory items with timestamp GIDs instead of canonical row-ID GIDs.
   - Product parity was fixed in Phase 36. Orders and customers still need the same two-step pattern.

3. **REST write and filter persistence drift**
   - [`PUT /products/:id.json` in `rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts) returns a hardcoded object instead of persisted state.
   - Customer and order REST write routes are still missing from [`rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts), even though the vendored resource classes define `post` and `put` operations in:
     - [`customer.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/customer.ts)
     - [`order.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/order.ts)
   - Customer and order list endpoints support `since_id` but still ignore `ids`, even though the vendored resource classes pass both.
   - Product list already supports `ids` and `since_id`, but still ignores `collection_id`, which the vendored `Product.all()` contract supports.

4. **Inventory-level and collection state drift**
   - [`inventory_levels.json` and related routes in `rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts) are still stateless stubs or request-echo handlers.
   - [`Location.inventory_levels()` upstream contract](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2023-07/location.ts) expects a real list response, not a permanent empty array.
   - There is no `inventory_levels` persistence in [`packages/state/src/state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts) or [`schema.sql`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/db/schema.sql).
   - Product collection filtering cannot be implemented honestly with the current schema because there is no collection membership state. `Product.all({ collection_id })` is part of the vendored product contract, and `Collect` / `CustomCollection` upstream contracts show the expected shape and query parameters.

**Primary recommendation:** Plan Phase 39 in four passes:
- Wave 0 RED tests for OAuth, ID parity, REST write/filter persistence, and inventory/collection state
- OAuth grant validation + SHOP-16 framework-readiness smoke
- Order/customer GID canonicalization and product/customer/order REST write/filter persistence
- Inventory-level state and collection membership persistence, including reset-safe schema changes

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-14 | `shopify.clients.Rest` and related client surfaces must behave correctly against the twin. | Tighten REST write, find, and filter semantics so the pinned client surface stops succeeding against incorrect behavior. |
| SHOP-15 | Strategic REST resource classes must be live or intentionally stateful/stubbed at the right seam. | Upgrade the specific drifted surfaces (`Product`, `Customer`, `Order`, `InventoryLevel`, and collection-related filters) instead of broadening all Tier 2 resources. |
| SHOP-16 | `REQUIREMENTS.md` still lists this as a deferred v2 app-framework target, but Phase 39 maps it in the roadmap. | Treat as **framework readiness**, not full framework rollout: add smoke coverage proving app-framework auth/admin flows no longer depend on incorrect OAuth or REST behavior. |
| SHOP-17 | Versioned Admin routes must keep honoring path versions while new persistence/filter behavior is added. | All new REST routes and tests must continue using `/admin/api/:version/...`; do not regress Phase 22 / 28 version routing. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastify` | existing workspace | Shopify twin routing/plugins | All affected behavior lives in existing plugin routes. |
| `@dtu/state` + `better-sqlite3` | workspace + existing dependency | Persistent twin state | The missing behavior is mostly state drift, not transport drift. |
| `vitest` | existing workspace | SDK and integration verification | All current Shopify parity work is already proven through Vitest. |
| vendored `@shopify/shopify-api` sources | pinned in `third_party/upstream/shopify-app-js` | Primary contract source for request shapes and resource paths | This phase must follow the pinned client, not memory. |

### No New Dependencies

All fixes are source edits and test additions. No new package installation is required.

## Architecture Patterns

### Pattern 1: Validate OAuth by Grant Type, Not Just by Credentials

**What:** Keep [`oauth.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/oauth.ts) as the only token-exchange route, but branch validation rules by `grant_type`.

**Why:** The pinned Shopify client sends distinct bodies for auth-code exchange, client credentials, refresh token, and token exchange. Grant-specific validation is the phase seam that protects both SDK auth helpers and future app-framework flows.

**Concrete contract from vendored client sources:**

```typescript
// token-exchange.ts
{
  client_id,
  client_secret,
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
  subject_token,
  subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  requested_token_type,
  expiring,
}

// client-credentials.ts
{
  client_id,
  client_secret,
  grant_type: 'client_credentials',
}

// refresh-token.ts
{
  client_id,
  client_secret,
  refresh_token,
  grant_type: 'refresh_token',
}
```

**Recommended validation table:**

| Grant | Required fields | Reject if missing |
|------|------------------|------------------|
| auth code (no passthrough grant) | `client_id`, `client_secret`, `code` | `400 invalid_request` |
| `client_credentials` | `client_id`, `client_secret`, `grant_type` | `400 invalid_request` |
| `refresh_token` | `client_id`, `client_secret`, `grant_type`, `refresh_token` | `400 invalid_request` |
| token exchange | `client_id`, `client_secret`, `grant_type`, `subject_token`, `subject_token_type`, `requested_token_type` | `400 invalid_request` |

**Extra rule for token exchange:** `requested_token_type` must be one of the two Shopify URNs. Do not mint a token for arbitrary requested token types.

### Pattern 2: Use Canonical Row-ID GIDs for Any Resource That Must Round-Trip Across GraphQL and REST

**What:** Reuse the product two-step insert pattern from Phase 36 for orders and customers.

**Why:** REST lookups are numeric-ID based. GraphQL create responses are GID based. Timestamp GIDs break cross-protocol round-tripping.

**Correct pattern:**

```typescript
const rowId = stateManager.createCustomer({
  gid: `gid://shopify/Customer/temp-${Date.now()}`,
  email,
  first_name,
  last_name,
});

const finalGid = createGID('Customer', rowId);
stateManager.database
  .prepare('UPDATE customers SET gid = ? WHERE id = ?')
  .run(finalGid, rowId);
```

Apply the same pattern to:
- `orderCreate` in [`resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts)
- `customerCreate` in [`resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts)
- order/customer/inventory-item fixture seeding in [`admin.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/admin.ts)

### Pattern 3: REST Write Routes Should Call StateManager CRUD, Not Return Hardcoded Shapes

**What:** Keep REST write behavior in [`rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts), but route every write through explicit StateManager methods and re-read persisted rows for the response.

**Why:** The current product PUT route is a pure stub, and customer/order write routes are absent. The state layer already has `updateProduct`, `updateCustomer`, and `updateOrder`.

**Minimal route set justified by vendored resource classes:**
- `POST /admin/api/:version/customers.json`
- `PUT /admin/api/:version/customers/:id.json`
- `POST /admin/api/:version/orders.json`
- `PUT /admin/api/:version/orders/:id.json`
- fix existing `PUT /admin/api/:version/products/:id.json`

**Read-first state methods already available:**
- [`updateProduct()`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)
- [`updateCustomer()`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)
- [`updateOrder()`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)

### Pattern 4: Inventory Level and Collection Filters Need Real Schema, Not Smarter Stubs

**What:** Add persistence for inventory levels and collection membership instead of expanding the current echo-stub behavior.

**Why:** The current code has no place to remember inventory level mutations or product-to-collection membership, so any "filter" or "inventory_levels list" behavior would otherwise be fabricated.

**Schema additions recommended:**
- `inventory_levels`
  - `inventory_item_id`
  - `location_id`
  - `available`
  - `created_at`
  - `updated_at`
  - unique composite key on `(inventory_item_id, location_id)`
- `custom_collections`
  - `id`
  - `gid`
  - `title`
  - `handle`
  - timestamps
- `collects`
  - `id`
  - `collection_id`
  - `product_id`
  - `position`
  - timestamps

**Why not a shortcut:** `Product.all({ collection_id })` cannot be made truthful unless membership exists somewhere. The vendored `Collect` and `CustomCollection` contracts make this explicit.

### Pattern 5: Any New Table Must Immediately Join Reset Coverage

**What:** If Phase 39 adds `inventory_levels`, `custom_collections`, or `collects`, they must be wired into StateManager reset and statement teardown in the same plan.

**Why:** `XCUT-01` is already complete, but Phase 39 can regress it by adding tables without reset handling.

**Read-first seams:**
- [`reset()` in `state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)
- [`close()` in `state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)
- prepared statement null-outs in [`state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)

## Minimal Plan Decomposition

Recommended split for planning:

1. **Wave 0:** add RED contract tests
   - OAuth grant-specific validation
   - order/customer GraphQL-to-REST numeric-ID parity
   - product/customer/order REST create/update/filter persistence
   - inventory-level persistence and product `collection_id` filtering
   - minimal SHOP-16 readiness smoke around auth/admin client flows

2. **Wave 1A:** OAuth grant validation + framework-readiness smoke
   - `oauth.ts`
   - `shopify-api-auth.test.ts`
   - optional new SDK smoke for app-framework-sensitive auth path

3. **Wave 1B:** Canonical IDs + REST write/filter persistence for products/customers/orders
   - `resolvers.ts`
   - `rest.ts`
   - `admin.ts`
   - `state-manager.ts`
   - integration + SDK verification updates

4. **Wave 2:** Inventory-level and collection-membership state
   - schema additions
   - state-manager CRUD + reset coverage
   - `rest.ts` inventory-level + collection-filter routes
   - tests proving persistence across requests

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth validation | one big `if credentials ok then mint token` branch | grant-specific validation table in `oauth.ts` | The vendored client request bodies are explicit. |
| GID parity | timestamp GIDs kept forever | two-step insert then update to row-ID GID | Product parity already proved this pattern. |
| REST writes | ad hoc object literals in route handlers | StateManager CRUD + re-read persisted row | Prevents response drift from stored state. |
| Inventory levels | echo request payloads forever | dedicated `inventory_levels` persistence | `adjust`, `set`, `connect`, and location list must agree across requests. |
| Collection filters | hardcoded `[]` or fake filtering without membership | real `collects` / collection membership state | `collection_id` is a real upstream filter, not a display-only field. |

## Common Pitfalls

### Pitfall 1: Fixing GraphQL GIDs Without Fixing REST Lookup

**What goes wrong:** `customerCreate` starts returning canonical GIDs, but `GET /customers/:id.json` still constructs a GID string and looks up by GID instead of numeric ID.

**Why it happens:** The current route uses `getCustomerByGid(\`gid://shopify/Customer/${id}\`)`.

**How to avoid:** Update the route and the create path in the same plan.

### Pitfall 2: Adding Order / Customer POST Routes But Leaving PUT Stubs or Missing Filters

**What goes wrong:** Creates persist, but `save()` or `.all({ ids })` behavior is still wrong for the pinned REST resources.

**Why it happens:** Current code only covers enough for basic `all()` smoke tests.

**How to avoid:** Use the vendored resource paths as the checklist, not the current local tests.

### Pitfall 3: Treating Inventory Levels as a Pure Inventory Item Concern

**What goes wrong:** `InventoryItem.available` changes, but `Location.inventory_levels()` and `InventoryLevel.adjust/set/connect/delete` do not share the same state.

**Why it happens:** There is currently only an `inventory_items` table.

**How to avoid:** Add a dedicated inventory-level seam and decide how it synchronizes with inventory items before implementation.

### Pitfall 4: Implementing `collection_id` Filtering Without Membership State

**What goes wrong:** Product filtering appears to work only for one canned ID or one request lifetime.

**Why it happens:** There is no collection or collect table today.

**How to avoid:** Persist collection membership or explicitly defer the filter, but do not fake it.

### Pitfall 5: Letting SHOP-16 Expand Into a Full Framework Phase

**What goes wrong:** Planning balloons into Express / Remix / React Router app integration work.

**Why it happens:** Phase 39 maps `SHOP-16`, but [`REQUIREMENTS.md`](/Users/futur/projects/sandpiper-dtu/.planning/REQUIREMENTS.md) still defers it to v2.

**How to avoid:** Scope SHOP-16 to framework-readiness smoke around auth and admin API behavior only.

### Pitfall 6: Forgetting Reset Coverage for New Tables

**What goes wrong:** Phase 39 passes targeted tests but breaks `/admin/reset` or leaves hidden cross-test state.

**Why it happens:** New prepared statements and tables are easy to add without updating teardown.

**How to avoid:** Make reset coverage part of the same plan that introduces any new schema.

## Code Examples

### Vendored Product Contract Includes `collection_id`

```typescript
await shopify.rest.Product.all({
  session,
  collection_id: '841564295',
});
// GET /admin/api/{version}/products.json?collection_id=841564295
```

Source: [`product.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/product.ts)

### Vendored Customer and Order Resources Include `post`, `put`, and `ids`

```typescript
// customer paths
{"http_method": "post", "operation": "post", "path": "customers.json"}
{"http_method": "put", "operation": "put", "path": "customers/<id>.json"}

// order paths
{"http_method": "post", "operation": "post", "path": "orders.json"}
{"http_method": "put", "operation": "put", "path": "orders/<id>.json"}
```

Sources:
- [`customer.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/customer.ts)
- [`order.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/order.ts)

### Current Local Drift: Product PUT Is Still a Stub

```typescript
fastify.put(adminPath('/products/:id.json'), async (req, reply) => {
  const id = (req.params.id as string).replace(/\\.json$/, '');
  return { product: { id: `gid://shopify/Product/${id}`, title: 'Updated Product' } };
});
```

Source: [`rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts)

### Current Local Drift: Customer REST Lookup Uses GID Reconstruction

```typescript
const id = (req.params.id as string).replace(/\\.json$/, '');
const customer = stateManager.getCustomerByGid(`gid://shopify/Customer/${id}`) ?? null;
return { customer };
```

Source: [`rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts)

## File Inventory

### Files to Modify

- [`twins/shopify/src/plugins/oauth.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/oauth.ts)
- [`twins/shopify/src/plugins/rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts)
- [`twins/shopify/src/plugins/admin.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/admin.ts)
- [`twins/shopify/src/schema/resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts)
- [`packages/state/src/state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)
- [`twins/shopify/src/db/schema.sql`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/db/schema.sql)
- [`tests/sdk-verification/sdk/shopify-api-auth.test.ts`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/shopify-api-auth.test.ts)
- [`twins/shopify/test/integration/rest-persistence.test.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/test/integration/rest-persistence.test.ts)

### Likely New Test Files

- `tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts`
- `twins/shopify/test/integration/inventory-collection-state.test.ts`
- optional minimal SHOP-16 smoke file if the planner needs explicit framework-readiness coverage

## Validation Architecture

### Test Framework

| Scope | Command | Purpose |
|------|---------|---------|
| OAuth parity | `pnpm vitest run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | Grant-specific validation and auth helper behavior |
| REST state parity | `pnpm vitest run tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` | SDK-facing REST resource create/update/find/filter semantics |
| Shopify integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/rest-persistence.test.ts twins/shopify/test/integration/inventory-collection-state.test.ts` | Route-level persistence across requests |
| Full Shopify regression | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts twins/shopify/test/integration/rest-persistence.test.ts` | Ensure Phase 22 / 28 / 36 behaviors stay green |

### Phase Requirements → Test Map

| Requirement | Behavior | Test Type | Suggested Command |
|-------------|----------|-----------|-------------------|
| SHOP-14 | Rest client and REST resources see persisted create/update/find/filter behavior | sdk | `pnpm vitest run tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` |
| SHOP-15 | InventoryLevel and collection-related resource behavior stops being fake or contradictory | sdk + integration | same SDK file plus `inventory-collection-state.test.ts` |
| SHOP-16 | App-framework-sensitive auth/admin flow no longer depends on incorrect OAuth behavior | sdk smoke | targeted smoke file or added auth tests |
| SHOP-17 | New routes continue honoring `:version` path semantics | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts` |

### Sampling Rate

- After every task commit: run the narrowest affected test file.
- After each plan wave: run the Shopify integration subset.
- Before phase verification: run both SDK and twin integration subsets covering OAuth, pagination/versioning, rest persistence, and inventory/collection state.

### Wave 0 Gaps

- No RED tests currently cover missing `refresh_token` / token-exchange field validation.
- No tests currently prove customer or order GraphQL create IDs round-trip to REST numeric routes.
- No tests currently prove REST `Customer` / `Order` `post` and `put` behavior against the live twin.
- No tests currently prove `ids` filters on customers/orders.
- No tests currently prove `Product.all({ collection_id })` behavior.
- No tests currently prove inventory-level persistence across `adjust`, `set`, `connect`, `delete`, and `Location.inventory_levels()`.
- No explicit SHOP-16 framework-readiness smoke exists in this repo yet.

## Sources

### Primary (HIGH confidence)

- Local implementation:
  - [`twins/shopify/src/plugins/oauth.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/oauth.ts)
  - [`twins/shopify/src/plugins/rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts)
  - [`twins/shopify/src/plugins/admin.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/admin.ts)
  - [`twins/shopify/src/schema/resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts)
  - [`packages/state/src/state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts)
- Vendored pinned Shopify client:
  - [`token-exchange.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts)
  - [`client-credentials.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/client-credentials.ts)
  - [`refresh-token.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/refresh-token.ts)
  - [`product.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/product.ts)
  - [`customer.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/customer.ts)
  - [`order.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/order.ts)
  - [`inventory_level.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/inventory_level.ts)
  - [`custom_collection.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/rest/admin/2024-10/custom_collection.ts)
- Existing project tests and planning artifacts:
  - [`tests/sdk-verification/sdk/shopify-api-auth.test.ts`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/shopify-api-auth.test.ts)
  - [`tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts)
  - [`twins/shopify/test/integration/rest-persistence.test.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/test/integration/rest-persistence.test.ts)
  - [`ROADMAP.md`](/Users/futur/projects/sandpiper-dtu/.planning/ROADMAP.md)
  - [`STATE.md`](/Users/futur/projects/sandpiper-dtu/.planning/STATE.md)

### Secondary (MEDIUM confidence)

- [`36-RESEARCH.md`](/Users/futur/projects/sandpiper-dtu/.planning/phases/36-shopify-behavioral-parity/36-RESEARCH.md) for the product-side precedent and prior pitfalls
- [`36-VERIFICATION.md`](/Users/futur/projects/sandpiper-dtu/.planning/phases/36-shopify-behavioral-parity/36-VERIFICATION.md) for what Phase 36 definitively closed
- [`v1.2-MILESTONE-AUDIT.md`](/Users/futur/projects/sandpiper-dtu/.planning/v1.2-MILESTONE-AUDIT.md) for remaining fidelity-gap framing

## Metadata

- Research type: local code + vendored contract synthesis
- Web browsing: not required
- New dependencies required: none
- Recommended plan count: 4
