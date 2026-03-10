---
phase: quick-1
verified: 2026-03-10T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Quick Task 1: Live Tests Require Shopify Account — Verification Report

**Task Goal:** Switch Shopify live conformance from short-lived access tokens to long-lived app client credentials (client_id + client_secret), so scheduled CI runs do not fail after 24 hours.
**Verified:** 2026-03-10
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Live conformance can authenticate with client_id + client_secret instead of a short-lived access_token | VERIFIED | `live-adapter.ts` checks `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` first; exchanges them via `POST /admin/oauth/access_token` with `grant_type: 'client_credentials'` at `init()` time |
| 2 | SHOPIFY_ACCESS_TOKEN still works as a fallback (backward-compatible) | VERIFIED | Constructor falls through to `else if (accessToken)` branch, sets `this.accessToken = accessToken` directly; `execute()` uses `this.accessToken` in both paths |
| 3 | CI workflow uses long-lived credential env vars for the scheduled live run | VERIFIED | `conformance-live` job env block contains `SHOPIFY_CLIENT_ID: ${{ secrets.SHOPIFY_CLIENT_ID }}` and `SHOPIFY_CLIENT_SECRET: ${{ secrets.SHOPIFY_CLIENT_SECRET }}`; no `SHOPIFY_ACCESS_TOKEN` present anywhere in the file |
| 4 | Startup fails fast with a clear error if neither credential set is provided | VERIFIED | Constructor throws `'Provide SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (recommended, long-lived) or SHOPIFY_ACCESS_TOKEN (expires in 24h)'` when neither credential set is present |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `twins/shopify/conformance/adapters/live-adapter.ts` | Updated ShopifyLiveAdapter accepting SHOPIFY_CLIENT_ID+SHOPIFY_CLIENT_SECRET or SHOPIFY_ACCESS_TOKEN | VERIFIED | 157 lines; substantive implementation with constructor branch logic, init() token exchange, backward-compat fallback, and error handling |
| `.github/workflows/conformance.yml` | Updated live conformance job using SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET secrets | VERIFIED | 180 lines; conformance-live job (lines 107-145) uses the new secret vars; no SHOPIFY_ACCESS_TOKEN reference anywhere in file |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ShopifyLiveAdapter constructor | POST /admin/oauth/access_token | fetch at init() time when client credentials provided | WIRED | Lines 66-75: `fetch(tokenUrl, { method: 'POST', body: JSON.stringify({ client_id, client_secret, grant_type: 'client_credentials' }) })`; response stored in `this.accessToken` (line 92) |
| .github/workflows/conformance.yml | ShopifyLiveAdapter env vars | SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET secrets replacing SHOPIFY_ACCESS_TOKEN | WIRED | Lines 144-145 pass `secrets.SHOPIFY_CLIENT_ID` and `secrets.SHOPIFY_CLIENT_SECRET`; grep confirms no SHOPIFY_ACCESS_TOKEN anywhere in conformance.yml |

### Requirements Coverage

No requirement IDs declared in plan frontmatter (`requirements: []`). Task goal verified through must-haves above.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder patterns found in `live-adapter.ts`. Implementation is substantive throughout.

### Human Verification Required

**1. Real Shopify Dev Store token exchange**

**Test:** Set `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, and `SHOPIFY_STORE_URL` for a real Custom App installation, then run `pnpm --filter @dtu/twin-shopify run conformance:live`.
**Expected:** Adapter exchanges credentials for an offline token, health-checks via shop.json, and executes the conformance suite without error.
**Why human:** Requires real Shopify credentials and a running dev store; cannot verify network exchange programmatically.

**2. Backward compatibility with existing SHOPIFY_ACCESS_TOKEN**

**Test:** Set only `SHOPIFY_ACCESS_TOKEN` and `SHOPIFY_STORE_URL` (no client credentials), run `conformance:live`.
**Expected:** Adapter skips token exchange, uses the pre-issued token directly, and completes the suite normally.
**Why human:** Requires a live token to validate the fallback path end-to-end.

**3. Fail-fast error surfaces correctly in CI output**

**Test:** Run `conformance:live` with no credential env vars set.
**Expected:** Process exits non-zero immediately with the clear error message naming both credential modes.
**Why human:** Error message text and exit behavior easiest to confirm by direct observation.

### Build Verification

`pnpm --filter @dtu/twin-shopify run build` exits 0 with no TypeScript errors — confirmed during verification.

### Summary

All four observable truths are fully verified. Both artifacts are substantive (not stubs) and correctly wired. The key links — client credentials exchanged to a token in `init()`, and CI secrets correctly threaded to the adapter — are both confirmed in the actual code. There are no blocker anti-patterns. The goal is achieved: scheduled CI runs now use non-expiring Custom App credentials instead of a 24-hour access token.

---

_Verified: 2026-03-10_
_Verifier: Claude (gsd-verifier)_
