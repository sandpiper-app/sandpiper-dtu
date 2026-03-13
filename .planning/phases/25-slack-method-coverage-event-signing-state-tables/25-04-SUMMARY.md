---
phase: 25-slack-method-coverage-event-signing-state-tables
plan: "04"
subsystem: twins/slack
tags: [slack, state-tables, slck-17, xcut-01, sqlite, conversations, pins, reactions, views]
dependency_graph:
  requires:
    - 25-01  # Wave 0 RED tests written
  provides:
    - slack_channel_members table + membership methods
    - slack_views table + view lifecycle methods
    - slack_pins table + pin deduplication methods
    - UNIQUE index on slack_reactions
    - removeReaction method
  affects:
    - twins/slack/src/state/slack-state-manager.ts
    - twins/slack/src/plugins/web-api/conversations.ts
    - twins/slack/src/plugins/web-api/pins.ts
    - twins/slack/src/plugins/web-api/reactions.ts
    - twins/slack/src/plugins/web-api/views.ts
tech_stack:
  added: []
  patterns:
    - SQLITE_CONSTRAINT_UNIQUE catch for idempotency errors (already_pinned, already_reacted)
    - INSERT OR IGNORE for addChannelMember (silent dedup)
    - Deterministic DM channel ID: D_${sorted users joined by _}
    - formatStoredView helper: JSON.parse title/blocks/state from SQLite TEXT columns
    - Re-read db reference after reset() — stale handle issue with in-memory SQLite
key_files:
  created: []
  modified:
    - twins/slack/src/state/slack-state-manager.ts
    - twins/slack/src/plugins/web-api/conversations.ts
    - twins/slack/src/plugins/web-api/pins.ts
    - twins/slack/src/plugins/web-api/reactions.ts
    - twins/slack/src/plugins/web-api/views.ts
    - twins/slack/test/smoke.test.ts
    - twins/slack/src/services/interaction-handler.ts
decisions:
  - "SQLITE_CONSTRAINT_UNIQUE catch pattern used in both pins.add and reactions.add for idempotency errors"
  - "conversations.open uses deterministic DM ID: D_${[...userList].sort().join('_')} so same pair always yields same channel"
  - "After reset() on in-memory DB, db variable captured before reset is stale — tests must re-read app.slackStateManager.database"
  - "InteractionHandler.baseUrl made optional (default localhost:3001) to fix pre-existing build error from Plan 25-03"
  - "views.update falls back to buildView for view_ids not in store (backward compat with tests using made-up IDs)"
metrics:
  duration: 18min
  completed: "2026-03-13"
  tasks_completed: 2
  files_modified: 7
requirements_satisfied:
  - SLCK-17
  - XCUT-01
---

# Phase 25 Plan 04: SLCK-17 State Tables Summary

Three new SQLite tables (slack_channel_members, slack_views, slack_pins), a UNIQUE index on slack_reactions, and stateful handlers for conversations membership, view lifecycle, pin deduplication, and reaction remove — all verifiably cleared by /admin/reset (XCUT-01 GREEN).

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | SlackStateManager — 3 new tables + 8 new methods | 6509eac | GREEN |
| 2 | Update conversations/pins/reactions/views + smoke.test.ts XCUT-01 | 8154459 | GREEN |

## What Was Built

### SlackStateManager (`twins/slack/src/state/slack-state-manager.ts`)

Three new SQLite tables added to `runSlackMigrations()`:
- `slack_channel_members` — PRIMARY KEY (channel_id, user_id), INSERT OR IGNORE for dedup
- `slack_views` — TEXT PRIMARY KEY id, JSON columns for title/blocks/state
- `slack_pins` — UNIQUE (channel_id, timestamp) and UNIQUE (channel_id, file_id)
- UNIQUE INDEX on `slack_reactions(message_ts, channel_id, user_id, reaction)`

Eight new public methods: `addChannelMember`, `removeChannelMember`, `getChannelMembers`, `createView`, `getView`, `updateView`, `addPin`, `removePin`, `listPins` + `removeReaction`.

All new prepared statements nullified in `nullifyStatements()` and re-prepared after reset.

### conversations.ts

- `conversations.invite` — writes all invited users to `slack_channel_members`
- `conversations.kick` — removes the kicked user from `slack_channel_members`
- `conversations.members` — returns real member list via `getChannelMembers()`
- `conversations.open` — creates deterministic DM channel (ID = `D_${sorted users}`)

### pins.ts

- `pins.add` — inserts into `slack_pins`, catches UNIQUE violation → `already_pinned`
- `pins.list` — returns real pin items from `slack_pins`
- `pins.remove` — deletes from `slack_pins`

### reactions.ts

- `reactions.add` — catches UNIQUE constraint → `already_reacted`
- `reactions.remove` — actually deletes matching row (was no-op)

### views.ts

- `views.open` / `views.push` — persist view to `slack_views`, return stable ID
- `views.update` — looks up stored view by `view_id`, updates record; falls back to ephemeral for unknown IDs

### smoke.test.ts

XCUT-01 tests fixed to re-read `app.slackStateManager.database` after reset (stale handle issue).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] InteractionHandler.baseUrl was required but caller omitted it**
- **Found during:** Task 1 build
- **Issue:** `src/index.ts` passed `{ slackStateManager, signingSecret }` to `new InteractionHandler(...)` but `InteractionHandlerOptions.baseUrl` was required — pre-existing error introduced by Plan 25-03
- **Fix:** Made `baseUrl` optional with default `'http://localhost:3001'` in `interaction-handler.ts`
- **Files modified:** `twins/slack/src/services/interaction-handler.ts`
- **Commit:** 6509eac

**2. [Rule 1 - Bug] XCUT-01 tests used stale DB reference after reset()**
- **Found during:** Task 2 test run
- **Issue:** Tests captured `const db = app.slackStateManager.database` before reset, then queried `db` after reset — but reset() closes the in-memory SQLite connection, so `db` throws "database connection is not open"
- **Fix:** Updated smoke.test.ts to re-read `app.slackStateManager.database` after reset using `dbAfter` variable
- **Files modified:** `twins/slack/test/smoke.test.ts`
- **Commit:** 8154459

**3. [Rule 3 - Blocking] Linter auto-inserted `interactivityUrl` field reference without declaration**
- **Found during:** Task 1 (linter modified file mid-edit)
- **Issue:** Linter added `setInteractivityUrl`/`getInteractivityUrl` methods and `this.interactivityUrl = null` in reset() but didn't add the field declaration
- **Fix:** Added `private interactivityUrl: string | null = null;` field to class body alongside wssUrl
- **Files modified:** `twins/slack/src/state/slack-state-manager.ts`
- **Commit:** 6509eac

## Test Results

```
Test Files  5 passed (5)
     Tests  84 passed (84)
  Duration  4.70s
```

All smoke, integration, web-api, and UI tests GREEN including 3 new XCUT-01 assertions.

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 6509eac: FOUND (Task 1 — SlackStateManager tables + methods)
- Commit 8154459: FOUND (Task 2 — plugins + smoke tests)
- Build: CLEAN (0 TypeScript errors)
- Tests: 84/84 PASSED
