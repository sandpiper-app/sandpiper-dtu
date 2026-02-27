---
phase: 02-shopify-twin-core-operations
plan: 01
subsystem: shopify-twin
tags: [shopify, oauth, admin-api, state-management, graphql]
dependency-graph:
  requires:
    - 01-02 (StateManager, buildApp pattern, plugin encapsulation)
  provides:
    - Shopify OAuth token exchange
    - Admin test control endpoints
    - StateManager with Shopify-specific tables
    - GraphQL Admin API foundation
  affects:
    - Future Shopify GraphQL API implementation (Plan 02)
    - Webhook delivery system (Plan 03)
tech-stack:
  added:
    - "@graphql-tools/schema": "Schema creation for GraphQL Yoga"
  patterns:
    - Shopify GID format (gid://shopify/ResourceType/ID)
    - OAuth token storage in StateManager
    - GraphQL Yoga + Fastify integration
    - Token validation middleware for protected endpoints
key-files:
  created:
    - twins/shopify/src/index.ts
    - twins/shopify/src/plugins/oauth.ts
    - twins/shopify/src/plugins/admin.ts
    - twins/shopify/src/plugins/health.ts
    - twins/shopify/src/plugins/graphql.ts
    - twins/shopify/src/services/token-validator.ts
    - twins/shopify/src/db/schema.sql
    - twins/shopify/src/schema/schema.graphql
    - twins/shopify/src/schema/resolvers.ts
    - twins/shopify/package.json
    - twins/shopify/tsconfig.json
  modified:
    - packages/state/src/state-manager.ts
key-decisions:
  - Use @graphql-tools/schema makeExecutableSchema for GraphQL Yoga 5.x compatibility
  - Store tokens in StateManager tokens table cleared on reset
  - Implement simplified OAuth flow without client_id/client_secret validation (twin-friendly)
  - Add getProduct and getCustomer methods to StateManager for resolver lookups
  - Use prepared statements for all Shopify-specific queries
requirements-completed: [SHOP-02, SHOP-07, INFRA-03]
metrics:
  duration: 6 min
  tasks-completed: 2
  commits: 3
  files-created: 11
  files-modified: 1
  deviations: 1
completed: 2026-02-27T20:22:32Z
---

# Phase 02 Plan 01: Shopify Twin Core Operations - Foundation Summary

**One-liner:** Shopify twin foundation with OAuth token exchange, admin test control endpoints, and StateManager extended with 8 Shopify-specific tables for orders, products, customers, inventory, fulfillments, webhooks, and error simulation.

## Execution Report

**Duration:** 6 minutes
**Started:** 2026-02-27 20:16:29 UTC
**Completed:** 2026-02-27 20:22:32 UTC
**Tasks Completed:** 2/2 (100%)
**Files Created:** 11
**Files Modified:** 1

## Tasks Completed

### Task 1: Extend StateManager with Shopify-specific tables and methods
**Status:** Complete
**Commit:** 758cc74

Extended StateManager with 8 Shopify-specific database tables and CRUD methods:

**Tables added:**
- `tokens` - OAuth access tokens with shop domain and scopes
- `orders` - Order entities with GID, name, pricing, line items
- `products` - Product catalog with GID, title, description, vendor
- `customers` - Customer records with GID, email, names
- `inventory_items` - Inventory tracking with SKU, quantities
- `fulfillments` - Fulfillment records with status, tracking
- `webhook_subscriptions` - Webhook topic and callback URL storage
- `error_configs` - Error simulation configuration per operation

**Methods added:**
- Token management: `createToken`, `getToken`
- Order CRUD: `createOrder`, `updateOrder`, `getOrder`, `getOrderByGid`, `listOrders`
- Product CRUD: `createProduct`, `getProduct`, `getProductByGid`, `listProducts`
- Customer CRUD: `createCustomer`, `getCustomer`, `getCustomerByGid`, `listCustomers`
- Webhook management: `createWebhookSubscription`, `listWebhookSubscriptions`
- Error simulation: `createErrorConfig`, `getErrorConfig`, `clearErrorConfigs`

**Key features:**
- All methods use prepared statements for performance
- `updateOrder()` tracks state changes via `updated_at` timestamp
- `reset()` extended to drop ALL Shopify tables for clean state
- Indexes on GID columns and customer email for query performance

### Task 2: Create Shopify twin app with OAuth and admin endpoints
**Status:** Complete
**Commits:** ea89da6, 9dca913

Created Shopify twin application following Phase 1's buildApp() pattern with OAuth, admin API, and GraphQL foundation:

**Core application (twins/shopify/src/index.ts):**
- `buildApp()` factory function for test-friendly Fastify construction
- StateManager initialization with DB_PATH environment variable support
- Plugin registration: health, oauth, admin, graphql
- Pino structured logging with pino-pretty transport
- Graceful shutdown with onClose hook

**OAuth plugin (twins/shopify/src/plugins/oauth.ts):**
- POST `/admin/oauth/access_token` endpoint
- Simplified token exchange: accepts any authorization code, issues UUID token
- Stores tokens in StateManager with shop domain and scopes
- Returns `{ access_token, scope }` response matching Shopify format

**Admin plugin (twins/shopify/src/plugins/admin.ts):**
- POST `/admin/reset` - resets all twin state via StateManager.reset()
- POST `/admin/fixtures/load` - bulk loads orders, products, customers from JSON
- GET `/admin/state` - returns entity counts for inspection (orders, products, customers, tokens, webhooks)

**Token validation service (twins/shopify/src/services/token-validator.ts):**
- `validateAccessToken()` function queries StateManager for token
- Returns validation result with shop domain if valid
- Used by GraphQL plugin for X-Shopify-Access-Token header validation

**GraphQL plugin (twins/shopify/src/plugins/graphql.ts):**
- GraphQL Yoga instance integrated with Fastify
- Endpoint at `/admin/api/2024-01/graphql.json` (versioned like real Shopify API)
- Token validation in context creation (401 if missing/invalid)
- Schema loaded from SDL file, resolvers from separate module
- Pino logger integration for GraphQL Yoga

**GraphQL schema and resolvers:**
- Schema matches Shopify's Admin API structure (GID IDs, MoneyV2, UserError patterns)
- Queries: orders, order, products, product, customers, customer
- Mutations: orderCreate, orderUpdate, productCreate, customerCreate
- UserError responses for validation failures
- GID format conversion in resolvers
- DateTime scalar for timestamp conversion

**Configuration:**
- package.json with workspace dependencies, Fastify, GraphQL Yoga, @graphql-tools/schema
- tsconfig.json extends base, references @dtu/types, @dtu/state, @dtu/core
- schema.sql documentation file for database schema reference

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing getProduct and getCustomer methods in StateManager**
- **Found during:** Task 2 compilation
- **Issue:** GraphQL resolvers called `stateManager.getProduct(id)` and `stateManager.getCustomer(id)` after entity creation, but these methods didn't exist. TypeScript compilation failed with "Property 'getProduct' does not exist on type 'StateManager'".
- **Fix:** Added `getProduct(id: number)` and `getCustomer(id: number)` methods to StateManager that query by internal ID using prepared statements. These complement the existing `getProductByGid` and `getCustomerByGid` methods used for GraphQL queries.
- **Files modified:** packages/state/src/state-manager.ts
- **Verification:** TypeScript compilation succeeded, all packages built successfully
- **Commit:** ea89da6

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)

**Impact:** Minimal. The missing methods were required for the resolvers to function correctly. Added two straightforward query methods that follow the existing StateManager pattern. No architectural changes.

## Verification Results

All verification steps from plan completed successfully:

1. **Root build:** `pnpm build` - all packages (@dtu/types, @dtu/state, @dtu/core) compiled successfully
2. **Shopify twin build:** `pnpm --filter @dtu/twin-shopify build` - TypeScript compilation succeeded
3. **OAuth flow test:** POST /admin/oauth/access_token returned access_token with UUID format
4. **Admin endpoints test:**
   - POST /admin/reset returned `{ reset: true, timestamp: ... }`
   - POST /admin/fixtures/load loaded orders, products, customers, returned loaded counts
   - GET /admin/state returned correct entity counts matching fixtures
5. **StateManager verification:** All 8 Shopify tables present in runMigrations(), reset() drops all tables, updateOrder() method exists

## Success Criteria

All success criteria met:

- Shopify twin app compiles and starts on port 3000 (configurable via PORT env)
- OAuth endpoint issues valid tokens stored in StateManager
- Admin endpoints functional (reset clears all state, fixtures load entities, state returns counts)
- Token validator queries tokens from StateManager correctly
- StateManager extended with 8 Shopify-specific tables and CRUD methods including updateOrder()
- Foundation ready for GraphQL API implementation in Plan 02

## What's Next

**Immediate:** Plan 02-02 will implement the full GraphQL Admin API with queries and mutations for orders, products, customers, inventory, and fulfillments.

**Dependencies unlocked:**
- GraphQL schema is defined and resolvers framework exists
- Token validation is working
- Admin test control endpoints are ready
- StateManager has all required Shopify tables and methods

**Phase progress:** 1/3 plans complete for Phase 2.

## Self-Check: PASSED

All created files verified:
- twins/shopify/src/index.ts
- twins/shopify/src/plugins/oauth.ts
- twins/shopify/src/plugins/admin.ts
- twins/shopify/src/plugins/health.ts
- twins/shopify/src/plugins/graphql.ts
- twins/shopify/src/services/token-validator.ts
- twins/shopify/src/db/schema.sql
- twins/shopify/package.json
- twins/shopify/tsconfig.json

All commits verified:
- 758cc74: feat(02-01): extend StateManager with Shopify-specific tables and methods
- ea89da6: fix(02-01): add getProduct and getCustomer methods to StateManager
- 9dca913: feat(02-01): create Shopify twin app with OAuth and admin endpoints
