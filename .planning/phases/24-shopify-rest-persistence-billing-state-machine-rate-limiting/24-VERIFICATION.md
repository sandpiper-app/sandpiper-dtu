---
phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting
verified: 2026-03-12T23:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 24: Shopify REST Persistence, Billing State Machine & Rate Limiting — Verification Report

**Phase Goal:** Shopify REST resources persist state with real-Shopify-compatible shapes, billing implements a full PENDING → ACTIVE → CANCELLED state machine, and rate limiting uses correct bucket parameters.

**Verified:** 2026-03-12T23:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /products.json returns 201 with numeric integer id and admin_graphql_api_id GID | VERIFIED | rest.ts lines 136-165: two-step insert yields SQLite AUTOINCREMENT id, constructs `gid://shopify/Product/${rowId}` |
| 2 | GET /products/:id.json retrieves created product by integer PK; 404 for missing | VERIFIED | rest.ts lines 168-186: `stateManager.getProduct(numericId)` → 404 `{ errors: 'Not Found' }` |
| 3 | GET /orders/:id.json returns specific order by numeric id (not first-order fallback); 404 for missing | VERIFIED | rest.ts lines 241-263: `stateManager.getOrderById(numericId)` → 404 `{ errors: 'Not Found' }` |
| 4 | appSubscriptionCreate returns PENDING status with unique confirmationUrl per call | VERIFIED | resolvers.ts lines 781-807: state-backed, unique AUTOINCREMENT id per call; confirmationUrl includes numeric id |
| 5 | Two sequential appSubscriptionCreate calls return different IDs | VERIFIED | Two-step GID pattern in createAppSubscription() uses AUTOINCREMENT — each call generates a new row |
| 6 | GET /admin/charges/:id/confirm_recurring transitions PENDING → ACTIVE and redirects | VERIFIED | admin.ts lines 240-255: `updateAppSubscriptionStatus(numericId, 'ACTIVE')` → 302 redirect to return_url |
| 7 | currentAppInstallation returns ACTIVE subscriptions after confirmation | VERIFIED | resolvers.ts lines 312-332: `listActiveAppSubscriptions(shopDomain)` queries DB by shop_domain + status='ACTIVE' |
| 8 | appSubscriptionCancel validates shop ownership and transitions to CANCELLED | VERIFIED | resolvers.ts lines 825-865: ownership check `subscription.shop_domain !== context.shopDomain` → userErrors |
| 9 | maximumAvailable = 1000 in all throttleStatus fields (successful and 429 responses) | VERIFIED | index.ts line 87: `LeakyBucketRateLimiter(1000, 50, ...)` — both success (line 475) and 429 (line 411) paths use `fastify.rateLimiter.maxAvailable` |
| 10 | actualQueryCost < requestedQueryCost when connection returns 0 items | VERIFIED | computeActualCost() in graphql.ts lines 72-114: returns 1 (base cost) when all edges/nodes are empty |
| 11 | Bucket uses Shopify-correct threshold: allow when available > 0, can go negative | VERIFIED | rate-limiter.ts lines 69-80: `if (bucket.available <= 0)` — request allowed when any capacity exists |
| 12 | refund() credits back (requestedQueryCost - actualQueryCost) post-execution | VERIFIED | graphql.ts lines 457-461: `fastify.rateLimiter.refund(rateLimitKey, refund)` after computeActualCost |

**Score:** 12/12 truths verified

---

### Required Artifacts

**Plan 24-01 (Test scaffold)**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/test/integration/rest-persistence.test.ts` | SHOP-20a/b/c integration tests | VERIFIED | 5 tests, all pass GREEN — POST product shape, GET by id, GET order by id |
| `twins/shopify/test/integration/billing-state-machine.test.ts` | SHOP-21a/b/c/d integration tests | VERIFIED | 7 tests, all pass GREEN — create/confirm/query/cancel lifecycle |
| `twins/shopify/test/integration/rate-limit.test.ts` | SHOP-24a/b assertions (1000, actualQueryCost < requestedQueryCost) | VERIFIED | 5 tests pass; maximumAvailable=1000 in 2 places, SHOP-24b test at line 294 |

**Plan 24-02 (REST persistence)**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/state/src/state-manager.ts` | getProduct(rowId) and getOrderById(id) methods | VERIFIED | Lines 36 (field decl), 114-115 (reset null), 174-175 (close null), 517 (prepare); methods at getProduct/getOrderById |
| `twins/shopify/src/plugins/rest.ts` | Persistent POST /products.json; GET /products/:id.json; GET /orders/:id.json by id | VERIFIED | Lines 136-165 (POST), 168-186 (GET products), 241-263 (GET orders) |

**Plan 24-03 (Rate limiting)**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/src/index.ts` | LeakyBucketRateLimiter(1000, 50, ...) | VERIFIED | Line 87: `new LeakyBucketRateLimiter(1000, 50, options.rateLimit !== false)` |
| `twins/shopify/src/services/rate-limiter.ts` | refund(key, amount) method added | VERIFIED | Lines 93-98: `refund()` method; tryConsume threshold changed to `available <= 0` at line 69 |
| `twins/shopify/src/plugins/graphql.ts` | computeActualCost() and post-execution refund | VERIFIED | computeActualCost at lines 72-114; post-execution block at lines 454-480 |

**Plan 24-04 (Billing state machine)**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/state/src/state-manager.ts` | app_subscriptions table + 4 CRUD methods | VERIFIED | Table at line 387-399; fields at 72-75; prepared statements at 513-522; methods at 958-1001 |
| `twins/shopify/src/schema/resolvers.ts` | appSubscriptionCreate, appSubscriptionCancel, currentAppInstallation — all state-backed | VERIFIED | Lines 312, 781, 825 — all backed by stateManager, no hardcoded stubs |
| `twins/shopify/src/plugins/admin.ts` | GET /admin/charges/:id/confirm_recurring route | VERIFIED | Lines 240-255: transitions PENDING → ACTIVE, 302 redirect |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `rest.ts` | `state-manager.ts` | `stateManager.createProduct` + two-step GID update + `stateManager.getProduct(rowId)` | WIRED | rest.ts lines 143-154: createProduct call, inline UPDATE, getProduct |
| `rest.ts` | `state-manager.ts` | `stateManager.getOrderById(numericId)` | WIRED | rest.ts line 246: direct call, 404 if null |
| `resolvers.ts` | `state-manager.ts` | `context.stateManager.createAppSubscription` + `getAppSubscription` | WIRED | resolvers.ts lines 783-790: create + immediate get |
| `resolvers.ts` | `state-manager.ts` | `context.stateManager.listActiveAppSubscriptions(context.shopDomain)` | WIRED | resolvers.ts line 314 |
| `resolvers.ts` | `state-manager.ts` | `context.stateManager.updateAppSubscriptionStatus` + `getAppSubscription` | WIRED | resolvers.ts lines 849-850 |
| `admin.ts` | `state-manager.ts` | `fastify.stateManager.updateAppSubscriptionStatus(numericId, 'ACTIVE')` | WIRED | admin.ts line 252 |
| `graphql.ts` | `rate-limiter.ts` | `tryConsume(requestedQueryCost)` pre-check + `refund(delta)` post-execution | WIRED | graphql.ts lines 454-461: compute actualQueryCost, calculate refund, call `fastify.rateLimiter.refund` |
| `graphql.ts` | response body | `computeActualCost(responseBody.data, queryCost)` after yoga.fetch() | WIRED | graphql.ts line 455: computeActualCost returns accurate value injected at line 473 |
| `resolvers.ts` | `admin.ts` | confirmationUrl points to `/admin/charges/:id/confirm_recurring` served by admin plugin | WIRED | resolvers.ts line 791 generates URL; admin.ts line 240 registers matching route |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SHOP-20 | 24-01, 24-02 | REST resources persist with numeric integer IDs and admin_graphql_api_id GID field; GET /orders/:id.json returns specific order | SATISFIED | rest-persistence.test.ts 5/5 tests pass; REST handler two-step insert + stateManager lookup |
| SHOP-21 | 24-01, 24-04 | Billing state machine: PENDING → ACTIVE → CANCELLED with ownership validation | SATISFIED | billing-state-machine.test.ts 7/7 tests pass; full resolver + DB implementation |
| SHOP-24 | 24-01, 24-03 | Rate limiting: maxAvailable=1000, actualQueryCost from real traversal | SATISFIED | rate-limit.test.ts 5/5 tests pass; computeActualCost + refund wired in graphql.ts |

No orphaned requirements — all three Phase 24 requirements (SHOP-20, SHOP-21, SHOP-24) are claimed and satisfied across plans 24-01 through 24-04.

---

### Anti-Patterns Found

None of the phase 24 modified files contain TODO/FIXME/HACK/PLACEHOLDER comments, stub returns (`return null`, `return {}`, `return []`) in implementation paths, or console.log-only handlers. The `return {}` instances in rest.ts are correct DELETE responses. The `return null` in parseVersionHeader is correct error-flow behavior.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

---

### Human Verification Required

None. All observable truths are verified programmatically by integration tests that pass in the actual running application context. No visual, real-time, or external service behavior is involved.

---

### Test Results Summary

| Test File | Tests | Result | Notes |
|-----------|-------|--------|-------|
| `test/integration/rest-persistence.test.ts` | 5/5 | PASS | SHOP-20a/b/c all green |
| `test/integration/billing-state-machine.test.ts` | 7/7 | PASS | SHOP-21a/b/c/d all green |
| `test/integration/rate-limit.test.ts` | 5/5 | PASS | maximumAvailable=1000, actualQueryCost < requestedQueryCost |
| `test/integration.test.ts` | 32 failures | PRE-EXISTING | Phase 23 OAuth tightening broke token seeding pattern; documented in 24-01 SUMMARY; not caused by Phase 24 |
| `test/integration/pagination.test.ts` | failures | PRE-EXISTING | Uses same broken OAuth token pattern; pre-exists Phase 24 |
| `tests/integration/order-lifecycle.test.ts` | failures | PRE-EXISTING | Same OAuth token seeding issue; pre-exists Phase 24 |

Pre-existing failures confirmed by running the test suite against the Phase 23 tip commit (c343421) — same 32+N failures present before any Phase 24 code landed.

---

### Gaps Summary

No gaps. All 12 observable truths are fully verified. All three requirements (SHOP-20, SHOP-21, SHOP-24) are satisfied with passing integration tests and substantive, wired implementation in the codebase.

The phase goal is achieved:
- REST resources persist state with real-Shopify-compatible shapes (numeric integer IDs + admin_graphql_api_id GID).
- Billing implements the full PENDING → ACTIVE → CANCELLED state machine with ownership validation.
- Rate limiting uses the correct 1000-point bucket and computes actualQueryCost from actual traversal with post-execution refund.

---

_Verified: 2026-03-12T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
