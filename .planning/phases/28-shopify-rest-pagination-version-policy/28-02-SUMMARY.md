---
phase: 28-shopify-rest-pagination-version-policy
plan: 02
subsystem: api
tags: [shopify, rest, pagination, cursor, fastify]

# Dependency graph
requires:
  - phase: 28-01
    provides: "RED tests for SHOP-23 REST cursor pagination contract"
provides:
  - "paginateList<T> helper in rest.ts encodes/decodes opaque base64 cursors via cursor.ts utilities"
  - "Real cursor pagination on GET /products.json, /orders.json, /customers.json, /inventory_items.json"
  - "Invalid cursor returns 400; limit param forwarded in Link header URLs"
affects:
  - "28-03 (SHOP-17 version policy — builds on same rest.ts)"
  - "sdk-verification (shopify-api-rest-client multi-page tests)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "paginateList<T extends { id: number }> helper: slice sorted array by afterId (decoded cursor), emit Link header with prev/next URLs, no cursor logic duplicated across handlers"
    - "encodeCursor/decodeCursor from services/cursor.ts reused across GraphQL and REST layers"

key-files:
  created: []
  modified:
    - "twins/shopify/src/plugins/rest.ts"

key-decisions:
  - "paginateList is a module-level function (not inside the plugin) — avoids closure capture issues and is more testable"
  - "afterId=0 means first page (no cursor); afterId>0 means subsequent page (items with id > afterId)"
  - "Previous cursor encodes all[prevStartIdx - 1].id (not all[startIdx - 1].id) — using startIdx-1 would return the current page again"
  - "Link header URLs use https://dev.myshopify.com as hostname (matches SDK client base URL in test harness)"
  - "SHOP-17 (version policy) tests remain RED — intentionally scoped to Plan 03"

patterns-established:
  - "REST list handler pattern: parse limit (default 50, max 250), decode cursor if present (400 on invalid), call paginateList, set Link header if non-null, return { resource: items }"

requirements-completed:
  - SHOP-23

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 28 Plan 02: REST Cursor Pagination Summary

**paginateList helper + real opaque base64 cursor pagination on all four Tier 1 REST list endpoints, turning 4 SHOP-23 RED tests GREEN with zero regressions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-13T16:29:00Z
- **Completed:** 2026-03-13T16:37:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed the sentinel `page_info=test` hack from GET /products.json
- Implemented `paginateList<T>` helper that slices sorted arrays by decoded cursor and emits RFC-compliant `Link` headers with `rel="previous"` and/or `rel="next"`
- Applied real cursor pagination to all four Tier 1 list endpoints: products, orders, customers, inventory_items
- All 4 SHOP-23 REST pagination contract tests GREEN; all 12 pre-existing GraphQL pagination tests still GREEN (161/163 total, 2 RED are SHOP-17 plan-03 stubs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add paginateList helper and real cursor pagination to Tier 1 list endpoints** - `86c029c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `twins/shopify/src/plugins/rest.ts` — Added cursor import, paginateList helper, replaced sentinel with real pagination on 4 list endpoints

## Decisions Made
- `paginateList` is a module-level function (not inside the plugin) to keep it clean and avoid closure issues
- Previous-page cursor is computed as `all[prevStartIdx - 1].id` (one step before the previous window start), NOT `all[startIdx - 1].id` — the latter would encode the last item before the current window and cause the "previous" link to return the same current page again
- Link header base URL uses `https://dev.myshopify.com` consistent with the test harness configuration
- SHOP-17 (version policy sunset/invalid-month) tests explicitly left RED for Plan 03 as documented

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 complete — SHOP-23 satisfied
- Plan 03 (SHOP-17 version policy) ready to execute: `parseShopifyApiVersion` already throws on invalid version strings; just need to wire sunset rejection into the version validator

## Self-Check: PASSED
- `twins/shopify/src/plugins/rest.ts` — FOUND
- `28-02-SUMMARY.md` — FOUND
- Task commit `86c029c` — FOUND

---
*Phase: 28-shopify-rest-pagination-version-policy*
*Completed: 2026-03-13*
