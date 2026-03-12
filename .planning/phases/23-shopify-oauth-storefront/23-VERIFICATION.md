---
phase: 23-shopify-oauth-storefront
verified: 2026-03-12T23:49:13Z
status: passed
score: 11/11 must-haves verified
requirements_verified:
  - SHOP-18
  - SHOP-19
re_verification:
  previous_status: gaps_found
  previous_score: "not recorded"
  gaps_closed:
    - "POST /admin/oauth/access_token now rejects wrong client_id/client_secret pairs"
    - "Storefront now accepts X-Shopify-Storefront-Access-Token without regressing the private-header SDK path"
  gaps_remaining: []
  regressions: []
---

# Phase 23: Shopify OAuth & Storefront Verification Report

**Phase Goal:** Shopify twin implements a real OAuth authorize/callback flow and serves a separate Storefront API schema, matching what the official SDKs expect rather than bypassing both.
**Verified:** 2026-03-12T23:49:13Z
**Status:** passed
**Re-verification:** Yes — prior gaps from the earlier Phase 23 verification are closed in the current workspace state, including plans `23-03` and `23-04`.

**Method note:** `pnpm test:sdk --run ...` could not be used in this environment because the Vitest global setup tries to `listen()` on `127.0.0.1` and `tsx` opens an IPC pipe; both fail here with `EPERM`. Verification below was performed against the current built workspace using `twins/shopify/dist/index.js` `buildApp()`, Fastify `inject()`, and the official `@shopify/shopify-api` clients in-process.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `GET /admin/oauth/authorize` redirects to the callback URL with HMAC-signed `code`, `shop`, `state`, and `timestamp` params | ✓ VERIFIED | `twins/shopify/src/plugins/oauth.ts:80-116`; in-process authorize request returned `302` with signed callback params |
| 2 | The official SDK `begin -> authorize -> callback` flow succeeds against the twin and returns a session | ✓ VERIFIED | `twins/shopify/src/plugins/oauth.ts:80-185`; in-process `shopify.auth.begin()` set state cookies and `shopify.auth.callback()` returned a session |
| 3 | Invalid OAuth state is rejected | ✓ VERIFIED | In-process SDK callback using a mismatched `shopify_app_state` cookie rejected before token exchange |
| 4 | `POST /admin/oauth/access_token` validates exact `client_id` and `client_secret` values and returns `access_token + scope` for a valid code | ✓ VERIFIED | `twins/shopify/src/plugins/oauth.ts:137-185`; direct requests produced `401 invalid_client` for wrong creds and `200` for pinned SDK creds + valid code |
| 5 | `POST /admin/oauth/access_token` rejects empty, unknown, replayed, and expired codes | ✓ VERIFIED | `twins/shopify/src/plugins/oauth.ts:130-185`, `packages/state/src/state-manager.ts:494-520`; direct requests returned `400 invalid_request` / `400 invalid_grant` as expected |
| 6 | `tokenExchange`, `refreshToken`, and `clientCredentials` grant paths still work after OAuth tightening | ✓ VERIFIED | In-process official SDK calls succeeded for all three grant flows |
| 7 | Storefront runs on a separate schema with no admin mutations | ✓ VERIFIED | `twins/shopify/src/schema/storefront.graphql:1-71`, `twins/shopify/src/plugins/graphql.ts:67-108`; Storefront introspection returned `mutationType = null` |
| 8 | The existing private-header Storefront SDK path still works and returns shop/product/collection data | ✓ VERIFIED | `twins/shopify/src/plugins/graphql.ts:155-256`; `StorefrontClient` request succeeded with seeded storefront token and returned seeded product data plus valid collections shape |
| 9 | `POST /api/:version/graphql.json` accepts `X-Shopify-Storefront-Access-Token` for valid storefront tokens | ✓ VERIFIED | `twins/shopify/src/plugins/graphql.ts:52-55, 168-179, 215-232`; raw Storefront request with only the public header returned `200` and shop data |
| 10 | Admin tokens are rejected on both public and private Storefront header paths | ✓ VERIFIED | `twins/shopify/src/plugins/graphql.ts:222-232`; raw public-header request returned `401`, and `StorefrontClient` with an admin token rejected on the private-header path |
| 11 | When both Storefront headers are present, the private header remains canonical | ✓ VERIFIED | `twins/shopify/src/plugins/graphql.ts:52-55, 215-217`; request with valid private token plus invalid public token still returned `200` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/state/src/state-manager.ts` | OAuth code persistence, token type storage, expiry handling | ✓ VERIFIED | Creates `tokens.token_type` and `oauth_codes`, prepares code/token statements, and expires codes older than 60s at `:261-271`, `:386-395`, `:478-520` |
| `twins/shopify/src/plugins/oauth.ts` | Real authorize route and tightened access-token endpoint | ✓ VERIFIED | Authorize redirect/HMAC at `:80-116`; exact credential validation plus code validation and passthrough grants at `:137-185` |
| `twins/shopify/src/services/token-validator.ts` | Token validation returns `tokenType` for downstream auth decisions | ✓ VERIFIED | `validateAccessToken()` returns `tokenType` at `:18-31` |
| `tests/sdk-verification/sdk/shopify-api-auth.test.ts` | Auth coverage for callback flow, invalid credentials, and preserved happy paths | ✓ VERIFIED | Callback flow and validation cases exist at `:190-423` |
| `twins/shopify/src/schema/storefront.graphql` | Separate Storefront SDL with products, collections, shop, and no mutation type | ✓ VERIFIED | Query-only Storefront schema at `:1-71` |
| `twins/shopify/src/plugins/graphql.ts` | Separate Storefront Yoga instance, dual-header auth, admin-token rejection | ✓ VERIFIED | `storefrontSchema`/`storefrontYoga` at `:70-190`; route auth and header precedence at `:200-256` |
| `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | Coverage for private SDK path, public header compatibility, and admin rejection | ✓ VERIFIED | Public/private header and schema coverage at `:141-262` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `twins/shopify/src/plugins/oauth.ts` | `packages/state/src/state-manager.ts` | `storeOAuthCode()` / `consumeOAuthCode()` | WIRED | Authorize route stores codes and access-token route consumes them |
| `tests/sdk-verification/helpers/shopify-api-client.ts` contract | `twins/shopify/src/plugins/oauth.ts` | `test-api-key` / `test-api-secret` parity | WIRED | Plugin defaults match the pinned SDK credentials (`test-api-key` / `test-api-secret`) |
| `twins/shopify/src/services/token-validator.ts` | `twins/shopify/src/plugins/graphql.ts` | `validation.tokenType !== 'admin'` | WIRED | Storefront auth uses `tokenType` in both Yoga context and Fastify route |
| `twins/shopify/src/plugins/graphql.ts` | `twins/shopify/src/schema/storefront.graphql` | `makeExecutableSchema({ typeDefs: storefrontTypeDefs })` | WIRED | Storefront route is backed by a separate SDL and Yoga instance |
| `twins/shopify/src/plugins/graphql.ts` | Storefront route + Storefront Yoga context | Shared `resolveStorefrontToken()` helper | WIRED | Public/private header resolution is centralized and reused in both places |
| `tests/sdk-verification/sdk/shopify-api-auth.test.ts` | `twins/shopify/src/plugins/oauth.ts` | Live authorize/access-token assertions | WIRED | Tests exercise `/admin/oauth/authorize` and `/admin/oauth/access_token` with the same paths the twin exposes |
| `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | `twins/shopify/src/plugins/graphql.ts` | SDK private-header flow + raw public-header flow | WIRED | Tests cover both header paths and precedence behavior on the versioned Storefront route |

### Requirements Coverage

All requirement IDs declared across Phase 23 plan frontmatter collapse to `{SHOP-18, SHOP-19}`:

- `23-01-PLAN.md` and `23-03-PLAN.md` claim `SHOP-18`
- `23-02-PLAN.md` and `23-04-PLAN.md` claim `SHOP-19`
- `.planning/REQUIREMENTS.md` maps only `SHOP-18` and `SHOP-19` to Phase 23
- No orphaned Phase 23 requirement IDs were found

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SHOP-18` | `23-01`, `23-03` | Full OAuth authorize flow with signed callback, credential/code validation, empty-body rejection, replay/expired code rejection, invalid-state rejection | ✓ SATISFIED | Authorize redirect + exact credential validation in `oauth.ts`; code expiry/consumption in `state-manager.ts`; in-process SDK checks proved `begin -> authorize -> callback`, invalid-state rejection, and preserved `clientCredentials` / token flows |
| `SHOP-19` | `23-02`, `23-04` | Separate Storefront schema at `/api/:version/graphql.json`, public Storefront auth header, no admin mutations, products/collections/shop coverage, admin-token rejection | ✓ SATISFIED | Separate Storefront SDL and Yoga instance in `graphql.ts` + `storefront.graphql`; public/private header auth and admin rejection verified in-process with both raw requests and `StorefrontClient` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocker or warning-level stub patterns found in the Phase 23 implementation files | - | No placeholders, canned success stubs, or orphaned phase artifacts were detected in the verified code paths |

### Human Verification Required

None. The phase goal and both requirement IDs were verified programmatically against the current workspace state.

### Gaps Summary

Previous gaps are closed. The current workspace state now validates exact OAuth client credentials, preserves the pinned Shopify SDK auth flows, serves a separate Storefront schema, accepts the public Storefront auth header, preserves the private-header SDK path, and rejects admin tokens on the Storefront endpoint. No remaining Phase 23 goal gaps were found.

---

_Verified: 2026-03-12T23:49:13Z_  
_Verifier: Claude (gsd-verifier)_
