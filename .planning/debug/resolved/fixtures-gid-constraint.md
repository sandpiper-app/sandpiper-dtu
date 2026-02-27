---
status: resolved
trigger: "Investigate a bug in the Shopify twin's admin fixtures endpoint. POST /admin/fixtures/load returns 500 error: SQLITE_CONSTRAINT_NOTNULL - NOT NULL constraint failed: orders.gid"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:06:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: "The fixtures endpoint calls createOrder without generating GIDs, but createOrder expects a gid parameter"
test: "Read fixtures endpoint handler, createOrder method, and schema to confirm gid handling"
expecting: "Will find createOrder requires gid but fixtures endpoint doesn't provide it"
next_action: "Read all relevant files to understand gid flow"

## Symptoms

expected: "POST /admin/fixtures/load should successfully insert orders with all required fields including gid"
actual: "Returns 500 error with SQLITE_CONSTRAINT_NOTNULL - NOT NULL constraint failed: orders.gid"
errors: "SQLITE_CONSTRAINT_NOTNULL - NOT NULL constraint failed: orders.gid"
reproduction: "POST /admin/fixtures/load with JSON containing orders array"
started: "Unknown - likely existed since fixtures endpoint was created"

## Eliminated

## Evidence

- timestamp: 2026-02-27T00:01:00Z
  checked: "twins/shopify/src/plugins/admin.ts lines 62-64"
  found: "Fixtures endpoint calls createOrder(order) directly without any GID generation. The order object from request body is passed as-is."
  implication: "If incoming order object lacks a gid property, createOrder will receive undefined for gid parameter"

- timestamp: 2026-02-27T00:02:00Z
  checked: "packages/state/src/state-manager.ts lines 352-369"
  found: "createOrder method signature expects data.gid as a required string parameter. Line 359 uses data.gid directly in SQL INSERT. Schema constraint requires gid to be NOT NULL."
  implication: "createOrder will attempt to insert undefined/null into NOT NULL column, causing SQLITE_CONSTRAINT_NOTNULL error"

- timestamp: 2026-02-27T00:03:00Z
  checked: "twins/shopify/src/db/schema.sql line 16"
  found: "orders table defines gid as 'TEXT UNIQUE NOT NULL' - database enforces NOT NULL constraint"
  implication: "Database will reject any INSERT with null/undefined gid value"

- timestamp: 2026-02-27T00:04:00Z
  checked: "twins/shopify/src/services/gid.ts lines 15-17"
  found: "createGID utility exists to generate Shopify GIDs in format gid://shopify/{ResourceType}/{id}"
  implication: "GID generation utility is available but not used in fixtures endpoint"

- timestamp: 2026-02-27T00:05:00Z
  checked: "twins/shopify/src/plugins/admin.ts lines 66-74"
  found: "Similar pattern for createProduct and createCustomer - also called without GID generation"
  implication: "Products and customers have the same bug - all three resource types need GID generation before insert"

- timestamp: 2026-02-27T00:06:00Z
  checked: "twins/shopify/src/schema/resolvers.ts lines 164-173"
  found: "The orderCreate mutation shows correct pattern: generates tempId (Date.now() + random), then calls createGID('Order', tempId) to create proper Shopify GID format before calling createOrder"
  implication: "This is the pattern the fixtures endpoint should follow - generate unique ID, wrap in createGID, then pass to create methods"

## Resolution

root_cause: "The fixtures load endpoint (POST /admin/fixtures/load) passes fixture data directly to createOrder, createProduct, and createCustomer methods without generating required GID values. The StateManager methods expect a gid property in the data parameter (line 359, 420, 460 in state-manager.ts), but incoming fixture JSON may not include GIDs. Since the database schema enforces NOT NULL constraints on gid columns (schema.sql lines 16, 31, 45), attempting to insert without a gid causes SQLITE_CONSTRAINT_NOTNULL errors. The correct pattern (shown in resolvers.ts lines 165-167) is to generate a unique ID and wrap it with createGID() before calling create methods."
fix: ""
verification: ""
files_changed: []
