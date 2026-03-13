---
phase: 28-shopify-rest-pagination-version-policy
verified: 2026-03-13T21:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 28: Shopify REST Pagination & Version Policy — Verification Report

**Phase Goal:** Shopify REST list endpoints implement real cursor pagination with result slicing and cursor advancement, and the API version router rejects unsupported/sunset versions with appropriate error responses.
**Verified:** 2026-03-13T21:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths — All Plans Combined

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | OAuth seeding uses POST /admin/tokens, not POST /admin/oauth/access_token | VERIFIED | `pagination.test.ts` line 84–89: `POST /admin/tokens` with `{ token: t, shopDomain }`, no reference to `/admin/oauth/access_token` in handler code |
| 2 | GET /products.json with limit=3 and 5 seeded products returns Link rel="next" with page_info cursor and limit | VERIFIED | `rest.ts` paginateList emits `rel="next"` with `page_info=<base64>&limit=N`; test at line 346–361 asserts all three |
| 3 | Following the page_info cursor returns the next page slice with no overlap, rel=previous Link only | VERIFIED | `paginateList` in `rest.ts`: `hasPrev = afterId > 0`, emits prev-only on last page; test at line 363–410 asserts page 2 has 2 products with no ID overlap and `rel="previous"` without `rel="next"` |
| 4 | Invalid page_info cursor returns 400 | VERIFIED | `rest.ts` lines 197–200: `decodeCursor` throws on bad input, handler returns `reply.status(400).send({ errors: 'Invalid page_info cursor' })`; test at line 412–419 |
| 5 | Orders, customers, inventory_items list endpoints also paginate | VERIFIED | `rest.ts`: orders (line 324–346), customers (line 285–307), inventory_items (line 386–408) all use `paginateList` with their respective resource types |
| 6 | parseShopifyApiVersion rejects month values outside 01-12 | VERIFIED | `api-version.ts` lines 25, 43–48: `VALID_MONTH_RE = /^(0[1-9]|1[0-2])$/` tested after regex check for non-unstable versions |
| 7 | parseShopifyApiVersion rejects SUNSET_VERSIONS with err.sunset=true flag | VERIFIED | `api-version.ts` lines 20–22, 49–53: `SUNSET_VERSIONS = new Set(['2023-01','2023-04','2023-07','2023-10'])`, throws `Error` with `err.sunset = true` |
| 8 | GET /admin/api/2024-99/products.json returns 400 with "Invalid API version" | VERIFIED | `parseVersionHeader` in `rest.ts` lines 140–150: non-sunset errors return `{ errors: 'Invalid API version' }`; test at line 441–444 |
| 9 | GET /admin/api/2023-01/products.json returns 400 with "This API version is no longer supported" | VERIFIED | `parseVersionHeader` in `rest.ts` lines 141–145: `err.sunset` truthy returns `{ errors: 'This API version is no longer supported' }`; test at line 446–449 |
| 10 | GET /admin/api/2025-01/products.json returns 200 (supported version) | VERIFIED | 2025-01 passes regex, VALID_MONTH_RE, and is not in SUNSET_VERSIONS; existing tests for 2025-01 route used throughout pagination test suite |
| 11 | GraphQL routes updated with same sunset-aware pattern | VERIFIED | `graphql.ts` lines 268–274 (storefront) and 347–353 (admin): both `err.sunset` branches present, using GraphQL array-of-objects errors format `{ errors: [{ message: '...' }] }` |
| 12 | SDK sentinel tests replaced with real multi-page assertions | VERIFIED | `shopify-api-rest-client.test.ts` lines 68–94 and 118–136: real multi-page tests using `seedProducts(3)` + `limit=2` + `pageInfo.nextPage` follow-through; `shopify-admin-rest-client.test.ts` lines 107–123: real Link header assertion with `page_info=` and `/admin/api/2025-01/` |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `twins/shopify/test/integration/pagination.test.ts` | VERIFIED | Exists, substantive (8 GraphQL + 4 SHOP-23 + 2 SHOP-17 tests), wired to `buildApp` and `/admin/api/:version/` routes |
| `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` | VERIFIED | Exists, contains `seedProducts()` helper and real multi-page assertions with `limit=2`, `pageInfo.nextPage` |
| `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` | VERIFIED | Exists, contains `seedProducts()` helper and Link header assertion with `page_info=` |
| `twins/shopify/src/plugins/rest.ts` | VERIFIED | Contains `paginateList` function (lines 71–108), applied to products/orders/customers/inventory_items; no sentinel code remains |
| `twins/shopify/src/services/api-version.ts` | VERIFIED | Contains `SUNSET_VERSIONS` (lines 20–22), `VALID_MONTH_RE` (line 25), and `err.sunset = true` throw (lines 49–53) |
| `twins/shopify/src/plugins/graphql.ts` | VERIFIED | Both GraphQL handlers (storefront and admin) have `err.sunset` branch at lines 270 and 349 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `pagination.test.ts beforeEach` | `POST /admin/tokens` | `app.inject` | WIRED | Line 84: `method: 'POST', url: '/admin/tokens'`; no `oauth/access_token` usage |
| `GET /products.json handler` | `paginateList(stateManager.listProducts(), 'Product', version, '/products.json', limit, afterId)` | `decodeCursor / encodeCursor` | WIRED | `rest.ts` lines 193–206: full call chain present with cursor decode on request, encode on response |
| `paginateList` | `reply.header('Link', linkHeader)` | `hasNext/hasPrev + buildAdminApiPath` | WIRED | `rest.ts` line 95–103: `buildAdminApiPath(version, path)` used in URL construction; `rel="previous"` and `rel="next"` emitted conditionally |
| `parseShopifyApiVersion` | `err.sunset = true` flag | `SUNSET_VERSIONS.has(raw)` | WIRED | `api-version.ts` lines 49–53: flag set and thrown |
| `parseVersionHeader in rest.ts` | `{ errors: 'This API version is no longer supported' }` | `err.sunset` check in catch block | WIRED | `rest.ts` lines 140–149: discriminated catch block present |
| `parseVersionHeader in graphql.ts` | `{ errors: [{ message: 'This API version is no longer supported' }] }` | `err.sunset` check | WIRED | Both handlers at lines 268–274 and 347–353 |
| `shopify-api-rest-client.test.ts` | `result.pageInfo.nextPage` | `RestClient.get with limit=2` | WIRED | Line 76–93: seeds 3 products, calls with `limit: '2'`, asserts `pageInfo?.nextPage` defined, follows to page 2 |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SHOP-23 | 28-01, 28-02 | Shopify REST list endpoints return `Link` header with `rel="next"` and `page_info` cursor for paginated responses | SATISFIED | `paginateList` in `rest.ts` emits RFC Link headers; 4 integration tests GREEN; 3 SDK verification tests updated (2 in shopify-api-rest-client, 1 in shopify-admin-rest-client) |
| SHOP-17 | 28-01, 28-03 | Shopify twin serves routes with parameterized API version; unsupported/sunset versions return appropriate error responses | SATISFIED | `SUNSET_VERSIONS`, `VALID_MONTH_RE`, `err.sunset` flag in `api-version.ts`; `parseVersionHeader` in both `rest.ts` and `graphql.ts` discriminates sunset vs. invalid; 2 integration tests GREEN |

**Orphaned requirements:** None. Both SHOP-23 and SHOP-17 are claimed by plans and have implementation evidence.

---

### Commit Verification

All documented commits confirmed to exist in repository history:

| Commit | Plan | Description |
|--------|------|-------------|
| `3b5b335` | 28-01 | test: migrate OAuth seeding and add failing REST/version policy tests |
| `611d9b4` | 28-01 | test: replace page_info=test sentinels with real multi-page assertions |
| `86c029c` | 28-02 | feat: implement real cursor pagination on Tier 1 REST list endpoints |
| `bb814cb` | 28-03 | feat: extend parseShopifyApiVersion with month-range and sunset validation |
| `d799394` | 28-03 | feat: update parseVersionHeader in rest.ts and graphql.ts for sunset errors |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| — | No sentinel code, TODO/FIXME, placeholder returns, or empty handlers found in modified files | — | — |

Confirmed absent:
- No `page_info=test` sentinel in `rest.ts` (grep returned no matches)
- No `POST /admin/oauth/access_token` in `pagination.test.ts` beforeEach handler code (only referenced in a comment explaining the old broken pattern)
- No stub `return {}` or empty implementation in pagination routes

---

### Human Verification Required

None. All phase behaviors have automated verification via Vitest integration tests and SDK verification tests. The 28-03 summary reports `163/163` tests passing for the full `@dtu/twin-shopify` suite.

The deferred pre-existing flaky test in `rate-limit.test.ts` is documented in `deferred-items.md` and was confirmed pre-existing before Phase 28 — it is not caused by this phase's changes.

---

### Summary

Phase 28 achieved its goal completely. The three plans executed in the correct wave order:

**Plan 01** migrated the broken OAuth seeding in `pagination.test.ts` and established RED contract tests for Plans 02 and 03. All sentinel `page_info=test` tests were removed from integration and SDK verification files and replaced with real multi-page assertions.

**Plan 02** implemented the `paginateList<T>` helper in `rest.ts` with `encodeCursor`/`decodeCursor` from the existing `services/cursor.ts`. All four Tier 1 list endpoints (products, orders, customers, inventory_items) use real opaque base64 cursors. Invalid cursors return 400. The Link header format (`rel="next"`, `rel="previous"`) is RFC-compliant and the SDK's `LINK_HEADER_REGEXP` parses it correctly into `pageInfo.nextPage`.

**Plan 03** extended `parseShopifyApiVersion` with `VALID_MONTH_RE` (month-range check) and `SUNSET_VERSIONS` (known-sunset reject-list), with `err.sunset = true` flag on the thrown error. Both `rest.ts` and `graphql.ts` `parseVersionHeader` functions were updated to discriminate sunset errors from invalid-syntax errors, returning distinct messages. GraphQL handlers use the array-of-objects format; REST uses the flat string format.

---

_Verified: 2026-03-13T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
