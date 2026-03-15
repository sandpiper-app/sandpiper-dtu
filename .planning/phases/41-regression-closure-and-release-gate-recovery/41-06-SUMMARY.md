---
phase: 41-regression-closure-and-release-gate-recovery
plan: "06"
subsystem: infra
tags: [conformance, header-comparison, coverage, signoff, release-gate]

# Dependency graph
requires:
  - phase: 41-05
    provides: Manifest-exact Slack surface proof, 278 tests green, eager symbol inflation removed
  - phase: 41-03
    provides: Shopify parity fixes (delete, inventory, orderUpdate)
  - phase: 41-04
    provides: Slack scope catalog, OAuth/OIDC, filesUploadV2 fixes
provides:
  - "compareHeaders field in FieldNormalizerConfig — opt-in deterministic header comparison"
  - "normalizeResponse preserves compareHeaders in exact mode; compareResponsesStructurally value-compares declared compareHeaders"
  - "Shopify normalizer opts into x-shopify-api-version; Slack normalizer opts into x-oauth-scopes and x-accepted-oauth-scopes"
  - "Reporter relabeled twin mode as structural smoke (was twin consistency)"
  - "Slack conformance index description clarifies proof scope boundary"
  - "coverage/fixtures excluded from sdk-verification vitest project — intentional failure fixture no longer breaks pnpm test:sdk"
  - "shopify-api-rest-client delete() test creates product first (hardcoded id=1 fails on empty state)"
  - "41-06-signoff-receipt.json with preRestore (docsState: pending) and postRestore (docsState: completed) entries, both exitCode: 0"
  - "coverage-report.json regenerated through runtime-symbol-execution path (346 live symbols)"
  - "All active planning docs restored to completed status after post-restoration signoff is green"
affects:
  - conformance-suites
  - future-phases

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compareHeaders allowlist pattern: only opt in headers that are deterministic across twin and baseline (version paths, auth scopes)"
    - "Pre/post-restore signoff receipt pattern: prove signoff is green before doc restoration AND after"
    - "Vitest exclude for intentional-failure fixtures: coverage/fixtures/** excluded from main sdk-verification project"

key-files:
  created:
    - ".planning/phases/41-regression-closure-and-release-gate-recovery/41-06-signoff-receipt.json"
  modified:
    - "packages/conformance/src/types.ts"
    - "packages/conformance/src/comparator.ts"
    - "packages/conformance/src/reporter.ts"
    - "twins/shopify/conformance/normalizer.ts"
    - "twins/slack/conformance/normalizer.ts"
    - "twins/slack/conformance/index.ts"
    - "tests/sdk-verification/vitest.config.ts"
    - "tests/sdk-verification/sdk/shopify-api-rest-client.test.ts"
    - "tests/sdk-verification/coverage/coverage-report.json"

key-decisions:
  - "compareHeaders is an opt-in allowlist, not compare-all — only headers with identical deterministic values on both twin and baseline should opt in"
  - "normalizeResponse preserves compareHeaders in exact mode; structural mode adds value-comparison for compareHeaders via compareResponsesStructurally"
  - "Reporter twin-mode label changed from 'twin consistency' to 'structural smoke' to correctly describe what twin-vs-twin comparison proves"
  - "Pre-restore signoff proves product side is green before docs change; post-restore signoff proves the restored docs do not invalidate the release path"
  - "failing-evidence-fixture.test.ts excluded from sdk-verification project — it intentionally fails for resilience testing and must only run as a child process"
  - "delete() test creates product first — tests relying on hardcoded IDs after state reset are structurally fragile"

patterns-established:
  - "Signoff receipt pattern: JSON file with preRestore+postRestore entries proving both ordered timestamps, matching command string, and exitCode: 0"
  - "FieldNormalizerConfig.compareHeaders: typed allowlist field with JSDoc warnings against volatile headers"

requirements-completed:
  - INFRA-19
  - INFRA-24
  - INFRA-25

# Metrics
duration: 12min
completed: 2026-03-15
---

# Phase 41 Plan 06: Conformance Semantics and Final Signoff Summary

**Deterministic header comparison added to conformance (compareHeaders allowlist), artifacts regenerated through runtime-symbol-execution, and active docs restored to completed status only after the post-restoration full signoff is green (669 tests, 346 live symbols, 30/30 conformance)**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-15T03:24:00Z
- **Completed:** 2026-03-15T03:34:00Z
- **Tasks:** 2
- **Files modified:** 9 (+ 1 created)

## Accomplishments

- Added `compareHeaders` to `FieldNormalizerConfig` and updated `normalizeResponse` to preserve opted-in headers in exact mode; updated `compareResponsesStructurally` to value-compare `compareHeaders` in structural mode
- Shopify normalizer opts into `x-shopify-api-version`; Slack normalizer opts into `x-oauth-scopes` and `x-accepted-oauth-scopes`
- Reporter twin-mode label changed to "structural smoke"; Slack conformance index description clarified
- Proof-integrity test 4 (conformance comparator preserves deterministic proof headers) turned GREEN
- Fixed pre-existing bugs: `failing-evidence-fixture` excluded from main vitest project; `delete()` test creates product before deleting
- Full signoff command run twice: pre-restore (docs pending, exitCode: 0) and post-restore (docs completed, exitCode: 0)
- `41-06-signoff-receipt.json` recorded with ordered timestamps and both `docsState` transitions
- Active planning docs (STATE.md, ROADMAP.md) restored to completed status — Phase 41 and Milestone v1.2 complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Tighten conformance semantics** - `80f0fcd` (feat)
2. **Task 2: Regenerate artifacts and restore docs after post-restoration signoff** - `d7035b6` (feat)

## Files Created/Modified

- `packages/conformance/src/types.ts` — Added `compareHeaders?: string[]` field to `FieldNormalizerConfig` with determinism guidance JSDoc
- `packages/conformance/src/comparator.ts` — Updated `normalizeResponse` to preserve `compareHeaders`; added header value-comparison block in `compareResponsesStructurally`
- `packages/conformance/src/reporter.ts` — Twin mode label changed from "twin consistency" to "structural smoke"
- `twins/shopify/conformance/normalizer.ts` — Opts into `compareHeaders: ['x-shopify-api-version']`
- `twins/slack/conformance/normalizer.ts` — Opts into `compareHeaders: ['x-oauth-scopes', 'x-accepted-oauth-scopes']`
- `twins/slack/conformance/index.ts` — Suite description clarified to say "structural smoke, not full 1:1 parity"
- `tests/sdk-verification/vitest.config.ts` — Added `exclude: ['**/coverage/fixtures/**']` to prevent intentional-failure fixture from running in main suite
- `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — `delete()` test now creates product first before deleting
- `tests/sdk-verification/coverage/coverage-report.json` — Regenerated via runtime-symbol-execution (346 live, 0 stub, 32333 deferred)
- `.planning/phases/41-regression-closure-and-release-gate-recovery/41-06-signoff-receipt.json` — Created with preRestore + postRestore entries

## Decisions Made

- `compareHeaders` is an opt-in allowlist — only declare headers that produce identical values on both twin and baseline calls; do NOT declare volatile headers (date, retry-after, x-request-id)
- Reporter label "structural smoke" over "twin consistency" — structural smoke accurately describes what twin-vs-twin comparison proves (response shape and deterministic seams, not full value equivalence)
- Pre-restore signoff required before doc restoration to confirm product side is green independently of any doc state claims
- Post-restore signoff required to confirm restored completion claims do not invalidate the release path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] shopify-api-rest-client.test.ts delete() used hardcoded products/1**
- **Found during:** Task 2 (pre-restore signoff run)
- **Issue:** `delete()` test called `client.delete({ path: 'products/1' })` but product with id=1 does not exist after state reset — returns 404
- **Fix:** Added `client.post()` to create a product first, then delete by the live id
- **Files modified:** `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts`
- **Verification:** Test passes with exit 0
- **Committed in:** d7035b6 (Task 2 commit)

**2. [Rule 2 - Missing Critical] failing-evidence-fixture included in sdk-verification run**
- **Found during:** Task 2 (pre-restore signoff run — `pnpm test:sdk` exited 1)
- **Issue:** `coverage/fixtures/failing-evidence-fixture.test.ts` is intentionally failing (used by the resilience test as a child process). It was picked up by the sdk-verification vitest project and always failed the main suite exit code
- **Fix:** Added `exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/fixtures/**']` to the sdk-verification vitest config
- **Files modified:** `tests/sdk-verification/vitest.config.ts`
- **Verification:** `pnpm test:sdk` exits 0 with 669 passed; fixture still runs correctly as a child in the resilience test
- **Committed in:** d7035b6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical)
**Impact on plan:** Both auto-fixes required for the signoff command to exit 0. No scope creep.

## Issues Encountered

- `pnpm test:sdk` initially failed due to the two pre-existing issues (intentional-failure fixture in scope, hardcoded delete id). Both were Rule 1/2 deviations and fixed before the signoff receipt was written.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Milestone v1.2 Behavioral Fidelity is complete. All 29 phases, 92 plans, and 23 v1.2 requirements are green.
- Post-restoration signoff is green. `41-06-signoff-receipt.json` proves the full pipeline (build + SDK tests + coverage + drift + conformance + proof-integrity) passes with docs in both pending and completed state.
- No blockers.

## Self-Check: PASSED

All created files verified present on disk. Task commits 80f0fcd and d7035b6 verified in git log.
- coverage-report.json: evidenceSource = "runtime-symbol-execution" ✓
- signoff-receipt.json: preRestore (pending, exitCode: 0) + postRestore (completed, exitCode: 0) ✓
- comparator.ts: does not contain the `const { 'content-type': contentType } = response.headers` pattern ✓
- types.ts: contains `compareHeaders` field ✓

---
*Phase: 41-regression-closure-and-release-gate-recovery*
*Completed: 2026-03-15*
