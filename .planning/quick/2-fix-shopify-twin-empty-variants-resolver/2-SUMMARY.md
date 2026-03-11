---
phase: quick-2
plan: 01
subsystem: database
tags: [shopify, graphql, sqlite, state-manager, fixtures]

# Dependency graph
requires:
  - phase: shopify-twin
    provides: StateManager with prepared statements pattern, Product resolver, fixtures endpoint
provides:
  - product_variants SQLite table with CRUD methods on StateManager
  - Fixtures endpoint persists nested variants array per product
  - Product.variants resolver reads seeded variant data from DB
affects: [shopify-twin, sdk-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ProductVariant: same prepared-statement pattern as InventoryItem (declare/null-in-reset/null-in-close/prepare/method)"
    - "Fixture seeding: destructure variants from product body, use separate GID for each variant"
    - "Resolver uses parent.gid (stored timestamp-based GID) not parent.id (SQLite autoincrement)"

key-files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/schema/resolvers.ts

key-decisions:
  - "Use parent.gid directly in variants resolver — parent.id is SQLite autoincrement, never matches the timestamp-based GID stored in product_variants.product_gid"
  - "Destructure variants from product fixture body so createProduct() does not receive unknown keys"
  - "InventoryItem.inventoryLevels left as () => ({ nodes: [] }) — intentional documented simplification, unchanged"

patterns-established:
  - "New resource table: (a) CREATE TABLE IF NOT EXISTS, (b) private Statement | null fields, (c) null in reset() and close(), (d) db.prepare() in prepareStatements(), (e) public CRUD methods"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-11
---

# Quick Task 2: Fix Shopify Twin Empty Variants Resolver

**SQLite product_variants table with fixture seeding and resolver fix — seeded variants now returned from Product.variants GraphQL queries**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-11T17:50:00Z
- **Completed:** 2026-03-11T17:57:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `product_variants` SQLite table to StateManager with `createVariant`, `listVariantsByProductGid`, `deleteVariantsByProductGid` methods
- Updated fixtures endpoint to accept a `variants` array nested inside each product and seed it via `createVariant()`
- Fixed `Product.variants` resolver to call `listVariantsByProductGid(parent.gid)` instead of unconditionally returning `{ nodes: [] }`
- All 435 tests pass with no regressions

## Task Commits

1. **Task 1: Add variants table and CRUD to StateManager** - `f5fc656` (feat)
2. **Task 2: Wire variants through fixtures endpoint and resolver** - `a6ba9ec` (feat)

## Files Created/Modified
- `packages/state/src/state-manager.ts` - Added product_variants table, 3 prepared statements, createVariant/listVariantsByProductGid/deleteVariantsByProductGid methods
- `twins/shopify/src/plugins/admin.ts` - Updated FixturesLoadBody type, destructure variants from product, seed with createVariant()
- `twins/shopify/src/schema/resolvers.ts` - Replaced hardcoded `() => ({ nodes: [] })` with resolver that reads from stateManager

## Decisions Made
- Used `parent.gid` directly in the variants resolver rather than re-deriving a GID from `parent.id`. The `product_gid` column in `product_variants` stores the timestamp-based GID (e.g. `gid://shopify/Product/1741234567890`) generated at fixture-load time. The integer `parent.id` is the SQLite autoincrement row key and will never match, causing the query to always return empty if used instead.
- Destructured `variants` from the product fixture body before calling `createProduct()` to avoid passing unknown keys to the state manager.
- Left `InventoryItem.inventoryLevels: () => ({ nodes: [] })` unchanged — this is intentional documented behavior; the twin does not simulate inventory levels.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

- `packages/state/src/state-manager.ts` exists and contains createVariant/listVariantsByProductGid/deleteVariantsByProductGid
- `twins/shopify/src/plugins/admin.ts` exists and seeds variants in fixture loop
- `twins/shopify/src/schema/resolvers.ts` exists with listVariantsByProductGid resolver
- Commits f5fc656 and a6ba9ec verified in git log
- All 435 tests green

---
*Quick task: quick-2*
*Completed: 2026-03-11*
