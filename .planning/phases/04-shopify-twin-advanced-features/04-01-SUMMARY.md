---
phase: 04-shopify-twin-advanced-features
plan: 01
subsystem: api
tags: [graphql, rate-limiting, leaky-bucket, shopify, throttle, query-cost]

requires:
  - phase: 02-shopify-twin-core
    provides: "GraphQL plugin with makeExecutableSchema, schema.graphql with Connection types"
  - phase: 03-webhook-system-conformance-framework
    provides: "Admin plugin with /admin/reset handler"

provides:
  - "calculateQueryCost(): AST-traversal cost calculator replicating Shopify's algorithm"
  - "LeakyBucketRateLimiter: per-key bucket with tryConsume/reset, 50pts/sec refill"
  - "HTTP 429 with Retry-After header and Shopify throttled response format"
  - "extensions.cost injected into every successful GraphQL response"
  - "/admin/reset now also clears rate limiter state"

affects:
  - 04-shopify-twin-advanced-features
  - integration-testing

tech-stack:
  added: []
  patterns:
    - "Duck-typing for GraphQL type checks to avoid cross-realm instanceof failures in pnpm workspaces"
    - "Module-level rate limiter decorated onto Fastify instance for cross-plugin sharing"
    - "Pre-check pattern: cost calculation before yoga.fetch() to short-circuit without executing"

key-files:
  created:
    - twins/shopify/src/services/query-cost.ts
    - twins/shopify/src/services/rate-limiter.ts
    - twins/shopify/test/services/query-cost.test.ts
    - twins/shopify/test/services/rate-limiter.test.ts
    - twins/shopify/test/integration/rate-limit.test.ts
  modified:
    - twins/shopify/src/plugins/graphql.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/index.ts

key-decisions:
  - "Duck-typing over instanceof for GraphQL type checks: pnpm workspaces can load graphql twice (twin's node_modules vs root's node_modules/.pnpm), causing instanceof checks to fail with isDev instanceOf guard. Using ofType property check and getFields() method presence avoids cross-realm failures."
  - "Rate limiter initialized in buildApp() and decorated on fastify instance, not inside graphqlPlugin, so adminPlugin can call reset() regardless of plugin registration order"
  - "Cost calculation returns 0 on parse errors (letting Yoga handle the error), not rejecting at the rate-limit gate"

patterns-established:
  - "Duck-typing for cross-module GraphQL type checks: use ofType property presence instead of instanceof GraphQLNonNull/GraphQLList, and typeof type.getFields === 'function' instead of isObjectType()"
  - "Extensions injection pattern: parse Yoga's JSON response and merge extensions before sending"

requirements_completed: [SHOP-04]

duration: 11min
completed: 2026-02-28
---

# Phase 4 Plan 01: GraphQL Query Cost & Rate Limiting Summary

**Leaky bucket rate limiter gating GraphQL requests by Shopify cost algorithm: 429+Retry-After on exhaustion, extensions.cost on every response**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-28T06:02:51Z
- **Completed:** 2026-02-28T06:14:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `calculateQueryCost()` traverses GraphQL AST with Shopify cost rules (scalars=0, objects=1, connections=2+first, mutations=10 base, nested connections multiply by page size)
- `LeakyBucketRateLimiter` tracks per-key buckets with 50pts/sec refill, returns `retryAfterMs` when depleted
- GraphQL plugin pre-checks query cost and returns HTTP 429 with `Retry-After` header + Shopify throttled JSON on exhaustion
- All successful GraphQL responses include `extensions.cost` with `requestedQueryCost`, `actualQueryCost`, and `throttleStatus`
- `/admin/reset` now also clears rate limiter buckets alongside all other twin state

## Task Commits

Each task was committed atomically:

1. **Task 1: Create query cost calculator and leaky bucket rate limiter** - `f23f7fa` (feat)
2. **Task 2: Integrate rate limiting into GraphQL plugin and admin reset** - `507f658` (fix)
   - Cleanup: `41947cf` (fix - remove unused schema param after linter cleanup)

**Plan metadata:** (created in this commit)

## Files Created/Modified
- `twins/shopify/src/services/query-cost.ts` - AST-traversal cost calculator, Shopify algorithm, duck-typed type checks
- `twins/shopify/src/services/rate-limiter.ts` - Leaky bucket, per-key maps, tryConsume/reset
- `twins/shopify/src/plugins/graphql.ts` - Pre-check cost, 429 gate, extensions.cost injection
- `twins/shopify/src/plugins/admin.ts` - Added rateLimiter.reset() to /admin/reset handler
- `twins/shopify/src/index.ts` - Initialize LeakyBucketRateLimiter and decorate on fastify
- `twins/shopify/test/services/query-cost.test.ts` - 12 unit tests covering all cost calculation cases
- `twins/shopify/test/services/rate-limiter.test.ts` - 15 unit tests covering bucket lifecycle
- `twins/shopify/test/integration/rate-limit.test.ts` - 4 integration tests (extensions.cost, throttling, reset)

## Decisions Made
- Duck-typing for GraphQL type checks instead of instanceof/isObjectType to handle duplicate graphql module instances in pnpm workspaces (isDev instanceOf guard throws across module realms)
- Rate limiter initialized in `buildApp()` and decorated on Fastify instance rather than inside `graphqlPlugin`, ensuring admin plugin's `/admin/reset` can call `reset()` regardless of plugin registration order
- Cost calculation fails open (cost=0) on parse errors — Yoga will return a proper parse error; rate limiter shouldn't block what Yoga can handle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cross-realm instanceof failure in calculateQueryCost**
- **Found during:** Task 2 (integration test verification)
- **Issue:** Vitest loads graphql from two different module paths (twin's local node_modules vs pnpm root node_modules). `instanceof GraphQLNonNull` and `isObjectType()` (which uses graphql's internal `instanceOf` with isDev check) failed because the type objects and the constructors came from different module instances.
- **Fix:** Replaced all `instanceof` checks with duck-typing: check `type.ofType` property for NonNull/List unwrapping, check `typeof type.getFields === 'function'` for object type detection.
- **Files modified:** `twins/shopify/src/services/query-cost.ts`
- **Verification:** All 4 rate-limit integration tests pass; calculateQueryCost correctly returns 32 for `orders(first:10){edges{node{id name}}}` in Vitest environment.
- **Committed in:** `507f658` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for correctness in Vitest test environment. No scope creep.

## Issues Encountered
- pnpm workspace graphql dual-instance problem: `@graphql-tools/schema` (used by the twin's schema builder) pulls graphql from pnpm's deduped root node_modules, while `query-cost.ts` imported graphql from the twin's local node_modules. Vitest's module resolution exposed this by activating graphql's isDev instanceOf guard. Fixed by duck-typing.

## Next Phase Readiness
- Rate limiting foundation ready; 04-02 (pagination) and 04-03 (order lifecycle) can proceed
- All 88 existing tests continue to pass (37 integration + 27 new unit + 4 rate-limit + 7 pagination + 13 cursor)
- The `calculateQueryCost` function is available for use in future conformance tests verifying cost behavior

---
*Phase: 04-shopify-twin-advanced-features*
*Completed: 2026-02-28*
