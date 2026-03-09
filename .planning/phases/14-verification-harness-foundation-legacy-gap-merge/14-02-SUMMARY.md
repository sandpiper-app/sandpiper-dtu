---
phase: 14-verification-harness-foundation-legacy-gap-merge
plan: "02"
subsystem: testing
tags: [vitest, sdk-verification, shopify, slack, globalSetup, typescript]

requires:
  - phase: 14-verification-harness-foundation-legacy-gap-merge-01
    provides: Slack twin admin plugin and base infrastructure for seeding

provides:
  - Vitest workspace project for sdk-verification (tests/sdk-verification/vitest.config.ts)
  - Dual-twin global setup lifecycle (tests/sdk-verification/setup/global-setup.ts)
  - Shared fixture seeding helpers (tests/sdk-verification/setup/seeders.ts)
  - Shopify SDK client wired to local twin (tests/sdk-verification/helpers/shopify-client.ts)
  - Slack WebClient wired to local twin (tests/sdk-verification/helpers/slack-client.ts)
  - test:sdk, coverage:generate, drift:check scripts in root package.json
  - POST /admin/tokens endpoint in Slack twin for deterministic token seeding

affects:
  - All Phase 14-20 SDK conformance test plans (depend on this scaffold)
  - tests/sdk-verification (all test files in this project)

tech-stack:
  added:
    - tsx ^4.0.0 (devDependency for standalone script execution)
  patterns:
    - Vitest globalSetup named exports (setup/teardown) for dual-twin lifecycle
    - customFetchApi URL rewriting pattern for Shopify SDK twin wiring
    - slackApiUrl constructor option pattern for Slack WebClient twin wiring
    - ctx.provide() + process.env dual propagation for worker compatibility
    - Direct token seeding via /admin/tokens (bypasses OAuth dynamic generation)

key-files:
  created:
    - tests/sdk-verification/vitest.config.ts
    - tests/sdk-verification/setup/global-setup.ts
    - tests/sdk-verification/setup/seeders.ts
    - tests/sdk-verification/helpers/shopify-client.ts
    - tests/sdk-verification/helpers/slack-client.ts
  modified:
    - package.json (added test:sdk, coverage:generate, drift:check scripts and tsx devDependency)
    - twins/slack/src/plugins/admin.ts (added POST /admin/tokens route)

key-decisions:
  - "POST /admin/tokens added to Slack twin admin plugin: direct slackStateManager.createToken() call produces deterministic token values; OAuth flow (/api/oauth.v2.access) returns dynamic tokens that would break auth.test lookups"
  - "Both ctx.provide() and process.env used in globalSetup for SHOPIFY_API_URL/SLACK_API_URL: process.env mutations propagate to workers in Vitest 3.x; ctx.provide/inject() adds compatibility for future worker isolation modes"
  - "Version normalization in customFetchApi replaces /admin/api/[version]/ with /admin/api/2024-01/: twin only serves this version, SDK passes caller-specified version in URL, surgical rewrite avoids any twin route changes"
  - "tsx ^4.0.0 added as devDependency: coverage:generate and drift:check are standalone tsx scripts in Plans 05; declaring the dep makes CI execution autonomous"

patterns-established:
  - "SDK URL rewriting: customFetchApi performs host swap (https→http) then version normalization in separate passes"
  - "Twin seeding hierarchy: resetXxx() for state reset, seedXxx() for deterministic fixture creation, both callable in beforeEach"
  - "globalSetup env-var guard: if SHOPIFY_API_URL set use it directly; otherwise boot twin in-process on port 0"

requirements-completed:
  - INFRA-13
  - INFRA-15

duration: 20min
completed: "2026-03-09"
---

# Phase 14 Plan 02: SDK Verification Scaffold Summary

**Vitest sdk-verification workspace project with dual-twin globalSetup, Shopify customFetchApi rewriting, Slack slackApiUrl wiring, and deterministic token seeding via POST /admin/tokens**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-09T12:00:00Z
- **Completed:** 2026-03-09T12:20:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created `tests/sdk-verification/` Vitest workspace project discoverable via `pnpm test:sdk`
- Built dual-twin global setup that boots Shopify and Slack twins in-process on random ports with env var override support for CI
- Added `createShopifyClient()` with customFetchApi URL rewriting (host swap + version normalization to `/admin/api/2024-01/`)
- Added `createSlackClient()` with `slackApiUrl` trailing-slash guarantee
- Added `POST /admin/tokens` to Slack twin admin plugin for deterministic token seeding

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Vitest workspace project config and global setup** - `4ff77f6` (feat)
2. **Task 2: Create SDK client helpers and add test:sdk script** - `1008678` (feat)

**Plan metadata:** (final commit — docs)

## Files Created/Modified

- `tests/sdk-verification/vitest.config.ts` - Vitest project config with globalSetup reference, 30s timeouts, node environment
- `tests/sdk-verification/setup/global-setup.ts` - Named setup/teardown exports; boots Shopify+Slack twins in-process, resets both after boot
- `tests/sdk-verification/setup/seeders.ts` - resetShopify, resetSlack, seedShopifyAccessToken (via OAuth), seedSlackBotToken (via /admin/tokens)
- `tests/sdk-verification/helpers/shopify-client.ts` - createShopifyClient() wrapping @shopify/admin-api-client with customFetchApi
- `tests/sdk-verification/helpers/slack-client.ts` - createSlackClient() wrapping @slack/web-api WebClient with slackApiUrl
- `package.json` - Added test:sdk, coverage:generate, drift:check scripts; tsx ^4.0.0 devDependency
- `twins/slack/src/plugins/admin.ts` - Added POST /admin/tokens route calling slackStateManager.createToken()

## Decisions Made

- **POST /admin/tokens for Slack**: The OAuth flow returns a dynamically generated token that would not match a hardcoded expected value seeded before the call. The admin endpoint directly calls `slackStateManager.createToken()` with an exact known value, making the token deterministic and safe for auth.test assertions.

- **Dual propagation (process.env + ctx.provide)**: Vitest 3.x propagates `process.env` mutations from globalSetup to worker threads. `ctx.provide()` is added for forward compatibility with potential worker isolation modes. Both mechanisms set the same values, so no conflict arises.

- **Version normalization via customFetchApi**: The Shopify twin only serves `/admin/api/2024-01/graphql.json`. The SDK constructs URLs with the `apiVersion` passed at construction time. Rather than changing the twin or restricting callers to `2024-01`, the rewrite in `customFetchApi` normalizes any version string in-flight. This keeps the twin unchanged and lets test code pass any valid version string.

- **tsx devDependency declaration**: The coverage:generate and drift:check scripts (Plans 05+) are standalone tsx scripts. Declaring `tsx ^4.0.0` in devDependencies ensures `pnpm install` installs it without requiring the user to add it manually.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added POST /admin/tokens to Slack twin admin plugin**
- **Found during:** Task 1 (global-setup and seeders creation)
- **Issue:** The plan explicitly stated this route was missing from twins/slack/src/plugins/admin.ts and must be added as part of this task. Without it, `seedSlackBotToken()` would fail with 404.
- **Fix:** Added `POST /admin/tokens` route to admin plugin calling `fastify.slackStateManager.createToken(token, tokenType, teamId, userId, scope, appId)` and returning `{ ok: true }`. Added 400 validation for missing required fields.
- **Files modified:** twins/slack/src/plugins/admin.ts
- **Verification:** Route matches seeders.ts request body shape; createToken signature verified in slack-state-manager.ts.
- **Committed in:** 4ff77f6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The deviation was explicitly anticipated and specified in the plan task body. No scope creep.

## Issues Encountered

- `npx tsx -e "import { ... } from './file.js'"` fails with CJS module resolver when using `.js` extension for TypeScript sources in inline eval mode — this is a known tsx limitation with `-e` flag, not a code issue. Type-checking via `tsc --noEmit` confirmed both helper files are syntactically and type-correct.

## User Setup Required

None - no external service configuration required. All twins boot in-process during `pnpm test:sdk`.

## Next Phase Readiness

- sdk-verification scaffold is complete and discoverable
- All Phases 14-20 SDK conformance test plans can now import from `tests/sdk-verification/helpers/` and `tests/sdk-verification/setup/`
- `pnpm test:sdk` runs only the sdk-verification project
- No blockers

---
*Phase: 14-verification-harness-foundation-legacy-gap-merge*
*Completed: 2026-03-09*
