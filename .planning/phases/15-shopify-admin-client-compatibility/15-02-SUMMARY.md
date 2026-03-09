---
phase: 15-shopify-admin-client-compatibility
plan: "02"
subsystem: api
tags: [shopify, rest, fastify, sdk-verification, admin-api-client]

# Dependency graph
requires:
  - phase: 15-01
    provides: "Shopify twin token seeding and state infrastructure for REST auth"
provides:
  - "REST plugin with 5 routes under /admin/api/2024-01/ validating X-Shopify-Access-Token"
  - "createRestClient() test helper wiring createAdminRestApiClient to local twin via customFetchApi + scheme:'http'"
affects:
  - 15-03-shopify-rest-sdk-tests

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FastifyPluginAsync without fastify-plugin wrapper — stateManager decorator already on parent scope"
    - "requireToken helper: per-plugin inline auth guard calling validateAccessToken()"
    - "retryCounts Map: per-instance call counter for 429/retry test endpoint"
    - "createRestClient() mirrors createShopifyClient() pattern: both scheme:'http' AND customFetchApi rewrite required"

key-files:
  created:
    - twins/shopify/src/plugins/rest.ts
    - tests/sdk-verification/helpers/shopify-rest-client.ts
  modified:
    - twins/shopify/src/index.ts

key-decisions:
  - "restPlugin NOT wrapped in fastify-plugin — no global scope sharing needed; stateManager already a Fastify decorator"
  - "Both scheme:'http' AND customFetchApi required in createRestClient() — scheme alone doesn't prevent DNS resolution of dev.myshopify.com"
  - "retryCounts keyed by access token — ensures test isolation per token and allows reset after successful 200 response"
  - "PUT/DELETE use :id.json route pattern — Fastify captures the id portion; .replace(/\\.json$/, '') strips suffix if present"

patterns-established:
  - "requireToken pattern: inline helper returning boolean, false means reply already sent"
  - "REST plugin registration order: after graphqlPlugin, before uiPlugin"

requirements-completed: [SHOP-09]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 15 Plan 02: REST Plugin and Client Helper Summary

**Fastify REST plugin with 5 Shopify Admin API routes + createRestClient() test factory wiring admin-api-client to the local twin via scheme:'http' and customFetchApi host rewriting**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-09T19:23:02Z
- **Completed:** 2026-03-09T19:25:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `twins/shopify/src/plugins/rest.ts` with GET/POST/PUT/DELETE products routes and retry test endpoint, all gated by X-Shopify-Access-Token validation
- Registered restPlugin in `twins/shopify/src/index.ts` in the correct position (after graphqlPlugin, before uiPlugin)
- Created `tests/sdk-verification/helpers/shopify-rest-client.ts` with createRestClient() factory using the dual scheme+customFetchApi pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Add REST plugin to Shopify twin** - `8b40fbe` (feat)
2. **Task 2: Create REST client test helper** - `d1c0e66` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `twins/shopify/src/plugins/rest.ts` - REST plugin: 5 routes with requireToken auth guard and retryCounts map for 429 test endpoint
- `twins/shopify/src/index.ts` - Added import and registration of restPlugin between graphqlPlugin and uiPlugin
- `tests/sdk-verification/helpers/shopify-rest-client.ts` - createRestClient() factory using createAdminRestApiClient with scheme:'http' + customFetchApi rewrite

## Decisions Made
- restPlugin is NOT wrapped in fastify-plugin because no cross-plugin scope sharing is needed — stateManager is already decorated on the parent Fastify instance
- createRestClient() requires both `scheme: 'http'` AND customFetchApi host rewriting: scheme sets the URL protocol at construction time, but without customFetchApi the request still resolves dev.myshopify.com via DNS; the customFetchApi regex rewrites both http:// and https:// prefixes to catch whatever scheme produces
- retryCounts Map keyed by access token value — gives per-token isolation so concurrent tests (different tokens) don't interfere; counter resets after the 200 response so the endpoint is reusable across test runs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled cleanly on first attempt; all 25 existing SDK tests passed without regressions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- REST plugin is live in the Shopify twin serving all 5 routes with auth validation
- createRestClient() helper is ready for Plan 03 (REST SDK tests) to import
- test-retry.json endpoint ready for retry-on-429 test scenarios
- All 25 existing SDK tests pass (no regressions)

---
*Phase: 15-shopify-admin-client-compatibility*
*Completed: 2026-03-09*
