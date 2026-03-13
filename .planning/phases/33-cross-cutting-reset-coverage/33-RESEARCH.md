# Phase 33: Cross-Cutting Reset Coverage - Research

**Researched:** 2026-03-13
**Domain:** SQLite reset coverage testing for StateManager / SlackStateManager
**Confidence:** HIGH

## Summary

XCUT-01 requires that every new SQLite table added in v1.2 is covered by a reset test and keeps reset performance within the existing sub-100ms target. The requirement has been "orphaned" — no phase was assigned until now.

The existing codebase already has partial coverage. `twins/slack/test/smoke.test.ts` contains a `XCUT-01: New tables are reset correctly` describe block with three tests (slack_channel_members, slack_views, slack_pins) that all **currently pass GREEN**. The fourth Phase 25 addition — `slack_reactions` — was actually added before v1.2 (Phase 05, February 28, 2026) so it pre-dates the requirement scope. The Shopify twin has no dedicated reset-coverage tests for its v1.2 additions (`product_variants`, `app_subscriptions`), but the existing integration test only verifies `POST /admin/reset` returns `{reset: true}` — not that specific tables are cleared.

**Primary recommendation:** Add reset-coverage tests for Shopify v1.2 tables (`app_subscriptions`, `product_variants`) in `twins/shopify/test/integration.test.ts`, add a sub-100ms timing assertion for both twins, and mark XCUT-01 satisfied. No table or state-manager code changes are needed — the reset mechanism already works correctly for all tables.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| XCUT-01 | Every new SQLite table added in v1.2 is included in the corresponding StateManager/SlackStateManager reset() logic, verified by a reset coverage test, and keeps reset performance within the existing sub-100ms target | Reset mechanism verified correct for all tables; gaps are test coverage only — tests need to be added for Shopify v1.2 tables and sub-100ms performance |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | same as project | SQLite backend | Project-wide standard; synchronous API matches reset() pattern |
| vitest | ^3.0.0 | Test framework | Project-wide standard; all twin tests use it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `buildApp()` | internal | In-process app factory | All twin unit tests use app.inject() — no live server needed |

### Installation
No new dependencies. All tooling is already installed.

## Architecture Patterns

### Reset Mechanism (how it actually works)

**StateManager.reset()** (Shopify / shared):
- `db.close()` — destroys all in-memory data for `:memory:` databases
- Sets `db = null` and nullifies all prepared statement fields
- Calls `this.init()` — re-creates `new Database(this.dbPath)` and runs `runMigrations()`
- All tables are created fresh; prior data is completely gone

**SlackStateManager.reset()** (Slack):
- Calls `nullifyStatements()` — sets all Slack-specific prepared statement fields to null
- Calls `inner.reset()` — invokes `StateManager.reset()` which closes and re-opens the DB
- Calls `runSlackMigrations()` — creates Slack-specific tables fresh
- Calls `prepareStatements()` + `seedDefaults()` — repopulates default team, user, channel
- Resets `wssUrl` and `interactivityUrl` to null

**Critical insight:** Because both twins use `:memory:` SQLite, `db.close()` destroys all data for ALL tables simultaneously. There is no table-specific drop-and-recreate step. Every table in the database — regardless of whether it has an explicit statement nullification entry — is cleared when the connection closes.

**Why tests are still required:** The requirement explicitly calls for "verified by a reset coverage test." The mechanism is correct, but the proof is missing for Shopify v1.2 tables and for the performance target.

### v1.2 Table Inventory

**Shopify StateManager tables added in v1.2:**
| Table | Phase Added | Has Reset Test? |
|-------|-------------|-----------------|
| `product_variants` | quick-2 (2026-03-11) | No |
| `app_subscriptions` | Phase 24 (2026-03-12) | No |

**Slack SlackStateManager tables added in v1.2:**
| Table | Phase Added | Has Reset Test? |
|-------|-------------|-----------------|
| `slack_channel_members` | Phase 25-04 (2026-03-12) | Yes — GREEN |
| `slack_views` | Phase 25-04 (2026-03-12) | Yes — GREEN |
| `slack_pins` | Phase 25-04 (2026-03-12) | Yes — GREEN |

**Pre-v1.2 tables NOT in scope:**
- `slack_reactions` — added Phase 05, February 28, 2026 (before v1.2 milestone start)
- All other StateManager tables (`entities`, `tokens`, `oauth_codes`, `orders`, `products`, `customers`, `inventory_items`, `fulfillments`, `webhook_subscriptions`, `error_configs`) — added in v1.0/v1.1

### Existing XCUT-01 Test Pattern (in `twins/slack/test/smoke.test.ts`)

```typescript
// Source: twins/slack/test/smoke.test.ts lines 174-224
describe('XCUT-01: New tables are reset correctly', () => {
  it('slack_channel_members is empty after reset', async () => {
    const dbBefore = app.slackStateManager.database;
    dbBefore.prepare(
      'INSERT INTO slack_channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).run('C_GENERAL', 'U_TEST_MEMBER', Math.floor(Date.now() / 1000));

    await app.inject({ method: 'POST', url: '/admin/reset' });

    // Re-read database reference after reset — reset() closes and reopens the DB
    const dbAfter = app.slackStateManager.database;
    const count = (
      dbAfter.prepare('SELECT COUNT(*) as c FROM slack_channel_members').get() as any
    ).c;
    expect(count).toBe(0);
  });
  // ... two more tests for slack_views and slack_pins
});
```

**Pattern for Shopify (to be applied in `twins/shopify/test/integration.test.ts`):**

```typescript
describe('XCUT-01: v1.2 tables cleared on reset', () => {
  it('app_subscriptions is empty after reset', async () => {
    const dbBefore = app.stateManager.database;
    dbBefore.prepare(
      `INSERT INTO app_subscriptions (gid, name, status, return_url, test, trial_days, shop_domain, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('gid://shopify/AppSubscription/test-1', 'Test Plan', 'PENDING', null, 1, 0, 'twin.myshopify.com',
      Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));

    await app.inject({ method: 'POST', url: '/admin/reset' });

    const dbAfter = app.stateManager.database;
    const count = (dbAfter.prepare('SELECT COUNT(*) as c FROM app_subscriptions').get() as any).c;
    expect(count).toBe(0);
  });

  it('product_variants is empty after reset', async () => {
    const dbBefore = app.stateManager.database;
    const now = Math.floor(Date.now() / 1000);
    dbBefore.prepare(
      `INSERT INTO product_variants (gid, product_gid, title, sku, price, inventory_quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('gid://shopify/ProductVariant/test-1', 'gid://shopify/Product/test-1',
      'Test Variant', null, '9.99', 0, now, now);

    await app.inject({ method: 'POST', url: '/admin/reset' });

    const dbAfter = app.stateManager.database;
    const count = (dbAfter.prepare('SELECT COUNT(*) as c FROM product_variants').get() as any).c;
    expect(count).toBe(0);
  });
});
```

### Performance Test Pattern (sub-100ms verification)

```typescript
it('StateManager.reset() completes in under 100ms', async () => {
  const start = Date.now();
  await app.inject({ method: 'POST', url: '/admin/reset' });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(100);
});
```

**Note:** The performance test should be placed in both `twins/shopify/test/integration.test.ts` and `twins/slack/test/smoke.test.ts`. The existing POST /admin/reset tests confirm the endpoint returns 200 but do not measure timing.

### DB Reference Staleness Pitfall

After `reset()`, the `database` getter returns a NEW `Database.Database` instance (the old connection was closed). Any reference captured before reset is stale. Always re-read `app.stateManager.database` or `app.slackStateManager.database` AFTER calling reset.

```typescript
// WRONG — stale reference
const db = app.stateManager.database;
await app.inject({ method: 'POST', url: '/admin/reset' });
db.prepare('SELECT COUNT(*) ...').get(); // Throws: DB is closed

// CORRECT — re-read after reset
await app.inject({ method: 'POST', url: '/admin/reset' });
const db = app.stateManager.database; // fresh connection
db.prepare('SELECT COUNT(*) ...').get();
```

This pitfall is documented in STATE.md: "After reset() on in-memory SQLite, db reference captured before reset is stale — must re-read app.slackStateManager.database after reset."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom DROP TABLE reset | DELETE FROM each table manually | Existing reset() method via POST /admin/reset | The drop-and-recreate pattern is already correct and tested |
| Performance measurement | High-resolution timers, external tools | `Date.now()` before/after POST /admin/reset | Sub-100ms is well within `Date.now()` resolution; no need for `process.hrtime()` |
| New state-manager methods | Custom test CRUD helpers | Raw SQL via `app.stateManager.database.prepare()` | Matches existing test pattern; avoids coupling tests to method API |

## Common Pitfalls

### Pitfall 1: Stale Database Reference After Reset
**What goes wrong:** Test captures `const db = app.stateManager.database` before reset, then uses `db` after reset — throws "Database is not open" or returns stale data.
**Why it happens:** `StateManager.reset()` closes the current connection and opens a new one. The old reference is now to a closed DB.
**How to avoid:** Always capture the database reference AFTER calling reset.
**Warning signs:** `TypeError: this.db is null` or `Error: Database is not open` in test output.

### Pitfall 2: Seeding After a beforeEach Reset
**What goes wrong:** The existing Shopify `integration.test.ts` has a `beforeEach` that calls `buildApp()` fresh — no reset needed. Adding reset tests in this context requires seeding a row, calling reset, then asserting. Do NOT call `buildApp()` again after reset — the app instance is still valid.
**How to avoid:** Use `app.inject({ method: 'POST', url: '/admin/reset' })` which calls `stateManager.reset()` internally. The `app` instance itself is not rebuilt.

### Pitfall 3: Timing Inflation from HTTP Overhead
**What goes wrong:** Measuring `Date.now()` around `app.inject()` includes Fastify request dispatch overhead, not just reset time. The real reset (db.close + db.open + runMigrations) takes <5ms. The HTTP overhead may add 10-30ms in test environments.
**How to avoid:** The 100ms target is very generous. Even with HTTP overhead, the reset should complete well under 100ms. Keep the threshold at 100ms (matching the requirement) — don't tighten to 50ms or it becomes flaky.

### Pitfall 4: Missing `product_variants` INSERT Columns
**What goes wrong:** `product_variants` has `NOT NULL` constraints on `gid`, `product_gid`, `title`, `price`, `created_at`, `updated_at`. Missing any of these in a raw INSERT fails with SQLITE_CONSTRAINT.
**How to avoid:** Use the full column list as shown in the Code Examples section.

## Code Examples

### Verified Shopify StateManager Schema (from `packages/state/src/state-manager.ts`)
```typescript
// app_subscriptions columns (NOT NULL): gid, name, status, shop_domain, created_at, updated_at
// product_variants columns (NOT NULL): gid, product_gid, title, price, created_at, updated_at
// Both have INTEGER PRIMARY KEY AUTOINCREMENT id column
```

### Accessing stateManager in Shopify tests
```typescript
// Source: twins/shopify/test/integration.test.ts
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

// Access stateManager:
const db = app.stateManager.database;
```

### Accessing slackStateManager in Slack tests
```typescript
// Source: twins/slack/test/smoke.test.ts
// Same pattern but:
const db = app.slackStateManager.database;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual table truncation | db.close() + db reopen (drop-and-recreate) | Phase 01-02 (original design) | Guarantees clean state in <100ms regardless of table count |
| Per-table reset logic | Whole-database close/reopen | Original design | No new tables need explicit reset logic — mechanism is automatic |

## Open Questions

1. **Should slack_reactions get a reset test?**
   - What we know: slack_reactions was added in Phase 05 (pre-v1.2), not a v1.2 addition
   - What's unclear: Some might argue it should be covered anyway for completeness
   - Recommendation: No — the requirement scope is "new SQLite tables added in v1.2." Pre-v1.2 tables are out of scope. If there's a concern, a single comment in the test file explaining the scope decision is sufficient.

2. **Where should Shopify reset-coverage tests live?**
   - What we know: `twins/shopify/test/integration.test.ts` has the existing `Admin API > resets state` test; it uses the same `buildApp()` pattern as the Slack smoke tests
   - What's unclear: Whether to add to `integration.test.ts` or create a new `twins/shopify/test/integration/reset-coverage.test.ts`
   - Recommendation: Add to `integration.test.ts` as a new `describe('XCUT-01: v1.2 tables cleared on reset')` block — matches the Slack pattern, avoids a new file for three simple tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `vitest.config.ts` (root workspace) |
| Quick run command | `pnpm vitest run --project "@dtu/twin-slack"` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XCUT-01 | slack_channel_members cleared after reset | unit | `pnpm vitest run --project "@dtu/twin-slack" --reporter=verbose` | ✅ (smoke.test.ts) |
| XCUT-01 | slack_views cleared after reset | unit | `pnpm vitest run --project "@dtu/twin-slack" --reporter=verbose` | ✅ (smoke.test.ts) |
| XCUT-01 | slack_pins cleared after reset | unit | `pnpm vitest run --project "@dtu/twin-slack" --reporter=verbose` | ✅ (smoke.test.ts) |
| XCUT-01 | app_subscriptions cleared after reset | unit | `pnpm vitest run --project "@dtu/twin-shopify" --reporter=verbose` | ❌ Wave 0 |
| XCUT-01 | product_variants cleared after reset | unit | `pnpm vitest run --project "@dtu/twin-shopify" --reporter=verbose` | ❌ Wave 0 |
| XCUT-01 | Shopify reset completes in < 100ms | unit | `pnpm vitest run --project "@dtu/twin-shopify" --reporter=verbose` | ❌ Wave 0 |
| XCUT-01 | Slack reset completes in < 100ms | unit | `pnpm vitest run --project "@dtu/twin-slack" --reporter=verbose` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project "@dtu/twin-shopify" && pnpm vitest run --project "@dtu/twin-slack"`
- **Per wave merge:** `pnpm test` (all projects)
- **Phase gate:** All new XCUT-01 tests GREEN before marking complete

### Wave 0 Gaps
- [ ] XCUT-01 tests in `twins/shopify/test/integration.test.ts` — covers `app_subscriptions` cleared, `product_variants` cleared, Shopify reset < 100ms
- [ ] Slack performance test in `twins/slack/test/smoke.test.ts` — covers Slack reset < 100ms

*(3 existing Slack XCUT-01 tests in `smoke.test.ts` are already GREEN and do not need recreating)*

## Sources

### Primary (HIGH confidence)
- Direct source inspection: `packages/state/src/state-manager.ts` — reset() mechanism, runMigrations() table definitions
- Direct source inspection: `twins/slack/src/state/slack-state-manager.ts` — SlackStateManager reset(), runSlackMigrations(), nullifyStatements()
- Direct source inspection: `twins/slack/test/smoke.test.ts` lines 162-224 — existing XCUT-01 tests (GREEN)
- Direct test execution: `pnpm vitest run --project "@dtu/twin-slack"` — confirmed XCUT-01 tests GREEN
- Direct git log: `git log -- packages/state/src/state-manager.ts` — table addition dates
- Direct git log: `git show ac49e0c` — confirmed slack_reactions pre-dates v1.2

### Secondary (MEDIUM confidence)
- `.planning/v1.2-MILESTONE-AUDIT.md` — audit finding that XCUT-01 is "orphaned" with "partial coverage"
- `.planning/STATE.md` key decisions — "After reset() on in-memory SQLite, db reference captured before reset is stale"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tooling is existing project infrastructure
- Architecture: HIGH — reset mechanism verified by reading source code and confirmed via test execution
- Pitfalls: HIGH — DB reference staleness explicitly documented in STATE.md and observable in existing test pattern

**Research date:** 2026-03-13
**Valid until:** Stable — the reset mechanism is foundational infrastructure; no expiry risk
