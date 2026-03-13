# Phase 29: Shopify Billing Transitions & Test Migration — Research

**Researched:** 2026-03-13
**Domain:** Shopify twin billing state machine (transition validation) + legacy integration test OAuth migration
**Confidence:** HIGH — all findings are derived from reading live source files and running the actual test suite

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-21 | Shopify billing state machine: `appSubscriptionCreate` returns PENDING with `confirmationUrl`; confirming transitions to ACTIVE; `currentAppInstallation` returns actual subscription data; `appSubscriptionCancel` validates ownership AND validates legal state transitions (ACTIVE-only cancellation, no double-cancel) | Partial: PENDING/ACTIVE/cancel-ownership implemented in Phase 24; two legal-transition guards missing in `resolvers.ts:825-865`; 32+ integration tests blocked by OAuth migration |
</phase_requirements>

---

## Summary

Phase 24 implemented the Shopify billing state machine PENDING → ACTIVE → CANCELLED lifecycle including ownership validation. The `billing-state-machine.test.ts` (7 tests) is fully GREEN. However, the milestone audit identified one gap in SHOP-21: `appSubscriptionCancel` does not validate the subscription's current state before writing CANCELLED. Both PENDING→CANCELLED and CANCELLED→CANCELLED transitions succeed when they should be rejected with `userErrors`.

Independently, 32+ tests in `twins/shopify/test/integration.test.ts`, `twins/shopify/test/integration/pagination.test.ts`, and `twins/shopify/tests/integration/order-lifecycle.test.ts` fail because Phase 23 tightened `POST /admin/oauth/access_token` to require `client_id` + `client_secret`, but these tests still call it with only `{ code: 'some-code' }`. The fix is to replace every such call with `POST /admin/tokens` (the test-only seeder added in Phase 21). One additional rate-limit test also fails for a different reason.

**Primary recommendation:** Two surgical changes: (1) add a status guard in `appSubscriptionCancel` that rejects non-ACTIVE subscriptions; (2) migrate all old-OAuth token acquisition calls in the three integration test files to `POST /admin/tokens`.

---

## Standard Stack

### Core (already in place — no new dependencies)
| Component | Location | Purpose |
|-----------|----------|---------|
| `twins/shopify/src/schema/resolvers.ts` | `appSubscriptionCancel` mutation resolver | Where transition guard must be added |
| `packages/state/src/state-manager.ts` | `updateAppSubscriptionStatus`, `getAppSubscription` | Already correct — no changes needed |
| `twins/shopify/test/integration.test.ts` | 32 failing tests | Primary migration target |
| `twins/shopify/test/integration/pagination.test.ts` | 10 failing tests | Secondary migration target |
| `twins/shopify/tests/integration/order-lifecycle.test.ts` | 7 failing tests | Secondary migration target |

### No New Libraries
All changes are in existing files. No new npm packages required.

---

## Architecture Patterns

### Pattern 1: Billing Transition Guard in Resolver

The `appSubscriptionCancel` resolver currently has two guards: parse GID, check existence, check ownership. A third guard must be inserted after the ownership check to reject non-ACTIVE subscriptions.

**Current structure (`resolvers.ts:825-865`):**
```typescript
// 1. Parse numeric ID from GID
// 2. Look up subscription (404-equivalent if not found)
// 3. Ownership check (shop_domain must match)
// 4. UPDATE status to CANCELLED  ← missing: status guard before this step
// 5. Return cancelled subscription
```

**Required guard (insert between step 3 and 4):**
```typescript
if (subscription.status !== 'ACTIVE') {
  return {
    appSubscription: null,
    userErrors: [{
      field: ['id'],
      message: 'Subscription must be in ACTIVE state to be cancelled',
    }],
  };
}
```

This pattern is consistent with how other lifecycle guards are written in this codebase (`order-lifecycle.ts` validates transitions via `displayFulfillmentStatus` checks before accepting mutations).

### Pattern 2: OAuth → POST /admin/tokens Migration

The failing tests all follow the same antipattern in `beforeEach` or inline test blocks:

```typescript
// OLD (broken after Phase 23):
const oauthResponse = await app.inject({
  method: 'POST',
  url: '/admin/oauth/access_token',
  payload: { code: 'test-code' },
});
token = JSON.parse(oauthResponse.body).access_token;
```

The replacement pattern (already established in Phase 24 integration tests, `billing-state-machine.test.ts`, and `rate-limit.test.ts`):

```typescript
// NEW (Phase 24/24-01 pattern — works post-Phase 23):
token = 'my-integration-test-token';  // or randomUUID()
await app.inject({
  method: 'POST',
  url: '/admin/tokens',
  payload: { token, shopDomain: 'twin.myshopify.com' },
});
```

**Key difference from billing test:** The billing test (`billing-state-machine.test.ts`) uses a `seedToken()` helper that generates a UUID token AND POSTs it to `/admin/tokens`. That pattern is the model to follow.

### Pattern 3: OAuth-Specific Tests Need Special Handling

The `OAuth` describe block in `integration.test.ts` contains 2 tests that explicitly test the old behavior (code exchange returning a token, two codes giving unique tokens). After Phase 23, these tests pass only if `client_id` and `client_secret` are supplied, OR if the OAuth tests are updated to use the authorized OAuth flow (`GET /admin/oauth/authorize` → get real code → `POST /admin/oauth/access_token` with credentials).

**Decision required:** The easiest correct approach is to update the OAuth tests to use valid credentials (`SHOPIFY_API_KEY`='test-api-key', `SHOPIFY_API_SECRET`='test-api-secret') with proper code from the authorize flow. Alternatively, update them to test the now-correct behavior (reject bare codes). Both are valid. The planner should choose "update to use valid credentials" — this preserves test coverage of the OAuth endpoint itself.

The `API Conformance: OAuth form-urlencoded` describe block has the same issue — these tests need valid credentials added.

### Pattern 4: Rate-Limit 429 Test (1 failing, different root cause)

`test/integration/rate-limit.test.ts > throttling > returns HTTP 429 when bucket is depleted` sends 5 expensive queries and never sees a 429. The test was passing in Phase 24 (per VERIFICATION.md). This is likely a test-ordering or state isolation issue (the rate limiter bucket is shared across requests; if `beforeEach` seeds a token for `rate-limit-test.myshopify.com` but the bucket was already depleted by a prior test run that did NOT reset the app, subsequent tests don't refill it). The test already calls `app.inject POST /admin/reset` to reset before the expensive loop — so the issue may be that orders are loaded in a different shop domain than what the rate limiter keys on, making the connection return 0 items and thus very cheap queries.

**Root cause hypothesis:** `orders(first:250)` returns 0 items because orders are in a different shop domain context. With 0 items, `computeActualCost` returns 1 (base cost), never exhausting the 1000-point bucket in 5 attempts.

**Fix:** The rate-limit test must seed the 250 orders AFTER re-seeding the token with `shopDomain: 'rate-limit-test.myshopify.com'`. The current code does exactly that. However, the fixture load doesn't scope orders to a shop domain — orders are global. This means any authenticated query against `orders(first:250)` should return all seeded orders. The issue may be that token seeding on `rate-limit-test.myshopify.com` hits the GraphQL query against that shop's orders, which are actually scoped globally. Re-examining: the rate-limit test is NOT in scope for SHOP-21, but it IS in the integration test suite and is FAILING. Phase 29's description specifically calls out "32+ test failures from Phase 23 OAuth tightening" — the rate-limit test uses `POST /admin/tokens` correctly, so it failed for a separate reason and likely needs investigation alongside the OAuth migration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth credentials for auth tests | New mock endpoint | Valid twin credentials (`SHOPIFY_API_KEY=test-api-key`) + real OAuth flow | Twin already supports full OAuth authorize flow (Phase 23) |
| Custom state validator | New DB helper | Inline `subscription.status !== 'ACTIVE'` check in resolver | Status is already returned by `getAppSubscription()` |
| Token factory function | New test utility | Use `POST /admin/tokens` pattern inline or in helper — already established | Phase 24 billing tests already have `seedToken()` — copy it |

---

## Common Pitfalls

### Pitfall 1: OAuth Test Describe Block Must Still Test OAuth
**What goes wrong:** Migrating the `OAuth` describe block's `beforeEach` to `POST /admin/tokens` hides that the OAuth endpoint itself is now broken for unauthenticated code-only requests. The `OAuth` tests should validate that the OAuth endpoint responds correctly, not bypass it.
**How to avoid:** The two OAuth tests explicitly test OAuth behavior — update them to use valid credentials (`client_id: 'test-api-key', client_secret: 'test-api-secret'`) AND provide a real OAuth code obtained via `GET /admin/oauth/authorize`. Or, change the test intent: assert that bare-code requests now correctly return `400 invalid_request` (testing the tightened behavior).
**Recommended:** Update to use the full OAuth flow with valid credentials so OAuth behavior remains tested.

### Pitfall 2: Form-Urlencoded OAuth Tests Need Credentials Too
**What goes wrong:** `API Conformance: OAuth form-urlencoded` tests use `payload: 'code=test-auth-code'` without `client_id`/`client_secret`. These also fail after Phase 23.
**How to avoid:** Add `client_id=test-api-key&client_secret=test-api-secret` to the form-urlencoded payload. But the code must exist as a valid stored OAuth code (obtained from `GET /admin/oauth/authorize` flow or via a pre-stored code).
**Recommended:** Use the authorize flow or switch these two tests to `POST /admin/tokens` and add a clarifying comment that form-urlencoded OAuth is tested separately in the SDK-verification suite.

### Pitfall 3: Transition Guard Must Check DB Status, Not Assume
**What goes wrong:** Checking `subscription.status` from the already-fetched object is correct because `getAppSubscription()` returns the current DB state. However, if someone passes the existing object without re-fetching after a concurrent update, the check could be stale.
**How to avoid:** The resolver already calls `getAppSubscription(numericId)` before the ownership check. The status check is on that same object — no re-fetch needed. This is correct.

### Pitfall 4: `hasExactTwinCredentials` Applies to ALL Auth-Code Requests
**What goes wrong:** Forgetting that the `hasExactTwinCredentials` check at line 150 of `oauth.ts` runs for ALL non-passthrough grant types. Any test sending `client_id: 'test-api-key', client_secret: 'test-api-secret'` will pass the credential check, but will then need a valid stored code from `consumeOAuthCode()`.
**How to avoid:** To get a valid code, first hit `GET /admin/oauth/authorize?redirect_uri=http://localhost/callback` — this returns a `302` with `code=<uuid>` in the redirect URL params. Extract that code and use it in the token exchange. This two-step flow is what the `@shopify/shopify-api` SDK does under the hood.

### Pitfall 5: `CANCELLED → CANCELLED` Double-Cancel Must Return userErrors
**What goes wrong:** After the status guard is added, a PENDING→CANCELLED attempt returns `userErrors` but the resolver still returns `appSubscription: null`. Verify that the GraphQL schema allows `appSubscription` to be nullable in `AppSubscriptionCancelPayload` — it does (Phase 24 code already returns `appSubscription: null` for ownership failure).
**How to avoid:** Keep the pattern consistent with the ownership guard: `{ appSubscription: null, userErrors: [...] }`.

---

## Code Examples

### Transition Guard (insert in resolvers.ts)
```typescript
// Source: resolvers.ts lines 843-848 (ownership guard pattern — use same structure)
// Add AFTER ownership check, BEFORE updateAppSubscriptionStatus call:
if (subscription.status !== 'ACTIVE') {
  return {
    appSubscription: null,
    userErrors: [{
      field: ['id'],
      message: 'Only ACTIVE subscriptions can be cancelled',
    }],
  };
}
```

### Token Seeder Pattern (established in Phase 24)
```typescript
// Source: twins/shopify/test/integration/billing-state-machine.test.ts lines 36-47
async function seedToken(
  app: Awaited<ReturnType<typeof buildApp>>,
  shopDomain: string
): Promise<string> {
  const token = randomUUID();
  await app.inject({
    method: 'POST',
    url: '/admin/tokens',
    payload: { token, shopDomain },
  });
  return token;
}
```

### Full OAuth Flow for Updating OAuth Tests (Phase 23 established this)
```typescript
// GET /admin/oauth/authorize returns 302 with code in callback params
const authorizeRes = await app.inject({
  method: 'GET',
  url: '/admin/oauth/authorize?redirect_uri=http://localhost/callback&client_id=test-api-key&state=test',
  headers: { host: 'dev.myshopify.com' },
});
const location = authorizeRes.headers.location as string;
const code = new URL(location).searchParams.get('code');

// Then exchange:
const tokenRes = await app.inject({
  method: 'POST',
  url: '/admin/oauth/access_token',
  payload: { client_id: 'test-api-key', client_secret: 'test-api-secret', code },
});
token = JSON.parse(tokenRes.body).access_token;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `POST /admin/oauth/access_token` with bare code only | Must include `client_id` + `client_secret` + valid code | Phase 23 (completed) | 32+ integration tests fail |
| Hardcoded billing stub (gid://shopify/AppSubscription/1) | State-backed PENDING→ACTIVE→CANCELLED state machine | Phase 24 (completed) | billing-state-machine.test.ts 7/7 GREEN |
| No transition validation in cancel | `status === 'ACTIVE'` guard before cancel | Phase 29 (THIS phase) | Closes SHOP-21 fully |

---

## Open Questions

1. **Rate-limit 429 test root cause**
   - What we know: `rate-limit.test.ts > throttling` fails — 5 queries all return 200. Orders seeded to `rate-limit-test.myshopify.com`. `computeActualCost` returns 1 when connection is empty.
   - What's unclear: Whether the GraphQL `orders(first:250)` query scopes to `shopDomain` or returns global orders. If orders are globally scoped, this should work. If they're scoped per shop, seeding via `/admin/fixtures/load` (which doesn't accept a shopDomain) may create orders in a "global" bucket that isn't what the rate-limit test's token sees.
   - Recommendation: Investigate the `orders` resolver to check if it filters by `shop_domain`. If it doesn't (global), the test should work and the issue is elsewhere (order fixture shape: `fixtures/load` requires `gid`, but the rate-limit test passes `name`/`email`/`total_price` without `gid`). The fixture loader at `admin.ts:82-87` generates a GID via `createGID('Order', orderId)` — so the missing `gid` is handled. Most likely the fixture load fails silently because `total_price` is `'10.00'` but the fixture schema may require `currency_code`. If `loadOrders` fails and returns 0 orders, all 5 queries cost ~1pt and never exhaust the 1000-point bucket.

2. **Whether to fix rate-limit test in Phase 29**
   - What we know: Phase 29's description says "32+ test failures from Phase 23 OAuth tightening". The rate-limit test failure is separate (uses `POST /admin/tokens` already, so not OAuth-related).
   - What's unclear: Whether fixing the rate-limit test is in scope.
   - Recommendation: Fix it as part of Phase 29. It's in the same file set (`test/integration/rate-limit.test.ts`) and the overall goal is green integration tests. One additional fix doesn't add meaningful scope.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `twins/shopify/vitest.config.ts` (extends `vitest.shared.js`) |
| Quick run command | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` |
| Full suite command | `pnpm vitest run --project "@dtu/twin-shopify"` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-21 (gap: transition validation) | PENDING→CANCELLED rejected with userErrors | integration | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` | The existing `billing-state-machine.test.ts` does NOT yet test invalid transitions — Wave 0 needs 2 new tests added |
| SHOP-21 (gap: double-cancel) | CANCELLED→CANCELLED rejected with userErrors | integration | same command | Same file, new tests needed |
| Test migration | All 49 previously-failing tests in integration.test.ts + pagination + order-lifecycle now pass | integration | `pnpm vitest run --project "@dtu/twin-shopify"` | Files exist, tests fail — fix without adding test files |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts`
- **Per wave merge:** `pnpm vitest run --project "@dtu/twin-shopify"`
- **Phase gate:** Full integration suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `twins/shopify/test/integration/billing-state-machine.test.ts` — append 2 new tests for invalid transitions (PENDING→CANCELLED, CANCELLED→CANCELLED); currently has 7 tests, needs 9

*(All other files exist. The migration work edits existing test files. No new files needed.)*

---

## Detailed File Impact List

### Files to modify

| File | Change Type | Change Summary |
|------|-------------|----------------|
| `twins/shopify/src/schema/resolvers.ts` | Add guard | Insert `status !== 'ACTIVE'` check before `updateAppSubscriptionStatus` in `appSubscriptionCancel` |
| `twins/shopify/test/integration/billing-state-machine.test.ts` | Add tests | Add SHOP-21e (PENDING→cancel rejected) and SHOP-21f (CANCELLED→cancel rejected) test cases |
| `twins/shopify/test/integration.test.ts` | Migrate OAuth | Replace all `POST /admin/oauth/access_token` calls with `POST /admin/tokens`; update OAuth describe block to use valid credentials + authorize flow (or pivot to asserting rejection of bare codes) |
| `twins/shopify/test/integration/pagination.test.ts` | Migrate OAuth | Replace `POST /admin/oauth/access_token` in `beforeEach` with `POST /admin/tokens` |
| `twins/shopify/tests/integration/order-lifecycle.test.ts` | Migrate OAuth | Replace `getToken()` helper and its call sites with `seedToken()` pattern using `POST /admin/tokens` |
| `twins/shopify/test/integration/rate-limit.test.ts` | Fix test | Investigate fixture load failure; fix 1 failing 429 throttle test |

### Files NOT to modify
- `packages/state/src/state-manager.ts` — `updateAppSubscriptionStatus` already correct; no schema change needed
- `twins/shopify/src/plugins/admin.ts` — `GET /admin/charges/:id/confirm_recurring` already validates `status !== 'PENDING'` and only transitions PENDING→ACTIVE; no change needed
- `twins/shopify/src/plugins/oauth.ts` — Phase 23 OAuth tightening is correct and intentional; do NOT relax it

---

## Exact Failure Count (from live test run 2026-03-13)

```
Test Files: 4 failed | 7 passed (11 total)
Tests: 50 failed | 107 passed (157 total)

Breakdown:
- test/integration.test.ts: 45 tests total, 32 failed
- tests/integration/order-lifecycle.test.ts: 7 tests, 7 failed
- test/integration/pagination.test.ts: 10 tests, 10 failed
- test/integration/rate-limit.test.ts: 5 tests, 1 failed
TOTAL: 50 failing

Passing suites (no changes needed):
- test/integration/billing-state-machine.test.ts: 7/7 GREEN
- test/integration/rest-persistence.test.ts: passing
- test/ui.test.ts: passing
- test/services/rate-limiter.test.ts: passing
- test/services/cursor.test.ts: passing
- test/services/query-cost.test.ts: passing
```

---

## Sources

### Primary (HIGH confidence)
- Live source read: `twins/shopify/src/schema/resolvers.ts` — confirms `appSubscriptionCancel` does not check current status
- Live source read: `twins/shopify/src/plugins/admin.ts` — confirms `GET /admin/charges/:id/confirm_recurring` checks `status !== 'PENDING'` (so ACTIVE→ACTIVE double-confirm is blocked, but PENDING→CANCELLED in resolvers is not blocked)
- Live source read: `twins/shopify/src/plugins/oauth.ts` — confirms `client_id` + `client_secret` are required for auth-code grant
- Live test run: `pnpm vitest run --project "@dtu/twin-shopify"` — 50 failures confirmed, exact breakdown documented above
- Live test run: `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` — 7/7 GREEN confirmed
- `.planning/v1.2-MILESTONE-AUDIT.md` — authoritative gap analysis, SHOP-21 gap documented at line 40-46

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` accumulated context — Phase 23 and Phase 24 decisions, OAuth tightening history
- `.planning/phases/24-.../24-VERIFICATION.md` — confirms pre-existing failures listed at line 130-134

## Metadata

**Confidence breakdown:**
- Billing transition guard: HIGH — gap is confirmed by audit + code inspection, fix is 5 lines
- Test migration: HIGH — root cause is confirmed (OAuth tightening), all call sites located, fix pattern established in Phase 24
- Rate-limit 429: MEDIUM — most likely fixture load issue, but exact root cause requires brief investigation

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, only changes if more OAuth tightening happens)
