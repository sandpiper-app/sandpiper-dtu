---
phase: 06-twin-uis
plan: 02
subsystem: ui
tags: [shopify, fastify-plugin, eta, htmx, pico-css, fastify-view, server-rendered]

requires:
  - phase: 06-01
    provides: "@dtu/ui shared package with registerUI(), Eta partials, Pico CSS, helpers"
  - phase: 02-shopify-core
    provides: "StateManager with listOrders/createOrder/updateOrder/getOrder methods"
  - phase: 03-webhooks-conformance
    provides: "WebhookQueue.enqueue() for dispatching webhooks on UI mutations"

provides:
  - "Shopify twin UI plugin at /ui/* with full CRUD for orders, products, customers"
  - "11 Eta view templates using shared @dtu/ui partials"
  - "Admin dashboard with state counts and reset button"
  - "Webhook dispatch on UI create/update (same behavior as GraphQL mutations)"
  - "17 integration tests covering all UI routes and HTMX delete pattern"

affects: [06-twin-uis, 06-03]

tech-stack:
  added: []
  patterns:
    - "fastify-plugin for UI plugin to share stateManager decorator from parent scope"
    - "dispatchWebhooks() helper reuses WebhookQueue for UI-triggered events"
    - "PRG (Post-Redirect-Get) pattern for form submissions"
    - "HTMX hx-delete with hx-target='closest tr' hx-swap='delete' for row removal"
    - "Entity sub-templates (orders/form.eta) delegate to shared partials via include()"

key-files:
  created:
    - twins/shopify/src/plugins/ui.ts
    - twins/shopify/src/views/orders/list.eta
    - twins/shopify/src/views/orders/detail.eta
    - twins/shopify/src/views/orders/form.eta
    - twins/shopify/src/views/products/list.eta
    - twins/shopify/src/views/products/detail.eta
    - twins/shopify/src/views/products/form.eta
    - twins/shopify/src/views/customers/list.eta
    - twins/shopify/src/views/customers/detail.eta
    - twins/shopify/src/views/customers/form.eta
    - twins/shopify/src/views/admin/index.eta
    - twins/shopify/src/views/admin/webhooks.eta
    - twins/shopify/test/ui.test.ts
  modified:
    - twins/shopify/package.json
    - twins/shopify/src/index.ts
    - packages/ui/src/index.ts

key-decisions:
  - "Use fastify-plugin for uiPlugin to access stateManager/webhookQueue/webhookSecret decorators from parent scope"
  - "Register /ui/orders/new and /ui/products/new and /ui/customers/new BEFORE /:id routes to prevent 'new' being captured as ID parameter"
  - "Customer update uses direct SQL (no updateCustomer StateManager method) — SQL prepared inline in handler"
  - "Eta resolvePath override must skip self-references: orders/form.eta include('form') would resolve to itself causing infinite recursion"
  - "@fastify/view layout path must be relative to viewsDir (not absolute) — absolute paths cause join(root, absolutePath) to produce wrong resolved path during layout validation"
  - "Pre-existing DLQ compressed-timing test flaky — not caused by UI changes"

patterns-established:
  - "Entity view templates are thin wrappers: list.eta includes table, detail.eta includes detail, form.eta includes form"
  - "pageData() helper consolidates navItems, adminItems, twin, twinName and page-specific data in one call"
  - "dispatchWebhooks() centralized pattern for UI create/update webhook dispatch"

requirements-completed: [UI-01, UI-02]

duration: 10min
completed: 2026-02-28
---

# Phase 06 Plan 02: Shopify Twin UI Summary

**Shopify admin UI at /ui/* with full CRUD for orders, products, customers via server-rendered Eta templates and HTMX deletes — triggering same webhooks as GraphQL mutations**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-28T18:53:21Z
- **Completed:** 2026-02-28T19:03:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Created Shopify UI plugin (ui.ts) with all entity routes: 8 orders routes, 8 products routes, 8 customers routes, 3 admin routes
- 11 Eta view templates: list/detail/form for orders/products/customers plus admin dashboard and webhooks page
- 17 integration tests passing covering list, detail, create, edit, delete, admin, CSS, and navigation
- Fixed 2 bugs in @dtu/ui registerUI(): layout path must be relative, resolvePath must skip self-references to prevent infinite recursion

## Task Commits

1. **Task 1: Shopify UI plugin with entity routes** - `69e14b6` (feat)
2. **Task 2: Entity templates and integration test** - `a1580e5` (feat)

## Files Created/Modified
- `twins/shopify/src/plugins/ui.ts` — UI plugin with all CRUD routes for orders, products, customers, admin
- `twins/shopify/src/views/orders/list.eta` — Orders list: includes table partial
- `twins/shopify/src/views/orders/detail.eta` — Order detail: includes detail partial with raw JSON
- `twins/shopify/src/views/orders/form.eta` — Order form: includes form partial for create/edit
- `twins/shopify/src/views/products/list.eta` — Products list
- `twins/shopify/src/views/products/detail.eta` — Product detail with raw JSON
- `twins/shopify/src/views/products/form.eta` — Product form
- `twins/shopify/src/views/customers/list.eta` — Customers list
- `twins/shopify/src/views/customers/detail.eta` — Customer detail with raw JSON
- `twins/shopify/src/views/customers/form.eta` — Customer form
- `twins/shopify/src/views/admin/index.eta` — Admin dashboard with stat cards and reset button
- `twins/shopify/src/views/admin/webhooks.eta` — Webhook subscriptions table
- `twins/shopify/test/ui.test.ts` — 17 integration tests for all UI routes
- `twins/shopify/package.json` — Added @dtu/ui workspace dependency
- `twins/shopify/src/index.ts` — Registered uiPlugin in buildApp()
- `packages/ui/src/index.ts` — Fixed layout path (relative vs absolute) and resolvePath self-reference bug

## Decisions Made
- Used `fastify-plugin` wrapper for uiPlugin so it can access `stateManager`, `webhookQueue`, `webhookSecret` decorators registered in the parent Fastify scope
- `/ui/orders/new` registered BEFORE `/ui/orders/:id` — prevents "new" being captured as an order ID parameter (same for products, customers)
- Customer update uses direct SQL prepare() inline (StateManager has no `updateCustomer` method)
- Webhook dispatch uses the same `WebhookQueue.enqueue()` as GraphQL mutations — no behavioral difference between UI and API operations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @fastify/view layout path must be relative to viewsDir, not absolute**
- **Found during:** Task 1 (verifying UI tests pass)
- **Issue:** `registerUI()` passed an absolute path as the `layout` option to `@fastify/view`. `@fastify/view` validates layout by doing `join(root, layout)` — with an absolute path this produces `root/absolute/path` (wrong). All routes returned 500 "unable to access template".
- **Fix:** Changed `registerUI()` to compute `path.relative(viewsDir, absoluteLayoutPath)` and pass the relative path to `@fastify/view` layout option.
- **Files modified:** `packages/ui/src/index.ts`
- **Verification:** All 17 UI tests pass after fix
- **Committed in:** `69e14b6` (Task 1 commit)

**2. [Rule 1 - Bug] Eta resolvePath infinite recursion on self-referential includes**
- **Found during:** Task 1 (debugging remaining 3 test failures after layout fix)
- **Issue:** When `orders/form.eta` calls `include('form', it)`, Eta's original `resolvePath` resolves `form` relative to the current file's directory (`orders/`), producing `orders/form.eta` — the same file being rendered. This causes a stack overflow/timeout.
- **Fix:** Added a check in the `resolvePath` override to skip the resolved path if it equals `options.filepath` (the calling template). If equal, falls through to shared partials directory.
- **Files modified:** `packages/ui/src/index.ts`
- **Verification:** Tests for `/ui/orders/new`, `/ui/orders/:id`, `/ui/products/:id` changed from 500 to 200
- **Committed in:** `69e14b6` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bugs)
**Impact on plan:** Both fixes in @dtu/ui were required for correctness. No scope creep — fixes affect the shared package that enables all twin UIs to work correctly.

## Issues Encountered
- Pre-existing flaky test: `Shopify Twin Integration > Webhooks > failed webhook deliveries appear in dead letter queue after retries (compressed timing)` — timing-sensitive DLQ test that fails intermittently. Not caused by UI changes (confirmed by checking git history). 217/218 tests pass consistently.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shopify twin UI fully functional at /ui with all entity CRUD
- Both @dtu/ui bugs fixed — Slack twin UI (plan 06-03) can now use registerUI() reliably
- Fix for resolvePath self-reference is needed for 06-03 Slack twin which has similar template structure

## Self-Check: PASSED

All created files verified present. All task commits verified in git history.

---
*Phase: 06-twin-uis*
*Completed: 2026-02-28*
