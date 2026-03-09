---
phase: 15-shopify-admin-client-compatibility
plan: "01"
subsystem: testing

tags: [vitest, shopify, admin-api-client, sdk-verification, graphql]

# Dependency graph
requires:
  - phase: 14-verification-harness-foundation-legacy-gap-merge
    provides: SDK verification harness, Shopify twin globalSetup, createShopifyClient helper, seedShopifyAccessToken seeder

provides:
  - 7 passing tests covering all four AdminApiClient methods (request, fetch, getHeaders, getApiUrl)
  - SHOP-08 requirement satisfied in coverage ledger

affects:
  - 15-02 (next Shopify client compatibility plan)
  - coverage-report.json (SHOP-08 can be promoted from deferred to live)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "beforeEach: resetShopify() + seedShopifyAccessToken() for live twin tests"
    - "getHeaders() assertions: custom headers survive, config-owned headers (X-Shopify-Access-Token) cannot be overridden"
    - "fetch() raw Response: call response.json() separately to inspect body"
    - "per-request apiVersion: SDK logs a deprecation warning but customFetchApi normalizes version; twin responds correctly"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts
  modified: []

key-decisions:
  - "Tests 4-6 (getHeaders/getApiUrl) are client-side assertions — no twin call needed; use a hardcoded token string, not seeded token"
  - "SDK version deprecation stderr warnings for '2025-01' are expected — customFetchApi normalizes to '2024-01' in-flight; tests pass cleanly"
  - "fetch() raw body cast to { data: { products: unknown } } avoids TypeScript any while keeping assertions focused"

patterns-established:
  - "client-side SDK method tests (getHeaders/getApiUrl) don't require twin running — safe to assert synchronously"
  - "per-request apiVersion override tested against live twin to verify normalization path end-to-end"

requirements-completed: [SHOP-08]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 15 Plan 01: Shopify AdminApiClient Method Coverage Summary

**Seven passing tests covering all four `@shopify/admin-api-client` methods — request, fetch, getHeaders, getApiUrl — advancing SHOP-08 from deferred to live in the coverage ledger.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T19:23:02Z
- **Completed:** 2026-03-09T19:28:00Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `shopify-admin-graphql-client.test.ts` with 7 tests covering the full AdminApiClient method surface
- `request()` — live twin GraphQL execution verified
- `fetch()` — raw Response status 200 and application/json content-type verified; body.json() products present
- `getHeaders()` — custom header merge and config-wins direction for X-Shopify-Access-Token verified
- `getApiUrl()` — default version and per-request version override reflected in URL string verified
- `request()` with `apiVersion: '2025-01'` per-request option — customFetchApi normalization verified end-to-end
- All 25 existing SDK tests remain green (zero regressions)

## Task Commits

1. **Task 1: Write GraphQL client method tests (SHOP-08)** - `b339759` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts` — 7 tests for AdminApiClient.request, .fetch, .getHeaders, .getApiUrl

## Decisions Made

- Tests 4-6 use hardcoded token strings (not seeded tokens) because they are client-side assertions that never call the twin — this avoids unnecessary async work and keeps the tests focused on SDK method behavior.
- SDK logs a deprecation warning to stderr for `apiVersion: '2025-01'` (supported versions are 2025-04+) but the test still passes because `customFetchApi` normalizes the version segment to `/admin/api/2024-01/`. The warning is expected and harmless.
- `fetch()` response body typed as `{ data: { products: unknown } }` to avoid `any` while keeping the assertion minimal.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Shopify twin starts automatically via globalSetup.

## Next Phase Readiness

- SHOP-08 coverage complete; `shopify-admin-graphql-client.test.ts` can be referenced in coverage-report.json updates
- Phase 15 Plan 02 can proceed (next Shopify client compatibility surface)

---
*Phase: 15-shopify-admin-client-compatibility*
*Completed: 2026-03-09*
