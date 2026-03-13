---
phase: 29
slug: shopify-billing-transitions-test-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `twins/shopify/vitest.config.ts` (extends `vitest.shared.js`) |
| **Quick run command** | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` |
| **Full suite command** | `pnpm vitest run --project "@dtu/twin-shopify"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts`
- **After every plan wave:** Run `pnpm vitest run --project "@dtu/twin-shopify"`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 0 | SHOP-21 | integration | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` | ✅ (add 2 tests) | ⬜ pending |
| 29-01-02 | 01 | 1 | SHOP-21 | integration | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/billing-state-machine.test.ts` | ✅ | ⬜ pending |
| 29-02-01 | 02 | 1 | SHOP-21 | integration | `pnpm vitest run --project "@dtu/twin-shopify" test/integration.test.ts` | ✅ | ⬜ pending |
| 29-02-02 | 02 | 1 | SHOP-21 | integration | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/pagination.test.ts` | ✅ | ⬜ pending |
| 29-02-03 | 02 | 1 | SHOP-21 | integration | `pnpm vitest run --project "@dtu/twin-shopify" tests/integration/order-lifecycle.test.ts` | ✅ | ⬜ pending |
| 29-02-04 | 02 | 1 | SHOP-21 | integration | `pnpm vitest run --project "@dtu/twin-shopify" test/integration/rate-limit.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `twins/shopify/test/integration/billing-state-machine.test.ts` — add 2 new tests for invalid transitions (PENDING→CANCELLED, CANCELLED→CANCELLED); currently 7 tests, needs 9

*All other files exist. Migration work edits existing test files. No new files needed.*

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
