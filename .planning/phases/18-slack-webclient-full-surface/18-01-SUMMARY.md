---
phase: 18-slack-webclient-full-surface
plan: 01
subsystem: api
tags: [slack, webclient, file-upload, chat, rate-limiter, vitest]

# Dependency graph
requires:
  - phase: 14-verification-harness-foundation-legacy-gap-merge
    provides: Slack twin foundation, auth.test gateway, sdk-verification harness
  - phase: 05-slack-twin-web-api
    provides: chat.ts (postMessage, update), rate-limiter.ts base tiers, SlackStateManager

provides:
  - filesUploadV2 3-endpoint chain (getUploadURLExternal, PUT _upload/:id, completeUploadExternal)
  - 11 new chat methods (delete, postEphemeral, getPermalink, meMessage, scheduleMessage, scheduledMessages.list, deleteScheduledMessage, unfurl, startStream, appendStream, stopStream)
  - 48 new rate tier entries covering chat/conversations/users/reactions/pins/views families
  - seedSlackChannel() seeder for sdk-verification tests
  - SLCK-07 test suite (5 tests: apiCall, paginate, filesUploadV2, chatStream, rate-limit)
  - SLCK-08 chat test suite (12 tests: all 13 chat methods covered)

affects:
  - 18-02 through 18-05 (use chat methods, file upload chain, seeder helpers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - checkAuthRateError helper pattern for deduplicating auth/rate/error-sim preamble in chat plugin
    - files.ts SLACK_API_URL per-request read for absolute upload_url construction
    - GET+POST dual registration for read-style chat methods (getPermalink, scheduledMessages.list)

key-files:
  created:
    - twins/slack/src/plugins/web-api/files.ts
    - tests/sdk-verification/sdk/slack-webclient-base.test.ts
    - tests/sdk-verification/sdk/slack-chat.test.ts
  modified:
    - twins/slack/src/services/rate-limiter.ts
    - twins/slack/src/plugins/web-api/chat.ts
    - twins/slack/src/plugins/web-api/auth.ts
    - twins/slack/src/index.ts
    - tests/sdk-verification/setup/seeders.ts

key-decisions:
  - "checkAuthRateError() extracts auth/rate/error-sim preamble into a shared helper — reduces duplication across 11 new handlers while keeping the pattern consistent with existing postMessage/update"
  - "upload_url in getUploadURLExternal reads SLACK_API_URL per-request — set by globalSetup AFTER twin boots, so module-level read would capture undefined"
  - "admin/errors/clear called without Content-Type header — Fastify rejects Content-Type: application/json with empty body; no-header POST avoids the 400 rejection"
  - "Retry-After: 1 header added when error simulation returns 429 — SDK WebClient throws 'Retry header did not contain a valid timeout' when 429 has no Retry-After header"
  - "Rate-limit test uses raw fetch throughout (configure, check, clear, verify) — avoids SDK retry state contamination between phases of the test"

patterns-established:
  - "checkAuthRateError helper: shared async function for auth/rate/error-sim preamble, returns token or null after replying"
  - "Dual GET+POST registration for Slack read-style methods: getPermalink and scheduledMessages.list both support GET (query params) and POST (body params)"

requirements-completed:
  - SLCK-07
  - SLCK-08

# Metrics
duration: 22min
completed: 2026-03-09
---

# Phase 18 Plan 01: Slack WebClient Base + Chat Family Summary

**filesUploadV2 3-endpoint chain, 11 new chat methods (startStream/appendStream/stopStream for ChatStreamer), 48 rate tier entries, and SLCK-07/08 test suites (17 tests green)**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-09T23:45:59Z
- **Completed:** 2026-03-09T23:08:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- filesUploadV2 3-endpoint chain: getUploadURLExternal → PUT _upload/:id → completeUploadExternal with absolute upload_url using per-request SLACK_API_URL
- 11 new chat handlers expanding chat.ts from 2 to 13 methods, including startStream/appendStream/stopStream required by ChatStreamer
- 48 new DEFAULT_RATE_TIERS entries covering auth, chat, conversations, users, reactions, pins, and views families for Phase 18
- SLCK-07 base behavior suite (5 tests green: apiCall, paginate, filesUploadV2, chatStream, error-sim)
- SLCK-08 chat suite (12 tests green covering all 13 chat methods)
- seedSlackChannel() seeder added to shared helpers

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand rate-limiter.ts and create files.ts plugin** - `4a13da2` (feat)
2. **Task 2: RED — failing test files for SLCK-07 and SLCK-08** - `a9cd148` (test)
3. **Task 2: GREEN — expand chat.ts + fix auth.ts 429 header** - `c65ce2e` (feat)

_Note: Task 2 used TDD with separate RED/GREEN commits_

## Files Created/Modified
- `twins/slack/src/services/rate-limiter.ts` - 48 new rate tier entries for Phase 18 method families
- `twins/slack/src/plugins/web-api/files.ts` - NEW: filesUploadV2 3-endpoint chain with absolute upload_url
- `twins/slack/src/plugins/web-api/chat.ts` - Expanded from 2 to 13 methods with checkAuthRateError helper
- `twins/slack/src/plugins/web-api/auth.ts` - Added Retry-After: 1 header for 429 error simulation path
- `twins/slack/src/index.ts` - Registers filesPlugin after usersPlugin
- `tests/sdk-verification/sdk/slack-webclient-base.test.ts` - NEW: 5 SLCK-07 tests
- `tests/sdk-verification/sdk/slack-chat.test.ts` - NEW: 12 SLCK-08 chat method tests
- `tests/sdk-verification/setup/seeders.ts` - Added seedSlackChannel() using /admin/fixtures/load

## Decisions Made
- `checkAuthRateError()` extracts auth/rate/error-sim preamble into a shared helper — reduces duplication across 11 new handlers while keeping the pattern consistent with existing postMessage/update
- `upload_url` in `getUploadURLExternal` reads `SLACK_API_URL` per-request — set by globalSetup AFTER twin boots, so module-level read would capture undefined
- `admin/errors/clear` called without Content-Type header — Fastify rejects `Content-Type: application/json` with empty body; no-header POST avoids the 400 rejection
- `Retry-After: 1` header added when error simulation returns 429 — SDK WebClient throws "Retry header did not contain a valid timeout" when 429 has no Retry-After header
- Rate-limit test uses raw fetch throughout — avoids SDK retry state contamination between phases of the test

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] auth.ts error simulation returns 429 without Retry-After header**
- **Found during:** Task 2 (GREEN phase, ratelimited test)
- **Issue:** Error sim path called `reply.status(429).send(errorBody)` without `Retry-After` header. SDK WebClient throws "Retry header did not contain a valid timeout" when it receives a 429 without this header.
- **Fix:** Error sim path now checks `if (statusCode === 429) { reply.status(statusCode).header('Retry-After', '1').send(errorBody) }`
- **Files modified:** `twins/slack/src/plugins/web-api/auth.ts`
- **Verification:** ratelimited test passes; SDK receives proper 429 with Retry-After header
- **Committed in:** c65ce2e

**2. [Rule 2 - Missing Critical] seedSlackChannel() missing from seeders.ts**
- **Found during:** Task 2 (test file review before RED commit)
- **Issue:** Plan references `seedSlackChannel()` in test code but it wasn't in seeders.ts
- **Fix:** Added `seedSlackChannel(name)` using `/admin/fixtures/load` endpoint, returns channel ID
- **Files modified:** `tests/sdk-verification/setup/seeders.ts`
- **Verification:** paginate, filesUploadV2, and chatStream tests all pass using seeded channels
- **Committed in:** a9cd148

**3. [Rule 1 - Bug] Rate-limit test used undefined client variable after clearing error config**
- **Found during:** Task 2 (ratelimited test failure analysis)
- **Issue:** Plan's test template referenced `client.auth.test()` after clearing but `client` was not in scope; also using SDK client after 429 triggers SDK retry state issues
- **Fix:** Replaced SDK call with raw fetch using explicit bearer token; removed Content-Type header from clear request (Fastify rejects application/json with empty body)
- **Files modified:** `tests/sdk-verification/sdk/slack-webclient-base.test.ts`
- **Verification:** ratelimited test passes cleanly
- **Committed in:** c65ce2e

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 bug)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Fastify rejects POST with `Content-Type: application/json` and empty body (400 Bad Request) — admin/errors/clear must be called without Content-Type header when no body is sent
- SDK WebClient throws on 429 without Retry-After header — error sim must include the header for SDK compatibility

## Deferred Items
- Pre-existing `ui.ts` TypeScript error: `Type 'null' is not assignable to type 'string | undefined'` (line 303) — pre-dates Phase 18, out of scope

## Next Phase Readiness
- files.ts plugin and all 13 chat methods ready for Phase 18 Plan 02 (users/reactions/views)
- seedSlackChannel() available in seeders.ts for subsequent test suites
- Rate tier entries pre-populated for all families tested in Plans 02-05

## Self-Check: PASSED

- FOUND: `twins/slack/src/plugins/web-api/files.ts`
- FOUND: `tests/sdk-verification/sdk/slack-webclient-base.test.ts`
- FOUND: `tests/sdk-verification/sdk/slack-chat.test.ts`
- FOUND: `.planning/phases/18-slack-webclient-full-surface/18-01-SUMMARY.md`
- FOUND: commit `4a13da2` (feat: expand rate-limiter and add filesUploadV2 3-endpoint plugin)
- FOUND: commit `a9cd148` (test: add failing tests for SLCK-07 base behaviors and SLCK-08 chat family)
- FOUND: commit `c65ce2e` (feat: expand chat.ts with 11 new methods + fix auth.ts 429 Retry-After header)

---
*Phase: 18-slack-webclient-full-surface*
*Completed: 2026-03-09*
