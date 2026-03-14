---
phase: 40-verification-evidence-integrity-and-conformance-truthfulness
plan: "01"
subsystem: infra
tags: [vitest, requirements, coverage, conformance, truthfulness]

# Dependency graph
requires:
  - phase: 39-shopify-oauth-rest-state-and-id-parity
    provides: completed Phase 39 — all prior phases done, REQUIREMENTS.md at 23 v1.2 requirements

provides:
  - INFRA-23, INFRA-24, INFRA-25 formally defined in REQUIREMENTS.md with concrete meanings
  - v1.2 traceability table updated with three Phase 40 Pending rows
  - coverage summary updated to 26 total (23 complete, 3 pending)
  - red truthfulness contract test at tests/sdk-verification/coverage/truthfulness-contract.test.ts

affects:
  - 40-02-PLAN: must turn Test 3 green (replace EVIDENCE_MAP) and Test 1 provenance fields green
  - 40-03-PLAN: must turn Test 1 phase field green (update coverage-report.json phase to '40')
  - 40-04-PLAN: must turn Test 4 green (remove 'Complete Slack Web API conformance suite' wording) and Test 2 green

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Red truthfulness contract: file-system reads in sdk-verification test to assert future state before implementation lands"
    - "Coverage provenance assertions: top-level evidenceSource/executionArtifact/vitestArtifact fields as the Phase 40 contract"

key-files:
  created:
    - tests/sdk-verification/coverage/truthfulness-contract.test.ts
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "INFRA-23 scoped to runtime symbol execution evidence at shared helper seam — not just 'any instrumentation'; per-symbol hit capture during SDK test run"
  - "INFRA-24 scoped to value/exact checks proving parity — structural-only suites are reported as smoke, not 1:1 proof"
  - "INFRA-25 scoped to provenance metadata in generated artifacts and freshness enforcement at gate level — not just doc updates"
  - "Red contract test reads from disk (no twin calls) so it can be run without live network but still runs inside sdk-verification project with globalSetup"
  - "Test 2 checks that live entries lack evidenceFiles[] — the absence of the runtime evidence field is the correct failure mode for pre-Phase-40 state"

patterns-established:
  - "Phase 40 TDD pattern: write contract test that asserts the exact future schema fields before adding implementation"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 40 Plan 01: Requirement Definitions and Red Truthfulness Contract Summary

**INFRA-23/24/25 formally defined in REQUIREMENTS.md and locked behind a 4-test red contract asserting exact Phase 40 provenance and wording targets**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-14T19:29:32Z
- **Completed:** 2026-03-14T19:33:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added INFRA-23 (runtime symbol execution evidence), INFRA-24 (parity only where value checks prove it), and INFRA-25 (provenance metadata and freshness enforcement) to REQUIREMENTS.md immediately below INFRA-22
- Updated v1.2 traceability table with `| INFRA-23 | Phase 40 | Pending |`, `| INFRA-24 | Phase 40 | Pending |`, `| INFRA-25 | Phase 40 | Pending |` rows
- Updated coverage summary to `v1.2 requirements: 26 total (23 complete, 3 pending)`, `Mapped to phases: 26`, `Unmapped: 0`
- Created `tests/sdk-verification/coverage/truthfulness-contract.test.ts` with 4 failing assertions that name the exact Phase 40 deliverables — phase `'40'`, `evidenceSource: 'runtime-symbol-execution'`, `executionArtifact` and `vitestArtifact` paths, no bare `testFile`-only live entries, no `const EVIDENCE_MAP`, and no `Complete Slack Web API conformance suite` wording

## Task Commits

Each task was committed atomically:

1. **Task 1: Define INFRA-23..25 and repair Phase 40 traceability** - `5d1c71f` (feat)
2. **Task 2: Add the red truthfulness contract test** - `19fdced` (test)

## Files Created/Modified

- `.planning/REQUIREMENTS.md` — added INFRA-23/24/25 definitions under INFRA-22, added 3 traceability rows, updated coverage summary counts
- `tests/sdk-verification/coverage/truthfulness-contract.test.ts` — 4-test red contract reading coverage-report.json, generate-report-evidence.ts, and twins/slack/conformance/index.ts from disk

## Decisions Made

- INFRA-23 scoped to runtime symbol execution evidence at shared helper seam rather than any instrumentation — the concrete promise is per-symbol hit capture during the SDK test run, not just file-pass evidence
- INFRA-24 scoped to value/exact checks proving parity — structural-only suites are reported as smoke (not 1:1 proof); the honest move is tighten deterministic seams, not blanket exact mode
- INFRA-25 scoped to provenance metadata in generated artifacts and freshness enforcement at gate level — checking phase field and provenance fields in coverage-report.json is the concrete contract
- Red contract test uses `node:fs` disk reads so it runs in the sdk-verification project context without needing live twin responses; globalSetup still runs but test assertions are independent of twin state
- Test 2 checks that live entries lack `evidenceFiles[]` — the absence of the runtime evidence field is the correct failure mode for the pre-Phase-40 state of all 222 live entries

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 40 Plan 02 can proceed: it must turn Test 3 green (replace `const EVIDENCE_MAP` with runtime symbol recorder) and add `evidenceSource`, `executionArtifact`, `vitestArtifact` to coverage-report.json
- Phase 40 Plan 03 turns the coverage-report.json `phase` field green by regenerating the report after the runtime evidence pipeline lands
- Phase 40 Plan 04 turns Test 4 green by removing `Complete Slack Web API conformance suite` wording and turns Test 2 green when `evidenceFiles[]` replaces bare `testFile` attribution

---
*Phase: 40-verification-evidence-integrity-and-conformance-truthfulness*
*Completed: 2026-03-14*

## Self-Check: PASSED

- FOUND: .planning/REQUIREMENTS.md
- FOUND: tests/sdk-verification/coverage/truthfulness-contract.test.ts
- FOUND: .planning/phases/40-verification-evidence-integrity-and-conformance-truthfulness/40-01-SUMMARY.md
- FOUND commit: 5d1c71f (feat(40-01): define INFRA-23, INFRA-24, INFRA-25)
- FOUND commit: 19fdced (test(40-01): add failing red truthfulness contract)
