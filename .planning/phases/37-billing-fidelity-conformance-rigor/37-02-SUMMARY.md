---
phase: 37-billing-fidelity-conformance-rigor
plan: 02
subsystem: api
tags: [shopify-billing, graphql, sqlite, state-manager, one-time-purchases, line-items]

# Dependency graph
requires:
  - phase: 37-billing-fidelity-conformance-rigor
    plan: 01
    provides: 4 RED Wave 0 tests proving billing lineItems + oneTimePurchases gaps

provides:
  - line_items JSON column on app_subscriptions table (idempotent migration)
  - one_time_purchases SQLite table with CRUD methods
  - createOneTimePurchase() + listOneTimePurchasesByShop() on StateManager
  - lineItems parsed and returned in appSubscriptionCreate + appSubscriptionCancel + currentAppInstallation
  - appPurchaseOneTimeCreate replaces hardcoded stub with real persistent records
  - currentAppInstallation.oneTimePurchases returns real data from DB
  - CurrencyCode scalar that accepts both string ("USD") and enum literal (USD) syntax

affects:
  - 37-03 (conformance rigor — billing resolvers now return real data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CurrencyCode scalar with parseLiteral handling both Kind.STRING and Kind.ENUM — required for Shopify API enum-style currency inputs"
    - "Two-step GID pattern for one_time_purchases: insert temp GID, UPDATE to final GID after AUTOINCREMENT resolves"
    - "Idempotent ALTER TABLE migration for app_subscriptions.line_items column"
    - "JSON.parse(row.line_items) in resolver — same pattern as orders table"

key-files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/schema/schema.graphql
    - tests/sdk-verification/sdk/shopify-api-billing.test.ts

key-decisions:
  - "CurrencyCode scalar added (accepts both string and enum literal) — MoneyInput.currencyCode: String! was rejecting USD (enum literal) at GraphQL validation level; scalar with parseLiteral Kind.ENUM support fixes this without changing existing tests"
  - "Test assertion fixed from not.toBe('/1') to toMatch(regex) — after reset, first one-time purchase legitimately gets row ID 1; the uniqueness check (second call differs from first) is the real persistence proof"
  - "lineItems transform: input shape { plan: { appRecurringPricingDetails: { interval, amount, currencyCode } } } mapped to output { id, plan: { pricingDetails: { interval, price: { amount, currencyCode } } } } matching AppSubscriptionLineItem SDL"

patterns-established:
  - "lineItems mapping pattern: storedItems.map((item, idx) => ({ id: gid/LineItem/${idx+1}, plan: { pricingDetails: { interval, price } } })) — consistent across create/cancel/currentAppInstallation"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-14
---

# Phase 37 Plan 02: Billing Fidelity Implementation Summary

**lineItems stored in app_subscriptions and surfaced in all billing resolvers; appPurchaseOneTimeCreate replaced with real persistent one_time_purchases table using two-step GID pattern; CurrencyCode scalar added to accept enum-literal USD syntax**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-14T01:12:06Z
- **Completed:** 2026-03-14T01:20:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- StateManager extended with `line_items TEXT` column migration, `one_time_purchases` table, `createOneTimePurchase()` + `listOneTimePurchasesByShop()` methods
- All 4 billing fidelity gaps from Wave 0 (Plan 01) turned GREEN: lineItems non-empty, appPurchaseOneTimeCreate persistent, oneTimePurchases connection returns real data, activeSubscriptions[0].lineItems non-empty
- 268/268 tests passing (264 pre-existing + 4 new from Plan 01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend StateManager — line_items column + one_time_purchases table + CRUD methods** - `5ac5b99` (feat)
2. **Task 2: Fix billing resolvers — real lineItems + persistent one-time purchases** - `5c39bde` (feat)

**Plan metadata:** _(pending final docs commit)_

## Files Created/Modified

- `packages/state/src/state-manager.ts` - Added line_items migration, one_time_purchases DDL, createOneTimePurchase/listOneTimePurchasesByShop methods, updated createAppSubscription signature
- `twins/shopify/src/schema/resolvers.ts` - CurrencyCode scalar, lineItems parsing in 3 resolvers, real appPurchaseOneTimeCreate, real currentAppInstallation.oneTimePurchases
- `twins/shopify/src/schema/schema.graphql` - scalar CurrencyCode, MoneyV2.currencyCode and MoneyInput.currencyCode use CurrencyCode type
- `tests/sdk-verification/sdk/shopify-api-billing.test.ts` - Fixed test assertion from not.toBe('/1') to regex match for GID format

## Decisions Made

- **CurrencyCode scalar**: `MoneyInput.currencyCode: String!` was rejecting `currencyCode: USD` (enum literal) with "String cannot represent a non string value: USD". Added `CurrencyCode` scalar with `parseLiteral` accepting both `Kind.STRING` and `Kind.ENUM`. This is consistent with Shopify's real API which uses a `CurrencyCode` enum.

- **Test assertion fix**: The Wave 0 test had `expect(id).not.toBe('gid://shopify/AppPurchaseOneTime/1')` which fails after a reset (first insert legitimately gets row ID 1). Changed to `expect(id).toMatch(/^gid:\/\/shopify\/AppPurchaseOneTime\/\d+$/)`. The real persistence proof is the second assertion (two calls return different IDs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CurrencyCode scalar missing from schema**
- **Found during:** Task 2 (Fix billing resolvers)
- **Issue:** `MoneyInput.currencyCode: String!` rejects `USD` (GraphQL enum literal) with GRAPHQL_VALIDATION_FAILED — resolver never executed; response had `{ errors: [...] }` with no `data` key
- **Fix:** Added `scalar CurrencyCode` to schema.graphql; added `CurrencyCodeScalar` in resolvers.ts with `parseLiteral` handling both `Kind.STRING` and `Kind.ENUM`; changed MoneyV2 and MoneyInput to use `CurrencyCode` type
- **Files modified:** `twins/shopify/src/schema/schema.graphql`, `twins/shopify/src/schema/resolvers.ts`
- **Verification:** `pnpm test:sdk` 268/268 GREEN
- **Committed in:** `5c39bde` (Task 2 commit)

**2. [Rule 1 - Bug] Test assertion incorrect — not.toBe('/1') fails after reset**
- **Found during:** Task 2 (Fix billing resolvers — test verification)
- **Issue:** After `resetShopify()`, first `appPurchaseOneTimeCreate` call legitimately gets row ID 1 (AUTOINCREMENT starts at 1 on fresh table), so `not.toBe('gid://shopify/AppPurchaseOneTime/1')` fails
- **Fix:** Changed assertion to `toMatch(/^gid:\/\/shopify\/AppPurchaseOneTime\/\d+$/)` — verifies GID format without assuming a specific numeric ID; real uniqueness proof is the second assertion (two calls return different IDs)
- **Files modified:** `tests/sdk-verification/sdk/shopify-api-billing.test.ts`
- **Verification:** `pnpm test:sdk` 268/268 GREEN
- **Committed in:** `5c39bde` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes necessary for the RED tests to turn GREEN. No scope creep — both directly caused by the task's changes being tested.

## Issues Encountered

- The Plan 01 summary described the billing test failures as "stub returned hardcoded GID" but the actual failure was "GraphQL validation failed (String cannot represent a non string value: USD)" — the schema had `currencyCode: String!` but tests use `currencyCode: USD` (enum literal). The old resolver's `_args: unknown` (ignoring args) masked this because Yoga still returned a response without executing the resolver. Fixed by adding CurrencyCode scalar.

## Next Phase Readiness

- Plan 37-03 (conformance rigor — Finding #12) can proceed; billing resolvers now return real data that conforms to Shopify's schema
- All 268 SDK tests GREEN
- Finding #11 fully resolved: lineItems and oneTimePurchases now have real data

## Self-Check: PASSED

All files and commits verified present.

---
*Phase: 37-billing-fidelity-conformance-rigor*
*Completed: 2026-03-14*
