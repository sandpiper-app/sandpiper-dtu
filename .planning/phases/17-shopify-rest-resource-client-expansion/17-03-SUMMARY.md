---
phase: 17-shopify-rest-resource-client-expansion
plan: "03"
subsystem: api
tags: [shopify, storefront-api, graphql-yoga, vitest, sdk-verification]

# Dependency graph
requires:
  - phase: 17-01
    provides: createShopifyApiClient with setAbstractFetchFunc intercept, sdk-verification test harness
  - phase: 14-01
    provides: sdk-verification Vitest project configuration and global setup with in-process twins

provides:
  - Twin /api/2024-01/graphql.json Storefront endpoint with Shopify-Storefront-Private-Token auth
  - ShopInfo GraphQL type and shop query returning { name: 'Sandpiper Dev Store' }
  - Two-step URL normalization in createShopifyApiClient covering both Admin and Storefront paths
  - shopify-api-storefront-client.test.ts with 4 passing SHOP-14 tests

affects:
  - future-storefront-expansion
  - sdk-verification

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Storefront API twin endpoint reuses same Yoga instance with URL rewrite to admin path for internal routing
    - Two-step normalization pattern: admin path replace + storefront path replace for multi-surface SDK clients
    - Single GraphQL schema/schema.graphql serves both Admin and Storefront endpoints via shared Yoga instance

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts
  modified:
    - twins/shopify/src/plugins/graphql.ts
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/schema/resolvers.ts
    - tests/sdk-verification/helpers/shopify-api-client.ts

key-decisions:
  - "Storefront route rewrites URL to /admin/api/2024-01/graphql.json before calling yoga.fetch() — graphqlEndpoint='/admin/api/2024-01/graphql.json' means yoga must receive that path to route correctly; Storefront path /api/2024-01/graphql.json is handled at the Fastify routing layer only"
  - "shop resolver does not call requireAuth() — Storefront API auth is enforced at the Fastify route handler level (token header check), not inside GraphQL resolvers; Admin API enforces auth per-resolver via requireAuth()"
  - "Two-step replace in normalization: /admin/api/ replace runs first, then /api/{version}/graphql.json replace — ordering ensures admin paths (already rewritten) are not double-processed by the storefront regex"

patterns-established:
  - "Storefront API pattern: separate Fastify route + Shopify-Storefront-Private-Token header + same yoga instance for schema execution"
  - "SDK client normalization pattern: chain .replace() calls per SDK surface area (Admin, Storefront, etc.)"

requirements-completed: [SHOP-14]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 17 Plan 03: Storefront API Endpoint + StorefrontClient Tests Summary

**Shopify Storefront API twin endpoint (/api/2024-01/graphql.json) with Shopify-Storefront-Private-Token auth, shop query via shared Yoga instance, and 4 StorefrontClient tests (SHOP-14)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T22:25:47Z
- **Completed:** 2026-03-09T22:27:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added ShopInfo type + shop query to schema.graphql and shop resolver to resolvers.ts returning { name: 'Sandpiper Dev Store' }
- Added /api/2024-01/graphql.json Storefront route to graphql.ts with Shopify-Storefront-Private-Token auth, reusing the same Yoga instance via URL rewrite
- Fixed createShopifyApiClient URL normalization with two-step replace covering both Admin (/admin/api/) and Storefront (/api/{version}/graphql.json) paths
- Created shopify-api-storefront-client.test.ts with 4 passing tests: live shop query, data shape, empty-token rejection, twin auth validation
- Full SDK suite: 80 tests across 14 files — all pass, no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Twin Storefront endpoint — schema, resolver, route** - `312ebc6` (feat)
2. **Task 2: Storefront version normalization fix + shopify-api-storefront-client.test.ts** - `552beca` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `twins/shopify/src/schema/schema.graphql` - Added ShopInfo type and shop field on QueryRoot
- `twins/shopify/src/schema/resolvers.ts` - Added shop resolver to QueryRoot returning { name: 'Sandpiper Dev Store' }
- `twins/shopify/src/plugins/graphql.ts` - Added /api/2024-01/graphql.json Storefront route with Shopify-Storefront-Private-Token auth
- `tests/sdk-verification/helpers/shopify-api-client.ts` - Extended normalization with second replace for Storefront path
- `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` - 4 SHOP-14 StorefrontClient tests (created)

## Decisions Made
- **Yoga URL rewrite for Storefront route:** The Storefront handler rewrites the request URL from `/api/2024-01/graphql.json` to `/admin/api/2024-01/graphql.json` before calling `yoga.fetch()`. This is required because the Yoga instance's `graphqlEndpoint` is set to the admin path; Yoga uses this to match incoming requests. Without the rewrite, Yoga returns a 404. The Fastify route still registers at the Storefront URL — the rewrite is yoga-internal only.
- **shop resolver without requireAuth():** The Storefront route validates the token at the Fastify handler level before reaching Yoga. Adding `requireAuth()` inside the resolver would require threading auth context through the Storefront request, which is unnecessary complexity. Admin API resolvers use `requireAuth()` because the Admin Yoga context sets `authorized` from the X-Shopify-Access-Token header.
- **Two-step normalization ordering:** Admin path replace runs first to avoid the storefront regex accidentally matching a partially-rewritten admin path.

## Deviations from Plan

None - plan executed exactly as written. The URL rewrite approach for Yoga was anticipated as a potential pitfall (noted in the plan's "Note on yoga execution path") and implemented correctly on the first attempt.

## Issues Encountered
None - all tests passed on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SHOP-14 StorefrontClient fully verified against live twin
- Phase 17 complete — all client surfaces (GraphQL Admin, REST, Storefront) verified
- Ready for Phase 18 (Slack WebClient method coverage) or end-of-milestone wrap-up

---
*Phase: 17-shopify-rest-resource-client-expansion*
*Completed: 2026-03-09*
