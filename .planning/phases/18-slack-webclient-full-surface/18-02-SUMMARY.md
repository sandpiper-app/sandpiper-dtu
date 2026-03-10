---
phase: 18-slack-webclient-full-surface
plan: "02"
subsystem: api
tags: [slack, web-api, conversations, users, twin, tdd]

requires:
  - phase: 18-01
    provides: "chat.ts and files.ts expanded; rate-limiter improvements; slack-webclient-base test suite"

provides:
  - "conversations.ts expanded from 3 to 28 methods covering full Tier 1 surface"
  - "users.ts expanded from 2 to 12 methods covering full Tier 1 surface"
  - "slack-conversations.test.ts: 24 tests covering all 28 conversation methods"
  - "slack-users.test.ts: 10 tests covering all 12 users methods"

affects: [18-03, coverage-ledger, SLCK-08]

tech-stack:
  added: []
  patterns:
    - "checkAuth() helper extracted inline to avoid repeating 4-line auth/rate/error-sim preamble across all handlers"
    - "Slack Connect stubs registered via loop over string array, all returning { ok: true } after auth check"
    - "requestSharedInvite is a sub-namespace (not flat method) in SDK; routes named requestSharedInvite.{approve,deny,list}"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-conversations.test.ts
    - tests/sdk-verification/sdk/slack-users.test.ts
  modified:
    - twins/slack/src/plugins/web-api/conversations.ts
    - twins/slack/src/plugins/web-api/users.ts

key-decisions:
  - "conversations.requestSharedInvite is a nested SDK namespace ({approve,deny,list} sub-methods), not a flat callable — routes registered as conversations.requestSharedInvite.{approve,deny,list} to match SDK dispatch"
  - "U_BOT_TWIN seeded without email field — lookupByEmail test covers the not-found error path (SDK throws on ok:false, test uses try/catch); no hardcoded email needed"
  - "checkAuth() helper extracted as local async function inside each plugin to share auth+rate+error-sim preamble without introducing a shared module"

patterns-established:
  - "Stub-shaped handlers: loop over method name array, register POST route, run checkAuth(), return { ok: true }"
  - "READ endpoints registered as both GET and POST via shared async handler function"
  - "WRITE endpoints POST-only; auth via checkAuth() helper pattern"

requirements-completed:
  - SLCK-08

duration: 21min
completed: "2026-03-09"
---

# Phase 18 Plan 02: Conversations + Users Full Tier 1 Surface Summary

**conversations.ts expanded from 3 to 28 methods + users.ts from 2 to 12 methods via TDD; 34 new tests all green**

## Performance

- **Duration:** 21 min
- **Started:** 2026-03-09T23:46:10Z
- **Completed:** 2026-03-09T23:07:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- conversations.ts now covers all 28 Tier 1 methods: 3 existing (list/info/history) + 15 state-mutating methods + 10 Slack Connect stub-shapes
- users.ts now covers all 12 Tier 1 methods: 2 existing (list/info) + 5 read methods + 5 write methods
- 34 new tests written (24 conversations + 10 users) with all 131 suite tests passing
- checkAuth() helper extracted in both plugins to eliminate repeated 4-line auth preamble

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand conversations.ts to 28 methods** - `0f8f904` (feat)
2. **Task 2: Expand users.ts to 12 methods + write slack-users test file** - `d0782fb` (feat)

## Files Created/Modified

- `twins/slack/src/plugins/web-api/conversations.ts` - Expanded from 3 to 28 method handlers (3 existing + 25 new); checkAuth() helper added
- `twins/slack/src/plugins/web-api/users.ts` - Expanded from 2 to 12 method handlers (2 existing + 10 new); checkAuth() helper added
- `tests/sdk-verification/sdk/slack-conversations.test.ts` - 24 tests covering all conversation methods including Slack Connect stubs
- `tests/sdk-verification/sdk/slack-users.test.ts` - 10 tests covering all user methods

## Decisions Made

- `conversations.requestSharedInvite` is a nested namespace in the Slack SDK (`{approve, deny, list}` sub-methods), not a flat callable. Routes registered as `conversations.requestSharedInvite.{approve,deny,list}` to match SDK dispatch paths correctly.
- `U_BOT_TWIN` is seeded without an email address in `seedDefaults()`. The `lookupByEmail` test uses `try/catch` to verify the `users_not_found` error response (Slack SDK throws on `ok: false`). No hardcoded email assumed.
- `checkAuth()` extracted as local async function inside each plugin instead of a shared module — keeps plugin files self-contained and avoids a new shared module dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] conversations.requestSharedInvite test used wrong SDK call shape**
- **Found during:** Task 1 (conversations test + implementation)
- **Issue:** Test called `(client.conversations as any).requestSharedInvite({})` — but SDK exposes `requestSharedInvite` as a sub-namespace (`requestSharedInvite.approve`, `.deny`, `.list`), not a flat callable
- **Fix:** Test updated to use `client.conversations.requestSharedInvite.list()`; conversations.ts routes updated from one `requestSharedInvite` route to three (`requestSharedInvite.approve`, `requestSharedInvite.deny`, `requestSharedInvite.list`)
- **Files modified:** tests/sdk-verification/sdk/slack-conversations.test.ts, twins/slack/src/plugins/web-api/conversations.ts
- **Verification:** All 24 conversations tests pass
- **Committed in:** `0f8f904` (part of Task 1 commit)

**2. [Rule 1 - Bug] users.lookupByEmail test incorrectly expected ok:true return**
- **Found during:** Task 2 (users test run)
- **Issue:** Test expected `ok: false` return from `lookupByEmail` when user not found, but Slack SDK throws instead of returning error responses; test also assumed bot user had an email (it doesn't)
- **Fix:** Test changed to `try/catch` pattern with `expect(err.data?.error).toMatch(/users_not_found/)`
- **Files modified:** tests/sdk-verification/sdk/slack-users.test.ts
- **Verification:** All 10 users tests pass
- **Committed in:** `d0782fb` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — Bug in test code, not implementation)
**Impact on plan:** Both auto-fixes essential for test correctness. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `twins/slack/src/plugins/ui.ts` (line 303: `string | null` not assignable to `string | undefined`) — pre-dates this plan, confirmed not caused by these changes. Out of scope per deviation rules.

## Next Phase Readiness

- conversations.ts and users.ts at full Tier 1 coverage, ready for coverage ledger update
- All 131 SDK verification tests passing — no regressions
- Phase 18 Plan 03 (OAuth/admin and remaining methods) can proceed independently

---
*Phase: 18-slack-webclient-full-surface*
*Completed: 2026-03-09*

## Self-Check: PASSED

All files exist and all commits are present:
- tests/sdk-verification/sdk/slack-conversations.test.ts: FOUND
- tests/sdk-verification/sdk/slack-users.test.ts: FOUND
- twins/slack/src/plugins/web-api/conversations.ts: FOUND
- twins/slack/src/plugins/web-api/users.ts: FOUND
- .planning/phases/18-slack-webclient-full-surface/18-02-SUMMARY.md: FOUND
- Commit 0f8f904 (Task 1): FOUND
- Commit d0782fb (Task 2): FOUND
