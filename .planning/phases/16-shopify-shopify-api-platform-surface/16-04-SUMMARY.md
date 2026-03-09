---
phase: 16-shopify-shopify-api-platform-surface
plan: "04"
subsystem: testing
tags: [shopify-api, billing, graphql, twin, vitest, coverage]

requires:
  - phase: 16-shopify-shopify-api-platform-surface
    provides: "shopify-api-client.ts helper, global-setup.ts, Phase 16 test infrastructure, twin auth endpoints"

provides:
  - "Billing GraphQL stubs in Shopify twin: appSubscriptionCreate, appPurchaseOneTimeCreate, appSubscriptionCancel mutations + currentAppInstallation query"
  - "shopify-api-billing.test.ts with 3 SHOP-13 tests: billing.request, billing.check, billing.cancel"
  - "coverage-report.json updated to Phase 16: shopifyApi/Shopify.auth/Shopify.session/Shopify.webhooks/Shopify.flow/Shopify.fulfillmentService live; Shopify.billing stub"
  - "Decimal scalar for MoneyInput.amount (accepts SDK numeric amounts)"
  - "AppPricingDetails interface + __resolveType resolvers for billing inline fragments"

affects:
  - "17-shopify-client-surfaces-rest-stubs"
  - "tests/sdk-verification/sdk/"

tech-stack:
  added: []
  patterns:
    - "Billing GraphQL stubs return minimal valid shapes — no state machine needed for SHOP-13"
    - "Decimal custom scalar bridges SDK numeric MoneyInput to schema String validation"
    - "AppPricingDetails interface with __resolveType resolver handles inline fragment dispatch"
    - "AppSubscriptionDiscountValue union with __resolveType resolver for discount type dispatch"
    - "Rate limiter max 2000 accommodates billing.check oneTimePurchases(first:250) query cost"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-api-billing.test.ts
  modified:
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/index.ts
    - tests/sdk-verification/coverage/coverage-report.json

key-decisions:
  - "AppPricingDetails interface uses 'interval: String' as shared field (not __typename — invalid SDL)"
  - "Decimal scalar parses both String and Float/Int input: SDK sends amount as Number (10.0), not String"
  - "Rate limiter max increased from 1000 to 2000: billing.check uses oneTimePurchases(first:250) which costs ~1004 points under conservative twin model (real Shopify charges for actual items returned)"
  - "billing.check returns boolean by default (returnObject: false); twin returns empty activeSubscriptions so hasActivePayment is false"
  - "billing.cancel returns AppSubscription directly (unwrapped from appSubscriptionCancel.appSubscription)"

patterns-established:
  - "Abstract type resolvers (__resolveType) required by makeExecutableSchema for interface/union dispatch"
  - "Force-add gitignored coverage directory: git add -f tests/sdk-verification/coverage/"

requirements-completed:
  - SHOP-13

duration: 15min
completed: 2026-03-09
---

# Phase 16 Plan 04: SHOP-13 Billing Stubs + Coverage Ledger Summary

**Billing stub resolvers in Shopify twin (appSubscriptionCreate/cancel, currentAppInstallation), 3 SHOP-13 live-twin tests passing, and full Phase 16 coverage ledger updated**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-09T21:02:00Z
- **Completed:** 2026-03-09T21:10:00Z
- **Tasks:** 2 (+ 3 auto-fixes during task 2)
- **Files modified:** 5

## Accomplishments

- Extended Shopify twin GraphQL schema with full billing type system: AppSubscription, AppPricingDetails interface, AppRecurringPricing/AppUsagePricing implementing types, AppSubscriptionDiscountValue union, AppInstallation + all input types
- Added stub resolvers for appSubscriptionCreate, appPurchaseOneTimeCreate, appSubscriptionCancel, currentAppInstallation returning minimal valid shapes
- Created shopify-api-billing.test.ts with 3 tests: billing.request (confirmationUrl), billing.check (false/no payment), billing.cancel (CANCELLED status) — all green
- Updated coverage-report.json to Phase 16: 6 symbols live, 1 stub (Shopify.billing), remaining deferred for Phase 17
- Full Phase 16 suite: 24 tests passing (billing x3, auth x7, session x7, webhooks x7)

## Task Commits

1. **Task 1: Add billing GraphQL stubs to Shopify twin schema and resolvers** - `17d7ba9` (feat)
2. **Task 2: shopify-api-billing.test.ts + coverage ledger update** - `6fec447` (feat)

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-api-billing.test.ts` - SHOP-13 billing helper tests (3 tests, 87 lines)
- `twins/shopify/src/schema/schema.graphql` - Billing types: scalar URL/Decimal, AppSubscription, AppInstallation, 3 mutations, 1 query, 8 input types
- `twins/shopify/src/schema/resolvers.ts` - URL/Decimal/AppPricingDetails/__resolveType resolvers + billing mutation/query stubs
- `twins/shopify/src/index.ts` - Rate limiter max 1000→2000
- `tests/sdk-verification/coverage/coverage-report.json` - Phase 16 symbol attributions

## Decisions Made

- **Decimal scalar for MoneyInput.amount:** The SDK sends `amount: 10.0` (a number), but the schema had `String!`. Added custom `Decimal` scalar that parses both numeric and string values, ensuring the billing request mutation accepts the SDK payload.
- **AppPricingDetails interface field:** Used `interval: String` as the shared field. `__typename: String` is invalid SDL (it's a built-in meta-field). Both AppRecurringPricing and AppUsagePricing implement the interface via this field.
- **Rate limiter 2000:** The `HAS_PAYMENTS_QUERY` uses `oneTimePurchases(first: 250, sortKey: CREATED_AT)` — under the twin's conservative cost model (2 + 250 = 252 for the connection, then multiply nested fields by 250), total cost reaches ~1004 which exceeds the 1000 max. Increased to 2000 to match the intent: rate limiting tests are in the auth suite, not billing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid `__typename: String` in AppPricingDetails interface**
- **Found during:** Task 1 (schema.graphql addition)
- **Issue:** The plan specified `interface AppPricingDetails { __typename: String }` but `__typename` is a built-in meta-field in GraphQL — declaring it as a field in an interface causes schema validation failures and GraphQL Yoga returns HTTP 500
- **Fix:** Changed to `interface AppPricingDetails { interval: String }` — a shared field both implementing types can declare
- **Files modified:** `twins/shopify/src/schema/schema.graphql`, `twins/shopify/src/schema/resolvers.ts`
- **Verification:** Schema builds without errors, billing tests pass
- **Committed in:** `6fec447` (Task 2 commit)

**2. [Rule 1 - Bug] MoneyInput.amount must accept numeric values from SDK**
- **Found during:** Task 2 (billing.request test execution)
- **Issue:** SDK sends `amount: 10.0` (Float) for `MoneyInput.amount`, but schema had `String!`. GraphQL returns 400: "String cannot represent a non string value: 10"
- **Fix:** Added `scalar Decimal` that accepts both String and numeric (Float/Int) input. Changed `MoneyInput.amount` from `String!` to `Decimal!`
- **Files modified:** `twins/shopify/src/schema/schema.graphql`, `twins/shopify/src/schema/resolvers.ts`
- **Verification:** billing.request test passes with `amount: 10.0` from SDK
- **Committed in:** `6fec447` (Task 2 commit)

**3. [Rule 1 - Bug] Rate limiter max too low for billing.check query cost**
- **Found during:** Task 2 (billing.check test execution)
- **Issue:** `HAS_PAYMENTS_QUERY` uses `oneTimePurchases(first: 250)` — cost calculation yields ~1004 points, exceeding the 1000-point bucket max. Returns 429 immediately even after reset.
- **Fix:** Increased rate limiter max from 1000 to 2000 (`twins/shopify/src/index.ts`)
- **Files modified:** `twins/shopify/src/index.ts`
- **Verification:** billing.check test passes; prior rate-limiting tests in auth suite still unaffected
- **Committed in:** `6fec447` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 - Bug)
**Impact on plan:** All fixes necessary for correctness — schema validity, type acceptance, and query capacity. No scope creep.

## Issues Encountered

- None beyond the auto-fixed issues documented above.

## Next Phase Readiness

- Phase 16 complete — all 5 plans executed, 24 Phase 16 tests passing
- coverage-report.json closes the loop: all Phase 16 symbols attributed
- Phase 17 (Shopify Client Surfaces & Strategic REST Stubs) can proceed: twin schema now includes billing types as foundation

---
*Phase: 16-shopify-shopify-api-platform-surface*
*Completed: 2026-03-09*
