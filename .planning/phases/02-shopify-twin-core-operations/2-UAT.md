---
status: complete
phase: 02-shopify-twin-core-operations
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-02-27T21:00:00Z
updated: 2026-02-27T21:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Build & Server Startup
expected: Run `pnpm build` succeeds. Shopify twin starts on port 3000. GET /health returns `{ status: "ok" }`.
result: pass

### 2. OAuth Token Exchange
expected: POST /admin/oauth/access_token with JSON body `{ "code": "any-code", "client_id": "test", "client_secret": "test" }` returns `{ access_token: "<uuid>", scope: "..." }`. The token is a UUID string.
result: pass

### 3. Admin Reset & State Inspection
expected: POST /admin/reset returns `{ reset: true, timestamp: "..." }`. GET /admin/state returns counts for orders, products, customers, tokens, webhooks — all 0 after reset.
result: pass

### 4. Load Test Fixtures
expected: POST /admin/fixtures/load with JSON body containing `orders`, `products`, and `customers` arrays loads entities. GET /admin/state reflects the loaded counts accurately.
result: issue
reported: "SQLITE_CONSTRAINT_NOTNULL - NOT NULL constraint failed: orders.gid. Fixtures load endpoint returns 500 error when loading orders because GID is not generated."
severity: major

### 5. GraphQL Authentication Guard
expected: A GraphQL query to /admin/api/2024-01/graphql.json WITHOUT an X-Shopify-Access-Token header returns a GraphQL error with UNAUTHORIZED code. No data is returned.
result: pass

### 6. GraphQL Order Create & GID Format
expected: With a valid token in X-Shopify-Access-Token, send an orderCreate mutation. Response includes the created order with a GID-formatted ID like `gid://shopify/Order/1`, totalPriceSet with amount and currencyCode, and no userErrors.
result: pass

### 7. GraphQL Query Orders
expected: After creating orders, query `{ orders(first: 10) { edges { node { id name totalPriceSet { shopMoney { amount currencyCode } } } } } }`. Returns edges array with order nodes containing GID IDs and Shopify-structured money fields.
result: pass

### 8. GraphQL Order Update
expected: Send orderUpdate mutation with an order ID and changed fields. Response returns updated order with the changes applied. The order's updatedAt timestamp reflects the change.
result: pass

### 9. Error Simulation
expected: Configure an error via POST /admin/errors/configure, enable with POST /admin/errors/enable. Next matching mutation returns the configured error (e.g., 429 THROTTLED). Disable with POST /admin/errors/disable restores normal behavior.
result: pass

### 10. Integration Test Suite
expected: Run `pnpm --filter @dtu/twin-shopify test`. All 24 integration tests pass covering OAuth, admin API, GraphQL queries/mutations, token validation, error simulation, and webhooks.
result: pass

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Fixtures load endpoint loads orders, products, customers from JSON body"
  status: failed
  reason: "User reported: SQLITE_CONSTRAINT_NOTNULL - NOT NULL constraint failed: orders.gid. Fixtures load endpoint returns 500 error when loading orders because GID is not generated."
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
