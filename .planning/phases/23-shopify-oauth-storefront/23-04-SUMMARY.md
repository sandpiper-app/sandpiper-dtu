---
phase: 23-shopify-oauth-storefront
plan: "04"
subsystem: api
tags: [shopify, storefront, graphql, auth, sdk-verification]

# Dependency graph
requires:
  - phase: 23-shopify-oauth-storefront
    provides: separate Storefront schema/Yoga instance and token-type-aware Storefront auth from 23-02
provides:
  - dual-header Storefront auth resolution for public and private Storefront tokens
  - private-header precedence so the pinned StorefrontClient path remains canonical
  - focused sdk-verification coverage for public-header success, admin rejection, and header precedence
affects: [sdk-verification, shopify-storefront, 24-shopify-rest-persistence-billing-rate-limiting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Storefront auth header resolution is centralized in graphql.ts and shared by the Fastify route plus Storefront Yoga context"
    - "Storefront compatibility widening preserves the private-token header as canonical when both public and private headers are present"

key-files:
  created:
    - .planning/phases/23-shopify-oauth-storefront/23-04-SUMMARY.md
  modified:
    - twins/shopify/src/plugins/graphql.ts
    - tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts

key-decisions:
  - "Accept both Storefront auth headers but resolve Shopify-Storefront-Private-Token first so the pinned SDK path stays canonical"
  - "Reuse the same resolved Storefront token in both the Fastify wrapper and Storefront Yoga context so public and private header requests share the same admin-token rejection behavior"

patterns-established:
  - "Pattern: widen twin compatibility at a single shared header-resolution seam instead of branching auth logic across route and GraphQL context"

requirements-completed: [SHOP-19]

# Metrics
duration: 10min
completed: 2026-03-12
---

# Phase 23 Plan 04: Storefront public-header compatibility Summary

**Storefront GraphQL now accepts `X-Shopify-Storefront-Access-Token` while keeping private-header precedence, private-header compatibility, and admin-token rejection intact**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-12T23:18:15Z
- **Completed:** 2026-03-12T23:28:03Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added raw Storefront POST coverage for public-header success, public-header admin rejection, and dual-header precedence in the SDK verification suite
- Centralized Storefront header resolution in `graphql.ts` and reused it in both the Fastify Storefront route and Storefront Yoga context
- Preserved the existing private-token path so Storefront requests still succeed when the pinned SDK sends `Shopify-Storefront-Private-Token`

## Task Commits

The parallel executor could not acquire `.git/index.lock`, so the task-level TDD split was not possible inside that worker. After the wave completed, the orchestrator backfilled the plan changes as a single commit:

1. **BACKFILL: accept the public Storefront auth header and add coverage** - `52b5a21`

**Plan metadata:** tracked in the follow-up phase docs commit after verification passed.

## Files Created/Modified

- `.planning/phases/23-shopify-oauth-storefront/23-04-SUMMARY.md` - records execution outcome, verification evidence, and environment blockers
- `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` - adds raw Storefront POST coverage for public-header success, admin rejection, and private-header precedence
- `twins/shopify/src/plugins/graphql.ts` - resolves Storefront tokens from both accepted headers, preferring the private header, and shares that logic across the route and Yoga context

## Verification Results

- `pnpm -r --filter @dtu/twin-shopify run build` - passed
- `node --input-type=module -e "...buildApp() + app.inject() storefront header matrix..."` - passed:
  - `X-Shopify-Storefront-Access-Token` with a storefront token returned `200` and `Sandpiper Dev Store`
  - admin tokens were rejected with `401` on both the public-header and private-header paths
  - a valid private header still won when both Storefront headers were present and the public header was invalid
- `pnpm test:sdk --reporter=verbose --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` - blocked in this sandbox because Vitest global setup tries to `listen()` on localhost and local socket binds are denied here

## Decisions Made

- Accept both Storefront auth headers but keep `Shopify-Storefront-Private-Token` canonical so the pinned `StorefrontClient` behavior remains the default path.
- Use one shared resolver for Storefront auth headers so the Fastify wrapper and Storefront Yoga context cannot drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched verification from socket-bound Vitest runs to in-process Fastify inject checks**
- **Found during:** Task 1 (Add public Storefront header compatibility without breaking the private-token SDK path)
- **Issue:** The sandbox denies local `listen()` calls, so the planned `pnpm test:sdk ...` command cannot boot the in-process twins here
- **Fix:** Rebuilt `@dtu/twin-shopify` and verified the Storefront header matrix with `buildApp()` plus `app.inject()` against the modified route
- **Files modified:** None
- **Verification:** `pnpm -r --filter @dtu/twin-shopify run build`; `node --input-type=module -e "...buildApp() + app.inject() storefront header matrix..."`
- **Committed in:** backfilled later in `52b5a21`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The code change matched the plan. Only the verification transport changed because the sandbox cannot open local sockets.

## Issues Encountered

- The live SDK verification command is still blocked here because the sandbox denies local `listen()` calls.
- The parallel executor temporarily failed to acquire `.git/index.lock`; the orchestrator backfilled the plan commit afterward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SHOP-19’s remaining public-header gap is closed in code and documented with focused coverage.
- Phase 23 verification now passes; the next step is Phase 24 planning/execution.

## Self-Check: PASSED

- **Found:** `.planning/phases/23-shopify-oauth-storefront/23-04-SUMMARY.md`
- **Found:** `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts`
- **Found:** `twins/shopify/src/plugins/graphql.ts`
- **Verified:** backfill commit `52b5a21` is present in git history

---
*Phase: 23-shopify-oauth-storefront*
*Completed: 2026-03-12*
