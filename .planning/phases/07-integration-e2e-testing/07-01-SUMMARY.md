---
phase: 07-integration-e2e-testing
plan: 01
subsystem: infra
tags: [docker, dockerfile, healthcheck, integration-testing, vitest, smoke-tests]

requires:
  - phase: 06-twin-uis
    provides: Both twins feature-complete with UI, health, OAuth, API, admin endpoints
provides:
  - Parameterized Dockerfile building both twin images from single TWIN_NAME arg
  - .dockerignore excluding dev artifacts
  - Node.js healthcheck script (no curl dependency)
  - 11 integration smoke tests validating base URL swap mechanism
affects: [07-02-docker-compose, ci-e2e]

tech-stack:
  added: [docker, multi-stage-build, pnpm-deploy]
  patterns: [parameterized-dockerfile, dual-mode-integration-tests, env-var-base-url-swap]

key-files:
  created:
    - Dockerfile
    - .dockerignore
    - scripts/healthcheck.mjs
    - tests/integration/smoke.test.ts
    - tests/integration/vitest.config.ts
  modified:
    - twins/shopify/package.json
    - twins/slack/package.json
    - twins/shopify/src/plugins/ui.ts
    - twins/slack/src/plugins/ui.ts
    - twins/slack/src/plugins/web-api/chat.ts

key-decisions:
  - "node:20-slim over Alpine: better-sqlite3 native module requires glibc, musl breaks compilation"
  - "Copy entire twins/${TWIN_NAME}/src/ in runtime stage: .eta views and .graphql schema are runtime deps not compiled by tsc"
  - "pnpm deploy --prod for isolated production dependencies: clean node_modules without dev deps"
  - "Dual-mode smoke tests: in-process via buildApp() for local dev, env vars for Docker/CI"
  - "@fastify/view types triple-slash reference: fixes pre-existing tsc --build type errors from pnpm strict isolation"

patterns-established:
  - "TWIN_NAME build arg pattern: single Dockerfile for all twins"
  - "healthcheck.mjs pattern: Node.js http module, no external dependencies"
  - "Integration test base URL swap: SHOPIFY_API_URL / SLACK_API_URL env vars"

requirements_completed: [INTG-01, INTG-03]

duration: 15min
completed: 2026-03-01
---

# Phase 7 Plan 01: Docker Images & Integration Smoke Tests Summary

**Parameterized multi-stage Dockerfile for both twins with 11 integration smoke tests validating base URL swap via SHOPIFY_API_URL/SLACK_API_URL env vars**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-01T01:03:00Z
- **Completed:** 2026-03-01T01:18:17Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Parameterized Dockerfile builds both Shopify and Slack twin images via TWIN_NAME build arg
- Both Docker images start, pass healthchecks, and respond to /health with 200
- 11 integration smoke tests validate all HTTP patterns Sandpiper uses (health, OAuth, GraphQL, Web API, admin reset, UI)
- Dual-mode tests: in-process for local dev, env-var-driven for Docker/CI

## Task Commits

Each task was committed atomically:

1. **Task 1a: Fix pre-existing tsc build errors** - `7c3f94a` (fix)
2. **Task 1b: Create Dockerfile, .dockerignore, healthcheck** - `0187af1` (feat)
3. **Task 2: Create integration smoke tests** - `7045c74` (feat)

## Files Created/Modified
- `Dockerfile` - Parameterized multi-stage build for both twins
- `.dockerignore` - Excludes node_modules, .git, .planning, dev artifacts
- `scripts/healthcheck.mjs` - Node.js health check using http module
- `tests/integration/smoke.test.ts` - 11 smoke tests for base URL swap validation
- `tests/integration/vitest.config.ts` - Vitest config for integration tests
- `twins/shopify/package.json` - Added @fastify/view devDependency for types
- `twins/slack/package.json` - Added @fastify/view devDependency for types
- `twins/shopify/src/plugins/ui.ts` - Added @fastify/view types reference
- `twins/slack/src/plugins/ui.ts` - Added @fastify/view types reference
- `twins/slack/src/plugins/web-api/chat.ts` - Fixed Array.isArray type guard for blocks validation

## Decisions Made
- Used node:20-slim (not Alpine) because better-sqlite3 requires glibc
- Copied entire src/ directory in runtime stage for .eta templates and .graphql schema
- Used pnpm deploy --prod for clean isolated production dependencies
- Implemented dual-mode smoke tests (in-process + external URL) for flexibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing tsc --build type errors**
- **Found during:** Task 1 (Docker image build)
- **Issue:** viewAsync not recognized on FastifyReply (pnpm strict isolation hides @fastify/view types), and validateBlocks type narrowing needed Array.isArray guard
- **Fix:** Added @fastify/view devDependency + triple-slash reference to both twins, added Array.isArray guard to chat.ts
- **Files modified:** twins/shopify/package.json, twins/slack/package.json, twins/shopify/src/plugins/ui.ts, twins/slack/src/plugins/ui.ts, twins/slack/src/plugins/web-api/chat.ts
- **Verification:** Both twins build cleanly with tsc --build, 236/237 tests pass (1 pre-existing flaky DLQ test)
- **Committed in:** 7c3f94a

**2. [Rule 1 - Bug] Admin reset response format mismatch in smoke tests**
- **Found during:** Task 2 (smoke test implementation)
- **Issue:** Test expected `{ status: 'reset' }` but twins return `{ reset: true, timestamp: ... }`
- **Fix:** Updated assertions to check `body.reset === true`
- **Files modified:** tests/integration/smoke.test.ts
- **Verification:** All 11 smoke tests pass
- **Committed in:** 7045c74 (part of task commit)

**3. [Rule 3 - Blocking] Integration test import resolution**
- **Found during:** Task 2 (smoke test implementation)
- **Issue:** `@dtu/twin-shopify` package import fails from tests/integration (not in pnpm workspace)
- **Fix:** Used relative path imports (`../../twins/shopify/src/index.js`) instead of package names
- **Files modified:** tests/integration/smoke.test.ts
- **Verification:** Tests resolve and pass
- **Committed in:** 7045c74 (part of task commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes necessary for Docker builds and test correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Docker images verified (both build and run successfully)
- Integration smoke tests pass both in-process and can target external URLs
- Ready for Plan 07-02: Docker Compose orchestration and CI workflow

---
*Phase: 07-integration-e2e-testing*
*Completed: 2026-03-01*
