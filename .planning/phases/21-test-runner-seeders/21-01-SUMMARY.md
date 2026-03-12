---
phase: 21-test-runner-seeders
plan: 01
subsystem: infra
tags: [node, better-sqlite3, ci, docker, github-actions, native-modules]

# Dependency graph
requires: []
provides:
  - Node 22 LTS pinned via .nvmrc for local dev tooling (nvm/fnm)
  - All CI jobs (conformance + e2e) running on Node 22 LTS
  - better-sqlite3 rebuilt from source in sdk-verification CI job, eliminating ABI mismatch
  - Dockerfile updated to node:22-slim for build and runtime stages
affects: [22-shopify-version-routing, 23-shopify-oauth-storefront, 24-shopify-rest-billing, 25-slack-state-tables, 26-slack-scope-enforcement, 27-conformance-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native module CI rebuild: pnpm rebuild <module> --build-from-source after pnpm install in any job that runs native-module tests"
    - "Node version pin: .nvmrc at repo root matches node-version in all CI jobs and Dockerfile base image"

key-files:
  created:
    - .nvmrc
  modified:
    - .github/workflows/conformance.yml
    - .github/workflows/e2e.yml
    - Dockerfile

key-decisions:
  - "Pin Node to 22 LTS (not 24 or latest) for long-term ABI stability across CI, Docker, and local dev"
  - "Rebuild step only in sdk-verification job — conformance/e2e jobs run twin servers via pnpm scripts, not pnpm test:sdk"
  - "No explicit rebuild in Dockerfile — pnpm install targets and runtime are the same Node version, so prebuilt binary for Node 22 is fetched correctly"

patterns-established:
  - "NVM pin pattern: .nvmrc content matches node-version in CI yaml and Dockerfile FROM tag"
  - "Native module CI pattern: pnpm rebuild <native-module> --build-from-source immediately after pnpm install in the job that runs tests using that module"

requirements-completed: [INFRA-19]

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 21 Plan 01: Test Runner & Seeders Summary

**Node 22 LTS alignment across CI, Docker, and local dev with source rebuild of better-sqlite3, eliminating NMV 137/141 ABI mismatch that crashed pnpm test:sdk**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T02:55:54Z
- **Completed:** 2026-03-12T02:58:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `.nvmrc` pinned to `22` so nvm/fnm users automatically switch to the correct Node version
- Updated all 5 `node-version:` entries in conformance.yml from 20 to 22 and added `pnpm rebuild better-sqlite3 --build-from-source` step in the sdk-verification job only
- Updated the single `node-version:` entry in e2e.yml from 20 to 22
- Updated both Dockerfile `FROM` stages from `node:20-slim` to `node:22-slim` and updated inline comment to note LTS status
- Confirmed `pnpm test:sdk` runs 27 test files and 177 tests with zero ABI errors and exit code 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add .nvmrc and align all CI jobs to Node 22** - `0af4bed` (chore)
2. **Task 2: Update Dockerfile to node:22-slim** - `47dcc9f` (chore)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `.nvmrc` - Node version pin for local dev tooling; single line containing `22`
- `.github/workflows/conformance.yml` - All 5 jobs updated from node-version 20 to 22; sdk-verification job gains source rebuild step for better-sqlite3
- `.github/workflows/e2e.yml` - Single node-version updated from 20 to 22
- `Dockerfile` - Both `FROM node:20-slim` stages updated to `node:22-slim`; inline comment updated with LTS callout

## Decisions Made

- Pin to Node 22 LTS (not 24 or current) for maximum ABI stability and broad ecosystem support
- Rebuild step added only to `sdk-verification` job — the only job that runs `pnpm test:sdk` and therefore exercises the `better-sqlite3` native module directly
- No rebuild step in Dockerfile because pnpm install happens against the same Node 22 runtime that will execute the server, so the prebuilt binary is fetched for the correct ABI

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `.nvmrc` + CI + Dockerfile alignment was sufficient to produce a clean `pnpm test:sdk` run locally. The manual node-gyp rebuild fallback documented in the plan was not required.

## User Setup Required

None - no external service configuration required. Developers using nvm or fnm will automatically switch to Node 22 in the project directory after this change.

## Next Phase Readiness

- CI infrastructure is now stable and version-consistent (Node 22 LTS everywhere)
- `pnpm test:sdk` (177 tests, 27 files) can be used as a regression gate throughout all remaining phases
- Seeders work (Phase 21 plans 02+) can proceed against a working test runner
- Phase 22 (Shopify version routing) can begin immediately — no blockers from this phase

## Self-Check: PASSED

All files verified present:
- `.nvmrc` — FOUND
- `.github/workflows/conformance.yml` — FOUND
- `.github/workflows/e2e.yml` — FOUND
- `Dockerfile` — FOUND
- `.planning/phases/21-test-runner-seeders/21-01-SUMMARY.md` — FOUND

All commits verified present:
- `0af4bed` — FOUND (Task 1: .nvmrc + CI Node 22 alignment)
- `47dcc9f` — FOUND (Task 2: Dockerfile node:22-slim)

---
*Phase: 21-test-runner-seeders*
*Completed: 2026-03-12*
