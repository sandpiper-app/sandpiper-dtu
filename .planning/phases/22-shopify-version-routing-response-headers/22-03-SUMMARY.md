---
phase: 22-shopify-version-routing-response-headers
plan: "03"
subsystem: shopify-conformance
tags:
  - conformance
  - version-routing
  - shopify
  - transport-testing
dependency_graph:
  requires:
    - 22-01
  provides:
    - shared-shopify-conformance-version-helper
    - dual-version-smoke-coverage
    - x-shopify-api-version-header-assertions
  affects:
    - twins/shopify/conformance
    - tests/integration/smoke.test.ts
tech_stack:
  added: []
  patterns:
    - Single shared constant for conformance default admin API version
    - op.path honored over hardcoded fallback in GraphQL adapters
    - Dual-version transport tests with echoed header assertions
key_files:
  created:
    - twins/shopify/conformance/version.ts
  modified:
    - twins/shopify/conformance/adapters/live-adapter.ts
    - twins/shopify/conformance/adapters/twin-adapter.ts
    - twins/shopify/conformance/suites/products.conformance.ts
    - twins/shopify/conformance/suites/orders.conformance.ts
    - twins/shopify/conformance/suites/webhooks.conformance.ts
    - twins/shopify/test/integration.test.ts
    - twins/shopify/test/integration/pagination.test.ts
    - tests/integration/smoke.test.ts
decisions:
  - SHOPIFY_ADMIN_API_VERSION set to 2025-01 in conformance version helper (suites now declare the current default, not the legacy 2024-01)
  - op.path honored when present in both live and twin adapters; shopifyAdminGraphqlPath() used only as fallback
  - gql() helper in pagination.test.ts parameterized with optional version argument defaulting to 2024-01 for backward compatibility
metrics:
  duration: "~3.5min"
  tasks_completed: 2
  files_changed: 8
  completed_date: "2026-03-12"
requirements:
  - SHOP-17
  - SHOP-22
---

# Phase 22 Plan 03: Shopify Conformance Harness Version Cleanup Summary

**One-liner:** Shared Shopify conformance version helper centralizes SHOPIFY_ADMIN_API_VERSION='2025-01', adapters honor op.path, and transport tests assert dual-version GraphQL routing and x-shopify-api-version header parity.

## What Was Built

### Task 1: Shared Shopify conformance version helper

Created `twins/shopify/conformance/version.ts` as the single source of truth for the conformance layer's default Shopify Admin API version and path builders:

- `SHOPIFY_ADMIN_API_VERSION = '2025-01'`
- `shopifyAdminGraphqlPath(version?)` — builds `/admin/api/{version}/graphql.json`
- `shopifyAdminRestPath(suffix, version?)` — builds `/admin/api/{version}/{suffix}`

Both adapters and all three suites now import from this file instead of embedding literal `/admin/api/2024-01/...` strings.

**Adapter changes:**
- `live-adapter.ts`: health check path uses `shopifyAdminRestPath()`, GraphQL URL honors `op.path ?? shopifyAdminGraphqlPath()`
- `twin-adapter.ts`: GraphQL inject URL uses `op.path ?? shopifyAdminGraphqlPath()`

**Suite changes (products, orders, webhooks):** All `path: '/admin/api/2024-01/graphql.json'` literals replaced with `path: shopifyAdminGraphqlPath()`.

### Task 2: Dual-version smoke and integration tests

Extended three test files with transport-level dual-version assertions:

**integration.test.ts:** New "Version routing and response headers" describe block with 6 tests:
- Both `2024-01` and `2025-01` GraphQL routes return 200 with valid GraphQL data
- Both routes echo `x-shopify-api-version` matching the requested version
- Unauthorized requests with invalid tokens still carry the correct version header

**pagination.test.ts:**
- `gql()` helper parameterized with optional `version` argument (defaults to `'2024-01'` for backward compatibility)
- New `restRequest()` helper for raw REST calls with header access
- 3 new tests: 2024-01 and 2025-01 REST products Link header asserts version-specific path; GraphQL 2025-01 route transport parity

**smoke.test.ts:**
- Replaced single `2024-01` GraphQL check with dual-version assertions
- Both versions assert `x-shopify-api-version` on the response header

## Verification Results

```
Test Files  3 passed (3)
Tests  67 passed (67)
```

67 tests pass: 45 integration + 10 pagination + 12 smoke.

TypeScript: `pnpm exec tsc --noEmit --project twins/shopify/tsconfig.json` — exit 0.

## Deviations from Plan

### Note on verification command

The plan's automated verify for Task 1 (`pnpm exec tsx --eval "import './twins/shopify/conformance/index.ts'"`) fails due to a pre-existing limitation: `index.ts` imports `twin-adapter.ts` which imports `buildApp` from `../../src/index.ts`, which uses top-level `await` — incompatible with tsx's CJS transform mode. This is not caused by any changes in this plan and affects no runtime or test behavior. Verification was confirmed by TypeScript type-check (exit 0) and the direct `version.ts` import check, both passing cleanly.

None — plan executed as written, no architectural deviations.

## Self-Check: PASSED

All created files exist on disk. Both task commits verified present in git log:
- 5eb28c6: feat(22-03): introduce shared Shopify conformance version helper
- 7a3dcc5: feat(22-03): extend smoke and integration tests for dual-version routing and echoed headers
