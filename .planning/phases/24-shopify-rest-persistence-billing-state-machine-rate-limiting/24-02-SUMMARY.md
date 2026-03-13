---
phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting
plan: 02
subsystem: api
tags: [shopify, rest, sqlite, state-manager, products, orders, better-sqlite3]

# Dependency graph
requires:
  - phase: 24-01
    provides: Wave 0 TDD test scaffold with rest-persistence.test.ts in RED state
  - phase: 22-01
    provides: Version routing and adminPath helpers in rest.ts
provides:
  - Persistent POST /products.json that creates real products with numeric integer id and admin_graphql_api_id GID
  - GET /products/:id.json that retrieves product by integer PK (returns 404 for missing)
  - GET /orders/:id.json that retrieves specific order by integer id (returns 404 for missing)
  - StateManager.getProduct(rowId) backed by prepared statement
  - StateManager.getOrderById(id) backed by prepared statement
affects:
  - 24-03 (billing state machine - uses stateManager patterns)
  - 24-04 (rate limiting - shares rest.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step product insert: createProduct with temp GID, update GID to gid://shopify/Product/{rowId} after AUTOINCREMENT resolves
    - REST integer-id lookup: stateManager.getProduct(numericId) and stateManager.getOrderById(numericId)
    - StateManager prepared statements nulled in both reset() and close() for lifecycle safety

key-files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/plugins/rest.ts

key-decisions:
  - "Two-step product insert: insert with temp GID, then UPDATE gid to gid://shopify/Product/{rowId} — avoids needing to know row id before insert"
  - "getProduct uses class-level prepared statement (getProductStmt) rather than inline db.prepare() for consistency and correct lifecycle management"
  - "GET /products/:id.json uses getProduct(numericId) directly — integer PK lookup, no GID construction needed"
  - "GET /orders/:id.json replaces null stub with getOrderById(numericId) — returns 404 for missing ids"
  - "State package rebuild (pnpm -F @dtu/state build) required after adding getOrderById — twin imports from compiled dist, not source"

patterns-established:
  - "Integer-id REST lookup: parse req.params.id as integer, call stateManager.getXById(numericId), 404 if null"
  - "Prepared statement lifecycle: declare field, null in reset() AND close(), prepare in prepareStatements()"

requirements-completed: [SHOP-20]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 24 Plan 02: REST Persistence Summary

**Persistent POST /products.json with numeric id + admin_graphql_api_id GID, GET /products/:id.json and GET /orders/:id.json backed by SQLite via two new StateManager prepared-statement methods**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T02:35:06Z
- **Completed:** 2026-03-13T02:39:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 5 SHOP-20 integration tests (rest-persistence.test.ts) now pass GREEN — was 5/5 RED before
- POST /products.json: two-step insert yields correct numeric integer id and admin_graphql_api_id GID derived from AUTOINCREMENT rowId
- GET /products/:id.json: retrieves created product by integer PK, returns 404 with errors for missing ids
- GET /orders/:id.json: replaces `{ order: null }` stub with stateManager.getOrderById(), returns 404 for missing ids
- StateManager gains getProduct(rowId) and getOrderById(id) as proper prepared-statement methods, correctly nulled in both reset() and close()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getProduct(rowId) and getOrderById(id) to StateManager** - `d69abec` (feat)
2. **Task 2: Implement persistent POST/GET products and GET orders/:id in rest.ts** - `3bb830c` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks share commit with implementation because behavioral tests are integration-level tests spanning both tasks_

## Files Created/Modified
- `packages/state/src/state-manager.ts` - Added getProductStmt and getOrderByIdStmt class fields, nulled in reset()/close(), prepared in prepareStatements(); replaced inline db.prepare() in getProduct() with prepared statement; added getOrderById(id) public method
- `twins/shopify/src/plugins/rest.ts` - Replaced stub POST /products.json with two-step insert returning numeric id; added GET /products/:id.json; replaced null stub GET /orders/:id.json with stateManager.getOrderById() lookup

## Decisions Made
- Two-step product insert: use temp GID on createProduct(), then UPDATE gid to `gid://shopify/Product/${rowId}` after AUTOINCREMENT resolves — avoids needing to predict the row id before insert
- State package must be rebuilt after adding new methods — twin imports from `packages/state/dist/`, not source; `pnpm -F @dtu/state build` added to execution pattern for future plans
- GET /products/:id.json uses `getProduct(numericId)` directly (integer PK lookup) rather than constructing a GID and calling `getProductByGid()` — simpler and faster

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuild state package dist after adding getOrderById**
- **Found during:** Task 2 (rest.ts GET /orders/:id.json implementation)
- **Issue:** `stateManager.getOrderById` returned 500 because the dist files were stale — `getOrderById` existed in source but not compiled dist, and Fastify/Node loaded the compiled package
- **Fix:** Ran `pnpm -F @dtu/state build` to recompile dist with the new method
- **Files modified:** packages/state/dist/* (gitignored)
- **Verification:** All 5 rest-persistence tests passed after rebuild
- **Committed in:** n/a (dist is gitignored)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Build step required by workspace package architecture — no scope creep.

## Issues Encountered
- Pre-existing failures in `test/integration.test.ts` (55 tests, 5 files) were present before and after changes — confirmed by git stash baseline check. Zero regressions introduced.

## Next Phase Readiness
- SHOP-20 complete: REST product/order persistence is functional and tested
- Plan 24-03 (billing state machine) can proceed — stateManager patterns established
- Pre-existing `test/integration.test.ts` failures remain in scope for future phases (unrelated to 24-02)

---
*Phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting*
*Completed: 2026-03-13*
