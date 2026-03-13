---
phase: 30
slug: slack-transport-state-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (single-fork pool) |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -E "(PASS\|FAIL\|Error\|slack-signing\|slack-state-tables)"` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk 2>&1 | grep -E "(slack-signing|slack-state-tables|PASS|FAIL)" | head -30`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | SLCK-16 | integration | `pnpm test:sdk` | ✅ `slack-signing.test.ts` | ⬜ pending |
| 30-02-01 | 02 | 1 | SLCK-17 | integration | `pnpm test:sdk` | ✅ `slack-state-tables.test.ts` | ⬜ pending |
| 30-02-02 | 02 | 1 | SLCK-17 | integration | `pnpm test:sdk` | ✅ `slack-state-tables.test.ts` | ⬜ pending |
| 30-02-03 | 02 | 1 | SLCK-17 | integration | `pnpm test:sdk` | ✅ `slack-state-tables.test.ts` | ⬜ pending |
| 30-02-04 | 02 | 1 | SLCK-17 | integration | `pnpm test:sdk` | ✅ `slack-state-tables.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. All test files already exist — the goal is to make 4+ currently-failing tests pass.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
