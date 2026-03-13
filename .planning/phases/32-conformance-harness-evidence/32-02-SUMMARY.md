---
phase: 32-conformance-harness-evidence
plan: 02
subsystem: testing
tags: [coverage, drift-check, INFRA-22, vitest-evidence, sdk-verification]

# Dependency graph
requires:
  - phase: 31-slack-oauth-method-coverage
    provides: "20 new EVIDENCE_MAP entries (SLCK-14 + oauth.v2.access) raising live count from 202 to 222"
provides:
  - "REQUIRED_LIVE_COUNT = 222 gate in check-drift.ts (was 202)"
  - "INTEGRATION-TEST EXCLUSIONS comment block in generate-report-evidence.ts documenting slack-signing.test.ts and slack-state-tables.test.ts"
  - "coverage-report.json regenerated with phase: '32' and summary.live: 222"
  - "pnpm drift:check passes cleanly on all checks"
affects:
  - 32-conformance-harness-evidence
  - future phases adding new EVIDENCE_MAP entries

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integration-test exclusion pattern: files in vitest-evidence.json with no EVIDENCE_MAP entries must be documented with INTEGRATION-TEST EXCLUSIONS comment block (INFRA-22)"
    - "REQUIRED_LIVE_COUNT gate in check-drift.ts must match EVIDENCE_MAP entry count after each phase that adds new symbols"

key-files:
  created: []
  modified:
    - tests/sdk-verification/drift/check-drift.ts
    - tests/sdk-verification/coverage/generate-report-evidence.ts
    - tests/sdk-verification/coverage/coverage-report.json

key-decisions:
  - "REQUIRED_LIVE_COUNT raised from 202 to 222 after Phase 31 added 20 new symbols (19 SLCK-14 method families + oauth.v2.access)"
  - "Integration-test exclusion pattern documented via comment block before EVIDENCE_MAP: slack-signing.test.ts (SLCK-16 behavioral) and slack-state-tables.test.ts (SLCK-17 behavioral) have no EVIDENCE_MAP entries because all their WebClient methods are already attributed to dedicated primary test files"
  - "Phase metadata updated: phase '27' → '32', note string updated to reference INFRA-21/22 and compareValueFields"

patterns-established:
  - "After each phase that adds EVIDENCE_MAP entries, update REQUIRED_LIVE_COUNT in check-drift.ts AND the internal gate in generate-report-evidence.ts to match — the two constants must stay in sync"

requirements-completed: [INFRA-22]

# Metrics
duration: 1min
completed: 2026-03-13
---

# Phase 32 Plan 02: Conformance Coverage Gate Update Summary

**Coverage gate raised to 222 (from 202), INFRA-22 integration-test exclusion pattern documented, and coverage-report.json regenerated with phase '32' metadata — pnpm drift:check passes all checks cleanly**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-13T21:15:31Z
- **Completed:** 2026-03-13T21:16:29Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Raised REQUIRED_LIVE_COUNT from 202 to 222 in check-drift.ts (matches post-Phase-31 live count)
- Added INTEGRATION-TEST EXCLUSIONS comment block before EVIDENCE_MAP in generate-report-evidence.ts, documenting why slack-signing.test.ts and slack-state-tables.test.ts have no EVIDENCE_MAP entries (INFRA-22 compliance)
- Updated phase metadata: '27' → '32', note string updated to reference Phase 32 changes
- Regenerated coverage-report.json: phase '32', summary.live 222, all 31 test files, pnpm drift:check passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Update check-drift.ts gate and add exclusion docs to generate-report-evidence.ts** - `bb082f9` (feat)
2. **Task 2: Regenerate coverage-report.json and verify pnpm drift:check passes** - `3d9125d` (feat)

## Files Created/Modified

- `tests/sdk-verification/drift/check-drift.ts` - REQUIRED_LIVE_COUNT 202 → 222, console.log string updated
- `tests/sdk-verification/coverage/generate-report-evidence.ts` - INTEGRATION-TEST EXCLUSIONS block added, phase '27' → '32', note updated, internal gate 202 → 222
- `tests/sdk-verification/coverage/coverage-report.json` - Regenerated with phase '32', summary.live 222

## Decisions Made

- REQUIRED_LIVE_COUNT and internal generate gate both raised to 222 — they must always match (drift check reads the report, generator produces it)
- Integration-test exclusion comment documents behavioral test files that deliberately have no EVIDENCE_MAP entries — this is the INFRA-22 "how local-only utilities are excluded" requirement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Coverage gate updated and in sync — future phases adding EVIDENCE_MAP entries must also increment REQUIRED_LIVE_COUNT
- Phase 32 plan 02 complete — all INFRA-22 documentation and gate requirements satisfied

---
*Phase: 32-conformance-harness-evidence*
*Completed: 2026-03-13*
