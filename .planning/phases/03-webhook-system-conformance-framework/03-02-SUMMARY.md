---
phase: 03-webhook-system-conformance-framework
plan: 02
subsystem: testing
tags: [conformance, deep-diff, vitest, cli, fixture, adapter, normalizer]

# Dependency graph
requires:
  - phase: 02-shopify-twin-core
    provides: Shopify twin patterns and adapter concepts used as reference for generic framework design
provides:
  - Generic conformance testing framework (@dtu/conformance) with runner, adapter interface, comparator, reporter, fixture store, and CLI
  - FieldNormalizerConfig with nested dot-path stripping and wildcard array support
  - FixtureStore for offline mode fixture recording and playback
  - ConformanceRunner orchestrating twin vs baseline comparison
  - ConformanceReporter outputting markdown table summary + diff-style failures + JSON mode
  - CLI binary (dtu-conformance) for single-command suite execution
affects:
  - 03-03-shopify-conformance-suite (consumes adapter interface and runner)
  - 05-slack-twin (reuses framework for Slack conformance testing)

# Tech tracking
tech-stack:
  added:
    - deep-diff@1.0.2 (structural response comparison)
    - "@types/deep-diff@1.0.5"
  patterns:
    - Adapter pattern: ConformanceAdapter interface enables twin-agnostic test execution
    - Offline mode: FixtureStore saves live responses to JSON files for credential-free CI
    - Field normalization: dot-path with wildcard (*) stripping handles non-deterministic IDs and timestamps
    - Mode stratification: twin | live | offline with different baseline resolution per mode

key-files:
  created:
    - packages/conformance/package.json
    - packages/conformance/tsconfig.json
    - packages/conformance/vitest.config.ts
    - packages/conformance/src/types.ts
    - packages/conformance/src/adapter.ts
    - packages/conformance/src/comparator.ts
    - packages/conformance/src/runner.ts
    - packages/conformance/src/reporter.ts
    - packages/conformance/src/fixture-store.ts
    - packages/conformance/src/cli.ts
    - packages/conformance/src/index.ts
    - packages/conformance/test/comparator.test.ts
  modified: []

key-decisions:
  - "Used deep-diff library for structural comparison - maps N/D/E/A kinds to added/deleted/changed/array"
  - "Field normalization uses dot-path notation with * wildcard for array traversal (body.edges.*.node.id)"
  - "Twin-only mode compares response to itself (always passes) - useful for smoke testing structure"
  - "CLI requires --twin-adapter flag; suite path can be positional or --suite"
  - "Fixture IDs sanitized to filesystem-safe characters via regex replacement"
  - "Record mode saves fixtures from live adapter for bootstrapping offline mode"

patterns-established:
  - "Adapter pattern: init() + execute() + teardown() lifecycle for any API target"
  - "Offline-first: fixture store enables CI without network or credentials"
  - "Strict pass/fail: every field difference is a failure, no known-differences concept"
  - "JSON output mode for CI consumption, human-readable markdown table for local runs"

requirements_completed: [INFRA-05]

# Metrics
duration: 15min
completed: 2026-02-27
---

# Phase 3 Plan 02: @dtu/conformance Framework Summary

**Generic conformance framework with adapter interface, deep-diff comparator with wildcard field normalization, offline fixture store, and CLI — any twin can plug in to run the same tests against twin and real API.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-27T04:30:00Z
- **Completed:** 2026-02-27T04:48:49Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created `@dtu/conformance` package with all source files, types, and 11 unit tests passing
- Implemented field normalization with dot-path stripping and `*` wildcard for arrays (`body.edges.*.node.id`)
- ConformanceRunner orchestrates twin vs baseline execution with setup/teardown per test
- Reporter outputs markdown summary table + diff-style failures, plus JSON mode for CI
- FixtureStore enables offline mode from file-based recorded responses
- CLI binary `dtu-conformance` with `--suite`, `--mode`, `--twin-adapter`, `--live-adapter`, `--fixtures`, `--record` flags

## Task Commits

Each task was committed atomically:

1. **Task 1: Create @dtu/conformance package with types, adapter interface, and comparator** - included in `0993023` (feat)
2. **Task 2: Implement runner, reporter, fixture store, and CLI** - included in `0993023` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `packages/conformance/package.json` - Package config with deep-diff dep and dtu-conformance bin
- `packages/conformance/tsconfig.json` - TypeScript project config extending tsconfig.base.json
- `packages/conformance/vitest.config.ts` - Vitest configuration for node environment
- `packages/conformance/src/types.ts` - All framework types: ConformanceOperation, ConformanceResponse, ConformanceTest, ConformanceSuite, FieldNormalizerConfig, ComparisonResult, Difference, ConformanceReport
- `packages/conformance/src/adapter.ts` - ConformanceAdapter interface (init/execute/teardown)
- `packages/conformance/src/comparator.ts` - compareResponses() with nested dot-path + wildcard normalization using deep-diff
- `packages/conformance/src/runner.ts` - ConformanceRunner orchestrating adapter setup, test loop, comparison, teardown; record mode for fixture bootstrapping
- `packages/conformance/src/reporter.ts` - ConformanceReporter with markdown table + diff output + JSON mode
- `packages/conformance/src/fixture-store.ts` - FixtureStore save/load/has/list using JSON files in fixture directory
- `packages/conformance/src/cli.ts` - CLI entry point with shebang, arg parsing, dynamic module loading
- `packages/conformance/src/index.ts` - Public API re-exports for all types and classes
- `packages/conformance/test/comparator.test.ts` - 11 unit tests covering all normalization scenarios

## Decisions Made
- Used `deep-diff` library which provides N (new), D (deleted), E (edited), A (array) difference kinds — mapped to the plan's added/deleted/changed/array semantics
- Field normalization walk traverses the response object tree using dot-path parts, with explicit array loop when encountering `*` wildcard segment
- Twin-only mode (no baseline adapter) compares response to itself — always passes, useful for structural smoke testing
- CLI loads adapters via dynamic `import()` with pathToFileURL for cross-platform compatibility
- Fixture IDs sanitized to `[a-zA-Z0-9_-]` pattern for filesystem safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `@dtu/conformance` package is complete and builds cleanly
- All 11 unit tests pass
- Ready for Plan 03-03: Shopify conformance suite implementation using this framework
- ConformanceAdapter interface is the integration point — Shopify suite creates twin adapter and live adapter

## Self-Check

- [x] `packages/conformance/src/types.ts` exists
- [x] `packages/conformance/src/adapter.ts` exists
- [x] `packages/conformance/src/comparator.ts` exists
- [x] `packages/conformance/src/runner.ts` exists
- [x] `packages/conformance/src/reporter.ts` exists
- [x] `packages/conformance/src/fixture-store.ts` exists
- [x] `packages/conformance/src/cli.ts` exists
- [x] `packages/conformance/dist/cli.js` exists
- [x] Commit `0993023` exists
- [x] 11 tests pass
- [x] Build succeeds

## Self-Check: PASSED

---
*Phase: 03-webhook-system-conformance-framework*
*Completed: 2026-02-27*
