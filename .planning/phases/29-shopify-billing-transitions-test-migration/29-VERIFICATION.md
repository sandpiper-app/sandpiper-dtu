---
phase: 29-shopify-billing-transitions-test-migration
verified: 2026-03-13T16:40:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 29: Shopify Billing Transitions & Test Migration Verification Report

**Phase Goal:** Shopify billing state machine validates legal state transitions (rejecting PENDING→CANCELLED and double-cancel) and legacy integration tests are migrated from old OAuth pattern to POST /admin/tokens.
**Verified:** 2026-03-13T16:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `appSubscriptionCancel` on PENDING subscription returns userErrors + appSubscription: null | VERIFIED | billing-state-machine.test.ts line 346; test passes (9/9 GREEN) |
| 2 | `appSubscriptionCancel` on CANCELLED subscription returns userErrors + appSubscription: null | VERIFIED | billing-state-machine.test.ts line 381; test passes (9/9 GREEN) |
| 3 | All 9 billing-state-machine.test.ts tests pass | VERIFIED | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` → 9 passed |
| 4 | All 45 tests in integration.test.ts pass | VERIFIED | `pnpm vitest run` → 45 passed (45) |
| 5 | All non-pre-existing tests in pagination.test.ts pass | VERIFIED | 8/8 originally-present tests pass; 6 failing are intentional future-RED tests added in Phase 28 (SHOP-23/SHOP-17, commit 3b5b335) |
| 6 | All 7 tests in order-lifecycle.test.ts pass | VERIFIED | 7 passed (7) |
| 7 | All 5 tests in rate-limit.test.ts pass | VERIFIED | 5 passed (5) |
| 8 | No regressions in previously-passing Shopify twin suites | VERIFIED | 10 of 11 test files pass; the 1 failing file (pagination.test.ts) fails only on pre-existing future-RED tests that were already failing before Phase 29 |

**Score:** 8/8 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/test/integration/billing-state-machine.test.ts` | 9 billing state machine tests including SHOP-21e/21f describe block | VERIFIED | File has 9 tests total; `describe('SHOP-21e/21f — appSubscriptionCancel rejects illegal state transitions')` at line 345 |
| `twins/shopify/src/schema/resolvers.ts` | `appSubscriptionCancel` resolver with `subscription.status !== 'ACTIVE'` guard | VERIFIED | Guard present at line 849; returns `userErrors: [{ field: ['id'], message: 'Only ACTIVE subscriptions can be cancelled' }]` |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/test/integration.test.ts` | Uses `seedToken()` + `POST /admin/tokens`; OAuth describe uses full authorize flow | VERIFIED | `seedToken()` defined at lines 21–32; all `beforeEach` blocks use it; OAuth describe at lines 52–98 uses full authorize flow |
| `twins/shopify/test/integration/pagination.test.ts` | `beforeEach` uses `POST /admin/tokens` | VERIFIED | Lines 83–88 inject directly to `/admin/tokens` with `randomUUID()` |
| `twins/shopify/tests/integration/order-lifecycle.test.ts` | `getToken()` replaced with `seedToken()` using `POST /admin/tokens` | VERIFIED | `seedToken()` defined at lines 28–40; `beforeEach` calls it |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `billing-state-machine.test.ts` SHOP-21e/21f tests | `resolvers.ts appSubscriptionCancel` | GraphQL mutation `appSubscriptionCancel` with PENDING/CANCELLED subscription GID | WIRED | Test sends mutation; resolver guard at line 849 rejects non-ACTIVE subscriptions; 9/9 GREEN confirms end-to-end wiring |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `integration.test.ts` GraphQL API describe `beforeEach` | `POST /admin/tokens` | inline token seeding replacing `/admin/oauth/access_token` | WIRED | `seedToken(app)` called in `beforeEach` at line 179; all 45 tests pass |
| `rate-limit.test.ts` throttling test | fixtures with `currency_code` | order fixture payload | NOTE | `currency_code` NOT added to rate-limit.test.ts (lines 131–135 lack it); however plan instructions say "skip if all 5 pass" — all 5 passed without the fix, confirming the summary's claim that this file needed no changes |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| SHOP-21 | 29-01, 29-02 | Shopify billing implements state machine: PENDING→ACTIVE→CANCELLED transitions; cancel validates ownership | SATISFIED | 9/9 billing-state-machine tests GREEN including new SHOP-21e (PENDING cancel rejected) and SHOP-21f (double-cancel rejected); REQUIREMENTS.md marks SHOP-21 `[x]` Complete; traceability table: `Phase 24, 29 | Complete` |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps only SHOP-21 to Phase 29. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `29-01-SUMMARY.md` | 67 | Wrong commit hash: Task 1 commit cited as `4a106f4` (a Phase 30 Slack commit); actual commit for RED tests is `e6337e3` | Info | Documentation error only; code is correct, tests are in git at `e6337e3` |
| `29-02-PLAN.md` | 19 | SUMMARY says "8/8 pagination (previously-passing)" but PLAN's truth claims "All 10 tests in pagination.test.ts pass (was 10 failing)" | Info | Plan was written before Phase 28 added 6 future-RED tests to pagination.test.ts (commit `3b5b335`); the 8 pass / 6 intentional-red outcome is correct and the SUMMARY acknowledges this |
| `twins/shopify/test/integration/rate-limit.test.ts` | 131–135 | 250-order fixture lacks `gid` and `currency_code` fields | Warning | Plan planned to add these but executor correctly skipped the change because all 5 rate-limit tests passed without it; the `currency_code` fix was conditional on failure |

No blockers found.

---

## Pagination Test Count Clarification

The PLAN 02 truth states "All 10 tests in pagination.test.ts pass (was 10 failing)". The actual count is 14 tests total (8 pass, 6 fail). This discrepancy is explained:

- Phase 28 (commit `3b5b335` — "migrate OAuth seeding and add failing REST/version policy tests") added 6 future-RED tests for SHOP-23 (REST cursor pagination) and SHOP-17 (version policy) to pagination.test.ts **after** Phase 29's plan was written.
- The comment in the file at line 343 explicitly marks these: `// RED until Plan 02`.
- The Phase 29 SUMMARY correctly documents: "6 pre-existing RED tests in pagination.test.ts (REST cursor pagination SHOP-23 + version policy SHOP-17) are out-of-scope; they were added by plan 29-01 as future RED tests."
- These 6 tests are for requirements that are out-of-scope for Phase 29 and are addressed in later phases.

The phase goal did not include making SHOP-23 REST cursor pagination or SHOP-17 version policy tests pass. The 8 tests that **were** failing due to the broken OAuth pattern (and were in scope for Phase 29) all pass.

---

## Human Verification Required

None. All behavioral claims are verifiable by running the test suite, which was done during this verification.

---

## Overall Assessment

Phase 29 achieved its stated goal:

1. **Billing state machine transition guards**: The `appSubscriptionCancel` resolver now correctly rejects cancel requests on non-ACTIVE subscriptions. The status guard (`subscription.status !== 'ACTIVE'`) is in place at resolvers.ts line 849. Tests SHOP-21e and SHOP-21f document and verify the rejection behavior. All 9 billing-state-machine tests are GREEN.

2. **Legacy OAuth test migration**: All integration test files that were failing due to the Phase 23 OAuth tightening are now migrated to `POST /admin/tokens`. The `seedToken()` helper pattern is consistently applied. integration.test.ts (45/45), order-lifecycle.test.ts (7/7), and rate-limit.test.ts (5/5) are all GREEN.

3. **SHOP-21 requirement**: Fully satisfied. REQUIREMENTS.md marks it `[x]` Complete with Phase 24 and 29 as delivering phases. All 6 billing behaviors (21a–21f) are covered by tests.

The only failing tests in the full suite (6 in pagination.test.ts) are intentional future-RED tests for SHOP-23 and SHOP-17 that were added by Phase 28 and are explicitly out of scope for Phase 29.

---

_Verified: 2026-03-13T16:40:00Z_
_Verifier: Claude (gsd-verifier)_
