---
phase: 17
slug: shopify-rest-resource-client-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run --project sdk-verification --reporter=verbose` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project sdk-verification --reporter=verbose`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | SHOP-14 | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-graphql-client.test.ts` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | SHOP-14 | live | same file | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | SHOP-14 | live | same file | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | SHOP-14 | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-rest-client.test.ts` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | SHOP-15 | live | same file | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 1 | SHOP-15 | live | same file | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | SHOP-14 | live | `pnpm vitest run --project sdk-verification sdk/shopify-api-storefront-client.test.ts` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 2 | SHOP-14 | live | same file | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 2 | SHOP-15 | smoke | `pnpm coverage:generate && pnpm drift:check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts` — stubs for SHOP-14 (GraphqlClient + graphqlProxy)
- [ ] `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — stubs for SHOP-14, SHOP-15 (RestClient + Tier 1/2 REST resources)
- [ ] `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` — stubs for SHOP-14 (StorefrontClient)

*Existing test infrastructure and global-setup.ts cover all other requirements — no new framework setup needed.*

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
