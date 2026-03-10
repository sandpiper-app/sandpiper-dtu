---
phase: 18-slack-webclient-full-surface
plan: 05
subsystem: testing
tags: [coverage-ledger, drift-check, live-symbols, slack-web-api, infra-12]

# Dependency graph
requires:
  - phase: 18-01
    provides: slack-chat.test.ts, slack-webclient-base.test.ts (filesUploadV2, apiCall, chatStream, paginate)
  - phase: 18-02
    provides: slack-conversations.test.ts, slack-users.test.ts (Tier 1 families)
  - phase: 18-03
    provides: slack-reactions.test.ts, slack-pins.test.ts, slack-views.test.ts
  - phase: 18-04
    provides: slack-stubs-smoke.test.ts (Tier 2 stubs smoke coverage for 80+ routes)
provides:
  - generate-report.ts with all Phase 18 LIVE_SYMBOLS (Tier 1 + Tier 2 stub attributions)
  - coverage-report.json updated to phase 18 with 167 live symbols
  - INFRA-12 guarantee: every @slack/web-api manifest symbol has declared tier (live or deferred)
  - drift:check CI gate passing with full Phase 18 surface classified
affects:
  - Phase 19 (oauth/bolt coverage ledger extension)
  - Phase 20 (Socket Mode / Lambda coverage ledger extension)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LIVE_SYMBOLS map uses pkgName@version/symbolPath key format for versioned attribution drift safety"
    - "coverage/ dir is gitignored; force-add -f for generate-report.ts and coverage-report.json"
    - "Members absent from manifest (e.g. users.setActive, conversations.canvases.delete) are omitted from LIVE_SYMBOLS — keys silently ignored but never contribute to live count"

key-files:
  created: []
  modified:
    - tests/sdk-verification/coverage/generate-report.ts
    - tests/sdk-verification/coverage/coverage-report.json

key-decisions:
  - "conversations.canvases.delete and conversations.canvases.sections.lookup omitted — only conversations.canvases.create is in WebClient.members manifest; canvases.delete and canvases.sections.lookup are top-level canvases.* methods not nested under conversations.canvases.*"
  - "users.setActive omitted — not in @slack/web-api manifest members; users family is 11 methods (not 12 as plan estimated)"
  - "conversations.requestSharedInvite registered as .approve/.deny/.list sub-methods — manifest has no flat conversations.requestSharedInvite member; 3 sub-paths correctly attributed"
  - "Phase 18 live count = 167 total (includes Phase 14-17 Shopify/Slack symbols + 130 new Phase 18 Slack additions)"

patterns-established:
  - "Verify manifest members before committing LIVE_SYMBOLS — plan estimates may differ from actual ts-morph manifest output"
  - "Tier 2 stubs attributed to slack-stubs-smoke.test.ts; Tier 1 methods attributed to their family test file"

requirements-completed: [SLCK-07, SLCK-08]

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 18 Plan 05: Coverage Ledger Update Summary

**generate-report.ts updated with 130 Phase 18 LIVE_SYMBOLS classifying the full @slack/web-api WebClient surface; drift:check passes with 167 live symbols across all phases**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T00:21:36Z
- **Completed:** 2026-03-10T00:23:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added ~130 LIVE_SYMBOLS entries for Phase 18 Tier 1 methods (chat 13, conversations 26, users 11, reactions 4, pins 3, views 4, base 4) and Tier 2 stubs across 13 families
- Updated coverage-report.json to phase 18 with 167 live symbols (up from Phase 17 Shopify-only count)
- drift:check CI gate passes — no null tiers, no manifest drift
- pnpm test:sdk green — 152 tests / 22 files all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 18 LIVE_SYMBOLS to generate-report.ts** - `8fb3350` (feat)
2. **Task 2: Run pnpm coverage:generate and verify coverage-report.json** - `c6d1676` (feat)

## Files Created/Modified
- `tests/sdk-verification/coverage/generate-report.ts` - Phase 18 LIVE_SYMBOLS block added + phase/note fields updated to '18'
- `tests/sdk-verification/coverage/coverage-report.json` - Regenerated: phase=18, 167 live / 32512 deferred, INFRA-12 compliant

## Decisions Made
- `conversations.canvases.delete` and `conversations.canvases.sections.lookup` omitted from LIVE_SYMBOLS because neither exists in the WebClient.members manifest array. The manifest has `conversations.canvases.create` (one nested sub-method) while `canvases.delete` and `canvases.sections.lookup` are top-level `canvases.*` members. The plan estimate of 28 conversations methods was off by 2 for this reason.
- `users.setActive` omitted — not in the @slack/web-api manifest (only `users.setPhoto` and `users.setPresence` exist). Plan estimated 12 users methods; actual attributed set is 11.
- `conversations.requestSharedInvite` is only exposed as `.approve`, `.deny`, `.list` sub-paths in the manifest — no flat method exists. All three sub-paths correctly attributed to slack-conversations.test.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected invalid LIVE_SYMBOLS keys not present in manifest**
- **Found during:** Task 1 (manifest cross-reference before writing LIVE_SYMBOLS)
- **Issue:** Plan specified `conversations.canvases.delete`, `conversations.canvases.sections.lookup`, and `users.setActive` as LIVE_SYMBOLS keys — none of these paths exist in the WebClient.members manifest array
- **Fix:** Omitted the 3 non-existent keys; added clarifying comments in generate-report.ts explaining why
- **Files modified:** tests/sdk-verification/coverage/generate-report.ts
- **Verification:** generate-report.ts ran without error; live count matches expected (no silently-ignored keys creating false attribution)
- **Committed in:** 8fb3350 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (manifest cross-reference correction)
**Impact on plan:** Essential for attribution accuracy — silently-ignored keys would cause LIVE_SYMBOLS to claim coverage for methods that don't exist in the manifest. No scope creep.

## Issues Encountered
- coverage/ directory is gitignored at repo root; force-add (-f) required for both generate-report.ts and coverage-report.json (known from Plan 14-05)

## Next Phase Readiness
- Phase 18 complete — all SLCK-07 and SLCK-08 requirements satisfied
- INFRA-12 guarantee in place for full @slack/web-api WebClient surface
- Phase 19 (OAuth/Bolt HTTP) can extend LIVE_SYMBOLS with oauth.v2.access, openid, and bolt route symbols

---
*Phase: 18-slack-webclient-full-surface*
*Completed: 2026-03-10*
