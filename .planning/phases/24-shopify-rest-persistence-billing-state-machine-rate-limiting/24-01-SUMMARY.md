---
phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting
plan: 01
subsystem: testing
tags: [vitest, shopify, rest, billing, rate-limiting, tdd, integration-tests]

# Dependency graph
requires:
  - phase: 23-shopify-oauth-storefront-separation
    provides: POST /admin/tokens endpoint for test token seeding without OAuth

provides:
  - Failing integration tests for SHOP-20a, SHOP-20b, SHOP-20c (REST persistence)
  - Failing integration tests for SHOP-21a through SHOP-21d (billing state machine)
  - Updated and new assertions for SHOP-24a and SHOP-24b (rate limiting)

affects:
  - 24-02 (REST persistence implementation — must make rest-persistence.test.ts green)
  - 24-03 (billing state machine implementation — must make billing-state-machine.test.ts green)
  - 24-04 (rate limiting fix — must make updated rate-limit.test.ts assertions green)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test token seeding via POST /admin/tokens with explicit token UUID (Phase 23 OAuth-safe pattern)"
    - "sendGql() helper function in billing tests reduces boilerplate for GraphQL mutations"
    - "seedToken() helper centralizes shop-domain-specific token seeding for ownership tests"

key-files:
  created:
    - twins/shopify/test/integration/rest-persistence.test.ts
    - twins/shopify/test/integration/billing-state-machine.test.ts
  modified:
    - twins/shopify/test/integration/rate-limit.test.ts

key-decisions:
  - "Use POST /admin/tokens (not /admin/oauth/access_token) for token seeding in new tests — survives Phase 23 OAuth tightening"
  - "SHOP-20c test seeds two orders then lists all to get actual numeric IDs, avoiding assumptions about ID values"
  - "SHOP-21a uniqueness test calls appSubscriptionCreate twice and asserts different IDs — directly catches the hardcoded stub"
  - "SHOP-21d ownership test seeds a second token for other-shop.myshopify.com to test cross-shop rejection"
  - "SHOP-24b describe block has its own beforeEach/afterEach (not nested in outer describe) matching plan template"

patterns-established:
  - "Wave 0 TDD: write failing tests before implementation plans so Plans 02-04 have concrete verify commands"
  - "sendGql(app, token, query, variables) helper pattern for GraphQL integration tests"
  - "seedToken(app, shopDomain) helper pattern for multi-tenant ownership tests"

requirements-completed: [SHOP-20, SHOP-21, SHOP-24]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 24 Plan 01: REST Persistence, Billing State Machine & Rate Limiting Test Scaffold Summary

**Wave 0 TDD scaffold: three integration test files in RED state covering SHOP-20 REST persistence, SHOP-21 billing state machine, and SHOP-24 rate limiting, with 9 failing assertions targeting current stub behavior**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T02:27:06Z
- **Completed:** 2026-03-13T02:32:14Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 updated)

## Accomplishments

- Created `rest-persistence.test.ts` with 5 tests covering SHOP-20a/b/c — all fail because stub returns GID string ID and GET routes return wrong data
- Created `billing-state-machine.test.ts` with 7 tests covering SHOP-21a/b/c/d — 4 fail because stub returns hardcoded ID, lacks confirmation route, and has no ownership validation
- Updated `rate-limit.test.ts` with 1000 bucket assertions and new SHOP-24b test for actualQueryCost < requestedQueryCost on sparse results

## Task Commits

Each task was committed atomically:

1. **Task 1: Create rest-persistence.test.ts (SHOP-20 failing tests)** - `dbb131d` (test)
2. **Task 2: Create billing-state-machine.test.ts (SHOP-21 failing tests)** - `6961094` (test)
3. **Task 3: Update rate-limit.test.ts for SHOP-24 (1000 bucket + actualQueryCost)** - `fc39326` (test)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified

- `twins/shopify/test/integration/rest-persistence.test.ts` - 5 failing integration tests for SHOP-20a/b/c REST persistence gaps
- `twins/shopify/test/integration/billing-state-machine.test.ts` - 7 integration tests (4 failing) for SHOP-21a/b/c/d billing state machine lifecycle
- `twins/shopify/test/integration/rate-limit.test.ts` - Updated maximumAvailable 2000→1000 (×2), relaxed actualQueryCost assertion, added SHOP-24b test

## Decisions Made

- Used `POST /admin/tokens` (not OAuth) for token seeding in all new test files — the Phase 23 OAuth tightening broke the `code`-only pattern used in older integration tests; `POST /admin/tokens` accepts an explicit UUID and bypasses OAuth entirely
- SHOP-20c lists orders after fixture load to capture actual auto-incremented IDs rather than constructing GIDs, ensuring the test finds the right order records regardless of the ID assignment
- SHOP-21a's uniqueness test calls `appSubscriptionCreate` twice on the same token and asserts `id1 !== id2` — this directly triggers the failing condition in the hardcoded stub that always returns `gid://shopify/AppSubscription/1`
- SHOP-21d seeds a second token for `other-shop.myshopify.com` via `POST /admin/tokens` to simulate cross-shop cancellation rejection; the assertion checks `userErrors.length > 0 || appSubscription === null` to allow either error format
- SHOP-24b `describe` block is top-level (not nested in the existing outer `describe`) with its own `beforeEach`/`afterEach` matching the plan's template exactly

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**Pre-existing: `test/integration.test.ts` and existing `rate-limit.test.ts` tests failing due to Phase 23 OAuth tightening.** These tests use `POST /admin/oauth/access_token` with only `{ code: ... }` but Phase 23 now requires `client_id` and `client_secret`. This was a pre-existing failure before this plan ran (verified by running the test suite with `git stash`). Logged to deferred items — not caused by this plan's changes. The new test files in this plan use `POST /admin/tokens` and are not affected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three test files are in RED state for the correct reasons — exactly as required for Plans 02, 03, and 04
- Plan 02 verify command: `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/rest-persistence.test.ts`
- Plan 03 verify command: `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/billing-state-machine.test.ts`
- Plan 04 verify command: `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/rate-limit.test.ts`
- Blocker for pre-existing `test/integration.test.ts` failures (Phase 23 OAuth) should be addressed before Phase 27 conformance verification

## Self-Check: PASSED

- FOUND: twins/shopify/test/integration/rest-persistence.test.ts
- FOUND: twins/shopify/test/integration/billing-state-machine.test.ts
- FOUND: twins/shopify/test/integration/rate-limit.test.ts
- FOUND: .planning/phases/24-.../24-01-SUMMARY.md
- FOUND commit: dbb131d (rest-persistence.test.ts)
- FOUND commit: 6961094 (billing-state-machine.test.ts)
- FOUND commit: fc39326 (rate-limit.test.ts updates)

---
*Phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting*
*Completed: 2026-03-13*
