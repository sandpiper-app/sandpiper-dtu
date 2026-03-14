---
phase: 36-shopify-behavioral-parity
plan: 02
subsystem: api
tags: [shopify, oauth, rest, token-exchange, access-scopes, tdd]

# Dependency graph
requires:
  - phase: 36-shopify-behavioral-parity
    provides: "Plan 01 Wave 0 RED tests: 9 failing tests establish TDD contract for Plans 02-04"
provides:
  - "Finding #7 closed: tokenExchange with OnlineAccessToken yields session.isOnline === true"
  - "Finding #8 (access_scopes) closed: GET /admin/oauth/access_scopes.json returns { access_scopes: [...] } with auth"
  - "OAuthOnlineTokenResponse interface with associated_user block"
  - "requested_token_type branch in POST /admin/oauth/access_token handler"
affects: [36-03, 36-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Online vs offline token issuance: check grant_type + requested_token_type before building response shape"
    - "accessToken request header auth pattern for oauth sub-routes (x-shopify-access-token via validateAccessToken)"

key-files:
  created: []
  modified:
    - twins/shopify/src/plugins/oauth.ts
    - tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts

key-decisions:
  - "Route /admin/oauth/access_scopes.json is the correct path: admin-api-client's generateApiUrlFormatter only prepends admin/api/:version/ when the path does NOT start with 'admin', so /admin/oauth/... is used verbatim"
  - "AccessScope.all() returns { data: AccessScope[] } not { body } — SDK baseFind wraps response through createInstancesFromResponse; test was using wrong destructuring key and fixed per Rule 1"
  - "OAuthOnlineTokenResponse is a separate interface (not a union extension) because the two shapes differ structurally: offline has { access_token, scope }, online adds expires_in + associated_user_scope + associated_user"
  - "validateAccessToken imported from services/token-validator.js reused for access_scopes auth check, consistent with rest.ts pattern"

patterns-established:
  - "Token type branch pattern: isOnlineTokenExchange = grant_type === token-exchange URN AND requested_token_type === online URN"

requirements-completed:
  - Finding-7
  - Finding-8

# Metrics
duration: 7min
completed: 2026-03-14
---

# Phase 36 Plan 02: Shopify Behavioral Parity Summary

**OAuth online token differentiation (associated_user branch) + authenticated GET /admin/oauth/access_scopes.json; Finding #7 and Finding #8 access_scopes tests GREEN**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T03:35:06Z
- **Completed:** 2026-03-14T03:42:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `requested_token_type` field to `OAuthTokenRequestBody` and `OAuthOnlineTokenResponse` interface
- Replaced `issueAccessToken()` helper with inline online/offline branch: OnlineAccessToken grants return `associated_user` so `session.isOnline === true`
- Added `GET /admin/oauth/access_scopes.json` route with `validateAccessToken` auth check returning 6 scope handles
- Fixed test assertion: `AccessScope.all()` returns `{ data }` not `{ body }` — SDK wraps via `createInstancesFromResponse`
- 258/264 tests passing (6 RED remaining for Plans 03-04); 0 pre-existing regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix OAuth online token response + add access_scopes route** - `e526065` (feat)

**Plan metadata:** (pending — created with docs commit)

## Files Created/Modified
- `twins/shopify/src/plugins/oauth.ts` - Added OAuthOnlineTokenResponse interface, requested_token_type field, online/offline token branch, GET /admin/oauth/access_scopes.json route, validateAccessToken import
- `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts` - Fixed AccessScope.all() test to destructure { data } not { body }

## Decisions Made

- **Route path for access_scopes:** `GET /admin/oauth/access_scopes.json` is correct. The `@shopify/admin-api-client` `generateApiUrlFormatter` only prepends `admin/api/:version/` when `cleanPath` does NOT start with `'admin'`. Since `AccessScope.customPrefix = "/admin/oauth"`, the cleaned path is `admin/oauth/access_scopes.json` which already starts with `admin` — the version prefix is skipped. Route registered directly at `/admin/oauth/access_scopes.json`.

- **Test fix for AccessScope.all():** The SDK's `Base.baseFind()` returns `{ data: AccessScope[], headers, pageInfo }`. The test used `const { body } = await AccessScope.all(...)` which is always `undefined`. Fixed to `const { data } = await AccessScope.all(...)` and assert `data.length > 0` and `data[0].handle` is truthy.

- **Separate OAuthOnlineTokenResponse interface:** Not extended from OAuthTokenResponse — the shapes differ enough that a clean separate interface is clearer. Fastify reply type union extended to include both.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AccessScope test destructuring: { body } → { data }**
- **Found during:** Task 1 (verification run after route implementation)
- **Issue:** Test `shopify-behavioral-parity.test.ts` line 98 did `const { body } = await shopify.rest.AccessScope.all(...)`. The SDK's `baseFind` returns `{ data, headers, pageInfo }` — `body` is always `undefined`. The route was correctly returning `{ access_scopes: [...] }` and the SDK was building `AccessScope` instances in `data`, but the assertion against `body.access_scopes` always failed with `Cannot read properties of undefined`.
- **Fix:** Changed to `const { data } = await ...` and assert `Array.isArray(data)`, `data.length > 0`, and `data[0].handle` is truthy (since each AccessScope instance gets its `handle` field from the response).
- **Files modified:** `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts`
- **Verification:** AccessScope.all() test now GREEN; data.length is 6 (one per scope in ADMIN_SCOPES)
- **Committed in:** e526065 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - test assertion bug)
**Impact on plan:** Fix necessary for correctness — the route implementation was correct, only the test assertion needed updating. Same behavioral outcome verified.

## Issues Encountered
- AccessScope.all() returned `{ data }` not `{ body }` from SDK baseFind — required test assertion fix per Rule 1.

## Next Phase Readiness
- Plan 03 target: Finding #8 remaining routes (Location.all/find, InventoryLevel.adjust) — 3 tests to turn green
- Plan 04 targets: Finding #9 (GID round-trip verification) + Finding #10 (since_id, ids filters) — 4 tests to turn green
- No blockers; wave 0 RED contract reduces to 6 failing tests

---
*Phase: 36-shopify-behavioral-parity*
*Completed: 2026-03-14*
