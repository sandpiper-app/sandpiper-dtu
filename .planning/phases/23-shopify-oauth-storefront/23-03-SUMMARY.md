---
phase: 23-shopify-oauth-storefront
plan: "03"
subsystem: auth
tags: [shopify, oauth, fastify, sdk-verification, testing]

# Dependency graph
requires:
  - phase: 23-shopify-oauth-storefront
    provides: OAuth authorize/callback flow, one-time auth codes, and Storefront schema separation from plans 01-02
provides:
  - exact client_id/client_secret validation on POST /admin/oauth/access_token
  - invalid_client coverage for bad auth-code and client_credentials requests
  - preserved pinned SDK callback and clientCredentials happy paths after credential tightening
affects: [shopify-oauth, sdk-verification, phase-23-closeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OAuth token exchange validates exact configured credentials before any grant-specific token issuance"
    - "Auth-code requests preserve invalid_request precedence for missing fields before exact-value credential checks"
    - "When localhost listeners are unavailable, Fastify buildApp plus app.inject can verify twin behavior in-process"

key-files:
  created:
    - .planning/phases/23-shopify-oauth-storefront/23-03-SUMMARY.md
  modified:
    - twins/shopify/src/plugins/oauth.ts
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts

key-decisions:
  - "POST /admin/oauth/access_token now compares client_id/client_secret against SHOPIFY_API_KEY and SHOPIFY_API_SECRET for every grant type before issuing tokens"
  - "Auth-code requests keep invalid_request for missing client_id/client_secret/code, then return invalid_client only for credential mismatches"
  - "Verification used in-process app.inject plus Shopify SDK abstractFetch redirection because this executor cannot bind localhost listeners"

patterns-established:
  - "Pattern: Shopify OAuth token exchange must validate exact twin credentials before grant branching so passthrough grants cannot mint tokens with bad client auth"

requirements-completed: [SHOP-18]

# Metrics
duration: 35min
completed: 2026-03-12
---

# Phase 23 Plan 03: OAuth credential validation Summary

**Shopify OAuth token exchange now rejects bad client_id/client_secret values across auth-code and passthrough grants while keeping the pinned SDK callback and clientCredentials flows working**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-12T22:55:36Z
- **Completed:** 2026-03-12T23:30:36Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added exact twin credential validation to `POST /admin/oauth/access_token` so bad `client_id` or `client_secret` values return `401 invalid_client`
- Expanded the SDK auth verification file with explicit wrong-credential cases for real authorization codes and the `client_credentials` grant
- Preserved the pinned `shopify.auth.callback()` and `shopify.auth.clientCredentials()` success paths after tightening credential checks

## Task Commits

The parallel executor could not acquire `.git/index.lock`, so the task-level TDD split was not possible inside that worker. After the wave completed, the orchestrator backfilled the plan changes as a single commit:

1. **BACKFILL: validate exact OAuth client credential checks and coverage** - `6b0ca43`

**Plan metadata:** tracked in the follow-up phase docs commit after verification passed.

## Files Created/Modified

- `.planning/phases/23-shopify-oauth-storefront/23-03-SUMMARY.md` - records plan execution, verification, and environment blockers
- `twins/shopify/src/plugins/oauth.ts` - validates exact configured twin credentials before issuing tokens for any grant type
- `tests/sdk-verification/sdk/shopify-api-auth.test.ts` - adds invalid_client cases for wrong auth-code and client_credentials credentials while preserving the pinned happy path

## Decisions Made

- Exact credential matching is now the gate for all `/admin/oauth/access_token` requests, not just auth-code requests, so passthrough grants cannot bypass client auth.
- Missing auth-code fields still return `invalid_request` before credential mismatch handling, preserving the existing contract for empty or incomplete requests.
- In-process verification via `buildApp()` + `app.inject()` is the fallback for this environment because `listen()` on `127.0.0.1` is denied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced live localhost verification with in-process twin verification**
- **Found during:** Task 1 (Reject wrong OAuth client credentials while preserving the working SDK flows)
- **Issue:** `pnpm test:sdk --reporter=verbose --run tests/sdk-verification/sdk/shopify-api-auth.test.ts` could not run in this executor because the environment denies `listen()` on `127.0.0.1`, which the SDK verification global setup requires.
- **Fix:** Verified the same behaviors in-process by building `@dtu/twin-shopify`, exercising `/admin/oauth/access_token` through `buildApp()` + `app.inject()`, and wiring the official Shopify SDK through `setAbstractFetchFunc()` to confirm `callback()` and `clientCredentials()` still succeed.
- **Files modified:** None
- **Verification:** `pnpm -r --filter @dtu/state --filter @dtu/twin-shopify run build`, direct `node --input-type=module` checks via `app.inject()`, and direct SDK `callback()` / `clientCredentials()` checks using `app.inject()`-backed fetch
- **Committed in:** backfilled later in `6b0ca43`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Verification stayed scoped to the requested OAuth contract, but it had to run in-process instead of through the live Vitest harness because the executor cannot open localhost listeners.

## Issues Encountered

- The live SDK verification command from the plan cannot run in this environment because any attempt to `listen()` on `127.0.0.1` fails with `EPERM`.
- The parallel executor temporarily failed to acquire `.git/index.lock`; the orchestrator backfilled the plan commit afterward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SHOP-18's remaining credential-validation gap is closed in code and covered in the SDK auth verification file.
- Phase 23 verification now passes; the next step is Phase 24 planning/execution.

## Self-Check: PASSED

- **Found:** `.planning/phases/23-shopify-oauth-storefront/23-03-SUMMARY.md`
- **Found:** `twins/shopify/src/plugins/oauth.ts`
- **Found:** `tests/sdk-verification/sdk/shopify-api-auth.test.ts`
- **Verified:** exact credential rejection and pinned SDK happy paths via in-process `app.inject()` checks
- **Verified:** backfill commit `6b0ca43` is present in git history

---
*Phase: 23-shopify-oauth-storefront*
*Completed: 2026-03-12*
