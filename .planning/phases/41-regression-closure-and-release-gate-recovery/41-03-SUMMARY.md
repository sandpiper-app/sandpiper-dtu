---
phase: 41-regression-closure-and-release-gate-recovery
plan: "03"
subsystem: shopify-twin
tags:
  - shopify
  - api-version
  - oauth
  - rest
  - graphql
  - state-manager
  - regression-closure
dependency_graph:
  requires:
    - "41-01"
    - "41-02"
  provides:
    - shopify-api-version-enforcement
    - shopify-offline-oauth-shapes
    - shopify-delete-persistence
    - shopify-orderupdate-correctness
    - shopify-inventory-adjust-upsert
  affects:
    - tests/sdk-verification/sdk/shopify-regression-closure.test.ts
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts
    - tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts
tech_stack:
  added: []
  patterns:
    - supported-version-set derived from vendored ApiVersion enum (no hand-maintained regex)
    - implicit-connect upsert pattern for InventoryLevel.adjust()
    - single-stringify contract for line_items across resolver and state layer
key_files:
  created: []
  modified:
    - twins/shopify/src/services/api-version.ts
    - twins/shopify/src/plugins/oauth.ts
    - twins/shopify/src/plugins/rest.ts
    - twins/shopify/src/schema/resolvers.ts
    - packages/state/src/state-manager.ts
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts
decisions:
  - Supported version set derived from vendored ApiVersion enum values rather than a new import to avoid runtime coupling; set is documented with citations to the enum
  - adjustInventoryLevel uses implicit-connect upsert (connectInventoryLevelStmt + adjustInventoryLevelStmt) matching real Shopify API behavior, so adjust() works without prior connect()
  - orderUpdate passes raw lineItems to updateOrder() which always JSON.stringifies once; resolver no longer pre-stringifies
  - OAuthOfflineExpiringTokenResponse added as a typed response variant so refresh_token_expires_in is properly shaped and typed
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
---

# Phase 41 Plan 03: Shopify Regression Closure Summary

**One-liner:** Enforced supported quarterly API versions via vendored enum set, returned full offline OAuth shapes with refresh_token and refresh_token_expires_in, fixed product delete persistence, fixed orderUpdate double-stringify corruption, and made InventoryLevel.adjust() upsert-safe.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Enforce supported Shopify versions and return full offline OAuth shapes | 7e6b3c3 | api-version.ts, oauth.ts, shopify-api-auth.test.ts |
| 2 | Make delete, orderUpdate, and inventory flows state-backed and green | 3d4bc61 | state-manager.ts, rest.ts, resolvers.ts, oauth.ts (type fix) |

## What Was Built

### Task 1: API Version Enforcement + Offline OAuth Shapes

**api-version.ts:** Replaced the regex + month-range check with a `SUPPORTED_API_VERSIONS` set derived from the vendored `ApiVersion` enum values (all quarterly values from `2022-10` through `2026-04` plus `unstable`). Impossible versions like `2025-02` now throw a TypeError and callers return 400/404 to the client. The `SUNSET_VERSIONS` behavior for `2023-01` through `2023-10` is preserved.

**oauth.ts:** Added `OAuthOfflineExpiringTokenResponse` interface with `expires_in`, `refresh_token`, and `refresh_token_expires_in` fields. Added `OFFLINE_EXPIRES_IN = 525600` and `REFRESH_TOKEN_EXPIRES_IN = 2592000` constants matching the vendored upstream test expectations in `refresh-token.test.ts` and `token-exchange.test.ts`. Three response branches:
- `refresh_token` grant → always returns the full offline expiring shape
- offline token-exchange with `expiring='1'` → returns the full offline expiring shape
- offline token-exchange with `expiring='0'` → returns bare `{access_token, scope}`

**shopify-api-auth.test.ts:** Extended the `refreshToken` test to assert `session.refreshToken`, `session.refreshTokenExpires`, and `session.expires` in addition to the existing `accessToken` check.

### Task 2: Delete, orderUpdate, and Inventory Flows

**state-manager.ts:**
- Added `deleteProduct(id: number): boolean` — direct `DELETE FROM products WHERE id = ?`
- Fixed `adjustInventoryLevel` to upsert: calls `connectInventoryLevelStmt` (which uses `ON CONFLICT DO NOTHING`) before the adjust statement, so the row is always present before the delta is applied. This matches real Shopify API behavior (adjust without prior connect now succeeds).

**rest.ts:** `DELETE /admin/api/:version/products/:id.json` now calls `stateManager.deleteProduct(numericId)` and returns 404 when nothing was deleted. Subsequent GET calls return 404 correctly.

**resolvers.ts:** `orderUpdate` no longer calls `JSON.stringify(input.lineItems)` before passing to `updateOrder()`. The state layer's `updateOrder` always calls `JSON.stringify` once internally. When no `lineItems` update is provided, the resolver parses the existing stored JSON string back to an object so the state layer can re-stringify it consistently.

## Verification Results

```
pnpm vitest run tests/sdk-verification/sdk/shopify-regression-closure.test.ts \
               tests/sdk-verification/sdk/shopify-api-auth.test.ts \
               tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts

Test Files  3 passed (3)
Tests       38 passed (38)
```

All 6 regression closure contracts are green. All 21 auth tests pass. All 11 behavioral parity tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error in oauth.ts Reply generic**
- **Found during:** Task 2 (when running `pnpm --dir twins/shopify build` as part of the deviation-check after seeing tests not pick up the new upsert logic)
- **Issue:** The `fastify.post<{ Reply: ... }>` generic did not include `OAuthOfflineExpiringTokenResponse`, so TypeScript rejected the `satisfies OAuthOfflineExpiringTokenResponse` cast at the two new return sites with error TS2353.
- **Fix:** Added `OAuthOfflineExpiringTokenResponse` to the Reply union type in the POST handler generic.
- **Files modified:** twins/shopify/src/plugins/oauth.ts
- **Commit:** 3d4bc61 (included in Task 2 commit)

## Self-Check: PASSED

All modified files exist on disk. Both task commits (7e6b3c3 and 3d4bc61) confirmed in git log. All 38 tests pass.
