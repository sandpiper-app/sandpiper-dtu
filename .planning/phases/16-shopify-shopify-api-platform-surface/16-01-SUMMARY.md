---
phase: 16-shopify-shopify-api-platform-surface
plan: "01"
subsystem: testing

tags: [shopify-api, webhooks, hmac, jwt, jose, vitest, tdd]

# Dependency graph
requires:
  - phase: 15-shopify-admin-client-compatibility
    provides: "createShopifyClient pattern (customFetchApi intercept) and twin infrastructure for SDK tests"

provides:
  - "createShopifyApiClient() factory using setAbstractFetchFunc to redirect shopify-api HTTP to twin"
  - "mintSessionToken() HS256 JWT helper for session/auth tests"
  - "computeShopifyHmac() base64 HMAC-SHA256 for webhook validation tests"
  - "buildMockWebhookRequest() IncomingMessage-compatible mock for validate() calls"
  - "SHOP-12: 7 passing tests for webhooks.validate, flow.validate, fulfillmentService.validate"

affects:
  - 16-02
  - 16-03
  - 16-04

# Tech tracking
tech-stack:
  added:
    - "jose@^6.2.1 (devDependency at workspace root — SignJWT for session token minting)"
  patterns:
    - "setAbstractFetchFunc intercept pattern: overrides globalThis.fetch after node adapter import to redirect all shopify-api HTTP"
    - "Module-level shopify instance for pure in-process tests (no beforeEach reset needed)"
    - "TDD: RED (exports test fails) → GREEN (helper file created, exports test passes) → Task 2 (webhook tests)"

key-files:
  created:
    - "tests/sdk-verification/helpers/shopify-api-client.ts"
    - "tests/sdk-verification/sdk/shopify-api-webhooks.test.ts"
  modified:
    - "package.json (added jose devDependency)"
    - "pnpm-lock.yaml"

key-decisions:
  - "setAbstractFetchFunc from @shopify/shopify-api/runtime (not runtime/http subpath — not in exports map)"
  - "jose added as direct devDependency at workspace root: pnpm hoistPattern=* marks transitive deps private, making them unreachable from test files"
  - "BillingConfig imported as type for the billing option parameter — Record<string, unknown> was incompatible"
  - "Module-level shopify instance is safe for webhook tests because validate() is pure HMAC crypto with no abstractFetch calls"
  - "SHOPIFY_API_URL fallback to http://127.0.0.1:9999 in createShopifyApiClient to avoid crashing when env var not set during module-level instantiation"

patterns-established:
  - "Phase 16 helper import order: (1) adapters/node side-effect, (2) setAbstractFetchFunc from runtime, (3) shopifyApi factory"
  - "All Phase 16 test files import createShopifyApiClient from '../helpers/shopify-api-client.js'"

requirements-completed:
  - SHOP-12

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 16 Plan 01: shopify-api-client helper factory + SHOP-12 webhook validate tests

**createShopifyApiClient() factory with setAbstractFetchFunc twin redirect, jose-powered session token helper, and 7 passing SHOP-12 tests covering webhooks/flow/fulfillmentService HMAC validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T20:46:39Z
- **Completed:** 2026-03-09T20:51:15Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `tests/sdk-verification/helpers/shopify-api-client.ts` — the shared Phase 16 helper factory using `setAbstractFetchFunc` to wire all `shopifyApi()` HTTP calls to the local twin
- Created `tests/sdk-verification/sdk/shopify-api-webhooks.test.ts` — 7 pure in-process SHOP-12 tests verifying webhooks.validate, flow.validate, and fulfillmentService.validate with correct/invalid HMAC and missing headers
- All 40 sdk-verification tests pass (8 test files, including 7 pre-existing and 1 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: shopify-api-client.ts helper factory** - `83d3b64` (feat)
2. **Task 2: shopify-api-webhooks.test.ts SHOP-12 tests** - `18eb308` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD approach — Task 1 used RED (temp exports test) → GREEN (helper file). Task 2 tests written and verified directly against the new helper._

## Files Created/Modified

- `tests/sdk-verification/helpers/shopify-api-client.ts` — Factory + 4 helpers: createShopifyApiClient, mintSessionToken, computeShopifyHmac, buildMockWebhookRequest
- `tests/sdk-verification/sdk/shopify-api-webhooks.test.ts` — SHOP-12 validate test suite (7 tests)
- `package.json` — Added jose@^6.2.1 as devDependency
- `pnpm-lock.yaml` — Updated for jose addition

## Decisions Made

- `setAbstractFetchFunc` imported from `@shopify/shopify-api/runtime` (not the `runtime/http` subpath, which is not in the package's exports map)
- `jose` added as a direct workspace root devDependency because pnpm's `hoistPattern: '*'` marks transitive deps as `private`, making `jose` unreachable from test files even though it's a transitive dep of `@shopify/shopify-api`
- `BillingConfig` type used for the billing option (not `Record<string, unknown>`) — the shopifyApi() overload requires proper BillingConfig for type safety
- Module-level shopify instance is safe for pure in-process tests — `validate()` is a crypto operation that never calls `abstractFetch`, so no beforeEach reset is needed
- Default fallback `SHOPIFY_API_URL = 'http://127.0.0.1:9999'` prevents crash during module-level instantiation when env var isn't set in isolated test runs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added jose as direct devDependency**
- **Found during:** Task 1 (shopify-api-client.ts helper factory)
- **Issue:** `jose` is a transitive dep of `@shopify/shopify-api` but pnpm marks it `private` in hoisted deps, making `import * as jose from 'jose'` fail with `Cannot find package` from test files
- **Fix:** `pnpm add -D jose --workspace-root` — added jose@^6.2.1 as direct devDependency at workspace root
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `node -e "import('jose').then(m => console.log('jose OK:', typeof m.SignJWT))"` prints `jose OK: function`
- **Committed in:** 83d3b64 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed billing option TypeScript type**
- **Found during:** Task 1 (TypeScript type check)
- **Issue:** `billing?: Record<string, unknown>` was incompatible with `shopifyApi()` overload requiring `BillingConfig`
- **Fix:** Imported `BillingConfig` type from `@shopify/shopify-api` and used as parameter type
- **Files modified:** tests/sdk-verification/helpers/shopify-api-client.ts
- **Verification:** `npx tsc --noEmit --moduleResolution bundler ...` produces no errors
- **Committed in:** 83d3b64 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None — all 7 SHOP-12 tests passed on first run. No "Missing adapter implementation" errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `createShopifyApiClient()` factory is ready for all remaining Phase 16 plans (16-02 through 16-05)
- SHOP-12 satisfied — webhook/flow/fulfillmentService validate verified
- Pure in-process pattern established: webhook tests do not require twin to be running
- Next: Plan 16-02 (SHOP-10/11 auth/session behaviors)

---
*Phase: 16-shopify-shopify-api-platform-surface*
*Completed: 2026-03-09*
