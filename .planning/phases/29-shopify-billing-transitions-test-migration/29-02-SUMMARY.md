---
phase: 29-shopify-billing-transitions-test-migration
plan: 02
subsystem: testing
tags: [shopify, oauth, integration-tests, token-seeding, vitest]

# Dependency graph
requires:
  - phase: 29-01
    provides: billing transition guards (SHOP-21e/21f) that the integration suite validates
  - phase: 23-03
    provides: Phase 23 OAuth tightening (client_id + client_secret required for /admin/oauth/access_token)
  - phase: 24-01
    provides: POST /admin/tokens seeder endpoint established as canonical test pattern
provides:
  - "All 50 previously-failing Shopify twin integration tests GREEN"
  - "integration.test.ts: 45/45 tests GREEN using seedToken() helper and full authorize flow"
  - "pagination.test.ts: 8 previously-failing tests GREEN using POST /admin/tokens"
  - "order-lifecycle.test.ts: 7/7 tests GREEN using seedToken() helper"
  - "rate-limit.test.ts: 5/5 tests GREEN (was already using POST /admin/tokens)"
affects: [future shopify twin tests, conformance harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "seedToken() helper pattern — randomUUID token seeded via POST /admin/tokens for test isolation"
    - "Full OAuth authorize flow — GET /admin/oauth/authorize → POST /admin/oauth/access_token for OAuth-specific tests"
    - "Form-urlencoded OAuth tests use real authorize code not bare code strings"

key-files:
  created: []
  modified:
    - "twins/shopify/test/integration.test.ts — added seedToken(), migrated 7 beforeEach blocks, updated OAuth/form-urlencoded describe blocks"
    - "twins/shopify/test/integration/pagination.test.ts — migrated beforeEach to POST /admin/tokens"
    - "twins/shopify/tests/integration/order-lifecycle.test.ts — replaced getToken() with seedToken()"

key-decisions:
  - "OAuth describe blocks use full authorize→exchange flow (GET /admin/oauth/authorize + POST /admin/oauth/access_token with credentials) so they continue testing actual OAuth behavior"
  - "All other describe blocks use seedToken() via POST /admin/tokens — semantically correct since they test API behavior not OAuth itself"
  - "API Conformance: OAuth form-urlencoded tests also use full authorize flow with credentials in form-urlencoded format to preserve coverage of that content-type path"
  - "rate-limit.test.ts needed no changes — it was already migrated to POST /admin/tokens in Phase 24-03"
  - "6 pre-existing RED tests in pagination.test.ts (REST cursor pagination SHOP-23 + version policy SHOP-17) are out-of-scope; they were added by plan 29-01 as future RED tests"

patterns-established:
  - "seedToken(app, shopDomain?) pattern: randomUUID() + POST /admin/tokens is the standard for non-OAuth test setup"
  - "Full authorize flow pattern: GET /admin/oauth/authorize?client_id=test-api-key + POST /admin/oauth/access_token with credentials for OAuth-specific tests"

requirements-completed: [SHOP-21]

# Metrics
duration: 10min
completed: 2026-03-13
---

# Phase 29 Plan 02: Shopify Integration Test OAuth Migration Summary

**50 failing integration tests GREEN by migrating bare-code OAuth pattern to POST /admin/tokens seeder and full authorize flow across 4 test files**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-13T16:26:23Z
- **Completed:** 2026-03-13T16:36:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Migrated 7 `beforeEach` blocks in integration.test.ts from bare-code `POST /admin/oauth/access_token` to `seedToken()` helper using `POST /admin/tokens`
- Updated OAuth and API Conformance form-urlencoded describe blocks to use full authorize→exchange flow with valid `client_id`/`client_secret` credentials
- Replaced `getToken()` helper in order-lifecycle.test.ts with `seedToken()` using established seeder pattern
- Confirmed rate-limit.test.ts was already fully migrated in Phase 24-03 (5/5 GREEN, no changes needed)
- All target tests GREEN: 45/45 integration, 8/8 pagination (previously-passing), 7/7 order-lifecycle, 5/5 rate-limit

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate integration.test.ts and pagination.test.ts to POST /admin/tokens** - `0539f91` (feat)
2. **Task 2: Migrate order-lifecycle.test.ts and verify rate-limit.test.ts** - `76698e5` (feat)

**Plan metadata:** (final commit hash — TBD after this commit)

## Files Created/Modified

- `twins/shopify/test/integration.test.ts` — Added `import { randomUUID }`, `seedToken()` helper, updated OAuth describe (full authorize flow), updated GraphQL API/Error Simulation/Webhooks/DLQ/Version routing beforeEach blocks, updated API Conformance OAuth form-urlencoded tests
- `twins/shopify/test/integration/pagination.test.ts` — Added `import { randomUUID }`, migrated beforeEach to POST /admin/tokens
- `twins/shopify/tests/integration/order-lifecycle.test.ts` — Added `import { randomUUID }`, replaced `getToken()` with `seedToken()`, updated beforeEach call

## Decisions Made

- **OAuth tests must use full authorize flow**: The OAuth describe block and API Conformance form-urlencoded tests must continue to test actual OAuth endpoint behavior. They get real codes via `GET /admin/oauth/authorize` (which calls `storeOAuthCode()`) then exchange with valid credentials. This preserves coverage intent.
- **All other test setup uses POST /admin/tokens**: Non-OAuth tests (GraphQL, Webhooks, Error Simulation, etc.) only need a valid token for API access — they test API behavior, not auth behavior. `seedToken()` is the correct abstraction.
- **rate-limit.test.ts unchanged**: Plan explicitly says to skip it if all 5 tests pass. Rate-limit tests were already migrated in Phase 24-03 (decision recorded in STATE.md).

## Deviations from Plan

None — plan executed exactly as written. The rate-limit.test.ts check (run in isolation first, skip changes if passing) was performed as instructed and the file was left unchanged.

## Issues Encountered

- Pre-existing RED tests in pagination.test.ts: 6 tests in `REST cursor pagination (SHOP-23)` and `Version policy (SHOP-17)` describe blocks were added by plan 29-01 as future RED tests. These are not regressions from this plan. They are out-of-scope and documented here for clarity.
- Flaky `currentlyAvailable decreases after each query` test in rate-limit.test.ts: passes in isolation but intermittently fails in full parallel suite due to timing sensitivity — pre-existing behavior, unrelated to this plan's changes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Full Shopify twin test suite clean (modulo pre-existing RED future tests)
- SHOP-21 requirement fully satisfied across all 6 billing behaviors
- Phase 29 complete — ready for Phase 30 (Slack Transport) or Phase 31 continuation

---
*Phase: 29-shopify-billing-transitions-test-migration*
*Completed: 2026-03-13*
