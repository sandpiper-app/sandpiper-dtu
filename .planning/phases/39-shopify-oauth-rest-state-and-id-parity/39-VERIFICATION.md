---
phase: 39-shopify-oauth-rest-state-and-id-parity
verified: 2026-03-14T18:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 39: Shopify OAuth, REST State, and ID Parity — Verification Report

**Phase Goal:** Close the remaining Shopify fidelity gaps: enforce grant-specific OAuth validation, fix order/customer GraphQL-to-REST ID round-tripping, make product/customer/order/inventory REST writes and filters persist correctly, and remove inventory-level stub drift.
**Verified:** 2026-03-14T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                 | Status     | Evidence                                                                                                                                                                                                                                                 |
|----|---------------------------------------------------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Wave 0 proves grant-specific OAuth validation gaps with failing or explicit tests                                                     | VERIFIED   | `shopify-api-auth.test.ts` contains `describe('Phase 39: grant-specific OAuth validation', ...)` with 6 explicit negative cases (client_credentials, refresh_token, token-exchange missing fields, unsupported token type)                               |
| 2  | Wave 0 proves order/customer GraphQL-to-REST ID parity, REST write/filter persistence, inventory-level state, and collection filtering | VERIFIED   | `shopify-rest-state-parity.test.ts` (10 describe blocks), `inventory-collection-state.test.ts` (5 describe blocks) cover all defect clusters                                                                                                             |
| 3  | SHOP-16 stays smoke-level — no `shopify-app-express`, `shopify-app-remix`, or `shopify-app-react-router` imports                     | VERIFIED   | `rg shopify-app-express|shopify-app-remix|shopify-app-react-router` in `shopify-app-framework-auth-smoke.test.ts` returns no matches; file contains only `@shopify/shopify-api` primitives                                                               |
| 4  | POST /admin/oauth/access_token rejects malformed grant bodies with 400 instead of minting tokens                                     | VERIFIED   | `oauth.ts` branches on `body.grant_type === 'client_credentials'`, `=== 'refresh_token'`, `=== 'urn:ietf:params:oauth:grant-type:token-exchange'` before credential gate; returns 400 `invalid_request` for missing fields                               |
| 5  | client_credentials, refresh_token, auth-code, and token-exchange happy paths remain green after tightening                           | VERIFIED   | 21/21 tests pass in `shopify-api-auth.test.ts` per 39-02 SUMMARY; preserved happy-path `describe` blocks confirmed present in file                                                                                                                       |
| 6  | Unsupported `requested_token_type` values return exact error string                                                                   | VERIFIED   | `oauth.ts` line: `error_description: 'requested_token_type must be urn:shopify:params:oauth:token-type:online-access-token or urn:shopify:params:oauth:token-type:offline-access-token'`                                                                 |
| 7  | Orders and customers created via GraphQL or fixtures round-trip through REST numeric IDs                                              | VERIFIED   | `resolvers.ts` uses two-step GID: `UPDATE orders SET gid = ? WHERE id = ?` and `UPDATE customers SET gid = ? WHERE id = ?`; `admin.ts` uses same pattern for fixtures                                                                                   |
| 8  | Product, customer, and order writes persist in SQLite and are returned by subsequent GET/list calls                                   | VERIFIED   | `rest.ts` routes `PUT /products/:id.json`, `POST/PUT /customers.json`, `POST/PUT /orders.json` all call `stateManager.updateProduct/updateCustomer/updateOrder` and re-read from state; 9 new persistence tests in `rest-persistence.test.ts`            |
| 9  | REST responses expose Shopify-style fields instead of raw database columns                                                            | VERIFIED   | `rest.ts` normalizes: products `{id, admin_graphql_api_id, title, created_at, updated_at}`, customers `{id, admin_graphql_api_id, email, first_name, last_name, ...}`, orders include IIFE JSON.parse for `line_items`                                   |
| 10 | Customer and order `ids` filters behave like pinned REST resource classes expect                                                      | VERIFIED   | `GET /customers.json` and `GET /orders.json` parse comma-separated `ids` param; SDK parity tests `Customer.all({ ids })` and `Order.all({ ids })` cover the seam                                                                                        |
| 11 | InventoryLevel operations persist the same row across connect, adjust, set, list, and delete requests                                 | VERIFIED   | `state-manager.ts` has `connectInventoryLevel`, `adjustInventoryLevel`, `setInventoryLevel`, `deleteInventoryLevel`, `listInventoryLevels` backed by `inventory_levels` SQLite table; REST routes wired to each                                          |
| 12 | Location.inventory_levels and InventoryLevel.all read from real stored state                                                          | VERIFIED   | `rest.ts` `GET /locations/:id/inventory_levels.json` queries `listInventoryLevels({ locationIds: [id] })`; `GET /inventory_levels.json` uses `inventoryItemIds`/`locationIds` params                                                                     |
| 13 | Product.all({ collection_id }) only returns products linked to that collection through stored membership                              | VERIFIED   | `rest.ts` `GET /products.json` applies `collection_id` filter via `stateManager.listProductsByCollectionId(collectionId)` after `since_id`/`ids` filters; backed by `collects` JOIN query in state-manager                                              |
| 14 | New tables join reset coverage immediately                                                                                            | VERIFIED   | `integration.test.ts` seeds rows into `inventory_levels`, `custom_collections`, `collects`, calls `POST /admin/reset`, asserts `COUNT(*) = 0` for all three; all statements nulled in both `reset()` and `close()` in `state-manager.ts`                |
| 15 | Versioned Admin routes still echo the request version for new collection-filter behavior                                              | VERIFIED   | `pagination.test.ts` asserts `GET /admin/api/2025-01/products.json?collection_id=X` returns `x-shopify-api-version: 2025-01` header; same product IDs returned for 2025-01 and 2024-01 versions                                                         |

**Score:** 15/15 truths verified

---

### Required Artifacts

#### Plan 39-01 Artifacts (Wave 0 Contracts)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/sdk-verification/sdk/shopify-api-auth.test.ts` | Grant-specific OAuth RED cases | VERIFIED | Contains `describe('Phase 39: grant-specific OAuth validation', ...)` with all 6 negative test cases; string `Phase 39: grant-specific OAuth validation` confirmed at line 434 |
| `tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` | SDK-facing parity tests for GID round-trip, REST write, ids filters, inventory, collection | VERIFIED | File created in commit `d1c8c42`; contains 10 describe blocks covering all required seams; uses `restResources` from `@shopify/shopify-api/rest/admin/2024-01` |
| `tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts` | Smoke-only framework-readiness coverage | VERIFIED | File created in commit `1ab64e7`; 2 tests with exact required names; no framework package imports |
| `twins/shopify/test/integration/inventory-collection-state.test.ts` | Route-level inventory and collection state tests | VERIFIED | File created in commit `8b46872`; 5 describe blocks with all required routes including reset coverage |

#### Plan 39-02 Artifacts (OAuth Hardening)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/src/plugins/oauth.ts` | Grant-specific validation for all 4 grant types | VERIFIED | Branches `body.grant_type === 'client_credentials'`, `=== 'refresh_token'`, `=== 'urn:ietf:params:oauth:grant-type:token-exchange'`; exact error string for unsupported `requested_token_type`; committed in `83bb64e` |
| `tests/sdk-verification/sdk/shopify-api-auth.test.ts` | Green assertions for new cases and preserved happy paths | VERIFIED | 21/21 tests green per SUMMARY; pattern `refresh_token grant when refresh_token is missing` confirmed at line 507 area |
| `tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts` | Smoke-level coverage, no framework packages | VERIFIED | `auth.begin`, `auth.callback`, `auth.tokenExchange`, versioned admin calls confirmed; no disallowed imports |

#### Plan 39-03 Artifacts (ID Parity and REST Persistence)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/src/schema/resolvers.ts` | Canonical two-step GID for orderCreate/customerCreate | VERIFIED | `UPDATE orders SET gid = ? WHERE id = ?` and `UPDATE customers SET gid = ? WHERE id = ?` confirmed; committed in `d1c8c42` |
| `twins/shopify/src/plugins/admin.ts` | Canonical fixture GIDs for orders, customers, inventoryItems | VERIFIED | `UPDATE orders/customers/inventory_items SET gid = ? WHERE id = ?` all confirmed present |
| `twins/shopify/src/plugins/rest.ts` | State-backed POST/PUT/GET/list handlers with normalized responses | VERIFIED | `fastify.post(adminPath('/customers.json'))`, `fastify.put(adminPath('/customers/:id.json'))`, `fastify.post(adminPath('/orders.json'))`, `fastify.put(adminPath('/orders/:id.json'))` all confirmed; `stateManager.updateProduct/updateCustomer/updateOrder` called; committed in `f38ffc5` |
| `tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` | SDK-facing persistence and filter coverage | VERIFIED | `Customer.save() persists first_name and last_name`, `Order.save() persists name and total_price`, `Customer.all({ ids })`, `Order.all({ ids })` all confirmed as describe blocks |
| `twins/shopify/test/integration/rest-persistence.test.ts` | Route-level persistence checks | VERIFIED | `PUT /admin/api/2024-01/products/:id.json`, `POST /admin/api/2024-01/customers.json`, `PUT /admin/api/2024-01/orders/` all confirmed as describe blocks; 9 new persistence tests |

#### Plan 39-04 Artifacts (Inventory and Collection State)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/state/src/state-manager.ts` | SQLite-backed inventory_levels, custom_collections, collects with reset lifecycle | VERIFIED | `CREATE TABLE IF NOT EXISTS inventory_levels/custom_collections/collects` confirmed; all 15 statement fields declared, nulled in both `reset()` and `close()`; 12 public methods confirmed; committed in `2b368b4` |
| `twins/shopify/src/db/schema.sql` | Documented schema for new tables | VERIFIED | `CREATE TABLE IF NOT EXISTS custom_collections` and other tables confirmed with full column definitions |
| `twins/shopify/src/plugins/rest.ts` | Versioned inventory level, custom collection, collect, and collection-filter routes | VERIFIED | `GET /inventory_levels.json`, `POST /inventory_levels/connect.json`, `POST /custom_collections.json`, `POST /collects.json` all confirmed wired to state-manager methods |
| `tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` | SDK parity for InventoryLevel, Location, CustomCollection, Collect, Product.all | VERIFIED | `InventoryLevel.adjust/connect/set/delete round-trips through stored inventory_levels state` and `Product.all({ collection_id }) returns only products linked by Collect rows` both confirmed as describe blocks |
| `twins/shopify/test/integration/inventory-collection-state.test.ts` | Route-level persistence and reset proof | VERIFIED | Reset test (`POST /admin/reset clears inventory_levels, custom_collections, and collects`) confirmed with proper assertions; collection filter confirms `filterBody.products.length === 1` |
| `twins/shopify/test/integration/pagination.test.ts` | Version-routing regression for collection-filter | VERIFIED | `GET /admin/api/2025-01/products.json?collection_id=` and `x-shopify-api-version` assertions confirmed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `shopify-api-auth.test.ts` | `oauth.ts` | POST /admin/oauth/access_token grant-specific validation | WIRED | Tests exercise `grant_type` branches; `oauth.ts` branches on `body.grant_type === 'client_credentials'|'refresh_token'|'urn:ietf:...'` |
| `shopify-rest-state-parity.test.ts` | `rest.ts` | REST resource class parity against versioned Admin routes | WIRED | Tests use SDK resource classes (`Customer.save()`, `InventoryLevel.adjust`, `Product.all`) hitting versioned twin routes |
| `shopify-rest-state-parity.test.ts` | `schema/resolvers.ts` | GraphQL create → REST numeric lookup round-trip | WIRED | Tests call GraphQL `customerCreate`/`orderCreate` then verify numeric REST `GET /customers/:id.json` — resolvers use two-step GID producing numeric suffix |
| `inventory-collection-state.test.ts` | `state-manager.ts` | Inventory level and collection rows survive requests and clear on reset | WIRED | Route-level tests seed via HTTP, reset via `POST /admin/reset`, re-read via SQL probe; `integration.test.ts` provides cleaner `COUNT(*) = 0` reset assertions for all 3 tables |
| `resolvers.ts` | `rest.ts` | GraphQL create returns GID whose numeric suffix accepted by REST `:id.json` routes | WIRED | `createGID('Order', rowId)` → `UPDATE orders SET gid = canonical` → REST numeric `id` is the same `rowId` |
| `rest.ts` | `state-manager.ts` | All product/customer/order writes/reads through state-manager CRUD | WIRED | `stateManager.updateProduct`, `stateManager.updateCustomer`, `stateManager.updateOrder` confirmed in `rest.ts`; inventory routes call `connectInventoryLevel`, `createCustomCollection`, `createCollect` |
| `rest.ts` | `state-manager.ts` | inventory_levels, custom_collections, collects routes backed by SQLite | WIRED | `connectInventoryLevel`, `createCustomCollection`, `createCollect` all called from route handlers in `rest.ts` |
| `integration.test.ts` | `state-manager.ts` | Reset coverage for new tables | WIRED | `SELECT COUNT(*) as count FROM inventory_levels/custom_collections/collects` asserts 0 after `POST /admin/reset` |
| `pagination.test.ts` | `rest.ts` | Versioned collection-filter regression exercises x-shopify-api-version echo | WIRED | `GET /admin/api/2025-01/products.json?collection_id=` confirmed; `x-shopify-api-version: 2025-01` header asserted |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SHOP-14 | 39-01, 39-03, 39-04 | Developer can use `@shopify/shopify-api` client surfaces against the twin with pinned package configuration | SATISFIED | GID canonicalization ensures GraphQL→REST ID round-trips work; state-backed product/customer/order REST writes verified; SDK parity tests use pinned `@shopify/shopify-api/rest/admin/2024-01` resources |
| SHOP-15 | 39-01, 39-03, 39-04 | Developer can use Shopify client surfaces and REST resource classes against the twin | SATISFIED | `ids` filter on customers/orders, InventoryLevel operations, CustomCollection/Collect CRUD, Product.all collection_id filter all verified via pinned SDK REST resource classes |
| SHOP-16 | 39-01, 39-02 | Developer can validate Shopify app-framework packages — held at smoke-only readiness | SATISFIED (smoke scope) | `shopify-app-framework-auth-smoke.test.ts` proves begin/callback/tokenExchange plus versioned admin calls; no framework package imports; REQUIREMENTS.md classifies SHOP-16 as "Additional SDK Target" (deferred); 39-02 SUMMARY marks it as requirements-completed |
| SHOP-17 | 39-02, 39-03, 39-04 | Shopify twin serves routes with parameterized API version accepting any valid Shopify version string | SATISFIED | All new routes registered under `adminPath(...)` which expands to `/admin/api/:version/...`; pagination.test.ts version-routing regression confirms 2025-01 and 2024-01 both work; `x-shopify-api-version` header echo verified |

All 4 requirements declared across plans are accounted for and satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `twins/shopify/test/integration/inventory-collection-state.test.ts` | 178-179, 243-245 | Stale Wave-0 "stub era" comments left in test body | Info | Comments describe pre-implementation state but assertions below them are correct and real; tables exist, routes are state-backed; no behavioral risk |
| `twins/shopify/test/integration/inventory-collection-state.test.ts` | 305-311, 323-328, 340-344 | Defensive `if (table !== null) ... else { expect(true).toBe(true) }` fallback branches | Warning | Fallback branches are dead code now that tables exist (Phase 39-04 added them); the real count-assertion path executes. Functionally correct, but the else branches reduce assertion strength if tables were somehow absent. |

No blocker anti-patterns found. The stale comments and defensive fallbacks are benign — the underlying assertions exercise real state in the post-Phase-39 era.

---

### Human Verification Required

#### 1. Full test suite end-to-end run

**Test:** `pnpm vitest run tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts twins/shopify/test/integration/rest-persistence.test.ts twins/shopify/test/integration/inventory-collection-state.test.ts twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts`
**Expected:** All suites exit 0 with counts matching 39-04 SUMMARY (71 tests in the final plan's scope; broader SDK suites remain green)
**Why human:** Verifier does not execute test runners; summaries claim 71 GREEN for final wave but actual runtime could surface flakiness or environment differences

#### 2. OAuth token-exchange smoke seam

**Test:** Trigger `auth.begin -> authorize -> auth.callback` sequence in `shopify-app-framework-auth-smoke.test.ts` against a live twin process
**Expected:** Session produced by callback can authenticate `GET /admin/api/2025-01/products.json`; `auth.tokenExchange` path produces session that can execute `shop { name }` GraphQL
**Why human:** Smoke test exercises cross-process HTTP (twin must be running); any race condition in the twin startup sequence would not be caught by structural grep

---

### Gaps Summary

No gaps. All 15 must-have truths are verified. All 4 requirement IDs (SHOP-14, SHOP-15, SHOP-16, SHOP-17) are covered and satisfied. All artifacts exist at substantive depth (not stubs) and are wired to the production code they exercise. All key links are confirmed at the HTTP and state-manager level. Reset coverage for new tables is verified in two independent test files.

The two warning-level items (stale Wave-0 comments and defensive else-branches in `inventory-collection-state.test.ts`) are known artifacts of the Wave-0 TDD pattern and do not block goal achievement.

---

_Verified: 2026-03-14T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
