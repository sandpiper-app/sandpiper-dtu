---
phase: 41-regression-closure-and-release-gate-recovery
plan: "01"
subsystem: sdk-verification-contracts
tags:
  - tdd
  - regression-contracts
  - wave-0
  - shopify
  - slack
  - proof-integrity
dependency_graph:
  requires: []
  provides:
    - RED contracts for every open Phase 41 regression cluster
    - Explicit executable failing tests for Shopify, Slack, and proof-integrity gaps
  affects:
    - tests/sdk-verification/sdk/shopify-regression-closure.test.ts
    - tests/sdk-verification/sdk/slack-regression-closure.test.ts
    - tests/sdk-verification/coverage/proof-integrity-regression.test.ts
tech_stack:
  added: []
  patterns:
    - source-reading assertions for proof-integrity tests
    - narrow-scope token seeding via POST /admin/tokens
    - RED contracts as executable specifications
key_files:
  created:
    - tests/sdk-verification/sdk/shopify-regression-closure.test.ts
    - tests/sdk-verification/sdk/slack-regression-closure.test.ts
    - tests/sdk-verification/coverage/proof-integrity-regression.test.ts
  modified: []
decisions:
  - "Test 1 (proof-integrity) is a regression guard (GREEN) because plan 41-02 ran ahead and already fixed the root build script; the other 3 proof-integrity tests remain RED"
  - "Shopify Test 5 (orderUpdate) fails with TypeError on queryBody.data.orders — data is null because the orderUpdate double-stringify corrupts the lineItems resolver, propagating a GraphQL error that nulls out the query result; this is the regression being tested, not a setup miss"
  - "Shopify Test 6 (InventoryLevel) proves adjust() returns 404 without prior connect(); the real Shopify API creates the level implicitly on adjust() but the twin requires explicit connect() first"
  - "Task 2 scope enforcement tests use narrow-scope tokens seeded via POST /admin/tokens with scope='chat:write' to prove missing METHOD_SCOPES catalog entries allow unauthorized access"
metrics:
  duration: 8min
  completed_date: "2026-03-15"
  tasks_completed: 3
  files_changed: 3
---

# Phase 41 Plan 01: RED Regression Contracts Summary

Three new test files that compile and run without fixture/module errors, and fail for
the exact Phase 41 regression reasons: missing version rejection, stale delete, absent
refresh-token metadata, orderUpdate corruption, InventoryLevel parity gap, scope catalog
gaps, OAuth/OIDC credential bypass, and proof-header stripping in exact-mode comparator.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add RED Shopify regression contracts | efa9b4d | tests/sdk-verification/sdk/shopify-regression-closure.test.ts |
| 2 | Add RED Slack regression contracts | 9c73577 | tests/sdk-verification/sdk/slack-regression-closure.test.ts |
| 3 | Add RED proof-integrity regression contracts | ea298f8 | tests/sdk-verification/coverage/proof-integrity-regression.test.ts |

## Test Contract Details

### Task 1 — Shopify Regression Contracts (6 tests, all RED)

1. `returns 404 for unsupported API version 2025-02 on Admin REST and GraphQL routes`
   - Regression: `api-version.ts` accepts `2025-02` as valid (month 02 is valid, but 2025-02 is not a real release); both REST and GraphQL routes return 200

2. `Product.delete() removes the product from subsequent GET /products/:id.json`
   - Regression: DELETE handler returns `{}` without calling `stateManager.deleteProduct()`; GET still returns 200 after delete

3. `refreshToken() returns refresh token metadata for offline sessions`
   - Regression: `oauth.ts` returns bare `{ access_token, scope }` for all grant types; `createSession()` only sets `session.refreshToken` when `refresh_token + refresh_token_expires_in` appear in the response

4. `offline tokenExchange with expiring=true returns refresh token metadata`
   - Regression: same as above; `expiring` flag is present in the request but twin ignores it

5. `orderUpdate preserves lineItems arrays for subsequent order queries`
   - Regression: `orderUpdate` stores `JSON.stringify(input.lineItems)` but the existing row already has `line_items` as a JSON string; double-stringifying corrupts the resolver, causing a GraphQL null propagation error on subsequent reads

6. `InventoryLevel.adjust() returns inventory_level and Location.inventory_levels sees the same row`
   - Regression: `adjustInventoryLevel` returns null/404 when the `(inventory_item_id, location_id)` row doesn't exist (no prior `connect()`); real Shopify API creates the level implicitly

### Task 2 — Slack Regression Contracts (8 tests, all RED)

1. `users.setPhoto returns missing_scope for a token seeded with chat:write only`
2. `files.getUploadURLExternal returns missing_scope for a token seeded with chat:write only`
3. `search.files returns missing_scope for a token seeded with chat:write only`
   - Regression: `users.setPhoto`, `files.getUploadURLExternal`, `search.files` are absent from `METHOD_SCOPES` catalog; `checkScope()` returns null for unknown methods → no enforcement

4. `files.getUploadURLExternal returns an absolute upload_url and rejects missing filename or length`
   - Regression: `files.ts` generates an upload_url without validating `filename` or `length` params

5. `files.completeUploadExternal rejects an empty files array`
   - Regression: `files.ts` returns `{ ok: true, files: [] }` for empty `files` array instead of `invalid_arguments`

6. `oauth.access rejects an invalid client secret`
7. `oauth.v2.exchange rejects an invalid client secret`
   - Regression: `new-families.ts` only checks `client_id` presence; `client_secret` is never validated

8. `openid.connect.token rejects an unknown client_id and wrong secret`
   - Regression: `OIDC_CLIENT_SECRETS[client_id]` is undefined for unknown client IDs; `expectedSecret && ...` short-circuits to false, letting any secret pass

### Task 3 — Proof-Integrity Regression Contracts (4 tests, 3 RED, 1 GREEN guard)

1. `build script includes twin builds` — **GREEN (regression guard)**
   - 41-02 ran ahead of 41-01 and already fixed `package.json` to include `./twins/*`; retained as guard

2. `shopify-api-client does not record top-level symbols at construction time` — **RED**
   - Regression: `shopify-api-client.ts` calls `recordSymbolHit(Shopify.auth)`, `recordSymbolHit(Shopify.clients)`, etc. at function-body level (2-space indent) after `shopifyApi()` returns; these are not inside proxy getters or construct handlers

3. `slack method coverage proof is not representative-only` — **RED**
   - Regression: `slack-method-coverage.test.ts` file header contains "representative method from each missing WebClient method family" — proof is sampling, not full surface coverage

4. `conformance comparator preserves deterministic proof headers` — **RED**
   - Regression: `comparator.ts` `normalizeResponse()` destructs only `content-type` from response headers, stripping `x-shopify-api-version`, `x-oauth-scopes`, `x-accepted-oauth-scopes` before exact-mode comparison

## Deviations from Plan

### Auto-detected deviation: Plan 41-02 ran before 41-01

**Found during:** Task 3
**Issue:** `feat(41-02)` already ran (commit `cc46caa`) and fixed the root `package.json` build script before this plan executed. Test 1 of the proof-integrity suite is now a GREEN regression guard instead of a RED contract.
**Fix:** Retained the test as-is (assert build includes both `./packages/*` and `./twins/*`). The other 3 proof-integrity tests remain RED and the suite exits non-zero.
**Files modified:** None (test content unchanged from plan intent; only expected behavior adjusted in comments)

## Self-Check: PASSED

Files exist:
- tests/sdk-verification/sdk/shopify-regression-closure.test.ts: FOUND
- tests/sdk-verification/sdk/slack-regression-closure.test.ts: FOUND
- tests/sdk-verification/coverage/proof-integrity-regression.test.ts: FOUND

Commits exist:
- efa9b4d: FOUND (test(41-01): add RED Shopify regression contracts)
- 9c73577: FOUND (test(41-01): add RED Slack regression contracts)
- ea298f8: FOUND (test(41-01): add RED proof-integrity regression contracts)
