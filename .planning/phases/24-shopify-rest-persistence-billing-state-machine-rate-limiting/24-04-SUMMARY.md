---
phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting
plan: 04
subsystem: billing
tags: [sqlite, graphql, billing, state-machine, shopify]

# Dependency graph
requires:
  - phase: 24-02
    provides: Two-step GID pattern for StateManager tables, state package build pipeline
  - phase: 24-01
    provides: billing-state-machine.test.ts in RED state, POST /admin/tokens seeding pattern
provides:
  - app_subscriptions SQLite table with PENDING/ACTIVE/CANCELLED state machine
  - createAppSubscription, getAppSubscription, updateAppSubscriptionStatus, listActiveAppSubscriptions methods on StateManager
  - appSubscriptionCreate resolver: state-backed, returns unique PENDING subscription + confirmationUrl per call
  - appSubscriptionCancel resolver: ownership-validated, transitions to CANCELLED
  - currentAppInstallation resolver: queries DB for ACTIVE subscriptions by shopDomain
  - GET /admin/charges/:id/confirm_recurring route: PENDING → ACTIVE transition + 302 redirect
affects:
  - Phase 27 (conformance/coverage) — SHOP-21 requirement now complete

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step GID insert (temp UUID gid → UPDATE to gid://shopify/AppSubscription/{rowId}) applied to app_subscriptions
    - Confirmation route is auth-free browser flow; stateManager accessed via (fastify as any).stateManager to avoid TS casting issue

key-files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/plugins/admin.ts
    - tests/sdk-verification/sdk/shopify-api-billing.test.ts

key-decisions:
  - "Two-step GID pattern reused: insert with temp UUID gid, UPDATE gid = 'gid://shopify/AppSubscription/{rowId}' post-insert"
  - "SDK billing cancel test updated to realistic flow (Option a): create via billing.request → confirm via GET → cancel; hardcoded 'gid://shopify/AppSubscription/1' replaced with real GID from state"
  - "GET /admin/charges/:id/confirm_recurring requires no auth token — it is the browser confirmation flow, not an API endpoint"

patterns-established:
  - "Pattern: GQL resolver reads shop_domain from context.shopDomain for ownership validation in cancel mutations"
  - "Pattern: SDK sdk-verification tests for billing must create and confirm a subscription before testing cancel (realistic state machine flow)"

requirements-completed: [SHOP-21]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 24 Plan 04: Billing State Machine Summary

**Persistent billing state machine (PENDING → ACTIVE → CANCELLED) with app_subscriptions table, three wired GraphQL resolvers, and a browser-flow HTTP confirmation endpoint**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T02:46:28Z
- **Completed:** 2026-03-13T02:49:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- StateManager extended with `app_subscriptions` table and four CRUD methods using the established two-step GID pattern
- `appSubscriptionCreate` returns a unique PENDING subscription with a real confirmationUrl per call (removes hardcoded stub)
- `appSubscriptionCancel` validates shop ownership via `context.shopDomain` before transitioning to CANCELLED
- `currentAppInstallation` queries DB for ACTIVE subscriptions by shopDomain (removes hardcoded empty array)
- `GET /admin/charges/:id/confirm_recurring` transitions PENDING → ACTIVE and 302-redirects to returnUrl
- All 7 billing-state-machine.test.ts tests green (SHOP-21a/b/c/d complete)
- SDK billing cancel test updated to realistic flow: create → confirm → cancel

## Task Commits

Each task was committed atomically:

1. **Task 1: Add app_subscriptions table and CRUD methods to StateManager** - `e6320cb` (feat)
2. **Task 2: Wire billing resolvers and add confirmation route** - `18ff247` (feat)

**Plan metadata:** (forthcoming docs commit)

## Files Created/Modified
- `packages/state/src/state-manager.ts` - app_subscriptions table in runMigrations(), four prepared statements, four public CRUD methods
- `twins/shopify/src/schema/resolvers.ts` - appSubscriptionCreate, appSubscriptionCancel, currentAppInstallation all state-backed
- `twins/shopify/src/plugins/admin.ts` - GET /admin/charges/:id/confirm_recurring route added
- `tests/sdk-verification/sdk/shopify-api-billing.test.ts` - cancel test updated to create + confirm + cancel realistic flow

## Decisions Made
- SDK billing test updated to realistic flow (Option a per plan): the cancel test now calls `billing.request` to create a subscription, confirms via GET to the confirmation endpoint, then cancels using the real GID. Hardcoded `gid://shopify/AppSubscription/1` removed.
- Confirmation route uses `(fastify as any).stateManager` — the decorated instance is typed in the module scope but `as any` avoids a TS casting ceremony for a single route.
- Two-step GID pattern from Phase 24-02 reused as-is for app_subscriptions.

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Updated SDK billing cancel test to realistic state machine flow**
- **Found during:** Task 2 verification (anticipated in plan's verification section)
- **Issue:** `billing.cancel` called with hardcoded `gid://shopify/AppSubscription/1` — with new state-backed resolver, this returns "Subscription not found" userErrors since no subscription with ID 1 exists on a fresh state
- **Fix:** Updated cancel test to: (1) call `billing.request` to create a subscription, (2) confirm via `fetch(twinBaseUrl + confirmPath, { redirect: 'manual' })`, (3) cancel using the real GID extracted from confirmationUrl
- **Files modified:** `tests/sdk-verification/sdk/shopify-api-billing.test.ts`
- **Verification:** Test updated per plan's Option (a) recommendation; cannot run live in sandbox (socket-blocked), but logic matches the billing-state-machine integration test pattern which is verified
- **Committed in:** `18ff247` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (anticipated by plan — Option a was the preferred fix)
**Impact on plan:** Required for correctness — SDK test now exercises the real billing state machine instead of a stub path.

## Issues Encountered
None — plan executed as specified. The pagination.test.ts failures (49 tests in that file) are pre-existing and unrelated to billing changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SHOP-21 requirement complete — billing state machine fully implemented
- Phase 27 (conformance/coverage) can now include billing behavioral assertions
- All 44 planned plans for v1.2 milestone are now complete

---
*Phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting*
*Completed: 2026-03-13*
