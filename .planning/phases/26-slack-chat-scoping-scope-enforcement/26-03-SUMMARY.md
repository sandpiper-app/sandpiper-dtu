---
phase: 26-slack-chat-scoping-scope-enforcement
plan: 03
subsystem: api
tags: [slack, scope-enforcement, oauth-headers, web-api, tdd]

# Dependency graph
requires:
  - phase: 26-slack-chat-scoping-scope-enforcement
    plan: 02
    provides: "checkScope() helper, METHOD_SCOPES catalog, scope enforcement in chat.ts + oauth.ts; SLCK-18 (3/5) GREEN"
provides:
  - "Universal scope enforcement in all 9 remaining Slack web-api plugins via checkScope()"
  - "X-OAuth-Scopes and X-Accepted-OAuth-Scopes headers on all successful API calls across entire Slack twin surface"
  - "SLCK-18 (5/5) fully GREEN — conversations.list and users.list return missing_scope for narrow-scope tokens"
  - "SLCK-19 headers now set universally across all plugins, not just chat.ts"
affects:
  - "Phase 27 (conformance/coverage) — entire Slack twin surface is now scope-enforcing"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stub(method, extra?) factory pattern: method name as first argument enables per-route scope enforcement without duplicating auth logic"
    - "Inline auth scope enforcement: checkScope() + header injection after tokenRecord null check in each inline handler"
    - "Pre-existing failures in slack-state-tables.test.ts (4 tests) are out-of-scope — tests contain 'This FAILS because...' comments and were RED before this plan"

key-files:
  created: []
  modified:
    - twins/slack/src/plugins/web-api/conversations.ts
    - twins/slack/src/plugins/web-api/users.ts
    - twins/slack/src/plugins/web-api/pins.ts
    - twins/slack/src/plugins/web-api/reactions.ts
    - twins/slack/src/plugins/web-api/views.ts
    - twins/slack/src/plugins/web-api/stubs.ts
    - twins/slack/src/plugins/web-api/admin.ts
    - twins/slack/src/plugins/web-api/new-families.ts
    - twins/slack/src/plugins/web-api/files.ts
    - twins/slack/src/plugins/web-api/auth.ts

key-decisions:
  - "stub() factory in stubs.ts, admin.ts, new-families.ts updated to stub(method, extra?) — method name as first argument enables checkScope() inside the factory without needing 95+ inline call sites"
  - "conversations.ts and users.ts have both a shared checkAuth() AND inline auth blocks for list/info/history handlers — both paths needed scope enforcement added separately"
  - "pins.ts, reactions.ts, views.ts use synchronous authCheck() — checkScope() and header injection work synchronously before returning tokenRecord"
  - "auth.test has empty METHOD_SCOPES entry — checkScope returns null (no enforcement), but X-OAuth-Scopes and X-Accepted-OAuth-Scopes headers are still set (empty accepted)"
  - "files.getUploadURLExternal and files.completeUploadExternal both get inline scope enforcement; PUT _upload/:file_id intentionally has no auth"
  - "4 pre-existing failures in slack-state-tables.test.ts remain — they are pre-existing and documented with 'This FAILS because...' comments"

# Metrics
duration: 9min
completed: 2026-03-13
---

# Phase 26 Plan 03: Scope Enforcement for Remaining 9 Web-API Plugins Summary

**Universal checkScope() wiring across all Slack twin web-api plugins; SLCK-18 (5/5) and SLCK-19 headers now fully GREEN across the entire twin surface**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-13T04:58:26Z
- **Completed:** 2026-03-13T05:07:35Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added `import { checkScope, METHOD_SCOPES }` to all 10 plugin files
- Augmented shared `checkAuth()` in conversations.ts and users.ts with scope enforcement + headers
- Added inline scope enforcement to the 3 inline auth handlers in conversations.ts (list, info, history)
- Added inline scope enforcement to the 2 inline auth handlers in users.ts (list, info)
- Updated synchronous `authCheck()` helpers in pins.ts, reactions.ts, views.ts with checkScope + headers
- Updated `stub()` factory signatures in stubs.ts, admin.ts, new-families.ts to `stub(method, extra?)` — all call sites updated
- Added scope enforcement to apps.connections.open inline handler in stubs.ts
- Added inline scope enforcement to files.ts (getUploadURLExternal and completeUploadExternal)
- Added inline scope enforcement to auth.ts (auth.test — empty scope, headers still set)
- SLCK-18d (conversations.list) and SLCK-18e (users.list) now GREEN — was RED after Plan 02

## Test Results

- slack-scope-enforcement.test.ts: **12/12 GREEN** (SLCK-15 5/5, SLCK-18 5/5, SLCK-19 2/2)
- slack-conversations.test.ts: 24/24 GREEN
- slack-users.test.ts: 10/10 GREEN
- slack-reactions.test.ts: 4/4 GREEN
- slack-views.test.ts: 4/4 GREEN
- slack-pins.test.ts: 3/3 GREEN
- slack-method-coverage.test.ts: 16/16 GREEN (broad-scope token pre-grants all scopes)
- Full suite: 244/248 tests GREEN (4 pre-existing failures in slack-state-tables.test.ts)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire checkScope() into shared auth helpers (conversations, users, pins, reactions, views)** - `e8f2f6a` (feat)
2. **Task 2: Wire checkScope() into stubs, admin, new-families, files, auth plugins** - `9428972` (feat)

## Files Created/Modified

- `twins/slack/src/plugins/web-api/conversations.ts` - checkScope() in checkAuth() + 3 inline handlers (list/info/history)
- `twins/slack/src/plugins/web-api/users.ts` - checkScope() in checkAuth() + 2 inline handlers (list/info)
- `twins/slack/src/plugins/web-api/pins.ts` - checkScope() in synchronous authCheck()
- `twins/slack/src/plugins/web-api/reactions.ts` - checkScope() in synchronous authCheck()
- `twins/slack/src/plugins/web-api/views.ts` - checkScope() in synchronous authCheck()
- `twins/slack/src/plugins/web-api/stubs.ts` - stub(method, extra?) factory; all ~55 call sites updated; apps.connections.open inline handler updated
- `twins/slack/src/plugins/web-api/admin.ts` - stub(method, extra?) factory; all 97 call sites updated
- `twins/slack/src/plugins/web-api/new-families.ts` - stub(method, extra?) factory; all 34+ call sites updated
- `twins/slack/src/plugins/web-api/files.ts` - inline scope enforcement for getUploadURLExternal and completeUploadExternal
- `twins/slack/src/plugins/web-api/auth.ts` - inline scope enforcement for auth.test (no-op for scope, but sets headers)

## Decisions Made

- The `stub()` factory approach (passing method name as first arg) was the only viable strategy for stubs.ts/admin.ts/new-families.ts — adding scope enforcement inline to 97+ individual route handlers would be unmaintainable
- conversations.ts and users.ts share a checkAuth() that covers most handlers, but the high-traffic list/info/history handlers use inline auth for performance reasons — both code paths needed separate treatment
- The synchronous `authCheck()` in pins/reactions/views works fine with scope enforcement since `reply.header()` and `reply.status().send()` are synchronous operations in Fastify

## Deviations from Plan

None — plan executed exactly as written. The described factory patterns for stubs.ts/admin.ts matched the actual file structure. The inline auth blocks in conversations.ts and users.ts matched the described pitfall and were handled as specified.

## Issues Encountered

None. Pre-existing 4 failures in slack-state-tables.test.ts were present before this plan and have comments indicating they are known failures ("This FAILS because...").

## Self-Check

Files exist:
- twins/slack/src/plugins/web-api/conversations.ts: FOUND
- twins/slack/src/plugins/web-api/users.ts: FOUND
- twins/slack/src/plugins/web-api/pins.ts: FOUND
- twins/slack/src/plugins/web-api/reactions.ts: FOUND
- twins/slack/src/plugins/web-api/views.ts: FOUND
- twins/slack/src/plugins/web-api/stubs.ts: FOUND
- twins/slack/src/plugins/web-api/admin.ts: FOUND
- twins/slack/src/plugins/web-api/new-families.ts: FOUND
- twins/slack/src/plugins/web-api/files.ts: FOUND
- twins/slack/src/plugins/web-api/auth.ts: FOUND

Commits exist:
- e8f2f6a: FOUND
- 9428972: FOUND

## Self-Check: PASSED

---

## Next Phase Readiness

- Phase 26 complete: SLCK-15 (5/5), SLCK-18 (5/5), SLCK-19 (2/2) — all GREEN
- Scope enforcement is now universal across the entire Slack twin web-api surface
- Ready for Phase 27 (conformance/coverage) — depends on Phases 24 and 26 complete

---
*Phase: 26-slack-chat-scoping-scope-enforcement*
*Completed: 2026-03-13*
