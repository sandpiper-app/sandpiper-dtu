---
phase: 22
slug: shopify-version-routing-response-headers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` |
| **Full suite command** | `pnpm test:sdk && pnpm test -- twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts tests/integration/smoke.test.ts` |
| **Estimated runtime** | ~35 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts`
- **After every plan wave:** Run `pnpm test:sdk && pnpm test -- twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts tests/integration/smoke.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | SHOP-17 | integration | `pnpm test -- twins/shopify/test/integration.test.ts tests/integration/smoke.test.ts` | existing | ⬜ pending |
| 22-01-02 | 01 | 1 | SHOP-22, SHOP-23 | integration | `pnpm test -- twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts tests/integration/smoke.test.ts` | existing | ⬜ pending |
| 22-02-01 | 02 | 2 | SHOP-17 | sdk | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | existing | ⬜ pending |
| 22-02-02 | 02 | 2 | SHOP-22, SHOP-23 | sdk | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` | existing | ⬜ pending |
| 22-03-01 | 03 | 2 | SHOP-17, SHOP-22 | integration | `pnpm test -- tests/integration/smoke.test.ts twins/shopify/test/integration.test.ts` | existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

Phase 22 reuses the current Shopify twin test harness, SDK verification project, and in-process
integration tests. No new framework setup is required before execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Shopify conformance adapter can target a non-`2024-01` admin version without hardcoded URL assumptions | SHOP-17, SHOP-22 | Requires real dev-store credentials and a live Shopify environment | Configure `SHOPIFY_STORE_URL`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET`, run the live conformance adapter after implementation, and confirm requests to a configured non-`2024-01` version return a response whose `x-shopify-api-version` matches the requested path version |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
