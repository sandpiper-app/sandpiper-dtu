---
phase: 15
slug: shopify-admin-client-compatibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `tests/sdk-verification/vitest.config.ts` |
| **Quick run command** | `pnpm test:sdk --reporter=verbose` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:sdk --reporter=verbose`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SHOP-08 | live twin | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | SHOP-08 | client-side | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | SHOP-08 | live twin | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | SHOP-09 | live twin | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | SHOP-09 | live twin | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 1 | SHOP-09 | live twin | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |
| 15-02-04 | 02 | 1 | SHOP-09 | live twin | `pnpm test:sdk --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts` — stubs for SHOP-08 (GraphQL methods)
- [ ] `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` — stubs for SHOP-09 (REST methods)
- [ ] `tests/sdk-verification/helpers/shopify-rest-client.ts` — `createRestClient()` factory
- [ ] `twins/shopify/src/plugins/rest.ts` — REST stub plugin with GET/POST/PUT/DELETE routes
- [ ] Register `restPlugin` in twin entry point

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
