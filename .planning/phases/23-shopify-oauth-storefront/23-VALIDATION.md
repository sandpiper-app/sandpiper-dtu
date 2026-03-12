---
phase: 23
slug: shopify-oauth-storefront
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest, from project config) |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk --reporter=verbose --run tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk --reporter=verbose --run tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | SHOP-18 | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 0 | SHOP-19 | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | SHOP-18 | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ✅ | ⬜ pending |
| 23-02-02 | 02 | 1 | SHOP-18 | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ✅ | ⬜ pending |
| 23-03-01 | 03 | 1 | SHOP-19 | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | ✅ | ⬜ pending |
| 23-03-02 | 03 | 1 | SHOP-19 | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add empty-body `POST /admin/oauth/access_token` test to `shopify-api-auth.test.ts` or new file
- [ ] Add `products(first: N)` Storefront query test to `shopify-api-storefront-client.test.ts`
- [ ] Add Storefront schema introspection test (admin mutations absent) to `shopify-api-storefront-client.test.ts`
- [ ] Update `shopify-api-storefront-client.test.ts` `beforeEach` to seed storefront-typed token

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
