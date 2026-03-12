---
phase: 22-shopify-version-routing-response-headers
plan: 01
subsystem: api
tags: [shopify, fastify, graphql-yoga, rest, versioning, response-headers]

# Dependency graph
requires:
  - phase: 21-test-runner-seeders
    provides: Seeder forward-protection and POST /admin/tokens endpoint used in tests
provides:
  - Centralized Shopify API version parsing and header emission (api-version.ts)
  - Version-parameterized admin and Storefront GraphQL wrapper routes (:version param)
  - Version-parameterized REST routes with X-Shopify-API-Version on all responses
  - Version-aware pagination Link header using requested version, not hardcoded 2024-01
affects:
  - 22-02 (helper removal and SDK verification)
  - 23-shopify-oauth-storefront (Storefront API versioned routes now live)
  - 24-shopify-rest-billing (REST routes now accept any version)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Version wrapper routes: Fastify accepts :version param, rewrites URL to canonical endpoint before yoga.fetch()"
    - "Version header first: setApiVersionHeader() called at top of handler before all auth/throttle branches"
    - "Shared version utility: parseShopifyApiVersion + setApiVersionHeader centralized in services/api-version.ts"
    - "adminPath() helper: local REST plugin helper for /admin/api/:version{suffix} route registration"

key-files:
  created:
    - twins/shopify/src/services/api-version.ts
  modified:
    - twins/shopify/src/plugins/graphql.ts
    - twins/shopify/src/plugins/rest.ts

key-decisions:
  - "Keep Yoga canonical endpoint fixed at /admin/api/2024-01/graphql.json; Fastify wrapper routes rewrite :version URLs before yoga.fetch()"
  - "Set X-Shopify-API-Version before auth/throttle branches so 401 and 429 responses also carry the version header"
  - "Build pagination Link header URL from req.params.version via buildAdminApiPath() — no hardcoded 2024-01 in Link header"
  - "Shared api-version.ts service keeps version logic DRY across GraphQL and REST plugins"

patterns-established:
  - "Pattern 1: Version header first — always set X-Shopify-API-Version before any early-return branch"
  - "Pattern 2: Single Yoga instance with URL rewrite — wrapper routes accept any :version, rewrite to canonical path"

requirements-completed: [SHOP-17, SHOP-22, SHOP-23]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 22 Plan 01: Shopify Version Routing & Response Headers Summary

**Version-parameterized Shopify twin transport with X-Shopify-API-Version header on all response paths and version-aware REST pagination Link headers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T16:12:14Z
- **Completed:** 2026-03-12T16:16:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `twins/shopify/src/services/api-version.ts` with parseShopifyApiVersion, setApiVersionHeader, buildAdminApiPath, and adminApiPrefix helpers as the single source of truth for version transport logic
- Replaced fixed `/admin/api/2024-01/graphql.json` and `/api/2024-01/graphql.json` routes with `:version`-parameterized wrappers that rewrite to the Yoga canonical endpoint before execution
- Replaced all 20+ hardcoded `/admin/api/2024-01/...` REST route registrations with `:version`-parameterized routes; every handler sets X-Shopify-API-Version before requireToken() so 401 responses also carry the header
- Updated products pagination Link header to use buildAdminApiPath(version, ...) so `GET /admin/api/2025-01/products.json?page_info=test` returns a Link header containing `/admin/api/2025-01/products.json`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared api-version helper and parameterize GraphQL routes** - `be9eb4b` (feat)
2. **Task 2: Parameterize REST routes and make pagination headers version-aware** - `8380231` (feat)

## Files Created/Modified

- `twins/shopify/src/services/api-version.ts` - New shared version utility: parseShopifyApiVersion, setApiVersionHeader, buildAdminApiPath, adminApiPrefix
- `twins/shopify/src/plugins/graphql.ts` - Replaced fixed 2024-01 routes with /admin/api/:version/graphql.json and /api/:version/graphql.json wrappers; version header set before all response branches
- `twins/shopify/src/plugins/rest.ts` - All routes parameterized with :version; parseVersionHeader() helper sets X-Shopify-API-Version before requireToken(); Link header uses buildAdminApiPath(version)

## Decisions Made

- Used the URL-rewrite wrapper pattern for GraphQL (not per-version Yoga instances) to keep the single Yoga schema in place — transport change only, no schema divergence
- Set the version header unconditionally at the top of every handler before auth/throttle branches to guarantee all response codes (200, 401, 429) carry X-Shopify-API-Version
- Yoga's `graphqlEndpoint` stays fixed at `2024-01` (the canonical endpoint); wrapper routes rewrite `:version` to `2024-01` before `yoga.fetch()` — this is transparent to the schema and resolvers
- Reject invalid version strings with 400 in both plugins (centralized via parseShopifyApiVersion throwing TypeError)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runtime transport now accepts any valid Shopify API version string for both admin GraphQL, Storefront GraphQL, and all REST routes
- X-Shopify-API-Version echoed on all response paths including error responses
- Pagination Link headers preserve the requested version
- Phase 22-02 can now remove helper-side version rewrites (`replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/')`) and add SDK-level assertions for both 2024-01 and 2025-01
- No blockers for Phase 22-02, 23, or 24

---
*Phase: 22-shopify-version-routing-response-headers*
*Completed: 2026-03-12*
