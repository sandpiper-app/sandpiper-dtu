---
phase: 28
slug: shopify-rest-pagination-version-policy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (workspace config at `vitest.shared.ts`) |
| **Config file** | `twins/shopify/vitest.config.ts` (inherits shared) |
| **Quick run command** | `pnpm vitest run --project @dtu/twin-shopify` |
| **Full suite command** | `pnpm test:sdk` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project @dtu/twin-shopify`
- **After every plan wave:** Run `pnpm test:sdk`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 0 | SHOP-23/SHOP-17 | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/pagination.test.ts` | ❌ W0 (migrate OAuth) | ⬜ pending |
| 28-01-02 | 01 | 0 | SHOP-23 | sdk-verification | `pnpm test:sdk --reporter=verbose` | ❌ W0 (extend) | ⬜ pending |
| 28-02-01 | 02 | 1 | SHOP-23 | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/pagination.test.ts` | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 1 | SHOP-23 | integration | same | ❌ W0 | ⬜ pending |
| 28-02-03 | 02 | 1 | SHOP-23 | integration | same | ❌ W0 | ⬜ pending |
| 28-02-04 | 02 | 1 | SHOP-23 | integration | same | ❌ W0 | ⬜ pending |
| 28-03-01 | 03 | 1 | SHOP-17 | integration | same | ❌ W0 | ⬜ pending |
| 28-03-02 | 03 | 1 | SHOP-17 | integration | same | ❌ W0 | ⬜ pending |
| 28-03-03 | 03 | 1 | SHOP-17 | integration | same | ✅ (phase 22) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `twins/shopify/test/integration/pagination.test.ts` — migrate `beforeEach` OAuth seeding from `POST /admin/oauth/access_token` to `POST /admin/tokens`; add test stubs for REST pagination (SHOP-23) and version policy (SHOP-17)
- [ ] `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — replace `page_info=test` sentinel tests with real multi-page assertions

*Existing infrastructure covers framework installation — Vitest already configured.*

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
