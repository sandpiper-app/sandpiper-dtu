---
phase: 25-slack-method-coverage-event-signing-state-tables
plan: 01
subsystem: slack-twin-tests
tags: [slack, tdd, wave-0, vitest, method-coverage, event-signing, state-tables]
dependency_graph:
  requires: []
  provides: [SLCK-14-tests, SLCK-16-tests, SLCK-17-tests, XCUT-01-smoke-tests]
  affects: [25-02, 25-03, 25-04]
tech_stack:
  added: []
  patterns: [buildApp-inject-in-process, createSlackClient-seeder, wave-0-red-tests]
key_files:
  created:
    - tests/sdk-verification/sdk/slack-method-coverage.test.ts
    - tests/sdk-verification/sdk/slack-signing.test.ts
    - tests/sdk-verification/sdk/slack-state-tables.test.ts
  modified:
    - twins/slack/test/smoke.test.ts
decisions:
  - "openid.connect.token requires client_id and client_secret arguments — added required fields to satisfy @slack/web-api type signature"
  - "slack-signing.test.ts uses buildApp()+app.inject() in-process pattern to avoid network layer; existing createSlackClient helper is NOT used here (event dispatch tests require local HTTP listeners)"
  - "XCUT-01 smoke tests access app.slackStateManager.database directly for raw SQL seeding — this matches the pattern documented in the RESEARCH.md interfaces section"
  - "slack-state-tables.test.ts uses createSlackClient (live twin via HTTP) not buildApp directly — validates through the full HTTP layer, consistent with existing SLCK-08/SLCK-11 test files"
metrics:
  duration: 6min
  completed_date: "2026-03-13"
  tasks_completed: 3
  files_changed: 4
---

# Phase 25 Plan 01: Slack Wave 0 Failing Tests Summary

Wave 0 failing tests for all three SLCK-17/16/14 requirements plus XCUT-01 reset coverage — four test files in RED state targeting the current twin.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write slack-method-coverage.test.ts (SLCK-14) | ec70cec | tests/sdk-verification/sdk/slack-method-coverage.test.ts |
| 2 | Write slack-signing.test.ts (SLCK-16) | 7fd8c16 | tests/sdk-verification/sdk/slack-signing.test.ts |
| 3 | Write slack-state-tables.test.ts + smoke.test.ts (SLCK-17, XCUT-01) | 666ffd4 | tests/sdk-verification/sdk/slack-state-tables.test.ts, twins/slack/test/smoke.test.ts |

## Artifact Summary

### slack-method-coverage.test.ts (152 lines)
Tests one representative method per missing WebClient family:
- `admin.users.list`, `admin.conversations.search`, `admin.teams.list`, `admin.apps.approved.list`, `admin.users.invite`, `admin.conversations.create` — admin.* family
- `workflows.stepCompleted`, `workflows.stepFailed`, `workflows.updateStep` — workflows.* family
- `canvases.create`, `canvases.delete` — canvases.* family
- `openid.connect.token`, `openid.connect.userInfo` — openid.connect.* family
- `stars.list`, `stars.add`, `stars.remove` — stars.* family

All 15 tests call `resolves.toMatchObject({ ok: true })` — expected to fail with WebClient transport errors (404) since routes don't exist yet.

### slack-signing.test.ts (237 lines)
Three test groups for SLCK-16:
- **Group 1 (SLCK-16a):** Starts local HTTP listener, registers event subscription pointing to it, triggers chat.postMessage, captures delivery headers — asserts `x-slack-signature: v0=<hex>` and `x-slack-request-timestamp` (fails: current twin sends `X-Shopify-Hmac-Sha256`)
- **Group 2 (SLCK-16b):** Triggers interaction via `/admin/interactions/trigger`, asserts `response_url` matches `^https?://` (fails: current twin returns `/response-url/:id` relative path)
- **Group 3 (SLCK-16c):** Tests `/admin/set-interactivity-url` endpoint existence and asserts interactions route to dedicated interactivity URL, not event subscription URL (fails: endpoint doesn't exist)

### slack-state-tables.test.ts (325 lines)
Five test groups for SLCK-17:
- **Group 1:** `conversations.invite` → `conversations.members` shows invited user; kick removes them (fails: no membership table)
- **Group 2:** `conversations.open` returns real DM channel with stable ID, not hardcoded `D_TWIN`; second open returns `already_open:true` (fails: hardcoded D_TWIN)
- **Group 3:** `views.open` → `views.update` with returned `view_id` updates stored title; `views.update` with unknown ID returns `view_not_found` (fails: views.update ignores view_id)
- **Group 4:** `pins.add` deduplication returns `already_pinned`; `pins.list` returns stored pin (fails: pins.add is stateless)
- **Group 5:** `reactions.add` deduplication returns `already_reacted`; `reactions.remove` decrements count; re-add after remove succeeds (fails: no UNIQUE constraint, remove is no-op)

### smoke.test.ts additions (XCUT-01 block, 3 tests)
Seeds raw SQL rows into `slack_channel_members`, `slack_views`, `slack_pins` before reset, then asserts each table has 0 rows after `/admin/reset`. All three fail with "no such table" until Plan 04 creates them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed openid.connect.token missing required arguments**
- **Found during:** Task 1 TypeScript check
- **Issue:** `@slack/web-api` type `OpenIDConnectTokenArguments` requires `client_id` and `client_secret` — calling `.token({ code: 'oidc-fake-code' })` fails type checking
- **Fix:** Added `client_id: 'A_TWIN'` and `client_secret: 'test-client-secret'` to the test call
- **Files modified:** tests/sdk-verification/sdk/slack-method-coverage.test.ts
- **Commit:** ec70cec (inline fix before commit)

**2. [Rule 1 - Bug] Fixed FastifyInstance import in slack-signing.test.ts**
- **Found during:** Task 2 TypeScript check
- **Issue:** `import type { FastifyInstance } from 'fastify'` fails because `fastify` is not a direct project dependency visible at the tests path; `moduleResolution: bundler` can't resolve bare specifier
- **Fix:** Changed to `Awaited<ReturnType<typeof buildApp>>` inferred type — no external import needed
- **Files modified:** tests/sdk-verification/sdk/slack-signing.test.ts
- **Commit:** 7fd8c16 (inline fix before commit)

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| tests/sdk-verification/sdk/slack-method-coverage.test.ts | FOUND |
| tests/sdk-verification/sdk/slack-signing.test.ts | FOUND |
| tests/sdk-verification/sdk/slack-state-tables.test.ts | FOUND |
| twins/slack/test/smoke.test.ts | FOUND (modified) |
| .planning/phases/.../25-01-SUMMARY.md | FOUND |
| commit ec70cec (SLCK-14 tests) | FOUND |
| commit 7fd8c16 (SLCK-16 tests) | FOUND |
| commit 666ffd4 (SLCK-17 + XCUT-01 tests) | FOUND |
