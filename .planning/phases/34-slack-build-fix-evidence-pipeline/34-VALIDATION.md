---
phase: 34
slug: slack-build-fix-evidence-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk --reporter=verbose 2>&1 \| tail -5` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** `cd twins/slack && npx tsc --noEmit` (for build fix tasks); `pnpm drift:check` (for evidence tasks)
- **After every plan wave:** `pnpm test:sdk` full suite
- **Before `/gsd:verify-work`:** Full suite must be green AND `pnpm drift:check` exits 0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | TS2345 fix | compile check | `cd twins/slack && npx tsc --noEmit` | N/A — compiler | ⬜ pending |
| 34-02-01 | 02 | 2 | Evidence regen | integration | `pnpm coverage:generate && pnpm drift:check` | ✅ | ⬜ pending |
| 34-02-02 | 02 | 2 | No false live | integration | `pnpm drift:check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files required — both fixes are source-only changes verified by existing compiler and drift-check infrastructure.

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
