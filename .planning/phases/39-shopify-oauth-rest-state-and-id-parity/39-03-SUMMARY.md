---
phase: 39-shopify-oauth-rest-state-and-id-parity
plan: 03
subsystem: api
tags: [shopify, rest, sqlite, state-manager, gid, graphql]

# Dependency graph
requires:
  - phase: 39-01
    provides: Wave 0 RED parity tests defining the GID round-trip and REST persistence contracts
  - phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting
    provides: Two-step GID pattern for products established the template for orders/customers/inventory
  - phase: 36-shopify-behavioral-parity
    provides: Finding #9 GID round-trip fix for products; model for extending to orders/customers

provides:
  - Canonical two-step GID pattern for orders, customers, and inventoryItems in both GraphQL mutations and fixture loading
  - State-backed PUT /products/:id.json using updateProduct() + getProduct()
  - POST + PUT /customers.json and /customers/:id.json with two-step GID, updateCustomer(), 422/404 shapes
  - POST + PUT /orders.json and /orders/:id.json with two-step GID, updateOrder(), 422/404 shapes
  - ids filter (comma-separated numeric IDs) on GET /customers.json and GET /orders.json
  - Normalized REST responses for products (id, admin_graphql_api_id, title, created_at, updated_at)
  - Normalized REST responses for customers (id, admin_graphql_api_id, email, first_name, last_name, created_at, updated_at)
  - Normalized REST responses for orders (id, admin_graphql_api_id, name, total_price, currency_code, display_fulfillment_status, display_financial_status, line_items, created_at, updated_at)
  - shopify-rest-state-parity.test.ts SDK parity test file
  - Extended rest-persistence.test.ts with 9 new route-level persistence tests

affects: [39-04, phase-40]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step GID: insert with temp GID, capture AUTOINCREMENT row id, UPDATE gid = canonical
    - All REST list and detail responses normalized to explicit field subsets (not raw DB rows)
    - IIFE JSON.parse for line_items: (() => { try { return JSON.parse(o.line_items || '[]'); } catch { return []; } })()
    - ids filter in list handlers: split comma string, build Set<number>, filter array

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts
  modified:
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/plugins/rest.ts
    - twins/shopify/test/integration/rest-persistence.test.ts
    - tests/sdk-verification/sdk/shopify-api-rest-client.test.ts

key-decisions:
  - "Two-step GID pattern extended to orderCreate and customerCreate mutations: temp GID insert, UPDATE to canonical after row id is known"
  - "Fixture loader for orders, customers, inventoryItems converted from timestamp-based GIDs to same temp→UPDATE canonical pattern as products"
  - "GET /customers/:id.json fixed from GID-based lookup (getCustomerByGid) to numeric lookup (getCustomer(numericId))"
  - "PUT /products/:id.json now 404s on missing id instead of returning hardcoded stub — shopify-api-rest-client.test.ts put() test fixed to create product before updating"
  - "Normalized list responses: products list returns {id, admin_graphql_api_id, title, created_at, updated_at} not raw DB rows"
  - "line_items stored as JSON string in DB, parsed back to array in every order REST response via IIFE try/catch"

patterns-established:
  - "Two-step GID: all Shopify resource creates (products, customers, orders, inventoryItems, appSubscriptions, oneTimePurchases) use temp GID + UPDATE canonical after AUTOINCREMENT"
  - "ids filter pattern: same comma-separated numeric parsing used in products.json now applied to customers.json and orders.json"
  - "422 shape: { errors: 'resource is required' } for missing top-level body key; 404 shape: { errors: 'Not Found' } for missing row"

requirements-completed: [SHOP-14, SHOP-15, SHOP-17]

# Metrics
duration: 25min
completed: 2026-03-14
---

# Phase 39 Plan 03: REST State and ID Parity Summary

**Two-step GID canonicalization extended to orders/customers/inventoryItems; state-backed PUT/POST write routes for products, customers, and orders with normalized responses and ids filters**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-14T17:08:00Z
- **Completed:** 2026-03-14T17:33:02Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments

- Order and customer GIDs in GraphQL mutations and fixture loading now use canonical row-ID suffixes instead of timestamps — `gid://shopify/Order/1` not `gid://shopify/Order/1711234567890`
- Product PUT, customer POST/PUT, and order POST/PUT are all stateful: they write through `stateManager.updateProduct/updateCustomer/updateOrder` and return persisted data with proper 404/422 shapes
- REST responses for products, customers, and orders are fully normalized to Shopify field shapes (no raw `gid` column, no serialized `line_items` string)
- `ids` filter now works on `/customers.json` and `/orders.json` (matching existing pattern in `/products.json`)
- 36 tests pass: 12 integration, 11 behavioral parity, 13 REST client

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonicalize order and customer GIDs across GraphQL mutations and fixtures** - `d1c8c42` (feat)
2. **Task 2: Make product, customer, and order REST writes and ids filters stateful** - `f38ffc5` (feat)

**Plan metadata:** (docs commit — to be added)

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` — Created: SDK parity test file with GraphQL→REST round-trip and write/filter assertions
- `twins/shopify/src/schema/resolvers.ts` — orderCreate + customerCreate updated to two-step GID pattern
- `twins/shopify/src/plugins/admin.ts` — fixture loader for orders/customers/inventoryItems converted to two-step GID
- `twins/shopify/src/plugins/rest.ts` — PUT products, POST+PUT customers, POST+PUT orders, ids filters, normalized responses, line_items parsing
- `twins/shopify/test/integration/rest-persistence.test.ts` — Extended with 9 new route-level persistence tests
- `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — Fixed put() test to create product before updating

## Decisions Made

- Two-step GID pattern extended to `orderCreate` and `customerCreate` mutations: inserts with `gid://shopify/Order/temp-${Date.now()}`, captures row id from `createOrder()`, runs `UPDATE orders SET gid = ? WHERE id = ?` to set canonical `gid://shopify/Order/{rowId}`.
- `GET /customers/:id.json` fixed from GID-based lookup (`getCustomerByGid`) to numeric lookup (`getCustomer(numericId)`) — was the root cause of customer REST lookup failures.
- `PUT /products/:id.json` now returns 404 for missing IDs; the pre-existing `shopify-api-rest-client.test.ts` put() test used hardcoded `products/1` which no longer exists after reset — fixed test to create product first.
- Product/customer/order list responses now map raw DB rows to normalized field subsets — prevents leaking internal columns (`gid`, raw serialized `line_items`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed shopify-api-rest-client.test.ts put() test to create product before PUT**
- **Found during:** Task 2 (state-backed product PUT implementation)
- **Issue:** Test used hardcoded `products/1` which no longer returns a stub when PUT is state-backed — empty DB after reset means 404
- **Fix:** Added `client.post({ path: 'products', data: ... })` before `client.put({ path: 'products/${id}', ... })` to create a real row first
- **Files modified:** `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts`
- **Verification:** `pnpm vitest run tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` exits 0 (13/13 pass)
- **Committed in:** `f38ffc5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Necessary correctness fix. The test was relying on the stub's permissive behavior. Now correctly creates a product before updating it.

## Issues Encountered

None beyond the auto-fixed deviation above.

## Next Phase Readiness

- SHOP-14, SHOP-15, SHOP-17: REST write routes, ids filters, and GID canonicalization complete
- Plan 39-04 (collection_id and inventory state) can now proceed using the stateful customer/order foundation
- Pre-existing TypeScript error in `twins/shopify/src/plugins/oauth.ts` (TS2551: Property 'subject_token_type') is a known pre-existing issue unrelated to this plan

---
*Phase: 39-shopify-oauth-rest-state-and-id-parity*
*Completed: 2026-03-14*
