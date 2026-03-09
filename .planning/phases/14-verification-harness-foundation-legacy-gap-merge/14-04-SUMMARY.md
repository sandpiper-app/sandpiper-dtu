---
phase: 14-verification-harness-foundation-legacy-gap-merge
plan: "04"
subsystem: testing
tags: [vitest, webhooks, hmac, http-server, ui-smoke, shopify, slack]

requires:
  - phase: 14-verification-harness-foundation-legacy-gap-merge-02
    provides: sdk-verification workspace, seeders (resetShopify/resetSlack/seedShopifyAccessToken), global-setup twin lifecycle

provides:
  - HMAC signature verification tests for Shopify webhook delivery (tests/sdk-verification/legacy/hmac-signature.test.ts)
  - Async webhook delivery timing verification (tests/sdk-verification/legacy/webhook-timing.test.ts)
  - UI endpoint structure smoke checks for Shopify + Slack twins (tests/sdk-verification/legacy/ui-structure.test.ts)
  - singleFork pool config for deterministic test isolation on shared twin state

affects:
  - All Phase 14-20 SDK conformance plans (singleFork pool setting now applies to entire sdk-verification project)
  - pnpm test:sdk unified suite (legacy tests now included)

tech-stack:
  added: []
  patterns:
    - Local HTTP listener pattern (createServer + listen(0) + ephemeral port) for webhook receipt in tests
    - signPayload inline helper using node:crypto createHmac for HMAC verification without @dtu/webhooks import
    - singleFork: true pool option to run all test files in a single worker, preventing cross-file state races
    - Product/order creation assertion before webhook wait to surface auth failures fast rather than timing out

key-files:
  created:
    - tests/sdk-verification/legacy/hmac-signature.test.ts
    - tests/sdk-verification/legacy/webhook-timing.test.ts
    - tests/sdk-verification/legacy/ui-structure.test.ts
  modified:
    - tests/sdk-verification/vitest.config.ts (added pool:forks singleFork:true)

key-decisions:
  - "singleFork:true chosen over fileParallelism:false — both prevent concurrent file execution but singleFork runs all files in ONE worker process, sharing module instances and process.env without re-spawning; this eliminates the token-invalidation race where worker A's resetShopify wipes tokens seeded by worker B"
  - "orderCreate mutation requires totalPrice and currencyCode — the plan's example mutation omitted both required fields; the twin's resolver returns userErrors when these are missing, so no webhook is enqueued"
  - "lineItems use title/price/quantity fields — twin's LineItemInput schema does not have variantId; the plan's example used the real Shopify SDK field names which differ from the twin's simplified schema"
  - "productCreate assertion added before webhook wait — surfaces auth failures in 16ms instead of timing out after 5s, making debugging tractable"

patterns-established:
  - "Inline HTTP listener: createServer + listen(0, '127.0.0.1', resolve) for ephemeral port assignment; eliminates port conflicts and is more reliable than dedicated test ports"
  - "Webhook delivery test structure: create listener → register subscription → trigger mutation → assert mutation succeeded → wait for delivery → assert headers/body"
  - "UI smoke test depth: verify 200 + text/html content-type + html.length > 100 + structural tag presence; intentionally shallow — does not test content"

requirements-completed:
  - INFRA-13

duration: 25min
completed: "2026-03-09"
---

# Phase 14 Plan 04: Legacy Gap Merge Summary

**HMAC webhook signing verification, async delivery timing, and UI structure smoke checks migrated to sdk-verification as Vitest tests runnable via pnpm test:sdk**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-09T16:58:42Z
- **Completed:** 2026-03-09T17:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `tests/sdk-verification/legacy/hmac-signature.test.ts` with 4 tests: HMAC determinism, tamper detection, and twin-delivered header verification via ephemeral HTTP listener + GraphQL mutations
- Created `tests/sdk-verification/legacy/webhook-timing.test.ts` with 2 tests: subscription registration state check and async delivery timing via productCreate
- Created `tests/sdk-verification/legacy/ui-structure.test.ts` with 6 tests: Shopify /ui/orders, /ui/products, /ui/customers, Slack /ui — all returning HTTP 200 + text/html with structural content
- Fixed vitest.config.ts to use `pool: 'forks', singleFork: true` — eliminates cross-file state races on shared twin state

## Task Commits

Each task was committed atomically:

1. **Task 1: HMAC signature and webhook delivery verification tests** - `040c044` (feat)
2. **Task 2: UI structure smoke tests** - `bc5fec3` (feat)

**Plan metadata:** (docs — this summary commit)

## Files Created/Modified

- `tests/sdk-verification/legacy/hmac-signature.test.ts` - HMAC signing unit tests + twin webhook delivery with header verification
- `tests/sdk-verification/legacy/webhook-timing.test.ts` - Async delivery timing: subscription registration state check + productCreate delivery within 5s
- `tests/sdk-verification/legacy/ui-structure.test.ts` - UI smoke: Shopify orders/products/customers + Slack /ui — 200 + HTML + structural tags
- `tests/sdk-verification/vitest.config.ts` - Pool changed to forks/singleFork:true for deterministic cross-file test isolation

## Decisions Made

- **singleFork: true**: With the default worker pool and concurrent file execution, `resetShopify()` in one test file's `beforeEach` races with another file's authenticated GraphQL mutations, wiping the token mid-test and producing UNAUTHORIZED errors. `fileParallelism: false` still spawns separate worker processes per file, each with their own module instances — causing `process.env` and twin references to diverge subtly. `singleFork: true` runs ALL files in ONE worker process, making module instances shared and process.env consistent throughout.

- **Inline HMAC verification**: The plan specified using `node:crypto createHmac` directly rather than importing `@dtu/webhooks generateHmacSignature`. This keeps the test self-contained — if `@dtu/webhooks` were to change its signing algorithm, the test would catch the divergence rather than silently match.

- **Product creation assertion before webhook wait**: Both tests originally jumped straight to `Promise.race([deliveryPromise, 5s-timeout])`. If the mutation fails (e.g., UNAUTHORIZED), no webhook is enqueued and the test times out after 5s. By asserting `createResult.data.productCreate.product` exists before entering the race, failures surface in ~16ms with a clear message.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed orderCreate mutation missing required totalPrice and currencyCode fields**
- **Found during:** Task 1 (HMAC signature test)
- **Issue:** The plan's example orderCreate mutation only passed lineItems, omitting totalPrice and currencyCode. The twin's orderCreate resolver requires both — returns userErrors when absent. No webhook is enqueued when errors are returned, causing the delivery test to time out.
- **Fix:** Added `totalPrice: "10.00"` and `currencyCode: "USD"` to the orderCreate input in hmac-signature.test.ts.
- **Files modified:** tests/sdk-verification/legacy/hmac-signature.test.ts
- **Verification:** Webhook delivery test now completes in ~12ms (delivery arrives) instead of timing out.
- **Committed in:** 040c044 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed orderCreate lineItems using variantId instead of twin schema fields**
- **Found during:** Task 1 (HMAC signature test)
- **Issue:** The plan's example used `variantId: "gid://shopify/ProductVariant/1"` in LineItemInput. The twin's schema defines `LineItemInput` with `title: String!`, `quantity: Int!`, `price: String!` — no variantId field. GraphQL silently ignored the unknown field but `title` and `price` were missing (required), causing orderCreate to fail.
- **Fix:** Changed lineItems to `{ title: "Test Item", quantity: 1, price: "10.00" }`.
- **Files modified:** tests/sdk-verification/legacy/hmac-signature.test.ts
- **Verification:** orderCreate succeeds and returns order data; webhook is enqueued.
- **Committed in:** 040c044 (Task 1 commit)

**3. [Rule 1 - Bug] Added try-catch around JSON.parse in timing test listener**
- **Found during:** Task 1 (webhook-timing test)
- **Issue:** The `req.on('end')` handler called `JSON.parse(body)` without error handling. If body were empty or malformed, the throw would prevent `resolveDelivery()` from being called, causing the delivery promise to hang until the 5s timeout.
- **Fix:** Wrapped JSON.parse in try-catch, falling back to empty object on parse failure.
- **Files modified:** tests/sdk-verification/legacy/webhook-timing.test.ts
- **Verification:** Delivery handler is defensive; resolveDelivery() always called on end.
- **Committed in:** 040c044 (Task 1 commit)

**4. [Rule 3 - Blocking] Added singleFork:true to vitest.config.ts to prevent cross-file state races**
- **Found during:** Task 1 (webhook delivery test)
- **Issue:** The default parallel worker pool caused concurrent test files to race on shared twin state. Worker A's `beforeEach` would call `resetShopify()` while Worker B's test was executing a subscription + GraphQL mutation — wiping Worker B's auth token mid-test, causing UNAUTHORIZED errors. Initially tried `fileParallelism: false` but that still spawns separate workers per file, creating a different variant of the same isolation failure.
- **Fix:** Changed vitest.config.ts to use `pool: 'forks', poolOptions: { forks: { singleFork: true } }`. All test files now run sequentially in a single worker process, sharing process.env and module instances.
- **Files modified:** tests/sdk-verification/vitest.config.ts
- **Verification:** All 18 tests pass consistently across multiple runs.
- **Committed in:** 040c044 (Task 1 commit)

**5. [Rule 1 - Bug] Added productCreate mutation result assertion**
- **Found during:** Task 1 (webhook-timing test debugging)
- **Issue:** Without asserting the mutation result, a failed productCreate (e.g., due to auth failure) would cause the test to silently wait 5 seconds before timing out with no diagnostic information.
- **Fix:** Added `expect(createResult.data?.productCreate?.product).toBeDefined()` before the delivery wait.
- **Files modified:** tests/sdk-verification/legacy/webhook-timing.test.ts
- **Verification:** Auth failures now surface immediately (~16ms) with a clear assertion message.
- **Committed in:** 040c044 (Task 1 commit)

---

**Total deviations:** 5 auto-fixed (4 bugs, 1 blocking)
**Impact on plan:** All auto-fixes were necessary for correctness. The singleFork change is the key architectural fix — without it, the tests are flaky depending on execution order. The mutation input fixes were due to discrepancies between the plan's example mutations (based on real Shopify API) and the twin's simplified schema.

## Issues Encountered

The primary challenge was diagnosing why webhook delivery tests failed intermittently. The root cause was that Vitest's default parallel worker pool runs test files concurrently, and each file's `beforeEach` resets shared twin state (tokens, subscriptions). The race condition was non-obvious because:
1. The test PASSED when concurrent (other file's productCreate delivered to the wrong listener port, but the "right" delivery also arrived quickly due to event loop interleaving)
2. With sequential execution, token invalidation became consistently reproducible
3. `singleFork: true` was the correct fix — sharing the event loop means all async operations including twin's webhook queue delivery and test listeners are in the same Node.js process

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three legacy test files pass as part of `pnpm test:sdk` (18 tests total across 5 files)
- `singleFork: true` pool config is in place for all future sdk-verification test plans
- Phase 14 plan 04 complete — remaining plans: 14-05 (drift detection / manifest generation)

---
*Phase: 14-verification-harness-foundation-legacy-gap-merge*
*Completed: 2026-03-09*
