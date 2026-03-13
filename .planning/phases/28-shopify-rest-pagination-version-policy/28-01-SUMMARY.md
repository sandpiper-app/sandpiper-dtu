---
phase: 28-shopify-rest-pagination-version-policy
plan: 01
subsystem: testing
tags: [shopify, rest, pagination, cursor, integration-tests, sdk-verification, tdd]

requires:
  - phase: 24-shopify-rest-billing
    provides: POST /admin/tokens seeding endpoint and test token patterns
  - phase: 22-shopify-version-routing
    provides: /admin/api/:version/ parameterized routes for REST endpoints
  - phase: 21-infrastructure
    provides: Token seeding infrastructure (POST /admin/tokens) and SDK test harness

provides:
  - Wave 0 RED tests defining REST cursor pagination contract (SHOP-23) for Plan 02
  - Wave 0 RED tests defining version policy contract (SHOP-17) for Plan 03
  - Migrated pagination.test.ts from broken OAuth seeding to POST /admin/tokens
  - Real multi-page assertions in shopify-api-rest-client.test.ts replacing page_info=test sentinels
  - Real pagination assertion in shopify-admin-rest-client.test.ts replacing page_info=test sentinel

affects:
  - 28-02-PLAN.md: REST cursor pagination implementation must make SHOP-23 tests GREEN
  - 28-03-PLAN.md: Version policy implementation must make SHOP-17 tests GREEN

tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: write failing tests before implementation so Plans 02/03 have concrete verify commands"
    - "POST /admin/tokens seeding for all new Shopify integration tests (OAuth tightening bypass)"
    - "seedProducts() helper using /admin/fixtures/load in SDK verification tests"

key-files:
  created: []
  modified:
    - twins/shopify/test/integration/pagination.test.ts
    - tests/sdk-verification/sdk/shopify-api-rest-client.test.ts
    - tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts

key-decisions:
  - "Removed sentinel page_info=test tests from pagination.test.ts (they tested old behavior, superseded by real cursor tests)"
  - "Removed sentinel page_info=test tests from both SDK files (they tested the twin stub, not real pagination)"
  - "shopify-admin-rest-client uses expect(linkHeader).not.toBeNull() instead of toBeDefined() because headers.get() returns null not undefined"
  - "Pre-existing rate-limit throttling test failure deferred to deferred-items.md (out of scope, not caused by Plan 28-01)"

patterns-established:
  - "RED test naming: suffix '(RED until Plan 02)' makes intent clear in test output"
  - "seedProducts() helper in SDK test files uses SHOPIFY_API_URL env var with /admin/fixtures/load"

requirements-completed:
  - SHOP-23
  - SHOP-17

duration: 7min
completed: 2026-03-13
---

# Phase 28 Plan 01: Shopify REST Pagination & Version Policy — Wave 0 Tests Summary

**Migrated pagination.test.ts OAuth seeding to POST /admin/tokens and established 6 RED contract tests for REST cursor pagination (SHOP-23) and version policy (SHOP-17), plus replaced 3 stale page_info=test sentinels in SDK verification files**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T16:27:00Z
- **Completed:** 2026-03-13T16:33:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fixed broken `beforeEach` in `pagination.test.ts`: `POST /admin/oauth/access_token` (broken post Phase 23) replaced with `POST /admin/tokens` — all 8 pre-existing GraphQL tests restored to GREEN
- Added 4 RED tests for REST cursor pagination (SHOP-23) in `pagination.test.ts`: first-page Link header with page_info cursor, second-page via cursor with rel=previous, invalid cursor 400, and orders endpoint pagination
- Added 2 RED tests for version policy (SHOP-17): invalid month 2024-99 returns 400, sunset version 2023-01 returns 400
- Replaced 2 sentinel `page_info=test` tests in `shopify-api-rest-client.test.ts` with real multi-page assertions using `limit=2` and 3 seeded products (RED: `pageInfo.nextPage` undefined until Plan 02)
- Replaced 1 sentinel `page_info=test` test in `shopify-admin-rest-client.test.ts` with real Link header assertion (RED: link header null until Plan 02)

## Task Commits

1. **Task 1: Migrate pagination.test.ts OAuth seeding and add REST/version failing tests** - `3b5b335` (test)
2. **Task 2: Replace sentinel tests in SDK verification files** - `611d9b4` (test)

**Plan metadata:** (follows this SUMMARY commit)

## Files Created/Modified

- `twins/shopify/test/integration/pagination.test.ts` — OAuth seeding fixed to POST /admin/tokens; sentinel REST tests removed; 4 SHOP-23 RED tests + 2 SHOP-17 RED tests added
- `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — 2 sentinel page_info=test tests replaced with real multi-page limit=2 tests; seedProducts() helper added
- `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` — 1 sentinel page_info=test test replaced with real Link header assertion; seedProducts() helper added

## Decisions Made

- Removed sentinel REST tests from `pagination.test.ts` (the two `page_info=test` tests tested old stub behavior; new cursor pagination tests supersede them)
- `shopify-admin-rest-client.test.ts`: `headers.get('link')` returns `null` not `undefined`, so `expect(linkHeader).not.toBeNull()` is correct (not `toBeDefined()`)
- The `clientCredentials()` grant type is in `PASSTHROUGH_GRANT_TYPES` in the twin's OAuth plugin, so existing `shopify-api-rest-client.test.ts` `beforeEach` still works without changes
- Pre-existing rate-limit throttling test failure logged to `deferred-items.md` — not caused by Phase 28-01, out of scope

## Deviations from Plan

None — plan executed exactly as written. The `randomUUID` import was already present in `pagination.test.ts` (added in a prior pass) and the `POST /admin/tokens` seeding pattern was already partially implemented; the sentinel tests needed to be removed and new RED tests added as planned.

## Issues Encountered

- The Edit tool initially rejected the write due to a file modification timestamp mismatch — resolved by reading the current file state and using targeted edits to the correct sections
- `shopify-admin-rest-client.test.ts` sentinel test used `expect(linkHeader).toContain()` on a `null` value — required changing to `expect(linkHeader).not.toBeNull()` for cleaner failure message

## Next Phase Readiness

- Plan 28-02 can implement REST cursor pagination — exact test assertions are in place as RED tests
- Plan 28-03 can implement version policy validation — exact test assertions are in place as RED tests
- Pre-existing rate-limit throttling failure (unrelated to this plan) documented in `deferred-items.md`

---
*Phase: 28-shopify-rest-pagination-version-policy*
*Completed: 2026-03-13*
