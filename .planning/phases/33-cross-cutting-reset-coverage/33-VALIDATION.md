---
phase: 33
slug: cross-cutting-reset-coverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `vitest.config.ts` (root workspace) |
| **Quick run command** | `pnpm vitest run --project "@dtu/twin-shopify" && pnpm vitest run --project "@dtu/twin-slack"` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project "@dtu/twin-shopify" && pnpm vitest run --project "@dtu/twin-slack"`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | XCUT-01 | unit | `pnpm vitest run --project "@dtu/twin-shopify" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 1 | XCUT-01 | unit | `pnpm vitest run --project "@dtu/twin-shopify" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 33-01-03 | 01 | 1 | XCUT-01 | unit | `pnpm vitest run --project "@dtu/twin-shopify" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 33-01-04 | 01 | 1 | XCUT-01 | unit | `pnpm vitest run --project "@dtu/twin-slack" --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] XCUT-01 tests in `twins/shopify/test/integration.test.ts` — stubs for app_subscriptions cleared, product_variants cleared, Shopify reset < 100ms
- [ ] Slack performance test in `twins/slack/test/smoke.test.ts` — stub for Slack reset < 100ms

*3 existing Slack XCUT-01 tests in `smoke.test.ts` are already GREEN and do not need recreating.*

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
