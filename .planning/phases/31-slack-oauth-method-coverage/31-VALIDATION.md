---
phase: 31
slug: slack-oauth-method-coverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` (or `slack-scope-enforcement.test.ts` for OAuth tasks)
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green + `pnpm coverage:generate` shows increased live count
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | SLCK-14 | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | SLCK-14 | verification | `pnpm coverage:generate 2>&1 \| grep -E "live\|deferred"` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 2 | SLCK-18 | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 2 | SLCK-18 | regression | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test cases in `tests/sdk-verification/sdk/slack-method-coverage.test.ts` for `slackLists.*`, `rtm.*`, and `entity.*` families
- [ ] EVIDENCE_MAP additions in `tests/sdk-verification/coverage/generate-report-evidence.ts` for Phase 25/26 test files
- [ ] New test case in `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` for `redirect_uri` mismatch
- [ ] New test case in `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` for missing scope at authorize

*Existing test infrastructure covers all fixtures: `seedSlackBotToken`, `SLACK_API_URL`. No new framework install required.*

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
