---
phase: 09-code-quality-cleanup
plan: 01
subsystem: state, ui, testing
tags: [sqlite, prepared-statements, vitest, polling, dead-letter-queue]

# Dependency graph
requires:
  - phase: 06-twin-uis
    provides: UI plugins with direct SQL customer/user update handlers
  - phase: 03-webhook-system
    provides: WebhookQueue with DLQ and compressed timing
provides:
  - updateCustomer method on StateManager
  - updateUser method on SlackStateManager
  - Reliable DLQ integration tests with polling
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StateManager prepared statement lifecycle: declare, prepare, method, nullify in reset+close"
    - "SlackStateManager fetch-then-merge update pattern with prepared statements"
    - "DLQ polling pattern with privileged port for guaranteed ECONNREFUSED"

key-files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - twins/slack/src/state/slack-state-manager.ts
    - twins/shopify/src/plugins/ui.ts
    - twins/slack/src/plugins/ui.ts
    - twins/shopify/test/integration.test.ts

key-decisions:
  - "Use 127.0.0.1:1 instead of localhost:9999 for DLQ tests — port 1 requires root privileges, guaranteeing ECONNREFUSED regardless of what processes are running on the machine"
  - "DLQ tests use polling with 50ms interval and 10s deadline instead of fixed setTimeout(600) — eliminates race conditions under CI load and dev environment variability"
  - "Added explicit 15s test timeouts for DLQ tests that involve async webhook retry cycles"

patterns-established:
  - "Privileged port URL pattern for guaranteed-failure webhook tests: http://127.0.0.1:1/webhook"

requirements_completed: []

# Metrics
duration: 12min
completed: 2026-02-28
---

# Phase 9, Plan 01: Code Quality Cleanup Summary

**StateManager updateCustomer/updateUser methods replace direct SQL in both twin UIs, DLQ tests fixed with polling and guaranteed-fail URL**

## Performance

- **Duration:** 12 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `updateCustomer()` to StateManager and `updateUser()` to SlackStateManager with full prepared statement lifecycle
- Migrated Shopify and Slack UI handlers from direct SQL to StateManager API calls
- Fixed flaky DLQ tests with polling loops and reliable failure URL (127.0.0.1:1)
- Deleted stale webhook-sender dist artifacts containing console.error
- All 237 monorepo tests pass reliably

## Task Commits

Each task was committed atomically:

1. **Task 1: Add StateManager methods, migrate UI, delete stale dist** - `5ff5efd` (feat)
2. **Task 2: Fix flaky DLQ timing tests with polling** - `de394be` (fix)

## Files Created/Modified
- `packages/state/src/state-manager.ts` - Added updateCustomer() with prepared statement lifecycle
- `twins/slack/src/state/slack-state-manager.ts` - Added updateUser() with fetch-then-merge pattern
- `twins/shopify/src/plugins/ui.ts` - Replaced direct SQL with stateManager.updateCustomer()
- `twins/slack/src/plugins/ui.ts` - Replaced direct SQL with slackStateManager.updateUser()
- `twins/shopify/test/integration.test.ts` - Replaced setTimeout with polling, localhost:9999 with 127.0.0.1:1

## Decisions Made
- Used 127.0.0.1:1 (privileged port) instead of localhost:9999 for DLQ webhook tests — root finding was that `nc` processes on dev machines could be listening on port 9999, causing webhook deliveries to succeed instead of fail
- Added explicit per-test timeout overrides (15s) for DLQ tests that involve async retry cycles with polling
- Followed existing updateProduct/updateChannel patterns exactly for new methods to maintain codebase consistency

## Deviations from Plan

### Auto-fixed Issues

**1. [Root Cause Fix] DLQ test URL changed from localhost:9999 to 127.0.0.1:1**
- **Found during:** Task 2 (DLQ timing test fix)
- **Issue:** Original test used localhost:9999 assuming nothing would listen there. Investigation revealed the test was already broken (fails 100% in isolation) because `nc` or other processes can listen on port 9999 in dev environments, making the webhook delivery succeed instead of fail. The original setTimeout(600) approach masked this by relying on timing from other parallel tests.
- **Fix:** Changed URL to 127.0.0.1:1 (privileged port requiring root, guaranteed ECONNREFUSED) and added explicit DLQ subscription within the DLQ test itself rather than relying on the Webhooks describe block's beforeEach subscriptions
- **Files modified:** twins/shopify/test/integration.test.ts
- **Verification:** Test passes reliably both in isolation (-t flag) and in full suite
- **Committed in:** de394be

---

**Total deviations:** 1 auto-fixed (root cause fix for test reliability)
**Impact on plan:** Essential for correctness. The plan specified replacing setTimeout with polling, but the root cause was the unreliable URL, not just the wait strategy.

## Issues Encountered
- DLQ test was already failing 100% when run in isolation (not just flaky) — the original setTimeout(600) approach only worked when other tests ran first and provided enough event loop delay. Root cause investigation revealed port 9999 had listeners in dev environment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All v1.0 tech debt items resolved
- Codebase follows consistent StateManager patterns
- All 237 tests pass reliably

---
*Phase: 09-code-quality-cleanup*
*Completed: 2026-02-28*
