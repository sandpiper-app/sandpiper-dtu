---
phase: 26
slug: slack-chat-scoping-scope-enforcement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `vitest.config.ts` (root) — project `sdk-verification` |
| **Quick run command** | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | SLCK-15 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | SLCK-15 | integration | (same file) | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 1 | SLCK-15 | integration | (same file) | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 1 | SLCK-18 | integration | (same file) | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 1 | SLCK-18 | integration | (same file) | ❌ W0 | ⬜ pending |
| 26-03-01 | 03 | 1 | SLCK-19 | integration | (same file) | ❌ W0 | ⬜ pending |
| 26-03-02 | 03 | 1 | SLCK-19 | integration | (same file) | ❌ W0 | ⬜ pending |
| 26-XX-XX | all | all | SLCK-18 | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-chat.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` — stubs for SLCK-15, SLCK-18, SLCK-19: chat scoping, scope enforcement, OAuth headers
- Uses raw `fetch()` for header inspection (SLCK-19) and WebClient for method calls (SLCK-15, SLCK-18)
- Existing infrastructure covers fixtures: `seedSlackBotToken`, `seedSlackChannel`, `SLACK_API_URL`

*No new framework install required.*

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
