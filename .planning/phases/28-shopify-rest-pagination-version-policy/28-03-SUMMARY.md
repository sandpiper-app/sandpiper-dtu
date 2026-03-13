---
phase: 28-shopify-rest-pagination-version-policy
plan: "03"
subsystem: shopify-twin
tags: [version-policy, api-version, sunset, rest, graphql, shop-17]
dependency_graph:
  requires: [28-02]
  provides: [SHOP-17]
  affects: [twins/shopify/src/services/api-version.ts, twins/shopify/src/plugins/rest.ts, twins/shopify/src/plugins/graphql.ts]
tech_stack:
  added: []
  patterns: [sunset-flag-on-error, month-range-regex, discriminated-catch-blocks]
key_files:
  created: []
  modified:
    - twins/shopify/src/services/api-version.ts
    - twins/shopify/src/plugins/rest.ts
    - twins/shopify/src/plugins/graphql.ts
decisions:
  - "SUNSET_VERSIONS Set holds 2023-Q1–Q4 versions (Shopify 12-month support window as of 2026-03)"
  - "err.sunset=true flag on thrown Error lets handlers distinguish sunset from invalid without string matching"
  - "GraphQL handlers use array-of-objects format {errors:[{message:...}]}; REST handlers use {errors:'string'}"
  - "VALID_MONTH_RE = /^(0[1-9]|1[0-2])$/ catches month>12 and month=00 (e.g. 2024-99, 2024-00)"
  - "Month check skips 'unstable' — no YYYY-MM structure to split"
metrics:
  duration: "2min"
  completed_date: "2026-03-13"
  tasks: 2
  files_modified: 3
---

# Phase 28 Plan 03: Version Policy (Month-Range + Sunset Validation) Summary

**One-liner:** Month-range regex + SUNSET_VERSIONS Set in parseShopifyApiVersion with err.sunset=true discrimination in REST and GraphQL route handlers.

## What Was Built

Extended `parseShopifyApiVersion` with two new validation layers and updated both route handler plugins to return distinguishable error messages for sunset vs. invalid versions.

### api-version.ts changes

Added after `SHOPIFY_API_VERSION_RE`:

1. `SUNSET_VERSIONS = new Set(['2023-01', '2023-04', '2023-07', '2023-10'])` — versions that were once valid but Shopify no longer supports (12-month window).
2. `VALID_MONTH_RE = /^(0[1-9]|1[0-2])$/` — rejects month values outside 01–12 (catches 2024-99, 2024-00).

`parseShopifyApiVersion` now:
- Keeps existing `SHOPIFY_API_VERSION_RE` check (unchanged path for fully invalid syntax)
- For YYYY-MM values: validates month with `VALID_MONTH_RE` → throws `TypeError` on failure
- Checks `SUNSET_VERSIONS.has(raw)` → throws `Error` with `err.sunset = true` on match
- Returns `raw` unchanged for valid, non-sunset versions

### rest.ts changes

`parseVersionHeader` catch block widened to `catch (err: any)`:
- `err.sunset` truthy → `400 { errors: 'This API version is no longer supported' }`
- otherwise → `400 { errors: 'Invalid API version' }` (unchanged behavior)

### graphql.ts changes

Both version-parsing blocks (storefront route `/api/:version/graphql.json` and admin route `/admin/api/:version/graphql.json`) updated with same sunset-aware catch pattern. GraphQL format preserved: `{ errors: [{ message: '...' }] }`.

## Test Results

```
pnpm vitest run --project @dtu/twin-shopify
Test Files: 11 passed (11)
Tests:      163 passed (163)
```

Version policy tests (pagination.test.ts, SHOP-17 block):
- "GET with invalid month 2024-99 returns 400" — GREEN
- "GET with sunset version 2023-01 returns 400" — GREEN

Full pagination suite: 14/14 GREEN (includes SHOP-23 cursor pagination from Plan 02).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | bb814cb | feat(28-03): extend parseShopifyApiVersion with month-range and sunset validation |
| Task 2 | d799394 | feat(28-03): update parseVersionHeader in rest.ts and graphql.ts for sunset errors |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- twins/shopify/src/services/api-version.ts: FOUND
- twins/shopify/src/plugins/rest.ts: FOUND
- twins/shopify/src/plugins/graphql.ts: FOUND
- Commit bb814cb: FOUND
- Commit d799394: FOUND
