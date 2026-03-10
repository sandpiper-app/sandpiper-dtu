---
phase: 20
slug: bolt-alternate-receivers-drift-automation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -E "(PASS\|FAIL\|✓\|✗)"` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm drift:check`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** `pnpm test:sdk && pnpm drift:check` — both green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | SLCK-12 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | SLCK-12 | unit | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | SLCK-12 | unit | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | ❌ W0 | ⬜ pending |
| 20-01-04 | 01 | 1 | SLCK-12 | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | INFRA-14 | unit | `pnpm drift:check` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | INFRA-14 | ledger | `pnpm coverage:generate && pnpm drift:check` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts` — stubs for SLCK-12 (SocketModeReceiver)
- [ ] `tests/sdk-verification/sdk/slack-bolt-aws-lambda-receiver.test.ts` — stubs for SLCK-12 (AwsLambdaReceiver)
- [ ] `POST /api/apps.connections.open` route in Slack twin (new stub)
- [ ] `POST /admin/set-wss-url` admin endpoint in Slack twin
- [ ] `setWssUrl(url)` / `getWssUrl()` methods in `SlackStateManager`
- [ ] Manifest staleness gate in `check-drift.ts` (replacing TODO at line 151)
- [ ] Phase 20 LIVE_SYMBOLS entries in `generate-report.ts`

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
