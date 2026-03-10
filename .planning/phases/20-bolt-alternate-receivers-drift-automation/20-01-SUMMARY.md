---
phase: 20-bolt-alternate-receivers-drift-automation
plan: "01"
subsystem: testing
tags: [slack, bolt, socket-mode, websocket, twin, sdk-verification]

# Dependency graph
requires:
  - phase: 19-slack-oauth-bolt-http-surface
    provides: SlackStateManager token seeding, seedSlackBotToken helper, Bolt HTTP test patterns

provides:
  - setWssUrl()/getWssUrl() in-memory methods on SlackStateManager
  - POST /admin/set-wss-url endpoint for seeding WebSocket broker URL into twin
  - POST /api/apps.connections.open stub returning dynamic wssUrl from state
  - slack-bolt-socket-mode-receiver.test.ts: SLCK-12 SocketModeReceiver conformance test

affects:
  - 20-02-PLAN  # AwsLambdaReceiver plan references same SlackStateManager
  - coverage-report  # SLCK-12 live symbol attribution in future ledger update

# Tech tracking
tech-stack:
  added: [ws.WebSocketServer broker pattern for Socket Mode receiver testing]
  patterns:
    - "WebSocket broker on port 0 — OS-assigned port prevents conflicts; seed URL into twin via /admin/set-wss-url before receiver.start()"
    - "receiver.stop() before wss.close() in finally — prevents SocketModeClient reconnect-loop that blocks Vitest from exiting"
    - "SocketModeClient auto-acks envelopes before dispatching middleware — await both ackReceived and listenerPromise to avoid race condition"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts
  modified:
    - twins/slack/src/state/slack-state-manager.ts
    - twins/slack/src/plugins/admin.ts
    - twins/slack/src/plugins/web-api/stubs.ts

key-decisions:
  - "wssUrl stored as ephemeral in-memory field on SlackStateManager (not SQLite) — per-test-run value, no persistence needed; reset() nulls it out"
  - "apps.connections.open does NOT use generic stub() helper — response is dynamic (reads wssUrl from state), requires custom handler"
  - "Both ackReceived and listenerPromise awaited together via Promise.all — SocketModeClient auto-acks before middleware dispatch, so broker ack arrives before listener fires; awaiting both removes race condition"
  - "xapp- app-level token seeded via seedSlackBotToken() — twin checks token existence only (not prefix), so same helper works for xapp- tokens"

patterns-established:
  - "Ephemeral in-memory twin state pattern: simple private field + reset() nullification for per-test-run values that don't need DB persistence"

requirements-completed: [SLCK-12]

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 20 Plan 01: SocketModeReceiver Twin Harness Summary

**SocketModeReceiver end-to-end conformance test via ws.Server broker with dynamic wssUrl seeding, hello-frame exchange, and app_mention ack verification**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T02:29:25Z
- **Completed:** 2026-03-10T02:31:30Z
- **Tasks:** 2
- **Files modified:** 4 (3 twin files + 1 test file created)

## Accomplishments
- Added `setWssUrl()`/`getWssUrl()` to SlackStateManager with ephemeral in-memory storage + reset() nullification
- Added `POST /admin/set-wss-url` admin endpoint enabling tests to seed broker URLs into the twin before receiver.start()
- Added `POST /api/apps.connections.open` stub that returns the dynamically stored wssUrl (auth-gated, custom handler)
- Created SocketModeReceiver conformance test: wss.Server broker on port 0, hello frame, events_api envelope delivery, dual assertion (broker ack + listener fired), 177/177 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add setWssUrl/getWssUrl to SlackStateManager + admin/stubs routes** - `7171499` (feat)
2. **Task 2: SocketModeReceiver conformance test (SLCK-12)** - `e1a0bb0` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `twins/slack/src/state/slack-state-manager.ts` - Added `wssUrl` private field + `setWssUrl()`/`getWssUrl()` public methods + `this.wssUrl = null` in `reset()`
- `twins/slack/src/plugins/admin.ts` - Added `POST /admin/set-wss-url` endpoint calling `slackStateManager.setWssUrl(url)`
- `twins/slack/src/plugins/web-api/stubs.ts` - Added `POST /api/apps.connections.open` with dynamic wssUrl lookup (cannot use generic stub() factory)
- `tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts` - Created SLCK-12 SocketModeReceiver conformance test

## Decisions Made
- **wssUrl stored as ephemeral in-memory field** (not SQLite): It's a per-test-run value with no persistence requirement. A simple private class field + null in reset() is sufficient. Adding a DB table would be architectural over-engineering.
- **apps.connections.open uses custom handler (not stub() factory)**: The generic `stub()` helper only returns static extras merged with `{ ok: true }`. The wssUrl response must be dynamically read from state at request time — a separate handler is required.
- **Both `ackReceived` and `listenerPromise` awaited via Promise.all**: SocketModeClient auto-acks the envelope_id before dispatching to app middleware. The broker receives the ack before the listener fires. Awaiting only `ackReceived` could resolve before `listenerFired` becomes true, creating a false positive. Awaiting both guarantees end-to-end delivery.
- **xapp- token seeded via seedSlackBotToken()**: The twin's token validator only checks record existence (not prefix). `seedSlackBotToken('xapp-1-slck12-app-level-token')` works identically to seeding a bot token.

## Deviations from Plan

None - plan executed exactly as written. Pre-existing TypeScript error in `twins/slack/src/plugins/ui.ts:303` (`TS2322: string | null not assignable to string | undefined`) documented in `deferred-items.md`. This error predates Phase 20 changes.

## Issues Encountered
- Pre-existing `ui.ts` TypeScript error caused `npx tsc --noEmit` to exit non-zero. Verified by stashing changes — error exists before any Phase 20 modifications. Logged to `deferred-items.md`. My new files compile cleanly.

## Next Phase Readiness
- SlackStateManager wssUrl infrastructure available for any future WebSocket-based twin patterns
- SocketModeReceiver fully tested (SLCK-12 closed); Phase 20 plan 02 (AwsLambdaReceiver) can proceed
- All 177 sdk-verification tests passing; drift:check green (193 live symbols)

---
*Phase: 20-bolt-alternate-receivers-drift-automation*
*Completed: 2026-03-10*
