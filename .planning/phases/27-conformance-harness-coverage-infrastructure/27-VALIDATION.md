---
phase: 27
slug: conformance-harness-coverage-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `tests/sdk-verification/vitest.config.ts` (sdk-verification project), `packages/conformance/vitest.config.ts` (conformance project) |
| **Quick run command** | `vitest run --project conformance packages/conformance/test/comparator.test.ts` |
| **Full suite command** | `pnpm test:sdk && pnpm drift:check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `vitest run --project conformance packages/conformance/test/comparator.test.ts`
- **After every plan wave:** Run `pnpm test:sdk && pnpm drift:check`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | INFRA-21 | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 27-01-02 | 01 | 1 | INFRA-21 | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 27-01-03 | 01 | 1 | INFRA-21 | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 27-02-01 | 02 | 2 | INFRA-22 | integration | `tsx tests/sdk-verification/coverage/generate-report-evidence.ts` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | INFRA-22 | integration | `pnpm drift:check` | ✅ (needs 202-gate) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test cases in `packages/conformance/test/comparator.test.ts` — bidirectional checks, full array traversal, exact mode, sortFields
- [ ] `tests/sdk-verification/coverage/generate-report-evidence.ts` — new evidence generator script (INFRA-22)
- [ ] `tests/sdk-verification/coverage/vitest-evidence.json` — add to `.gitignore` (generated artifact)
- [ ] Smoke test: verify `ShopifyTwinAdapter.init()` still works after Phase 23 OAuth changes

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `LIVE_SYMBOLS` removed after evidence >= 202 confirmed | INFRA-22 | One-time migration step | `grep -c LIVE_SYMBOLS tests/sdk-verification/coverage/generate-report.ts` should return 0 after migration |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
