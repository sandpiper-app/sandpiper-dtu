---
phase: 14-verification-harness-foundation-legacy-gap-merge
plan: "05"
subsystem: testing

tags: [vitest, sdk-verification, coverage, drift-detection, ci, infra-12, infra-14]

requires:
  - phase: 14-verification-harness-foundation-legacy-gap-merge-03
    provides: Live SDK gateway tests proving which symbols are 'live' (auth.test/api.test, createAdminApiClient)
  - phase: 14-verification-harness-foundation-legacy-gap-merge-04
    provides: singleFork pool config, legacy test suite; all 18 tests passing under pnpm test:sdk

provides:
  - Symbol-to-tier coverage ledger (coverage-report.json) with 3 live / 32676 deferred across all 5 packages
  - generate-report.ts: runnable tsx script regenerating coverage-report.json from manifests + LIVE_SYMBOLS attribution map
  - check-drift.ts: drift detection script with version mismatch (INFRA-14) and null-tier CI gate (INFRA-12)
  - conformance.yml sdk-verification CI job running pnpm test:sdk + pnpm drift:check on every PR

affects:
  - All Phase 15-20 SDK plans (LIVE_SYMBOLS map must be updated as new tests are added)
  - CI conformance workflow (new sdk-verification job gates all PRs)

tech-stack:
  added: []
  patterns:
    - Coverage ledger pattern: generate-report.ts reads manifests, attributes live symbols via LIVE_SYMBOLS map, writes checked-in JSON
    - Null-tier CI gate: check-drift.ts enforces tier !== null for every symbol in coverage-report.json (INFRA-12)
    - Version drift detection: installed package.json vs sdk-pins.json version comparison (INFRA-14)
    - Submodule ref check: git -C {submodulePath} rev-parse HEAD vs pinned commit in sdk-pins.json

key-files:
  created:
    - tests/sdk-verification/coverage/generate-report.ts
    - tests/sdk-verification/coverage/coverage-report.json
    - tests/sdk-verification/drift/check-drift.ts
  modified:
    - .github/workflows/conformance.yml

key-decisions:
  - "coverage/ directory gitignored by root .gitignore (pattern: coverage/) — force-added generate-report.ts and coverage-report.json with git add -f since these are intentionally checked-in ledger files, not build artifacts"
  - "LIVE_SYMBOLS map uses {pkgName}@{version}/{symbolPath} key format — explicit versioned keys prevent false attribution when package version changes in a future phase"
  - "Member symbols expanded from manifest (e.g., WebClient.auth.test) as separate entries — drift check can track coverage at method granularity, not just class granularity"
  - "Submodule path corrected from 'third_party/upstream/...' to pin.submodule value — sdk-pins.json stores the relative submodule path which already includes third_party/ prefix"

patterns-established:
  - "Coverage ledger: LIVE_SYMBOLS attribution map in generate-report.ts — add new entries as Phases 15-20 add live SDK tests"
  - "Drift check as CI gate: pnpm drift:check gates PRs via conformance.yml sdk-verification job"

requirements-completed:
  - INFRA-12
  - INFRA-14

duration: 15min
completed: "2026-03-09"
---

# Phase 14 Plan 05: Coverage Ledger and Drift Detection Summary

**Per-symbol coverage ledger (32679 symbols across 5 packages, 3 live) and drift detection CI gate with null-tier enforcement via check-drift.ts — completing Phase 14 INFRA-12 and INFRA-14 requirements**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-09T17:18:54Z
- **Completed:** 2026-03-09T17:33:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `tests/sdk-verification/coverage/generate-report.ts` — reads all 5 manifest JSONs, attributes 3 live symbols (WebClient.auth.test, WebClient.api.test, createAdminApiClient) via LIVE_SYMBOLS map, writes coverage-report.json with INFRA-12 guarantee: all symbols get 'live' or 'deferred', never null
- Generated `tests/sdk-verification/coverage/coverage-report.json` — 32679 symbols tracked (3 live, 32676 deferred), 0 null tiers; checked into repo for CI diffing
- Created `tests/sdk-verification/drift/check-drift.ts` — exits 0 when all 5 package versions match sdk-pins.json and coverage-report.json has no null-tier symbols; exits 1 with mismatch output on version drift or null-tier violations; also checks submodule commit refs
- Added `sdk-verification` job to `.github/workflows/conformance.yml` running `pnpm test:sdk` and `pnpm drift:check` on every PR and push

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate coverage-report.json and generate-report.ts** - `153c6cb` (feat)
2. **Task 2: Drift detection script with null-tier CI gate** - `90afc69` (feat)
3. **CI workflow addition** - `abc3991` (chore)

## Files Created/Modified

- `tests/sdk-verification/coverage/generate-report.ts` - Reads 5 manifests, attributes live symbols via LIVE_SYMBOLS map, writes coverage-report.json; runnable via pnpm coverage:generate
- `tests/sdk-verification/coverage/coverage-report.json` - 32679-symbol ledger: 3 live, 32676 deferred, 0 null tiers; checked into repo for CI diffing and drift detection
- `tests/sdk-verification/drift/check-drift.ts` - Drift detection: version mismatch check (INFRA-14) + null-tier CI gate (INFRA-12) + submodule ref verification; exits 0 on clean repo, 1 on violation
- `.github/workflows/conformance.yml` - Added sdk-verification job: pnpm test:sdk + pnpm drift:check run on every PR

## Decisions Made

- **force-add for gitignored coverage/ directory:** Root .gitignore has `coverage/` pattern (for code coverage reports). generate-report.ts and coverage-report.json are intentionally checked-in ledger files — not build artifacts. Used `git add -f` to force-add; a future plan should add `!tests/sdk-verification/coverage/` negation to .gitignore to remove the need for force-adds.
- **Versioned LIVE_SYMBOLS keys:** Keys use `{pkgName}@{version}/{symbolPath}` format. When a package version bumps in a future phase, old live attributions won't silently transfer — they'll need explicit re-attribution. This is intentional: forces developers to verify coverage is still valid after upgrades.
- **Member symbol expansion:** WebClient has 392 members in the manifest. The generator expands them all as `WebClient.{member}` entries. This means auth.test and api.test are trackable as distinct entries (tier: live), while the other 390 members are deferred.
- **Submodule path fix:** sdk-pins.json stores `"submodule": "third_party/upstream/shopify-app-js"` — the full relative path from repo root. The original plan template had `join(root, 'third_party', pin.submodule)` which would double-prefix. Fixed to `join(root, pin.submodule)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed submodule path double-prefixing in check-drift.ts**
- **Found during:** Task 2 (check-drift.ts execution)
- **Issue:** Plan template used `join(root, 'third_party', pin.submodule)` but sdk-pins.json already stores the full relative path `third_party/upstream/shopify-app-js`, causing path to become `{root}/third_party/third_party/upstream/shopify-app-js` (ENOENT).
- **Fix:** Changed to `join(root, pin.submodule)` — uses the submodule path as-is from sdk-pins.json.
- **Files modified:** tests/sdk-verification/drift/check-drift.ts
- **Verification:** Submodule ref check now reports OK for all 5 packages on first run.
- **Committed in:** 90afc69 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added CI workflow job for sdk-verification**
- **Found during:** Post-task review of success criteria
- **Issue:** Plan's success criteria explicitly calls out: "update .github/workflows/conformance.yml to run pnpm test:sdk and pnpm drift:check on every PR — required for the phase goal to be fully met"
- **Fix:** Added `sdk-verification` job to conformance.yml with pnpm test:sdk + pnpm drift:check steps
- **Files modified:** .github/workflows/conformance.yml
- **Verification:** Workflow YAML valid; job runs both SDK suite and drift check
- **Committed in:** abc3991 (CI commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes were necessary for correctness. The submodule path fix was a typo in the plan template. The CI addition was explicitly required by the plan's success criteria.

## Issues Encountered

The `coverage/` directory is matched by root `.gitignore` (pattern: `coverage/`). This prevented `git add` from staging the files without `-f`. Used `git add -f` for both files. A future plan should add a `.gitignore` negation line (`!tests/sdk-verification/coverage/`) to avoid requiring force-adds on every regeneration commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 is complete — all 5 plans executed
- coverage-report.json is the tracked ledger; update LIVE_SYMBOLS in generate-report.ts as new tests are added in Phases 15-20
- pnpm drift:check gates PRs via the new sdk-verification CI job
- pnpm test:sdk passes all 18 tests with no regressions
- All Phase 14 requirements satisfied: INFRA-12 (null-tier gate), INFRA-13 (legacy gap merge, Plan 04), INFRA-14 (drift detection), INFRA-15 (URL redirection, Plan 03), SLCK-06.5 (auth.test/api.test, Plans 01+03)

---
*Phase: 14-verification-harness-foundation-legacy-gap-merge*
*Completed: 2026-03-09*
