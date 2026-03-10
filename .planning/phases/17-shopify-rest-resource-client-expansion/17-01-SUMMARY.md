---
phase: 17-shopify-rest-resource-client-expansion
plan: "01"
subsystem: testing
tags: [shopify-api, graphql-client, graphql-proxy, sdk-verification, vitest]

# Dependency graph
requires:
  - phase: 16-shopify-shopify-api-platform-surface
    provides: createShopifyApiClient helper + setAbstractFetchFunc twin redirect infrastructure
provides:
  - SHOP-14 GraphqlClient and graphqlProxy verification against live Shopify twin (9 tests)
affects: [17-shopify-rest-resource-client-expansion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "shopify.clients.Graphql accessed via instance property (NOT direct import from lib path)"
    - "query() hard-removed in SDK v12.x: throws FeatureDeprecatedError instead of logging warning"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts
  modified: []

key-decisions:
  - "query() test reflects actual SDK v12.x behavior: FeatureDeprecatedError thrown (hard-removed), not backward-compat working method — verified against compiled SDK source"
  - "GraphqlClient accessed via shopify.clients.Graphql (instance property), not direct import — respects SDK public surface pattern"

patterns-established:
  - "Pattern: query() deprecated verification should assert throws rather than returns body in SDK >= 12.0.0"

requirements-completed:
  - SHOP-14

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 17 Plan 01: GraphqlClient + graphqlProxy SHOP-14 Verification Summary

**9-test suite verifying shopify.clients.Graphql request/error paths and graphqlProxy round-trips against the live twin using Phase 16 redirect infrastructure**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T22:18:57Z
- **Completed:** 2026-03-09T22:20:28Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- GraphqlClient.request() verified against twin — products query, variables, and GraphqlQueryError on bad input
- graphqlProxy verified with string and object rawBody formats, plus rejection paths (wrong key, empty accessToken)
- API version override (ApiVersion.January24) accepted by SDK and normalized by setAbstractFetchFunc intercept
- Full SDK suite remains green: 66 tests pass (9 new + 57 Phase 14-16)

## Task Commits

Each task was committed atomically:

1. **Task 1: shopify-api-graphql-client.test.ts — GraphqlClient + graphqlProxy (9 tests)** - `4acc0a2` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts` - 9 tests for SHOP-14: GraphqlClient request/error/version + graphqlProxy round-trips and rejection paths

## Decisions Made

- **query() test changed to assert throws**: The plan described `query()` as "deprecated but still functional" and expected `legacyResponse.body` to be defined. However, in SDK v12.x, `logger.deprecated()` compares the current library version (12.3.0) against the deprecation version (12.0.0) and throws `FeatureDeprecatedError` since `12.3.0 >= 12.0.0`. The method is hard-removed in practice. The test was updated to assert the throw, which correctly verifies the SDK surface — callers must migrate to `request()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 4 (query() deprecated compat) updated from "returns body" to "throws FeatureDeprecatedError"**
- **Found during:** Task 1 (RED phase test run)
- **Issue:** SDK v12.3.0 `logger.deprecated('12.0.0', ...)` throws `FeatureDeprecatedError` because `12.3.0 >= 12.0.0`. The plan expected the method to return a body (backward-compat working), but it's hard-removed.
- **Fix:** Updated test assertion from `expect(legacyResponse.body).toBeDefined()` to `await expect(...query()).rejects.toThrow('Feature was deprecated in version 12.0.0')`
- **Files modified:** tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts
- **Verification:** 9/9 tests pass
- **Committed in:** 4acc0a2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix aligns test with actual SDK behavior. The backward-compat spirit is preserved — the test verifies the `query()` surface exists and surfaces the migration signal to callers.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SHOP-14 complete — GraphqlClient and graphqlProxy verified against twin
- Ready for Plan 17-02 (next plan in phase, REST resource clients or other Shopify client surface)

---
*Phase: 17-shopify-rest-resource-client-expansion*
*Completed: 2026-03-09*

## Self-Check: PASSED

- tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts: FOUND
- .planning/phases/17-shopify-rest-resource-client-expansion/17-01-SUMMARY.md: FOUND
- Commit 4acc0a2 (feat): FOUND
- Commit e9e07f8 (docs): FOUND
