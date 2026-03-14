---
phase: 37
slug: billing-fidelity-conformance-rigor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `vitest.config.ts` (root) + `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk -- --reporter=verbose tests/sdk-verification/sdk/shopify-api-billing.test.ts` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- --reporter=verbose tests/sdk-verification/sdk/shopify-api-billing.test.ts`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 0 | Finding #11 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-api-billing.test.ts` | ✅ (extend) | ⬜ pending |
| 37-02-01 | 02 | 1 | Finding #11 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-api-billing.test.ts` | ✅ (extend) | ⬜ pending |
| 37-02-02 | 02 | 1 | Finding #11 | integration | same | ✅ (extend) | ⬜ pending |
| 37-03-01 | 03 | 1 | Finding #12 | conformance | `pnpm --filter @dtu/twin-shopify conformance:twin` | ✅ | ⬜ pending |
| 37-03-02 | 03 | 1 | Finding #12 | conformance | `pnpm --filter @dtu/twin-slack conformance:twin` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `tests/sdk-verification/sdk/shopify-api-billing.test.ts` — add RED assertions for lineItems non-empty, oneTimePurchases round-trip, currentAppInstallation subscription lineItems
- [ ] Verify existing conformance:twin runs before modifications

*Wave 0 proves bugs exist before implementation fixes them.*

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
