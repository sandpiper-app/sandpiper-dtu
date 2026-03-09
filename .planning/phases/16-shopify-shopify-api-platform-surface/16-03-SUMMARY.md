---
phase: 16-shopify-shopify-api-platform-surface
plan: "03"
subsystem: testing
tags: [shopify-api, auth, jwt, oauth, hmac, session-token, token-exchange, vitest]

# Dependency graph
requires:
  - phase: 16-01
    provides: createShopifyApiClient() factory with setAbstractFetchFunc twin redirect, mintSessionToken() JWT helper, computeShopifyHmac()

provides:
  - SHOP-10 auth helper test suite (7 tests): tokenExchange, refreshToken, clientCredentials, begin, callback, getEmbeddedAppUrl, buildEmbeddedAppUrl
  - begin→callback OAuth flow test validating signed state cookie round-trip
  - computeCallbackHmac helper (inline) for OAuth callback HMAC in hex format

affects:
  - 16-04-billing
  - future OAuth/auth integration work

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "begin→callback round-trip: call begin() to get signed state cookie, extract state nonce from Location URL, compute hex HMAC on URLSearchParams-sorted callback params, pass both shopify_app_state and shopify_app_state.sig cookies in callback request"
    - "Mock ServerResponse for node adapter: provide getHeaders(), setHeader(), statusCode, statusMessage, write(), end() — nodeConvertIncomingResponse reads getHeaders() to init NormalizedResponse"
    - "computeCallbackHmac: SHA256 hex (not base64), URLSearchParams encoding, sort keys with localeCompare, exclude hmac/signature from query"

key-files:
  created:
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts
  modified: []

key-decisions:
  - "computeCallbackHmac uses hex format (not base64) — validateHmac() in SDK calls createSHA256HMAC with HashFormat.Hex for OAuth callback query params; computeShopifyHmac uses base64 (for webhooks only)"
  - "Mock ServerResponse must include getHeaders() method — nodeConvertIncomingResponse reads rawResponse.getHeaders() to initialize NormalizedResponse headers; setHeader captures outgoing headers"
  - "begin→callback cookie flow: SDK sets shopify_app_state + shopify_app_state.sig via Set-Cookie; both must be present in callback request cookie header for getAndVerify() to pass HMAC signature check"
  - "URLSearchParams encoding for HMAC: ProcessedQuery.stringify(true) uses URLSearchParams internally, so computeCallbackHmac uses new URLSearchParams(sortedEntries).toString() to match SDK behavior exactly"
  - "refreshToken takes { shop: string, refreshToken: string } — NOT { shop, session }; pass session.accessToken as the refreshToken string; twin OAuth endpoint accepts any grant_type body and issues new token"

patterns-established:
  - "Pattern: OAuth test round-trip — begin() + callback() using mock ServerResponse objects captures signed cookies correctly without real HTTP server"

requirements-completed: [SHOP-10]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 16 Plan 03: shopify-api-auth.test.ts Summary

**SHOP-10 verified: all 7 shopify.auth helpers (tokenExchange, refreshToken, clientCredentials, begin, callback, embedded URL) green against the twin using live OAuth flows and mock adapter patterns**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T20:55:28Z
- **Completed:** 2026-03-09T20:57:30Z
- **Tasks:** 1 (TDD)
- **Files modified:** 1

## Accomplishments

- tokenExchange live twin call: JWT aud=test-api-key accepted by SDK decoder, POST /admin/oauth/access_token returns token, session.shop='dev.myshopify.com'
- refreshToken live twin call: SDK posts with grant_type=refresh_token, twin accepts any body and issues a new token
- clientCredentials live twin call: SDK posts with grant_type=client_credentials, twin returns access_token
- begin mock adapter test: mock ServerResponse with getHeaders() captures Location redirect to /admin/oauth/authorize with client_id=test-api-key
- callback begin→callback round-trip: signed state cookie extracted from Set-Cookie, hex HMAC computed on URLSearchParams-sorted query params, live twin POST /admin/oauth/access_token called
- getEmbeddedAppUrl pure: base64-encoded dev.myshopify.com/admin passes sanitizeHost validation, returns /apps/test-api-key URL
- buildEmbeddedAppUrl pure: same encoding, synchronous return

## Task Commits

1. **Task 1 (RED): shopify-api-auth.test.ts** - `26f5d12` (test)
2. **Task 1 (GREEN): all 7 tests pass** - `48c09c6` (feat — empty, tests passed on first run)

## Files Created/Modified

- `tests/sdk-verification/sdk/shopify-api-auth.test.ts` - SHOP-10 auth helper test suite (7 tests, 312 lines)

## Decisions Made

- **computeCallbackHmac uses hex (not base64):** validateHmac() in the SDK calls createSHA256HMAC with HashFormat.Hex for OAuth callback query params. computeShopifyHmac from the helper uses base64 (correct for webhooks, wrong for OAuth). A dedicated inline helper was written.
- **Mock ServerResponse must include getHeaders():** nodeConvertIncomingResponse reads `rawResponse.getHeaders()` to read current response headers into a NormalizedResponse object. Without this method the begin() call throws.
- **Cookie round-trip requires both state and .sig cookies:** setAndSign() sets shopify_app_state and shopify_app_state.sig. getAndVerify() requires the .sig companion to validate the HMAC signature. Both must appear in the callback request's cookie header.
- **URLSearchParams encoding in HMAC:** computeCallbackHmac uses `new URLSearchParams(sortedEntries).toString()` to exactly match what ProcessedQuery.stringify(true) produces inside the SDK's hmac-validator.
- **refreshToken signature:** { shop: string, refreshToken: string } — NOT { shop, session }. The accessToken from a prior tokenExchange is passed as the refreshToken value.

## Deviations from Plan

None — plan executed exactly as written. All 7 tests passed on the first run without any implementation changes to the twin or the helper files.

## Issues Encountered

Pre-existing untracked `tests/sdk-verification/sdk/shopify-api-session.test.ts` has 1 failing test (`getCurrentId` Bearer token extraction). This is out of scope for Plan 16-03 — it belongs to Plan 16-02 (SHOP-11) and was never committed. Logged to deferred-items.

## Next Phase Readiness

- SHOP-10 complete: auth namespace fully verified against the twin
- Plan 16-04 (billing) can proceed: createShopifyApiClient() supports optional billing config
- SHOP-11 session test failure (pre-existing, Plan 16-02 scope) should be resolved before the full sdk-verification suite is run together

---
*Phase: 16-shopify-shopify-api-platform-surface*
*Completed: 2026-03-09*
