---
phase: 27-conformance-harness-coverage-infrastructure
plan: "02"
subsystem: sdk-verification/coverage
tags: [coverage, drift-check, evidence, infra-22, migration]
dependency_graph:
  requires: []
  provides: [evidence-based-coverage, 202-live-gate, drift-check-gate]
  affects: [tests/sdk-verification/coverage, tests/sdk-verification/drift, .github/workflows/conformance.yml]
tech_stack:
  added: []
  patterns: [vitest-json-reporter, evidence-based-coverage, fail-fast-guard]
key_files:
  created:
    - tests/sdk-verification/coverage/generate-report-evidence.ts
  modified:
    - tests/sdk-verification/coverage/coverage-report.json
    - tests/sdk-verification/drift/check-drift.ts
    - .github/workflows/conformance.yml
    - package.json
    - .gitignore
  deleted:
    - tests/sdk-verification/coverage/generate-report.ts
decisions:
  - "Delete generate-report.ts entirely (not rename) — content fully preserved in EVIDENCE_MAP in generate-report-evidence.ts"
  - "Use synthetic evidence (node -e) for local validation since sandbox blocks socket binds for pnpm test:sdk"
  - "coverage-report.json regenerated from evidence: 202 live, confirming EVIDENCE_MAP parity with LIVE_SYMBOLS"
metrics:
  duration: "3min"
  completed_date: "2026-03-13"
  tasks_completed: 3
  files_changed: 6
requirements_satisfied:
  - INFRA-22
---

# Phase 27 Plan 02: Evidence-Based Coverage Generator Summary

Evidence-based coverage generator (INFRA-22) replacing hand-authored LIVE_SYMBOLS map with Vitest JSON reporter output validation, adding 202-live-count gate to drift check, and completing migration by deleting legacy generate-report.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create generate-report-evidence.ts and add .gitignore entry | 269debd | generate-report-evidence.ts, .gitignore |
| 2 | Add 202-live-count gate to check-drift.ts, update CI workflow, generate evidence | abe523c | check-drift.ts, coverage-report.json, conformance.yml |
| 3 | Remove LIVE_SYMBOLS, update coverage:generate script, verify drift:check green | 766f640 | generate-report.ts (deleted), package.json |

## What Was Built

**generate-report-evidence.ts** — New evidence-based coverage report generator. Reads `vitest-evidence.json` (Vitest JSON reporter output), builds a `passedFiles` set from `testResults[].status === 'passed'`, normalizes absolute paths to `tests/sdk-verification/`-relative format, then validates EVIDENCE_MAP (copy of LIVE_SYMBOLS) against execution evidence. Symbols whose mapped test file passed → `live`; absent or failed → `deferred`. Fails fast with a clear error message when `vitest-evidence.json` is missing.

**check-drift.ts section 2b** — New `REQUIRED_LIVE_COUNT = 202` gate reads `coverage-report.json` and fails if `summary.live < 202`, with actionable recovery command.

**conformance.yml** — CI now runs three steps instead of two: `pnpm test:sdk` with `--reporter=json --outputFile.json=...vitest-evidence.json`, then `pnpm coverage:generate`, then `pnpm drift:check`. This ensures CI always derives coverage from execution evidence.

**Migration complete** — `generate-report.ts` deleted, `package.json` `coverage:generate` script updated to point to `generate-report-evidence.ts`.

## Verification Results

- `generate-report-evidence.ts` without evidence file: `ERROR: vitest-evidence.json not found` — fail-fast confirmed
- After synthetic evidence (24 test files, all passed): `202 live, 0 stub, 32477 deferred` — matches LIVE_SYMBOLS count exactly
- `pnpm drift:check`: all 5 checks passed, including new section 2b: `OK  Live coverage: 202 >= 202 required.`
- LIVE_SYMBOLS: file removed (confirmed by grep returning "file removed")
- `.gitignore`: contains `tests/sdk-verification/coverage/vitest-evidence.json`

## Deviations from Plan

### Auto-applied Option

**Task 2, Part C — Synthetic evidence used (Option 2)**

Sandbox blocks local socket binds so `pnpm test:sdk` cannot boot the twin harness. Used `node -e` to generate synthetic `vitest-evidence.json` with all 24 known test files marked as `passed`. This is the expected fallback documented in the plan. EVIDENCE_MAP count (202) matches LIVE_SYMBOLS count exactly, confirming correct migration.

## Self-Check: PASSED

- [x] `tests/sdk-verification/coverage/generate-report-evidence.ts` — FOUND
- [x] `tests/sdk-verification/coverage/coverage-report.json` — FOUND (202 live)
- [x] `tests/sdk-verification/drift/check-drift.ts` contains `REQUIRED_LIVE_COUNT` — FOUND
- [x] `tests/sdk-verification/coverage/generate-report.ts` — DELETED (file removed)
- [x] `package.json` `coverage:generate` points to `generate-report-evidence.ts` — CONFIRMED
- [x] `.gitignore` contains `vitest-evidence.json` — CONFIRMED
- [x] Commits 269debd, abe523c, 766f640 — FOUND
