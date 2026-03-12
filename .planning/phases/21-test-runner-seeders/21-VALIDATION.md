---
phase: 21
slug: test-runner-seeders
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | INFRA-19 | smoke | `pnpm test:sdk` | All 27 test files exist | ⬜ pending |
| 21-01-02 | 01 | 1 | INFRA-19 | smoke | `pnpm test:sdk` | existing | ⬜ pending |
| 21-02-01 | 02 | 2 | INFRA-20 | integration | `pnpm test:sdk` | existing (shopify-admin tests) | ⬜ pending |
| 21-02-02 | 02 | 2 | INFRA-20 | integration | `pnpm test:sdk` | existing (all slack tests) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

Phase 21 does not introduce new test files; it makes the existing 177 tests run reliably and prepares seeders for future phases.

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
