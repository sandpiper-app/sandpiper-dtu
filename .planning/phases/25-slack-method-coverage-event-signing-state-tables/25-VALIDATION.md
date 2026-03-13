---
phase: 25
slug: slack-method-coverage-event-signing-state-tables
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- tests/sdk-verification/sdk/<relevant-file>.test.ts`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 0 | SLCK-14 | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 0 | SLCK-16 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-signing.test.ts` | ❌ W0 | ⬜ pending |
| 25-01-03 | 01 | 0 | SLCK-17 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-state-tables.test.ts` | ❌ W0 | ⬜ pending |
| 25-01-04 | 01 | 0 | XCUT-01 | unit | `pnpm -F twins/slack run test` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 1 | SLCK-14 | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` | ❌ W0 | ⬜ pending |
| 25-03-01 | 03 | 1 | SLCK-16 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-signing.test.ts` | ❌ W0 | ⬜ pending |
| 25-04-01 | 04 | 2 | SLCK-17 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-state-tables.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/slack-method-coverage.test.ts` — stubs for SLCK-14: calls one representative method from each missing family
- [ ] `tests/sdk-verification/sdk/slack-signing.test.ts` — covers SLCK-16: signature header verification, interaction routing, absolute response_url
- [ ] `tests/sdk-verification/sdk/slack-state-tables.test.ts` — covers SLCK-17: membership, views, pins/reactions deduplication
- [ ] Additional reset coverage assertions in `twins/slack/test/smoke.test.ts` — covers XCUT-01 for new tables

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
