---
phase: 17-shopify-rest-resource-client-expansion
plan: "02"
subsystem: api
tags: [shopify-api, rest, rest-client, rest-resources, twin, sdk-verification, vitest]

# Dependency graph
requires:
  - phase: 17-shopify-rest-resource-client-expansion
    provides: "17-01 REST plugin foundation with products CRUD and test-retry endpoint"
  - phase: 16-shopify-shopify-api-platform-surface
    provides: "createShopifyApiClient helper, shopify.auth.clientCredentials for session setup"
provides:
  - "Tier 1 REST routes in twin: customers, orders, inventory_items (list + single)"
  - "Tier 1 stub routes: inventory_levels, orders/:id, fulfillments nested under orders"
  - "Tier 2 stub routes: custom_collections, metafields, pages, webhooks CRUD, blogs, articles"
  - "Pagination test endpoint: products.json?page_info=test returns Link header"
  - "10 passing SHOP-14/15 tests: RestClient get/post/put/delete/retry + REST resource class all()"
  - "createShopifyApiClient now accepts restResources option to populate shopify.rest.*"
affects:
  - 17-shopify-rest-resource-client-expansion (17-03 and 17-04 build on this)

# Tech tracking
tech-stack:
  added: ["@shopify/shopify-api/rest/admin/2024-01 (restResources import)"]
  patterns:
    - "restResources passed to shopifyApi() to activate shopify.rest.* resource classes"
    - "Tier 1 routes backed by stateManager list*() methods, Tier 2 routes return hardcoded empty arrays"
    - "Pagination test via query param: ?page_info=test triggers Link header from twin"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-api-rest-client.test.ts
  modified:
    - twins/shopify/src/plugins/rest.ts
    - tests/sdk-verification/helpers/shopify-api-client.ts

key-decisions:
  - "shopify.rest.* resource classes require restResources passed to shopifyApi() — createShopifyApiClient gains generic restResources option"
  - "result.pageInfo is always populated by SDK with query params even without Link header; nextPageUrl is the correct nil-safe assertion for pagination tests"
  - "listOrders() exists in StateManager — orders route is state-backed, not a stub"

patterns-established:
  - "REST resource class tests: import { restResources } from @shopify/shopify-api/rest/admin/2024-01, pass to createShopifyApiClient({ restResources })"
  - "Tier 2 stub pattern: single-line route returning hardcoded empty array — sufficient for SDK resource class .all() tests"

requirements-completed:
  - SHOP-14
  - SHOP-15

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 17 Plan 02: REST Client + Resource Class Tests Summary

**Shopify twin REST plugin extended with 14 new routes (Tier 1 state-backed + Tier 2 stubs), and 10 SHOP-14/15 tests verifying RestClient CRUD/retry and REST resource class all() pipeline against the twin**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-09T18:19:07Z
- **Completed:** 2026-03-09T18:22:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended `twins/shopify/src/plugins/rest.ts` with 14 new routes: Tier 1 (customers, orders, inventory_items with state-backed responses) and Tier 2 stubs (metafields, pages, webhooks CRUD, blogs, articles)
- Added pagination test support: `products.json?page_info=test` returns a `Link` header so RestClient pagination path is exercised
- Created `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` with 10 tests (SHOP-14 RestClient + SHOP-15 REST resource classes) — all pass
- Updated `createShopifyApiClient` to accept `restResources` option, enabling `shopify.rest.*` resource classes in tests
- Full suite regression check: all 76 sdk-verification tests pass (10 new + 66 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend REST plugin with Tier 1 + Tier 2 resource routes** - `14a58f2` (feat)
2. **Task 2: shopify-api-rest-client.test.ts — RestClient + Tier 1/2 resource classes** - `3ab3c0b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `twins/shopify/src/plugins/rest.ts` — Added 14 new routes: Tier 1 customers/orders/inventory_items, Tier 2 stubs, pagination test endpoint
- `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — New file: 10 tests for SHOP-14/15
- `tests/sdk-verification/helpers/shopify-api-client.ts` — Added `restResources` generic option

## Decisions Made

- **shopify.rest.* requires restResources:** The `shopify.rest` object is empty unless REST resources are passed to `shopifyApi({ restResources })`. Added a generic `restResources` option to `createShopifyApiClient` — callers import `{ restResources } from '@shopify/shopify-api/rest/admin/2024-01'` and pass them.
- **result.pageInfo assertion:** The SDK always populates `result.pageInfo` with the current request's query params (e.g., `{ limit: '50' }`), even when no Link header is returned. The correct assertion for "no next page" is `result.pageInfo?.nextPageUrl` being undefined, not `result.pageInfo` itself.
- **listOrders() is state-backed:** StateManager has `listOrders()` (confirmed), so the orders route returns real state data rather than a hardcoded stub.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pageInfo assertion corrected for SDK behavior**
- **Found during:** Task 2 (GREEN phase — tests running against live twin)
- **Issue:** Plan's test spec said `expect(result.pageInfo).toBeUndefined()` for standard GET without Link header. The SDK always sets `pageInfo` to include request query params (`{ limit: '50' }`), so this assertion was wrong.
- **Fix:** Changed assertion to `expect(result.pageInfo?.nextPageUrl).toBeUndefined()` — checks for absence of pagination *cursor*, not absence of the pageInfo object.
- **Files modified:** `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts`
- **Verification:** Test now passes; the Link header test still confirms `nextPageUrl` is defined when Link is present.
- **Committed in:** `3ab3c0b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Single assertion correction for actual SDK behavior. No scope creep.

## Issues Encountered

None beyond the pageInfo assertion above.

## Next Phase Readiness

- SHOP-14 (RestClient) and SHOP-15 (Tier 1/2 REST resources) both verified against the live twin
- Twin has Tier 1 and Tier 2 REST routes — Plan 17-03 (Webhook REST) and Plan 17-04 (coverage ledger) can proceed
- All 76 sdk-verification tests green

---
*Phase: 17-shopify-rest-resource-client-expansion*
*Completed: 2026-03-09*
