---
phase: 15-shopify-admin-client-compatibility
plan: "03"
subsystem: api
tags: [shopify, rest, admin-api-client, sdk-verification, coverage, vitest]

# Dependency graph
requires:
  - phase: 15-02
    provides: "REST plugin (5 routes) and createRestClient() test helper wiring admin-api-client to twin"
provides:
  - "8-test REST SDK suite covering all four HTTP verbs, searchParams, custom headers, retry-on-429, and auth error"
  - "Coverage ledger updated: 10 live symbols for @shopify/admin-api-client (3 Phase 14 + 7 Phase 15 trackable)"
  - "SHOP-08 and SHOP-09 requirements fully satisfied"
affects:
  - 15-04
  - 15-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REST SDK tests follow same beforeEach pattern as GraphQL tests: resetShopify() + seedShopifyAccessToken() per test"
    - "Fastify addContentTypeParser with empty-body guard: required for DELETE with Content-Type:application/json and no body"
    - "LIVE_SYMBOLS keys for TypeAlias symbols (e.g., AdminApiClient) match manifest but member paths (AdminApiClient.request) do not — TypeAlias has no emitted members in manifest"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts
  modified:
    - twins/shopify/src/plugins/rest.ts
    - tests/sdk-verification/coverage/generate-report.ts
    - tests/sdk-verification/coverage/coverage-report.json

key-decisions:
  - "AdminApiClient.request/fetch/getHeaders/getApiUrl LIVE_SYMBOLS entries are no-ops — TypeAliasDeclaration has no members in manifest; only AdminApiClient top-level symbol is trackable"
  - "addContentTypeParser added to REST plugin scope: handles Content-Type:application/json with empty body (DELETE) — Fastify v5 returns 400 otherwise"
  - "Live count is 10 not 14 (plan expected): 4 AdminApiClient method members absent from manifest; all trackable symbols are correctly attributed"

patterns-established:
  - "REST verb test pattern: per-test createRestClient({ accessToken }) with fresh seeded token from beforeEach"
  - "Auth error test: create bad client with hardcoded invalid token, pass retries:0 to avoid unnecessary retries on 401"

requirements-completed: [SHOP-08, SHOP-09]

# Metrics
duration: 9min
completed: 2026-03-09
---

# Phase 15 Plan 03: REST Client Tests and Coverage Ledger Update Summary

**8-test AdminRestApiClient SDK suite covering all HTTP verbs, query params, custom headers, retry-on-429, and auth errors; coverage ledger updated to 10 live @shopify/admin-api-client symbols across Phase 14-15**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-09T19:27:43Z
- **Completed:** 2026-03-09T19:36:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` with 8 tests covering GET/POST/PUT/DELETE, searchParams, custom headers, retry-on-429, and auth error (401)
- Auto-fixed REST plugin: added `addContentTypeParser` to handle DELETE requests with `Content-Type: application/json` and no body (Fastify v5 returned 400 without explicit empty-body handler)
- Updated `generate-report.ts` LIVE_SYMBOLS with 11 Phase 15 entries; regenerated `coverage-report.json` with 10 live symbols; `pnpm drift:check` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Write REST client tests (SHOP-09)** - `12dea23` (feat)
2. **Task 2: Update coverage ledger for Phase 15 symbols** - `a26ff08` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` - 8 REST client tests (GET/POST/PUT/DELETE, searchParams, custom headers, retry-on-429, auth error)
- `twins/shopify/src/plugins/rest.ts` - Added `addContentTypeParser` for empty-body JSON handling on DELETE requests
- `tests/sdk-verification/coverage/generate-report.ts` - Updated phase to '15', added 11 LIVE_SYMBOLS entries for Phase 15 symbols, updated note
- `tests/sdk-verification/coverage/coverage-report.json` - Regenerated: 10 live, 32669 deferred

## Decisions Made
- `AdminApiClient.request/fetch/getHeaders/getApiUrl` LIVE_SYMBOLS entries are no-ops — the manifest declares `AdminApiClient` as a `TypeAliasDeclaration` with no members, so member paths are never emitted to the report. Only `AdminApiClient` top-level is trackable. This explains 10 live symbols instead of the plan's expected 14.
- `addContentTypeParser` added at REST plugin scope (not global Fastify instance) — keeps the change local to REST routes and won't affect other plugins; DELETE with `Content-Type: application/json` and empty body now returns 200 correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DELETE route returned 400 due to empty JSON body rejection**
- **Found during:** Task 1 (Write REST client tests)
- **Issue:** The Shopify admin-api-client sends `Content-Type: application/json` header on ALL requests including DELETE with no body. Fastify v5's built-in JSON body parser rejects empty bodies, returning 400 Bad Request.
- **Fix:** Added `addContentTypeParser('application/json', { parseAs: 'string' }, ...)` in the REST plugin with a guard that returns `undefined` for empty/missing bodies and parses non-empty bodies as JSON.
- **Files modified:** `twins/shopify/src/plugins/rest.ts`
- **Verification:** DELETE test now returns `response.ok === true`; all 33 SDK tests pass after fix.
- **Committed in:** `12dea23` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Auto-fix necessary for DELETE correctness. No scope creep — fix is directly caused by the test exercising the DELETE route.

## Issues Encountered
- Plan verification expected 14 live symbols (`grep -c '"tier": "live"'`) but actual count is 10 due to `AdminApiClient` being a TypeAlias with no emitted members in the manifest. The 4 missing LIVE_SYMBOLS entries (`AdminApiClient.request/fetch/getHeaders/getApiUrl`) are simply ignored during generation. `pnpm drift:check` and all tests pass; the manifest structure is the authoritative source.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SHOP-08 (GraphQL client methods) and SHOP-09 (REST client methods) both fully satisfied
- All 33 SDK tests pass with no regressions
- Coverage ledger is accurate and drift check passes
- Phase 15 REST coverage obligation complete — plans 04 and 05 can proceed

## Self-Check: PASSED

- FOUND: tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts
- FOUND: twins/shopify/src/plugins/rest.ts (addContentTypeParser added)
- FOUND: tests/sdk-verification/coverage/generate-report.ts (Phase 15 LIVE_SYMBOLS)
- FOUND: tests/sdk-verification/coverage/coverage-report.json (10 live symbols)
- FOUND: commit 12dea23 (Task 1)
- FOUND: commit a26ff08 (Task 2)
- VERIFIED: pnpm test:sdk — 33 passed, 0 failed
- VERIFIED: pnpm drift:check — All checks passed. No drift detected.

---
*Phase: 15-shopify-admin-client-compatibility*
*Completed: 2026-03-09*
