---
phase: 39-shopify-oauth-rest-state-and-id-parity
plan: "01"
subsystem: shopify-twin
tags: [wave-0, test-contracts, oauth, rest-parity, inventory, collections, tdd]
dependency_graph:
  requires: []
  provides:
    - Wave 0 failing test contracts for Phase 39 execution plans
    - Grant-specific OAuth validation RED cases (39-02 turns GREEN)
    - GraphQL-to-REST ID parity RED cases (39-03 turns GREEN)
    - REST write persistence RED cases (39-03 turns GREEN)
    - InventoryLevel and collection state RED cases (39-03/39-04 turn GREEN)
  affects:
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts
    - tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts
    - tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts
    - twins/shopify/test/integration/inventory-collection-state.test.ts
tech_stack:
  added: []
  patterns:
    - Wave 0 RED contract pattern — write explicit failing tests before implementation
    - buildApp() + app.inject() for in-process route-level tests
    - Raw fetch() for SDK REST resource tests against live twin
key_files:
  created:
    - tests/sdk-verification/sdk/shopify-rest-state-parity.test.ts
    - tests/sdk-verification/sdk/shopify-app-framework-auth-smoke.test.ts
    - twins/shopify/test/integration/inventory-collection-state.test.ts
  modified:
    - tests/sdk-verification/sdk/shopify-api-auth.test.ts
decisions:
  - Phase 39 Wave 0 contract: 4 test files define the concrete OAuth, REST-state, and framework-readiness seams that execution plans must close
  - SHOP-16 stays smoke-level — no shopify-app-express/remix/react-router imports; auth seam exercised via base @shopify/shopify-api SDK primitives only
  - InventoryLevel tests use inventory_item_id=1 (seeded default) for stable state across resets
  - POST /admin/reset coverage uses direct stateManager.database.prepare() SQL probe so test stays valid in both stub era (table absent) and post-implementation era (table present)
metrics:
  duration: "8min"
  completed: "2026-03-14"
  tasks: 1
  files: 4
---

# Phase 39 Plan 01: Wave 0 OAuth, REST-State, and Framework-Readiness Contracts Summary

Phase 39 Wave 0 — establish the execution contract: four test files that name the concrete Shopify OAuth grant-validation, GraphQL-to-REST ID parity, REST write/filter persistence, inventory state, and collection membership gaps that the remaining Phase 39 plans must close.

## What Was Built

### shopify-api-auth.test.ts — Phase 39 OAuth block (6 new tests)

New `describe('Phase 39: grant-specific OAuth validation', ...)` block with six negative test cases against `POST /admin/oauth/access_token`:

- `returns 400 for client_credentials grant when client_secret is missing`
- `returns 400 for refresh_token grant when refresh_token is missing`
- `returns 400 for token exchange grant when subject_token is missing`
- `returns 400 for token exchange grant when subject_token_type is missing`
- `returns 400 for token exchange grant when requested_token_type is missing`
- `returns 400 for token exchange grant when requested_token_type is unsupported`

These are RED contracts — the current twin returns 200 for all passthrough grant types without validating grant-specific required fields.

### shopify-rest-state-parity.test.ts (new file, 10 test blocks)

SDK-facing parity tests for both the 39-03 and 39-04 defect clusters:

**39-03 seam (GraphQL-to-REST ID parity):**
- `customerCreate via GraphQL is findable via GET /customers/:id.json`
- `orderCreate via GraphQL is findable via GET /orders/:id.json`
- Fixture-loaded customer/order GID suffix matches REST numeric row ID

**39-04 seam (REST write/filter persistence):**
- `Product.save() persists title through PUT /admin/api/2024-01/products/:id.json`
- `Customer.save() persists first_name and last_name through PUT /admin/api/2024-01/customers/:id.json`
- `Order.save() persists name and total_price through PUT /admin/api/2024-01/orders/:id.json`
- `Customer.all({ ids }) returns only the requested numeric ids`
- `Order.all({ ids }) returns only the requested numeric ids`
- `InventoryLevel.adjust/connect/set/delete round-trips through stored inventory_levels state`
- `Location.inventory_levels(id=1) returns the connected inventory_levels row`
- `Product.all({ collection_id }) returns only products linked by Collect rows`

### shopify-app-framework-auth-smoke.test.ts (new file, 2 tests)

Smoke-only SHOP-16 coverage using `@shopify/shopify-api` primitives only:

- `auth.begin -> authorize -> auth.callback produces a session that can GET /admin/api/2025-01/products.json`
- `auth.tokenExchange -> admin Graphql client can request shop { name }`

No `shopify-app-express`, `shopify-app-remix`, or `shopify-app-react-router` imports.

### inventory-collection-state.test.ts (new file, 5 test blocks)

Route-level in-process tests (buildApp + app.inject) proving current stubs are wrong:

- `inventory_levels/connect.json, adjust.json, and set.json change the same inventory row`
- `GET /locations/1/inventory_levels.json and GET /inventory_levels.json?inventory_item_ids=<id>&location_ids=1 both surface that row`
- `DELETE /inventory_levels.json?inventory_item_id=<id>&location_id=1 removes the row`
- `POST /custom_collections.json + POST /collects.json makes GET /products.json?collection_id=<collectionId> return only linked products`
- `POST /admin/reset clears inventory_levels, custom_collections, and collects`

## Decisions Made

1. **Wave 0 contract scope:** Four files define the Phase 39 defect surface — auth validation drift (39-02), ID parity drift (39-03), REST write/filter drift (39-03), and inventory/collection state drift (39-04).
2. **SHOP-16 boundary:** Framework auth smoke stays in `@shopify/shopify-api` SDK only — no app-framework packages; keeps SHOP-16 as readiness smoke rather than framework rollout work.
3. **inventory_levels test design:** Uses `inventory_item_id=1, location_id=1` (stable seeded defaults) to avoid fixture dependency. Tests prove stub gap before implementation.
4. **reset coverage pattern:** Uses direct SQL probe via `stateManager.database.prepare()` with try/catch so test remains valid in both stub era (table absent → placeholder assertion) and post-implementation era (table present → count assertion).

## Deviations from Plan

None — plan executed exactly as written. All four files were created with exact test names required by the acceptance criteria.

The linter applied minor style improvements to `shopify-app-framework-auth-smoke.test.ts` (condensed the describe structure) while preserving all required test names and the package-free constraint.

Note: `shopify-api-auth.test.ts` Phase 39 OAuth block and `shopify-app-framework-auth-smoke.test.ts` were already committed in `83bb64e`/`1ab64e7` (feat 39-02), which had pre-executed before this plan ran. `shopify-rest-state-parity.test.ts` was already committed in `f38ffc5` (feat 39-03). This plan's commit (`8b46872`) adds `inventory-collection-state.test.ts`.

## Self-Check: PASSED

All four files exist on disk. Key commits verified:
- `8b46872`: inventory-collection-state.test.ts (this plan's primary commit)
- `1ab64e7`: shopify-app-framework-auth-smoke.test.ts (pre-committed in 39-02)
- `f38ffc5`: shopify-rest-state-parity.test.ts (pre-committed in 39-03)
- `83bb64e`: shopify-api-auth.test.ts Phase 39 block (pre-committed in 39-02)
