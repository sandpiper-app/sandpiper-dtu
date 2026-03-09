---
phase: 14
slug: verification-harness-foundation-legacy-gap-merge
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `tests/sdk-verification/vitest.config.ts` (Wave 0 gap) |
| **Quick run command** | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-gateway.test.ts` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk` on the modified test file only
- **After every plan wave:** Run `pnpm test:sdk` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green + drift check exits 0 + coverage-report.json present
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | SLCK-06.5 | live | `npx vitest run twins/slack --reporter=verbose` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | SLCK-06.5 | integration | `node -e "import('./twins/slack/src/index.js').then(...)"` (in-process smoke) | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | INFRA-13, INFRA-15 | setup | `npx vitest list --project sdk-verification` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | INFRA-13, INFRA-15 | setup | `node -e "const p = JSON.parse(...); console.assert(p.scripts['test:sdk'])"` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | SLCK-06.5 | live | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-gateway.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 2 | INFRA-15 | live | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-client-wire.test.ts` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 2 | INFRA-13 | unit | `pnpm test:sdk -- tests/sdk-verification/legacy/hmac-signature.test.ts tests/sdk-verification/legacy/webhook-timing.test.ts` | ❌ W0 | ⬜ pending |
| 14-04-02 | 04 | 2 | INFRA-13 | smoke | `pnpm test:sdk -- tests/sdk-verification/legacy/ui-structure.test.ts` | ❌ W0 | ⬜ pending |
| 14-05-01 | 05 | 3 | INFRA-12 | script | `npx tsx tests/sdk-verification/coverage/generate-report.ts && node -e "..."` (checks live tiers + no null tiers) | ❌ W0 | ⬜ pending |
| 14-05-02 | 05 | 3 | INFRA-14 | script | `npx tsx tests/sdk-verification/drift/check-drift.ts; echo "Exit: $?"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/vitest.config.ts` — workspace project config with globalSetup
- [ ] `tests/sdk-verification/setup/global-setup.ts` — twin boot and env var injection
- [ ] `tests/sdk-verification/helpers/shopify-client.ts` — createShopifyClient with customFetchApi
- [ ] `tests/sdk-verification/helpers/slack-client.ts` — createSlackClient with slackApiUrl
- [ ] `tests/sdk-verification/sdk/slack-auth-gateway.test.ts` — SLCK-06.5 tests
- [ ] `tests/sdk-verification/sdk/shopify-client-wire.test.ts` — Shopify SDK wire-up tests
- [ ] `tests/sdk-verification/legacy/hmac-signature.test.ts` — migrated from conformance suites
- [ ] `tests/sdk-verification/legacy/webhook-timing.test.ts` — migrated from conformance suites
- [ ] `tests/sdk-verification/legacy/ui-structure.test.ts` — migrated from conformance suites
- [ ] `tests/sdk-verification/coverage/coverage-report.json` — symbol ledger initial state
- [ ] `tests/sdk-verification/drift/check-drift.ts` — drift detection script
- [ ] `twins/slack/src/plugins/web-api/auth.ts` — auth.test and api.test routes
- [ ] `twins/slack/src/index.ts` — register authPlugin
- [ ] `package.json` (root) — add `test:sdk` script

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coverage-report.json is diffable in PRs | INFRA-12 | Requires visual inspection of PR diff | Open PR with modified coverage-report.json, verify diff is readable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
