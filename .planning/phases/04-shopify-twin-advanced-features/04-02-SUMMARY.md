---
phase: 04-shopify-twin-advanced-features
plan: 02
subsystem: api
tags: [graphql, pagination, relay, cursor, sqlite, shopify-twin]

# Dependency graph
requires:
  - phase: 04-shopify-twin-advanced-features
    provides: "Plan 04-01: query cost calculator and leaky bucket rate limiter services"
  - phase: 02-shopify-twin-core
    provides: "StateManager with orders/products/customers tables and list methods"
  - phase: 01-foundation
    provides: "Monorepo, @dtu/state package, vitest shared config"
provides:
  - "encodeCursor/decodeCursor utilities with resource type validation in twins/shopify/src/services/cursor.ts"
  - "PageInfo type in schema with hasNextPage, hasPreviousPage, startCursor, endCursor"
  - "cursor field on all edge types (OrderEdge, ProductEdge, CustomerEdge, LineItemEdge)"
  - "after/before/last pagination args on all connection queries"
  - "paginate() generic helper in resolvers.ts applying Relay-spec cursor logic"
  - "ORDER BY id ASC for deterministic stable cursor pagination across all list queries"
  - "Cross-resource cursor injection prevention via resource type in cursor payload"
affects:
  - "05-slack-twin (pagination pattern to replicate for Slack twin connections)"
  - "conformance suites (pagination behavior now testable against live Shopify API)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Relay cursor format: base64(arrayconnection:{ResourceType}:{id}) with resource type prefix"
    - "Duck-typed GraphQL type traversal: ofType property for NonNull/List unwrapping, getFields() for object type detection — avoids cross-realm instanceof failures under tsx/ESM"
    - "Deterministic pagination via id ASC (AUTOINCREMENT) instead of created_at DESC"

key-files:
  created:
    - twins/shopify/src/services/cursor.ts
    - twins/shopify/test/services/cursor.test.ts
    - twins/shopify/test/integration/pagination.test.ts
    - twins/shopify/test/integration/rate-limit.test.ts
  modified:
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/schema/resolvers.ts
    - packages/state/src/state-manager.ts
    - twins/shopify/src/services/query-cost.ts
    - twins/shopify/src/index.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/plugins/graphql.ts

key-decisions:
  - "Cursor format includes resource type: base64(arrayconnection:{Type}:{id}) prevents cross-resource cursor injection (Pitfall 5)"
  - "ORDER BY id ASC replaces created_at DESC: AUTOINCREMENT id guarantees monotonically increasing unique values; fixtures loaded rapidly share same timestamp making created_at unreliable"
  - "paginate() is generic with defensive re-sort: items from DB are already sorted ASC, but defensive sort ensures correctness even if caller passes unsorted data"
  - "Duck typing for GraphQL cross-realm safety: ofType property check for NonNull/List unwrapping, getFields() presence for object type detection — replaces instanceof/isObjectType which fail when graphql loads twice under tsx/ESM"
  - "hasPreviousPage = true when after cursor provided OR when last sliced fewer than available — mirrors Relay spec cursor behavior"

patterns-established:
  - "Relay cursor pagination pattern: encodeCursor/decodeCursor with resource type, paginate() generic helper, PageInfo on all connections"
  - "GraphQL type introspection without instanceof: use duck typing (ofType, getFields) for cross-ESM-realm safety"

requirements_completed: [SHOP-05]

# Metrics
duration: 9min
completed: 2026-02-28
---

# Phase 4 Plan 02: Cursor-Based Pagination Summary

**Relay-spec cursor pagination across all Shopify twin GraphQL connections using base64 resource-typed cursors, id ASC ordering, and a generic paginate() helper**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-28T06:02:51Z
- **Completed:** 2026-02-28T06:11:39Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Cursor encode/decode utilities with resource type validation prevent cross-resource cursor injection
- PageInfo type and cursor fields added to all GraphQL connection types (Order, Product, Customer, LineItem)
- Generic paginate() helper handles first/after/last/before Relay-spec args with full pageInfo computation
- StateManager list queries changed from ORDER BY created_at DESC to ORDER BY id ASC for deterministic pagination
- 20 new tests (13 cursor unit tests + 7 pagination integration tests), all 88 tests in the suite pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Cursor utilities and schema PageInfo updates** - `9005ecd` (feat)
2. **Task 2: Paginated resolvers, id ASC ordering, integration tests** - `112c6af` (feat)

**Plan metadata:** _pending final docs commit_

_Auto-fix commits (deviation from plan):_
- **04-01 app integration fix** - `507f658` (fix)
- **04-01 query-cost linter cleanup** - `41947cf` (fix)

## Files Created/Modified
- `twins/shopify/src/services/cursor.ts` - encodeCursor/decodeCursor with resource type in payload
- `twins/shopify/src/schema/schema.graphql` - PageInfo type, cursor on edges, after/before/last args
- `twins/shopify/src/schema/resolvers.ts` - paginate() generic helper, updated QueryRoot resolvers, lineItems connection with pageInfo
- `packages/state/src/state-manager.ts` - ORDER BY id ASC for listOrders/listProducts/listCustomers
- `twins/shopify/test/services/cursor.test.ts` - 13 unit tests for cursor encode/decode/validation
- `twins/shopify/test/integration/pagination.test.ts` - 7 integration tests: forward nav, exhaustive traversal, determinism, cross-resource rejection
- `twins/shopify/src/services/query-cost.ts` - Duck typing fix for cross-realm GraphQL type detection
- `twins/shopify/src/index.ts` - LeakyBucketRateLimiter instantiation and decoration (04-01 work)
- `twins/shopify/src/plugins/admin.ts` - rateLimiter.reset() on /admin/reset (04-01 work)
- `twins/shopify/src/plugins/graphql.ts` - Rate limit pre-check, 429 response, extensions.cost injection (04-01 work)

## Decisions Made
- Cursor includes resource type to prevent cross-resource injection: `base64(arrayconnection:{Type}:{id})`
- Changed ORDER BY to id ASC — AUTOINCREMENT guarantees monotonically increasing unique values; created_at timestamps are unreliable when fixtures are loaded in rapid succession
- Duck typing for GraphQL type checks: `type.ofType !== undefined` instead of `instanceof GraphQLNonNull`, `typeof type.getFields === 'function'` instead of `isObjectType()` — avoids cross-realm failure when graphql is loaded twice under tsx/ESM

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cross-realm GraphQL instanceof failure in calculateQueryCost**
- **Found during:** Task 2 verification (full test suite)
- **Issue:** `test/integration/rate-limit.test.ts` had 4 failing tests — `queryCost` was always 0 because `isObjectType()` and `instanceof GraphQLNonNull` return false when the graphql module is loaded twice under tsx/ESM (different module realms)
- **Fix:** Replaced `instanceof GraphQLNonNull/GraphQLList` with `type.ofType !== undefined` duck typing; replaced `isObjectType()` with `typeof type.getFields === 'function'` presence check
- **Files modified:** `twins/shopify/src/services/query-cost.ts`
- **Verification:** All 4 rate-limit integration tests pass; all 12 query-cost unit tests still pass
- **Committed in:** `507f658`, `41947cf`

**2. [Rule 3 - Blocking] Committed pre-existing 04-01 app integration changes that were left uncommitted**
- **Found during:** Task 2 verification (full test suite)
- **Issue:** App-level rate limiter integration (`index.ts`, `admin.ts`, `graphql.ts`) was done by 04-01 agent but never committed. `test/integration/rate-limit.test.ts` also existed as untracked file. The debug file `rate-limit-debug.test.ts` was removed (it caused duplicate-graphql-module errors).
- **Fix:** Committed uncommitted changes from 04-01 after confirming they are correct. Removed debug artifact.
- **Files modified:** `twins/shopify/src/index.ts`, `twins/shopify/src/plugins/admin.ts`, `twins/shopify/src/plugins/graphql.ts`, `twins/shopify/test/integration/rate-limit.test.ts`
- **Verification:** All 88 tests pass including 4 rate-limit integration tests
- **Committed in:** `507f658`

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking commit)
**Impact on plan:** Both auto-fixes necessary for correctness. The cross-realm fix was a pre-existing bug discovered during verification. The uncommitted changes were 04-01 work that blocked the suite from passing.

## Issues Encountered
- Duplicate graphql module ESM realm issue: `isObjectType()` and `instanceof GraphQLNonNull` return false when graphql module is loaded twice (via tsx transform in test environment). Resolved by using duck typing throughout `calculateQueryCost`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cursor pagination fully operational across all three resource connections
- Test suite at 88/88 pass (6 test files)
- Rate limiter integration also complete (committed from 04-01)
- Ready for Plan 04-03 (order lifecycle / fulfillment flow, or other advanced features)
- Pattern established for Slack twin's connection types to reuse

## Self-Check: PASSED

All created files exist on disk. All task commits verified in git log. Full test suite (88/88) passes.

---
*Phase: 04-shopify-twin-advanced-features*
*Completed: 2026-02-28*
