---
phase: 34-slack-build-fix-evidence-pipeline
plan: 01
subsystem: infra
tags: [typescript, vitest, coverage, oauth, slack-twin]

requires:
  - phase: 33-cross-cutting-reset-coverage
    provides: Phase 33 XCUT-01 reset tests — baseline test suite that feeds fresh vitest-evidence.json
  - phase: 32-coverage-gate
    provides: INFRA-22 evidence pipeline infrastructure and drift gate at 222

provides:
  - Buildable Slack twin — tsc --noEmit in twins/slack exits 0 with zero TS2345 errors
  - Fresh vitest-evidence.json — regenerated from actual pnpm test:sdk run (86 suites, 253 tests, exit 0)
  - Updated coverage-report.json — phase 34, 222 live symbols, derived from execution evidence
  - Fixed EVIDENCE_MAP comment — no longer references misleading "copy of LIVE_SYMBOLS" language

affects:
  - 35-slack-behavioral-parity
  - 36-shopify-behavioral-parity

tech-stack:
  added: []
  patterns:
    - TypeScript control-flow narrowing guard pattern — if (!code) before Map.delete(code) to narrow string | undefined to string without type cast

key-files:
  created: []
  modified:
    - twins/slack/src/plugins/oauth.ts
    - tests/sdk-verification/coverage/generate-report-evidence.ts
    - tests/sdk-verification/coverage/coverage-report.json

key-decisions:
  - "Type guard pattern over non-null assertion: if (!code) guard preferred over code! cast — logically unreachable but correct per TypeScript strict-mode control-flow analysis"
  - "EVIDENCE_MAP comment now accurately describes attribution semantics — symbols live only if mapped test file appears in passedFiles; removed 'copy of LIVE_SYMBOLS' language that caused audit Finding #2"
  - "vitest-evidence.json is gitignored; coverage-report.json is tracked — fresh regeneration confirmed by in-repo run (86/86 suites, exit 0)"

patterns-established:
  - "TypeScript TS2345 narrowing pattern: when Map.get(x) proves x is truthy but TypeScript control-flow cannot back-propagate, add if (!x) return guard to narrow the type before Map.delete(x)"

requirements-completed: []

duration: 2min
completed: 2026-03-14
---

# Phase 34 Plan 01: Slack Build Fix & Evidence Pipeline Summary

**TypeScript TS2345 compile error fixed in oauth.ts via type-narrowing guard; vitest-evidence.json regenerated from fresh 86-suite test run; coverage-report.json updated to phase 34 with 222 live symbols**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-14T01:35:18Z
- **Completed:** 2026-03-14T01:37:37Z
- **Tasks:** 2
- **Files modified:** 3 (tracked) + 1 gitignored (vitest-evidence.json)

## Accomplishments

- Fixed TS2345 compile error: `issuedCodes.delete(code)` where `code: string | undefined` — added logically-unreachable `if (!code)` type-narrowing guard before the call; `tsc --noEmit` in `twins/slack` now exits 0
- Regenerated `vitest-evidence.json` by running `pnpm test:sdk` with JSON reporter: 86 suites, 253 tests, all passed, exit 0 — evidence now reflects post-Phase-33 test state
- Updated `generate-report-evidence.ts`: replaced misleading EVIDENCE_MAP comment (`copy of LIVE_SYMBOLS from generate-report.ts`) with accurate attribution semantics comment; bumped phase metadata from `'32'` to `'34'`
- Rebuilt `coverage-report.json` from fresh evidence: 222 live symbols, `pnpm drift:check` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix TS2345 compile error in oauth.ts** - `e566b84` (fix)
2. **Task 2: Regenerate vitest-evidence.json and coverage-report.json** - `56599e8` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `twins/slack/src/plugins/oauth.ts` — Added `if (!code)` type-narrowing guard before `issuedCodes.delete(code)` at line 97; eliminates TS2345
- `tests/sdk-verification/coverage/generate-report-evidence.ts` — Updated EVIDENCE_MAP comment (removed "copy of LIVE_SYMBOLS" language); bumped phase from `'32'` to `'34'` with updated note string
- `tests/sdk-verification/coverage/coverage-report.json` — Regenerated: phase 34, 222 live, 32457 deferred, derived from fresh execution evidence
- `tests/sdk-verification/coverage/vitest-evidence.json` — Regenerated in situ (gitignored): 86 suites passed, 253 tests passed, exit 0

## Decisions Made

- **Type guard over non-null assertion:** Used `if (!code) { return { ok: false, error: 'invalid_code' }; }` rather than `code!` or `// @ts-ignore` — the guard is the correct pattern because it participates in control-flow analysis rather than suppressing the type system
- **EVIDENCE_MAP comment:** New comment accurately describes attribution semantics — symbols are only counted as `live` if their mapped test file appears in `vitest-evidence.json passedFiles`; the old "copy of LIVE_SYMBOLS" language was the root cause of Finding #2 Critical in the second review

## Deviations from Plan

None — plan executed exactly as written. The plan pre-emptively documented the sandbox socket-bind risk for `pnpm test:sdk`; in practice, the test suite ran successfully and produced fresh evidence (exit 0, 86/86 suites).

## Issues Encountered

- `vitest-evidence.json` is gitignored: the file was regenerated on disk but could not be committed. `coverage-report.json` (tracked) captures the regeneration outcome. This is expected behavior documented in the plan.

## Next Phase Readiness

- Phase 35 (Slack Behavioral Parity) is unblocked: Slack twin compiles cleanly, evidence pipeline is fresh
- Phase 36 (Shopify Behavioral Parity) is unblocked: drift:check passes, coverage gate intact
- No blockers or concerns

---
*Phase: 34-slack-build-fix-evidence-pipeline*
*Completed: 2026-03-14*

## Self-Check: PASSED

- FOUND: twins/slack/src/plugins/oauth.ts
- FOUND: tests/sdk-verification/coverage/generate-report-evidence.ts
- FOUND: tests/sdk-verification/coverage/coverage-report.json
- FOUND: .planning/phases/34-slack-build-fix-evidence-pipeline/34-01-SUMMARY.md
- FOUND commit: e566b84 (Task 1 — TS2345 fix)
- FOUND commit: 56599e8 (Task 2 — evidence pipeline)
