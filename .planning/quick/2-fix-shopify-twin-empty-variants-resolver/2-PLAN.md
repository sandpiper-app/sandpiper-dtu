---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/state/src/state-manager.ts
  - twins/shopify/src/plugins/admin.ts
  - twins/shopify/src/schema/resolvers.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Seeded variant data is returned from Product.variants queries instead of always returning empty nodes"
    - "POST /admin/fixtures/load accepts variants nested under each product fixture and persists them to the DB"
    - "InventoryItem.inventoryLevels remains intentionally empty (documented behaviour, not a bug)"
    - "pnpm test passes with no regressions"
  artifacts:
    - path: "packages/state/src/state-manager.ts"
      provides: "variants table migration, createVariant/listVariantsByProductGid/deleteVariantsByProductGid methods"
    - path: "twins/shopify/src/plugins/admin.ts"
      provides: "fixtures/load reads product.variants array and calls createVariant for each"
    - path: "twins/shopify/src/schema/resolvers.ts"
      provides: "Product.variants reads from stateManager.listVariantsByProductGid instead of hardcoding empty"
  key_links:
    - from: "twins/shopify/src/plugins/admin.ts"
      to: "packages/state/src/state-manager.ts"
      via: "fastify.stateManager.createVariant()"
      pattern: "createVariant"
    - from: "twins/shopify/src/schema/resolvers.ts"
      to: "packages/state/src/state-manager.ts"
      via: "context.stateManager.listVariantsByProductGid(parent.gid)"
      pattern: "listVariantsByProductGid"
---

<objective>
Fix the Shopify twin so that ProductVariant data seeded via the fixtures endpoint is actually returned when GraphQL queries request `product { variants { nodes { ... } } }`. Currently `Product.variants` unconditionally returns `{ nodes: [] }`, making seeded variants invisible.

Purpose: Variant data is a core part of Shopify product responses. Tests and the real ShopifyClient SDK expect variant nodes to be present when products are seeded with them.
Output: variants table in SQLite, fixture loading persists variants, resolver reads from state.
</objective>

<execution_context>
@/Users/futur/.claude/get-shit-done/workflows/execute-plan.md
@/Users/futur/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key patterns established in this codebase:

- StateManager uses prepared statements. Every new table needs: (a) `CREATE TABLE IF NOT EXISTS` in `runMigrations()`, (b) private `Statement | null` fields, (c) null-assignment in both `reset()` and `close()`, (d) `db.prepare(...)` calls in `prepareStatements()`, (e) public CRUD methods.
- GIDs use `createGID(type, numericId)` — e.g. `createGID('ProductVariant', tempId)`.
- Fixtures endpoint pattern: iterate array, generate GID with `Date.now() + Math.floor(Math.random() * 100000)`, call `stateManager.createXxx({ ...item, gid })`.
- `ProductVariantConnection` in schema.graphql has only `nodes` field (no edges/pageInfo) — resolver only needs `{ nodes: variantRows }`.
- `InventoryItem.inventoryLevels` is intentionally `() => ({ nodes: [] })` — the twin does not simulate inventory levels and this is documented. Do NOT change it.
- Run `pnpm -w run build` after StateManager changes to recompile `@dtu/state` dist before tests.
- Product rows from SELECT * include the stored `gid` column — resolvers must use `parent.gid` directly. The integer `parent.id` is the SQLite autoincrement key and does NOT match the timestamp-based GID stored in the variants table.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add variants table and CRUD to StateManager</name>
  <files>packages/state/src/state-manager.ts</files>
  <action>
Add a `product_variants` table and the three methods needed by the resolver and fixture loader.

1. Add private statement fields (after the existing InventoryItem block):
```typescript
private createVariantStmt: Database.Statement | null = null;
private listVariantsByProductGidStmt: Database.Statement | null = null;
private deleteVariantsByProductGidStmt: Database.Statement | null = null;
```

2. Null-assign all three in BOTH `reset()` and `close()` (in the InventoryItem block at the end of each).

3. In `runMigrations()`, add after the existing `CREATE TABLE IF NOT EXISTS inventory_items` block:
```sql
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gid TEXT UNIQUE NOT NULL,
  product_gid TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Default Title',
  sku TEXT,
  price TEXT NOT NULL DEFAULT '0.00',
  inventory_quantity INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_gid ON product_variants(product_gid);
```

4. In `prepareStatements()`, add after the InventoryItem statements:
```typescript
this.createVariantStmt = db.prepare(
  'INSERT INTO product_variants (gid, product_gid, title, sku, price, inventory_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
this.listVariantsByProductGidStmt = db.prepare(
  'SELECT * FROM product_variants WHERE product_gid = ? ORDER BY id ASC'
);
this.deleteVariantsByProductGidStmt = db.prepare(
  'DELETE FROM product_variants WHERE product_gid = ?'
);
```

5. Add three public methods after `updateInventoryItem`:
```typescript
/** Create a product variant and return its ID */
createVariant(data: { gid: string; product_gid: string; title?: string; sku?: string; price?: string; inventory_quantity?: number }): number {
  if (!this.createVariantStmt) throw new Error('StateManager not initialized. Call init() first.');
  const now = Math.floor(Date.now() / 1000);
  const result = this.createVariantStmt.run(
    data.gid,
    data.product_gid,
    data.title ?? 'Default Title',
    data.sku ?? null,
    data.price ?? '0.00',
    data.inventory_quantity ?? 0,
    now,
    now
  );
  return result.lastInsertRowid as number;
}

/** List all variants for a product by its GID */
listVariantsByProductGid(productGid: string): any[] {
  if (!this.listVariantsByProductGidStmt) throw new Error('StateManager not initialized. Call init() first.');
  return this.listVariantsByProductGidStmt.all(productGid);
}

/** Delete all variants for a product (used when re-seeding) */
deleteVariantsByProductGid(productGid: string): void {
  if (!this.deleteVariantsByProductGidStmt) throw new Error('StateManager not initialized. Call init() first.');
  this.deleteVariantsByProductGidStmt.run(productGid);
}
```

After editing, run `pnpm --filter @dtu/state build` to recompile.
  </action>
  <verify>
    <automated>cd /Users/futur/projects/sandpiper-dtu && pnpm --filter @dtu/state build 2>&1 | tail -5</automated>
  </verify>
  <done>Build succeeds with no TypeScript errors. StateManager exports createVariant, listVariantsByProductGid, deleteVariantsByProductGid.</done>
</task>

<task type="auto">
  <name>Task 2: Wire variants through fixtures endpoint and resolver</name>
  <files>twins/shopify/src/plugins/admin.ts, twins/shopify/src/schema/resolvers.ts</files>
  <action>
Two targeted changes — fixtures persistence and resolver fix.

**admin.ts — fixtures/load:**

1. Update `FixturesLoadBody` interface to accept optional variants array inside each product:
```typescript
interface FixturesLoadBody {
  orders?: any[];
  products?: Array<{ variants?: Array<{ title?: string; sku?: string; price?: string; inventory_quantity?: number }>; [key: string]: any }>;
  customers?: any[];
  inventoryItems?: any[];
}
```

2. In the product loading loop, after `fastify.stateManager.createProduct(...)`, capture the created product's GID and seed its variants:
```typescript
for (const product of products) {
  const productTempId = Date.now() + Math.floor(Math.random() * 100000);
  const productGid = createGID('Product', productTempId);
  const { variants: variantInputs, ...productData } = product;
  fastify.stateManager.createProduct({ ...productData, gid: productGid });

  // Seed variants if provided
  if (variantInputs && variantInputs.length > 0) {
    for (const v of variantInputs) {
      const variantTempId = Date.now() + Math.floor(Math.random() * 100000);
      const variantGid = createGID('ProductVariant', variantTempId);
      fastify.stateManager.createVariant({ ...v, gid: variantGid, product_gid: productGid });
    }
  }
}
```

**resolvers.ts — Product.variants:**

Replace the hardcoded empty resolver (line ~961). IMPORTANT: use `parent.gid` directly — do NOT reconstruct a GID from `parent.id`. The `product_variants` table stores `product_gid` as the timestamp-based GID (e.g. `gid://shopify/Product/1741234567890`) that was generated at fixture-load time and saved in the products row's `gid` column. The integer `parent.id` is the SQLite autoincrement key and will never match the stored GID, causing the query to always return empty.

```typescript
// BEFORE:
variants: () => ({ nodes: [] }),

// AFTER:
variants: (parent: any, _args: unknown, context: Context) => {
  const rows = context.stateManager.listVariantsByProductGid(parent.gid);
  const nodes = rows.map((v: any) => ({
    id: createGID('ProductVariant', v.id),
    title: v.title,
    sku: v.sku ?? null,
    price: v.price,
    inventoryQuantity: v.inventory_quantity ?? 0,
    inventoryItem: null,
  }));
  return { nodes };
},
```

Note: `inventoryItem` is null because the twin does not link variants to inventory items — the `InventoryItemRef` type only requires `id: ID!` and this field is nullable in practice (the resolver returns null which GraphQL will surface only if queried).

After editing run `pnpm -w run build` to compile the shopify twin.
  </action>
  <verify>
    <automated>cd /Users/futur/projects/sandpiper-dtu && pnpm test 2>&1 | tail -20</automated>
  </verify>
  <done>
All existing tests pass. A manual curl sequence confirms end-to-end:
1. POST /admin/reset
2. POST /admin/fixtures/load with { products: [{ title: "Widget", variants: [{ title: "S", price: "9.99" }] }] }
3. POST /admin/api/2024-01/graphql.json with query `{ products(first:1) { nodes { title variants { nodes { title price } } } } }` returns variant node with title "S" and price "9.99".
  </done>
</task>

</tasks>

<verification>
After both tasks:
- `pnpm test` passes (177 tests green, no regressions)
- `pnpm -w run build` completes without TypeScript errors
- GraphQL query for `products { nodes { variants { nodes { title price } } } }` returns seeded variant data when fixtures include variants
- Empty variants array returned when product has no variants (existing behaviour preserved)
- `InventoryItem.inventoryLevels` still returns `{ nodes: [] }` (intentionally unchanged)
</verification>

<success_criteria>
- StateManager has `product_variants` table with `createVariant`, `listVariantsByProductGid`, `deleteVariantsByProductGid`
- Fixture loading for products accepts and persists a nested `variants` array
- `Product.variants` resolver calls `context.stateManager.listVariantsByProductGid(parent.gid)` directly — using the stored GID from the product row, not a re-derived GID from `parent.id`
- No test regressions (`pnpm test` green)
- `InventoryItem.inventoryLevels` is left as `() => ({ nodes: [] })` — intentional documented simplification
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-shopify-twin-empty-variants-resolver/2-SUMMARY.md`
</output>
