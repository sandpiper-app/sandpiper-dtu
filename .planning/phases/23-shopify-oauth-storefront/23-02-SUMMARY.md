---
phase: 23-shopify-oauth-storefront
plan: "02"
subsystem: api
tags: [shopify, storefront, graphql, yoga, sdk-verification]

# Dependency graph
requires:
  - phase: 23-shopify-oauth-storefront
    provides: token_type-aware Shopify token validation and OAuth/token seeding flow from 23-01
provides:
  - separate Storefront SDL with products, collections, and shop query root only
  - dedicated Storefront Yoga instance on `/api/:version/graphql.json`
  - Storefront auth that rejects admin-typed tokens before GraphQL execution
  - SDK verification coverage for storefront tokens, products, collections, and schema introspection
affects: [24-shopify-rest-persistence-billing-rate-limiting, sdk-verification, shopify-storefront]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Storefront GraphQL uses a dedicated SDL plus a filtered resolver map instead of reusing the full admin schema"
    - "Storefront auth rejects admin tokens twice: once in the Fastify route for a clean HTTP 401 and again in Yoga context for resolver safety"

key-files:
  created:
    - .planning/phases/23-shopify-oauth-storefront/23-02-SUMMARY.md
    - twins/shopify/src/schema/storefront.graphql
  modified:
    - twins/shopify/src/plugins/graphql.ts
    - tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts

key-decisions:
  - "Storefront schema stays physically separate from admin SDL so introspection cannot leak admin mutations"
  - "The Storefront route performs token-type rejection before `storefrontYoga.fetch()` so admin tokens fail with HTTP 401 instead of GraphQL errors"
  - "Storefront SDK tests seed storefront/admin tokens through `/admin/tokens` and product fixtures through `/admin/fixtures/load` instead of using `clientCredentials()`"

patterns-established:
  - "Pattern: When a subset GraphQL surface diverges from the admin API, build a second Yoga instance with only the types and resolver fields that surface exposes"
  - "Pattern: Storefront SDK tests should seed explicit storefront tokens rather than assuming admin OAuth credentials are valid everywhere"

requirements-completed: [SHOP-19]

# Metrics
duration: 13min
completed: 2026-03-12
---

# Phase 23 Plan 02: Storefront schema separation Summary

**Storefront GraphQL now runs on its own schema and Yoga instance, rejects admin tokens with HTTP 401, and exposes product, collection, and shop queries without any mutation root**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-12T17:55:30Z
- **Completed:** 2026-03-12T18:08:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `twins/shopify/src/schema/storefront.graphql` with Storefront-only types and a query root limited to `products`, `shop`, and `collections`
- Split `/api/:version/graphql.json` onto its own Yoga instance and resolver map so Storefront introspection no longer exposes admin mutations
- Enforced token-type-aware Storefront auth and expanded the SDK verification file to seed storefront/admin tokens plus seeded product fixtures directly

## Task Commits

1. **Task 1: storefront.graphql SDL + second Yoga instance in graphql.ts** - `00cf047` (feat)
2. **Task 2: Token-type enforcement on Storefront route + update storefront tests** - `091658d` (feat)

**Plan metadata:** (docs commit recorded after SUMMARY creation)

## Files Created/Modified

- `twins/shopify/src/schema/storefront.graphql` - defines the Storefront-only SDL with `products`, `collections`, and `shop`, and no mutation type
- `twins/shopify/src/plugins/graphql.ts` - builds the Storefront schema/Yoga instance, rewrites Storefront URLs to a canonical endpoint, and rejects admin tokens before GraphQL execution
- `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` - seeds storefront/admin tokens directly, loads real product fixtures, and adds products/collections/introspection/admin-rejection coverage

## Verification Results

- `pnpm exec vitest run --project sdk-verification tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` - 10 tests passed
- `pnpm test:sdk` - 27 files, 197 tests passed
- `pnpm -r --filter @dtu/twin-shopify run build` - passed

## Decisions Made

- Storefront schema separation is implemented as a second SDL file plus a narrow resolver map rather than a shared schema with hidden mutations, because introspection must stay clean.
- Admin-token rejection happens both in the route handler and in Yoga context: the route provides a clean HTTP 401, while the context prevents any resolver from treating an admin token as authorized.
- The Storefront SDK suite now seeds explicit storefront tokens and fixtures directly through twin admin endpoints, which keeps the Storefront contract independent from admin OAuth behavior.

## Deviations from Plan

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 24 can assume Shopify Storefront requests now route through a schema that is separate from the admin GraphQL API.
- SHOP-19 behavior is implemented and ready for the phase verifier to validate against SHOP-18 and SHOP-19 together.

## Self-Check: PASSED

- **Found:** `.planning/phases/23-shopify-oauth-storefront/23-02-SUMMARY.md`
- **Found:** `twins/shopify/src/schema/storefront.graphql`
- **Found:** `twins/shopify/src/plugins/graphql.ts`
- **Found:** `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts`
- **Verified commits:** `00cf047`, `091658d`

---
*Phase: 23-shopify-oauth-storefront*
*Completed: 2026-03-12*
