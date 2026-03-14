---
phase: 39
slug: shopify-oauth-rest-state-and-id-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts`, `twins/shopify/vitest.config.ts` |
| **Quick run command** | `rg -n "Phase 39: grant-specific OAuth validation|customerCreate via GraphQL is findable via GET /customers/:id.json|auth.begin -> authorize -> auth.callback produces a session that can GET /admin/api/2025-01/products.json|POST /admin/reset clears inventory_levels, custom_collections, and collects" tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts twins/shopify/test/integration/inventory-collection-state.test.ts` |
| **Full suite command** | `pnpm vitest run tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts twins/shopify/test/integration/rest-persistence.test.ts twins/shopify/test/integration/inventory-collection-state.test.ts twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts` |
| **Estimated runtime** | ~210 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest affected smoke command from the per-task map below. For Wave 0, use structural checks only because RED is expected by design.
- **After every plan wave:** Run the full Phase 39 Shopify suite.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 30 seconds for task-level smoke, full-suite runtime allowed at wave boundaries

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 0 | SHOP-14 / SHOP-15 / SHOP-16 / SHOP-17 | structural | `rg -n "Phase 39: grant-specific OAuth validation|customerCreate via GraphQL is findable via GET /customers/:id.json|auth.begin -> authorize -> auth.callback produces a session that can GET /admin/api/2025-01/products.json|POST /admin/reset clears inventory_levels, custom_collections, and collects" tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts twins/shopify/test/integration/inventory-collection-state.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 1 | SHOP-16 / SHOP-17 | sdk | `pnpm vitest run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ✅ exists | ⬜ pending |
| 39-02-02 | 02 | 1 | SHOP-16 | sdk smoke | `pnpm vitest run tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 1 | SHOP-14 / SHOP-15 | sdk | `pnpm vitest run tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts -t "customerCreate via GraphQL is findable via GET /customers/:id.json|orderCreate via GraphQL is findable via GET /orders/:id.json|Product.save\\(\\) persists title through PUT /admin/api/2024-01/products/:id.json|Customer.save\\(\\) persists first_name and last_name through PUT /admin/api/2024-01/customers/:id.json|Order.save\\(\\) persists name and total_price through PUT /admin/api/2024-01/orders/:id.json|Customer.all\\(\\{ ids \\}\\) returns only the requested numeric ids|Order.all\\(\\{ ids \\}\\) returns only the requested numeric ids"` | ❌ W0 | ⬜ pending |
| 39-03-02 | 03 | 1 | SHOP-14 / SHOP-15 | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/rest-persistence.test.ts` | ✅ exists | ⬜ pending |
| 39-04-01 | 04 | 2 | SHOP-15 | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/inventory-collection-state.test.ts` | ❌ W0 | ⬜ pending |
| 39-04-02 | 04 | 2 | SHOP-14 / SHOP-15 | sdk | `pnpm vitest run tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts -t "InventoryLevel.adjust/connect/set/delete round-trips through stored inventory_levels state|Location.inventory_levels\\(id=1\\) returns the connected inventory_levels row|Product.all\\(\\{ collection_id \\}\\) returns only products linked by Collect rows"` | ❌ W0 | ⬜ pending |
| 39-04-03 | 04 | 2 | SHOP-17 | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts` — RED contract tests for customer/order GID parity, REST create/update/find/filter persistence, inventory-level state, and collection filtering
- [ ] `tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts` — minimal SHOP-16 framework-readiness smoke against auth/admin flows
- [ ] `twins/shopify/test/integration/inventory-collection-state.test.ts` — route-level persistence tests for inventory levels and collection membership filters
- [ ] Wave 0 verification remains structural only; later plans are responsible for turning the new RED contracts green

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App-framework readiness stays intentionally smoke-level instead of full framework rollout | SHOP-16 | Scope judgment requires checking the resulting plan against the roadmap/requirements mismatch | Confirm the plan only proves auth/admin compatibility seams for `shopify-app-express` / `shopify-app-remix` style flows and does not expand into a full v2 framework integration phase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Task-level smoke feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
