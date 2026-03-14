---
phase: 33-cross-cutting-reset-coverage
plan: 01
subsystem: testing
tags: [vitest, sqlite, reset, xcut-01, shopify-twin, slack-twin, performance]

# Dependency graph
requires:
  - phase: 25-slack-state-tables
    provides: slack_channel_members, slack_views, slack_pins tables in SlackStateManager reset
  - phase: 24-shopify-billing-rest
    provides: app_subscriptions, product_variants tables in Shopify StateManager

provides:
  - "XCUT-01 closed: 7 proofs total — 3 Shopify (app_subscriptions, product_variants, <100ms) + 4 Slack (channel_members, views, pins, <100ms)"
  - "Sub-100ms reset performance assertions for both Shopify and Slack twins"

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dbBefore/dbAfter pattern: capture db reference before reset for INSERT, re-read app.stateManager.database after reset (in-memory SQLite close/reopen invalidates old reference)"
    - "Warm-up reset before timing: call /admin/reset once to amortize Fastify route resolution before starting Date.now() timer"

key-files:
  created: []
  modified:
    - twins/shopify/test/integration.test.ts
    - twins/slack/test/smoke.test.ts

key-decisions:
  - "XCUT-01 closure via test-only additions: reset mechanism correct by design (:memory: SQLite close/reopen destroys all data atomically), only test coverage was missing"
  - "Warm-up call before timing assertion prevents Fastify startup cost from inflating measured reset time"
  - "pre-existing rate-limit flaky test (Shopify) and oauth.v2.access failures (Slack) confirmed out of scope — both fail before this plan's changes"

patterns-established:
  - "XCUT-01 table reset pattern: INSERT row via raw db handle, POST /admin/reset, re-read db reference, assert COUNT=0"
  - "Performance assertion pattern: warm-up inject + timed inject + expect(elapsed).toBeLessThan(100)"

requirements-completed: [XCUT-01]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 33 Plan 01: Cross-Cutting Reset Coverage Summary

**XCUT-01 closed with 7 test proofs: Shopify v1.2 table resets (app_subscriptions, product_variants) + sub-100ms performance assertions for both Shopify and Slack twins**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-13T19:56:02Z
- **Completed:** 2026-03-13T19:58:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 3 new XCUT-01 tests to `twins/shopify/test/integration.test.ts`: app_subscriptions cleared after reset, product_variants cleared after reset, Shopify reset completes in under 100ms
- Added 1 new XCUT-01 test to `twins/slack/test/smoke.test.ts`: Slack reset completes in under 100ms
- All 7 XCUT-01 proofs GREEN: 3 Shopify new + 3 Slack existing + 1 Slack new

## Task Commits

Each task was committed atomically:

1. **Task 1: Add XCUT-01 reset coverage tests to Shopify integration.test.ts** - `7fd3b5a` (test)
2. **Task 2: Add Slack reset performance test to smoke.test.ts** - `280b574` (test)

**Plan metadata:** _(final docs commit — see below)_

## Files Created/Modified

- `twins/shopify/test/integration.test.ts` - Added `describe('XCUT-01: v1.2 tables cleared on reset')` block with 3 it() tests (app_subscriptions, product_variants, performance)
- `twins/slack/test/smoke.test.ts` - Added `it('reset completes in under 100ms')` inside existing XCUT-01 describe block

## Decisions Made

- XCUT-01 closure is test-only: the reset mechanism has always been correct (`:memory:` SQLite close/reopen atomically destroys all data). Only the test coverage was missing.
- Warm-up reset call added before performance timing to prevent Fastify route resolution cost from inflating the measured elapsed time.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing flakiness noted (out of scope — not caused by this plan):
- `test/integration/rate-limit.test.ts` — "returns HTTP 429 with Retry-After when bucket is depleted" fails intermittently when run in parallel with other Shopify tests; passes in isolation. Pre-dates this plan.
- `test/smoke.test.ts` — `POST /api/oauth.v2.access` tests (2 tests) — pre-existing failures in Slack twin unrelated to reset or XCUT-01.

Both noted in `deferred-items.md` scope boundary: pre-existing, not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- XCUT-01 fully satisfied — all v1.2 requirements now closed
- Phase 33 is the final cross-cutting phase; milestone v1.2 Behavioral Fidelity complete

## Self-Check: PASSED

- twins/shopify/test/integration.test.ts: FOUND
- twins/slack/test/smoke.test.ts: FOUND
- .planning/phases/33-cross-cutting-reset-coverage/33-01-SUMMARY.md: FOUND
- Commit 7fd3b5a: FOUND
- Commit 280b574: FOUND

---
*Phase: 33-cross-cutting-reset-coverage*
*Completed: 2026-03-13*
