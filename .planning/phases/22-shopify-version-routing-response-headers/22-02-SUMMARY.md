---
phase: 22-shopify-version-routing-response-headers
plan: 02
subsystem: testing
tags: [shopify, sdk-verification, version-routing, response-headers, graphql, rest, storefront]

# Dependency graph
requires:
  - phase: 22-shopify-version-routing-response-headers/22-01
    provides: "Version-parameterized /admin/api/:version/ and /api/:version/graphql.json routes with X-Shopify-API-Version header echo"

provides:
  - "Helper factories that preserve requested API versions (no more 2024-01 normalization)"
  - "Dual-version SDK verification for admin GraphQL, admin REST, and Storefront (2024-01 and 2025-01)"
  - "Response header assertions proving x-shopify-api-version echoes the requested version"
  - "Version-aware Link header assertion: pagination URL contains the requested version, not a hardcoded 2024-01"

affects:
  - "22-03 (conformance harness)"
  - "23 (OAuth/Storefront phase — helpers are clean)"
  - "27 (conformance/coverage)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SDK helpers rewrite host only — no version normalization; twin routes :version natively"
    - "shopify-api canonicalizes header names to Title-Case arrays — use result.headers['X-Shopify-Api-Version'][0]"
    - "storefront-api-client response.headers is native Fetch Headers — use .get() via cast"

key-files:
  created: []
  modified:
    - tests/sdk-verification/helpers/shopify-client.ts
    - tests/sdk-verification/helpers/shopify-rest-client.ts
    - tests/sdk-verification/helpers/shopify-api-client.ts
    - tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts
    - tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts
    - tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts
    - tests/sdk-verification/sdk/shopify-api-rest-client.test.ts
    - tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts

key-decisions:
  - "Remove only version normalization from helpers; preserve host rewriting — twin now handles :version routing natively (Phase 22-01)"
  - "shopify-api canonicalizes response headers to Title-Case (X-Shopify-Api-Version) with array values — access via ['X-Shopify-Api-Version'][0] not ['x-shopify-api-version']"
  - "storefront-api-client returns native Fetch Headers object (not canonicalized Record) — use .get() cast to Headers for version assertion"

patterns-established:
  - "Version echo assertions: use raw .fetch() for admin-api-client (headers.get() works); use canonicalized key for shopify-api wrapper"
  - "Dual-version coverage pattern: one test each for 2024-01 and 2025-01 proves twin routes both versions correctly"

requirements-completed:
  - SHOP-17
  - SHOP-22
  - SHOP-23

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 22 Plan 02: SDK Helper Version Normalization Removal and Verification Expansion Summary

**Removed 2024-01 version shims from all three Shopify SDK helpers and expanded verification to prove x-shopify-api-version echo and version-aware Link headers across admin GraphQL, admin REST, and Storefront paths**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T16:16:00Z
- **Completed:** 2026-03-12T16:24:48Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Deleted the `.replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/')` workaround from all three helpers — version pass-through is now pure
- Added dual-version (2024-01 and 2025-01) live-twin tests for admin GraphQL, admin REST, and Storefront clients
- Proved `x-shopify-api-version` echo across all SDK surfaces; discovered and documented the shopify-api header canonicalization pattern (Title-Case Record vs native Fetch Headers)
- Added version-aware Link header assertion: `result.pageInfo.nextPageUrl` contains `/admin/api/2025-01/` — proving the REST pagination URL is version-accurate, not hardcoded

## Task Commits

1. **Task 1: Remove helper-side version normalization** - `450934d` (feat)
2. **Task 2: Expand SDK verification coverage** - `2b2022a` (feat)

**Plan metadata:** (docs commit recorded after SUMMARY creation)

## Files Created/Modified

- `tests/sdk-verification/helpers/shopify-client.ts` — removed version rewrite; updated comments to describe host-rewrite-only behavior
- `tests/sdk-verification/helpers/shopify-rest-client.ts` — same version rewrite removal for REST helper
- `tests/sdk-verification/helpers/shopify-api-client.ts` — removed both admin and Storefront version normalizations; updated comment
- `tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts` — added fetch() with 2024-01 and 2025-01 asserting x-shopify-api-version echo
- `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` — added dual-version get() assertions and version-aware Link header test
- `tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts` — added GraphqlClient with ApiVersion.January25 asserting canonicalized X-Shopify-Api-Version header
- `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — added dual-version headers assertions and version-aware pageInfo.nextPageUrl assertion
- `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` — added non-2024-01 version success test and x-shopify-api-version echo assertion

## Decisions Made

- **Header access pattern for shopify-api SDK:** The `@shopify/shopify-api` `GraphqlClient` and `RestClient` wrappers call `canonicalizeHeaders(Object.fromEntries(response.headers.entries()))` before returning. This converts `x-shopify-api-version` to `X-Shopify-Api-Version` (Title-Case) and stores it as `string[]`. Use `result.headers['X-Shopify-Api-Version'][0]`.
- **Header access pattern for storefront-api-client:** The `StorefrontClient` returns the raw `graphql-client` `ClientResponse` where `headers` is the native Fetch `Headers` object. Use `.get('x-shopify-api-version')` via a cast to `Headers`.
- **No token/session changes:** Removed only the URL path version normalization. Token behavior, session construction, and all other test helper semantics unchanged.

## Deviations from Plan

None — plan executed exactly as written. The header access patterns required investigation (which key name and which access method) but that is implementation detail, not a plan deviation.

## Issues Encountered

Initial test failures on header assertions: used `response.headers?.['x-shopify-api-version']` but shopify-api canonicalizes header names to `X-Shopify-Api-Version` with array values. Fixed by inspecting the SDK source (`canonicalizeHeaders()` in `runtime/http/headers.js`). Storefront client uses native Fetch `Headers` — required a cast to call `.get()`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 22-01 twin work (version routing + headers) is fully validated end-to-end through real SDK surfaces
- All three Shopify SDK surfaces (admin-api-client GraphQL, admin-api-client REST, shopify-api Graphql/Rest/Storefront) are clean — no version shims remain
- Ready for Phase 22-03 (conformance harness version cleanup) and Phase 23 (OAuth/Storefront)

## Self-Check: PASSED

All files verified present. Both task commits verified in git log.

---
*Phase: 22-shopify-version-routing-response-headers*
*Completed: 2026-03-12*
