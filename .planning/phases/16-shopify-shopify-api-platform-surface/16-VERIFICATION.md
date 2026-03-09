---
phase: 16-shopify-shopify-api-platform-surface
verified: 2026-03-09T17:15:00Z
status: passed
score: 24/24 must-haves verified
re_verification: false
---

# Phase 16: Shopify API Platform Surface Verification Report

**Phase Goal:** Make the high-level Shopify platform helpers work against the twin. Auth, session, and webhooks are the core; billing is lower priority and can be stubbed initially.
**Verified:** 2026-03-09T17:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `shopify.webhooks.validate()` returns `{ valid: true }` for a correctly HMAC-signed request with all five required headers | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 45 |
| 2 | `shopify.webhooks.validate()` returns `{ valid: false, reason: 'invalid_hmac' }` for a tampered HMAC | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 53 |
| 3 | `shopify.webhooks.validate()` returns `{ valid: false }` when any required header is missing | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 66 |
| 4 | `shopify.flow.validate()` returns `{ valid: true }` for a correctly signed request | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 81 |
| 5 | `shopify.flow.validate()` returns `{ valid: false }` for a bad HMAC | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 91 |
| 6 | `shopify.fulfillmentService.validate()` returns `{ valid: true }` for a correctly signed request | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 107 |
| 7 | `shopify.fulfillmentService.validate()` returns `{ valid: false }` for a bad HMAC | VERIFIED | Test passes: `shopify-api-webhooks.test.ts` line 117 |
| 8 | `createShopifyApiClient()` factory sets `abstractFetch` to redirect SDK HTTP calls to the twin | VERIFIED | `shopify-api-client.ts` line 54: `setAbstractFetchFunc(async (input, init) => { ... })` with host rewrite |
| 9 | `shopify.session.decodeSessionToken()` decodes a valid HS256 JWT and returns expected payload fields | VERIFIED | Test passes: `shopify-api-session.test.ts` line 36 |
| 10 | `shopify.session.decodeSessionToken()` throws for a JWT signed with the wrong secret | VERIFIED | Test passes: `shopify-api-session.test.ts` line 44 |
| 11 | `shopify.session.decodeSessionToken()` throws when `aud` does not match `apiKey` | VERIFIED | Test passes: `shopify-api-session.test.ts` line 62 |
| 12 | `shopify.session.getOfflineId('dev.myshopify.com')` returns `'offline_dev.myshopify.com'` | VERIFIED | Test passes: `shopify-api-session.test.ts` line 86 |
| 13 | `shopify.session.getJwtSessionId('dev.myshopify.com', '42')` returns `'dev.myshopify.com_42'` | VERIFIED | Test passes: `shopify-api-session.test.ts` line 90 |
| 14 | `shopify.session.customAppSession('dev.myshopify.com')` returns a `Session` with correct shop and `isOnline === false` | VERIFIED | Test passes: `shopify-api-session.test.ts` line 94 |
| 15 | `shopify.session.getCurrentId()` extracts session ID from an Authorization header on a mock request | VERIFIED | Test passes: `shopify-api-session.test.ts` line 106 |
| 16 | `shopify.auth.tokenExchange()` returns a valid `Session` with `accessToken` and `shop='dev.myshopify.com'` | VERIFIED | Test passes: `shopify-api-auth.test.ts` line 59; live twin call |
| 17 | `shopify.auth.refreshToken()` returns a `Session` with `accessToken` via twin's OAuth endpoint | VERIFIED | Test passes: `shopify-api-auth.test.ts` line 74; live twin call |
| 18 | `shopify.auth.clientCredentials()` returns a `Session` with `accessToken` via twin's OAuth endpoint | VERIFIED | Test passes: `shopify-api-auth.test.ts` line 95; live twin call |
| 19 | `shopify.auth.begin()` returns a redirect whose Location header matches `/admin/oauth/authorize` | VERIFIED | Test passes: `shopify-api-auth.test.ts` line 110; mock adapter test |
| 20 | `shopify.auth.callback()` completes OAuth and returns a `Session` with `accessToken` | VERIFIED | Test passes: `shopify-api-auth.test.ts` line 169; full begin->callback round-trip |
| 21 | `shopify.auth.getEmbeddedAppUrl()` and `buildEmbeddedAppUrl()` return URL strings | VERIFIED | Tests pass: `shopify-api-auth.test.ts` lines 285/303 |
| 22 | `billing.request()` with a subscription plan returns a `confirmationUrl` string | VERIFIED | Test passes: `shopify-api-billing.test.ts` line 56; twin stub resolver |
| 23 | `billing.check()` with no active subscriptions returns `false` (`hasActivePayment: false`) | VERIFIED | Test passes: `shopify-api-billing.test.ts` line 69 |
| 24 | `billing.cancel()` with a valid subscription ID returns the cancelled subscription object | VERIFIED | Test passes: `shopify-api-billing.test.ts` line 80 |

**Score:** 24/24 truths verified

---

### Required Artifacts

| Artifact | Min Lines | Actual | Status | Details |
|----------|-----------|--------|--------|---------|
| `tests/sdk-verification/helpers/shopify-api-client.ts` | — | 142 | VERIFIED | Exports `createShopifyApiClient`, `mintSessionToken`, `computeShopifyHmac`, `buildMockWebhookRequest`; `setAbstractFetchFunc` wired at line 54 |
| `tests/sdk-verification/sdk/shopify-api-webhooks.test.ts` | 80 | 126 | VERIFIED | 7 tests; SHOP-12 covered |
| `tests/sdk-verification/sdk/shopify-api-session.test.ts` | 90 | 131 | VERIFIED | 7 tests; SHOP-11 covered |
| `tests/sdk-verification/sdk/shopify-api-auth.test.ts` | 130 | 312 | VERIFIED | 7 tests; SHOP-10 covered |
| `tests/sdk-verification/sdk/shopify-api-billing.test.ts` | 80 | 94 | VERIFIED | 3 tests; SHOP-13 covered |
| `twins/shopify/src/schema/schema.graphql` | — | — | VERIFIED | `appSubscriptionCreate`, `appSubscriptionCancel`, `currentAppInstallation` present at lines 414/428-430 |
| `twins/shopify/src/schema/resolvers.ts` | — | — | VERIFIED | Billing resolvers at lines 738/757/773/300; all call `requireAuth` and return substantive shapes |
| `tests/sdk-verification/coverage/coverage-report.json` | — | — | VERIFIED | Phase 16 symbols attributed; `shopifyApi`, `Shopify.auth`, `Shopify.session`, `Shopify.webhooks`, `Shopify.flow`, `Shopify.fulfillmentService` as `live`; `Shopify.billing` as `stub` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `shopify-api-client.ts` | `@shopify/shopify-api/runtime` | `setAbstractFetchFunc` — redirects SDK HTTP to twin | WIRED | Line 19: `import { setAbstractFetchFunc } from '@shopify/shopify-api/runtime'`; called at line 54 |
| `shopify-api-webhooks.test.ts` | `helpers/shopify-api-client.ts` | `createShopifyApiClient() + computeShopifyHmac() + buildMockWebhookRequest()` | WIRED | Line 19: `from '../helpers/shopify-api-client.js'` |
| `shopify-api-session.test.ts` | `helpers/shopify-api-client.ts` | `createShopifyApiClient() + mintSessionToken()` | WIRED | Line 15: `from '../helpers/shopify-api-client.js'` |
| `shopify-api-auth.test.ts` | `helpers/shopify-api-client.ts` | `createShopifyApiClient() + mintSessionToken()` | WIRED | Line 20: `from '../helpers/shopify-api-client.js'` |
| `shopify-api-auth.test.ts` | `twins/shopify/src/plugins/oauth.ts` | `abstractFetch → POST /admin/oauth/access_token` | WIRED | Live twin calls in tokenExchange/refreshToken/clientCredentials/callback tests all pass |
| `shopify-api-billing.test.ts` | `helpers/shopify-api-client.ts` | `createShopifyApiClient()` | WIRED | Line 22: `from '../helpers/shopify-api-client.js'` |
| `shopify-api-billing.test.ts` | `twins/shopify/src/schema/resolvers.ts` | `billing.request → abstractFetch → POST /admin/api/2024-01/graphql.json → appSubscriptionCreate` | WIRED | All 3 billing tests pass against live twin; resolver at line 738 |
| `twins/shopify/src/schema/resolvers.ts` | `twins/shopify/src/schema/schema.graphql` | `makeExecutableSchema typeDefs+resolvers must match` | WIRED | Schema has `appSubscriptionCreate` at line 428; resolver references it at line 738; twin compiles and tests pass |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SHOP-12 | 16-01 | Developer can use `@shopify/shopify-api` webhook, Flow, and fulfillment-service validation helpers | SATISFIED | 7 tests passing in `shopify-api-webhooks.test.ts`; all three validators exercised with valid and invalid HMACs |
| SHOP-11 | 16-02 | Developer can use `@shopify/shopify-api` session and utility helpers | SATISFIED | 7 tests passing in `shopify-api-session.test.ts`; decodeSessionToken, getOfflineId, getJwtSessionId, customAppSession, getCurrentId all verified |
| SHOP-10 | 16-03 | Developer can use `@shopify/shopify-api` auth helpers against the Shopify twin | SATISFIED | 7 tests passing in `shopify-api-auth.test.ts`; all six auth methods (begin, callback, tokenExchange, refreshToken, clientCredentials, embedded URL helpers) verified |
| SHOP-13 | 16-04 | Developer can use `@shopify/shopify-api` billing helpers against the Shopify twin | SATISFIED (stubbed per spec) | 3 tests passing in `shopify-api-billing.test.ts`; billing.request/check/cancel verified via twin stub resolvers; per REQUIREMENTS.md: "lower priority — can be stubbed initially" |

No orphaned requirements. All four Phase 16 IDs declared in plan frontmatter match the REQUIREMENTS.md Phase 16 mapping table, and all four show "Complete".

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `shopify-api-auth.test.ts` | 259 | `return {}` inside mock `getHeaders()` | Info | Intentional — mock ServerResponse for callback OAuth test; not a stub implementation |

No blockers. No warnings. The one flagged pattern is a correctly-implemented mock callback response object.

---

### Human Verification Required

None. All 24 tests are automated and pass with live twin calls. No visual, real-time, or external service behaviors require human review.

The billing behaviors are intentionally stubbed (twin returns static shapes) per the phase goal and SHOP-13 specification: "lower priority — can be stubbed initially."

---

### Gaps Summary

No gaps. All must-haves are verified.

**Test run results (confirmed live):**

- `shopify-api-webhooks.test.ts`: 7/7 passed (SHOP-12)
- `shopify-api-session.test.ts`: 7/7 passed (SHOP-11)
- `shopify-api-auth.test.ts`: 7/7 passed (SHOP-10)
- `shopify-api-billing.test.ts`: 3/3 passed (SHOP-13)
- **Total: 24/24 tests passing**

**Commits verified:** All 7 documented commits exist in git history (`83d3b64`, `18eb308`, `6a73d5e`, `26f5d12`, `48c09c6`, `17d7ba9`, `6fec447`).

---

_Verified: 2026-03-09T17:15:00Z_
_Verifier: Claude (gsd-verifier)_
