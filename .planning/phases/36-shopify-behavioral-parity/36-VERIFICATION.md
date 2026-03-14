---
phase: 36-shopify-behavioral-parity
verified: 2026-03-13T00:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Run pnpm test:sdk and confirm 264/264 green"
    expected: "All 11 shopify-behavioral-parity tests pass; 0 regressions to pre-existing suite"
    why_human: "Cannot execute the test runner in this verification context; all static code checks pass"
---

# Phase 36: Shopify Behavioral Parity Verification Report

**Phase Goal:** Fix Shopify twin OAuth to differentiate grant types with proper response shapes, add missing REST routes (access_scopes, location inventory_levels, inventory_level mutations, inventory_items CRUD), fix GraphQL-to-REST ID round-trip with canonical GID generation, and support list endpoint filter semantics (since_id, ids).
**Verified:** 2026-03-13
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TDD contract: 11 tests in shopify-behavioral-parity.test.ts covering Findings #7-#10 | VERIFIED | File exists at `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts`, 354 lines, exactly 11 `it()` test cases across 4 `describe` blocks |
| 2 | Finding #7: tokenExchange with OnlineAccessToken returns session.isOnline === true | VERIFIED | `oauth.ts` lines 193-217: `isOnlineTokenExchange` branch checks `grant_type` URN + `requested_token_type` URN; returns `associated_user` block causing SDK `isOnline = true` |
| 3 | Finding #7: tokenExchange with OfflineAccessToken returns session.isOnline === false (no regression) | VERIFIED | `oauth.ts` line 219: all other grant types fall through to plain `{ access_token, scope }` — no `associated_user` |
| 4 | Finding #8: GET /admin/oauth/access_scopes.json returns { access_scopes: [...] } with auth | VERIFIED | `oauth.ts` lines 222-234: route registered, validates `x-shopify-access-token` via `validateAccessToken`, returns 6 scope handles |
| 5 | Finding #8: Location.all() → GET /admin/api/:v/locations.json returns locations array | VERIFIED | `rest.ts` line 459: `fastify.get(adminPath('/locations.json'), ...)` returns hardcoded location array with correct shape |
| 6 | Finding #8: Location.find(id=1) → GET /admin/api/:v/locations/:id.json returns location object | VERIFIED | `rest.ts` line 486: `fastify.get(adminPath('/locations/:id.json'), ...)` returns `{ location: { id: numericId, ... } }` |
| 7 | Finding #8: Location count + inventory_levels sub-route registered | VERIFIED | `rest.ts` lines 478, 506: count registered before `:id` (Fastify ordering correct); `/locations/:id/inventory_levels.json` returns `{ inventory_levels: [] }` |
| 8 | Finding #8: InventoryLevel mutations (adjust/connect/set/delete) all return inventory_level | VERIFIED | `rest.ts` lines 519-568: all four routes registered in correct order (sub-paths before DELETE base); each returns `{ inventory_level: { ... } }` or `{}` for DELETE |
| 9 | Finding #8: InventoryItem GET/PUT single-item routes exist | VERIFIED | `rest.ts` lines 576-620: both `GET /inventory_items/:id.json` and `PUT /inventory_items/:id.json` registered, state-backed with stub fallback |
| 10 | Finding #9: productCreate GraphQL mutation stores canonical GID (gid://shopify/Product/{rowId}) | VERIFIED | `resolvers.ts` lines 552-562: two-step insert — temp GID on create, then `UPDATE products SET gid = ? WHERE id = ?` using `createGID('Product', productId)` |
| 11 | Finding #9: Admin fixture loader also uses canonical two-step GID; variant product_gid is canonical | VERIFIED | `admin.ts` lines 91-105: same two-step pattern; `finalProductGid` (not temp) assigned to `product_gid` on variants |
| 12 | Finding #10: products.json and inventory_items.json support since_id/ids filters | VERIFIED | `rest.ts` lines 203-221: `sinceId` and `idsParam` parsed; `all.filter(item => item.id > sinceId)` and `idSet.has(item.id)` applied before `paginateList` |
| 13 | Finding #10: orders.json and customers.json support since_id filter | VERIFIED | `rest.ts` lines 322-326, 365-369: `sinceId` filter applied to both; `let all` (not `const`) for filter reassignment |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts` | 11 RED/GREEN tests for Findings #7-#10 | VERIFIED | 354 lines, 11 tests, substantive assertions (not stubs); commit `ed1103b` |
| `twins/shopify/src/plugins/oauth.ts` | Online token differentiation + access_scopes route | VERIFIED | `requested_token_type` field, `OAuthOnlineTokenResponse` interface, online branch, `validateAccessToken` import; commit `e526065` |
| `twins/shopify/src/schema/resolvers.ts` | productCreate with canonical two-step GID | VERIFIED | `UPDATE products SET gid = ? WHERE id = ?` at line 561; commit `d4549e0` |
| `twins/shopify/src/plugins/admin.ts` | Fixture loader with canonical two-step GID | VERIFIED | `UPDATE products SET gid = ? WHERE id = ?` at line 97; `finalProductGid` on variants; commit `ef60b8c` |
| `twins/shopify/src/plugins/rest.ts` | Location family, InventoryLevel mutations, InventoryItem single-item, since_id/ids filters | VERIFIED | 10 new routes + filter logic; commits `c9efcc8`, `a6091f4` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `shopify-behavioral-parity.test.ts` | `oauth.ts` | `shopify.auth.tokenExchange → POST /admin/oauth/access_token`; `associated_user` branch | WIRED | `isOnlineTokenExchange` checks both `grant_type` and `requested_token_type` URNs — exactly what SDK sends |
| `shopify-behavioral-parity.test.ts` | `oauth.ts` | `AccessScope.all() → GET /admin/oauth/access_scopes.json`; `access_scopes` response | WIRED | Route at line 222; `access_scopes` key in response matches `customPrefix: "/admin/oauth"` routing |
| `shopify-behavioral-parity.test.ts` | `rest.ts` | `Location.all() → GET /admin/api/:v/locations.json`; `adminPath('/locations.json')` | WIRED | Route registered at line 459 with correct adminPath pattern |
| `shopify-behavioral-parity.test.ts` | `rest.ts` | `since_id` filter in `products.json` | WIRED | `sinceId > 0` filter at line 209; `let all` allows reassignment |
| `resolvers.ts` | `rest.ts` | GraphQL productCreate GID → REST product lookup by numeric ID | WIRED | Both use `UPDATE products SET gid = ? WHERE id = ?`; REST `GET /products/:id.json` looks up by `numericId` via `stateManager.getProduct(numericId)` |
| `admin.ts` | `rest.ts` | Fixture-loaded product GID → REST lookup by numeric ID | WIRED | Same two-step pattern; fixture products get canonical `gid://shopify/Product/{rowId}` |

---

### Requirements Coverage

The PLAN frontmatter declares `Finding-7`, `Finding-8`, `Finding-9`, `Finding-10` as requirement IDs. These are adversarial review finding IDs, not REQUIREMENTS.md formal requirement IDs. REQUIREMENTS.md uses `SHOP-*`/`INFRA-*` identifiers. The ROADMAP.md explicitly calls these out as "Findings addressed: #7, #8, #9, #10" rather than formal requirements.

**Traceability note:** Phase 36 is not included in the REQUIREMENTS.md traceability table (lines 143-171). The adversarial findings it closes are behavioral gaps that don't map to a single REQUIREMENTS.md ID — they represent tightening of existing SHOP-10/SHOP-14/SHOP-20 behaviors rather than new capabilities. This is a documentation gap (REQUIREMENTS.md traceability not updated for Phase 36) but does not indicate unimplemented work.

| Finding ID | Description | Plans | Status | Evidence |
|------------|-------------|-------|--------|----------|
| Finding-7 | OAuth collapses grant types into one response | 36-01, 36-02 | SATISFIED | `isOnlineTokenExchange` branch in `oauth.ts`; test at line 51 in behavioral parity suite |
| Finding-8 | Missing REST routes confirmed 404 live | 36-01, 36-02, 36-04 | SATISFIED | 10 new routes in `rest.ts`; access_scopes in `oauth.ts`; all 11 planned routes registered |
| Finding-9 | GraphQL/REST IDs don't round-trip | 36-01, 36-03 | SATISFIED | Two-step GID in `resolvers.ts` and `admin.ts`; GID round-trip test covers the fix |
| Finding-10 | List endpoints ignore upstream filters | 36-01, 36-04 | SATISFIED | `since_id` and `ids` filters on 4 list endpoints in `rest.ts` |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `rest.ts` | 568 | `return {}` for DELETE /inventory_levels.json | Info | Expected: Shopify DELETE returns empty body. This matches real API behavior, not a stub deficiency. |
| `rest.ts` | 464-474 | Hardcoded `id: 1, name: 'Default Location'` in locations.json | Info | Tier 2 stub with hardcoded minimal shape. Tests assert `data.length > 0` which passes. Not a regression risk. |

No blocker or warning anti-patterns found in Phase 36 modified files.

---

### Human Verification Required

#### 1. Full test suite execution

**Test:** Run `pnpm test:sdk --reporter=verbose` from the project root
**Expected:** 264 tests pass (0 failures); `shopify-behavioral-parity` suite shows all 11 tests green; `Finding #7`, `Finding #8`, `Finding #9`, `Finding #10` describe blocks all pass
**Why human:** Cannot execute the test runner in this static verification context

---

### Gaps Summary

No gaps. All 13 observable truths are verified by code inspection. All artifacts exist, are substantive (not stubs), and are correctly wired. The 6 implementation commits (`ed1103b`, `e526065`, `d4549e0`, `ef60b8c`, `c9efcc8`, `a6091f4`) all touch the expected files with the expected patterns.

The only documentation note: Phase 36 is not reflected in the REQUIREMENTS.md traceability table. This is informational — the adversarial finding IDs used in PLAN frontmatter (`Finding-7` etc.) are not the same namespace as formal `SHOP-*`/`INFRA-*` requirement IDs. The behavioral gaps fixed are real and verified; the traceability omission does not indicate missing work.

---

_Verified: 2026-03-13_
_Verifier: Claude (gsd-verifier)_
