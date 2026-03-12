---
phase: 23-shopify-oauth-storefront
plan: "01"
subsystem: auth
tags: [shopify, oauth, fastify, sqlite, hmac, sdk-verification]

# Dependency graph
requires:
  - phase: 22-shopify-version-routing-response-headers
    provides: version-parameterized Shopify routes and the SDK host-rewrite harness used by the auth tests
provides:
  - oauth_codes SQLite storage with 60-second one-time code consumption
  - token_type-aware Shopify tokens and validation results
  - GET /admin/oauth/authorize redirect with Shopify-style HMAC callback params
  - tightened POST /admin/oauth/access_token validation with replay protection and grant-type passthrough
  - SDK auth verification coverage for real authorize redirects and SHOP-18 validation failures
affects: [23-02-storefront-schema-separation, 24-shopify-rest-persistence-billing-rate-limiting, sdk-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shopify OAuth callback signing uses SHA-256 hex over URLSearchParams-sorted params, excluding hmac/signature"
    - "Authorization codes are persisted in StateManager and consumed exactly once with a 60-second TTL"
    - "Admin OAuth tightening preserves client_credentials, refresh_token, and token-exchange flows via explicit grant-type branching"

key-files:
  created:
    - .planning/phases/23-shopify-oauth-storefront/23-01-SUMMARY.md
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/plugins/oauth.ts
    - twins/shopify/src/services/token-validator.ts
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts

key-decisions:
  - "token_type was added to Shopify tokens now so Phase 23-02 can distinguish admin and storefront auth without another schema migration"
  - "GET /admin/oauth/authorize signs callback params with a module-level API secret defaulting to test-api-secret to match the SDK harness"
  - "POST /admin/oauth/access_token validates auth-code requests but explicitly bypasses code checks for client_credentials, refresh_token, and token-exchange grants to avoid regressions"
  - "SDK callback tests now fetch the twin authorize redirect and reuse its real code/hmac params instead of fabricating callback query strings"

patterns-established:
  - "Pattern: Shopify auth callback tests should follow the twin's real authorize redirect and reuse its returned code/hmac/state params instead of fabricating callback query strings"

requirements-completed: [SHOP-18]

# Metrics
duration: 13min
completed: 2026-03-12
---

# Phase 23 Plan 01: OAuth foundation Summary

**Shopify twin OAuth now issues real authorize redirects with HMAC-signed callback params, one-time code validation, and SDK coverage for replay/empty-body failures**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-12T17:35:17Z
- **Completed:** 2026-03-12T17:48:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `oauth_codes` storage plus `token_type` support in `StateManager`, including 60-second expiry and single-use consumption semantics
- Implemented `GET /admin/oauth/authorize` with Shopify-compatible HMAC callback signing and tightened `POST /admin/oauth/access_token` for auth-code validation and replay rejection
- Updated the SDK auth verification suite so callback tests use the twin's real authorize redirect and SHOP-18 validation cases cover empty-body, missing-field, unknown-code, replay, and `client_credentials` behavior

## Task Commits

1. **Task 1: StateManager oauth_codes table + token_type plumbing** - `f64cb7e` (feat)
2. **Task 2: OAuth authorize flow, tightened access_token, and auth test updates** - `8018039` (feat)

**Plan metadata:** (docs commit recorded after SUMMARY creation)

## Files Created/Modified

- `packages/state/src/state-manager.ts` - adds the `oauth_codes` table, `token_type` migration, token-type-aware token inserts, and one-time code storage/consumption helpers
- `twins/shopify/src/plugins/admin.ts` - lets `/admin/tokens` seed explicit token types
- `twins/shopify/src/plugins/oauth.ts` - adds `/admin/oauth/authorize` and hardens `/admin/oauth/access_token`
- `twins/shopify/src/services/token-validator.ts` - returns `tokenType` alongside token validity and shop domain
- `tests/sdk-verification/sdk/shopify-api-auth.test.ts` - rewrites callback coverage to use the real authorize redirect and adds SHOP-18 validation cases

## Verification Results

- `pnpm exec vitest run --project sdk-verification tests/sdk-verification/sdk/shopify-api-auth.test.ts` — 12 tests passed
- `pnpm -r --filter @dtu/state --filter @dtu/twin-shopify run build` — both packages built successfully

## Decisions Made

- **Introduce `token_type` during OAuth work:** this avoids a second migration when Storefront auth separation lands in Plan 23-02.
- **Keep preserved grants permissive:** `client_credentials`, `refresh_token`, and token-exchange flows still mint admin tokens immediately so existing SDK helpers continue to work.
- **Use the twin's real authorize redirect in tests:** pulling code/hmac/state from the redirect avoids duplicating signing logic in the test suite and exercises the production path directly.
- **Keep auth-code validation scoped to non-passthrough grants:** authorization-code requests now require `client_id`, `client_secret`, and a one-time code, but the existing `client_credentials`, token-exchange, and refresh-token flows stay permissive to avoid SDK regressions.

## Deviations from Plan

None in the implementation itself. The shipped code matches the plan's requested schema, routes, and tests.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The code needed for SHOP-18 is in place and Phase 23-02 can build on `token_type` and the hardened admin OAuth flow.
- Ready for Storefront schema separation and admin-token rejection on `/api/:version/graphql.json`.

## Self-Check: PASSED

- **Found:** `.planning/phases/23-shopify-oauth-storefront/23-01-SUMMARY.md`
- **Found:** `packages/state/src/state-manager.ts`
- **Found:** `twins/shopify/src/plugins/admin.ts`
- **Found:** `twins/shopify/src/plugins/oauth.ts`
- **Found:** `twins/shopify/src/services/token-validator.ts`
- **Found:** `tests/sdk-verification/sdk/shopify-api-auth.test.ts`
- **Verified commits:** `f64cb7e`, `8018039`

---
*Phase: 23-shopify-oauth-storefront*
*Completed: 2026-03-12*
