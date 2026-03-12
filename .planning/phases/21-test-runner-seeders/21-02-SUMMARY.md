---
phase: 21-test-runner-seeders
plan: 02
subsystem: testing
tags: [shopify-twin, slack-twin, seeders, sdk-verification, method-scopes, fastify]

# Dependency graph
requires:
  - phase: 21-01
    provides: Node 22 LTS alignment, 177 tests passing baseline
provides:
  - POST /admin/tokens endpoint on Shopify twin for direct token seeding
  - METHOD_SCOPES catalog and allScopesString() helper in twins/slack/src/services/method-scopes.ts
  - Forward-safe seedShopifyAccessToken using /admin/tokens instead of OAuth endpoint
  - Forward-safe seedSlackBotToken using allScopesString() instead of hardcoded 'chat:write'
affects:
  - Phase 23 (Shopify OAuth tightening — seeders already protected)
  - Phase 26 (Slack scope enforcement — METHOD_SCOPES is the import source)
  - Phase 27 (conformance coverage — seeders produce valid tokens for all methods)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct token seeding via /admin/tokens bypasses OAuth for test isolation"
    - "Single source of truth for Slack method-to-scope mapping in method-scopes.ts"

key-files:
  created:
    - twins/slack/src/services/method-scopes.ts
  modified:
    - twins/shopify/src/plugins/admin.ts
    - tests/sdk-verification/setup/seeders.ts

key-decisions:
  - "Use POST /admin/tokens on Shopify twin (not OAuth endpoint) so seeders survive Phase 23 OAuth tightening"
  - "Store all Slack scopes in method-scopes.ts as single source of truth for both seeders and Phase 26 enforcement"
  - "allScopesString() grants every scope in the catalog — seeded tokens work for all 177 tests including future ones"
  - "chat.startStream added to METHOD_SCOPES catalog (missing from plan, found via grep of test files)"

patterns-established:
  - "Admin twin endpoints for direct state seeding — prefer /admin/tokens over OAuth flow in test seeders"
  - "Scope catalog pattern: METHOD_SCOPES record + allScopesString() helper, importable by both test code and twin enforcement"

requirements-completed:
  - INFRA-20

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 21 Plan 02: Seeder Forward-Protection Summary

**POST /admin/tokens on Shopify twin plus Slack METHOD_SCOPES catalog pre-empt regressions from Phase 23 OAuth tightening and Phase 26 scope enforcement — all 177 SDK verification tests pass unchanged.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T23:00:00Z
- **Completed:** 2026-03-11T23:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `POST /admin/tokens` to Shopify admin plugin — seeds a token directly into StateManager without touching OAuth
- Created `twins/slack/src/services/method-scopes.ts` with complete 69-entry METHOD_SCOPES catalog and allScopesString() helper
- Updated both seeders to use forward-safe paths: Shopify via /admin/tokens, Slack via allScopesString() instead of 'chat:write'
- Confirmed 177 SDK verification tests all pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /admin/tokens to Shopify twin and create method-scopes catalog** - `71f4165` (feat)
2. **Task 2: Update seedShopifyAccessToken and seedSlackBotToken in seeders.ts** - `5c1999c` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `twins/shopify/src/plugins/admin.ts` - Added POST /admin/tokens route calling stateManager.createToken() with defaults
- `twins/slack/src/services/method-scopes.ts` - New file: METHOD_SCOPES record (69 entries) + allScopesString() helper
- `tests/sdk-verification/setup/seeders.ts` - seedShopifyAccessToken now uses /admin/tokens; seedSlackBotToken uses allScopesString()

## Decisions Made

- Used POST /admin/tokens on Shopify twin rather than OAuth endpoint so seeders are immune to Phase 23 OAuth tightening
- Stored all Slack scopes in a single catalog file (method-scopes.ts) that both seeders and Phase 26 enforcement will import
- allScopesString() grants the union of all scopes so seeded tokens work for every method in the 177-test suite
- shopDomain and scopes fields on POST /admin/tokens are optional with sensible defaults — seeder only passes token

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added chat.startStream to METHOD_SCOPES catalog**
- **Found during:** Task 1 (creating method-scopes catalog)
- **Issue:** Plan's catalog omitted `chat.startStream` but the test suite calls `client.chat.startStream` in slack-chat.test.ts (2 tests). Without this entry, Phase 26 scope enforcement would reject startStream calls.
- **Fix:** Added `'chat.startStream': ['chat:write']` to METHOD_SCOPES before writing the file
- **Files modified:** twins/slack/src/services/method-scopes.ts
- **Verification:** grep confirmed startStream in catalog; 177 tests pass
- **Committed in:** 71f4165 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Addition ensures catalog is complete for the full test suite. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shopify twin now exposes POST /admin/tokens — Phase 23 can safely tighten OAuth without breaking tests
- METHOD_SCOPES is the single source of truth — Phase 26 scope enforcement imports from this file
- All 177 tests pass — clean baseline established for all behavioral phases (22-26)
- Blockers resolved: the two critical regressions pre-empted in this plan are no longer risks

---
*Phase: 21-test-runner-seeders*
*Completed: 2026-03-11*
