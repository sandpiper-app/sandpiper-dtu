---
phase: 36-shopify-behavioral-parity
plan: 04
subsystem: api
tags: [shopify, rest, location, inventory, since_id, ids, pagination-filters]

# Dependency graph
requires:
  - phase: 36-02
    provides: OAuth online token + access_scopes route (Finding #7)
  - phase: 36-03
    provides: GraphQL productCreate GID round-trip fix (Finding #9)
provides:
  - Location family REST routes (GET /locations.json, count, :id, :id/inventory_levels.json)
  - InventoryLevel mutation routes (POST adjust/connect/set, DELETE /inventory_levels.json)
  - InventoryItem single-item routes (GET/PUT /inventory_items/:id.json)
  - since_id filter on products.json, orders.json, customers.json
  - ids filter on inventory_items.json, products.json
  - All Finding #8 and #10 tests GREEN; Phase 36 complete
affects: [phase 37, conformance harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Location/count.json registered before /:id.json (more specific paths first in Fastify)
    - InventoryLevel sub-paths (adjust/connect/set) registered before DELETE base path
    - since_id filter: all.filter(item => item.id > sinceId) before paginateList call
    - ids filter: comma-separated Set filter before paginateList call
    - SDK REST client converts numeric id fields to strings via lossless-json — test with Number(id)

key-files:
  created: []
  modified:
    - twins/shopify/src/plugins/rest.ts
    - tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts

key-decisions:
  - "SDK REST client (parseJsonWithLosslessNumbers) converts all id/.*_id fields to strings via lossless-json; Location.find(id=1) returns instance.id === '1' not 1 — test assertions must use Number(instance.id)"
  - "Location.all() returns { data: Location[], headers, pageInfo } not { body } — SDK baseFind response shape; test must use data not body"
  - "Location.find() returns the Location instance directly (result.data[0]) not a { body } wrapper — access fields via instance.property"
  - "since_id filter applied before paginateList; const all changed to let all to allow filter mutations"
  - "Finding #8 and #10 closed: all 11 Phase 36 tests GREEN; 264/264 tests pass"

patterns-established:
  - "Fastify route ordering: register specific sub-paths (count.json, adjust.json) before parameterized paths (:id.json) in same prefix group"
  - "List filter pattern: parse filter params before calling paginateList; use let all to allow Array.filter reassignment"

requirements-completed: [Finding-8, Finding-10]

# Metrics
duration: 7min
completed: 2026-03-14
---

# Phase 36 Plan 04: Shopify Behavioral Parity Summary

**Location family REST routes, InventoryLevel mutations, InventoryItem single-item routes, and since_id/ids list filters close Finding #8 and #10; all 264 SDK tests GREEN**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T03:42:41Z
- **Completed:** 2026-03-14T03:49:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 10 new REST routes registered in rest.ts (Location family x4, InventoryLevel mutations x4, InventoryItem single-item x2)
- since_id filter applied to products.json, orders.json, customers.json; ids filter applied to inventory_items.json and products.json
- All 11 shopify-behavioral-parity tests GREEN (Findings #7, #8, #9, #10); 264/264 total tests pass; Phase 36 complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Location routes, InventoryLevel mutations, InventoryItem single-item routes** - `c9efcc8` (feat)
2. **Task 2: Add since_id/ids filter semantics to list endpoints + run full test suite** - `a6091f4` (feat)

## Files Created/Modified
- `twins/shopify/src/plugins/rest.ts` - Added 10 new routes + since_id/ids filter logic on 4 list handlers
- `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts` - Fixed Location.all/find assertions for actual SDK return shapes

## Decisions Made
- SDK REST client uses lossless-json and explicitly converts all `id`/`*_id` fields to strings; Location.find() returns `instance.id === "1"` — test assertion changed to `Number(instance.id) === 1`
- Location.all() returns `{ data, headers, pageInfo }` (not `{ body }`) per baseFind contract; test changed from `const { body }` to `const { data }`
- Location.find() returns the resource instance directly (not a wrapper with `body`) per the static find() implementation; test updated accordingly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Location.all() test assertion using wrong SDK return shape**
- **Found during:** Task 2 verification (pnpm test:sdk)
- **Issue:** Test did `const { body } = await shopify.rest.Location.all(...)` then accessed `body.locations`. Location.all() returns `{ data, headers, pageInfo }` from baseFind — no `body` property. `body` was undefined.
- **Fix:** Changed to `const { data }` and asserted `Array.isArray(data)` and `data.length > 0`
- **Files modified:** tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts
- **Verification:** Test GREEN after change
- **Committed in:** a6091f4 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Location.find() test assertion for wrong SDK return shape and id type**
- **Found during:** Task 2 verification (pnpm test:sdk)
- **Issue 1:** Test did `const { body } = await shopify.rest.Location.find(...)` — find() returns the resource instance directly, not `{ body }`. `body` was undefined.
- **Issue 2:** SDK REST client's `parseJsonWithLosslessNumbers` converts all `id`/`*_id` JSON fields to strings; `instance.id` returns `"1"` not `1`. `toBe(1)` assertion failed.
- **Fix:** Changed to `const location = await shopify.rest.Location.find(...)`, assert `location` isDefined and `Number(location.id) === 1`
- **Files modified:** tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts
- **Verification:** Test GREEN after both changes; all 264 tests pass
- **Committed in:** a6091f4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs in Wave 0 tests)
**Impact on plan:** Both fixes were in the Wave 0 test file written before implementation; tests used wrong SDK return shape patterns. Auto-fixes corrected assertions without changing verified behavior. No scope creep.

## Issues Encountered
- SDK `parseJsonWithLosslessNumbers` converts numeric `id` fields to strings (intentional Shopify SDK design for large ID safety). This is not a twin bug — the REST client does this for all resources. Tests must compare with `Number(id)` or `===` against string `"1"`.
- Route ordering critical for Fastify: `locations/count.json` must register before `locations/:id.json`, and `inventory_levels/adjust.json` before `inventory_levels.json` — plan spec was followed exactly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 36 fully complete: all 4 findings (#7, #8, #9, #10) closed; 264 tests GREEN
- Phase 37 (Billing Fidelity & Conformance Rigor) can now begin — no blockers

## Self-Check: PASSED

- FOUND: .planning/phases/36-shopify-behavioral-parity/36-04-SUMMARY.md
- FOUND: twins/shopify/src/plugins/rest.ts
- FOUND: tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts
- FOUND: c9efcc8 (Task 1 commit)
- FOUND: a6091f4 (Task 2 commit)
- VERIFIED: pnpm test:sdk exits 0 with 264/264 tests passing

---
*Phase: 36-shopify-behavioral-parity*
*Completed: 2026-03-14*
