---
phase: 10-tech-debt-cleanup
plan: 01
subsystem: api
tags: [graphql, inventory, statemanager, sqlite, eta, ui]

requires:
  - phase: 02-shopify-twin-core
    provides: GraphQL schema patterns, StateManager CRUD patterns, admin plugin patterns
  - phase: 06-twin-uis
    provides: UI plugin patterns, Eta template structure, shared partials
provides:
  - InventoryItem CRUD methods in StateManager
  - InventoryItem GraphQL queries and mutation
  - Inventory UI views in Shopify twin
  - Inventory fixture loading via admin endpoint
affects: [shopify-twin, conformance]

tech-stack:
  added: []
  patterns:
    - "InventoryItem follows exact product CRUD pattern in StateManager"
    - "Inventory UI uses shared @dtu/ui partials (table, detail, form)"

key-files:
  created:
    - twins/shopify/src/views/inventory/list.eta
    - twins/shopify/src/views/inventory/detail.eta
    - twins/shopify/src/views/inventory/form.eta
  modified:
    - packages/state/src/state-manager.ts
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/plugins/ui.ts

key-decisions:
  - "sku made nullable in GraphQL schema (matching real Shopify API where sku is optional)"
  - "No inventoryItemCreate mutation (Shopify has no such mutation); creation via admin fixtures endpoint and UI"
  - "Boolean tracked stored as 0/1 integer in SQLite, converted in TypeScript layer"

patterns-established:
  - "InventoryItem CRUD follows products pattern: prepared statements, init/reset/close null, public methods"

requirements-completed: [SHOP-01]

duration: 8min
completed: 2026-03-01
---

# Phase 10 Plan 01: Wire up InventoryItem Summary

**Full InventoryItem CRUD in StateManager with GraphQL queries/mutation, admin fixtures, state endpoint, and Shopify twin UI views**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-01T02:15:00Z
- **Completed:** 2026-03-01T02:23:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- InventoryItem fully queryable via GraphQL with cursor pagination (inventoryItems, inventoryItem)
- InventoryItem updatable via inventoryItemUpdate mutation with error simulation support
- Admin fixtures endpoint loads inventory items with auto-generated GIDs
- Admin state endpoint reports inventory item count
- Shopify twin UI has Inventory section with list, detail, and edit views

## Task Commits

Each task was committed atomically:

1. **Task 1: Add InventoryItem CRUD to StateManager and wire GraphQL schema + resolvers** - `bd4b68d` (feat)
2. **Task 2: Extend admin fixtures/state and add Inventory UI views** - `c5acf4b` (feat)

## Files Created/Modified
- `packages/state/src/state-manager.ts` - Added 5 prepared statements, 5 CRUD methods, null in reset/close
- `twins/shopify/src/schema/schema.graphql` - InventoryItem type updated, connection types, query fields, mutation input/payload
- `twins/shopify/src/schema/resolvers.ts` - inventoryItems/inventoryItem query resolvers, inventoryItemUpdate mutation resolver, InventoryItem type resolver
- `twins/shopify/src/plugins/admin.ts` - Fixtures loading and state endpoint for inventory items
- `twins/shopify/src/plugins/ui.ts` - Inventory nav item, CRUD routes (list, detail, new, edit, create, update, delete)
- `twins/shopify/src/views/inventory/list.eta` - Inventory list view using shared table partial
- `twins/shopify/src/views/inventory/detail.eta` - Inventory detail view using shared detail partial
- `twins/shopify/src/views/inventory/form.eta` - Inventory form using shared form partial

## Decisions Made
- Made sku nullable in GraphQL schema (real Shopify API has sku as optional on InventoryItem)
- No inventoryItemCreate mutation since Shopify has no such mutation; creation via admin fixtures and UI only
- Boolean tracked field stored as integer 0/1 in SQLite; converted via ternary in TypeScript

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null vs undefined type mismatch in UI plugin**
- **Found during:** Task 2 (UI plugin inventory routes)
- **Issue:** `sku: data.sku || null` caused TS2322 error because createInventoryItem expects `sku?: string` (undefined, not null)
- **Fix:** Changed to `sku: data.sku || undefined` in both create and update UI routes
- **Files modified:** twins/shopify/src/plugins/ui.ts
- **Verification:** tsc --build succeeds
- **Committed in:** c5acf4b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type fix for null/undefined compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- InventoryItem is fully wired, ready for verification
- All 134 existing Shopify twin tests pass with no regressions

---
*Phase: 10-tech-debt-cleanup*
*Completed: 2026-03-01*
