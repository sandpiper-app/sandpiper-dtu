---
phase: 19-slack-oauth-bolt-http-surface
plan: 01
subsystem: testing
tags: [slack, oauth, install-provider, jwt, state-store, memory-installation-store]

# Dependency graph
requires:
  - phase: 18-slack-webclient-full-surface
    provides: twin auth.test endpoint returning B_BOT_TWIN bot_id; oauth.v2.access endpoint for token exchange
  - phase: 14-verification-harness-foundation-legacy-gap-merge
    provides: SDK verification harness infrastructure, globalSetup, seeders, twin lifecycle

provides:
  - Fixed oauth.v2.access response with enterprise: null and is_enterprise_install: false fields
  - SLCK-09 InstallProvider test suite (generateInstallUrl, handleInstallPath, handleCallback, authorize, full state round-trip)

affects:
  - 19-slack-oauth-bolt-http-surface (subsequent plans build on SLCK-09 InstallProvider coverage)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@slack/oauth is a CJS package — import via default import: `import pkg from '@slack/oauth'; const { InstallProvider, MemoryInstallationStore } = pkg`"
    - "InstallProvider clientOptions.slackApiUrl redirects internal WebClient calls to twin; authorizationUrl redirects install URL to twin"
    - "stateVerification: false path for handleCallback/authorize tests avoids cookie round-trip complexity"
    - "Full state round-trip: handleInstallPath sets slack-app-oauth-state cookie; handleCallback reads cookie + query state param for CSRF validation"
    - "makeReq/makeRes helpers using IncomingMessage(new Socket()) + custom ServerResponse proxy for in-process testing without live HTTP"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts
  modified:
    - twins/slack/src/plugins/oauth.ts

key-decisions:
  - "@slack/oauth is CommonJS — default import + destructuring required in ESM test files; named exports fail with SyntaxError in Node 24"
  - "handleInstallPath without directInstall: true renders HTML page (200), not 302 redirect — Set-Cookie header is the key assertion, not status code"
  - "authorize() source userId should be 'U_TEST' (not 'U_BOT_TWIN') — U_BOT_TWIN is the bot itself; MemoryInstallationStore keyed by teamId T_TWIN"
  - "enterprise: null (not undefined) in oauth.v2.access — SDK checks v2Resp.enterprise == null to determine Installation shape; undefined would be truthy-different"

patterns-established:
  - "Pattern: Simulate Slack OAuth flow against twin using makeReq(urlWithQueryParams) + fake ServerResponse proxy"
  - "Pattern: Extract state JWT from Set-Cookie header via regex: slack-app-oauth-state=([^;]+)"

requirements-completed:
  - SLCK-09

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 19 Plan 01: Slack OAuth InstallProvider Fix + SLCK-09 Tests Summary

**Fixed twin's oauth.v2.access response to include enterprise: null and is_enterprise_install: false, then verified @slack/oauth InstallProvider's full installation flow (generateInstallUrl, handleInstallPath, handleCallback, authorize, cookie state round-trip) against the twin with 5 passing tests.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T01:41:26Z
- **Completed:** 2026-03-10T01:44:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed `twins/slack/src/plugins/oauth.ts`: POST /api/oauth.v2.access now returns `enterprise: null` and `is_enterprise_install: false`, satisfying InstallProvider.handleCallback's Installation shape requirements
- Created `tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` with 5 tests covering the full SLCK-09 InstallProvider surface
- Full sdk-verification regression: 173 tests / 25 files all green after both changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix oauth.v2.access response shape** - `dedd964` (fix)
2. **Task 2: Write SLCK-09 InstallProvider flow tests** - `ecd91e6` (feat)

## Files Created/Modified
- `twins/slack/src/plugins/oauth.ts` - Added `enterprise: null` and `is_enterprise_install: false` to oauth.v2.access response body
- `tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` - 5-test SLCK-09 suite: generateInstallUrl, handleInstallPath, handleCallback (stateVerification: false), authorize, full state round-trip

## Decisions Made
- `@slack/oauth` is CommonJS — named ESM import fails with SyntaxError in Node 24; must use `import pkg from '@slack/oauth'` + destructure
- `handleInstallPath` without `directInstall: true` constructor option renders HTML page (200), not a redirect — Set-Cookie header is the key assertion for the state test
- `authorize()` source `userId` should be `'U_TEST'` not `'U_BOT_TWIN'` — the bot user is the installed bot; MemoryInstallationStore keys by teamId `T_TWIN`, not userId
- `enterprise: null` (explicit null, not undefined) required — SDK's `v2Resp.enterprise == null` check uses loose equality; both null and undefined pass but the TypeScript type requires null for the OAuthV2Response interface

## Deviations from Plan

None - plan executed exactly as written. The `@slack/oauth` CJS import pattern was anticipated by the research; the makeReq/makeRes helper pattern was specified in the plan's action block.

## Issues Encountered
- Plan's inline verification command used `import('./twins/slack/src/index.js')` which fails with native node (TypeScript source not compiled). Re-ran with `node --import tsx/esm` instead — verified PASS immediately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SLCK-09 complete; InstallProvider flows verified against twin
- Phase 19 Plan 02 (Bolt App listener tests) is ready to execute — requires twin to handle Bolt event/action/command payloads
- Coverage ledger update pending at phase end to capture SLCK-09 LIVE_SYMBOLS attribution

## Self-Check: PASSED

- `twins/slack/src/plugins/oauth.ts` — FOUND, contains `enterprise: null` and `is_enterprise_install: false`
- `tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` — FOUND, contains SLCK-09 markers
- `.planning/phases/19-slack-oauth-bolt-http-surface/19-01-SUMMARY.md` — FOUND
- Commit `dedd964` — FOUND (fix: oauth.v2.access response)
- Commit `ecd91e6` — FOUND (feat: SLCK-09 InstallProvider tests)

---
*Phase: 19-slack-oauth-bolt-http-surface*
*Completed: 2026-03-09*
