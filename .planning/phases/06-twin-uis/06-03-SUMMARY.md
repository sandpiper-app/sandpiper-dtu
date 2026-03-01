---
phase: 06-twin-uis
plan: 03
subsystem: ui
tags: [eta, fastify-view, htmx, pico-css, slack-ui, message-timeline]

requires:
  - phase: 06-twin-uis
    plan: 01
    provides: "@dtu/ui shared package with registerUI(), Eta partials, Pico CSS"
  - phase: 05-slack-twin-web-api-events
    provides: "SlackStateManager, EventDispatcher, Slack Web API methods"
provides:
  - "Slack twin web UI at /ui/* with channels, users, and admin pages"
  - "Channel detail with chronological message timeline and inline post form"
  - "UI-driven entity creation visible through Slack Web API (conversations.list etc.)"
  - "Event dispatch from UI actions (channel_created, message events)"
affects: [05-slack-twin-web-api-events]

tech-stack:
  added: ["@dtu/ui workspace dependency in Slack twin"]
  patterns:
    - "Channel detail as message timeline — Slack UX metaphor (type in channel)"
    - "Inline post-message form on channel detail page (no separate route)"
    - "Route ordering: /channels/new before /:id to avoid conflicts"
    - "Direct SQL for updateUser (no updateUser method in SlackStateManager)"

key-files:
  created:
    - twins/slack/src/plugins/ui.ts
    - twins/slack/src/views/channels/list.eta
    - twins/slack/src/views/channels/detail.eta
    - twins/slack/src/views/channels/form.eta
    - twins/slack/src/views/users/list.eta
    - twins/slack/src/views/users/detail.eta
    - twins/slack/src/views/users/form.eta
    - twins/slack/src/views/admin/index.eta
    - twins/slack/src/views/admin/events.eta
    - twins/slack/test/ui.test.ts
  modified:
    - twins/slack/package.json
    - twins/slack/src/index.ts
    - packages/ui/src/index.ts

key-decisions:
  - "Channel detail as message timeline view: shows chronological messages with user name lookup, ts, blocks indicator, and inline Post Message form at bottom"
  - "Event dispatch from UI: channel_created and message events dispatched via eventDispatcher.dispatch() to all subscribed apps, same as Web API calls"
  - "updateUser via direct SQL: SlackStateManager lacks updateUser method; direct SQL INSERT replaces the pattern"
  - "@dtu/ui layout path fix: relativeLayoutPath broken when viewsDir outside package tree; replaced with root=partialsDir + explicit viewsDir lookup in resolvePath"

patterns-established:
  - "Slack UI uiPlugin follows exact same structure as Shopify uiPlugin for consistency"
  - "Channel route ordering: /channels/new before /channels/:id prevents new from being treated as an ID"

requirements_completed: [UI-03, UI-04]

duration: 9min
completed: 2026-02-28
---

# Phase 6 Plan 3: Slack Twin UI Summary

**Slack twin web UI with channel message timeline, user management, and admin dashboard — all entity operations trigger the same events as API calls**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-28T18:53:35Z
- **Completed:** 2026-02-28
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Created `ui.ts` Fastify plugin (165 lines) with all channel, user, and admin routes at `/ui/*`
- Channel detail page shows chronological message timeline with inline Post Message form — matches Slack's UX metaphor of typing in a channel
- Channel create/message post dispatch events to subscribed apps via EventDispatcher (same side effects as Web API)
- User CRUD (list, create, edit, delete) including direct SQL update for missing updateUser method
- Admin dashboard shows live state counts (channels, users, messages, tokens, event subscriptions) with Reset button
- Event subscriptions page shows all registered event subscriptions
- 19 integration tests validating all routes including cross-system verification (UI-created channel visible via conversations.list API)
- Fixed pre-existing `@dtu/ui` layout path bug from phase 06-02 (Rule 1 - Bug)

## Task Commits

1. **Task 1: Create Slack UI plugin** - `fa82627` (feat)
2. **Task 2: Create Slack UI integration tests** - `e0a42eb` (test)

## Files Created/Modified

- `twins/slack/src/plugins/ui.ts` — UI Fastify plugin (165 lines): channels CRUD + message timeline, users CRUD, admin dashboard/reset/events
- `twins/slack/src/views/channels/list.eta` — Channels list using shared table partial
- `twins/slack/src/views/channels/detail.eta` — Custom channel detail with message timeline + inline post form
- `twins/slack/src/views/channels/form.eta` — Channel create/edit form using shared form partial
- `twins/slack/src/views/users/list.eta` — Users list using shared table partial
- `twins/slack/src/views/users/detail.eta` — User detail using shared detail partial
- `twins/slack/src/views/users/form.eta` — User create/edit form
- `twins/slack/src/views/admin/index.eta` — Admin dashboard with stat cards and reset button
- `twins/slack/src/views/admin/events.eta` — Event subscriptions table
- `twins/slack/test/ui.test.ts` — 19 integration tests covering all UI routes
- `twins/slack/package.json` — Added @dtu/ui dependency
- `twins/slack/src/index.ts` — Registered uiPlugin in buildApp()
- `packages/ui/src/index.ts` — Fixed layout path bug (deviation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed @dtu/ui layout path resolution for non-peer viewsDirs**

- **Found during:** Task 2 (integration test run triggering full monorepo tests)
- **Issue:** `relativeLayoutPath = path.relative(viewsDir, partialsDir/layout.eta)` computes wrong path when `viewsDir` is in a different package tree than `partialsDir`. The `@dtu/ui` unit test uses `packages/ui/test/fixtures/views` as viewsDir; the relative path traversed to `packages/` (missing `ui/`) making the layout unreachable.
- **Fix:** Set `root = partialsDir` in @fastify/view so it validates `layout.eta` correctly; replaced `resolvePath` override to check `viewsDir` explicitly (not via `originalResolvePath` which uses the framework-configured root) before falling back to `partialsDir`.
- **Files modified:** `packages/ui/src/index.ts`
- **Commit:** `e0a42eb`

## Test Results

- **Slack twin tests:** 58/58 pass (11 smoke + 18 web-api + 19 UI + 10 integration)
- **Pre-existing failure:** `twins/shopify/test/integration.test.ts > Webhooks > DLQ retry` — flaky timing test unrelated to this plan (confirmed failing before our changes)
- **Monorepo:** 217/218 tests pass

## Self-Check: PASSED

- `twins/slack/src/plugins/ui.ts` — FOUND
- `twins/slack/src/views/channels/detail.eta` — FOUND
- `twins/slack/src/views/admin/index.eta` — FOUND
- `twins/slack/test/ui.test.ts` — FOUND
- `.planning/phases/06-twin-uis/06-03-SUMMARY.md` — FOUND
- Commit `fa82627` — FOUND
- Commit `e0a42eb` — FOUND
