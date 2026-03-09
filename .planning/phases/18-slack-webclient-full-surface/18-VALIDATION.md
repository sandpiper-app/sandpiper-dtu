---
phase: 18
slug: slack-webclient-full-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm --filter sdk-verification test -- slack-webclient-base` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- {affected-test-file}`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green + `pnpm coverage:generate`
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | SLCK-07 | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | SLCK-07 | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 1 | SLCK-08 | live SDK test | `pnpm test:sdk -- slack-chat` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 1 | SLCK-08 | live SDK test | `pnpm test:sdk -- slack-conversations` | ❌ W0 | ⬜ pending |
| 18-02-03 | 02 | 1 | SLCK-08 | live SDK test | `pnpm test:sdk -- slack-users` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | SLCK-08 | live SDK test | `pnpm test:sdk -- slack-reactions` | ❌ W0 | ⬜ pending |
| 18-03-02 | 03 | 2 | SLCK-08 | live SDK test | `pnpm test:sdk -- slack-pins` | ❌ W0 | ⬜ pending |
| 18-03-03 | 03 | 2 | SLCK-08 | live SDK test | `pnpm test:sdk -- slack-views` | ❌ W0 | ⬜ pending |
| 18-04-01 | 04 | 2 | SLCK-08 | smoke test | `pnpm test:sdk -- slack-stubs-smoke` | ❌ W0 | ⬜ pending |
| 18-05-01 | 05 | 3 | SLCK-08 | manual | `pnpm coverage:generate` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/slack-webclient-base.test.ts` — SLCK-07 base behaviors (apiCall, paginate, filesUploadV2, chatStream, retry, rate-limit)
- [ ] `tests/sdk-verification/sdk/slack-chat.test.ts` — chat family expansion
- [ ] `tests/sdk-verification/sdk/slack-conversations.test.ts` — conversations family expansion
- [ ] `tests/sdk-verification/sdk/slack-users.test.ts` — users family expansion
- [ ] `tests/sdk-verification/sdk/slack-reactions.test.ts` — reactions family
- [ ] `tests/sdk-verification/sdk/slack-pins.test.ts` — pins family
- [ ] `tests/sdk-verification/sdk/slack-views.test.ts` — views family
- [ ] `tests/sdk-verification/sdk/slack-stubs-smoke.test.ts` — Tier 2 stubs smoke test

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coverage report: all WebClient members classified | SLCK-08 | Requires running `pnpm coverage:generate` and inspecting JSON output | Run `pnpm coverage:generate`, verify every WebClient member has a non-null tier (live/stub/deferred) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
