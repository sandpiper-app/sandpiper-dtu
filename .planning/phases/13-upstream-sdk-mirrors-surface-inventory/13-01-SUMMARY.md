---
phase: 13-upstream-sdk-mirrors-surface-inventory
plan: 01
subsystem: infra
tags: [vitest, pnpm, github-actions, submodules, ci]

# Dependency graph
requires: []
provides:
  - Vitest workspace discovers tests/* alongside packages/* and twins/*
  - Both twin packages declare vitest ^3.0.0 (no lockfile conflict when sdk-verification suite lands in Phase 14)
  - CI checkout steps in conformance.yml and e2e.yml populate third_party/upstream/ via submodules: recursive
  - CI submodule verification step exits non-zero on uninitialized entries
affects: [14-sdk-verification-harness, all-phases-using-ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vitest workspace projects array includes tests/* for future test suite directories"
    - "CI checkout always uses submodules: recursive + fetch-depth: 0 with explicit verification step"

key-files:
  created: []
  modified:
    - vitest.config.ts
    - twins/shopify/package.json
    - twins/slack/package.json
    - .github/workflows/conformance.yml
    - .github/workflows/e2e.yml

key-decisions:
  - "tests/* added to vitest.config.ts projects array now (before Phase 14) so adding tests/sdk-verification/ in Plan 03 requires no config change"
  - "vitest bumped to ^3.0.0 in both twins to match workspace root vitest version and prevent lockfile conflicts"
  - "Submodule verification step uses git submodule status | grep ^- pattern: exits non-zero only when uninitialized entries exist, passes cleanly when no submodules present (grep exits 1, shell OR returns true)"

patterns-established:
  - "CI submodule gate: check before any install step so failures surface immediately with clear message"

requirements-completed:
  - INFRA-10
  - INFRA-11

# Metrics
duration: 1min
completed: 2026-03-09
---

# Phase 13 Plan 01: Workspace & CI Preparation for SDK Mirrors Summary

**Vitest workspace extended to discover tests/*, twin vitest versions aligned to ^3.0.0, and all CI checkout steps made submodule-aware with explicit initialization verification**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T05:11:54Z
- **Completed:** 2026-03-09T05:16:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- vitest.config.ts projects array now includes `tests/*` so the Phase 14 sdk-verification suite is discovered without further config changes
- Both twins declare `vitest: ^3.0.0` and pnpm lockfile updated — no peer dependency errors
- All 4 jobs in conformance.yml and the e2e.yml job now have `submodules: recursive` + `fetch-depth: 0` on their checkout steps
- Explicit `Verify submodule initialization` step added to all 5 CI jobs: exits non-zero if any submodule entry is uninitialized

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tests/* to Vitest workspace and align twin Vitest versions** - `b001fbe` (feat)
2. **Task 2: Update CI workflows to check out submodules** - `54501be` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `vitest.config.ts` - Added `tests/*` to projects array
- `twins/shopify/package.json` - vitest bumped from ^2.1.8 to ^3.0.0
- `twins/slack/package.json` - vitest bumped from ^2.1.8 to ^3.0.0
- `.github/workflows/conformance.yml` - submodules: recursive + fetch-depth: 0 on all 4 checkout steps; Verify submodule initialization step in all 4 jobs
- `.github/workflows/e2e.yml` - submodules: recursive + fetch-depth: 0 on checkout step; Verify submodule initialization step added

## Decisions Made
- Added `tests/*` to vitest projects now rather than waiting for Plan 03: avoids a config-change commit interleaved with submodule setup
- Bumped vitest to `^3.0.0` in twins to match the workspace root version used by the upcoming sdk-verification suite (prevents pnpm lockfile conflicts)
- Submodule verification uses `grep "^-"` pattern (uninitialized entries start with `-` in `git submodule status`): exits non-zero only on problem entries, passes silently when no submodules exist yet

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (inventory tooling with ts-morph) can proceed: no workspace or CI surprises expected
- Plan 03 (submodule setup) will find CI already configured to populate third_party/upstream/ on checkout
- Phase 14 can add tests/sdk-verification/ and it will be discovered by `pnpm test` without further config changes

---
*Phase: 13-upstream-sdk-mirrors-surface-inventory*
*Completed: 2026-03-09*
