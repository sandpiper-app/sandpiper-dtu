---
phase: 06-twin-uis
plan: 05
subsystem: ui
tags: [fastify, eta, sqlite, shopify, slack, webhook, fixtures]

# Dependency graph
requires:
  - phase: 06-02
    provides: Shopify twin UI plugin with order/product/customer CRUD
  - phase: 06-03
    provides: Slack twin UI plugin with channel/user management

provides:
  - Webhook subscription create form with topic select and callback URL on webhooks page
  - Product price field across create/edit/detail/list views
  - Order create/edit form with product line item checkboxes and quantity inputs
  - POST /ui/admin/fixtures route on both Shopify and Slack twins for one-click sample data
  - Load Fixtures button on both admin dashboard pages
  - Price column added to products SQLite schema with full read/write support

affects: [07-integration, conformance-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - extractLineItems() helper pattern: parse form checkbox inputs (line_product_{id}) into JSON line_items array
    - parseLineItems() helper: reconstruct product selection map from existing order JSON for edit form pre-population
    - hasContentTypeParser() guard: prevents FST_ERR_CTP_ALREADY_PRESENT when parent scope already registered formbody

key-files:
  created: []
  modified:
    - packages/state/src/state-manager.ts
    - packages/ui/src/index.ts
    - twins/shopify/src/plugins/ui.ts
    - twins/shopify/src/views/admin/webhooks.eta
    - twins/shopify/src/views/admin/index.eta
    - twins/shopify/src/views/orders/form.eta
    - twins/shopify/test/ui.test.ts
    - twins/slack/src/plugins/ui.ts
    - twins/slack/src/views/admin/index.eta
    - twins/slack/test/ui.test.ts

key-decisions:
  - "hasContentTypeParser() guard in registerUI(): parent scope registers formbody at root; child uiPlugin must skip re-registration to avoid FST_ERR_CTP_ALREADY_PRESENT in Fastify v5"
  - "Custom orders/form.eta template: replaced include('form', it) passthrough with self-contained template that adds product line item section below standard fields"
  - "extractLineItems() as module-level function: takes stateManager as parameter rather than closure to avoid dependency on fastify instance at definition time"

patterns-established:
  - "Form line items pattern: checkbox name=line_product_{id} + number name=line_qty_{id} pairs; server extracts via prefix matching on Object.keys(data)"
  - "Fixtures button pattern: POST form action targeting /ui/admin/fixtures with redirect to /ui/admin; no request body needed"

requirements-completed:
  - UI-02
  - UI-04
  - UI-05

# Metrics
duration: 15min
completed: 2026-02-28
---

# Phase 6 Plan 05: UI Gap Closure Summary

**Webhook subscription create form, product price field throughout CRUD, order-product association via checkboxes, and Load Fixtures buttons on both twin admin pages**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-28T17:32:00Z
- **Completed:** 2026-02-28T17:47:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Products table gains `price TEXT` column; StateManager createProduct/updateProduct accept and persist price
- Webhook subscriptions page now has a create form (topic dropdown + callback URL); POST /ui/admin/webhooks creates via StateManager
- Order create/edit form renders product checkboxes with quantity inputs; line_items JSON stored on order create/update
- POST /ui/admin/fixtures on Shopify creates 2 products, 2 customers, 2 orders in one click; Slack creates 2 channels and 2 users
- Both admin pages show a Load Fixtures button alongside the existing Reset button
- 5 new tests added (4 Shopify UI + 1 Slack UI); 222/223 monorepo tests pass (1 pre-existing flaky DLQ timing test)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add product price field to schema and state manager** - `69c7d3f` (feat)
2. **Task 2: Add webhook creation form, product price fields, order line items, and Load Fixtures buttons** - `f2e9294` (feat)

## Files Created/Modified
- `packages/state/src/state-manager.ts` — Added price TEXT column to products schema, updated createProductStmt/updateProductStmt, updated createProduct/updateProduct method signatures
- `packages/ui/src/index.ts` — Added hasContentTypeParser() guard before formbody registration to prevent double-registration
- `twins/shopify/src/plugins/ui.ts` — Added parseLineItems()/extractLineItems() helpers; updated product routes to pass/process price; updated order routes to pass products list and extract line items; added POST /ui/admin/webhooks and POST /ui/admin/fixtures routes
- `twins/shopify/src/views/admin/webhooks.eta` — Added webhook create form with topic select and callback URL input above the subscriptions table
- `twins/shopify/src/views/admin/index.eta` — Added Load Fixtures section with POST form button
- `twins/shopify/src/views/orders/form.eta` — Replaced include('form', it) passthrough with self-contained template that adds product line item checkboxes section
- `twins/shopify/test/ui.test.ts` — Added 4 new tests: webhook form creation, fixtures loading, price field presence, order form with product line items
- `twins/slack/src/plugins/ui.ts` — Added POST /ui/admin/fixtures route creating sample channels and users
- `twins/slack/src/views/admin/index.eta` — Replaced text-only fixtures section with functional Load Fixtures POST form button
- `twins/slack/test/ui.test.ts` — Added load fixtures test verifying channel count increases

## Decisions Made
- **hasContentTypeParser() guard in registerUI():** Pre-existing uncommitted changes to both twin index.ts files register `@fastify/formbody` at root scope. Without the guard, `registerUI()` attempting to register it again in the child scope caused `FST_ERR_CTP_ALREADY_PRESENT` in Fastify v5. The guard checks `fastify.hasContentTypeParser('application/x-www-form-urlencoded')` before registering.
- **Self-contained orders/form.eta:** The old template used `<%~ include('form', it) %>` which passed through to the shared form partial. The new template is fully self-contained to support the product line items section that can't be expressed via the shared form partial's field array.
- **extractLineItems() as top-level function:** Defined outside the plugin function with `stateManager` as a parameter, avoiding a closure dependency on `fastify` at module definition time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed FST_ERR_CTP_ALREADY_PRESENT in registerUI() formbody registration**
- **Found during:** Task 2 (after adding UI routes)
- **Issue:** Pre-existing uncommitted changes to both twin index.ts files add `await fastify.register(formbody)` at root scope. The `registerUI()` function also registers formbody, causing Fastify v5's strict content-type-parser deduplication check to throw an unhandled exception that prevented app startup.
- **Fix:** Added `if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded'))` guard in `registerUI()` before formbody registration
- **Files modified:** `packages/ui/src/index.ts`
- **Verification:** All 222 monorepo tests pass; `@dtu/ui` package test "parses URL-encoded form body" still passes
- **Committed in:** f2e9294 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix to handle pre-existing uncommitted infrastructure changes. No scope creep.

## Issues Encountered
- Tests initially timed out (all 21 Shopify UI tests failed with 10s hook timeout) due to `FST_ERR_CTP_ALREADY_PRESENT` crashing `buildApp()`. Diagnosed via `vitest --testNamePattern` which surfaced the unhandled error. Fixed by adding `hasContentTypeParser` guard in `registerUI()`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All UAT gaps from Phase 6 UAT are now closed (webhook create, product price, order-product association, load fixtures)
- Both twin admin UIs fully functional for testing workflows
- Ready for Phase 7 (final integration and polish)

---
*Phase: 06-twin-uis*
*Completed: 2026-02-28*
