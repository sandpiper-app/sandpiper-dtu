---
phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting
plan: 03
subsystem: api
tags: [graphql, rate-limiting, shopify, leaky-bucket, cost-estimation]

# Dependency graph
requires:
  - phase: 24-01
    provides: Wave 0 TDD test scaffold with RED rate-limit tests (SHOP-24)
  - phase: 24-02
    provides: REST persistence implementation (same phase, prior plan)

provides:
  - LeakyBucketRateLimiter.refund(key, amount) method
  - tryConsume() allows requests when bucket > 0 (Shopify-correct behavior, can go negative)
  - computeActualCost() function in graphql.ts that walks response data to compute real cost
  - Post-execution actualQueryCost injection and bucket refund in admin GraphQL handler
  - maximumAvailable=1000 in all throttleStatus fields (was incorrectly 2000)

affects:
  - 24-04 (billing-state-machine tests depend on rate limiter not throttling empty queries)
  - 27 (conformance/coverage — rate limiter now behaves like real Shopify)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pre-consume requestedQueryCost upfront, execute query, compute actualQueryCost from response data, refund the difference
    - computeActualCost walks GraphQL response data for edges/nodes arrays to count actual items returned
    - Bucket can go negative after a request; next request is denied when available <= 0

key-files:
  created: []
  modified:
    - twins/shopify/src/services/rate-limiter.ts
    - twins/shopify/src/index.ts
    - twins/shopify/src/plugins/graphql.ts
    - twins/shopify/test/integration/rate-limit.test.ts
    - twins/shopify/test/services/rate-limiter.test.ts

key-decisions:
  - "Shopify allows requests when bucket has ANY capacity (available > 0), not when available >= cost — bucket can go negative, next request is throttled when available <= 0"
  - "computeActualCost returns 1 (base cost) when all connection fields are empty, making billing.check (0 items) cost nearly nothing post-execution"
  - "POST /admin/tokens used for token seeding in rate-limit integration tests — consistent with Phase 24-01 decision, avoids Phase 23 OAuth credential requirement"
  - "Throttling tests seed order fixtures so connections return real items; without seeded data, refund logic makes empty-result queries too cheap to exhaust the bucket"

patterns-established:
  - "Rate limiter pre-consume/execute/refund pattern: tryConsume(requestedCost) → yoga.fetch() → computeActualCost(data) → refund(delta)"
  - "Integration tests that test bucket exhaustion must seed matching fixtures so actualQueryCost approximates requestedQueryCost"

requirements-completed:
  - SHOP-24

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 24 Plan 03: Fix Rate Limiter Bucket Size and actualQueryCost Computation Summary

**Leaky bucket corrected to 1000 pts with Shopify-accurate tryConsume/refund behavior: empty connections cost 1 pt via computeActualCost, eliminating false billing.check throttling**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T22:34:00Z
- **Completed:** 2026-03-12T22:42:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Fixed bucket size from 2000 (workaround) back to 1000 (Shopify default) in index.ts
- Changed tryConsume() to allow requests when available > 0 (Shopify behavior), with bucket allowed to go negative
- Added refund() method to LeakyBucketRateLimiter for post-execution cost crediting
- Implemented computeActualCost() that walks GraphQL response data to count actual items in Connection fields
- Post-execution: refund (requestedQueryCost - actualQueryCost) back to bucket; inject accurate actualQueryCost and post-refund currentlyAvailable into extensions.cost

## Task Commits

Each task was committed atomically:

1. **Task 1: Add refund() to LeakyBucketRateLimiter and fix index.ts bucket size** - `227f6c6` (fix)
2. **Task 2: Implement post-execution actualQueryCost in graphql.ts** - `95268ce` (feat)

**Plan metadata:** (final commit hash recorded below)

## Files Created/Modified

- `twins/shopify/src/services/rate-limiter.ts` - tryConsume changed to allow when available > 0 (not >= cost); refund() method added
- `twins/shopify/src/index.ts` - LeakyBucketRateLimiter constructor changed from 2000 to 1000 pts; comment updated
- `twins/shopify/src/plugins/graphql.ts` - computeActualCost() added as module-level function; post-execution actualQueryCost computation and refund logic added to admin GraphQL handler
- `twins/shopify/test/integration/rate-limit.test.ts` - Token seeding migrated from /admin/oauth/access_token to /admin/tokens; throttling tests now seed order fixtures for accurate cost exhaustion; loop bounds adjusted
- `twins/shopify/test/services/rate-limiter.test.ts` - Unit test assertions updated to match new Shopify-correct tryConsume behavior (throttle at <= 0, not when cost > available)

## Decisions Made

- **tryConsume threshold change:** Shopify throttles when the bucket is at 0 or negative, not when requested cost exceeds current available. The bucket can go negative — the next request is what gets denied. This aligns with Shopify's documented behavior where a large query is allowed if any capacity exists.
- **computeActualCost returns 1 for empty connections:** When all edges/nodes arrays in the response are empty, the function returns 1 (base cost). This models the real Shopify behavior where billing.check with 0 oneTimePurchases charges minimal points.
- **Throttling tests require seeded fixtures:** With the refund logic in place, queries returning 0 items are almost free. Tests that need to exhaust the bucket must seed enough items so actualQueryCost ≈ requestedQueryCost.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Token seeding in rate-limit.test.ts used broken OAuth path**
- **Found during:** Task 2 (implementing computeActualCost — tests couldn't get a valid token)
- **Issue:** Both describe blocks in rate-limit.test.ts used `POST /admin/oauth/access_token` with `{ code: 'test-rate-limit' }` — no client_id/client_secret. Phase 23 OAuth tightening requires credentials, so token was always undefined, causing all 5 tests to fail with "invalid value undefined for header".
- **Fix:** Replaced OAuth call with `POST /admin/tokens` using a fixed test token string. Added re-seeding after `/admin/reset` calls since reset wipes all tokens.
- **Files modified:** twins/shopify/test/integration/rate-limit.test.ts
- **Verification:** All 5 integration tests pass
- **Committed in:** 95268ce (Task 2 commit)

**2. [Rule 1 - Bug] Throttling tests didn't exhaust bucket with empty-result queries**
- **Found during:** Task 2 (post-computeActualCost implementation verification)
- **Issue:** After implementing refund logic, `orders(first:250)` returning 0 items only costs 1 point net, so the bucket never exhausted in the 5-iteration throttling test loop. Similarly, the reset test with 10 iterations of `orders(first:100)` (empty) never throttled.
- **Fix:** Added fixture seeding (250 orders for throttling test, 100 orders for reset test) so connections return real items. Also increased reset test loop from 10 to 15 iterations to account for accurate net-cost math (1000/101 ≈ 10 requests to drain).
- **Files modified:** twins/shopify/test/integration/rate-limit.test.ts
- **Verification:** Both throttling tests now correctly produce HTTP 429
- **Committed in:** 95268ce (Task 2 commit)

**3. [Rule 1 - Bug] rate-limiter unit tests asserted old tryConsume behavior**
- **Found during:** Task 1 (after changing tryConsume threshold)
- **Issue:** Three unit tests asserted that tryConsume rejects when cost > available: "throttles when cost exceeds available", "retryAfterMs is ceil of fractional seconds", and "reports currentlyAvailable when throttled". The new Shopify-correct behavior allows requests until available <= 0.
- **Fix:** Updated the three tests to assert new behavior: throttle only at <= 0, bucket can go negative, retryAfterMs is > 0 when throttled.
- **Files modified:** twins/shopify/test/services/rate-limiter.test.ts
- **Verification:** All 16 unit tests pass (1 test split into 2 for clarity)
- **Committed in:** 227f6c6 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking token auth, 2 Rule 1 bugs triggered by correct implementation of Shopify behavior)
**Impact on plan:** All auto-fixes necessary for tests to work with the new rate limiter semantics. No scope creep.

## Issues Encountered

- The bucket's "allow when > 0, can go negative" behavior requires careful test design: tests that check throttling must seed enough data so actual items are returned, ensuring actualQueryCost ≈ requestedQueryCost. Empty-result queries are essentially free after the refund.

## Next Phase Readiness

- SHOP-24 requirements satisfied: maximumAvailable=1000, actualQueryCost < requestedQueryCost for sparse results, billing.check won't throttle
- Pre-existing failures in billing-state-machine.test.ts (Plan 04's scope) and older OAuth-pattern tests remain RED as expected
- Plan 04 (billing state machine) can proceed; the rate limiter now handles billing queries correctly

---
*Phase: 24-shopify-rest-persistence-billing-state-machine-rate-limiting*
*Completed: 2026-03-12*
