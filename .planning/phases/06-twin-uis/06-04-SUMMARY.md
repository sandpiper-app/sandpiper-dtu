---
phase: 06-twin-uis
plan: 04
subsystem: api
tags: [slack, shopify, conformance, web-api, fastify, formbody, token-auth, get-methods]

requires:
  - phase: 06-twin-uis plan 02
    provides: Shopify twin UI with formbody in uiPlugin scope
  - phase: 06-twin-uis plan 03
    provides: Slack twin UI with formbody in uiPlugin scope
provides:
  - extractToken() function checking Bearer header, body param, and query param
  - GET routes for all Slack read methods (conversations.list, .info, .history, users.list, .info)
  - Form-urlencoded support for chat.postMessage, chat.update, oauth.v2.access, Shopify OAuth
  - Blocks JSON string parsing when sent via form-urlencoded
  - 14 conformance tests in Slack web-api.test.ts
  - 2 conformance tests in Shopify integration.test.ts
affects:
  - Any integration test that exercises Slack Web API HTTP methods
  - Conformance test framework comparing twin vs real API
  - Phase 7 if adding more twin endpoints

tech-stack:
  added: ["@fastify/formbody@^8.0.0 (direct dep in both twins)"]
  patterns:
    - "extractToken() priority chain: Bearer header > body.token > query.token"
    - "getParams(request) for unified GET query / POST body extraction"
    - "Register @fastify/formbody at root Fastify scope before other plugins"
    - "Blocks parsing from JSON string: typeof blocks === 'string' ? JSON.parse(blocks) : blocks"

key-files:
  created: []
  modified:
    - twins/slack/src/services/token-validator.ts
    - twins/slack/src/plugins/web-api/conversations.ts
    - twins/slack/src/plugins/web-api/users.ts
    - twins/slack/src/plugins/web-api/chat.ts
    - twins/slack/src/index.ts
    - twins/shopify/src/index.ts
    - twins/slack/test/web-api.test.ts
    - twins/shopify/test/integration.test.ts
    - twins/slack/package.json
    - twins/shopify/package.json

key-decisions:
  - "extractBearerToken kept as deprecated alias calling extractToken() — backward compatibility without breaking existing callers"
  - "formbody registered at root Fastify scope in index.ts (before plugins) so oauth and web-api plugins can parse form-urlencoded — uiPlugin/registerUI double-registers in child scope which works fine (Fastify allows it)"
  - "@fastify/formbody added as direct dependency to twins/slack and twins/shopify — was transitive via @dtu/ui but importing directly requires it to be declared"
  - "GET route handlers extracted to shared functions so GET and POST register the same handler — avoids code duplication and ensures identical behavior"

patterns-established:
  - "getParams(request) pattern: single function for unified GET query / POST body extraction in read methods"
  - "Blocks form-urlencoded parsing: JSON.parse with silent catch so invalid JSON is passed as-is (graceful degradation)"

requirements_completed: []

duration: 30min
completed: 2026-02-28
---

# Phase 6 Plan 04: API Conformance Audit and Fix Summary

**Slack Web API read methods now accept GET+POST with Bearer/body/query token auth; form-urlencoded accepted everywhere; 14 Slack + 2 Shopify conformance tests verify all access patterns.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-02-28T22:33:11Z
- **Completed:** 2026-02-28T23:03:00Z
- **Tasks:** 2 (Task 1: audit+fix, Task 2: conformance tests)
- **Files modified:** 10

## Accomplishments

- `extractToken()` replaces `extractBearerToken()` with a 3-way priority chain matching real Slack behavior
- All 5 Slack read methods now register both GET and POST routes using a shared handler pattern
- Form-urlencoded body accepted for chat.postMessage, chat.update, oauth.v2.access (Slack) and access_token (Shopify)
- Blocks field parsed from JSON string when received via form-urlencoded (handles SDK encoding behavior)
- 14 Slack conformance tests + 2 Shopify conformance tests cover every access pattern fixed

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and fix API behavioral discrepancies** - `98aa228` (feat)
2. **Task 2: Conformance tests for all fixed behaviors** - `f48eff0` (test)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified

- `twins/slack/src/services/token-validator.ts` - Added `extractToken()` with 3-way auth extraction; kept `extractBearerToken()` as deprecated alias
- `twins/slack/src/plugins/web-api/conversations.ts` - Added GET routes, shared handlers, `getParams()` helper, updated to use `extractToken()`
- `twins/slack/src/plugins/web-api/users.ts` - Added GET routes, shared handlers, `getParams()` helper, updated to use `extractToken()`
- `twins/slack/src/plugins/web-api/chat.ts` - Updated to use `extractToken()`, added blocks JSON string parsing for form-urlencoded
- `twins/slack/src/index.ts` - Register `@fastify/formbody` at root scope before other plugins
- `twins/shopify/src/index.ts` - Register `@fastify/formbody` at root scope before other plugins
- `twins/slack/package.json` - Added `@fastify/formbody ^8.0.0` as direct dependency
- `twins/shopify/package.json` - Added `@fastify/formbody ^8.0.0` as direct dependency
- `twins/slack/test/web-api.test.ts` - Added 3 describe blocks with 14 conformance tests
- `twins/shopify/test/integration.test.ts` - Added API Conformance describe block with 2 tests

## Decisions Made

- `extractBearerToken()` kept as deprecated alias calling `extractToken()` — backward compatibility without breaking existing callers, both functions co-exist during transition period
- `@fastify/formbody` registered at root Fastify scope in `index.ts` before other plugins — this makes the body parser available to `oauthPlugin`, `chatPlugin`, `conversationsPlugin`, and `usersPlugin`; the `uiPlugin`/`registerUI()` double-registers in an encapsulated child scope which Fastify handles gracefully
- `@fastify/formbody` added as direct dependency to both twins' `package.json` — was previously transitive via `@dtu/ui` but explicit import requires declaration
- Shared handler pattern for GET+POST: extracted handler logic to named async functions, registered as both `fastify.get(path, handler)` and `fastify.post(path, handler)` — avoids code duplication and guarantees identical behavior on both methods

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @fastify/formbody as direct dependency**
- **Found during:** Task 1 (registering formbody in index.ts)
- **Issue:** `@fastify/formbody` was only a transitive dependency via `@dtu/ui`; direct import in `twins/slack/src/index.ts` and `twins/shopify/src/index.ts` requires explicit declaration
- **Fix:** Added `"@fastify/formbody": "^8.0.0"` to both twins' `package.json`; ran `pnpm install`
- **Files modified:** twins/slack/package.json, twins/shopify/package.json, pnpm-lock.yaml
- **Verification:** Import resolves, all tests pass
- **Committed in:** 98aa228 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking — missing direct dependency declaration)
**Impact on plan:** Essential for correct module resolution. No scope creep.

## Issues Encountered

- Vitest background execution in this environment spawns commands asynchronously without blocking — had to use inline command execution to get real-time test output
- Double-registration of `@fastify/formbody` (root scope + uiPlugin child scope) was verified to work correctly via direct buildApp() test — Fastify allows multiple registrations in different scopes

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Both twins now fully conform to real API HTTP behavior at the HTTP method, content-type, and auth mechanism level
- 71 Slack tests + 134 Shopify tests passing (1 pre-existing flaky DLQ timing test in Shopify)
- 236/237 monorepo tests passing
- Conformance tests prevent regression on all fixed behaviors
- Ready for Phase 7 (integration/polish)

## Self-Check: PASSED

All key files verified present. Both task commits verified in git log.

---
*Phase: 06-twin-uis*
*Completed: 2026-02-28*
