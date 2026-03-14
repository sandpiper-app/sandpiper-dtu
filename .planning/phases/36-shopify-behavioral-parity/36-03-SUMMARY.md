---
phase: 36-shopify-behavioral-parity
plan: 03
subsystem: api
tags: [shopify, graphql, rest, sqlite, gid, two-step-insert]

# Dependency graph
requires:
  - phase: 36-01
    provides: Wave 0 RED tests establishing Finding #9 GID round-trip contract
  - phase: 24-02
    provides: Two-step GID pattern for REST-created products (rest.ts reference implementation)
provides:
  - productCreate GraphQL mutation with canonical two-step GID (gid://shopify/Product/{rowId})
  - Fixture loader products with canonical two-step GID and correct variant product_gid references
  - Finding #9 test GREEN — GraphQL-created products findable via REST numeric ID
affects:
  - 36-04 (Finding #10 since_id filter semantics depends on correct rowId-based product GIDs)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step GID pattern: INSERT with temp GID, then UPDATE products SET gid = ? WHERE id = ? after AUTOINCREMENT resolves"
    - "Pattern now consistent across rest.ts (REST create), resolvers.ts (GraphQL create), and admin.ts (fixture loader)"

key-files:
  created: []
  modified:
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/plugins/admin.ts

key-decisions:
  - "Two-step GID pattern extended to resolvers.ts and admin.ts — same UPDATE products SET gid = ? WHERE id = ? SQL as rest.ts; no new pattern invented"
  - "Variant product_gid updated to reference finalProductGid (canonical) not the discarded temp GID — critical for variant-product FK integrity"
  - "createGID('Product', productId) used for final GID in resolver (not manual template literal) — helper already imported, consistent with codebase usage"

patterns-established:
  - "Two-step GID for any SQLite AUTOINCREMENT table where GID must encode the row ID: temp insert then UPDATE"

requirements-completed:
  - Finding-9

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 36 Plan 03: Shopify GID Round-Trip Fix Summary

**Two-step canonical GID applied to GraphQL productCreate resolver and admin fixture loader so REST numeric ID lookups return 200 (Finding #9 GREEN)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-13T~04:00Z
- **Completed:** 2026-03-13T~04:03Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed `productCreate` GraphQL mutation: replaced timestamp-based GID with two-step INSERT+UPDATE pattern matching rest.ts
- Fixed admin fixture loader: products now get canonical `gid://shopify/Product/{rowId}` GIDs; variant `product_gid` references the final canonical GID, not the discarded temp
- Finding #9 test ("productCreate via GraphQL is findable via REST numeric ID") turns GREEN; 257/264 tests passing (7 expected-RED for Findings #8/#10 remain until Plans 36-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix productCreate resolver — canonical two-step GID** - `d4549e0` (fix)
2. **Task 2: Fix fixture loader — canonical two-step GID for products** - `ef60b8c` (fix)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `twins/shopify/src/schema/resolvers.ts` — productCreate mutation now uses temp GID + UPDATE to rowId-based GID
- `twins/shopify/src/plugins/admin.ts` — fixture product loader uses same two-step pattern; variant product_gid corrected to finalProductGid

## Decisions Made

- Two-step GID pattern extended verbatim from rest.ts — no new pattern invented; `UPDATE products SET gid = ? WHERE id = ?` is now the universal canonical form across all three product creation paths
- `createGID('Product', productId)` used in resolver (helper already imported); manual template literal used in admin.ts (consistent with rest.ts style there)
- Variant `product_gid` must reference final canonical GID — if it referenced the temp GID, variant-product FK lookups would break

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Finding #9 GREEN; Finding #8 (missing REST routes: Location, InventoryLevel) and Finding #10 (since_id / ids filter semantics) remain RED — Plan 36-04 is next
- All product canonical GIDs are now consistent across REST create, GraphQL create, and fixture load; Finding #10 since_id tests can rely on accurate rowId-based product IDs

---
*Phase: 36-shopify-behavioral-parity*
*Completed: 2026-03-13*
