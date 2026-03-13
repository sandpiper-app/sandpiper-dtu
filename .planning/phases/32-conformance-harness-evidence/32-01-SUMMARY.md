---
phase: 32-conformance-harness-evidence
plan: 01
subsystem: testing
tags: [conformance, comparator, structural-comparison, vitest, typescript]

# Dependency graph
requires:
  - phase: 27-conformance-coverage
    provides: compareResponsesStructurally + FieldNormalizerConfig foundation
provides:
  - compareValueFields optional field on FieldNormalizerConfig (types.ts + dist/types.d.ts)
  - getNestedValue helper in comparator.ts for dot-notation path traversal
  - compareValueFields loop in compareResponsesStructurally after compareStructure call
  - 3 new unit tests: struct-7 (mismatch), struct-8 (match), struct-9 (dedup)
  - shopifyNormalizer proof-of-concept wiring compareValueFields: ['ok']
affects: [32-02, conformance live mode, shopify twin conformance suites]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compareValueFields: opt-in per-field primitive value check that runs after compareStructure in structural mode"
    - "dedup guard: reportedPaths Set prevents double-reporting when compareStructure already caught the type mismatch"
    - "getNestedValue: dot-notation traversal returning undefined (not throw) for missing/non-object segments"

key-files:
  created: []
  modified:
    - packages/conformance/src/types.ts
    - packages/conformance/src/comparator.ts
    - packages/conformance/test/comparator.test.ts
    - twins/shopify/conformance/normalizer.ts

key-decisions:
  - "compareValueFields loop runs AFTER compareStructure so type-mismatch diffs already in differences; dedup guard (reportedPaths Set) prevents double-reporting"
  - "Guard conditions: twinVal !== undefined AND baselineVal !== undefined AND typeof !== 'object' — silently skip stripped/nested fields rather than erroring"
  - "null is typeof 'object' so null values pass through the typeof guard without comparison — consistent with structural mode intent"
  - "shopifyNormalizer.compareValueFields: ['ok'] wires feature end-to-end; ok field is deterministic on both twin and live Shopify responses"

patterns-established:
  - "compareValueFields pattern: declare critical primitive fields that must match even in structural mode without requiring exact mode for the entire response"

requirements-completed: [INFRA-21]

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 32 Plan 01: compareValueFields for Structural Conformance Summary

**opt-in primitive value comparison for critical fields (ok, error) in structural mode — guards against false-pass when twin returns ok:false while live returns ok:true**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T21:55:29Z
- **Completed:** 2026-03-13T21:57:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `compareValueFields?: string[]` added to `FieldNormalizerConfig` with full JSDoc; exported in `dist/types.d.ts`
- `getNestedValue` helper and `compareValueFields` loop inserted after `compareStructure` call in `compareResponsesStructurally` — dedup guard prevents double-reporting
- 3 new unit tests GREEN: struct-7 (mismatch caught), struct-8 (non-declared field ignored), struct-9 (no double-report)
- `shopifyNormalizer` wired with `compareValueFields: ['ok']` as proof-of-concept for end-to-end wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Add compareValueFields to types.ts and implement in comparator.ts** - `bb082f9` (feat — pre-committed in phase 32 setup)
2. **Task 2: Unit tests + shopifyNormalizer proof-of-concept** - `1089f8a` (feat)

## Files Created/Modified
- `packages/conformance/src/types.ts` - Added `compareValueFields?: string[]` to `FieldNormalizerConfig` before `custom` field
- `packages/conformance/src/comparator.ts` - Added `getNestedValue` helper + `compareValueFields` loop after `compareStructure` call in `compareResponsesStructurally`
- `packages/conformance/test/comparator.test.ts` - Added struct-7, struct-8, struct-9 tests (21 total, all GREEN)
- `twins/shopify/conformance/normalizer.ts` - Added `compareValueFields: ['ok']` to `shopifyNormalizer`

## Decisions Made
- `compareValueFields` loop deduplicates via `reportedPaths` Set so a type mismatch already caught by `compareStructure` is not re-reported as a value mismatch
- Guard requires both values to be non-undefined AND non-object (typeof !== 'object') — silently skips stripped fields and nested objects
- `null` passes `typeof !== 'object'` check as false, so null values are excluded from primitive comparison (consistent with structural mode)
- Implementation was pre-committed in `bb082f9` (phase 32 planning commit) — Task 2 test + normalizer commit is the execution artifact

## Deviations from Plan

None — plan executed exactly as written. Implementation was pre-committed in the phase planning commit; tests and normalizer proof-of-concept added in this execution.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- INFRA-21 fully satisfied: `compareValueFields` declared in types, implemented in comparator, tested with 3 unit tests, wired in shopifyNormalizer
- Ready for Phase 32 Plan 02 (INFRA-22 evidence gate) — conformance harness can now catch primitive value regressions for declared critical fields

---
*Phase: 32-conformance-harness-evidence*
*Completed: 2026-03-13*
