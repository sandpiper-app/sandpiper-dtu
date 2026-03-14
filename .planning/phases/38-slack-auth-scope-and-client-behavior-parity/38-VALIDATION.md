---
phase: 38
slug: slack-auth-scope-and-client-behavior-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-*` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~40 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-*`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 0 | SLCK-20 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-auth-parity.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 0 | SLCK-21 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-03 | 01 | 0 | SLCK-22 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-04 | 01 | 0 | SLCK-23 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-auth-parity.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-01 | 02 | 1 | SLCK-20 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-auth-parity.test.ts tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` | ✅ | ⬜ pending |
| 38-02-02 | 02 | 1 | SLCK-23 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-auth-parity.test.ts tests/sdk-verification/sdk/slack-auth-gateway.test.ts` | ✅ | ⬜ pending |
| 38-03-01 | 03 | 1 | SLCK-21 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts tests/sdk-verification/sdk/slack-conversations.test.ts tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | ✅ | ⬜ pending |
| 38-04-01 | 04 | 1 | SLCK-22 | integration | `pnpm test:sdk -- --run tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts tests/sdk-verification/sdk/slack-webclient-base.test.ts twins/slack/test/integration.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/slack-auth-parity.test.ts` — OIDC round-trip, oauth.v2.access secret/scope fidelity, app-token enforcement, user-token `auth.test`
- [ ] `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` — `conversations.list/info/history` dynamic scope requirements by type/class
- [ ] `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` — `filesUploadV2` completion payload, `response_url` replace/delete behavior
- [ ] `38-VALIDATION.md` keeps `SLCK-23` mapped to auth-specific verification rows (`38-01-04`, `38-02-02`) rather than client-behavior-only rows

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | n/a | All Phase 38 behaviors should be automated through SDK/integration tests | n/a |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing parity assertions named in research
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
