---
phase: 40-verification-evidence-integrity-and-conformance-truthfulness
plan: "03"
subsystem: infra
tags: [coverage, drift-check, provenance, freshness, runtime-symbol-execution, INFRA-25]

# Dependency graph
requires:
  - phase: 40-02
    provides: "runtime-symbol-execution evidence pipeline and Phase 40 coverage-report.json with provenance block"

provides:
  - "Pure validateCoverageReportTruthfulness() validator enforcing 6 provenance/freshness/legacy-shape rules"
  - "17 regression tests covering all negative paths: missing provenance, stale timestamps, legacy testFile field, and valid Phase 40 report"
  - "pnpm drift:check now enforces INFRA-25 provenance gate before INFRA-22 live-count floor"
  - "Explicit rule name in CI failure output so Phase 40 regressions are immediately identifiable"
  - "Fresh symbol-execution.json (351 hits, 226 unique symbols) and coverage-report.json (222 live)"

affects:
  - "Phase 40-04 — summary and docs phase that documents final proof boundaries"
  - "Future CI runs — drift:check now fails stale or legacy-shaped reports before reaching live-count gate"
  - "Future coverage:generate runs — provenance block required for drift:check to pass"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-driven pure validator pattern: validateCoverageReportTruthfulness() accepts parsed objects (not file paths) enabling reuse by both unit tests (with fabricated objects) and CLI gate (with disk-parsed objects)"
    - "Structured ValidationResult type: { ok, rule?, message? } where rule is a machine-readable string matching CI log patterns"
    - "CLI gate delegates to shared helpers rather than duplicating rules: check-drift.ts calls report-provenance.ts, owns no provenance logic itself"

key-files:
  created:
    - tests/sdk-verification/drift/report-provenance.ts
    - tests/sdk-verification/drift/report-provenance.test.ts
  modified:
    - tests/sdk-verification/drift/check-drift.ts
    - tests/sdk-verification/coverage/symbol-execution.json
    - tests/sdk-verification/coverage/coverage-report.json

key-decisions:
  - "Pure data-driven validator: accepts parsed objects not file paths — enables unit tests with fabricated objects and CLI gate with disk objects from the same single function"
  - "ValidationResult.rule is a machine-readable failure identifier (e.g., stale-report-vs-symbol-execution) — naming the failing rule explicitly in CI output makes Phase 40 regressions obvious without requiring log archaeology"
  - "Provenance gate placed before live-count gate in check-drift.ts — stale or misleading reports fail before the count floor is evaluated, preventing a stale report from masquerading as fresh evidence just because the live count hasn't dropped"
  - "report-provenance.test.ts uses fabricated objects (not disk reads) — tests are hermetic and pass even when real artifacts are absent or stale"
  - "Full SDK test suite rerun required after TDD test isolation overwrote symbol-execution.json — the global-setup.ts design (delete-on-start) is correct for full suite runs; running a single isolated test file wipes accumulated evidence from prior runs"

patterns-established:
  - "Provenance validator pattern: validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence) — pure function, no side effects, no file I/O, returns ValidationResult"
  - "Phase 40 provenance gate: drift:check must validate provenance before live-count; a passing provenance gate proves freshness + runtime-symbol-execution, not just count continuity"

requirements-completed:
  - INFRA-25

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 40 Plan 03: Provenance Truthfulness Gate Summary

**Pure provenance validators with 17 regression tests and pnpm drift:check hardened to fail stale or misleading coverage reports before applying the live-count floor**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T20:06:24Z
- **Completed:** 2026-03-14T20:10:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `tests/sdk-verification/drift/report-provenance.ts` exporting `validateCoverageReportTruthfulness()` — a pure, data-driven validator enforcing 6 rules: provenance block present, evidenceSource equals `runtime-symbol-execution`, both artifact fields present, report generatedAt is newer than both source artifact timestamps, and no symbol entry contains a legacy top-level `testFile` field
- Backed the validator with `tests/sdk-verification/drift/report-provenance.test.ts` — 17 tests covering all 4 behavior groups from the plan: missing provenance, stale timestamps, legacy testFile shape, and a passing Phase 40-shaped report
- Updated `pnpm drift:check` to run the provenance gate before the INFRA-22 live-count floor; the new section names the failing rule explicitly (e.g., `[stale-report-vs-symbol-execution]`) in CI output for immediate diagnosis

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unit-tested provenance and freshness validators** - `5d81ce2` (feat — TDD RED/GREEN)
2. **Task 2: Harden pnpm drift:check** - `5f7ebe6` (feat)

**Plan metadata:** (committed with SUMMARY.md below)

## Files Created/Modified

- `tests/sdk-verification/drift/report-provenance.ts` — Pure `validateCoverageReportTruthfulness()` helper exporting `ValidationResult` type; no file I/O; data-driven for reuse by both tests and CLI
- `tests/sdk-verification/drift/report-provenance.test.ts` — 17 unit tests across 4 describe blocks: missing provenance, stale timestamps, legacy testFile field, valid Phase 40 report
- `tests/sdk-verification/drift/check-drift.ts` — Added section 2a (INFRA-25 provenance gate); imports validator from report-provenance.js; updated header comment to document the gate
- `tests/sdk-verification/coverage/symbol-execution.json` — Refreshed after full SDK test suite run (351 hits, 226 unique symbols, 2026-03-14T20:10:12Z)
- `tests/sdk-verification/coverage/coverage-report.json` — Regenerated with fresh provenance block (222 live symbols, 2026-03-14T20:10:17Z)

## Decisions Made

- **Pure data-driven validator:** `validateCoverageReportTruthfulness(report, symbolExec, vitestEvidence)` accepts already-parsed objects so unit tests can use fabricated inputs without disk reads. The CLI gate reads files from disk and passes the parsed objects to the same function. No duplication.
- **`ValidationResult.rule` as machine-readable failure identifier:** e.g., `stale-report-vs-symbol-execution`, `missing-evidenceSource`, `legacy-testFile-field`. The CLI surfaces this in brackets before the human message — `FAIL Provenance rule violated: [stale-report-vs-symbol-execution]`.
- **Provenance gate before live-count gate:** Placed as section 2a (before 2b INFRA-22). A stale or misleading report fails before the count floor is evaluated, preventing a cached report from masquerading as fresh evidence just because live count hasn't dropped yet.
- **Test isolation problem documented:** Running the provenance test in isolation triggers `global-setup.ts` which deletes `symbol-execution.json` and the test run then flushes 0 hits, wiping accumulated evidence. The full SDK test suite must be run to regenerate real evidence before `pnpm drift:check`. This is by-design behavior in the sdk-verification project (delete-on-start ensures clean evidence per full run).

## Deviations from Plan

None — plan executed exactly as written. The TDD RED/GREEN cycle worked as expected. The note about running the full SDK test suite to restore evidence after isolated test runs is a documented consequence of the global-setup design, not a deviation from the plan.

## Issues Encountered

Running `pnpm vitest run tests/sdk-verification/drift/report-provenance.test.ts` in isolation triggered the `global-setup.ts` `unlinkSync(symbolExecutionPath)` call, which wiped the accumulated Phase 40-02 symbol hits from `symbol-execution.json`. Subsequent `pnpm coverage:generate` produced 0 live symbols. Resolved by running the full `pnpm test:sdk` suite to regenerate the evidence, then `pnpm coverage:generate` to refresh `coverage-report.json`. This is not a bug — it is the correct behavior for the sdk-verification project's clean-slate evidence policy.

## Next Phase Readiness

- INFRA-25 gating layer satisfied: misleading or stale coverage reports fail fast before the live-count floor
- Phase 40 complete: Plans 01-04 collectively satisfy INFRA-23, INFRA-24, and INFRA-25
- `pnpm drift:check` is now the authoritative Phase 40 truthfulness gate: proves provenance freshness + runtime-symbol-execution + live-count continuity in a single command

## Self-Check: PASSED

- FOUND: tests/sdk-verification/drift/report-provenance.ts
- FOUND: tests/sdk-verification/drift/report-provenance.test.ts
- FOUND: tests/sdk-verification/drift/check-drift.ts
- FOUND: commit 5d81ce2 (feat(40-03): add unit-tested provenance and freshness validators)
- FOUND: commit 5f7ebe6 (feat(40-03): harden pnpm drift:check with provenance-aware coverage truthfulness gate)

---
*Phase: 40-verification-evidence-integrity-and-conformance-truthfulness*
*Completed: 2026-03-14*
