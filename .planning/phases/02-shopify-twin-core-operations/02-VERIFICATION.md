---
phase: 02-shopify-twin-core-operations
verified: 2026-02-27T17:10:00Z
re-verified: 2026-02-27T17:20:00Z
status: passed
score: 17/17 must-haves verified
gaps:
  - truth: "Developer receives webhook POST when state mutations occur for productUpdate and fulfillmentCreate"
    status: resolved
    reason: "Plan 02-05 gap closure added productUpdate and fulfillmentCreate mutations with webhook delivery. All 4 SHOP-03 webhook topics now implemented and tested (30/30 tests passing)."
    resolved_by: "02-05-PLAN.md"
---

# Phase 2: Shopify Twin Core Operations Verification Report

**Phase Goal:** Shopify twin handles OAuth and core GraphQL operations with stateful behavior
**Verified:** 2026-02-27T17:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Developer can exchange authorization code for access token | VERIFIED | `POST /admin/oauth/access_token` in oauth.ts calls `stateManager.createToken`, returns `{ access_token, scope }` |
| 2 | Developer receives 401 when using invalid token on protected endpoints | VERIFIED | `requireAuth()` in resolvers.ts throws `UNAUTHORIZED` GraphQLError; graphql.ts sets `authorized=false` for missing/invalid tokens; integration test "returns error with invalid token" passes |
| 3 | Developer can reset Shopify twin state via POST /admin/reset | VERIFIED | admin.ts calls `stateManager.reset()`, returns `{ reset: true, timestamp }` |
| 4 | Developer can load fixtures via POST /admin/fixtures/load | VERIFIED | admin.ts generates GIDs via `createGID` before calling `createOrder/createProduct/createCustomer`; gap from UAT Test 4 closed by plan 04 |
| 5 | Developer can inspect state via GET /admin/state | VERIFIED | admin.ts returns `{ orders, products, customers, tokens, webhooks }` counts from StateManager |
| 6 | Developer can query orders via GraphQL and receive Shopify-formatted responses | VERIFIED | `QueryRoot.orders` resolver calls `stateManager.listOrders()`, returns connection with edges; `Order.id` type resolver returns GID format |
| 7 | Developer can create order via orderCreate mutation and query it back | VERIFIED | `orderCreate` mutation creates order, returns GID; integration test "creates order and returns GID" passes with `gid://shopify/Order/\d+` assertion |
| 8 | Developer can update existing order via orderUpdate mutation and observe state changes | VERIFIED | `orderUpdate` calls `stateManager.updateOrder()` which sets `updated_at = now`; integration test waits 1100ms and asserts `updatedAt` changes |
| 9 | Developer can query products and customers | VERIFIED | `QueryRoot.products` and `QueryRoot.customers` resolvers implemented; integration tests pass |
| 10 | GraphQL returns proper GID format (gid://shopify/Order/123) | VERIFIED | `Order.id`, `Product.id`, `Customer.id` type resolvers all call `createGID`; integration test asserts `/^gid:\/\/shopify\/Order\/\d+$/` |
| 11 | Invalid token returns 401 error | VERIFIED | `requireAuth()` throws GraphQLError with `code: 'UNAUTHORIZED'`; two integration tests confirm this |
| 12 | Developer receives webhook POST when order is created via GraphQL mutation | VERIFIED | `orderCreate` resolver calls `sendWebhook` with `orders/create` topic; HMAC-SHA256 signature in `X-Shopify-Hmac-Sha256` header confirmed in webhook-sender.ts |
| 13 | Developer receives webhook POST when order is updated via GraphQL mutation | VERIFIED | `orderUpdate` resolver calls `sendWebhook` with `orders/update` topic; payload includes `updated_at` field |
| 14 | Webhook includes HMAC signature in X-Shopify-Hmac-Sha256 header | VERIFIED | `generateWebhookSignature` in webhook-sender.ts creates HMAC-SHA256 base64 digest; header `X-Shopify-Hmac-Sha256` sent on every webhook POST |
| 15 | Developer can configure error simulation for specific GraphQL operations | VERIFIED | `POST /admin/errors/configure` stores config in StateManager; `POST /admin/errors/enable` / `disable` toggles `globalEnabled` flag on ErrorSimulator |
| 16 | Developer receives 429 THROTTLED error when rate limit error configured for orderCreate | VERIFIED | Integration test "returns configured 429 THROTTLED error for operation" asserts `errors[0].extensions.code === 'THROTTLED'`; 24/24 tests pass |
| 17 | Webhooks for productUpdate and fulfillmentCreate trigger POST to callback URLs | VERIFIED | Plan 02-05 gap closure: productUpdate mutation triggers products/update webhook, fulfillmentCreate mutation triggers fulfillments/create webhook. Both resolvers in resolvers.ts call sendWebhook. 6 new integration tests pass (30/30 total). |

**Score:** 17/17 truths verified

---

### Required Artifacts

| Artifact | Provides | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `twins/shopify/src/index.ts` | buildApp() factory with Fastify + StateManager | Yes | 94 lines | All plugins registered | VERIFIED |
| `twins/shopify/src/plugins/oauth.ts` | OAuth token exchange endpoint | Yes | 49 lines, exports `oauthPlugin` | Registered in index.ts | VERIFIED |
| `twins/shopify/src/services/token-validator.ts` | Token validation logic | Yes | 30 lines, exports `validateAccessToken` | Called in graphql.ts context | VERIFIED |
| `packages/state/src/state-manager.ts` | Extended StateManager with Shopify-specific methods | Yes | 539 lines, contains `createToken`, `createOrder`, `updateOrder`, `getToken`, 8 Shopify tables | Used throughout twin | VERIFIED |
| `twins/shopify/src/db/schema.sql` | Shopify entity tables | Yes | 95 lines, contains `orders` table | Documentation/reference | VERIFIED |
| `twins/shopify/src/schema/schema.graphql` | SDL schema for Shopify resources | Yes | 186 lines, contains `type Order`, `OrderUpdateInput`, `MutationType` | Loaded by graphql.ts via `readFileSync` | VERIFIED |
| `twins/shopify/src/schema/resolvers.ts` | GraphQL resolvers | Yes | 426 lines, exports `resolvers` | Passed to `makeExecutableSchema` in graphql.ts | VERIFIED |
| `twins/shopify/src/plugins/graphql.ts` | GraphQL Yoga route handler | Yes | 127 lines, exports `graphqlPlugin` | Registered in index.ts | VERIFIED |
| `twins/shopify/src/services/gid.ts` | GID helpers | Yes | 29 lines, exports `createGID`, `parseGID` | Imported in resolvers.ts, admin.ts | VERIFIED |
| `twins/shopify/src/services/webhook-sender.ts` | Webhook delivery with HMAC | Yes | 52 lines, exports `sendWebhook` | Called in resolvers.ts (4 locations) | VERIFIED |
| `twins/shopify/src/services/error-simulator.ts` | Error injection logic | Yes | 83 lines, exports `ErrorSimulator` | Instantiated in index.ts, called in resolvers.ts (4 locations) | VERIFIED |
| `twins/shopify/src/plugins/errors.ts` | Error config endpoints | Yes | 48 lines, exports `errorsPlugin` | Registered in index.ts | VERIFIED |
| `twins/shopify/test/integration.test.ts` | Integration test suite | Yes | 800+ lines (min_lines: 100 satisfied) | 30/30 tests pass | VERIFIED |
| `twins/shopify/src/plugins/admin.ts` | Fixtures load with GID generation | Yes | 112 lines (min_lines: 100 satisfied), imports `createGID` | GID generated for all 3 entity types before insertion | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `oauth.ts` | `stateManager.createToken` | OAuth handler creates token | WIRED | Line 39: `fastify.stateManager.createToken(token, ...)` |
| `token-validator.ts` | `stateManager.getToken` | Token validation queries StateManager | WIRED | Line 21: `stateManager.getToken(token)` |
| `admin.ts` | `stateManager.reset` | Admin reset calls StateManager | WIRED | Line 43: `fastify.stateManager.reset()` |
| `graphql.ts` | `token-validator.validateAccessToken` | GraphQL context creation | WIRED | Line 61: `await validateAccessToken(token, fastify.stateManager)` |
| `resolvers.ts` | `context.stateManager.*` | Resolver queries | WIRED | 12+ calls to `context.stateManager.listOrders()`, `.createOrder()`, `.getOrder()`, etc. |
| `resolvers.ts` | `gid.createGID` | ID field resolvers | WIRED | `Order.id`, `Product.id`, `Customer.id` type resolvers all call `createGID` |
| `resolvers.ts` | `webhook-sender.sendWebhook` | Mutations trigger webhooks | WIRED | Lines 182, 249, 304, 355 — all 4 mutation resolvers call `sendWebhook` |
| `resolvers.ts` | `error-simulator.checkErrorSimulation` | Resolvers check for error config | WIRED | Lines 133, 204, 272, 324 — all 4 mutation resolvers call `context.errorSimulator.throwIfConfigured(...)` |
| `errors.ts` | `stateManager.createErrorConfig` | Error config endpoint stores config | WIRED | Line 28: `fastify.stateManager.createErrorConfig(operationName, {...})` |
| `admin.ts` | `gid.createGID` | createGID import and usage | WIRED | Line 9 import, lines 65, 72, 79 — GID generated for Order, Product, Customer |
| `admin.ts` | `stateManager.createOrder` with gid param | GID passed to createOrder | WIRED | Line 66: `fastify.stateManager.createOrder({ ...order, gid: orderGid })` |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| SHOP-01 | 02-02 | GraphQL Admin API handles queries and mutations (orders, products, customers, inventory, fulfillments) | SATISFIED | GraphQL endpoint at `/admin/api/2024-01/graphql.json`; orderCreate, orderUpdate, productCreate, customerCreate mutations; order/product/customer queries with connection types |
| SHOP-02 | 02-01 | OAuth token exchange — authorization code to access token, token validation on requests | SATISFIED | `POST /admin/oauth/access_token` issues tokens; `validateAccessToken` guards all GraphQL operations |
| SHOP-03 | 02-03, 02-05 | Webhook delivery — orderCreate, orderUpdate, productUpdate, fulfillmentCreate trigger POST to callback URLs | SATISFIED | All 4 required webhook topics implemented: orders/create, orders/update (plan 02-03), products/update, fulfillments/create (plan 02-05). All with HMAC signatures. 30/30 integration tests passing. |
| SHOP-07 | 02-01, 02-04 | X-Shopify-Access-Token header validation on all API requests | SATISFIED | `graphql.ts` extracts header, `validateAccessToken` checks StateManager, `requireAuth()` rejects unauthorized in resolvers |
| INFRA-03 | 02-01 | Admin API for programmatic test control — POST /admin/reset, POST /admin/fixtures/load, GET /admin/state | SATISFIED | All three endpoints implemented in admin.ts and verified passing in integration tests |
| INFRA-04 | 02-03, 02-04 | Configurable error simulation per endpoint — 401, 403, 429, 500, 503 | SATISFIED | ErrorSimulator class with per-operation config stored in StateManager; /admin/errors/configure, /enable, /disable endpoints functional |

**Orphaned requirements check:** All 6 requirements (SHOP-01, SHOP-02, SHOP-03, SHOP-07, INFRA-03, INFRA-04) are fully satisfied. SHOP-03 gap closed by plan 02-05.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `resolvers.ts` | 164 | Comment: "use unique placeholder GID, then update with actual ID" | Info | Cosmetic — the pattern works correctly, comment is slightly misleading but the GID is not updated post-insert. GID uses tempId, actual DB id is used for Order.id resolver. Functions correctly. |
| `webhook-sender.ts` | 49-50 | `console.error` for webhook failure (not fastify.log) | Info | Not a stub; webhook failure is intentionally fire-and-forget. Does not affect correctness. |

No blocker or warning anti-patterns found.

---

### Human Verification Required

#### 1. HMAC Signature Validation

**Test:** Start the twin, subscribe a real HTTP receiver (e.g., `nc -l 9999`) to webhooks via `stateManager.createWebhookSubscription`, trigger an `orderCreate` mutation, inspect the received POST for the `X-Shopify-Hmac-Sha256` header, and verify the base64 HMAC-SHA256 value matches `crypto.createHmac('sha256', 'dev-secret').update(body).digest('base64')`.
**Expected:** The header value on the received POST matches the locally computed HMAC for the body.
**Why human:** Integration tests cannot verify the actual delivered POST payload since localhost:9999 is not listening — tests only verify the mutation succeeds, not the webhook delivery content.

#### 2. Webhook Fire-and-Forget Behavior Under Load

**Test:** Configure a slow webhook endpoint (e.g., with a 5-second response delay), trigger an `orderCreate` mutation, and measure whether the GraphQL response returns before the webhook completes.
**Expected:** GraphQL response returns immediately; webhook delivery happens asynchronously and does not block the response.
**Why human:** The test suite cannot measure wall-clock response timing in a meaningful way.

---

### Gaps Summary

**All gaps resolved.**

The original verification found SHOP-03 partially satisfied: productUpdate and fulfillmentCreate mutations and webhooks were absent. Plan 02-05 (gap closure) added both mutations with full webhook delivery, resolving Truth #17 and satisfying SHOP-03 completely.

All 6 requirements (SHOP-01, SHOP-02, SHOP-03, SHOP-07, INFRA-03, INFRA-04) are now fully satisfied with 30/30 integration tests passing.

---

_Verified: 2026-02-27T17:10:00Z_
_Verifier: Claude (gsd-verifier)_
