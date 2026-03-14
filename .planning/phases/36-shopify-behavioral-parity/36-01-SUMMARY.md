---
phase: 36-shopify-behavioral-parity
plan: 01
subsystem: testing
tags: [vitest, shopify-api, tdd, rest, graphql, oauth]

# Dependency graph
requires:
  - phase: 35-slack-behavioral-parity
    provides: "All Slack findings closed; project test suite at 253 green"
provides:
  - "Wave 0 RED tests for all four Phase 36 findings: Finding #7 (OAuth isOnline), Finding #8 (missing REST routes), Finding #9 (GID round-trip), Finding #10 (list filter semantics)"
  - "TDD contract: 9 failing tests that Plans 02-04 must turn green without regressions"
  - "2 regression guards passing: OfflineAccessToken isOnline=false, InventoryItem ids=99999 returns empty"
affects: [36-02, 36-03, 36-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD pattern: write RED tests before any implementation to establish behavioral contract"
    - "raw fetch() for REST routes that SDK REST resource classes don't expose cleanly (adjust, GraphQL mutation)"
    - "getSession() helper returning { shop, accessToken } instead of full SDK Session object for REST resource calls"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts
  modified: []

key-decisions:
  - "Use import { restResources } from '@shopify/shopify-api/rest/admin/2024-01' (not individual class imports) — the package index only exports the bundled restResources object; individual class exports aren't available from that path"
  - "InventoryLevel.adjust() tested via raw fetch (not SDK REST resource) to avoid SDK resource class quirks with the adjust sub-path endpoint"
  - "Finding #10 inventory item tests use raw fetch against twinUrl() directly since REST resource ids/since_id params are the behavior under test"
  - "InventoryItem ids=99999 test passes immediately (correct) — empty DB returns empty array which matches expected; test will still catch regression if a future change breaks filtering"

patterns-established:
  - "Phase 36 Wave 0 pattern: all behavioral findings get RED tests first, Plans 02+ close them"

requirements-completed:
  - Finding-7
  - Finding-8
  - Finding-9
  - Finding-10

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 36 Plan 01: Shopify Behavioral Parity Summary

**Wave 0 RED test suite for Shopify findings #7-#10: 11 tests, 9 failing (TDD contract for Plans 02-04), 2 regression guards passing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T03:28:26Z
- **Completed:** 2026-03-14T03:32:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `shopify-behavioral-parity.test.ts` with 11 tests covering Findings #7-#10
- 9 tests are RED (proving the bugs exist): OnlineAccessToken isOnline, AccessScope.all(), Location.all/find, InventoryLevel.adjust, GID round-trip, since_id and ids filters
- 2 tests pass as regression guards: OfflineAccessToken isOnline=false, InventoryItem ids=99999 returns empty
- Zero regressions in the 253 pre-existing tests (now 264 total: 255 passing, 9 failing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write RED tests for all four findings** - `ed1103b` (test)

**Plan metadata:** (pending — created with docs commit)

## Files Created/Modified
- `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts` - 11 RED tests covering Phase 36 Findings #7-#10; Wave 0 TDD contract for Plans 02-04

## Decisions Made

- **Import pattern:** `import { restResources } from '@shopify/shopify-api/rest/admin/2024-01'` is the only valid import from that path. The `@shopify/shopify-api` package's `./rest/admin/*` export pattern resolves to an index file that only re-exports the bundled `restResources` object. Individual class exports (AccessScope, Location, etc.) are NOT available from the index — attempting `import { AccessScope } from '...'` causes `loadRestResources` to fail with `Cannot read properties of undefined (reading 'apiVersion')`. Fix: use the full `restResources` bundle and access classes via `shopify.rest.AccessScope` etc.

- **InventoryLevel.adjust via raw fetch:** The plan suggested using the REST resource SDK for adjust(), but raw fetch is simpler and avoids potential issues with how the SDK serializes the sub-path endpoint URL. Raw fetch directly against the twin URL makes the test behavior unambiguous.

- **InventoryItem ids=99999 passes immediately:** This is expected and correct. After `resetShopify()`, the inventory items table is empty, so `ids=99999` correctly returns `[]`. This will remain a valid regression guard — it ensures that when items ARE seeded (by Plans 02+), ids=99999 still returns empty (not the full list).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed REST resource import pattern**
- **Found during:** Task 1 (Write RED tests for all four findings)
- **Issue:** Plan's `<interfaces>` section showed individual class imports (`import { AccessScope, Location, InventoryLevel, InventoryItem, Product } from '@shopify/shopify-api/rest/admin/2024-01'`) but the package's index file only exports the bundled `restResources` object. Individual class imports caused `loadRestResources` TypeError.
- **Fix:** Changed to `import { restResources } from '@shopify/shopify-api/rest/admin/2024-01'` and `createShopifyApiClient({ restResources })`, then use `shopify.rest.AccessScope` etc.
- **Files modified:** `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts`
- **Verification:** Test file loads without TypeError; 11 tests execute; 9 fail RED as expected
- **Committed in:** ed1103b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - import bug)
**Impact on plan:** Auto-fix necessary for correctness — same behavioral outcome (9 RED tests), correct import path for package structure.

## Issues Encountered
- REST resource import path mismatch: plan showed individual class imports, actual package only exports bundled `restResources`. Fixed automatically per deviation Rule 1.

## Next Phase Readiness
- Wave 0 contract established: 9 failing tests define exactly what Plans 02-04 must fix
- Plan 02 target: Finding #7 (OAuth isOnline=true for OnlineAccessToken) — 1 test to turn green
- Plan 03 target: Finding #8 (AccessScope.all, Location.all/find, InventoryLevel.adjust) — 4 tests to turn green
- Plan 04 targets: Finding #9 (GID round-trip) + Finding #10 (since_id, ids filters) — 4 tests to turn green
- No blockers

---
*Phase: 36-shopify-behavioral-parity*
*Completed: 2026-03-14*
