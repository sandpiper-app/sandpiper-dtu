---
phase: 41-regression-closure-and-release-gate-recovery
plan: "02"
subsystem: infra
tags: [vitest, typescript, build-gates, runtime-evidence, tdd, process-hooks]

# Dependency graph
requires:
  - phase: 41-01
    provides: Wave 0 RED contracts for Phase 41 regressions
provides:
  - Root pnpm build that includes twins (truthful release gate)
  - Compiling Shopify twin (subject_token_type added to OAuthTokenRequestBody)
  - Runtime evidence artifact resilience (symbol-execution.json survives failing runs)
  - Failure-path process-exit flush hooks (beforeExit, exit, SIGINT, SIGTERM, uncaughtException, unhandledRejection)
  - Automated proof: failing-evidence-fixture.test.ts + runtime-artifact-resilience.test.ts
affects:
  - 41-03-shopify-closure
  - 41-04-slack-closure
  - 41-05-proof-closure
  - 41-06-conformance-semantics-signoff

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "process-level exit hooks with idempotent globalThis guard for flushing evidence artifacts on crash"
    - "preserve-if-empty flush behavior: flushExecutionEvidence() no-ops when 0 hits and existing file has real data"
    - "child-process resilience test: spawnSync failing Vitest run + generatedAt >= spawnStartedAt proof"

key-files:
  created:
    - tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts
    - tests/sdk-verification/coverage/fixtures/failing-evidence-fixture.test.ts
    - tests/sdk-verification/coverage/fixtures/vitest.config.ts
  modified:
    - package.json
    - twins/shopify/src/plugins/oauth.ts
    - tests/sdk-verification/setup/global-setup.ts
    - tests/sdk-verification/setup/execution-evidence-runtime.ts

key-decisions:
  - "global-setup.ts: create-if-absent instead of delete-or-overwrite — preserves existing artifact across standalone runs, ensuring downstream gates remain usable immediately after any test run"
  - "flushExecutionEvidence() preserve-if-empty: when 0 hits accumulated and existing file has real data, skip flush — prevents single-file afterAll from destroying a populated full-run artifact"
  - "process-exit hooks registered on globalThis with idempotent guard — safe across module re-evaluations in same Vitest process"
  - "resilience test uses backup/restore pattern: backs up existing artifact, probes child, restores backup in finally block — keeps standalone drift:check runnable"
  - "child fixture uses minimal vitest config (no globalSetup/twins, has register-execution-evidence setupFile) to isolate the failing-run scenario"

patterns-established:
  - "Artifact resilience: write to known path on ALL exit paths (success, failure, crash) using layered hooks"
  - "Non-destructive artifact initialization: create-if-absent, never delete-or-overwrite at setup time"
  - "Preserve-if-empty flush: don't let a zero-hit test file destroy a populated artifact from a prior full run"

requirements-completed:
  - INFRA-19
  - INFRA-25

# Metrics
duration: 11min
completed: 2026-03-15
---

# Phase 41 Plan 02: Gate Recovery Summary

**Root build now includes twins (INFRA-19), Shopify twin compiles (subject_token_type fix), and symbol-execution.json survives failing runs via process-exit hooks and non-destructive initialization (INFRA-25)**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-03-15T06:44:52Z
- **Completed:** 2026-03-15T06:55:43Z
- **Tasks:** 2 (Task 1: build truth, Task 2: artifact resilience TDD)
- **Files modified:** 7

## Accomplishments

- Root `pnpm build` now includes `./twins/*` alongside `./packages/*` — a failing twin compile now causes the root build to fail, making the build gate truthful
- Shopify twin compile error fixed by adding `subject_token_type?: string` to `OAuthTokenRequestBody` — the token-exchange validation branch already used this field but the interface was missing it
- `global-setup.ts` no longer destructively deletes `symbol-execution.json` at startup — replaced with create-if-absent initialization that preserves existing data
- `execution-evidence-runtime.ts` has six process-level exit hooks (beforeExit, exit, SIGINT, SIGTERM, uncaughtException, unhandledRejection) with idempotent guard ensuring the artifact is written even on crash
- `flushExecutionEvidence()` has preserve-if-empty logic: when 0 hits accumulated and file already has real data, the flush is skipped so isolated test-file runs cannot destroy a populated full-run artifact
- Automated proof: `failing-evidence-fixture.test.ts` intentionally fails after `recordSymbolHit()`, `runtime-artifact-resilience.test.ts` spawns it as a child process and asserts the artifact is valid and newer than `spawnStartedAt`
- Full chain `pnpm vitest run resilience.test.ts && pnpm coverage:generate && pnpm drift:check` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Make root build truthful and fix Shopify twin compile** - `cc46caa` (feat)
2. **Task 2: Make runtime evidence artifacts survive failing SDK runs** - `57248a1` (feat, TDD RED+GREEN)

## Files Created/Modified

- `package.json` — Root build script extended to `--filter='./twins/*'` alongside packages
- `twins/shopify/src/plugins/oauth.ts` — `subject_token_type?: string` added to `OAuthTokenRequestBody`
- `tests/sdk-verification/setup/global-setup.ts` — Destructive `unlinkSync` replaced with create-if-absent initialization
- `tests/sdk-verification/setup/execution-evidence-runtime.ts` — Six process-exit hooks added with idempotent guard; `flushExecutionEvidence()` has preserve-if-empty logic; added `existsSync` and `readFileSync` imports
- `tests/sdk-verification/coverage/fixtures/failing-evidence-fixture.test.ts` — Created: intentionally failing test after `recordSymbolHit()` call
- `tests/sdk-verification/coverage/fixtures/vitest.config.ts` — Created: minimal vitest config for fixture isolation (no globalSetup, has execution-evidence setupFile)
- `tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts` — Created: spawns failing fixture, asserts artifact exists, is valid JSON, has `generatedAt >= spawnStartedAt`

## Decisions Made

- **create-if-absent instead of delete-or-overwrite in global-setup**: The previous `unlinkSync` approach left the artifact absent if the process was killed before any `afterAll` ran. Create-if-absent ensures the file is always present from test startup forward while preserving existing populated artifacts for standalone runs.
- **preserve-if-empty flush behavior**: The `afterAll` in `register-execution-evidence.ts` calls `flushExecutionEvidence()` after every test file. A file that records no hits (like the resilience test) would overwrite a 222-hit artifact with 0 hits. The preserve-if-empty guard prevents this regression.
- **backup/restore in resilience test**: The test backs up the existing artifact, deletes it, spawns the child, verifies the child wrote a valid artifact, then restores the backup in a `finally` block. This ensures `pnpm coverage:generate && pnpm drift:check` remain usable immediately after the standalone resilience test run.
- **Minimal fixture config**: The failing fixture uses its own `vitest.config.ts` with no globalSetup (no twins needed) but with `register-execution-evidence.ts` as a setupFile — this gives the fixture access to `recordSymbolHit()` and ensures the failure-path hooks fire when the child exits non-zero.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] flushExecutionEvidence preserve-if-empty — afterAll with 0 hits destroys populated artifact**

- **Found during:** Task 2 (runtime artifact resilience)
- **Issue:** The `afterAll` in `register-execution-evidence.ts` calls `flushExecutionEvidence()` after every test file. When the resilience test runs standalone, it accumulates 0 hits. The existing `flushExecutionEvidence()` would overwrite a 351-hit artifact with an empty payload, breaking `drift:check` for the acceptance criteria chain.
- **Fix:** Added preserve-if-empty logic to `flushExecutionEvidence()` — when 0 hits accumulated and existing file has real data (hits.length > 0), skip the flush entirely.
- **Files modified:** `tests/sdk-verification/setup/execution-evidence-runtime.ts`
- **Verification:** After resilience test runs standalone, `symbol-execution.json` retains the 351-hit content; full chain passes.
- **Committed in:** `57248a1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in flush behavior that would break acceptance criteria chain)
**Impact on plan:** Essential for making the acceptance criteria chain exit 0 in standalone mode. No scope creep.

## Issues Encountered

- `--config=false` flag for Vitest (intended to run without config) tried to load a file named "false" — resolved by creating a minimal `fixtures/vitest.config.ts` file for the child run.
- The `afterAll` flush-with-0-hits problem required a non-obvious design: the resilience test cannot prevent the afterAll from running, so the fix needed to be inside `flushExecutionEvidence()` itself with a preserve-if-empty guard.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 41-03 (Shopify closure) can now proceed with a truthful root build gate
- Phase 41-04 (Slack closure) unblocked by the same build fix
- The artifact resilience proof ensures that later `pnpm drift:check` runs are not stranded by a failing SDK test run
- `pnpm build && pnpm --dir twins/shopify build && pnpm --dir twins/slack build` all exit 0
- `pnpm vitest run tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts && pnpm coverage:generate && pnpm drift:check` exits 0

## Self-Check: PASSED

All created files verified present on disk. Task commits cc46caa and 57248a1 verified in git log.

---
*Phase: 41-regression-closure-and-release-gate-recovery*
*Completed: 2026-03-15*
