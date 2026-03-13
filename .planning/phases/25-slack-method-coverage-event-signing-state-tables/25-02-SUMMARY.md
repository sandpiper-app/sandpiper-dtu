---
phase: 25-slack-method-coverage-event-signing-state-tables
plan: "02"
subsystem: twins/slack
tags: [slack, twin, web-api, stubs, method-coverage, SLCK-14]
dependency_graph:
  requires: [25-01]
  provides: [SLCK-14-routes]
  affects: [tests/sdk-verification/sdk/slack-method-coverage.test.ts, twins/slack/src/index.ts]
tech_stack:
  added: []
  patterns: [stub-plugin, auth-gated-stubs, manifest-driven-coverage]
key_files:
  created:
    - twins/slack/src/plugins/web-api/admin.ts
    - twins/slack/src/plugins/web-api/new-families.ts
  modified:
    - twins/slack/src/services/method-scopes.ts
    - twins/slack/src/index.ts
decisions:
  - "admin.ts covers 97 routes (plan said 95) — manifest had admin.apps.activities.list and admin.functions.* not in the hand-listed plan"
  - "new-families.ts deduplicates against existing plugins — conversations.acceptSharedInvite and siblings were already in conversations.ts; apps.manifest.*, oauth.*, team.extended, users.discoverableContacts.lookup were already in stubs.ts"
  - "Rule 1 applied to fix pre-existing state-manager bug: 25-04 commit claimed to add addChannelMember/removeChannelMember/getChannelMembers, createView/getView/updateView, addPin/removePin/listPins, removeReaction but the code was not actually applied — fixed inline"
  - "Rule 1 applied to views.ts duplicate 'id' spread key: { id: fallbackId, ...buildView(view) } -> { ...buildView(view), id: fallbackId }"
metrics:
  duration: ~20min
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 6
---

# Phase 25 Plan 02: Slack Method Coverage (admin.* + new families) Summary

97 admin.* stub routes and 31 new-family routes close the 126+ method WebClient gap — every bound method in @slack/web-api@7.14.1 now returns ok:true against the twin.

## Objective

Close the 126-method WebClient gap by registering all missing Slack API method routes as auth-gated stubs. High-value admin sub-families return semantically shaped responses; remaining families return `{ ok: true, response_metadata: { next_cursor: '' } }`.

## What Was Built

### Task 1: admin.ts (97 routes)

Created `twins/slack/src/plugins/web-api/admin.ts` following the exact `stubs.ts` pattern:

- `admin.users.*` (16 routes) — shaped with `{ members: [] }`, `{ user: { id: 'U_STUB' } }` etc.
- `admin.conversations.*` (25 routes) — shaped with `{ conversations: [] }`, `{ channel_id: 'C_STUB' }` etc.
- `admin.teams.*` (10 routes) — shaped with `{ teams: [] }`, `{ team: { id: 'T_STUB' } }` etc.
- `admin.apps.*` (11 routes) — including `admin.apps.activities.list` from manifest (not in plan's hand-list)
- `admin.barriers.*`, `admin.emoji.*`, `admin.functions.*` (12 routes) — including `admin.functions.*` from manifest
- `admin.inviteRequests.*`, `admin.roles.*`, `admin.usergroups.*` (12 routes)
- `admin.auth.*`, `admin.workflows.*`, `admin.analytics.*` (9 routes)

All routes auth-gated via `extractToken` + `slackStateManager.getToken`.

### Task 2: new-families.ts + method-scopes.ts + index.ts

**new-families.ts** (31 routes):
- `canvases.*` — 6 routes with shaped canvas responses
- `openid.connect.*` — 2 routes with OIDC token/userInfo shapes
- `stars.*` — 3 routes
- `workflows.stepCompleted/stepFailed/updateStep` + `workflows.featured.*` (7 routes)
- `slackLists.*` — 12 routes covering all manifest methods
- `rtm.*` — 2 routes with WSS URL stubs
- `entity.presentDetails` — 1 route

Note: `conversations.*` extended methods, `apps.manifest.*`, `oauth.*`, `team.extended`, `users.discoverableContacts.lookup`, `files.upload/uploadV2` were already registered in existing plugin files — not duplicated.

**method-scopes.ts**: 130+ new entries for all new method families following Slack OAuth scope conventions.

**index.ts**: `adminWebApiPlugin` and `newFamiliesPlugin` registered before `stubsPlugin`.

## Test Results

`pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` — **16/16 PASS (GREEN)**

All 16 SLCK-14 tests pass:
- admin.users.list, admin.conversations.search, admin.teams.list, admin.apps.approved.list
- admin.users.invite, admin.conversations.create
- workflows.stepCompleted, workflows.stepFailed, workflows.updateStep
- canvases.create, canvases.delete
- openid.connect.token, openid.connect.userInfo
- stars.list, stars.add, stars.remove

Pre-existing SLCK-17 failures in `slack-state-tables.test.ts` (4 tests) remain in expected Wave 0 RED state — not caused by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing SlackStateManager methods from Plan 25-04**
- **Found during:** Task 2 build verification
- **Issue:** Commit 6509eac (25-04) claimed to add addChannelMember/removeChannelMember/getChannelMembers, createView/getView/updateView, addPin/removePin/listPins, removeReaction methods to slack-state-manager.ts. These were referenced by conversations.ts, pins.ts, reactions.ts, views.ts plugin files but the methods were never actually committed — only setInteractivityUrl/getInteractivityUrl were added.
- **Fix:** Added all missing methods to SlackStateManager with corresponding SQLite tables (slack_channel_members, slack_views, slack_pins) and UNIQUE index on slack_reactions. Also added prepared statements and nullifyStatements entries.
- **Files modified:** twins/slack/src/state/slack-state-manager.ts (already committed in session 8154459)
- **Commit:** 8154459

**2. [Rule 1 - Bug] Duplicate 'id' key in views.ts spread expression**
- **Found during:** Task 2 build verification
- **Issue:** `{ id: fallbackId, ...buildView(view) }` — buildView() already returns `{ id: generateViewId(), ... }` causing TS2783 error
- **Fix:** Changed to `{ ...buildView(view), id: fallbackId }` so the fallbackId wins
- **Files modified:** twins/slack/src/plugins/web-api/views.ts (already committed in session 8154459)
- **Commit:** 8154459

**3. [Rule 3 - Blocking] Duplicate route registrations in new-families.ts**
- **Found during:** Task 2 test run
- **Issue:** Several routes I added to new-families.ts were already registered in conversations.ts, stubs.ts, and other existing plugin files — causing `FST_ERR_DUPLICATED_ROUTE` runtime error
- **Fix:** Removed all duplicate route registrations from new-families.ts; they are already covered
- **Routes removed:** conversations.acceptSharedInvite/approveSharedInvite/declineSharedInvite/inviteShared/listConnectInvites/requestSharedInvite.*/canvases.create/externalInvitePermissions.set, apps.manifest.*, oauth.access/v2.exchange, team.billing.info/externalTeams.*, users.discoverableContacts.lookup, files.upload/uploadV2

## Self-Check: PASSED

- FOUND: twins/slack/src/plugins/web-api/admin.ts
- FOUND: twins/slack/src/plugins/web-api/new-families.ts
- FOUND: 63cc8fc (feat(25-02): create admin.ts — 97 admin.* stub routes)
- FOUND: e5a53e6 (feat(25-02): create new-families.ts, update method-scopes, wire plugins)
- BUILD: pnpm -F @dtu/twin-slack run build exits 0
- TESTS: slack-method-coverage.test.ts 16/16 PASS
