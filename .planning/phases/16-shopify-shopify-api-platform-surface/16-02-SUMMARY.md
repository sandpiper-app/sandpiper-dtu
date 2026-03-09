---
phase: 16-shopify-shopify-api-platform-surface
plan: "02"
subsystem: testing

tags: [shopify-api, session, jwt, jose, vitest, tdd, getCurrentId, decodeSessionToken]

# Dependency graph
requires:
  - phase: 16-shopify-shopify-api-platform-surface
    provides: "createShopifyApiClient() factory + mintSessionToken() helper from Plan 16-01"

provides:
  - "SHOP-11: 7 passing tests for shopify.session.decodeSessionToken, getOfflineId, getJwtSessionId, customAppSession, getCurrentId"
  - "Verified: decodeSessionToken validates HS256 JWT signature and aud claim; throws for tampered or wrong-aud tokens"
  - "Verified: pure utility functions (getOfflineId/getJwtSessionId) return correct formatted strings"
  - "Verified: customAppSession creates Session with correct shop and isOnline=false"
  - "Verified: getCurrentId extracts JWT session ID from Bearer Authorization header (requires isEmbeddedApp: true)"
  - "Fixed: vitest.config.ts globalSetup absolute path resolution for vitest 3.x project workspace mode"

affects:
  - 16-03
  - 16-04
  - 16-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getCurrentId requires isEmbeddedApp: true to read Authorization header; isEmbeddedApp: false falls back to cookie extraction"
    - "embeddedShopify instance pattern: separate createShopifyApiClient({ isEmbeddedApp: true }) for JWT-based session tests"
    - "vitest globalSetup absolute path: use resolve(__dirname, 'setup/global-setup.ts') in project configs run via workspace root"

key-files:
  created:
    - "tests/sdk-verification/sdk/shopify-api-session.test.ts"
  modified:
    - "tests/sdk-verification/vitest.config.ts (globalSetup absolute path fix)"

key-decisions:
  - "getCurrentId requires isEmbeddedApp: true for JWT Bearer header extraction — with isEmbeddedApp: false, function falls back to cookie-based session ID and ignores Authorization header entirely"
  - "Separate embeddedShopify instance created in beforeAll for getCurrentId test — avoids changing the default isEmbeddedApp setting for tests 1-6 which don't require embedded mode"
  - "vitest globalSetup path fixed from './setup/global-setup.ts' to resolve(__dirname, 'setup/global-setup.ts') — vitest 3.x resolves globalSetup relative to CWD (project root) when config is in a sub-directory, not relative to the config file"

patterns-established:
  - "isEmbeddedApp: true required for Authorization-header-based session tests (getCurrentId pattern)"
  - "Multiple shopify client instances in beforeAll for tests requiring different config flags"

requirements-completed:
  - SHOP-11

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 16 Plan 02: shopify-api session helper tests (SHOP-11)

**7 in-process SHOP-11 tests verifying decodeSessionToken (HS256 validation + aud/signature rejection), getOfflineId/getJwtSessionId formatters, customAppSession, and getCurrentId JWT extraction via Authorization Bearer header**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T20:53:59Z
- **Completed:** 2026-03-09T20:58:51Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `tests/sdk-verification/sdk/shopify-api-session.test.ts` with 7 pure in-process SHOP-11 tests; all green
- Verified decodeSessionToken correctly accepts a valid HS256 JWT and throws for a tampered signature or wrong aud claim
- Verified getOfflineId, getJwtSessionId, and customAppSession return the exact expected values
- Verified getCurrentId extracts `'dev.myshopify.com_1'` from a Bearer JWT Authorization header (using an embedded shopify instance)
- Fixed a pre-existing `vitest.config.ts` bug where `globalSetup` path resolved from CWD (project root) instead of config file location under vitest 3.x workspace project mode

## Task Commits

Each task was committed atomically:

1. **Task 1: shopify-api-session.test.ts — SHOP-11 session helpers (7 tests)** - `6a73d5e` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD approach — tests written first, then corrected GREEN after discovering isEmbeddedApp requirement for getCurrentId._

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-api-session.test.ts` — SHOP-11 session helper test suite (7 tests across 3 describe blocks)
- `tests/sdk-verification/vitest.config.ts` — Fixed globalSetup path to use `resolve(__dirname, ...)` for absolute resolution

## Decisions Made

- `getCurrentId` requires `isEmbeddedApp: true` to extract session ID from the Authorization header. With the default `isEmbeddedApp: false`, the function checks cookies instead and returns `undefined` when no cookie is present. A separate `embeddedShopify` instance is created in `beforeAll` for Test 7.
- `vitest.config.ts` globalSetup path fixed: in vitest 3.x when running via workspace project mode (root config points to `tests/*`), `./setup/global-setup.ts` resolves relative to CWD (project root), not the config file at `tests/sdk-verification/`. Fixed with `resolve(__dirname, 'setup/global-setup.ts')` using `fileURLToPath(import.meta.url)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vitest.config.ts globalSetup absolute path**
- **Found during:** Task 1 (running tests for the first time)
- **Issue:** `globalSetup: ['./setup/global-setup.ts']` resolved relative to process CWD (project root) under vitest 3.x workspace project mode, resulting in `Cannot find module '...sandpiper-dtu/setup/global-setup.ts'` — missing `tests/sdk-verification/` prefix
- **Fix:** Changed to `resolve(__dirname, 'setup/global-setup.ts')` with `fileURLToPath(import.meta.url)` to get the absolute path of the config file's directory
- **Files modified:** tests/sdk-verification/vitest.config.ts
- **Verification:** Full sdk-verification suite runs (10 test files, 54 tests pass)
- **Committed in:** 6a73d5e (Task 1 commit)

**2. [Rule 1 - Bug] Used isEmbeddedApp: true for getCurrentId test**
- **Found during:** Task 1 (Test 7 returned undefined)
- **Issue:** `shopify.session.getCurrentId` with `isEmbeddedApp: false` (the default) falls back to cookie extraction and ignores the Authorization header. Test 7 returned `undefined` because no cookie was set.
- **Fix:** Created a separate `embeddedShopify = createShopifyApiClient({ isEmbeddedApp: true })` instance in `beforeAll` for the getCurrentId describe block. This matches the SDK's design: embedded apps use JWT in Authorization header; non-embedded apps use signed session cookies.
- **Files modified:** tests/sdk-verification/sdk/shopify-api-session.test.ts
- **Verification:** Test 7 now returns `'dev.myshopify.com_1'` as expected; all 7 tests pass
- **Committed in:** 6a73d5e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were required for correctness — the globalSetup bug prevented any tests from running; the isEmbeddedApp bug caused Test 7 to silently return undefined instead of the expected session ID.

## Issues Encountered

None beyond the two auto-fixed bugs documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SHOP-11 satisfied — all session helpers verified (decodeSessionToken, getOfflineId, getJwtSessionId, customAppSession, getCurrentId)
- `isEmbeddedApp: true` pattern established for getCurrentId tests — Plan 16-03 auth tests will need this
- vitest.config.ts globalSetup path bug fixed — all future plans running the sdk-verification suite will work correctly
- Next: Plan 16-03 (SHOP-10 OAuth begin/callback + session persistence via live twin)

## Self-Check: PASSED

- `tests/sdk-verification/sdk/shopify-api-session.test.ts` — FOUND
- `tests/sdk-verification/vitest.config.ts` — FOUND (modified)
- `.planning/phases/16-shopify-shopify-api-platform-surface/16-02-SUMMARY.md` — FOUND
- Commit `6a73d5e` (Task 1: session tests + vitest config fix) — FOUND
- All 7 SHOP-11 tests pass; full sdk-verification suite 54 tests pass

---
*Phase: 16-shopify-shopify-api-platform-surface*
*Completed: 2026-03-09*
