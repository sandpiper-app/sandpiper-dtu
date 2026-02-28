# Phase 4: Shopify Twin - Advanced Features - Research

**Researched:** 2026-02-28
**Domain:** Shopify GraphQL Admin API rate limiting, cursor-based pagination, order lifecycle state machine
**Confidence:** HIGH

## Summary

Phase 4 extends the existing Shopify twin with three advanced features: GraphQL query cost-based rate limiting (SHOP-04), Relay-spec cursor-based pagination (SHOP-05), and a stateful order lifecycle with fulfillment/close transitions (SHOP-06). All three features build on top of existing infrastructure -- the GraphQL Yoga server, StateManager, webhook queue, and error simulator already established in Phases 2-3.

The query cost system requires a static analysis pass that calculates cost before query execution using Shopify's documented algorithm (scalars=0, objects=1, connections=2+first, mutations=10), tracked via a leaky bucket that restores points per second. Pagination requires adding `cursor` fields to edges, `pageInfo` to connections, and `after`/`before`/`first`/`last` arguments to all list queries -- following the Relay Connection Specification. The order lifecycle requires adding `status`, `financial_status`, and `closed_at` columns to the orders table and implementing `orderClose` mutation with state transition validation.

**Primary recommendation:** Implement as three focused plans -- (1) query cost calculator + rate limiting middleware, (2) cursor-based pagination across all connections, (3) order lifecycle state machine with `orderClose` mutation -- each independently testable and building on existing patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-04 | Rate limiting by GraphQL query cost -- returns 429 + Retry-After header when cost threshold exceeded | Query cost calculation algorithm documented with exact field costs (scalars=0, objects=1, connections=2+first, mutations=10). Leaky bucket model: 1000 max, 50pts/sec restore. Throttled response format includes `extensions.cost` object. See Architecture Patterns section. |
| SHOP-05 | Cursor-based pagination with deterministic, stable results across test runs | Relay Connection Specification fully documented. PageInfo requires hasNextPage, hasPreviousPage, startCursor, endCursor. Cursors must be opaque strings. Current schema lacks `after`/`before` args, `cursor` on edges, and `pageInfo` on connections. See Pagination Pattern section. |
| SHOP-06 | Stateful order lifecycle -- create -> update -> fulfill -> close with realistic state transitions | Order has `displayFulfillmentStatus` (UNFULFILLED -> IN_PROGRESS -> FULFILLED) and `displayFinancialStatus` (PENDING -> PAID etc). `orderClose` mutation requires fulfilled+paid preconditions. Fulfillment triggers `fulfillments/create` webhook (already implemented). Need to add status tracking and state transition validation. See Order Lifecycle Pattern section. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| graphql-yoga | ^5.8.3 | GraphQL server with Envelop plugin system | Already in use; plugin system enables query cost middleware |
| @graphql-tools/schema | ^10.0.0 | Schema construction | Already in use |
| graphql | ^16.9.0 | GraphQL execution engine, AST visitors | Already in use; provides `visit()` for query cost static analysis |
| better-sqlite3 | (via @dtu/state) | State persistence | Already in use; pagination cursors derive from SQLite row ordering |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| graphql (visit/DocumentNode) | ^16.9.0 | AST traversal for cost calculation | Query cost static analysis before execution |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom cost calculator | graphql-query-complexity | External lib adds dependency for a simple calculation; Shopify's cost model is well-documented enough to implement directly in ~100 lines |
| Base64-encoded cursor | Opaque hash cursor | Base64 of `${table}:${id}` is simple, reversible, and matches common Relay implementations |

**Installation:**
```bash
# No new packages needed -- all required libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
twins/shopify/src/
├── plugins/
│   ├── graphql.ts           # Existing - add cost extensions to response
│   └── rate-limit.ts        # NEW - leaky bucket rate limiter (Fastify plugin)
├── services/
│   ├── query-cost.ts        # NEW - static cost calculator using graphql visit()
│   ├── rate-limiter.ts      # NEW - leaky bucket with restore rate
│   ├── cursor.ts            # NEW - cursor encode/decode utilities
│   └── order-lifecycle.ts   # NEW - state machine and transition validation
├── schema/
│   ├── schema.graphql       # MODIFY - add pageInfo, cursor, after/before args, order status fields
│   └── resolvers.ts         # MODIFY - add pagination logic, cost context, orderClose mutation
```

### Pattern 1: Query Cost Calculator (SHOP-04)

**What:** Static analysis of GraphQL AST to calculate requested query cost before execution, using Shopify's documented algorithm.

**When to use:** Every GraphQL request, before execution.

**Shopify's Cost Algorithm:**
```
Scalar field         = 0 points
Enum field           = 0 points
Object field         = 1 point
Connection field     = 2 + (first ?? last ?? 10) points
  Each child of connection multiplied by connection size
Mutation             = 10 points (base)
Single query max     = 1000 points
```

**Example:**
```typescript
// twins/shopify/src/services/query-cost.ts
import { visit, Kind, type DocumentNode, type GraphQLSchema } from 'graphql';

interface QueryCost {
  requestedQueryCost: number;
  // actualQueryCost calculated post-execution (optional for twin)
}

/**
 * Calculate the requested cost of a GraphQL query using Shopify's algorithm.
 *
 * Rules:
 * - Scalar/Enum fields: 0 points
 * - Object fields: 1 point
 * - Connections (fields ending in Connection or with first/last args): 2 + first
 * - Each child of a connection is multiplied by the connection's page size
 * - Mutations: 10 points base cost
 */
export function calculateQueryCost(
  document: DocumentNode,
  schema: GraphQLSchema,
  variables?: Record<string, unknown>
): number {
  let cost = 0;
  // Walk AST, track nesting multiplier for connections
  // Connection fields detected by: has `first` or `last` argument, or type name ends in "Connection"
  // Multiply child costs by connection size
  // ...implementation using visit()
  return cost;
}
```

**Leaky Bucket Rate Limiter:**
```typescript
// twins/shopify/src/services/rate-limiter.ts

interface BucketState {
  available: number;
  lastRefill: number;
}

export class LeakyBucketRateLimiter {
  private buckets: Map<string, BucketState> = new Map();

  constructor(
    private maxAvailable: number = 1000,    // Shopify default
    private restoreRate: number = 50,        // points per second
  ) {}

  /**
   * Try to consume `cost` points from the bucket for `key`.
   * Returns { allowed, available, retryAfterMs }
   */
  tryConsume(key: string, cost: number): {
    allowed: boolean;
    currentlyAvailable: number;
    retryAfterMs: number;
  } {
    const now = Date.now();
    const bucket = this.getOrCreateBucket(key, now);

    // Refill based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.available = Math.min(
      this.maxAvailable,
      bucket.available + elapsed * this.restoreRate
    );
    bucket.lastRefill = now;

    if (bucket.available >= cost) {
      bucket.available -= cost;
      return { allowed: true, currentlyAvailable: bucket.available, retryAfterMs: 0 };
    }

    const deficit = cost - bucket.available;
    const retryAfterMs = Math.ceil((deficit / this.restoreRate) * 1000);
    return { allowed: false, currentlyAvailable: bucket.available, retryAfterMs };
  }

  /** Reset all buckets (for /admin/reset) */
  reset(): void {
    this.buckets.clear();
  }
}
```

**Throttled Response Format (matches Shopify exactly):**
```json
{
  "errors": [
    {
      "message": "Throttled"
    }
  ],
  "extensions": {
    "cost": {
      "requestedQueryCost": 202,
      "actualQueryCost": null,
      "throttleStatus": {
        "maximumAvailable": 1000.0,
        "currentlyAvailable": 118,
        "restoreRate": 50.0
      }
    }
  }
}
```

**Integration point:** The rate limiter intercepts in the GraphQL plugin's route handler, before yoga.fetch(). Parse the query, calculate cost, check bucket, either proceed (adding extensions to response) or return throttled response with 429 status.

**Important:** Shopify returns HTTP 200 for successful GraphQL requests (even with GraphQL errors in the body), but returns HTTP 429 for throttled requests. The success criteria says "receives 429 response with Retry-After header" so the twin should return actual HTTP 429 with `Retry-After` header (seconds) for throttled requests, plus the Shopify-format error body.

### Pattern 2: Cursor-Based Pagination (SHOP-05)

**What:** Relay-spec cursor-based pagination across all connection types (orders, products, customers).

**When to use:** All list queries that return connections.

**Cursor Strategy:**
- Encode: `Buffer.from('arrayconnection:' + id).toString('base64')` (Relay convention)
- Decode: `Buffer.from(cursor, 'base64').toString('utf-8').split(':')[1]`
- Sort by `id ASC` for deterministic ordering across runs (SQLite AUTOINCREMENT guarantees monotonic IDs)

**Schema Changes Required:**
```graphql
# Add to all Connection types
type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!         # NEW
}

type OrderEdge {
  node: Order!
  cursor: String!             # NEW
}

# Shared PageInfo type
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Update query arguments
type QueryRoot {
  orders(first: Int = 10, after: String, last: Int, before: String): OrderConnection!
  products(first: Int = 10, after: String, last: Int, before: String): ProductConnection!
  customers(first: Int = 10, after: String, last: Int, before: String): CustomerConnection!
}
```

**Resolver Pattern:**
```typescript
// twins/shopify/src/services/cursor.ts
export function encodeCursor(id: number): string {
  return Buffer.from(`arrayconnection:${id}`).toString('base64');
}

export function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
  const id = decoded.split(':')[1];
  return parseInt(id, 10);
}

// In resolvers:
orders: async (_parent, args, context) => {
  const { first, after, last, before } = args;

  // Get all orders sorted by ID ASC (deterministic)
  let allOrders = context.stateManager.listOrders(); // Must be sorted by id ASC

  // Apply cursor filters
  if (after) {
    const afterId = decodeCursor(after);
    allOrders = allOrders.filter(o => o.id > afterId);
  }
  if (before) {
    const beforeId = decodeCursor(before);
    allOrders = allOrders.filter(o => o.id < beforeId);
  }

  // Apply first/last limits
  let sliced = allOrders;
  if (first != null) sliced = sliced.slice(0, first);
  if (last != null) sliced = sliced.slice(-last);

  const edges = sliced.map(order => ({
    node: order,
    cursor: encodeCursor(order.id),
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: first != null && allOrders.length > first,
      hasPreviousPage: after != null || (last != null && allOrders.length > last),
      startCursor: edges.length > 0 ? edges[0].cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    },
  };
};
```

**Critical StateManager Change:** Current `listOrders()` uses `ORDER BY created_at DESC`. For deterministic cursor pagination, change to `ORDER BY id ASC`. This is a breaking change in ordering but necessary for stable pagination. The `id` column is `INTEGER PRIMARY KEY AUTOINCREMENT` which guarantees monotonically increasing values.

### Pattern 3: Order Lifecycle State Machine (SHOP-06)

**What:** Stateful order transitions: create (unfulfilled/pending) -> fulfill (fulfilled) -> close (closed), with validation preventing invalid transitions.

**State Fields to Add:**
```sql
-- Add to orders table
ALTER TABLE orders ADD COLUMN display_fulfillment_status TEXT DEFAULT 'UNFULFILLED';
ALTER TABLE orders ADD COLUMN display_financial_status TEXT DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN closed_at INTEGER;
ALTER TABLE orders ADD COLUMN cancelled_at INTEGER;
```

**Shopify Order Status Enums (subset for twin):**

`OrderDisplayFulfillmentStatus`:
- `UNFULFILLED` - No items fulfilled (initial state)
- `IN_PROGRESS` - Fulfillment request sent
- `PARTIALLY_FULFILLED` - Some items fulfilled
- `FULFILLED` - All items fulfilled

`OrderDisplayFinancialStatus`:
- `PENDING` - Awaiting payment
- `AUTHORIZED` - Payment authorized
- `PAID` - Payment captured
- `PARTIALLY_REFUNDED` - Partial refund issued
- `REFUNDED` - Full refund issued

**State Machine:**
```typescript
// twins/shopify/src/services/order-lifecycle.ts

type FulfillmentStatus = 'UNFULFILLED' | 'IN_PROGRESS' | 'PARTIALLY_FULFILLED' | 'FULFILLED';
type FinancialStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

interface OrderState {
  fulfillmentStatus: FulfillmentStatus;
  financialStatus: FinancialStatus;
  closedAt: number | null;
}

/**
 * Validate whether an order can be fulfilled.
 * Returns null if allowed, or error message if not.
 */
export function validateFulfillment(order: OrderState): string | null {
  if (order.fulfillmentStatus === 'FULFILLED') {
    return 'Order is already fulfilled';
  }
  if (order.closedAt !== null) {
    return 'Cannot fulfill a closed order';
  }
  return null;
}

/**
 * Validate whether an order can be closed.
 * Shopify requires: all items fulfilled + financial transactions complete.
 */
export function validateClose(order: OrderState): string | null {
  if (order.closedAt !== null) {
    return 'Order is already closed';
  }
  if (order.fulfillmentStatus !== 'FULFILLED') {
    return 'Order must be fully fulfilled before closing';
  }
  if (!['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.financialStatus)) {
    return 'Order must have completed financial transactions before closing';
  }
  return null;
}
```

**GraphQL Schema Additions:**
```graphql
# Add to Order type
type Order {
  id: ID!
  name: String!
  displayFulfillmentStatus: OrderDisplayFulfillmentStatus!
  displayFinancialStatus: OrderDisplayFinancialStatus!
  closedAt: DateTime
  # ... existing fields
}

enum OrderDisplayFulfillmentStatus {
  UNFULFILLED
  IN_PROGRESS
  PARTIALLY_FULFILLED
  FULFILLED
}

enum OrderDisplayFinancialStatus {
  PENDING
  AUTHORIZED
  PAID
  PARTIALLY_REFUNDED
  REFUNDED
}

# New mutation
input OrderCloseInput {
  id: ID!
}

type OrderClosePayload {
  order: Order
  userErrors: [UserError!]!
}

# Add to MutationType
type MutationType {
  orderClose(input: OrderCloseInput!): OrderClosePayload!
  # ... existing mutations
}
```

**Fulfillment -> Order Status Update Flow:**
1. `fulfillmentCreate` mutation fires
2. Validate: order not already FULFILLED, not closed
3. Create fulfillment record
4. Update order's `display_fulfillment_status` to `FULFILLED` (simplified -- real Shopify tracks per-line-item, but twin simulates at order level)
5. Trigger `fulfillments/create` webhook (already implemented)
6. Trigger `orders/update` webhook (status changed)

**OrderClose Flow:**
1. `orderClose` mutation with order ID
2. Validate: order is FULFILLED and financial status is PAID/REFUNDED
3. Set `closed_at` timestamp
4. Trigger `orders/update` webhook

### Anti-Patterns to Avoid
- **Over-engineering the cost calculator:** Don't try to resolve types from schema for every field -- use a pragmatic approach matching the twin's known schema. The twin has a small, fixed schema; a simple AST visitor suffices.
- **Mutable cursors:** Never use timestamps or mutable fields as cursor values. Use the stable `id` column (AUTOINCREMENT).
- **Implicit state transitions:** Every state change must go through explicit validation. Never directly set status without checking preconditions.
- **Real-time bucket persistence:** The leaky bucket can be in-memory only. It resets on server restart, which is fine for a test twin.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GraphQL AST traversal | Manual string parsing of queries | `graphql` library's `visit()` function | Handles all AST node types, fragments, variables correctly |
| Base64 encoding | Custom encoding scheme | `Buffer.from().toString('base64')` | Standard, reversible, matches Relay convention |
| Schema modification | String concatenation of SDL | Edit schema.graphql file directly | Schema-first approach already established in codebase |

**Key insight:** All three features extend existing infrastructure rather than introducing new libraries. The `graphql` package already provides AST visitors for cost calculation, SQLite AUTOINCREMENT provides stable cursor ordering, and the existing resolver/webhook patterns handle the order lifecycle.

## Common Pitfalls

### Pitfall 1: Query Cost Underestimation with Nested Connections
**What goes wrong:** A query like `orders(first:50) { edges { node { lineItems(first:50) { edges { node { id } } } } } }` has cost `(2+50) * (2+50) + mutations_cost` not `(2+50) + (2+50)`. Each nested connection multiplies.
**Why it happens:** Forgetting that child field costs are multiplied by parent connection size.
**How to avoid:** Track a "multiplier stack" during AST traversal. When entering a connection, push its page size; when leaving, pop.
**Warning signs:** Cost calculation returns suspiciously low values for deeply nested queries.

### Pitfall 2: Non-Deterministic Pagination Ordering
**What goes wrong:** Pagination returns different results between test runs because `ORDER BY created_at` has identical timestamps for fixture-loaded data.
**Why it happens:** Fixtures loaded in rapid succession share the same `created_at` second-precision timestamp.
**How to avoid:** Sort by `id ASC` (AUTOINCREMENT guarantees uniqueness and monotonic ordering) instead of `created_at DESC`.
**Warning signs:** Tests pass individually but fail when run in sequence; cursor-based navigation skips or duplicates records.

### Pitfall 3: Stale Bucket After Reset
**What goes wrong:** After `/admin/reset`, rate limiter still has depleted bucket from previous test.
**Why it happens:** Rate limiter is in-memory but not connected to StateManager reset.
**How to avoid:** Clear rate limiter buckets in the `/admin/reset` handler alongside StateManager.reset().
**Warning signs:** First test in suite passes, subsequent tests hit 429 unexpectedly.

### Pitfall 4: fulfillmentCreate Not Updating Order Status
**What goes wrong:** Creating a fulfillment succeeds but order's `displayFulfillmentStatus` remains `UNFULFILLED`.
**Why it happens:** Current `fulfillmentCreate` resolver creates the fulfillment record but does not update the parent order's status columns.
**How to avoid:** `fulfillmentCreate` must both create the fulfillment AND update the order's `display_fulfillment_status` to `FULFILLED`.
**Warning signs:** Order queries show `UNFULFILLED` status after successful fulfillment.

### Pitfall 5: Cursor Incompatibility Between Resources
**What goes wrong:** Passing a Product cursor to an Orders query returns wrong results or crashes.
**Why it happens:** Cursors only encode the numeric ID, not the resource type.
**How to avoid:** Include resource type in cursor encoding: `arrayconnection:Order:42`. Validate on decode that cursor type matches expected resource.
**Warning signs:** Cross-resource cursor injection in tests produces unexpected results.

### Pitfall 6: HTTP Status Code for Throttled GraphQL
**What goes wrong:** Returning HTTP 200 with GraphQL THROTTLED error in the body, but the success criteria requires HTTP 429.
**Why it happens:** GraphQL convention is to always return 200; Shopify breaks this convention for throttling.
**How to avoid:** Check rate limit BEFORE passing to GraphQL Yoga. If throttled, short-circuit with HTTP 429 response directly via Fastify reply.
**Warning signs:** Tests checking HTTP status code fail because response is 200 not 429.

## Code Examples

### Cost Calculation for a Typical Query
```typescript
// Query: { orders(first: 10) { edges { node { id name lineItems(first: 5) { edges { node { id title } } } } } } }
//
// Cost breakdown:
// - orders connection: 2 + 10 = 12
//   - each order node: 1 (object)
//     - id: 0 (scalar)
//     - name: 0 (scalar)
//     - lineItems connection: 2 + 5 = 7
//       - each lineItem node: 1
//         - id: 0, title: 0
//       Total per lineItem: 1
//     Total lineItems: 7 + (5 * 1) = 12... but using Shopify's model: connection cost = 2 + first
//   Total per order: 1 + (2+5) = 8
// Total: (2+10) + 10*(1 + (2+5)) = 12 + 10*8 = 92

// Simplified approach for twin:
// Walk AST, for each field:
//   - If it has first/last arg -> connection cost = 2 + first, set multiplier = first
//   - If it returns an object type -> 1 * current_multiplier
//   - Scalars/enums -> 0
```

### Pagination with Stable Cursors
```typescript
// Source: Relay Connection Specification + Shopify pagination docs

import { encodeCursor, decodeCursor } from '../services/cursor.js';

// Generic paginate function reusable across all resources
function paginate<T extends { id: number }>(
  items: T[],
  args: { first?: number; after?: string; last?: number; before?: string }
) {
  let filtered = [...items].sort((a, b) => a.id - b.id); // Stable sort by id ASC

  if (args.after) {
    const afterId = decodeCursor(args.after);
    filtered = filtered.filter(item => item.id > afterId);
  }
  if (args.before) {
    const beforeId = decodeCursor(args.before);
    filtered = filtered.filter(item => item.id < beforeId);
  }

  // Determine if there are more items beyond the requested window
  const totalAfterCursors = filtered.length;

  if (args.first != null) {
    filtered = filtered.slice(0, args.first);
  }
  if (args.last != null) {
    filtered = filtered.slice(-args.last);
  }

  const edges = filtered.map(item => ({
    node: item,
    cursor: encodeCursor(item.id),
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: args.first != null ? totalAfterCursors > args.first : false,
      hasPreviousPage: args.after != null || (args.last != null ? totalAfterCursors > args.last : false),
      startCursor: edges.length > 0 ? edges[0].cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    },
  };
}
```

### Rate Limit Integration in GraphQL Route
```typescript
// In graphql.ts route handler, BEFORE yoga.fetch():
handler: async (req, reply) => {
  // Parse query to calculate cost
  const body = req.body as { query?: string; variables?: Record<string, unknown> };
  if (body?.query) {
    const document = parse(body.query);
    const cost = calculateQueryCost(document, schema, body.variables);

    // Check rate limit
    const tokenKey = req.headers['x-shopify-access-token'] as string || 'anonymous';
    const result = rateLimiter.tryConsume(tokenKey, cost);

    if (!result.allowed) {
      // Return Shopify-format 429 response
      const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
      reply
        .status(429)
        .header('Retry-After', retryAfterSeconds.toString())
        .header('content-type', 'application/json')
        .send(JSON.stringify({
          errors: [{ message: 'Throttled' }],
          extensions: {
            cost: {
              requestedQueryCost: cost,
              actualQueryCost: null,
              throttleStatus: {
                maximumAvailable: rateLimiter.maxAvailable,
                currentlyAvailable: result.currentlyAvailable,
                restoreRate: rateLimiter.restoreRate,
              },
            },
          },
        }));
      return reply;
    }

    // Add cost extensions to successful responses (post-execution)
    // ... proceed with yoga.fetch() and append extensions
  }
}
```

### Order Close Mutation Resolver
```typescript
orderClose: async (_parent, args, context) => {
  requireAuth(context);
  await context.errorSimulator.throwIfConfigured('orderClose');

  const { id } = parseGID(args.input.id);
  const orderId = parseInt(id, 10);
  const order = context.stateManager.getOrder(orderId);

  if (!order) {
    return { order: null, userErrors: [{ field: ['id'], message: 'Order not found' }] };
  }

  const error = validateClose({
    fulfillmentStatus: order.display_fulfillment_status,
    financialStatus: order.display_financial_status,
    closedAt: order.closed_at,
  });

  if (error) {
    return { order: null, userErrors: [{ field: ['id'], message: error }] };
  }

  context.stateManager.closeOrder(orderId); // Sets closed_at = now
  const closedOrder = context.stateManager.getOrder(orderId);

  await enqueueWebhooks(context, 'orders/update', { /* order payload */ });

  return { order: closedOrder, userErrors: [] };
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fulfillmentCreateV2` | `fulfillmentCreate` (renamed) | Shopify 2024-04 | The V2 suffix was dropped; the mutation is now simply `fulfillmentCreate` |
| `OPEN` fulfillment status | `UNFULFILLED` | Deprecated | Twin should use `UNFULFILLED` as default |
| Fixed rate limits per store | Plan-based rate limits (50/100/500/2000 pts/sec) | 2024 | Twin defaults to 50 pts/sec (standard plan); configurable via admin |
| REST-style offset pagination | Cursor-based pagination only (GraphQL) | Shopify GraphQL inception | All GraphQL connections use cursor-based pagination |

**Deprecated/outdated:**
- `FulfillmentStatus.OPEN` and `FulfillmentStatus.PENDING`: deprecated in favor of `FulfillmentOrderStatus`
- `OrderDisplayFulfillmentStatus.OPEN`: replaced by `UNFULFILLED`
- `OrderDisplayFulfillmentStatus.RESTOCKED`: replaced by `UNFULFILLED`
- `OrderDisplayFulfillmentStatus.PENDING_FULFILLMENT`: replaced by `IN_PROGRESS`

## Open Questions

1. **Cost calculation precision for twin's simplified schema**
   - What we know: Shopify's algorithm is documented for their full schema. Our twin has a subset.
   - What's unclear: Exact cost of `lineItems` nested under `Order` -- is it a connection or a direct list? In our current schema, `lineItems(first: Int)` acts like a connection but uses `LineItemConnection` which has `edges` but no `pageInfo`.
   - Recommendation: Treat `lineItems` as a connection (cost = 2 + first) since it has `first` argument and `edges` pattern. Add `pageInfo` to it as well for consistency.

2. **Configurable rate limit parameters**
   - What we know: Different Shopify plans have different limits (50-2000 pts/sec).
   - What's unclear: Should the twin expose admin API to configure rate limit parameters?
   - Recommendation: Default to 50 pts/sec with env var override (`RATE_LIMIT_RESTORE_RATE`, `RATE_LIMIT_MAX_AVAILABLE`). Add admin endpoint `POST /admin/rate-limit/configure` for test flexibility.

3. **Financial status transitions**
   - What we know: Shopify has `PENDING -> AUTHORIZED -> PAID` flow via payment processing.
   - What's unclear: How deep should the twin model payment processing? We don't have a payments system.
   - Recommendation: Default new orders to `PAID` (simplest for testing). Add optional `financialStatus` field to `OrderInput` so tests can create orders in specific states. Add `orderMarkAsPaid` admin convenience endpoint if needed.

## Sources

### Primary (HIGH confidence)
- [Shopify API Rate Limits](https://shopify.dev/docs/api/usage/limits) - Query cost calculation rules, bucket sizes, plan limits
- [Shopify GraphQL Pagination](https://shopify.dev/docs/api/usage/pagination-graphql) - Cursor-based pagination, PageInfo, forward/backward navigation
- [Relay Connection Specification](https://relay.dev/graphql/connections.htm) - Formal spec for connections, edges, cursors, PageInfo
- [Shopify OrderDisplayFulfillmentStatus enum](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFulfillmentStatus) - All fulfillment status values
- [Shopify OrderDisplayFinancialStatus enum](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFinancialStatus) - All financial status values
- [Shopify orderClose mutation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderClose) - Close mutation interface and preconditions
- [Shopify PageInfo object](https://shopify.dev/docs/api/admin-graphql/latest/objects/PageInfo) - PageInfo fields (hasNextPage, hasPreviousPage, startCursor, endCursor)

### Secondary (MEDIUM confidence)
- [Shopify Engineering: Rate Limiting GraphQL APIs](https://shopify.engineering/rate-limiting-graphql-apis-calculating-query-complexity) - Connection cost formula (2 + first), leaky bucket details
- [Shopify Community: Throttled Response Example](https://community.shopify.com/c/Shopify-APIs-SDKs/GraphQL-Admin-API-example-Throttled-request-s-response/td-p/639510) - Exact JSON format of throttled response with extensions.cost
- [GraphQL Yoga Envelop Plugins](https://the-guild.dev/graphql/yoga-server/docs/features/envelop-plugins) - Plugin system for adding extensions to responses

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all features build on existing graphql, graphql-yoga, better-sqlite3
- Architecture: HIGH - Shopify's cost algorithm, Relay pagination spec, and order status enums are well-documented with official sources
- Pitfalls: HIGH - Common issues (nested connection cost multiplication, non-deterministic ordering, stale bucket) identified from first principles and API documentation

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable -- Shopify's GraphQL patterns haven't changed fundamentally)
