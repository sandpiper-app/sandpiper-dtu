---
phase: 16
slug: shopify-shopify-api-platform-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.0.0 |
| **Config file** | vitest.config.sdk-verification.ts |
| **Quick run command** | `npx vitest run --config vitest.config.sdk-verification.ts --reporter=verbose tests/sdk-verification/sdk/shopify-api-*.test.ts` |
| **Full suite command** | `npx vitest run --config vitest.config.sdk-verification.ts --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --config vitest.config.sdk-verification.ts --reporter=verbose tests/sdk-verification/sdk/shopify-api-*.test.ts`
- **After every plan wave:** Run `npx vitest run --config vitest.config.sdk-verification.ts --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | SHOP-12 | unit | `npx vitest run --config vitest.config.sdk-verification.ts tests/sdk-verification/sdk/shopify-api-webhooks.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 1 | SHOP-11 | unit | `npx vitest run --config vitest.config.sdk-verification.ts tests/sdk-verification/sdk/shopify-api-session.test.ts` | ❌ W0 | ⬜ pending |
| 16-03-01 | 03 | 2 | SHOP-10 | integration | `npx vitest run --config vitest.config.sdk-verification.ts tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ❌ W0 | ⬜ pending |
| 16-04-01 | 04 | 3 | SHOP-13 | integration | `npx vitest run --config vitest.config.sdk-verification.ts tests/sdk-verification/sdk/shopify-api-billing.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/helpers/shopify-api-client.ts` — `createShopifyApiClient()` factory with `setAbstractFetchFunc` override
- [ ] `tests/sdk-verification/helpers/shopify-api-request-adapter.ts` — mock request builders for adapter-based tests
- [ ] JWT minting helper using `jose.SignJWT` for session token tests
- [ ] HMAC computation helper using `node:crypto` for webhook/flow/fulfillment tests

*Existing infrastructure covers framework and twin lifecycle.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
