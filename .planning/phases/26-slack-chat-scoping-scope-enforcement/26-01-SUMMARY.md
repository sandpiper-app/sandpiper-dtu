---
phase: 26-slack-chat-scoping-scope-enforcement
plan: 01
subsystem: testing
tags: [vitest, slack, scope-enforcement, tdd, wave-0]

# Dependency graph
requires:
  - phase: 25-slack-method-coverage-event-signing-state-tables
    provides: "seedSlackBotToken with allScopesString() scope, seedSlackChannel, method-scopes.ts catalog"
provides:
  - "Failing test scaffold for SLCK-15 (ownership enforcement), SLCK-18 (missing_scope), SLCK-19 (OAuth headers)"
  - "RED baseline pinning all Phase 26 behaviors before implementation begins"
affects:
  - "26-02 (chat scope enforcement implementation)"
  - "26-03 (broad scope enforcement)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: write failing tests before any implementation; Plans 02-03 point at this file as verify target"
    - "Raw fetch() for header inspection (WebClient does not expose response headers)"
    - "Attacker token pattern: seed via POST /admin/tokens with broad scope but different userId to isolate ownership check from scope check"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-scope-enforcement.test.ts
  modified: []

key-decisions:
  - "Attacker token seeded with BROAD_SCOPE ('chat:write,channels:read,channels:history,users:read') but userId U_ATTACKER to ensure SLCK-15 tests isolate the userId ownership check, not scope mismatch"
  - "allScopesString() not imported in test file (avoids coupling test to twin internals); hardcoded broad scope string used instead"
  - "SLCK-18 non-chat scope tests (18d/18e) seed chat:write-only token inline per test to avoid shared mutable state"
  - "All 10 enforcement tests fail RED as expected; 2 regression guards (15e, 18c) pass GREEN confirming correct owner behavior"

patterns-established:
  - "Wave 0 pattern reused from Phase 24: write failing tests RED, then implement in subsequent plans"
  - "POST /admin/tokens used for all token seeding (survives OAuth tightening from Phase 23)"

requirements-completed: [SLCK-15, SLCK-18, SLCK-19]

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 26 Plan 01: Scope Enforcement Test Scaffold Summary

**330-line failing test scaffold covering SLCK-15 ownership violations, SLCK-18 missing_scope enforcement, and SLCK-19 OAuth response headers — all 10 enforcement tests RED before implementation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T04:45:40Z
- **Completed:** 2026-03-13T04:47:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `slack-scope-enforcement.test.ts` with 12 tests (10 failing RED, 2 regression guards GREEN)
- SLCK-15: 4 ownership violation tests for chat.update and chat.delete (wrong channel + wrong userId) plus 1 regression guard
- SLCK-18: missing_scope enforcement for narrow-scope tokens (channels:read and chat:write-only), invalid_arguments for oauth.v2.access without client_id, plus broad-scope regression guard
- SLCK-19: raw fetch header assertions for x-oauth-scopes and x-accepted-oauth-scopes on successful chat.postMessage

## Task Commits

Each task was committed atomically:

1. **Task 1: Write slack-scope-enforcement.test.ts in RED state** - `5fbecf8` (test)

**Plan metadata:** _(to be recorded in final commit)_

_Note: TDD RED phase only — GREEN will be committed in Plans 02 and 03_

## Files Created/Modified

- `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` - Failing test scaffold for all three Phase 26 requirements; 12 tests covering ownership enforcement, scope validation, and OAuth headers

## Decisions Made

- Attacker token seeded with broad scope string but different userId (`U_ATTACKER`) to isolate the userId ownership check from scope mismatch — this ensures SLCK-15 tests fail because of missing ownership enforcement, not missing_scope
- `allScopesString()` not imported in the test file to avoid coupling test infrastructure to twin internals; a hardcoded `BROAD_SCOPE` constant used instead
- SLCK-18 non-chat scope tests (18d, 18e) each seed the `xoxb-chat-only` token inline because `beforeEach` calls `resetSlack()` which clears all seeded tokens between tests
- Raw `fetch()` used for all SLCK-18 and SLCK-19 tests because `WebClient` throws on `ok: false` responses (masking error details) and does not expose response headers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

Files exist:
- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts: FOUND

Commits exist:
- 5fbecf8: FOUND

## Next Phase Readiness

- RED baseline established; Plans 02 and 03 have concrete verify commands pointing at this file
- Plan 02 will implement chat.update/delete ownership enforcement (SLCK-15) and missing_scope enforcement (SLCK-18)
- Plan 03 will implement scope enforcement across all non-chat methods and OAuth response headers (SLCK-19)
- No blockers

---
*Phase: 26-slack-chat-scoping-scope-enforcement*
*Completed: 2026-03-13*
