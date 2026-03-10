---
phase: 18-slack-webclient-full-surface
plan: 03
subsystem: api
tags: [slack, fastify, reactions, pins, views, web-api, sdk-verification]

# Dependency graph
requires:
  - phase: 18-01
    provides: rate-limiter.ts with rate tier entries for reactions/pins/views methods

provides:
  - reactions.ts Fastify plugin with 4 routes (add/get/list/remove) backed by SlackStateManager reactions storage
  - pins.ts Fastify plugin with 3 routes (add/list/remove) returning conformance ok:true stubs
  - views.ts Fastify plugin with 4 routes (open/publish/push/update) returning synthetic view objects
  - index.ts registrations for reactionsPlugin, pinsPlugin, viewsPlugin
  - 11 new tests covering all three method families (slack-reactions, slack-pins, slack-views)

affects:
  - 18-04-PLAN (coverage ledger update)
  - Phase 19 Slack OAuth/Bolt (may call reactions or views methods)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - authCheck() local helper inside each plugin — keeps plugins self-contained without a shared module
    - reactions.get groups raw reaction rows by emoji name into {name, count, users} shape via Map
    - views.* generate synthetic view IDs (V_<random>) without persisting modal state

key-files:
  created:
    - twins/slack/src/plugins/web-api/reactions.ts
    - twins/slack/src/plugins/web-api/pins.ts
    - twins/slack/src/plugins/web-api/views.ts
    - tests/sdk-verification/sdk/slack-reactions.test.ts
    - tests/sdk-verification/sdk/slack-pins.test.ts
    - tests/sdk-verification/sdk/slack-views.test.ts
  modified:
    - twins/slack/src/index.ts

key-decisions:
  - "reactions.remove is a silent no-op (ok:true) — SlackStateManager has no removeReaction method; conformance only requires ok:true"
  - "pins.add/list/remove are stateless conformance stubs — no persistent pin table needed for SLCK-08 Tier 1 coverage"
  - "views.* do not persist modal state — synthetic view IDs generated per-call; SDK only needs ok:true + view object to proceed"
  - "GET route added for pins.list alongside POST — SDK always uses POST but GET registered for completeness parity"

patterns-established:
  - "authCheck() helper pattern: local async function inside each plugin extracting auth/rate/error-sim preamble"
  - "Reactions grouping: Map<name, {count, users}> from flat SlackStateManager rows → SDK-shaped reactions array"
  - "Synthetic view objects: generateViewId() + buildView() helpers returning compliant ViewsOpenResponse shape"

requirements-completed:
  - SLCK-08

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 18 Plan 03: Reactions, Pins, Views Plugins Summary

**Three Fastify Tier 1 plugins covering 11 Slack Web API methods (reactions/pins/views) with state-backed reactions.get grouping and synthetic view objects; 11 new tests green**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-10T00:11:59Z
- **Completed:** 2026-03-10T00:14:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- reactions.ts: 4 routes with SlackStateManager-backed storage; reactions.get groups raw rows by emoji name into SDK-compliant `{name, count, users}` arrays
- pins.ts: 3 routes returning ok:true / empty items list — stateless conformance stubs with full auth+rate+error-sim preamble
- views.ts: 4 routes returning synthetic `{ok:true, view:{id,type,blocks}}` objects; views.publish returns `type:'home'`, all others `type:'modal'`
- index.ts updated to import and register all three plugins after filesPlugin
- 11 new tests green; full sdk-verification suite 142/142 passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reactions.ts, pins.ts, views.ts plugins + update index.ts** - `65baa05` (feat)
2. **Task 2: Write slack-reactions, slack-pins, slack-views test files** - `4ab7c57` (feat)

## Files Created/Modified

- `twins/slack/src/plugins/web-api/reactions.ts` - reactions.add/get/list/remove with state-backed storage via SlackStateManager
- `twins/slack/src/plugins/web-api/pins.ts` - pins.add/list/remove stateless conformance stubs
- `twins/slack/src/plugins/web-api/views.ts` - views.open/publish/push/update returning synthetic view objects
- `twins/slack/src/index.ts` - imports and registers reactionsPlugin, pinsPlugin, viewsPlugin after filesPlugin
- `tests/sdk-verification/sdk/slack-reactions.test.ts` - 4 tests: add, get (grouped), list, remove
- `tests/sdk-verification/sdk/slack-pins.test.ts` - 3 tests: add, list, remove
- `tests/sdk-verification/sdk/slack-views.test.ts` - 4 tests: open (modal), publish (home), push, update

## Decisions Made

- **reactions.remove no-op:** SlackStateManager has no `removeReaction` method. Rather than add one (architectural change), reactions.remove returns `{ok:true}` as a conformance no-op. The state manager already has `addReaction` and `listReactions` which are sufficient for SLCK-08 coverage.
- **pins stateless:** No persistent pin table needed. The three pins methods return correct response shapes without state; SLCK-08 Tier 1 only requires ok:true conformance.
- **views not persisted:** Modal lifecycle (open → interact → close) is out of scope for Tier 1. Synthetic view IDs are generated per call using `V_<random>`. The SDK only needs `ok:true + view.id` to proceed.
- **GET route for pins.list:** SDK always uses POST, but a GET route was registered for completeness parity with other read methods in the codebase.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript error in `twins/slack/src/plugins/ui.ts` line 303 (`null` not assignable to `string | undefined` for `email` field in `updateUser`). This error predates Plan 03 — `ui.ts` was unmodified. The new plugin files compile cleanly. Logged as out-of-scope discovery.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 completes the Tier 1 reactions/pins/views method families required by SLCK-08
- Plan 04 (coverage ledger update) can now add these 11 new symbols to LIVE_SYMBOLS
- Full sdk-verification suite (142 tests) is green, no regressions

---
*Phase: 18-slack-webclient-full-surface*
*Completed: 2026-03-10*
