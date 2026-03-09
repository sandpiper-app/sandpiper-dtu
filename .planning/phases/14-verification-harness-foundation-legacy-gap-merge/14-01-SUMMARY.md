---
phase: 14-verification-harness-foundation-legacy-gap-merge
plan: "01"
subsystem: twins/slack
tags: [slack-twin, auth, web-api, tdd, gateway]
requires: []
provides: [auth.test-route, api.test-route, authPlugin]
affects: [twins/slack/src/index.ts, twins/slack/src/services/rate-limiter.ts]
tech_stack:
  added: []
  patterns: [fastify-plugin-async, tdd-red-green, slack-web-api-shape]
key_files:
  created:
    - twins/slack/src/plugins/web-api/auth.ts
    - twins/slack/test/auth.test.ts
  modified:
    - twins/slack/src/index.ts
    - twins/slack/src/services/rate-limiter.ts
decisions:
  - "auth.test assigned tier 1 (20/min) in SlackRateLimiter — matches Slack docs for auth methods"
  - "bot_id 'B_BOT_TWIN' is a hardcoded constant matching the deterministic twin seed — not looked up dynamically"
  - "authPlugin registered before chatPlugin (first in the web-api plugin group) — logical ordering as the gateway endpoint"
  - "api.test has no rate limiting or error simulation — matches real Slack behavior (pure echo endpoint)"
metrics:
  duration: "5 minutes"
  completed_date: "2026-03-09"
  tasks_completed: 2
  files_changed: 4
requirements_completed:
  - SLCK-06.5
---

# Phase 14 Plan 01: auth.test and api.test Gateway Routes Summary

auth.test and api.test gateway routes added to the Slack twin — authPlugin registered in buildApp(), full TDD with 10 new passing tests.

## What Was Built

Two endpoints were added to the Slack twin that serve as the gateway for all Slack SDK conformance work:

- **POST /api/auth.test**: Validates credentials and returns the full Slack workspace identity response `{ ok: true, url, team, user, team_id, user_id, bot_id, is_enterprise_install }`. Handles `not_authed`, `invalid_auth`, rate limiting (429), and error simulation (via admin).
- **POST /api/api.test**: Pure echo endpoint. No authentication required. Merges `request.body` and `request.query` into `{ ok: true, args: { ... } }`. Used by the Slack SDK as a connectivity smoke test.

The plugin follows the exact same structure as `chat.ts` (FastifyPluginAsync, extractToken, slackStateManager, rateLimiter, getErrorConfig).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create auth.ts plugin (TDD: RED + GREEN) | 810dfa6, 359996a | twins/slack/src/plugins/web-api/auth.ts, twins/slack/test/auth.test.ts, twins/slack/src/services/rate-limiter.ts |
| 2 | Register authPlugin in buildApp() | 4305bff | twins/slack/src/index.ts |

## Verification

- 81 tests pass (71 pre-existing + 10 new auth tests)
- auth.ts routes smoke test: `auth.ts routes: OK`
- No regressions in existing Slack twin tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Rate Tier] auth.test not in DEFAULT_RATE_TIERS**
- **Found during:** GREEN phase — rate limit test returned 0 results
- **Issue:** `auth.test` was not registered in `SlackRateLimiter.DEFAULT_RATE_TIERS`. The `check()` method returns `null` (no-op) for unknown methods, so rate limiting was silently skipped.
- **Fix:** Added `'auth.test': { tier: 1, requestsPerMinute: 20 }` to `DEFAULT_RATE_TIERS`. Tier 1 (20/min) matches Slack documentation for auth endpoints.
- **Files modified:** `twins/slack/src/services/rate-limiter.ts`
- **Commit:** 359996a

**2. [Rule 1 - Bug] Test used incorrect error config endpoint and field names**
- **Found during:** GREEN phase — error simulation test returned `ok: true` instead of the simulated error
- **Issue:** Test used `POST /admin/errors` with `{ method, status_code, error_body }` but the actual endpoint is `POST /admin/errors/configure` with `{ methodName, statusCode, errorBody }`.
- **Fix:** Updated test to use the correct endpoint URL and field names.
- **Files modified:** `twins/slack/test/auth.test.ts`
- **Commit:** 359996a

**3. [Out-of-scope] Pre-existing TypeScript error in ui.ts**
- **Discovered:** `twins/slack/src/plugins/ui.ts(303,7)` has a pre-existing type error (`string | null` vs `string | undefined`).
- **Action:** Not fixed — pre-existing, out-of-scope per deviation rules. Logged to `deferred-items.md`.
- **Impact:** `npx tsc --noEmit` exits non-zero but all runtime tests pass.

## Self-Check: PASSED

- auth.ts: FOUND at `twins/slack/src/plugins/web-api/auth.ts`
- auth.test.ts: FOUND at `twins/slack/test/auth.test.ts`
- Commits: 810dfa6 (RED tests), 359996a (GREEN implementation), 4305bff (registration) — all found
