---
phase: 19-slack-oauth-bolt-http-surface
plan: 03
subsystem: testing
tags: [slack, bolt, HTTPReceiver, ExpressReceiver, HMAC, slash-commands, vitest]

# Dependency graph
requires:
  - phase: 18-slack-webclient-full-surface
    provides: Slack twin with full web-api surface + admin/tokens endpoint
  - phase: 19-slack-oauth-bolt-http-surface
    provides: Phase 19 research on Bolt receiver stack (HMAC format, ExpressReceiver pattern)

provides:
  - SLCK-11 HTTPReceiver + ExpressReceiver test suite (7 passing tests)
  - Verified HMAC signing helper pattern (signRequest function)
  - url_verification challenge flow for both receivers
  - HMAC signature rejection test (HTTPReceiver + ExpressReceiver)
  - Live event_callback delivery via HTTP POST with async listener coordination
  - Custom routes test (GET /health returns 200)
  - Slash command respond() flow with 410 tolerance for unregistered response URLs

affects: [phase-20-slack-socket-mode-lambda]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "signRequest() helper: HMAC v0={sha256(secret, 'v0:{ts}:{body}')} for both JSON and form-encoded payloads"
    - "Port-0 server lifecycle: app.start(0) returns Promise<http.Server>; (server.address() as AddressInfo).port"
    - "ExpressReceiver pattern: createServer(receiver.app); server.listen(0); no app.stop() — server.close() instead"
    - "Async listener coordination: Promise resolved by event listener with setTimeout race for timeout"
    - "Command handler respond() 410 tolerance: twin returns 410 for unregistered response_url IDs; test catches and validates error is not an internal Bolt routing failure"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts
  modified: []

key-decisions:
  - "signRequest() unified helper covers both JSON (application/json) and form-encoded (application/x-www-form-urlencoded) content types via contentType parameter — avoids two separate helpers"
  - "ExpressReceiver tests use createServer(receiver.app) + server.close() pattern, not app.stop() — no stop() method on App when using ExpressReceiver in raw http.Server mode"
  - "Async listener coordination via Promise + setTimeout race — HTTPReceiver returns 200 before listener runs; test must await listener separately from HTTP response"
  - "respond() test accepts 410 from twin (unregistered response_url ID) as a valid outcome — proves command listener fired and respond() was called even without a pre-registered response_url"
  - "beforeAll token seeding with 'xoxb-slck11-test-token' — unique token avoids collisions with other test files that also seed 'xoxb-test-token'"

patterns-established:
  - "Bolt HTTP receiver tests: always port 0 + server.address().port, always stop in finally block"
  - "HMAC signing: v0=${createHmac('sha256', secret).update('v0:{ts}:{body}').digest('hex')} with timestamp within 5 minutes"

requirements-completed: [SLCK-11]

# Metrics
duration: 8min
completed: 2026-03-10
---

# Phase 19 Plan 03: SLCK-11 HTTPReceiver and ExpressReceiver Tests Summary

**7 passing Bolt receiver tests covering HMAC signing, url_verification challenge, live event delivery, custom routes, and slash command respond() flow against the Slack twin**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-10T01:42:09Z
- **Completed:** 2026-03-10T01:50:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- HTTPReceiver url_verification challenge: POST with valid HMAC returns `{ challenge: '...' }` correctly
- HMAC signature rejection: invalid signatures return 401/403 for both HTTPReceiver and ExpressReceiver
- Live event delivery: `app.event('app_mention', ...)` listener fires after signed event_callback POST; async coordination via Promise resolved from listener
- Custom routes: `customRoutes: [{ path: '/health', method: ['GET'], handler }]` returns 200 with `{ ok: true }`
- ExpressReceiver: url_verification and signature rejection work identically via `createServer(receiver.app)` pattern
- Slash command respond(): command handler fires, `respond()` posts to response_url; 410 from twin (unregistered ID) caught gracefully without masking Bolt routing errors

## Task Commits

Each task was committed atomically:

1. **Task 1: SLCK-11 HTTPReceiver and ExpressReceiver tests** - `03332fb` (feat)

**Plan metadata:** [pending final commit]

## Files Created/Modified

- `tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts` - 7 SLCK-11 tests for HTTPReceiver + ExpressReceiver: url_verification, signature rejection, event delivery, custom routes, respond()

## Decisions Made

- **signRequest() unified helper:** Single function covering both `application/json` and `application/x-www-form-urlencoded` via `contentType` parameter — covers all receiver test scenarios without duplication
- **ExpressReceiver raw server pattern:** `createServer(receiver.app)` + `server.close()` in finally — App instance not needed for stop, ExpressReceiver doesn't expose stop()
- **Async listener coordination:** `new Promise((resolve) => { ... })` resolved inside `app.event()` handler, raced with a 5s timeout — HTTPReceiver sends 200 ack before listener runs
- **respond() 410 tolerance:** Twin's `/response-url/:id` returns 410 for unregistered IDs. Test accepts this as valid outcome, validating only that the error is not an internal Bolt routing failure
- **Unique token per file:** `'xoxb-slck11-test-token'` avoids conflicts with other test files using `'xoxb-test-token'`

## Deviations from Plan

None — plan executed exactly as written. Tests passed on first run without requiring any implementation changes to the twin or test infrastructure.

## Issues Encountered

None. The `stderr` output showing `[WARN] Failed to parse and verify the request data` and `[WARN] Request verification failed` for the signature rejection tests is expected and correct — these are Bolt's own log output when it properly rejects requests with invalid HMAC signatures.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- SLCK-11 complete: Bolt HTTPReceiver and ExpressReceiver conformance verified against the Slack twin
- Phase 19 Plan 04 can proceed: Bolt App listener APIs (event, message, action, command, options, shortcut, view) tested via processEvent()
- No blockers

---
*Phase: 19-slack-oauth-bolt-http-surface*
*Completed: 2026-03-10*
