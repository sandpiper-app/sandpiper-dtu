---
phase: 24
slug: shopify-rest-persistence-billing-state-machine-rate-limiting
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (^3.0.0) |
| **Config file** | `twins/shopify/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run --project @dtu/twin-shopify` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project @dtu/twin-shopify`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 0 | SHOP-20 | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 0 | SHOP-21 | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 0 | SHOP-24 | unit | `pnpm vitest run --project @dtu/twin-shopify` | ✅ (update) | ⬜ pending |
| 24-02-01 | 02 | 1 | SHOP-20a | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 1 | SHOP-20b | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-02-03 | 02 | 1 | SHOP-20c | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-03-01 | 03 | 1 | SHOP-21a | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-03-02 | 03 | 1 | SHOP-21b | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-03-03 | 03 | 1 | SHOP-21c | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-03-04 | 03 | 1 | SHOP-21d | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |
| 24-04-01 | 04 | 1 | SHOP-24a | unit | `pnpm vitest run --project @dtu/twin-shopify` | ✅ (update) | ⬜ pending |
| 24-04-02 | 04 | 1 | SHOP-24b | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `twins/shopify/test/integration/rest-persistence.test.ts` — stubs for SHOP-20a, SHOP-20b, SHOP-20c
- [ ] `twins/shopify/test/integration/billing-state-machine.test.ts` — stubs for SHOP-21a through SHOP-21d
- [ ] `twins/shopify/test/integration/rate-limit.test.ts` assertion update — SHOP-24a (maximumAvailable: 2000 → 1000)
- [ ] New assertion in rate-limit.test.ts for actualQueryCost ≠ requestedQueryCost — SHOP-24b

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
