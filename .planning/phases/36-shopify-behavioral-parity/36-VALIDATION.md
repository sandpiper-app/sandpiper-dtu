---
phase: 36
slug: shopify-behavioral-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk --reporter=verbose 2>&1 \| tail -20` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 0 | Wave-0 tests | integration | `pnpm test:sdk` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | Finding #7 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -i "online\|token-exchange"` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 1 | Finding #8 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -i "access_scopes\|location\|inventory"` | ❌ W0 | ⬜ pending |
| 36-04-01 | 04 | 2 | Finding #9 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -i "gid\|round-trip"` | ❌ W0 | ⬜ pending |
| 36-05-01 | 05 | 2 | Finding #10 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -i "since_id\|ids.*filter"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts` — integration tests for Findings #7-#10
- [ ] Tests written RED before implementation (TDD contract)

*Existing infrastructure (vitest, pnpm test:sdk) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *None* | — | — | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
