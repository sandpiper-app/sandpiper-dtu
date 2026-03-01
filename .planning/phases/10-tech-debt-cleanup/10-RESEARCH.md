# Phase 10: Tech Debt Cleanup - Research

**Researched:** 2026-03-01
**Domain:** Tech debt resolution — GraphQL wiring, CI configuration, TypeScript build config, Docker config, documentation staleness
**Confidence:** HIGH

## Summary

Phase 10 resolves 6 remaining tech debt items identified in the v1.0 re-audit. The items span five distinct areas: (1) InventoryItem GraphQL type exists in schema but is unreachable from QueryRoot with no StateManager CRUD methods, (2) Slack live conformance has no CI schedule job despite having the adapter and scripts ready, (3) `@dtu/ui` is missing from `tsconfig.base.json` path aliases breaking `tsc --build` incremental tracking, (4) the shared Dockerfile exposes port 3000 which is wrong for the Slack twin and has a stale comment referencing deleted `@dtu/core`, and (5) ROADMAP.md Phase 7 entry shows incorrect completion status.

All items are well-scoped with clear before/after states. No external library installation is required. The InventoryItem wiring is the largest task — it requires new StateManager CRUD methods, GraphQL schema additions (QueryRoot fields + an update mutation), resolver implementation, and optionally UI views. All other items are small configuration or documentation fixes.

**Primary recommendation:** Address all 6 items in a single plan with well-ordered tasks — InventoryItem wiring first (most complex), then CI, tsconfig, Dockerfile, and ROADMAP fixes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-01 | GraphQL Admin API handles queries and mutations Sandpiper uses — orders, products, customers, inventory, fulfillments | InventoryItem research: schema type exists, DB table exists, type resolver exists, but no QueryRoot fields, no mutations, no StateManager CRUD. Needs full wiring following existing patterns for orders/products/customers. |
| INFRA-06 | Conformance suites run periodically (CI schedule) to detect upstream API drift | CI workflow research: `conformance-live` job only runs Shopify live suite. Slack has `conformance:live` script and `SlackLiveAdapter` ready. Need a parallel `conformance-live-slack` job with `SLACK_BOT_TOKEN` secret. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | SQLite state persistence for InventoryItem CRUD | Already used by StateManager for all other entity types |
| graphql | (existing) | Schema definition + resolvers for InventoryItem | Already used for all other Shopify GraphQL types |
| @graphql-tools/schema | (existing) | Schema composition | Already used via makeExecutableSchema |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dtu/ui (Eta + Pico CSS) | (existing) | Optional inventory UI views | If inventory UI is added for parity with orders/products/customers |
| GitHub Actions | N/A | CI workflow updates for Slack live conformance | Adding new job to conformance.yml |

### Alternatives Considered

No new libraries needed. All tech debt items use existing project infrastructure.

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Pattern 1: StateManager CRUD (for InventoryItem)
**What:** Follow the established pattern of prepared statements + typed methods used by orders, products, customers.
**When to use:** Adding new entity CRUD to StateManager.
**Example:**
```typescript
// Source: packages/state/src/state-manager.ts (existing pattern)

// 1. Add prepared statement fields
private createInventoryItemStmt: Database.Statement | null = null;
private getInventoryItemStmt: Database.Statement | null = null;
private getInventoryItemByGidStmt: Database.Statement | null = null;
private listInventoryItemsStmt: Database.Statement | null = null;
private updateInventoryItemStmt: Database.Statement | null = null;

// 2. Prepare in prepareStatements()
this.createInventoryItemStmt = db.prepare(
  'INSERT INTO inventory_items (gid, sku, tracked, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
);
this.getInventoryItemStmt = db.prepare('SELECT * FROM inventory_items WHERE id = ?');
this.getInventoryItemByGidStmt = db.prepare('SELECT * FROM inventory_items WHERE gid = ?');
this.listInventoryItemsStmt = db.prepare('SELECT * FROM inventory_items ORDER BY id ASC');
this.updateInventoryItemStmt = db.prepare(
  'UPDATE inventory_items SET sku = ?, tracked = ?, available = ?, updated_at = ? WHERE id = ?'
);

// 3. Add typed public methods (following createProduct/getProduct/listProducts pattern)
createInventoryItem(data: { gid: string; sku?: string; tracked?: boolean; available?: number }): number { ... }
getInventoryItem(id: number): any | undefined { ... }
getInventoryItemByGid(gid: string): any | undefined { ... }
listInventoryItems(): any[] { ... }
updateInventoryItem(id: number, data: { sku?: string; tracked?: boolean; available?: number }): void { ... }
```

### Pattern 2: GraphQL QueryRoot + Mutation Wiring
**What:** Add `inventoryItem(id: ID!)` and `inventoryItems(first, after, last, before)` to QueryRoot, plus `inventoryItemUpdate` mutation.
**When to use:** Making an existing GraphQL type reachable.
**Example:**
```graphql
# Add to QueryRoot in schema.graphql:
inventoryItems(first: Int = 10, after: String, last: Int, before: String): InventoryItemConnection!
inventoryItem(id: ID!): InventoryItem

# Add connection types:
type InventoryItemConnection {
  edges: [InventoryItemEdge!]!
  pageInfo: PageInfo!
}

type InventoryItemEdge {
  node: InventoryItem!
  cursor: String!
}

# Add mutation input + payload:
input InventoryItemUpdateInput {
  id: ID!
  sku: String
  tracked: Boolean
  available: Int
}

type InventoryItemUpdatePayload {
  inventoryItem: InventoryItem
  userErrors: [UserError!]!
}

# Add to MutationType:
inventoryItemUpdate(input: InventoryItemUpdateInput!): InventoryItemUpdatePayload!
```

### Pattern 3: CI Job Duplication for Slack Live Conformance
**What:** Add a `conformance-live-slack` job parallel to the existing `conformance-live` Shopify job.
**When to use:** Extending scheduled CI coverage to a second twin.
**Example:**
```yaml
# In .github/workflows/conformance.yml:
conformance-live-slack:
  name: Slack Live Conformance (scheduled only)
  if: github.event_name == 'schedule'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 9
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
    - name: Install dependencies
      run: pnpm install
    - name: Build packages
      run: pnpm build
    - name: Run live conformance suite against Slack workspace
      run: pnpm --filter @dtu/twin-slack run conformance:live
      env:
        SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

### Anti-Patterns to Avoid
- **Inventing new InventoryItem fields not in real Shopify API:** The twin's InventoryItem type already has `sku`, `tracked`, `available`. These are a simplified subset of the real API. Do NOT add fields like `requiresShipping`, `unitCost`, or `countryCodeOfOrigin` unless Sandpiper specifically uses them — the project principle is "only endpoints Sandpiper uses."
- **Creating InventoryItems as standalone mutations:** In real Shopify, InventoryItems are auto-created when a ProductVariant is created. Since this twin has no ProductVariant model, the twin should allow direct creation via admin fixtures AND provide an `inventoryItemUpdate` mutation (which is the real Shopify approach — items are updated, not created, via GraphQL).
- **Putting UI and GraphQL changes in the same task:** Keep schema/resolver changes separate from UI changes for clear verification.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor pagination for InventoryItem | Custom pagination logic | Existing `paginate<T>()` helper in resolvers.ts | Already handles cursor encoding/decoding, pageInfo, first/last/after/before |
| GID generation/parsing | Custom ID format | Existing `createGID()` / `parseGID()` from services/gid.js | Consistent `gid://shopify/InventoryItem/{id}` format across all types |
| Auth checking | Custom middleware | Existing `requireAuth(context)` pattern | Same pattern used by all other query/mutation resolvers |

**Key insight:** Every InventoryItem resolver method is a mechanical copy of the existing Product resolver pattern with field names swapped. The pagination helper, GID utilities, auth checks, and error simulation patterns are all reusable.

## Common Pitfalls

### Pitfall 1: Forgetting to null-reset prepared statements in reset() and close()
**What goes wrong:** StateManager.reset() closes DB and re-initializes. If new inventory prepared statements are added but not nulled in reset()/close(), stale references cause "database is closed" errors.
**Why it happens:** reset() and close() have long lists of statement nullifications that must be manually extended.
**How to avoid:** Always add new prepared statement fields to BOTH `reset()` AND `close()` methods alongside `prepareStatements()`.
**Warning signs:** Tests that call `stateManager.reset()` then inventory operations fail with database errors.

### Pitfall 2: Dockerfile EXPOSE is informational only
**What goes wrong:** Changing `EXPOSE 3000` to be dynamic or conditional. EXPOSE is documentation, not functional — the actual port binding is controlled by the `PORT` env var and `docker-compose.twin.yml`.
**Why it happens:** Confusion between EXPOSE (metadata) and runtime port binding.
**How to avoid:** The Dockerfile is parameterized (single Dockerfile for both twins). The simplest fix: either remove EXPOSE entirely (since docker-compose maps ports explicitly) or add a comment noting that the actual port is set via PORT env var at runtime. A more correct fix: use `ARG` to make EXPOSE match the twin's default port, but this adds complexity for zero runtime benefit.
**Warning signs:** None — EXPOSE mismatch is cosmetically wrong but functionally harmless.

### Pitfall 3: tsconfig.base.json paths vs references confusion
**What goes wrong:** Adding `@dtu/ui` to `paths` in tsconfig.base.json but forgetting to add `{ "path": "../../packages/ui" }` to twin tsconfig.json `references` arrays (and vice versa).
**Why it happens:** TypeScript project references require BOTH a path alias (for import resolution) AND a reference (for build ordering).
**How to avoid:** Always update both files together: tsconfig.base.json `paths` AND each consumer's tsconfig.json `references`.
**Warning signs:** `tsc --build` in twin directory does not rebuild when `@dtu/ui` source changes; or build errors about unresolved `@dtu/ui` imports.

### Pitfall 4: ROADMAP checkbox format
**What goes wrong:** Using `- [x]` format inconsistently with the rest of the ROADMAP.
**Why it happens:** Phase 7 plans are shown as `- [ ]` while the phase itself is `- [x]`. Need to fix BOTH the plan checkboxes AND the progress table.
**How to avoid:** Check both the plan list items AND the Phase Details progress table row.

## Code Examples

### InventoryItem QueryRoot Resolvers
```typescript
// Source: Pattern derived from existing resolvers.ts QueryRoot.products/customers
inventoryItems: async (
  _parent: unknown,
  args: { first?: number; after?: string; last?: number; before?: string },
  context: Context
) => {
  requireAuth(context);
  const items = context.stateManager.listInventoryItems();
  return paginate(items, args, 'InventoryItem');
},

inventoryItem: async (_parent: unknown, args: { id: string }, context: Context) => {
  requireAuth(context);
  const { id } = parseGID(args.id);
  const gid = createGID('InventoryItem', id);
  const item = context.stateManager.getInventoryItemByGid(gid);
  return item ?? null;
},
```

### InventoryItem Update Mutation
```typescript
// Source: Pattern derived from existing resolvers.ts MutationType.productUpdate
inventoryItemUpdate: async (_parent: unknown, args: { input: any }, context: Context) => {
  requireAuth(context);
  await context.errorSimulator.throwIfConfigured('inventoryItemUpdate');

  const { input } = args;
  const errors: UserError[] = [];

  let itemId: number;
  try {
    const { id } = parseGID(input.id);
    itemId = parseInt(id, 10);
  } catch (err) {
    errors.push({ field: ['id'], message: 'Invalid inventory item ID format' });
    return { inventoryItem: null, userErrors: errors };
  }

  const existing = context.stateManager.getInventoryItem(itemId);
  if (!existing) {
    errors.push({ field: ['id'], message: 'Inventory item not found' });
    return { inventoryItem: null, userErrors: errors };
  }

  context.stateManager.updateInventoryItem(itemId, {
    sku: input.sku ?? existing.sku,
    tracked: input.tracked ?? existing.tracked,
    available: input.available ?? existing.available,
  });
  const updated = context.stateManager.getInventoryItem(itemId);
  return { inventoryItem: updated, userErrors: [] };
},
```

### InventoryItem Type Resolver
```typescript
// Source: Pattern derived from existing resolvers.ts Product/Customer type resolvers
InventoryItem: {
  id: (parent: any) => createGID('InventoryItem', parent.id),
  createdAt: (parent: any) => parent.created_at,
  updatedAt: (parent: any) => parent.updated_at,
},
```

### Fixtures Endpoint Extension
```typescript
// Add to admin.ts FixturesLoadBody and fixtures endpoint:
interface FixturesLoadBody {
  orders?: any[];
  products?: any[];
  customers?: any[];
  inventoryItems?: any[];  // New
}

// In the fixtures handler:
const { inventoryItems = [] } = request.body;
for (const item of inventoryItems) {
  const itemId = Date.now() + Math.floor(Math.random() * 100000);
  fastify.stateManager.createInventoryItem({
    ...item,
    gid: createGID('InventoryItem', itemId),
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| InventoryItem as standalone entity | InventoryItem tied to ProductVariant | Shopify API 2023+ | Twin simplifies by treating InventoryItem as independent (no ProductVariant model). This is acceptable since twin only needs to serve the fields Sandpiper queries. |

**Note on Shopify InventoryItem reality:**
In the real Shopify Admin API, InventoryItem objects are automatically created when a ProductVariant is created. There is no `inventoryItemCreate` mutation — only `inventoryItemUpdate`. The twin's simplified model (no ProductVariant) means inventory items will be seeded via fixtures or admin endpoints and queried/updated via GraphQL. This is a reasonable simplification for the DTU pattern.

## Existing Codebase State (Inventory)

### What Already Exists
1. **GraphQL Schema** (`twins/shopify/src/schema/schema.graphql`):
   - `type InventoryItem { id: ID!, sku: String!, tracked: Boolean!, available: Int! }` (line 122-127)
   - No connection type, no query fields, no mutations for inventory
2. **Database Table** (`packages/state/src/state-manager.ts`):
   - `inventory_items` table created in migrations with `id, gid, sku, tracked, available, created_at, updated_at`
   - No prepared statements for inventory
   - No CRUD methods for inventory
3. **Type Resolver** (`twins/shopify/src/schema/resolvers.ts`):
   - `InventoryItem.id` resolver exists (line 736-738) — creates GID from parent.id
   - No `createdAt`/`updatedAt` field resolvers
4. **UI**: No inventory views exist in `twins/shopify/src/views/`
5. **Admin/Fixtures**: No inventory items in fixtures loading or state inspection

### What Needs to Be Added
1. **StateManager**: 5 prepared statements + 5 CRUD methods + statement nullification in reset()/close()
2. **GraphQL Schema**: `InventoryItemConnection`, `InventoryItemEdge`, `inventoryItems`/`inventoryItem` on QueryRoot, `InventoryItemUpdateInput`, `InventoryItemUpdatePayload`, `inventoryItemUpdate` on MutationType
3. **Resolvers**: Query resolvers (2), mutation resolver (1), extended type resolver (add `createdAt`/`updatedAt`)
4. **Admin Plugin**: Extend fixtures endpoint to accept `inventoryItems` array, extend state endpoint to count inventory items
5. **UI (optional)**: Add Inventory nav item and list/detail/form views following products pattern. Success criteria says "may require UI changes" — recommend adding basic CRUD UI for completeness.

## Existing Codebase State (Non-Inventory Items)

### Slack Live Conformance CI
- **Ready**: `SlackLiveAdapter` at `twins/slack/conformance/adapters/live-adapter.ts` requires `SLACK_BOT_TOKEN` env var
- **Ready**: `conformance:live` npm script in `twins/slack/package.json`
- **Missing**: `conformance-live-slack` job in `.github/workflows/conformance.yml`
- **Missing**: `SLACK_BOT_TOKEN` repository secret (must be configured by user in GitHub)

### tsconfig.base.json Path Aliases
- **Current state**: `paths` object has `@dtu/types`, `@dtu/state`, `@dtu/webhooks`, `@dtu/conformance` — missing `@dtu/ui`
- **Current twin refs**: Shopify tsconfig references types, state, webhooks, conformance — missing ui. Slack tsconfig references types, state, webhooks — missing ui.
- **@dtu/ui tsconfig**: Has `composite: true` correctly set, ready to be referenced
- **Fix**: Add `"@dtu/ui": ["./packages/ui/src"]` to tsconfig.base.json paths; add `{ "path": "../../packages/ui" }` to both twin tsconfig.json references

### Dockerfile Issues
- **Line 30 comment**: `"# Build shared packages first (order matters: types → state → core → webhooks → conformance → ui)"` — references `core` which was deleted in Phase 8
- **Line 82**: `EXPOSE 3000` — wrong for Slack twin (default port 3001). Since this is a parameterized Dockerfile used for both twins, consider: (a) remove EXPOSE entirely, (b) use `ARG TWIN_PORT=3000` + `EXPOSE $TWIN_PORT`, or (c) add a comment explaining PORT env var overrides EXPOSE
- **Docker Compose**: Already correctly maps `3001:3001` for Slack twin with `PORT: "3001"` env var
- **healthcheck.mjs**: Already reads `process.env.PORT || 3000` so it works correctly regardless of EXPOSE value

### ROADMAP.md Phase 7 Staleness
- Phase 7 header shows `- [x]` (correct)
- Phase 7 plan checkboxes show `- [ ] 07-01-PLAN.md` and `- [ ] 07-02-PLAN.md` (wrong — both completed)
- Phase 7 progress table shows `| 7. Integration & E2E Testing | 0/2 | Not started | - |` (wrong — should be `2/2 | Complete | 2026-03-01`)
- Phase 7 VERIFICATION.md shows `status: passed, verified: 2026-03-01`

## Open Questions

1. **InventoryItem UI: full CRUD or read-only?**
   - What we know: Success criteria says "may require UI changes." Other entities (orders, products, customers) all have full list/detail/form/create/edit/delete UI views.
   - What's unclear: Whether Sandpiper's test scenarios need UI-created inventory items or just fixture-loaded ones.
   - Recommendation: Add basic list/detail/form views following the products pattern for consistency. The views are mechanical copies of the product views with field names swapped (sku, tracked, available instead of title, description, vendor). LOW effort, HIGH completeness.

2. **Dockerfile EXPOSE fix approach**
   - What we know: EXPOSE is documentation-only. Docker Compose correctly maps ports. healthcheck.mjs correctly reads PORT env var.
   - What's unclear: Whether to use `ARG TWIN_PORT=3000` approach (more correct but more complex) or just remove EXPOSE (simpler but loses documentation value).
   - Recommendation: Use `ARG TWIN_PORT=3000` and `EXPOSE $TWIN_PORT`. Pass `--build-arg TWIN_PORT=3001` in docker-compose for Slack. This is low-cost and makes the Dockerfile self-documenting.

3. **Should InventoryItem schema fields match Shopify exactly or stay simplified?**
   - What we know: Current schema has `sku: String!, tracked: Boolean!, available: Int!` — all marked as non-nullable with `!`. Real Shopify has `sku` as nullable and no direct `available` field (it's on InventoryLevel). The `available` field is a simplification.
   - What's unclear: Whether Sandpiper queries specific fields that might fail on the current simplified schema.
   - Recommendation: Keep the simplified schema but make `sku` nullable (`String` instead of `String!`) to match real Shopify behavior. Keep `available: Int!` as a twin-specific convenience field (documented simplification). This avoids breaking changes while improving fidelity.

## Sources

### Primary (HIGH confidence)
- [Shopify InventoryItem Object](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem) — Full type definition, fields, relationships
- [Shopify inventoryItems Query](https://shopify.dev/docs/api/admin-graphql/latest/queries/inventoryItems) — Query arguments, pagination, filtering
- [Shopify inventoryItemUpdate Mutation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventoryItemUpdate) — Mutation for updating inventory items
- Codebase inspection (HIGH) — Direct file reads of all affected files

### Secondary (MEDIUM confidence)
- v1.0 re-audit report (`.planning/v1.0-MILESTONE-AUDIT.md`) — Definitive list of 6 tech debt items

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries, all changes use existing patterns
- Architecture: HIGH — Every pattern is a direct copy of existing codebase patterns
- Pitfalls: HIGH — Based on direct code inspection of actual files that need modification
- InventoryItem schema fidelity: MEDIUM — Simplified model vs real Shopify API is a deliberate tradeoff, but field nullability should be verified

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable tech debt items, no external dependency changes)
