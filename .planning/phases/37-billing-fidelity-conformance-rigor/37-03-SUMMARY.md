---
phase: 37-billing-fidelity-conformance-rigor
plan: 03
subsystem: testing
tags: [conformance, slack, shopify, twin-mode, normalizer]

# Dependency graph
requires:
  - phase: 37-01
    provides: Wave 0 RED billing tests establishing Finding #11 gap contracts
  - phase: 27
    provides: Conformance runner, comparator, structural comparison functions

provides:
  - Conformance runner twin-mode second-call structural comparison (no self-comparison)
  - Slack conformance adapter broad-scope token seeding via admin endpoint
  - Accurately labeled chat-postMessage-second test (was misleadingly named chat-update)
  - Shopify normalizer strips extensions.cost (rate-limit fields non-deterministic in twin mode)

affects:
  - conformance runner twin mode
  - Shopify conformance suite
  - Slack conformance suite

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Twin-mode second execute: await this.twin.execute(test.operation) for structural baseline rather than baselineResponse = twinResponse (trivial self-comparison)"
    - "comparisonMode:'exact' respected in twin mode for deterministic error tests"
    - "Admin token seed via app.inject() in Slack conformance adapter (consistent with in-process pattern)"
    - "BROAD_SCOPE constant hardcoded in adapter (not allScopesString() import) — avoids coupling conformance to twin internals"
    - "extensions.cost stripped from Shopify normalizer stripFields to handle non-deterministic rate-limit bucket across two independent twin calls"

key-files:
  created: []
  modified:
    - packages/conformance/src/runner.ts
    - twins/slack/conformance/adapters/twin-adapter.ts
    - twins/slack/conformance/suites/chat.conformance.ts
    - twins/shopify/conformance/normalizer.ts

key-decisions:
  - "Twin-mode baseline is now a second await this.twin.execute(test.operation) call — validates shape consistency across two independent calls, catches twin non-determinism bugs that self-comparison masks"
  - "Twin-mode comparison branch split: 'exact' comparisonMode uses compareResponses, default uses compareResponsesStructurally; offline mode unchanged (exact comparison against fixture)"
  - "Slack adapter uses app.inject() not fetch() for admin token seed — consistent with in-process testing pattern used throughout the adapter"
  - "Admin token body requires token/tokenType/teamId/userId/scope/appId — NOT token/team_id/bot_user_id/scope as suggested in plan (plan body format was for external fetch pattern, not Fastify inject)"
  - "extensions.cost stripped in Shopify normalizer: rate-limit bucket changes between two independent twin-mode calls; stripping the whole cost object is correct since all cost fields are call-sequence-dependent"

patterns-established:
  - "Twin-mode conformance: second execute call for structural baseline — not self-comparison"
  - "Conformance normalizer must strip all call-sequence-dependent fields when twin mode runs two independent calls"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-03-14
---

# Phase 37 Plan 03: Conformance Rigor Summary

**Conformance runner twin-mode fixed to compare two independent execute calls structurally; Slack adapter seeds 16-scope token via admin endpoint; misleading chat-update test accurately relabeled as chat-postMessage-second**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-14T05:12:25Z
- **Completed:** 2026-03-14T05:24:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Conformance runner twin mode no longer self-compares: second `await this.twin.execute(test.operation)` call provides a real structural baseline
- Twin comparison branch split: exact tests use `compareResponses`, default uses `compareResponsesStructurally`, offline unchanged
- Slack adapter now seeds a 16-scope BROAD_SCOPE token via `app.inject()` to `/admin/tokens` instead of the narrow OAuth flow (chat:write only)
- chat.conformance.ts test `chat-update` (which called postMessage) renamed to `chat-postMessage-second` with accurate description; setup field removed
- Shopify normalizer adds `extensions.cost` to stripFields to handle non-deterministic rate-limit bucket across two independent twin-mode calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix conformance runner twin-mode** - `1db45ab` (fix)
2. **Task 2: Fix Slack adapter broad scope + chat labeling** - `3e138ea` (fix)

**Plan metadata:** (final commit — docs)

## Files Created/Modified

- `packages/conformance/src/runner.ts` - Twin mode: second execute call for structural baseline; split comparison branch (twin vs offline)
- `twins/slack/conformance/adapters/twin-adapter.ts` - Replace OAuth flow with admin token seed; BROAD_SCOPE 16 scopes via app.inject()
- `twins/slack/conformance/suites/chat.conformance.ts` - Rename chat-update to chat-postMessage-second; update suite description
- `twins/shopify/conformance/normalizer.ts` - Add extensions.cost to stripFields (non-deterministic across twin-mode calls)

## Decisions Made

- Twin-mode baseline is now a second `await this.twin.execute(test.operation)` call rather than `baselineResponse = twinResponse`. This validates shape consistency across two independent calls.
- Twin comparison branch is split: `comparisonMode === 'exact'` uses `compareResponses` (bit-exact), default uses `compareResponsesStructurally` (shape only). Offline mode remains exact comparison against fixture — unchanged.
- Slack adapter uses `app.inject()` not `fetch()` for admin token seeding. The plan suggested a `fetch()` pattern (matching external seeders), but the adapter is in-process, so inject() is correct and consistent.
- The admin `/admin/tokens` endpoint requires all 6 fields: `token`, `tokenType`, `teamId`, `userId`, `scope`, `appId`. The plan's suggested body omitted `tokenType` and `appId` — corrected to match the actual endpoint schema.
- `extensions.cost` stripped from Shopify normalizer because the rate-limit bucket value changes between the two independent twin-mode execute calls. Stripping the whole cost subtree is correct — all fields inside are call-sequence-dependent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Shopify conformance normalizer missing extensions.cost strip for twin-mode non-determinism**
- **Found during:** Task 1 + 2 verification (Shopify conformance:twin run)
- **Issue:** Twin-mode now calls execute twice (as planned), but the Shopify rate-limit bucket changes between calls. `body.extensions.cost.throttleStatus.currentlyAvailable` is non-deterministic and was causing a FAIL on the "Product creation returns userErrors for missing title" test after the second-call fix was applied. The normalizer's `stripFields` did not include `extensions.cost`.
- **Fix:** Added `'extensions.cost'` to `shopifyNormalizer.stripFields` in `twins/shopify/conformance/normalizer.ts`. This strips all rate-limit cost data (requestedQueryCost, actualQueryCost, throttleStatus) before comparison in both structural and exact modes.
- **Files modified:** `twins/shopify/conformance/normalizer.ts`
- **Verification:** `pnpm --filter @dtu/twin-shopify conformance:twin` passes 10/10 after fix.
- **Committed in:** `3e138ea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Necessary fix: the normalizer gap was directly caused by the planned second-call change. No scope creep.

## Issues Encountered

- Admin token seed body format: the plan suggested `{ token, team_id, bot_user_id, scope }` (external fetch pattern from seeders.ts), but the actual `/admin/tokens` endpoint schema requires `{ token, tokenType, teamId, userId, scope, appId }` — corrected to match the endpoint.

## Next Phase Readiness

- Finding #12 (conformance self-comparison) is now GREEN: twin mode validates structural consistency across two independent calls
- Both `pnpm --filter @dtu/twin-shopify conformance:twin` and `pnpm --filter @dtu/twin-slack conformance:twin` pass (10/10 and 20/20 respectively)
- 2 expected RED billing tests remain (Plan 37-01 Wave 0 for Finding #11) — these are the remaining work for Phase 37
- Phase 37 Plan 03 is the final conformance rigor plan; only billing fidelity (Finding #11) remains

---
*Phase: 37-billing-fidelity-conformance-rigor*
*Completed: 2026-03-14*
