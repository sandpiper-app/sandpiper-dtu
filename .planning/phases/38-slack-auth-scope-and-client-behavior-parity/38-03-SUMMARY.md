---
phase: 38-slack-auth-scope-and-client-behavior-parity
plan: 03
subsystem: auth
tags: [slack, scope, conversations, dynamic-resolution, method-scopes]

# Dependency graph
requires:
  - phase: 26-slack-scope-enforcement
    provides: checkScope + METHOD_SCOPES catalog used as foundation

provides:
  - resolveConversationTypeScopes() — maps conversation types array to minimal read/history scope set
  - resolveChannelClass() — infers channel class from id/is_channel/is_private properties
  - checkResolvedScopes() — scope enforcement from a pre-computed scope array
  - conversations.list now enforces only the scopes implied by the types parameter
  - conversations.info now enforces only the scope implied by the resolved channel class
  - conversations.history now enforces only the scope implied by the resolved channel class
  - X-Accepted-OAuth-Scopes reflects the resolved scope set, not a static union

affects:
  - 38-04-PLAN.md (scope enforcement foundation stable)
  - conversations.ts dynamic enforcement pattern

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic conversation scope resolution: parse types param or load channel before enforcing scope"
    - "resolveChannelClass infers im/mpim/private_channel/public_channel from id prefix and is_channel/is_private flags"
    - "checkResolvedScopes mirrors checkScope but accepts pre-computed array instead of method key"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts
  modified:
    - twins/slack/src/services/method-scopes.ts
    - twins/slack/src/plugins/web-api/conversations.ts

key-decisions:
  - "resolveChannelClass uses id.startsWith('D_') to detect DM (not is_private alone) — D_ prefix is deterministic from conversations.open DM creation"
  - "conversations.info and conversations.history move scope enforcement AFTER channel lookup — scope depends on channel class which requires loading the channel row first"
  - "conversations.list parses types before scope enforcement — no channel row needed, scope is fully request-driven"
  - "METHOD_SCOPES['conversations.*'] catalog entries left unchanged — they remain correct as a seeder catalog; only the three reader handlers switch to the dynamic resolver"
  - "Default types value is 'public_channel' — missing types param means channels:read only, not all four family scopes"

patterns-established:
  - "Dynamic scope pattern: parse request context first, then resolve required scopes, then enforce"
  - "X-Accepted-OAuth-Scopes must reflect the resolved scope array (requiredScopes.join(',')) not the static catalog"

requirements-completed:
  - SLCK-21

# Metrics
duration: 12min
completed: 2026-03-14
---

# Phase 38 Plan 03: Dynamic Conversation Scope Resolution Summary

**Context-aware scope enforcement for conversations.list/info/history using request types and resolved channel class instead of the universal family-scope AND requirement**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-14T15:14:32Z
- **Completed:** 2026-03-14T15:27:00Z
- **Tasks:** 2
- **Files modified:** 3 (plus 1 created)

## Accomplishments

- Added three exports to `method-scopes.ts`: `resolveConversationTypeScopes`, `resolveChannelClass`, and `checkResolvedScopes` providing context-aware scope resolution without touching the existing catalog
- Rewired all three conversation reader handlers to use dynamic scope resolution — `conversations.list` resolves from the `types` param, `conversations.info` and `conversations.history` resolve from the channel class after loading the channel
- `X-Accepted-OAuth-Scopes` now emits only the scope(s) required for the specific request, matching real Slack behavior
- All 9 new conversation-scope parity tests GREEN; all 24 existing conversations regression tests GREEN

## Task Commits

1. **Task 1: Add dynamic conversation scope helpers to method-scopes.ts** - `af51fb3` (feat)
2. **Task 2: Wire conversations.list/info/history to the resolved scope helpers** - `2488602` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `twins/slack/src/services/method-scopes.ts` — Added `resolveConversationTypeScopes`, `resolveChannelClass`, `checkResolvedScopes` exports below existing `checkScope`; METHOD_SCOPES catalog and `allScopesString()` unchanged
- `twins/slack/src/plugins/web-api/conversations.ts` — Updated three reader handlers to use dynamic scope resolution; import extended to include new helpers
- `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` — Created (Wave 0 dependency from 38-01): 9 tests covering list types param, info channel-class, history channel-class, and X-Accepted-OAuth-Scopes header assertions

## Decisions Made

- `resolveChannelClass` uses `id.startsWith('D_')` as the primary DM signal — this is deterministic because the twin's `conversations.open` implementation seeds DM channels with the `D_${sorted_users}` prefix
- `conversations.info` and `conversations.history` move scope enforcement after channel lookup so the resolver knows the channel class; rate-limit check moved to match the new ordering (rate-limit still comes before channel lookup to maintain `ratelimited` response priority)
- `conversations.list` scope resolved before channel listing since types are fully request-driven; the `params` variable is now extracted early (before rate-limit check) to allow type parsing
- METHOD_SCOPES catalog entries for `conversations.list/info/history` remain intact — `seedSlackBotToken()` still uses `allScopesString()` which unions all catalog scopes, so seeded tokens remain broadly scoped

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created slack-conversation-scope-parity.test.ts**
- **Found during:** Plan start — dependency check revealed 38-01 had not been executed yet
- **Issue:** Plan 38-03 `depends_on: [38-01]` but 38-01 was never committed; test file missing entirely
- **Fix:** Created the parity test file (as specified in 38-01 task 3) with 9 tests covering the dynamic scope matrix for list/info/history
- **Files modified:** `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` (created)
- **Verification:** All 9 tests pass after Task 2 implementation; file included in Task 1 commit
- **Committed in:** af51fb3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** Missing test file was a blocking dependency. Creating it as part of this plan's execution is the correct recovery; tests are exactly what 38-01 task 3 specifies.

## Issues Encountered

- 7 pre-existing test failures remain from plans 38-02 and 38-04 not having been executed:
  - `slack-auth-parity.test.ts` — `apps.connections.open` app-token enforcement (38-02 scope)
  - `slack-client-behavior-parity.test.ts` — `filesUploadV2` metadata and `response_url` (38-04 scope)
  - `slack-method-coverage.test.ts` — `openid.connect.token` credential validation (38-02 scope)
  - `slack-scope-enforcement.test.ts` SLCK-18f — redirect_uri_mismatch (38-02 scope)

  These are all documented Wave 0 RED tests that will be fixed by their respective plans.

## Next Phase Readiness

- SLCK-21 requirement fully satisfied: dynamic conversation scope resolution is live and tested
- 38-04 (client-visible flow parity: filesUploadV2, response_url) unblocked
- Existing `checkScope` + `METHOD_SCOPES` pattern preserved for all other methods — no regressions

## Self-Check: PASSED

All artifacts verified:
- `twins/slack/src/services/method-scopes.ts` — FOUND
- `twins/slack/src/plugins/web-api/conversations.ts` — FOUND
- `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` — FOUND
- `.planning/phases/38-slack-auth-scope-and-client-behavior-parity/38-03-SUMMARY.md` — FOUND
- Commit `af51fb3` — FOUND (Task 1: method-scopes.ts helpers)
- Commit `2488602` — FOUND (Task 2: conversations.ts wiring)

---
*Phase: 38-slack-auth-scope-and-client-behavior-parity*
*Completed: 2026-03-14*
