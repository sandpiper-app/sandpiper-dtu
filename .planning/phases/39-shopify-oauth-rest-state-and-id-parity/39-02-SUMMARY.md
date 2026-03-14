---
phase: 39-shopify-oauth-rest-state-and-id-parity
plan: 02
subsystem: auth
tags: [shopify, oauth, grant-type, token-exchange, client-credentials, refresh-token, smoke-test, vitest]

requires:
  - phase: 39-01
    provides: Wave 0 RED contract tests establishing grant-specific validation gaps
  - phase: 23-shopify-oauth-storefront
    provides: OAuth credential gate (hasExactTwinCredentials) and auth-code flow
  - phase: 36-shopify-behavioral-parity
    provides: Online token-exchange response shape with associated_user

provides:
  - Grant-specific request validation in POST /admin/oauth/access_token for all four grant types
  - Exact 400 invalid_request for malformed refresh_token, client_credentials, and token-exchange bodies
  - Exact error string for unsupported requested_token_type values
  - SHOP-16 smoke file proving begin/callback/tokenExchange plus versioned admin calls work

affects:
  - 39-03 (REST write/filter persistence — relies on correct OAuth for session seeding)
  - 39-04 (inventory/collection state — same session seeding dependency)
  - Phase 40 (conformance evidence — auth grant seams are correctness anchors)

tech-stack:
  added: []
  patterns:
    - "Grant-specific validation branch in oauth.ts: body.grant_type === 'X' chains before hasExactTwinCredentials"
    - "Smoke test pattern: auth.begin -> twin authorize redirect -> auth.callback -> admin API call"
    - "Token-exchange smoke: mintSessionToken -> auth.tokenExchange -> Graphql client query"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts
  modified:
    - twins/shopify/src/plugins/oauth.ts
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts

key-decisions:
  - "Validation branches use body.grant_type === '...' directly (not extracted variable) so the acceptance criteria grep pattern matches"
  - "Token-exchange validation order: subject_token first, then subject_token_type exact-match check, then requested_token_type allowlist check — matches RFC 8693 field priority"
  - "VALID_REQUESTED_TOKEN_TYPES is a Set defined inline inside the token-exchange branch — no module-level constant needed since it is only used in one place"
  - "Smoke file uses raw fetch() for admin REST and GraphQL routes (not SDK RestClient/Graphql) to prove the seams work at the HTTP layer with a versioned 2025-01 path"
  - "Wave 0 test assertions tightened from expect.any(String) to exact error: 'invalid_request' strings — no functional scope change, only assertion precision"

patterns-established:
  - "Pattern: extract grantType once, branch with body.grant_type === '...' in if-else chains before credential gate"
  - "Pattern: smoke test file imports only @shopify/shopify-api primitives and project helpers — no framework packages"

requirements-completed:
  - SHOP-16
  - SHOP-17

duration: 6min
completed: 2026-03-14
---

# Phase 39 Plan 02: OAuth Grant Validation and SHOP-16 Smoke Summary

**Grant-specific POST /admin/oauth/access_token validation with exact requested_token_type rejection, plus green SHOP-16 smoke proving begin/callback/tokenExchange against versioned admin routes**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-14T13:26:23Z
- **Completed:** 2026-03-14T13:32:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `oauth.ts` now branches by `body.grant_type` before the credential gate — malformed refresh_token, client_credentials, and token-exchange bodies return `400 invalid_request` with per-grant error descriptions
- Unsupported `requested_token_type` returns the exact error string: "requested_token_type must be urn:shopify:params:oauth:token-type:online-access-token or urn:shopify:params:oauth:token-type:offline-access-token"
- Wave 0 test assertions in `shopify-api-auth.test.ts` tightened from `expect.any(String)` to `{ error: 'invalid_request' }` exact assertions — 21/21 tests green
- New `shopify-app-framework-auth-smoke.test.ts` proves begin/callback and tokenExchange seams hit correct twin routes, and a post-auth session can GET `/admin/api/2025-01/products.json` and GraphQL-query `shop { name }` — 2/2 smoke tests green

## Task Commits

1. **Task 1: Grant-specific validation in oauth.ts + tight auth test assertions** — `83bb64e` (feat)
2. **Task 2: SHOP-16 smoke file — auth/admin seam coverage** — `1ab64e7` (feat)

## Files Created/Modified

- `twins/shopify/src/plugins/oauth.ts` — Four grant branches (client_credentials, refresh_token, token-exchange, auth-code) before credential gate; requested_token_type allowlist with exact error string
- `tests/sdk-verification/sdk/shopify-api-auth.test.ts` — Wave 0 assertions tightened to exact `invalid_request` outcomes; existing happy paths preserved
- `tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts` — New file: 2 smoke tests, no framework package imports, versioned admin REST + GraphQL calls

## Decisions Made

- Validation branches use `body.grant_type === '...'` directly rather than an extracted variable so the acceptance-criteria grep pattern hits the actual condition strings.
- Token-exchange validation checks `subject_token` presence first, then `subject_token_type` exact-URN match, then `requested_token_type` allowlist — matches RFC 8693 field priority ordering.
- `VALID_REQUESTED_TOKEN_TYPES` Set defined inline inside the token-exchange branch — not module-level; only one call site.
- Smoke file uses raw `fetch()` for the versioned admin REST and GraphQL calls rather than SDK client classes — proves the HTTP seam works with the actual path, not an SDK abstraction.
- Wave 0 test assertions tightened from `expect.any(String)` to exact `{ error: 'invalid_request' }` — no functional scope change, only assertion precision as required by plan.

## Deviations from Plan

None — plan executed exactly as written. The Wave 0 test file (`shopify-api-auth.test.ts`) already had the grant-specific test block from Plan 39-01 Wave 0 execution; Plan 39-02 tightened those assertions as directed without adding new describe blocks.

## Issues Encountered

None.

## Next Phase Readiness

- Plan 39-03 (order/customer canonical GIDs + REST write/filter persistence) can proceed — OAuth seam is now correct for all four grant types
- Plan 39-04 (inventory level and collection state) has no OAuth dependency; unblocked
- Phase 40 (verification evidence integrity) depends on 39 being complete; SHOP-16 + SHOP-17 are now satisfied by this plan

---
*Phase: 39-shopify-oauth-rest-state-and-id-parity*
*Completed: 2026-03-14*
