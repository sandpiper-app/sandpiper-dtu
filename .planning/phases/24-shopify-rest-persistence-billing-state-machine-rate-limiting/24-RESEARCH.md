# Phase 24: Shopify REST Persistence, Billing State Machine & Rate Limiting - Research

**Researched:** 2026-03-12
**Domain:** Shopify twin — REST CRUD persistence, billing state machine, GraphQL rate limiting
**Confidence:** HIGH

## Summary

Phase 24 addresses three discrete behavioral gaps in the Shopify twin. Each gap is
independently fixable and all work within the existing stack (better-sqlite3, Fastify,
graphql-yoga). No new dependencies are required per the project-wide constraint established
in Phase 21's roadmap decision ("No new runtime dependencies").

**Gap 1 — REST Persistence (SHOP-20):** `POST /products.json` currently returns a
hardcoded stub (`id: 'gid://shopify/Product/1'`). The requirement is that the REST POST
creates a real product in StateManager and that a subsequent `GET /products/:id.json`
retrieves it by numeric integer ID. The GET by ID route currently returns `{ order: null }`
as a stub. StateManager already supports full product CRUD including `createProduct` and
`getProductByGid`, so the fix is plumbing the REST handlers to call the existing methods.
The ID shape needed is numeric integer (not GID string) per SHOP-20.

**Gap 2 — Billing State Machine (SHOP-21):** `appSubscriptionCreate` currently returns a
hardcoded stub with no persisted state. The requirement is a full PENDING → ACTIVE →
CANCELLED lifecycle: `appSubscriptionCreate` stores the subscription in PENDING state and
returns a `confirmationUrl`; visiting that URL transitions it to ACTIVE; `currentAppInstallation`
returns the active subscription; `appSubscriptionCancel` validates ownership and transitions
to CANCELLED. This requires a new `app_subscriptions` SQLite table in StateManager, a new
HTTP confirmation endpoint (GET `/admin/charges/:id/confirm_recurring`), updates to three
GraphQL resolvers, and an HTTP confirmation route.

**Gap 3 — Rate Limiting (SHOP-24):** Two bugs. (1) `maxAvailable` is 2000 in the app
constructor but the requirement mandates 1000. The elevated value was added as a workaround
for a billing query that overcosts under the twin's conservative model. The real fix is to
compute `actualQueryCost` differently from `requestedQueryCost` — the requirement says
`actualQueryCost` should reflect real field traversal, meaning it should be the computed
cost using the schema, while `requestedQueryCost` is the pre-execution estimate. Currently
both are set to the same value. Existing unit tests already assert `maxAvailable === 1000`
and `restoreRate === 50` on the `LeakyBucketRateLimiter` defaults, and the integration test
expects `maximumAvailable` to be 2000 — that integration test is wrong relative to the
requirement and will need updating along with the app constructor.

**Primary recommendation:** Three independent, sequentially-planned tasks: (1) REST product
persistence + GET by ID for both products and orders, (2) billing state machine with new
SQLite table + confirmation endpoint + resolver updates, (3) rate limiter bucket size fix to
1000 with actualQueryCost computed from post-execution field traversal.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-20 | REST resources use persistent CRUD: POST /products.json creates retrievable product; response shapes use numeric integer IDs with `admin_graphql_api_id`; GET /orders/:id.json returns specific order by numeric ID | StateManager already has `createProduct`/`getProductByGid`; REST plugin POST handler is stub; GET /orders/:id.json returns null; needs plumbing + ID format fix |
| SHOP-21 | Billing state machine: `appSubscriptionCreate` → PENDING + confirmationUrl; confirm → ACTIVE; `currentAppInstallation` returns actual subscription; `appSubscriptionCancel` validates ownership + → CANCELLED | New `app_subscriptions` table needed in StateManager; 3 resolver changes; new confirmation HTTP route in admin or oauth plugin |
| SHOP-24 | Rate limiting: bucket size 1000, restoreRate 50; `actualQueryCost` from real query field traversal (not echoing `requestedQueryCost`) | `LeakyBucketRateLimiter` defaults already 1000/50; app constructor overrides to 2000 (must revert); `actualQueryCost` currently equals `requestedQueryCost` in graphql.ts; fix = keep `requestedQueryCost` as pre-execution estimate, set `actualQueryCost` to post-execution computed cost |
</phase_requirements>

## Standard Stack

### Core (already in use — no changes)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| better-sqlite3 | existing | SQLite state persistence | StateManager already wraps it |
| Fastify | v5 | HTTP server | All REST and admin routes |
| graphql-yoga | existing | GraphQL execution | Admin + Storefront |
| graphql | existing | Schema + query parsing | `calculateQueryCost` already uses `parse` from graphql |

### No New Dependencies
The v1.2 roadmap decision (2026-03-11) explicitly states: "No new runtime dependencies —
all HMAC signing via node:crypto, state via existing better-sqlite3." This phase follows
that constraint exactly.

## Architecture Patterns

### Recommended Project Structure (unchanged)

```
twins/shopify/src/
├── plugins/
│   ├── admin.ts       # /admin/tokens, /admin/reset, /admin/fixtures/load
│   ├── graphql.ts     # GraphQL endpoint, rate limiter integration
│   ├── oauth.ts       # OAuth flows; may host confirmation URL handler
│   └── rest.ts        # REST endpoints for products, orders, etc.
├── schema/
│   ├── resolvers.ts   # appSubscriptionCreate, appSubscriptionCancel, currentAppInstallation
│   └── schema.graphql # no changes expected
└── services/
    └── rate-limiter.ts # LeakyBucketRateLimiter — no changes to service itself
packages/state/src/
└── state-manager.ts   # add app_subscriptions table + CRUD methods
```

### Pattern 1: REST Persistence for Products

**What:** The REST `POST /products.json` handler creates a real product in StateManager
and returns the new product's numeric integer ID and `admin_graphql_api_id` field.
`GET /products/:id.json` retrieves the product by its integer ID.

**When to use:** Any REST endpoint that needs read-after-write consistency.

**Current stub (lines 135-141 of rest.ts):**
```typescript
// POST /admin/api/:version/products.json
fastify.post(adminPath('/products.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  reply.status(201);
  return { product: { id: 'gid://shopify/Product/1', title: 'New Product' } };
});
```

**Fixed pattern:**
```typescript
// POST /admin/api/:version/products.json
fastify.post(adminPath('/products.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const input = (req.body as any)?.product ?? {};
  const tempId = Date.now() + Math.floor(Math.random() * 100000);
  const gid = `gid://shopify/Product/${tempId}`;
  const productRowId = (fastify as any).stateManager.createProduct({
    gid,
    title: input.title ?? 'New Product',
    description: input.description ?? null,
    vendor: input.vendor ?? null,
    product_type: input.product_type ?? null,
  });
  const product = (fastify as any).stateManager.getProduct(productRowId);
  reply.status(201);
  return {
    product: {
      id: product.id,                  // numeric integer (from INTEGER PRIMARY KEY AUTOINCREMENT)
      admin_graphql_api_id: product.gid, // "gid://shopify/Product/..."
      title: product.title,
      created_at: new Date(product.created_at * 1000).toISOString(),
      updated_at: new Date(product.updated_at * 1000).toISOString(),
    },
  };
});
```

**Critical shape detail:** Real Shopify REST returns `id` as a numeric integer, not a GID
string. The `admin_graphql_api_id` is the GID string. The products table `id` column is
`INTEGER PRIMARY KEY AUTOINCREMENT`, so `product.id` is already a number — just use it
directly without wrapping in `gid://`.

### Pattern 2: GET by Numeric ID (Products and Orders)

**What:** Extract numeric integer ID from URL param, look up by GID (since StateManager
indexes by GID), return the resource with numeric `id` field.

**Key translation:** URL param `:id` is the integer ID. GID is
`gid://shopify/Product/${id}`. Use `getProductByGid` with the constructed GID.

```typescript
// GET /admin/api/:version/products/:id.json
fastify.get(adminPath('/products/:id.json'), async (req: any, reply) => {
  const version = parseVersionHeader(req, reply);
  if (version === null) return;
  if (!await requireToken(req, reply)) return;
  const numericId = (req.params.id as string).replace(/\.json$/, '');
  const gid = `gid://shopify/Product/${numericId}`;
  const product = (fastify as any).stateManager.getProductByGid(gid);
  if (!product) {
    return reply.status(404).send({ errors: 'Not Found' });
  }
  return {
    product: {
      id: product.id,
      admin_graphql_api_id: product.gid,
      title: product.title,
      created_at: new Date(product.created_at * 1000).toISOString(),
      updated_at: new Date(product.updated_at * 1000).toISOString(),
    },
  };
});
```

**Same pattern applies to GET /orders/:id.json** — currently returns `{ order: null }`.

**Complication for orders:** The GID for an order seeded through fixtures uses the `gid`
field stored at creation time, which was constructed from a tempId. The numeric `id` in the
URL is the SQLite AUTOINCREMENT value. The mapping is: `gid = "gid://shopify/Order/{tempId}"`,
but `product.id` (the row id) is the autoincrement. These diverge unless we change how GIDs
are created. The cleanest fix: after insertion, fetch the row, then reconstruct the GID
using the autoincrement `id` so GID and integer ID stay in sync.

**Important:** The existing `createProduct` logic generates a `tempId` for the GID before
insertion, then the actual AUTOINCREMENT id differs. For REST read-by-id to work reliably,
the REST POST handler must store the product with a GID derived from the actual inserted
row ID. This requires a two-step: insert with placeholder GID, get the row ID, then update
the GID — or use the `updateProduct` approach. Alternatively, use the row ID as the GID
numerics consistently. See Pitfall 1 below.

### Pattern 3: Billing State Machine

**What:** New `app_subscriptions` table in StateManager tracks billing state. GraphQL
resolvers create/query/cancel subscriptions via StateManager. A new HTTP route handles
confirmation.

**State machine transitions:**
```
appSubscriptionCreate → status = 'PENDING', stored in DB
GET /admin/charges/:id/confirm_recurring → status = 'ACTIVE'
appSubscriptionCancel(id) → validate ownership → status = 'CANCELLED'
currentAppInstallation → SELECT * FROM app_subscriptions WHERE status = 'ACTIVE'
```

**New StateManager table:**
```sql
CREATE TABLE IF NOT EXISTS app_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  return_url TEXT,
  test BOOLEAN DEFAULT 1,
  trial_days INTEGER DEFAULT 0,
  shop_domain TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Confirmation URL format** (current in resolvers.ts line 785):
```
'https://dev.myshopify.com/admin/charges/1/confirm_recurring'
```
The ID in the URL must match the subscription's numeric ID so the confirmation handler
can look it up.

**New HTTP confirmation route (add to admin.ts or oauth.ts):**
```typescript
// GET /admin/charges/:id/confirm_recurring
fastify.get<{ Params: { id: string } }>('/admin/charges/:id/confirm_recurring', async (req, reply) => {
  const numericId = parseInt(req.params.id, 10);
  const subscription = stateManager.getAppSubscription(numericId);
  if (!subscription || subscription.status !== 'PENDING') {
    return reply.status(404).send({ error: 'Subscription not found or not in PENDING state' });
  }
  stateManager.updateAppSubscriptionStatus(subscription.id, 'ACTIVE');
  // Redirect to the returnUrl (or a success page)
  return reply.redirect(subscription.return_url ?? 'https://dev.myshopify.com', 302);
});
```

**Updated `appSubscriptionCreate` resolver:**
```typescript
appSubscriptionCreate: (_: unknown, args: any, context: Context) => {
  requireAuth(context);
  const id = context.stateManager.createAppSubscription({
    name: args.name,
    return_url: args.returnUrl,
    test: args.test ?? true,
    trial_days: args.trialDays ?? 0,
    shop_domain: context.shopDomain,
  });
  const subscription = context.stateManager.getAppSubscription(id);
  const confirmationUrl = `https://dev.myshopify.com/admin/charges/${id}/confirm_recurring`;
  return {
    appSubscription: {
      id: `gid://shopify/AppSubscription/${id}`,
      name: subscription.name,
      status: 'PENDING',
      test: subscription.test,
      returnUrl: subscription.return_url,
      currentPeriodEnd: null,
      trialDays: subscription.trial_days,
      lineItems: [],
      createdAt: new Date(subscription.created_at * 1000).toISOString(),
    },
    confirmationUrl,
    userErrors: [],
  };
},
```

**`appSubscriptionCancel` — ownership validation:**
The requirement says "validates that the subscription belongs to the requesting
installation." The twin models installation identity via `context.shopDomain`. Each
subscription stores `shop_domain`. Validation: confirm subscription's `shop_domain`
matches `context.shopDomain`.

```typescript
appSubscriptionCancel: (_: unknown, args: { id: string }, context: Context) => {
  requireAuth(context);
  const { id: numericId } = parseGID(args.id);
  const subscription = context.stateManager.getAppSubscriptionByGid(args.id);
  if (!subscription) {
    return {
      appSubscription: null,
      userErrors: [{ field: ['id'], message: 'Subscription not found' }],
    };
  }
  if (subscription.shop_domain !== context.shopDomain) {
    return {
      appSubscription: null,
      userErrors: [{ field: ['id'], message: 'Subscription does not belong to this installation' }],
    };
  }
  context.stateManager.updateAppSubscriptionStatus(subscription.id, 'CANCELLED');
  const updated = context.stateManager.getAppSubscription(subscription.id);
  return {
    appSubscription: {
      id: args.id,
      name: updated.name,
      status: 'CANCELLED',
      test: updated.test,
      returnUrl: updated.return_url,
      currentPeriodEnd: null,
      trialDays: updated.trial_days,
      lineItems: [],
      createdAt: new Date(updated.created_at * 1000).toISOString(),
    },
    userErrors: [],
  };
},
```

**`currentAppInstallation` resolver — active subscriptions:**
```typescript
currentAppInstallation: (_: unknown, _args: unknown, context: Context) => {
  requireAuth(context);
  const activeSubscriptions = context.stateManager.listActiveAppSubscriptions(context.shopDomain);
  return {
    activeSubscriptions: activeSubscriptions.map((sub: any) => ({
      id: `gid://shopify/AppSubscription/${sub.id}`,
      name: sub.name,
      status: sub.status,
      test: sub.test === 1,
      returnUrl: sub.return_url ?? 'https://example.com',
      currentPeriodEnd: null,
      trialDays: sub.trial_days ?? 0,
      lineItems: [],
      createdAt: new Date(sub.created_at * 1000).toISOString(),
    })),
    oneTimePurchases: {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
},
```

### Pattern 4: Rate Limiting Fix (SHOP-24)

**What:** Two distinct fixes.

**Fix A — Restore bucket size to 1000:**

In `src/index.ts` line 88:
```typescript
// Current (wrong):
const rateLimiter = new LeakyBucketRateLimiter(2000, 50, options.rateLimit !== false);

// Fixed:
const rateLimiter = new LeakyBucketRateLimiter(1000, 50, options.rateLimit !== false);
```

The comment explains why 2000 was used: `billing.check` uses `oneTimePurchases(first: 250)`
which costs ~1004 points. The real fix is to compute `actualQueryCost` correctly. After that
fix, the billing query won't over-consume the bucket at 1000, making the workaround
unnecessary.

**Fix B — actualQueryCost from real traversal vs requestedQueryCost:**

The SHOP-24 requirement: "`actualQueryCost` is computed from real query field traversal
rather than echoing `requestedQueryCost`."

Current behavior in `graphql.ts` (lines ~396-408):
```typescript
cost: {
  requestedQueryCost: queryCost,
  actualQueryCost: queryCost,  // Same as requested — this is the bug
  throttleStatus: { ... }
}
```

The distinction in Shopify's real API: `requestedQueryCost` is a pre-execution upper-bound
estimate (using `first`/`last` args at face value), while `actualQueryCost` is the
post-execution cost reflecting actual items returned (which may be fewer than requested).

**Implementation approach:** `calculateQueryCost` already traverses the query document
before execution using schema type info. The `requestedQueryCost` is this pre-execution
value. For `actualQueryCost`, the twin should re-compute cost against the actual resolver
output — but this requires access to the response body to count actual edge counts.

**Simpler correct approach (used by many twin implementations):** Use `calculateQueryCost`
on the parsed document as `requestedQueryCost` (pre-execution estimate), and compute
`actualQueryCost` the same way but capped by what was actually returned. In the twin,
response data is available after `yoga.fetch()` in the parsed `responseBody`. The actual
cost can be computed by walking the data response and counting actual items vs requested.

**Pragmatic approach the requirement actually enables:** The requirement says "computed from
real query field traversal." This means: run the cost calculator on the query AST against
the schema (what we already do), then report that as `actualQueryCost` too — BUT the
`requestedQueryCost` should be the worst-case estimate (all connections at their
`first`/`last` size), while `actualQueryCost` reflects actual items returned. For a twin
where pagination typically returns all items seeded (often fewer than `first`), this matters.

**Minimum viable fix that satisfies SHOP-24:** Keep `requestedQueryCost` as the
pre-execution AST traversal result. Compute `actualQueryCost` by re-running the cost
calculator but using the actual response data to determine real edge counts. This is
non-trivial to do perfectly, but a practical approach is:

1. Parse the response body after `yoga.fetch()`
2. Count actual edges/nodes returned in Connection fields
3. Re-compute cost substituting actual counts for the connection `first`/`last` args

**Simplest approach that remains correct and unblocks the billing check issue:** The
real Shopify billing `check` query uses `oneTimePurchases(first: 250)`. With 0 actual
purchases, `actualQueryCost` should be nearly 0 (no items to traverse), while
`requestedQueryCost` would be ~1004. This is why `maxAvailable` was raised to 2000.
If `actualQueryCost` is computed from actual traversal and the twin's rate limiter
deducts `actualQueryCost` (not `requestedQueryCost`), then a query requesting 250 items
but returning 0 costs almost nothing.

**Rate limiter consumes `actualQueryCost`, not `requestedQueryCost`:**
Currently the pre-execution cost is consumed before `yoga.fetch()`. To use actual cost,
the flow must change:
1. Compute `requestedQueryCost` (pre-execution estimate) as throttle gate check
2. Execute the query
3. Compute `actualQueryCost` from response
4. Correct the bucket: refund `(requestedQueryCost - actualQueryCost)` back to bucket

OR alternatively: consume `requestedQueryCost` upfront as a reservation, then after
execution refund the difference. This is the correct Shopify-compatible approach.

The simplest implementation: compute `actualQueryCost` by walking the response JSON and
counting actual connection sizes, then injecting both values into extensions.cost.

### Anti-Patterns to Avoid

- **Keeping hardcoded stub responses for POST /products.json** — fails SHOP-20 criteria 1
- **Using GID strings as REST `id` fields** — SHOP-20 explicitly requires numeric integer IDs
- **Keeping `actualQueryCost === requestedQueryCost`** — fails SHOP-24 criteria 5
- **Not adding `app_subscriptions` to StateManager `reset()`** — violates XCUT-01 (reset coverage)
- **Building a separate GID-to-ID lookup** — use the existing pattern: GID contains the numeric ID, parse it back with `parseGID`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite persistence | Custom file I/O or JSON files | better-sqlite3 via StateManager | Already pattern-established; synchronous; reset() pattern exists |
| Response JSON traversal for actualQueryCost | External GraphQL analysis library | Walk `responseBody.data` recursively counting array lengths | Simpler, no new dep, sufficient for twin |
| Confirmation URL HMAC signing | Custom crypto | No signing needed — twin is a local test server | Shopify's real confirmation URLs are signed but the twin only needs to serve the redirect flow |

**Key insight:** All three problem areas are solved by extending existing patterns. StateManager
already manages billing-adjacent state (tokens, OAuth codes). The rate limiter already has
the bucket mechanics. The REST handlers already validate and plumb into StateManager.

## Common Pitfalls

### Pitfall 1: GID/Integer ID Mismatch in REST Responses
**What goes wrong:** `createProduct` in StateManager uses a pre-generated `tempId` for the
GID, then the AUTOINCREMENT row `id` is different. A `GET /products/123.json` constructs
`gid://shopify/Product/123` and calls `getProductByGid`, but the stored GID is
`gid://shopify/Product/1748935721843` (tempId).
**Why it happens:** The GID is created before insertion using `Date.now()` + random, while
the `id` column is assigned by SQLite AUTOINCREMENT.
**How to avoid:** Two options:
  1. After `createProduct`, call `getProduct(rowId)`, extract the row `id`, then
     separately update the GID to `gid://shopify/Product/${rowId}`. Requires a new
     `updateProductGid` method in StateManager OR inline SQL.
  2. Use a deterministic two-step: insert with a sentinel GID, get the row ID from
     `lastInsertRowid`, then immediately `UPDATE products SET gid = ? WHERE id = ?`.
     This is the cleanest approach.
**Warning signs:** `GET /products/:id.json` returns 404 for products that were just created.

The existing GraphQL `productCreate` resolver has the same issue — the GID stored in the DB
is the `tempId`-based one, not the row ID. However, GraphQL lookups use GID directly (not
integer ID), so GraphQL is unaffected. The REST read-by-integer-ID path is the new concern.

**Resolution for this phase:** In the REST `POST /products.json` handler, after calling
`stateManager.createProduct({gid: tempGid, ...})`, get the row ID from the result, then
update the product's GID to `gid://shopify/Product/${rowId}` using inline SQL on the
database. Then the REST product shape has `id: rowId` and `admin_graphql_api_id: gid://shopify/Product/${rowId}`.

Same approach for orders: REST `GET /orders/:id.json` constructs the GID from the integer
ID in the URL. Orders seeded via `/admin/fixtures/load` or GraphQL mutations also use
tempId-based GIDs. A pragmatic fix for orders is to add a `getOrderById` method to
StateManager (lookup by `id` column, not `gid`) to bypass the GID mismatch.

### Pitfall 2: XCUT-01 — Reset Coverage for New Tables
**What goes wrong:** A new `app_subscriptions` table is added to StateManager but not
included in the `reset()` method. Tests that call `/admin/reset` between runs will find
stale billing state.
**Why it happens:** StateManager's `reset()` does a close-and-reinit pattern, which
drops and recreates all tables via `runMigrations()`. Since `CREATE TABLE IF NOT EXISTS`
is idempotent, the new table IS recreated on reset — this pattern works correctly.
The risk is forgetting to null out the new prepared statements in `reset()` and `close()`.
**How to avoid:** Add all new prepared statements to the null-assignment block in both
`reset()` and `close()` methods. Check XCUT-01 requirement.
**Warning signs:** Tests pass in isolation but fail when run sequentially after another
test that seeds billing data.

### Pitfall 3: Rate Limiter maxAvailable=2000 Integration Test
**What goes wrong:** `twins/shopify/test/integration/rate-limit.test.ts` currently asserts
`cost.throttleStatus.maximumAvailable === 2000` (line 70, 162). If we fix the
`buildApp` constructor to use 1000, these assertions will fail.
**Why it happens:** The test was written when the workaround was introduced.
**How to avoid:** Update the integration test assertions to expect 1000 when fixing the
constructor. Also update the comment in `buildApp` that explains why 2000 was used.

### Pitfall 4: billing.check Still Works After maxAvailable=1000 Fix
**What goes wrong:** The `billing.check` SDK verification test (SHOP-13) calls
`oneTimePurchases(first: 250)` which has high `requestedQueryCost`. If the rate limiter
deducts `requestedQueryCost` upfront and bucket is only 1000, the test may 429.
**Why it happens:** Phase 21 roadmap noted this exact trap — the 2000-point workaround was
explicitly introduced to prevent billing.check from hitting 429.
**How to avoid:** The SHOP-24 fix (actualQueryCost from real traversal + deduct actual cost)
is the root fix. The rate limiter must be updated to: (a) pre-check against `requestedQueryCost`
(reject if bucket < requestedQueryCost), but (b) only deduct `actualQueryCost` after execution.
With `oneTimePurchases(first: 250)` returning 0 items, `actualQueryCost` will be ~0,
making the 1000-bucket sufficient.
**Warning signs:** `shopify-api-billing.test.ts` test `check returns false` fails with 429.

### Pitfall 5: Confirmation URL Points to Test Server
**What goes wrong:** `appSubscriptionCreate` currently returns a hardcoded URL:
`https://dev.myshopify.com/admin/charges/1/confirm_recurring`. The twin needs to serve
this URL as an HTTP endpoint. Since `dev.myshopify.com` is the shop domain used in tests
and is redirected to `localhost:{port}` via the SDK's URL rewriting, the confirmation GET
request from billing tests will hit the twin.
**Why it happens:** The existing SDK billing tests use `clientCredentials` grant type, which
doesn't trigger the confirmation flow (the tests don't actually visit the confirmationUrl).
**How to avoid:** For SHOP-21, new tests need to visit the confirmationUrl. The URL must
route correctly through the twin. Use a relative path or the `dev.myshopify.com` hostname
that the test's fetch helper rewrites to localhost.

## Code Examples

Verified patterns from existing codebase:

### StateManager: Two-Step GID Fix
```typescript
// In rest.ts POST /products.json
const tempGid = `gid://shopify/Product/temp-${Date.now()}`;
const rowId = (fastify as any).stateManager.createProduct({
  gid: tempGid,
  title: input.title ?? 'New Product',
});
// Update GID to use actual integer row ID
const finalGid = `gid://shopify/Product/${rowId}`;
(fastify as any).stateManager.database
  .prepare('UPDATE products SET gid = ? WHERE id = ?')
  .run(finalGid, rowId);
const product = (fastify as any).stateManager.getProduct(rowId);
```

### StateManager: New App Subscriptions Methods (pattern follows existing order/product methods)
```typescript
// In state-manager.ts — mirrors createOrder pattern
createAppSubscription(data: {
  name: string; return_url?: string; test?: boolean; trial_days?: number; shop_domain: string;
}): number {
  const now = Math.floor(Date.now() / 1000);
  const id = /* lastInsertRowid from INSERT */;
  const gid = `gid://shopify/AppSubscription/${id}`;
  // UPDATE gid after insert (same two-step pattern)
  return id;
}
```

### Rate Limiter: requestedQueryCost vs actualQueryCost Flow
```typescript
// In graphql.ts — updated flow
// 1. Pre-execution: compute requestedQueryCost (existing code)
const requestedQueryCost = calculateQueryCost(document, schema, variables);

// 2. Pre-execution: check if bucket has enough (reject if not)
const throttleCheck = fastify.rateLimiter.tryConsume(rateLimitKey, requestedQueryCost);
if (!throttleCheck.allowed) { /* 429 */ }

// 3. Execute query
const response = await yoga.fetch(...);
const responseBody = JSON.parse(await response.text());

// 4. Post-execution: compute actualQueryCost from response data
const actualQueryCost = computeActualCost(responseBody.data, requestedQueryCost);

// 5. Refund the difference back to the bucket
const refund = requestedQueryCost - actualQueryCost;
if (refund > 0) {
  fastify.rateLimiter.refund(rateLimitKey, refund);
}

// 6. Inject extensions.cost with both values
responseBody.extensions = {
  cost: {
    requestedQueryCost,
    actualQueryCost,
    throttleStatus: { ... }
  }
};
```

Note: `LeakyBucketRateLimiter` needs a `refund(key, amount)` method — or alternatively,
`tryConsume` can accept a negative cost. The simplest implementation adds a `refund` method.

### Response Traversal for actualQueryCost
```typescript
/**
 * Walk a GraphQL response data object and count actual items in Connection fields.
 * Connections are identified by having an `edges` array or `nodes` array.
 * Returns an adjusted cost: same as requestedQueryCost but replacing connection
 * page sizes with actual item counts.
 *
 * Simpler approach: count edges/nodes recursively and scale down proportionally.
 * For the twin's use case (billing.check with 0 items), actual cost approaches 0.
 */
function computeActualCost(data: unknown, requestedCost: number): number {
  if (!data || typeof data !== 'object') return requestedCost;
  // Walk the response and find the ratio of actual/requested items
  // Simpler: reuse calculateQueryCost with response-derived page sizes
  // For now, a pragmatic approach: if all connections returned 0 edges, actual cost = 0
  // Full implementation: recurse through data, find connections, count items
  return walkDataForCost(data as Record<string, unknown>);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded stub POST /products.json | State-backed POST + GET by ID | Phase 24 | Read-after-write consistency |
| Billing stub resolvers | Full PENDING/ACTIVE/CANCELLED state machine | Phase 24 | billing.check returns real active subscriptions |
| actualQueryCost = requestedQueryCost | actualQueryCost from response traversal | Phase 24 | Bucket not over-consumed by queries returning 0 items |
| maxAvailable=2000 workaround | maxAvailable=1000 (correct Shopify default) | Phase 24 | Matches real Shopify API behavior |

**Note on existing rate-limit tests:** The integration test at
`twins/shopify/test/integration/rate-limit.test.ts` currently hardcodes `maximumAvailable: 2000`.
This test was written with the workaround in place and MUST be updated in Phase 24 to
expect `maximumAvailable: 1000`.

**Note on existing billing test (SHOP-13):** The existing `billing.check` SDK test expects
`hasPayment === false` on empty state. With the SHOP-21 billing state machine, this test
still passes (no active subscriptions after reset), but new tests need to cover the
confirmation flow that was not previously testable.

## Open Questions

1. **actualQueryCost implementation depth**
   - What we know: `requestedQueryCost` = pre-execution AST traversal; `actualQueryCost` should reflect real items returned
   - What's unclear: Whether the billing.check SDK test actually asserts on `actualQueryCost` vs just whether 429 occurs; whether a simple "refund unused capacity" approach is sufficient vs full re-traversal
   - Recommendation: Implement a response-walking approach that counts `edges.length` and `nodes.length` in connection fields; this is sufficient to handle the billing.check case (0 items = near-zero actual cost)

2. **Confirmation URL HTTP method and redirect behavior**
   - What we know: Shopify's real confirmation URL uses a browser GET and redirects to `returnUrl` on confirm
   - What's unclear: Whether billing SDK tests will actually call the confirmationUrl or just assert it's a string
   - Recommendation: Add the GET route anyway per SHOP-21 success criteria 3; the existing SHOP-13 billing tests don't visit the URL, but new SHOP-21 tests will need to

3. **XCUT-01 interaction with StateManager reset pattern**
   - What we know: StateManager.reset() does close-and-reinit; all tables are dropped and recreated via runMigrations(); this inherently satisfies XCUT-01 for table contents
   - What's unclear: Whether XCUT-01 requires an explicit table list or just reset behavior
   - Recommendation: The close-and-reinit pattern already satisfies the reset requirement; just ensure prepared statements are nulled in both reset() and close()

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (^3.0.0) |
| Config file | `twins/shopify/vitest.config.ts` |
| Quick run command | `pnpm vitest run --project @dtu/twin-shopify` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-20a | POST /products.json creates persisted product with numeric ID + admin_graphql_api_id | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-20b | GET /products/:id.json returns product created by POST | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-20c | GET /orders/:id.json returns specific order by numeric ID | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-21a | appSubscriptionCreate returns PENDING + confirmationUrl | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-21b | GET confirmation URL transitions subscription to ACTIVE | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-21c | currentAppInstallation returns active subscription data | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-21d | appSubscriptionCancel validates ownership + → CANCELLED | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |
| SHOP-24a | Rate limiter maxAvailable=1000, restoreRate=50 | unit | `pnpm vitest run --project @dtu/twin-shopify` | ✅ (needs assertion update) |
| SHOP-24b | actualQueryCost differs from requestedQueryCost on sparse results | integration | `pnpm vitest run --project @dtu/twin-shopify` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project @dtu/twin-shopify`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `twins/shopify/test/integration/rest-persistence.test.ts` — covers SHOP-20a, SHOP-20b, SHOP-20c
- [ ] `twins/shopify/test/integration/billing-state-machine.test.ts` — covers SHOP-21a through SHOP-21d
- [ ] `twins/shopify/test/integration/rate-limit.test.ts` assertion update — SHOP-24a (maximumAvailable: 2000 → 1000)
- [ ] New assertion in rate-limit.test.ts for actualQueryCost ≠ requestedQueryCost — SHOP-24b

## Sources

### Primary (HIGH confidence)
- Direct code reading: `twins/shopify/src/plugins/rest.ts` — current stub handlers
- Direct code reading: `twins/shopify/src/schema/resolvers.ts` — current billing resolvers (lines 770-821)
- Direct code reading: `packages/state/src/state-manager.ts` — StateManager API surface
- Direct code reading: `twins/shopify/src/services/rate-limiter.ts` — LeakyBucketRateLimiter defaults
- Direct code reading: `twins/shopify/src/index.ts` line 88 — maxAvailable=2000 override with comment
- Direct code reading: `twins/shopify/test/integration/rate-limit.test.ts` lines 70, 162 — asserts maximumAvailable=2000

### Secondary (MEDIUM confidence)
- Direct code reading: `twins/shopify/test/services/rate-limiter.test.ts` — unit tests assert defaults 1000/50
- Direct code reading: `tests/sdk-verification/sdk/shopify-api-billing.test.ts` — existing billing SDK tests
- `.planning/STATE.md` — accumulated project decisions, confirmed no new runtime dependencies constraint

### Tertiary (LOW confidence)
- None — all findings are from direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; everything is in existing code
- Architecture: HIGH — existing patterns are clear; GID/ID mismatch pitfall identified with solution
- Pitfalls: HIGH — all pitfalls identified from direct code reading; not speculative

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable codebase; only changes if Phase 23 is modified)
