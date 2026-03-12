---
phase: 22-shopify-version-routing-response-headers
verified: 2026-03-12T18:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 22: Shopify Version Routing & Response Headers Verification Report

**Phase Goal:** Shopify twin accepts any valid API version string in route paths and echoes conformance headers, making all subsequent Shopify work version-agnostic and removing the test-harness URL rewriting workaround.

**Verified:** 2026-03-12T18:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | POST /admin/api/2025-01/graphql.json returns a GraphQL response instead of a 404 | VERIFIED | `graphql.ts` registers `/admin/api/:version/graphql.json`; `parseShopifyApiVersion` validates `:version`; integration tests assert both 2024-01 and 2025-01 return HTTP 200 with GraphQL data |
| 2  | POST /api/2025-01/graphql.json reuses the Storefront GraphQL execution path instead of requiring a fixed 2024-01 route | VERIFIED | `graphql.ts` registers `/api/:version/graphql.json` wrapper that rewrites to canonical `CANONICAL_ADMIN_GRAPHQL` before `yoga.fetch()`; SDK storefront tests assert 2025-01 success |
| 3  | Every admin and Storefront API response emitted by the Shopify twin includes X-Shopify-API-Version matching the request path version | VERIFIED | `setApiVersionHeader(reply, version)` called before auth/throttle branches in both graphql.ts handlers and in `parseVersionHeader()` in rest.ts; re-set after `yoga.fetch()` forwarding; integration.test.ts asserts header on 200 and 401 paths for both versions |
| 4  | GET /admin/api/2025-01/products.json?page_info=test returns a Link header whose URL also contains /admin/api/2025-01/ | VERIFIED | `rest.ts` builds `nextUrl` using `buildAdminApiPath(version, '/products.json')`; pagination.test.ts asserts `/admin/api/2024-01/products.json` and `/admin/api/2025-01/products.json` in Link header for respective version requests |
| 5  | No SDK verification helper rewrites /admin/api/{version}/ or /api/{version}/graphql.json back to 2024-01 | VERIFIED | `shopify-client.ts`, `shopify-rest-client.ts`, `shopify-api-client.ts` all contain only host rewriting; grep confirms zero `replace.*2024-01` patterns in sdk-verification/helpers |
| 6  | Admin GraphQL SDK tests prove both 2024-01 and 2025-01 requests succeed against the twin | VERIFIED | `shopify-admin-graphql-client.test.ts` contains dedicated tests: `fetch() with version 2024-01 returns x-shopify-api-version: 2024-01` and `fetch() with version 2025-01 returns x-shopify-api-version: 2025-01` |
| 7  | Admin REST client tests prove low-level REST requests also preserve requested versions instead of being rewritten | VERIFIED | `shopify-admin-rest-client.test.ts` contains dual-version assertions (2024-01 and 2025-01) on `get()` plus version-aware Link header assertion for `page_info=test` |
| 8  | REST SDK tests assert X-Shopify-API-Version echo and a version-aware Link header | VERIFIED | `shopify-api-rest-client.test.ts` asserts `X-Shopify-Api-Version` (Title-Case, canonicalized by shopify-api SDK) for default (2024-01) and 2025-01; asserts `pageInfo.nextPageUrl` contains `/admin/api/2025-01/` |
| 9  | Storefront SDK tests prove a non-2024-01 Storefront path works without helper normalization | VERIFIED | `shopify-api-storefront-client.test.ts` contains test `request with non-default version (2025-01) succeeds — twin routes /api/:version/` and asserts echoed `x-shopify-api-version: 2025-01` |
| 10 | Shopify conformance adapters and suites no longer embed a one-off 2024-01 admin API constant, and GraphQL adapters honor operation.path when provided | VERIFIED | `conformance/version.ts` exports `SHOPIFY_ADMIN_API_VERSION = '2025-01'` and path helpers; all three suites (products, orders, webhooks) use `shopifyAdminGraphqlPath()`; `live-adapter.ts` and `twin-adapter.ts` use `op.path ?? shopifyAdminGraphqlPath()` |
| 11 | Integration and smoke tests prove both 2024-01 and 2025-01 API routes behave the same at the transport layer, with X-Shopify-API-Version echoed | VERIFIED | `smoke.test.ts` has dual-version GraphQL tests with `x-shopify-api-version` header assertions; `integration.test.ts` has 6-test "Version routing and response headers" describe block with 200-return, header-echo, and unauthorized-header assertions for both versions; `pagination.test.ts` extends transport assertions for REST Link header and GraphQL 2025-01 parity |

**Score:** 11/11 truths verified

---

## Required Artifacts

### Plan 22-01 Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/src/services/api-version.ts` | Centralized Shopify API version parsing and header/path helpers | VERIFIED | 71 lines; exports `parseShopifyApiVersion`, `setApiVersionHeader`, `buildAdminApiPath`, `adminApiPrefix`; contains `X-Shopify-API-Version` |
| `twins/shopify/src/plugins/graphql.ts` | Version-parameterized admin and Storefront GraphQL wrapper routes | VERIFIED | Route registered as `/admin/api/:version/graphql.json` and `/api/:version/graphql.json`; contains `parseShopifyApiVersion`, `setApiVersionHeader`, URL rewrite to `CANONICAL_ADMIN_GRAPHQL` before `yoga.fetch()` |
| `twins/shopify/src/plugins/rest.ts` | Version-parameterized REST routes with version-aware Link headers | VERIFIED | All routes registered via `adminPath()` helper yielding `/admin/api/:version/{suffix}`; `parseVersionHeader()` called at top of every handler; Link header uses `buildAdminApiPath(version, ...)` |

### Plan 22-02 Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `tests/sdk-verification/helpers/shopify-client.ts` | Admin GraphQL helper that rewrites host only, not API version | VERIFIED | Contains `hostRewritten`; comment says "No version normalization is needed"; zero `replace.*2024-01` patterns |
| `tests/sdk-verification/helpers/shopify-rest-client.ts` | REST helper that preserves requested API version | VERIFIED | Contains `hostRewritten`; comment says "No version normalization is needed" |
| `tests/sdk-verification/helpers/shopify-api-client.ts` | shopifyApi factory helper that preserves admin and Storefront versions | VERIFIED | Contains `setAbstractFetchFunc`; comment explicitly states "no version normalization is required"; zero admin or Storefront version rewrite lines |
| `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` | Low-level admin REST client coverage for version-preserving requests | VERIFIED | Contains `2025-01`; dual-version `get()` assertions; version-aware Link header assertion |
| `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` | REST version-routing and response-header assertions | VERIFIED | Contains `X-Shopify-API-Version` (Title-Case); asserts `X-Shopify-Api-Version` header for 2024-01 and 2025-01; asserts `pageInfo.nextPageUrl` contains `/admin/api/2025-01/` |

### Plan 22-03 Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/conformance/version.ts` | Shared Shopify conformance default-version helper | VERIFIED | Exports `SHOPIFY_ADMIN_API_VERSION = '2025-01'`, `shopifyAdminGraphqlPath()`, `shopifyAdminRestPath()` |
| `twins/shopify/conformance/adapters/live-adapter.ts` | Live adapter health-check and GraphQL URL construction without hardcoded 2024-01 literals | VERIFIED | Contains `SHOPIFY_ADMIN_API_VERSION`; imports from `../version.js`; health check uses `shopifyAdminRestPath('/shop.json', SHOPIFY_ADMIN_API_VERSION)`; GraphQL URL uses `op.path ?? shopifyAdminGraphqlPath()` |
| `tests/integration/smoke.test.ts` | Smoke coverage for versioned Shopify admin GraphQL routes and echoed headers | VERIFIED | Contains `X-Shopify-API-Version`; dual-version smoke tests assert `x-shopify-api-version` matches `2024-01` and `2025-01` respectively |

---

## Key Link Verification

### Plan 22-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api-version.ts` | `graphql.ts` | `parseShopifyApiVersion` | WIRED | `graphql.ts` imports `{ parseShopifyApiVersion, setApiVersionHeader }` from `../services/api-version.js`; both functions are called in handlers |
| `api-version.ts` | `rest.ts` | `buildAdminApiPath` | WIRED | `rest.ts` imports `{ parseShopifyApiVersion, setApiVersionHeader, buildAdminApiPath }` from `../services/api-version.js`; `buildAdminApiPath(version, '/products.json')` used in Link header construction |
| `rest.ts` | SHOP-23 pagination behavior | `rel="next"` | WIRED | Link header constructed as `<${nextUrl}>; rel="next"` with version-aware `nextUrl` built from `buildAdminApiPath(version, ...)` |

### Plan 22-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `shopify-api-client.ts` | `graphql.ts` | `setAbstractFetchFunc` | WIRED | `setAbstractFetchFunc` intercepts SDK calls; host-only rewrite preserves `/admin/api/{version}` and `/api/{version}/graphql.json` paths; storefront and admin tests prove round-trips at non-default versions |
| `shopify-rest-client.ts` | `shopify-admin-rest-client.test.ts` | `2025-01` | WIRED | `createRestClient({ accessToken, apiVersion: '2025-01' })` used in dual-version test; helper produces correct `/admin/api/2025-01/` request path (no rewrite) |
| `shopify-api-rest-client.test.ts` | `rest.ts` | `page_info` | WIRED | Test `get()` with `{ page_info: 'test' }` query; asserts `pageInfo.nextPageUrl` contains `/admin/api/2025-01/` — proving the Link header returned by `rest.ts` is version-accurate |
| `shopify-admin-graphql-client.test.ts` | `graphql.ts` | `2025-01` | WIRED | `client.fetch(...)` with `apiVersion: '2025-01'` asserts HTTP 200 and `x-shopify-api-version: 2025-01` response header |

### Plan 22-03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `conformance/version.ts` | `live-adapter.ts` | `SHOPIFY_ADMIN_API_VERSION` | WIRED | `live-adapter.ts` imports `{ SHOPIFY_ADMIN_API_VERSION, shopifyAdminGraphqlPath, shopifyAdminRestPath }` from `../version.js` and uses all three |
| `conformance/version.ts` | `products.conformance.ts` | `shopifyAdminGraphqlPath` | WIRED | All three suites (products, orders, webhooks) import `shopifyAdminGraphqlPath` from `../version.js` and set `path: shopifyAdminGraphqlPath()` on every GraphQL operation |
| `smoke.test.ts` | `graphql.ts` | `2025-01` | WIRED | Smoke test fetches `/admin/api/2025-01/graphql.json` directly with `fetch()` and asserts `x-shopify-api-version: 2025-01` response header |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| SHOP-17 | 22-01, 22-02, 22-03 | Shopify twin serves GraphQL and REST routes with parameterized API version (`:version` in URL path) accepting any valid Shopify API version string, not hardcoded to `2024-01`; test helpers no longer rewrite request URLs to a single version | SATISFIED | Routes registered as `/admin/api/:version/graphql.json`, `/api/:version/graphql.json`, `/admin/api/:version/{resource}`; `parseShopifyApiVersion` validates any `YYYY-MM` or `unstable` string; all three SDK helpers remove version normalization; integration and SDK tests confirm both 2024-01 and 2025-01 route correctly |
| SHOP-22 | 22-01, 22-02, 22-03 | Shopify twin returns `X-Shopify-API-Version` response header on all API responses, echoing the version from the request URL path | SATISFIED | `setApiVersionHeader(reply, version)` set before auth/throttle branches in both GraphQL handlers and `parseVersionHeader()` in REST plugin; re-set after `yoga.fetch()` response forwarding; tests assert header presence on 200 (authenticated), 401 (unauthorized), and across multiple versions |
| SHOP-23 | 22-01, 22-02 | Shopify REST list endpoints return `Link` header with `rel="next"` and `page_info` cursor parameter for paginated responses, matching real Shopify pagination format | SATISFIED | `rest.ts` GET `/products.json` handler returns `Link` header with `rel="next"` when `?page_info=test`; URL is built via `buildAdminApiPath(version, '/products.json')`; SDK and integration tests assert version-aware Link header content |

No orphaned requirements found for Phase 22.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `twins/shopify/src/schema/resolvers.ts` | 90 | `'X-Shopify-API-Version': '2024-01'` hardcoded in outbound webhook delivery headers | Info | This is in the webhook queue `enqueue()` call, not in HTTP API responses to clients. Outbound webhook headers are not scoped by the phase goal (which targets API response routing). Does not block any phase truth. |

---

## Human Verification Required

None. All behavioral assertions are covered by automated tests (integration, pagination, SDK, and smoke). No visual, real-time, or external service behavior needs human review for this phase.

---

## Gaps Summary

No gaps. All 11 must-have truths verified across all three plans. Key observations:

**Plan 22-01 (transport layer):** `api-version.ts` is a clean, minimal service with explicit exports. Both `graphql.ts` and `rest.ts` import and use all helpers. The canonical Yoga endpoint pattern (single instance, URL rewrite before `yoga.fetch()`) is correctly implemented. `X-Shopify-API-Version` is set before all early-return branches and re-set after `yoga.fetch()` to survive response header forwarding.

**Plan 22-02 (helper removal and SDK verification):** All three helpers contain only host rewriting — no version normalization. Dual-version tests exist for admin GraphQL, admin REST, and Storefront. The shopify-api SDK header canonicalization quirk (`X-Shopify-Api-Version` Title-Case with `string[]` values) is correctly handled in test assertions.

**Plan 22-03 (conformance harness):** `conformance/version.ts` is the sole version source. Both adapters honor `op.path ?? shopifyAdminGraphqlPath()`. All three suites use `shopifyAdminGraphqlPath()` — no embedded `2024-01` literals remain in the conformance layer (only in JSDoc examples in `version.ts` itself, which is appropriate). Smoke and integration tests provide transport-level dual-version proof independent of the SDK helper layer.

**Residual `2024-01` in codebase:** The only remaining runtime `2024-01` references are:
1. `graphql.ts` line 37: `CANONICAL_ADMIN_GRAPHQL = '/admin/api/2024-01/graphql.json'` — intentional; Yoga canonical endpoint per the design decision documented in both PLAN and SUMMARY.
2. `resolvers.ts` line 90: outbound webhook delivery header — out of scope for this phase (transport routing, not webhook dispatch metadata).
3. `integration.test.ts`: many existing tests use `/admin/api/2024-01/graphql.json` — expected, as the 2024-01 route is still valid (backward-compatible); the new dual-version describe block adds 2025-01 coverage.
4. `pagination.test.ts` gql helper default: `version = '2024-01'` — backward-compatible default for existing pagination tests; 2025-01 is exercised in dedicated new tests.

All commits verified in git history: `be9eb4b`, `8380231`, `450934d`, `2b2022a`, `5eb28c6`, `7a3dcc5`.

---

_Verified: 2026-03-12T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
