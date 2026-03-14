---
phase: 37-billing-fidelity-conformance-rigor
plan: 01
subsystem: testing
tags: [vitest, shopify-billing, wave-0, tdd, graphql]

# Dependency graph
requires:
  - phase: 36-shopify-behavioral-parity
    provides: All 264 SDK tests GREEN before adding billing RED tests
provides:
  - 4 RED Wave 0 test assertions proving billing lineItems + oneTimePurchases gaps (Finding #11)
  - Contract for Plans 02-03 to turn GREEN
affects:
  - 37-02 (billing fidelity implementation plan — must turn these 4 RED tests GREEN)
  - 37-03 (may address oneTimePurchases persistence)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED-first contract: add failing tests before implementation, prove gaps exist"
    - "Direct GraphQL fetch via fetch() API for mutations not in SDK billing helper"

key-files:
  created: []
  modified:
    - tests/sdk-verification/sdk/shopify-api-billing.test.ts

key-decisions:
  - "4 new RED tests prove Finding #11 gaps: lineItems empty, appPurchaseOneTimeCreate stub, oneTimePurchases always [], activeSubscriptions[0].lineItems always []"
  - "Direct fetch() used for appPurchaseOneTimeCreate and currentAppInstallation queries — billing SDK has no oneTimePurchase helper method"
  - "Tests fail at runtime against live twin (not compile-time) — GraphQL schema accepts queries but returns empty/stub data"

patterns-established: []

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 37 Plan 01: Billing Fidelity Wave 0 RED Tests Summary

**4 RED contract tests prove Finding #11 billing gaps exist: lineItems always empty, appPurchaseOneTimeCreate returns hardcoded stub GID, oneTimePurchases always [], activeSubscriptions[0].lineItems always []**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-14T05:08:50Z
- **Completed:** 2026-03-14T05:10:51Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Extended billing test file with 4 new RED assertions proving the 3 billing fidelity gaps described in Finding #11
- 3 existing GREEN tests remain unmodified and continue to pass (264 total pass, 4 new RED fail)
- Wave 0 contract established: Plans 02-03 must turn these 4 tests GREEN without regressions
- Failures are meaningful runtime assertions (not compile errors): "expected 0 to be greater than 0" and "Cannot read properties of undefined"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RED assertions for lineItems and oneTimePurchases** - `5181005` (test)

**Plan metadata:** _(pending final docs commit)_

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-api-billing.test.ts` - Added 4 RED Wave 0 billing test assertions (153 lines inserted)

## Decisions Made

- Direct `fetch()` calls to twin's GraphQL endpoint used for `appPurchaseOneTimeCreate` and `currentAppInstallation` queries — the `shopify.billing` SDK helper only wraps `appSubscriptionCreate` / `billing.check` / `billing.cancel`, not one-time purchases
- `(result as any).appSubscription` cast used for `returnObject: true` response — TypeScript SDK types don't expose the full shape but the test validates the runtime structure

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 4 new tests failed as expected at runtime against the live twin. The twin's sandbox socket bind note in STATE.md was outdated; `pnpm test:sdk` ran successfully, confirming the twin is operational.

## Next Phase Readiness

- Plan 37-02 must implement: (1) `line_items TEXT` JSON column on `app_subscriptions` table, (2) resolver fix for `lineItems` in `appSubscriptionCreate` response, (3) persistent `one_time_purchases` table + resolver, (4) `currentAppInstallation.oneTimePurchases` connection
- All 4 RED tests serve as the verification gate for Plans 02-03
- Existing 3 GREEN tests are regression guards (must remain GREEN)

---
*Phase: 37-billing-fidelity-conformance-rigor*
*Completed: 2026-03-14*
