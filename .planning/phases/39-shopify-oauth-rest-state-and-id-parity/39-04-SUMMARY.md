---
phase: 39-shopify-oauth-rest-state-and-id-parity
plan: 04
subsystem: shopify-twin
tags: [sqlite, inventory, collections, rest, state-management, reset-coverage, version-routing]
dependency_graph:
  requires: [39-03]
  provides: [SHOP-14, SHOP-15, SHOP-17]
  affects: [packages/state, twins/shopify, tests/sdk-verification]
tech_stack:
  added: []
  patterns: [two-step-GID, UPSERT-ON-CONFLICT, dbBefore-dbAfter-reset, version-routing-regression]
key_files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/db/schema.sql
    - twins/shopify/src/plugins/rest.ts
    - twins/shopify/test/integration.test.ts
    - twins/shopify/test/integration/pagination.test.ts
decisions:
  - "SQLite UPSERT (INSERT ... ON CONFLICT ... DO UPDATE) used for setInventoryLevel; for connectInventoryLevel INSERT ... DO NOTHING is correct (connect never overwrites existing available)"
  - "adjustInventoryLevel returns null (not throws) when row doesn't exist; REST layer maps null to 404 {errors: 'Not Found'}"
  - "Custom collection GID follows two-step pattern: temp GID insert → createCustomCollection() → UPDATE SET gid = canonical GID after AUTOINCREMENT resolves"
  - "listProductsByCollectionId uses JOIN between products and collects tables — no denormalization, all reads derive from stored rows"
  - "collection_id filter in GET /products.json is applied after since_id and ids filters, using the collects join result as a Set for O(1) membership test"
metrics:
  duration: 7min
  completed: 2026-03-14
  tasks_completed: 3
  files_changed: 5
---

# Phase 39 Plan 04: Inventory and Collection State Summary

**One-liner:** SQLite-backed inventory_levels, custom_collections, and collects persistence with StateManager lifecycle compliance and versioned REST routes replacing all remaining stubs.

## What Was Built

### Task 1: Reset-safe SQLite persistence for inventory levels and collection membership

Added three new tables to `StateManager.runMigrations()`:
- `inventory_levels (id, inventory_item_id, location_id, available, created_at, updated_at, UNIQUE(inventory_item_id, location_id))`
- `custom_collections (id, gid, title, handle, created_at, updated_at)`
- `collects (id, collection_id, product_id, position, created_at, updated_at, UNIQUE(collection_id, product_id))`

Added 15 new prepared statement fields and nulled them in both `reset()` and `close()`.

Added 11 public methods:
- `connectInventoryLevel`, `adjustInventoryLevel`, `setInventoryLevel`, `deleteInventoryLevel`, `listInventoryLevels`
- `createCustomCollection`, `getCustomCollection`, `listCustomCollections`
- `createCollect`, `getCollect`, `listCollects`, `listProductsByCollectionId`

State package rebuilt before twin test run.

### Task 2: State-backed REST routes replacing stubs

Replaced 8 stub handlers in `rest.ts` and added 6 new handlers:

Inventory:
- `GET /inventory_levels.json` — now queries `listInventoryLevels({ inventoryItemIds, locationIds })`
- `GET /locations/:id/inventory_levels.json` — now queries `listInventoryLevels({ locationIds: [id] })`
- `POST /inventory_levels/connect.json` — calls `connectInventoryLevel`
- `POST /inventory_levels/adjust.json` — calls `adjustInventoryLevel`; returns 404 when row missing
- `POST /inventory_levels/set.json` — calls `setInventoryLevel` (UPSERT)
- `DELETE /inventory_levels.json` — calls `deleteInventoryLevel`; returns 404 when row missing

Collections:
- `GET /custom_collections.json` — reads from `listCustomCollections()`
- `POST /custom_collections.json` — two-step GID insert via `createCustomCollection`
- `GET /custom_collections/:id.json` — reads from `getCustomCollection(id)`
- `GET /collects.json` — reads from `listCollects({ collectionId? })`
- `POST /collects.json` — calls `createCollect`
- `GET /collects/:id.json` — reads from `getCollect(id)`

Products:
- `GET /products.json?collection_id=X` — new filter applied after existing `since_id` and `ids` filters using `listProductsByCollectionId(collectionId)` as a Set for membership testing

Route ordering maintained: specific sub-paths (`connect`, `adjust`, `set`) before the base `DELETE /inventory_levels.json`; `GET/POST` list routes before `/:id` routes.

### Task 3: Reset and version-routing regressions

Added to `integration.test.ts` (inside `XCUT-01: v1.2 tables cleared on reset`):
- `inventory_levels is empty after reset` — seeds row via `dbBefore`, calls reset, asserts `COUNT(*) = 0` via `dbAfter`
- `custom_collections is empty after reset` — same pattern
- `collects is empty after reset` — same pattern

Added to `pagination.test.ts` (new describe block `Collection-filter version-routing regression`):
- Creates a product, collection, and collect via mixed API versions (2025-01 and 2024-01)
- Asserts `GET /admin/api/2025-01/products.json?collection_id=<id>` and `GET /admin/api/2024-01/products.json?collection_id=<id>` return the same product IDs
- Asserts the `2025-01` response echoes `x-shopify-api-version: 2025-01`

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| inventory-collection-state.test.ts | 5 | GREEN |
| integration.test.ts | 51 | GREEN |
| pagination.test.ts | 15 | GREEN |
| **Total** | **71** | **GREEN** |

## Self-Check: PASSED

All key files confirmed present. All commits confirmed in git log.

| Check | Result |
|-------|--------|
| packages/state/src/state-manager.ts | FOUND |
| twins/shopify/src/db/schema.sql | FOUND |
| twins/shopify/src/plugins/rest.ts | FOUND |
| twins/shopify/test/integration.test.ts | FOUND |
| twins/shopify/test/integration/pagination.test.ts | FOUND |
| commit 2b368b4 (Task 1) | FOUND |
| commit 69ec7c8 (Task 3) | FOUND |
