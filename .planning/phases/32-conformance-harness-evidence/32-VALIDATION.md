---
phase: 32
slug: conformance-harness-evidence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `packages/conformance/vitest.config.ts` |
| **Quick run command** | `npx vitest run packages/conformance/test/comparator.test.ts` |
| **Full suite command** | `pnpm test:sdk && pnpm drift:check` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run packages/conformance/test/comparator.test.ts`
- **After every plan wave:** Run `pnpm test:sdk && pnpm drift:check`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | INFRA-21 | unit | `npx vitest run packages/conformance/test/comparator.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 32-01-02 | 01 | 1 | INFRA-21 | unit | `npx vitest run packages/conformance/test/comparator.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 32-01-03 | 01 | 1 | INFRA-21 | build | `pnpm -F @dtu/conformance build && grep compareValueFields packages/conformance/dist/types.d.ts` | ✅ | ⬜ pending |
| 32-02-01 | 02 | 1 | INFRA-22 | integration | `pnpm drift:check` | ✅ (gate value needs update) | ⬜ pending |
| 32-02-02 | 02 | 1 | INFRA-22 | script | `npx tsx tests/sdk-verification/coverage/generate-report-evidence.ts` | ✅ | ⬜ pending |
| 32-02-03 | 02 | 1 | INFRA-22 | manual | `grep -c 'INTEGRATION-TEST EXCLUSIONS' tests/sdk-verification/coverage/generate-report-evidence.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] 2 new test cases in `packages/conformance/test/comparator.test.ts` — `compareValueFields` mismatch detection and matching pass
- [ ] Integration-test exclusion comment block in `generate-report-evidence.ts` (covers INFRA-22 "how local-only utilities are excluded")

*All other required files exist. No new files need to be created.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Integration-test exclusion comment documents `slack-signing.test.ts` and `slack-state-tables.test.ts` | INFRA-22 | Documentation check, not behavior | `grep -c 'INTEGRATION-TEST EXCLUSIONS' tests/sdk-verification/coverage/generate-report-evidence.ts` returns 1 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
