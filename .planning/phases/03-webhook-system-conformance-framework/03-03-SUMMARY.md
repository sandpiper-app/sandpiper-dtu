---
phase: 03-webhook-system-conformance-framework
plan: 03
subsystem: testing
tags: [shopify, webhooks, conformance, dlq, graphql, tsx, github-actions, deep-diff]

# Dependency graph
requires:
  - phase: 03-webhook-system-conformance-framework
    plan: 01
    provides: "@dtu/webhooks WebhookQueue, SqliteDeadLetterStore - integrated into twin"
  - phase: 03-webhook-system-conformance-framework
    plan: 02
    provides: "@dtu/conformance ConformanceAdapter, ConformanceSuite, ConformanceRunner, CLI"
  - phase: 02-shopify-core-twin
    provides: Shopify twin buildApp(), StateManager, GraphQL resolvers, admin endpoints

provides:
  - "Shopify twin with @dtu/webhooks queue replacing all fire-and-forget sendWebhook() calls"
  - "DLQ admin endpoints: GET/DELETE /admin/dead-letter-queue and per-entry operations"
  - "webhookSubscriptionCreate GraphQL mutation for managing subscriptions via API"
  - "ShopifyTwinAdapter using buildApp()/inject() for in-process conformance testing"
  - "ShopifyLiveAdapter using fetch() for real Shopify dev store conformance testing"
  - "Orders, products, and webhook conformance suites (10 total tests)"
  - "CI workflow running twin conformance on every push, live conformance weekly"

affects:
  - 04-shopify-advanced-features
  - 05-slack-twin

# Tech tracking
tech-stack:
  added:
    - "node --import tsx/esm: ESM TypeScript loader for running TS conformance files without compilation"
  patterns:
    - "Conformance adapter pattern: ShopifyTwinAdapter wraps buildApp()/inject() for zero-network testing"
    - "tsx/esm loader: use 'node --import tsx/esm' to run compiled CLI with TypeScript source adapters"
    - "DLQ endpoints: /admin/dead-letter-queue with list/get/delete/retry operations"
    - "Compressed timing: WEBHOOK_TIME_SCALE=0.001 in tests for fast retry assertion"
    - "webhookSubscriptionCreate: GraphQL mutation as alternative to config-file subscriptions"

key-files:
  created:
    - twins/shopify/conformance/adapters/twin-adapter.ts
    - twins/shopify/conformance/adapters/live-adapter.ts
    - twins/shopify/conformance/suites/orders.conformance.ts
    - twins/shopify/conformance/suites/products.conformance.ts
    - twins/shopify/conformance/suites/webhooks.conformance.ts
    - twins/shopify/conformance/normalizer.ts
    - twins/shopify/conformance/index.ts
    - twins/shopify/conformance/fixtures/.gitkeep
    - twins/shopify/tsconfig.conformance.json
    - .github/workflows/conformance.yml
  modified:
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/plugins/graphql.ts
    - twins/shopify/test/integration.test.ts
    - twins/shopify/package.json
    - twins/shopify/tsconfig.json
    - packages/conformance/src/comparator.ts
  deleted:
    - twins/shopify/src/services/webhook-sender.ts

key-decisions:
  - "tsx/esm loader (not compilation): conformance TS files run via 'node --import tsx/esm' against compiled CLI - simpler than adding separate tsconfig build"
  - "Reset endpoint does NOT clear DLQ: StateManager.reset() closes and reopens SQLite DB, invalidating DLQ store's cached DB reference"
  - "deep-diff import fix: changed from 'import { diff }' to default import with .diff accessor for CJS/ESM interop compatibility"
  - "webhookSubscriptionCreate resolver queries listWebhookSubscriptions() to get created ID since createWebhookSubscription() returns void"

patterns-established:
  - "Conformance suite structure: normalizer + suites array + setup/teardown per test"
  - "Twin adapter: init() does OAuth, execute() handles both REST and GraphQL via inject()"
  - "Live adapter: validates credentials in init(), uses fetch() in execute()"
  - "CI strategy: twin conformance on every push (fast, no credentials), live conformance weekly (requires secrets)"

requirements_completed: [INFRA-06]

# Metrics
duration: 14min
completed: 2026-02-28
---

# Phase 3 Plan 03: Shopify Integration Summary

**Shopify twin wired to @dtu/webhooks async queue, DLQ admin API, GraphQL webhook subscription management, and 10-test conformance suite runnable with single command**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-28T04:53:21Z
- **Completed:** 2026-02-28T05:07:00Z
- **Tasks:** 2
- **Files modified:** 18 (including 1 deleted)

## Accomplishments
- Replaced all 6 fire-and-forget `sendWebhook()` calls in resolvers with `webhookQueue.enqueue()` via shared `enqueueWebhooks()` helper
- Added 5 DLQ admin endpoints (list, get, retry, clear, delete-single) with correct error responses
- Added `webhookSubscriptionCreate` GraphQL mutation + schema types for API-based subscription management
- Created ShopifyTwinAdapter (buildApp+inject) and ShopifyLiveAdapter (fetch-based) conformance adapters
- Created 10 conformance tests across orders, products, and webhook suites — all pass in twin mode
- CI workflow runs twin conformance on every push to main, live conformance on weekly schedule

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate @dtu/webhooks and add DLQ admin endpoints** - `c18d617` (feat)
2. **Task 2: Create conformance adapters, suites, CI workflow** - `3ce827c` (feat)
3. **Cleanup: Remove deprecated webhook-sender.ts** - `f4bf34c` (chore)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `twins/shopify/src/schema/resolvers.ts` - All mutations use `webhookQueue.enqueue()`, added `webhookSubscriptionCreate` mutation resolver
- `twins/shopify/src/schema/schema.graphql` - Added WebhookSubscription type, WebhookSubscriptionInput, WebhookSubscriptionCreatePayload, mutation
- `twins/shopify/src/plugins/admin.ts` - Added 5 DLQ endpoints + `deadLetterStore`/`webhookQueue` decorator types
- `twins/shopify/src/plugins/graphql.ts` - Passes `webhookQueue` into GraphQL context
- `twins/shopify/test/integration.test.ts` - Added 8 new tests: webhookSubscriptionCreate, DLQ endpoints, DLQ retry flow (37 total)
- `twins/shopify/package.json` - Added conformance:twin/live/offline/record scripts using `node --import tsx/esm`
- `twins/shopify/tsconfig.json` - Added @dtu/webhooks and @dtu/conformance references
- `twins/shopify/conformance/adapters/twin-adapter.ts` - ShopifyTwinAdapter using buildApp()/inject()
- `twins/shopify/conformance/adapters/live-adapter.ts` - ShopifyLiveAdapter using fetch() with credential validation
- `twins/shopify/conformance/suites/orders.conformance.ts` - Create, list, validation tests
- `twins/shopify/conformance/suites/products.conformance.ts` - Create, list, validation tests
- `twins/shopify/conformance/suites/webhooks.conformance.ts` - Subscription create, state visibility, delivery tests
- `twins/shopify/conformance/normalizer.ts` - Shopify field normalizer (strip timestamps, normalize IDs)
- `twins/shopify/conformance/index.ts` - Combined shopifyConformanceSuite + re-exports
- `.github/workflows/conformance.yml` - CI with twin (push) and live (schedule) jobs
- `packages/conformance/src/comparator.ts` - Fixed deep-diff import for CJS/ESM interop

## Decisions Made

- **tsx/esm loader strategy:** Used `node --import tsx/esm node_modules/@dtu/conformance/dist/cli.js` instead of compiling conformance TS files. The compiled CLI dynamically imports TS source files with tsx handling transpilation. This avoids a separate tsconfig/build step for the conformance directory.

- **DLQ not cleared on reset:** `StateManager.reset()` closes and reopens the SQLite DB connection. The `SqliteDeadLetterStore` holds a reference to the OLD connection instance. Calling `deadLetterStore.clear()` after `stateManager.reset()` throws. Solution: DLQ clearing is an explicit operation via `DELETE /admin/dead-letter-queue`.

- **deep-diff ESM interop:** Changed `import { diff } from 'deep-diff'` to default import with `.diff` accessor. The original named import fails when tsx loads the conformance package source under Node's strict ESM resolution.

- **webhookSubscriptionCreate ID lookup:** `StateManager.createWebhookSubscription()` returns `void`. After creation, the resolver calls `listWebhookSubscriptions()` and finds the matching subscription by topic+callbackUrl to get the ID for the GID.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DLQ clear breaks on reset due to shared DB connection lifecycle**
- **Found during:** Task 1 (testing the reset endpoint)
- **Issue:** `stateManager.reset()` closes and recreates the SQLite DB connection. `deadLetterStore.clear()` was called after reset, but the store holds a reference to the now-closed DB instance, causing a 500 error.
- **Fix:** Removed `deadLetterStore.clear()` from the reset handler with a comment explaining why. DLQ clearing is an explicit operation via the dedicated endpoint.
- **Files modified:** `twins/shopify/src/plugins/admin.ts`
- **Verification:** All 37 tests pass, reset returns 200
- **Committed in:** c18d617 (Task 1 commit)

**2. [Rule 1 - Bug] deep-diff named import fails under tsx/esm ESM resolution**
- **Found during:** Task 2 (testing `pnpm run conformance:twin`)
- **Issue:** `import { diff } from 'deep-diff'` throws `SyntaxError: The requested module 'deep-diff' does not provide an export named 'diff'` when the conformance package source is loaded by tsx under strict ESM. `deep-diff` is CommonJS.
- **Fix:** Changed to `import deepDiffModule from 'deep-diff'; const diff = deepDiffModule.diff ?? deepDiffModule;` for cross-environment compatibility.
- **Files modified:** `packages/conformance/src/comparator.ts`
- **Verification:** All 11 conformance package tests pass, conformance:twin runs 10/10 tests passing
- **Committed in:** 3ce827c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both essential for correctness. No scope creep.

## Issues Encountered

- `webhookSubscriptionCreate` could not return an ID directly because `StateManager.createWebhookSubscription()` returns `void`. Resolved by querying the subscription list after creation to find the matching entry.

## User Setup Required

None for twin and offline conformance modes. For live conformance:
- Set `SHOPIFY_STORE_URL=https://mystore.myshopify.com`
- Set `SHOPIFY_ACCESS_TOKEN=<admin API token>`
- In CI: add `SHOPIFY_STORE_URL` and `SHOPIFY_ACCESS_TOKEN` as repository secrets

## Next Phase Readiness

- Phase 3 complete — @dtu/webhooks + @dtu/conformance packages built and integrated into Shopify twin
- Shopify twin has production-grade async webhooks, DLQ inspection, and GraphQL subscription management
- Conformance framework ready for reuse in Phase 5 (Slack twin) via same adapter pattern
- Phase 4 (Shopify Advanced Features) can build on this foundation
- No blockers

## Self-Check: PASSED

- FOUND: twins/shopify/conformance/adapters/twin-adapter.ts
- FOUND: twins/shopify/conformance/adapters/live-adapter.ts
- FOUND: twins/shopify/conformance/suites/orders.conformance.ts
- FOUND: twins/shopify/conformance/suites/products.conformance.ts
- FOUND: twins/shopify/conformance/suites/webhooks.conformance.ts
- FOUND: .github/workflows/conformance.yml
- FOUND: commit c18d617
- FOUND: commit 3ce827c
- FOUND: commit f4bf34c
- 37 integration tests pass
- 10 conformance tests pass in twin mode
- 11 conformance package tests pass

---
*Phase: 03-webhook-system-conformance-framework*
*Completed: 2026-02-28*
