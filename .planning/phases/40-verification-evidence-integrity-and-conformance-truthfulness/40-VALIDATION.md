---
phase: 40
slug: verification-evidence-integrity-and-conformance-truthfulness
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-14
updated: 2026-03-14
---

# Phase 40 — Validation Strategy

> Validation contract aligned to the finalized Phase 40 execution plans.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts`, `tests/sdk-verification/vitest.config.ts`, `packages/conformance/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run tests/sdk-verification/coverage/truthfulness-contract.test.ts tests/sdk-verification/drift/report-provenance.test.ts packages/conformance/test/comparator.test.ts tests/sdk-verification/sdk/slack-method-coverage.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` |
| **Full suite command** | `pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin && pnpm vitest run tests/sdk-verification/coverage/truthfulness-contract.test.ts` |
| **Estimated runtime** | ~300 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest affected command from the per-task map below.
- **After every plan wave:** Run the full suite command.
- **Before `$gsd-verify-work`:** Full suite must be green; the regenerated coverage report must include execution provenance; and the truthfulness contract must pass green.
- **Max feedback latency:** 30 seconds for task-level checks where practical; full-suite runtime is allowed at wave boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | INFRA-23 / INFRA-24 / INFRA-25 | structural | `rg -n "INFRA-23|INFRA-24|INFRA-25" .planning/REQUIREMENTS.md && rg -n "v1.2 requirements: 26 total \\(23 complete, 3 pending\\)|Mapped to phases: 26|Unmapped: 0" .planning/REQUIREMENTS.md` | ✅ exists | ⬜ pending |
| 40-01-02 | 01 | 1 | INFRA-23 / INFRA-24 / INFRA-25 | red contract | `OUTPUT=$(pnpm vitest run tests/sdk-verification/coverage/truthfulness-contract.test.ts 2>&1); STATUS=$?; printf '%s\n' "$OUTPUT"; test $STATUS -ne 0 && printf '%s' "$OUTPUT" | rg -q "Expected|Assertion" && ! printf '%s' "$OUTPUT" | rg -q "SyntaxError|Cannot find module|Failed to load"` | ✅ exists | ⬜ pending |
| 40-02-01 | 02 | 2 | INFRA-23 | integration smoke | `pnpm vitest run tests/sdk-verification/sdk/slack-method-coverage.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && test -f tests/sdk-verification/coverage/symbol-execution.json` | ✅ exists | ⬜ pending |
| 40-02-02 | 02 | 2 | INFRA-23 | full regeneration | `pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('tests/sdk-verification/coverage/coverage-report.json','utf8')); if(r.phase!=='40') process.exit(1); if((r.summary?.live ?? 0) < 222) process.exit(1);"` | ✅ exists | ⬜ pending |
| 40-03-01 | 03 | 3 | INFRA-25 | unit | `pnpm vitest run tests/sdk-verification/drift/report-provenance.test.ts` | ✅ exists | ⬜ pending |
| 40-03-02 | 03 | 3 | INFRA-25 | gate | `pnpm vitest run tests/sdk-verification/drift/report-provenance.test.ts && pnpm drift:check` | ✅ exists | ⬜ pending |
| 40-04-01 | 04 | 3 | INFRA-24 | unit + twin integration | `pnpm vitest run packages/conformance/test/comparator.test.ts && pnpm --filter @dtu/twin-slack conformance:twin && rg -n "compareValueFields: \\['ok'\\]|compareValueFields: \\['ok', 'error'\\]|comparisonMode: 'exact'|Slack conformance subset covering conversations, chat, users, and OAuth" packages/conformance/test/comparator.test.ts twins/shopify/conformance/normalizer.ts twins/slack/conformance/normalizer.ts twins/slack/conformance/index.ts twins/slack/conformance/suites/oauth.conformance.ts twins/slack/conformance/suites/chat.conformance.ts` | ✅ exists | ⬜ pending |
| 40-04-02 | 04 | 3 | INFRA-24 | proof-scope output | `pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin && pnpm vitest run tests/sdk-verification/coverage/truthfulness-contract.test.ts && rg -n "live parity|offline fixture|twin consistency" packages/conformance/src/reporter.ts` | ✅ exists | ⬜ pending |
| 40-04-03 | 04 | 3 | INFRA-25 | docs | `rg -n "Superseded by Phase 40|execution proof is separate from parity proof" .planning/phases/27-conformance-harness-coverage-infrastructure/27-VERIFICATION.md .planning/phases/32-conformance-harness-evidence/32-VERIFICATION.md .planning/phases/34-slack-build-fix-evidence-pipeline/34-VERIFICATION.md` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `REQUIREMENTS.md` definitions and traceability for `INFRA-23`, `INFRA-24`, and `INFRA-25` are explicitly planned before implementation starts.
- [x] Phase 40 has a red truthfulness contract before implementation work begins.
- [x] The final plan set includes both evidence-generation gates and a green end-of-phase truthfulness contract.
- [x] Existing infrastructure remains intact: `globalSetup` still owns twin boot/reset while Phase 40 adds helper-seam evidence instrumentation and provenance checks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coverage, conformance, and historical verification wording match the implemented proof model | INFRA-24 / INFRA-25 | Generated docs can still overclaim even when tests are green | Review the regenerated `coverage-report.json`, conformance console output, and the supersession notes in the Phase 27/32/34 verification docs. Confirm they distinguish execution proof, twin consistency smoke, offline fixture proof, and exact/live parity proof instead of collapsing them into one generic "complete" claim. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented wave dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 gaps are closed by the finalized plan set
- [x] No watch-mode flags
- [x] Feedback latency target is documented
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
