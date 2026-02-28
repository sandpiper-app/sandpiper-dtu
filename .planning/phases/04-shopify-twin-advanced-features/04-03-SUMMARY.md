---
phase: 04-shopify-twin-advanced-features
plan: 03
subsystem: api
tags: [graphql, state-machine, sqlite, shopify-twin, order-lifecycle, fulfillment]

# Dependency graph
requires:
  - phase: 04-shopify-twin-advanced-features
    provides: "Plan 04-02: cursor pagination, paginate() helper, id ASC ordering"
  - phase: 02-shopify-twin-core
    provides: "StateManager with orders table, createOrder/getOrder methods, fulfillmentCreate resolver"
provides:
  - "validateFulfillment() and validateClose() state machine validators in twins/shopify/src/services/order-lifecycle.ts"
  - "display_fulfillment_status, display_financial_status, closed_at columns on orders table"
  - "updateOrderFulfillmentStatus(), updateOrderFinancialStatus(), closeOrder() StateManager methods"
  - "OrderDisplayFulfillmentStatus and OrderDisplayFinancialStatus enums in schema"
  - "displayFulfillmentStatus, displayFinancialStatus, closedAt fields on Order GraphQL type"
  - "orderClose mutation with precondition validation (FULFILLED + PAID/PARTIALLY_REFUNDED/REFUNDED)"
  - "fulfillmentCreate now validates lifecycle and updates parent order status to FULFILLED"
  - "Both fulfillmentCreate and orderClose trigger orders/update webhook on state change"
  - "financialStatus optional field on OrderInput for test-specific financial state seeding"
affects:
  - "05-slack-twin (order lifecycle pattern applicable to Slack conversation state machine)"
  - "conformance suites (state transition validation behavior now testable)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State machine validation: pure functions returning null (allowed) or error string (rejected) — no exceptions thrown for business rule violations"
    - "Enum-gated mutation preconditions: validateFulfillment/validateClose checked before any DB writes; entire operation rejected on validation failure"
    - "Webhook fan-out on state transition: orders/update enqueued after both fulfillmentCreate and orderClose status changes"
    - "Test seeding via financialStatus enum on OrderInput: tests can preset financial state without a payment flow"

key-files:
  created:
    - twins/shopify/src/services/order-lifecycle.ts
    - twins/shopify/tests/services/order-lifecycle.test.ts
    - twins/shopify/tests/integration/order-lifecycle.test.ts
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/db/schema.sql
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/schema/resolvers.ts

key-decisions:
  - "State machine as pure functions: validateFulfillment/validateClose return string|null — simpler than exceptions, composable in tests"
  - "Reject entire fulfillmentCreate on invalid transition: twin's simplified model does not allow partial fulfillments when validation fails (unlike real Shopify)"
  - "financialStatus seeding via OrderInput enum: allows integration tests to reach PAID state without implementing payment flow"
  - "StateManager dist rebuild required: @dtu/state exports compiled JS so `pnpm build` needed before tests see new columns"
  - "closedAt priority in validateClose: checked before fulfillment status so already-closed orders return specific error regardless of other state"

patterns-established:
  - "State transition validator pattern: pure function (order: { statusFields }) => string | null — use for future resource lifecycle (e.g. Slack channel archive)"
  - "Orders/update webhook triggered by any order state change (fulfillment OR close) — reflects real Shopify behavior"

requirements-completed:
  - SHOP-06

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 4 Plan 03: Order Lifecycle State Machine Summary

**Stateful order lifecycle with validateFulfillment/validateClose pure-function validators, three new order status columns, orderClose mutation, and orders/update webhook on state transitions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-28T06:17:32Z
- **Completed:** 2026-02-28T06:25:50Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Order lifecycle state machine service with pure-function validators for fulfillment and close transitions
- StateManager extended with display_fulfillment_status, display_financial_status, closed_at columns and three new methods
- orderClose GraphQL mutation validates preconditions (FULFILLED + PAID/PARTIALLY_REFUNDED/REFUNDED) before closing
- fulfillmentCreate now validates transition before creating fulfillment, updates parent order status, and triggers orders/update webhook
- 23 new tests (16 unit + 7 integration), bringing suite from 88 to 111 tests; all 140 monorepo tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create order lifecycle service and extend StateManager with status columns** - `896d893` (feat)
2. **Task 2: Add orderClose mutation, update schema, and wire fulfillmentCreate to update order status** - `b7a723a` (feat)

**Plan metadata:** _pending final docs commit_

## Files Created/Modified

- `twins/shopify/src/services/order-lifecycle.ts` - validateFulfillment() and validateClose() pure state machine validators with exported FulfillmentStatus and FinancialStatus type aliases
- `packages/state/src/state-manager.ts` - New columns (display_fulfillment_status DEFAULT UNFULFILLED, display_financial_status DEFAULT PENDING, closed_at), new methods (updateOrderFulfillmentStatus, updateOrderFinancialStatus, closeOrder), financial_status param on createOrder
- `twins/shopify/src/db/schema.sql` - Documentation updated to match new orders table columns
- `twins/shopify/src/schema/schema.graphql` - OrderDisplayFulfillmentStatus + OrderDisplayFinancialStatus enums, displayFulfillmentStatus/displayFinancialStatus/closedAt on Order type, OrderCloseInput, OrderClosePayload, orderClose mutation, financialStatus on OrderInput
- `twins/shopify/src/schema/resolvers.ts` - Import validateFulfillment/validateClose, Order type resolvers for new fields, fulfillmentCreate updated with validation + status update + orders/update webhook, orderClose mutation resolver, orderCreate passes financialStatus
- `twins/shopify/tests/services/order-lifecycle.test.ts` - 16 unit tests covering all validateFulfillment and validateClose paths
- `twins/shopify/tests/integration/order-lifecycle.test.ts` - 7 integration tests: happy path, 4 invalid transition scenarios, and 2 webhook delivery tests using DLQ verification

## Decisions Made

- **State machine as pure functions:** validateFulfillment/validateClose return `string | null` — no exceptions for business rule violations. Simpler to test, compose, and reason about.
- **Reject entire fulfillmentCreate on invalid transition:** Twin's simplified model rejects the whole operation with userErrors (no fulfillment created) rather than allowing partial fulfillment records when validation fails. This is a deliberate simplification vs. real Shopify behavior.
- **financialStatus seeding via OrderInput enum:** Tests can set PAID financial status at order creation time, bypassing a payment flow that doesn't exist in the twin. Required for close-lifecycle tests.
- **StateManager dist rebuild required:** `@dtu/state` is consumed as compiled JS from `dist/`. After adding new columns and methods, `pnpm --filter @dtu/state build` was needed for integration tests to pick up the changes.
- **closedAt checked first in validateClose:** Gives a specific "already closed" error before checking fulfillment status, matching priority expectations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt @dtu/state compiled output before integration tests**
- **Found during:** Task 2 verification (integration tests)
- **Issue:** Integration tests import `@dtu/state` from `packages/state/dist/state-manager.js` (compiled output). After adding new columns and methods to the TypeScript source, the compiled JS was stale — integration tests saw the old schema without status columns, causing `displayFinancialStatus` to always return `PENDING` regardless of input.
- **Fix:** Ran `pnpm --filter @dtu/state build` to recompile before running integration tests.
- **Files modified:** `packages/state/dist/state-manager.js` (and associated .map/.d.ts files)
- **Verification:** All 7 integration tests passed after rebuild
- **Committed in:** Part of Task 1 commit `896d893` (TypeScript source); dist rebuild is a build artifact not committed

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The stale dist issue is a recurring pattern for the @dtu/state package — any change to StateManager requires a rebuild before the shopify twin tests can see it. No scope creep.

## Issues Encountered

- `@dtu/state` dist stale after source changes: integration tests imported the compiled JS which had the old schema. Resolved by rebuilding the package. This will be a recurrent issue whenever StateManager is modified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Order lifecycle fully operational: create (UNFULFILLED/PENDING) -> fulfill (FULFILLED) -> close (closedAt set)
- Invalid state transitions return GraphQL userErrors (not crashes or silent failures)
- Both state changes (fulfill and close) trigger orders/update webhook delivery
- Test suite at 111/111 pass (8 test files including 2 new lifecycle test files)
- All 140 monorepo tests pass
- Ready for Phase 4 completion or Phase 5 (Slack twin)

## Self-Check: PASSED

All created files exist on disk. All task commits verified in git log. Full test suite (111/111 shopify + 140/140 monorepo) passes.

---
*Phase: 04-shopify-twin-advanced-features*
*Completed: 2026-02-28*
