---
phase: 26-slack-chat-scoping-scope-enforcement
plan: 02
subsystem: api
tags: [slack, scope-enforcement, ownership, chat, oauth, tdd]

# Dependency graph
requires:
  - phase: 26-slack-chat-scoping-scope-enforcement
    plan: 01
    provides: "Failing RED test scaffold for SLCK-15/18/19 in slack-scope-enforcement.test.ts"
  - phase: 26-slack-chat-scoping-scope-enforcement
    provides: "method-scopes.ts with METHOD_SCOPES catalog and allScopesString()"
provides:
  - "checkScope(method, tokenScope) exported from method-scopes.ts — null or ScopeCheckResult"
  - "checkAuthRateError returns {token, tokenRecord} (not string), enabling ownership + scope enforcement"
  - "X-OAuth-Scopes / X-Accepted-OAuth-Scopes headers pre-set on all successful auth paths in chat.ts"
  - "chat.update enforces channel_id and user_id ownership (cant_update_message)"
  - "chat.delete enforces channel_id and user_id ownership (cant_delete_message)"
  - "oauth.v2.access rejects missing client_id with invalid_arguments"
affects:
  - "26-03 (scope enforcement for remaining 9 plugins — same checkScope pattern)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "checkAuthRateError as centralized auth+scope+header preamble: returns {token, tokenRecord} or null"
    - "Scope enforcement before rate-limit/error-sim: scope errors take priority over simulated errors"
    - "X-OAuth-Scopes and X-Accepted-OAuth-Scopes headers pre-set in checkAuthRateError so all downstream branches automatically carry them"
    - "Ownership enforcement: channel_id check before user_id check (cheaper guard first)"
    - "WebClient try/catch pattern for asserting ok:false error codes in tests (WebClient throws, does not return ok:false)"

key-files:
  created: []
  modified:
    - twins/slack/src/services/method-scopes.ts
    - twins/slack/src/plugins/web-api/chat.ts
    - twins/slack/src/plugins/oauth.ts
    - tests/sdk-verification/sdk/slack-scope-enforcement.test.ts

key-decisions:
  - "checkAuthRateError return type widened from string to {token, tokenRecord} — enables ownership checks in handlers without a second getToken() call"
  - "Scope enforcement placed BEFORE rate-limit and error-sim checks in checkAuthRateError — scope errors should not be masked by simulated errors"
  - "chat.postMessage refactored from inline auth to checkAuthRateError — required for SLCK-19 scope headers to be set on postMessage responses"
  - "Rule 1 auto-fix: SLCK-15 tests updated from result.ok===false pattern to try/catch — WebClient throws WebAPIPlatformError on ok:false, so tests must catch and inspect error.data.error"
  - "SLCK-18d and 18e (conversations.list, users.list) remain RED — plan 03 will add checkScope to those plugins"

patterns-established:
  - "checkScope(method, tokenScope) for all future plugin scope enforcement in Plan 03"
  - "try/catch with error.data?.error for WebClient ownership-violation assertions"

requirements-completed: [SLCK-15, SLCK-18, SLCK-19]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 26 Plan 02: Chat Scoping & Scope Enforcement Summary

**checkScope() helper + ownership-enforcing chat.update/delete + scope headers in checkAuthRateError + oauth.v2.access client_id validation; SLCK-15 (5/5), SLCK-18 (3/5), SLCK-19 (2/2) GREEN**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T04:50:12Z
- **Completed:** 2026-03-13T04:55:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `checkScope(method, tokenScope)` to method-scopes.ts with `ScopeCheckResult` interface
- Refactored `checkAuthRateError` to return `{token, tokenRecord}` and enforce scope + set X-OAuth-Scopes/X-Accepted-OAuth-Scopes headers
- `chat.update` and `chat.delete` now enforce channel_id and user_id ownership (SLCK-15)
- `oauth.v2.access` rejects missing `client_id` with `invalid_arguments` (SLCK-18b)
- All 5 SLCK-15 tests GREEN, SLCK-18a/b/c GREEN, SLCK-19a/b GREEN — 10 of 12 plan-02 targets passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add checkScope() to method-scopes.ts** - `7b6e1d1` (feat)
2. **Task 2: Augment chat.ts + oauth.ts + test fix** - `7056cd9` (feat)

**Plan metadata:** _(to be recorded in final commit)_

## Files Created/Modified

- `twins/slack/src/services/method-scopes.ts` - Added `ScopeCheckResult` interface and `checkScope()` export
- `twins/slack/src/plugins/web-api/chat.ts` - checkAuthRateError return type + scope enforcement + ownership checks for chat.update/delete; all call sites updated; chat.postMessage refactored to use checkAuthRateError
- `twins/slack/src/plugins/oauth.ts` - client_id presence validation before code check
- `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` - SLCK-15a-d tests fixed to use try/catch pattern (Rule 1 bug fix)

## Decisions Made

- `checkAuthRateError` return type changed from `string` to `{ token: string; tokenRecord: any } | null` so handlers can access `tokenRecord.user_id` for ownership checks without a redundant `getToken()` call
- Scope enforcement placed BEFORE rate-limit and error-sim checks: a token without the required scope should get `missing_scope` even if a rate limit or error simulation is configured for that method
- `chat.postMessage` was inline-auth only; refactored to use `checkAuthRateError` so SLCK-19 scope headers are set on its successful responses
- SLCK-18d/18e (conversations.list, users.list) remain RED — those plugins don't use `checkAuthRateError` and will receive `checkScope` calls in plan 03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SLCK-15 tests used `result.ok === false` pattern incompatible with WebClient**
- **Found during:** Task 2 (test verification)
- **Issue:** Tests 15a-15d called `ownerClient.chat.update(...)` and expected `result.ok === false`, but `WebClient` throws `WebAPIPlatformError` on `ok: false` responses instead of returning the result object
- **Fix:** Updated 4 tests (15a, 15b, 15c, 15d) to use `try/catch` and assert `thrownError.data?.error === 'cant_*_message'`
- **Files modified:** `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts`
- **Verification:** All 5 SLCK-15 tests GREEN after fix
- **Committed in:** `7056cd9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test pattern)
**Impact on plan:** Fix was essential for SLCK-15 tests to reach GREEN. No scope creep — same assertion semantics, just the correct WebClient error access pattern.

## Issues Encountered

None.

## Self-Check

Files exist:
- twins/slack/src/services/method-scopes.ts: FOUND
- twins/slack/src/plugins/web-api/chat.ts: FOUND
- twins/slack/src/plugins/oauth.ts: FOUND
- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts: FOUND

Commits exist:
- 7b6e1d1: FOUND
- 7056cd9: FOUND

## Next Phase Readiness

- Plan 02 complete: SLCK-15 GREEN (5/5), SLCK-18 partially GREEN (3/5 — 18d/18e need plan 03), SLCK-19 GREEN (2/2)
- Plan 03 will call `checkScope()` in all remaining 9 plugins (conversations, users, channels, etc.) to make SLCK-18d/18e GREEN
- No blockers

---
*Phase: 26-slack-chat-scoping-scope-enforcement*
*Completed: 2026-03-13*
