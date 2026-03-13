---
phase: 30-slack-transport-state-fixes
plan: 02
subsystem: api
tags: [slack, sqlite, vitest, better-sqlite3, reactions, views, pins]

# Dependency graph
requires:
  - phase: 25-slack-state-tables
    provides: "SlackStateManager with slack_reactions UNIQUE constraint and views/pins tables"
  - phase: 26-slack-scope-enforcement
    provides: "authCheck() returning {token, tokenRecord} pattern in reactions.ts and views.ts"
provides:
  - "reactions.list returns real stateful grouped items via listReactionsByUser(userId)"
  - "views.update returns {ok:false, error:'view_not_found'} for unknown view_id"
  - "views.open/push/update normalize JSON-string view param (form-encoded POST bodies)"
  - "SLCK-17 test suite fully GREEN: views, pins, reactions groups all passing"
affects: [phase-31, conformance-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "try/catch with e.data?.error for WebClient error assertions (SDK throws on ok:false)"
    - "Map-based grouping of SQLite rows into Slack API items response shape"
    - "Form-encoded guard: typeof rawView === 'string' ? JSON.parse(rawView) : rawView"

key-files:
  created: []
  modified:
    - twins/slack/src/state/slack-state-manager.ts
    - twins/slack/src/plugins/web-api/views.ts
    - twins/slack/src/plugins/web-api/reactions.ts
    - tests/sdk-verification/sdk/slack-state-tables.test.ts
    - tests/sdk-verification/sdk/slack-views.test.ts

key-decisions:
  - "views.update unknown view_id: return ok:false error:'view_not_found' (not ok:true fallback) — breaking change requires test fix in slack-views.test.ts too"
  - "reactions.list groups raw DB rows by (channel_id, message_ts) key using Map; each item holds reactions array with count and users"
  - "Test assertion pattern: WebClient throws on ok:false — tests must use try/catch with e.data?.error (same pattern as SLCK-15 in Phase 26)"
  - "Task 1 product changes (listReactionsByUser, views.update fix, form-parse guard) were pre-committed in feat(29-01) by the prior agent — Task 2 is the only new commit"

patterns-established:
  - "SLCK-17 assertion pattern: try { await client.X(); expect.fail(); } catch(e) { expect(e.data?.error).toBe('error_code'); }"

requirements-completed: [SLCK-17]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 30 Plan 02: Slack SLCK-17 State Table Correctness Summary

**views.update returns view_not_found for unknown IDs, reactions.list queries real state via listReactionsByUser, and all three SLCK-17 duplicate/error tests fixed to use try/catch — 248/248 tests GREEN**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T20:20:51Z
- **Completed:** 2026-03-13T20:25:04Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `reactions.list` now returns real stateful grouped items from `listReactionsByUser(userId)` instead of hardcoded empty stub
- `views.update` correctly returns `{ok:false, error:'view_not_found'}` when `view_id` is provided but not found in the store
- Three SLCK-17 test assertions fixed: `pins.add` duplicate, `reactions.add` duplicate, and `views.update` unknown-id tests all converted to try/catch pattern
- pnpm test:sdk: 248 tests / 31 files, 0 failures, exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add listReactionsByUser, fix views.update view_not_found, add form-encoded view parse** — pre-committed in `e5eb8eb` (`feat(29-01)`) by prior agent; no separate commit needed
2. **Task 2: Wire reactions.list to real state and fix test assertion bugs** - `b8a0253` (feat)

**Plan metadata:** committed with final docs commit

## Files Created/Modified
- `twins/slack/src/state/slack-state-manager.ts` - Added `listReactionsByUser(userId)` method and prepared statement (was pre-committed in 29-01)
- `twins/slack/src/plugins/web-api/views.ts` - view_not_found for unknown view_id; JSON-parse guard for form-encoded view (was pre-committed in 29-01)
- `twins/slack/src/plugins/web-api/reactions.ts` - Replace empty stub with real `listReactionsByUser` query + Map-based grouping
- `tests/sdk-verification/sdk/slack-state-tables.test.ts` - Fix pins.add, reactions.add, views.update duplicate/error tests to use try/catch
- `tests/sdk-verification/sdk/slack-views.test.ts` - Fix views.update SLCK-08 test to use a real view_id from views.open (no longer can use V_FAKE)

## Decisions Made
- views.update with unknown view_id now returns `ok:false` which causes the SDK to throw — the SLCK-08 test in `slack-views.test.ts` that used `view_id: 'V_FAKE'` also needed to be fixed (opened a real view first)
- reactions.list groups rows using a `Map<string, any>` keyed on `channel_id:message_ts` so each unique message appears once with its reactions array
- Task 1 product changes were already present in HEAD (committed by the feat(29-01) agent during Phase 29 execution) — only Task 2 required a new commit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] slack-views.test.ts SLCK-08 views.update test used V_FAKE**
- **Found during:** Task 1 verification (after applying views.update view_not_found fix)
- **Issue:** `slack-views.test.ts > views.update returns ok:true and a view object` called `views.update({ view_id: 'V_FAKE', ... })` which now throws `view_not_found` — the test expected `ok:true` from the old fallback
- **Fix:** Updated test to first call `views.open` to get a real view_id, then call `views.update` with that real view_id
- **Files modified:** `tests/sdk-verification/sdk/slack-views.test.ts`
- **Verification:** slack-views.test.ts 4/4 GREEN after fix
- **Committed in:** `b8a0253` (Task 2 commit — bundled with test assertion fixes)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in pre-existing test caused by product fix)
**Impact on plan:** Fix necessary for correctness — the test was testing the old fallback behavior, not the intended behavior. No scope creep.

## Issues Encountered
- Task 1 product changes (`listReactionsByUser`, `views.update view_not_found`, form-parse guard) were already committed in `feat(29-01)` by the prior plan executor (Phase 29 Plan 01 agent). The changes were verified as correct in HEAD, so no re-commit was needed for Task 1. Only Task 2 required a new commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SLCK-17 fully satisfied: all state table tests GREEN
- Phase 30 Plan 02 complete — Slack transport and state fix phase done
- Ready for next phase (conformance or additional Slack behavioral fidelity)

---
*Phase: 30-slack-transport-state-fixes*
*Completed: 2026-03-13*
