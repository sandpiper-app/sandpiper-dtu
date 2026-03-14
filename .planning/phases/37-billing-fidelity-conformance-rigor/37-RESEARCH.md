# Phase 37: Billing Fidelity & Conformance Rigor - Research

**Researched:** 2026-03-14
**Domain:** Shopify billing GraphQL resolvers + conformance runner twin-mode behavior
**Confidence:** HIGH

## Summary

Phase 37 closes two Medium findings from the second adversarial review:

**Finding #11 — Billing/install fidelity shallow:** The `appSubscriptionCreate` and `appSubscriptionCancel` mutations and the `currentAppInstallation` query all return empty `lineItems: []` regardless of what was passed at subscription-creation time. The `app_subscriptions` table has no column for storing line items. The `appPurchaseOneTimeCreate` mutation returns a hardcoded non-persistent stub (always `gid://shopify/AppPurchaseOneTime/1`). The `currentAppInstallation.oneTimePurchases` connection always returns `edges: []`.

**Finding #12 — Conformance harness doesn't prove 1:1 behavior:** In `twin` mode (`ConformanceRunner.run`, line 91-94), the runner sets `baselineResponse = twinResponse` — the twin is compared against itself. This always passes trivially and proves nothing. Additionally, the Slack conformance twin adapter only requests `scope=chat:write` at init, so any suite test that exercises a method requiring a different scope (conversations, users, etc.) may receive `missing_scope` errors in live mode. The `chat.conformance.ts` test `chat-update` (id: `chat-update`, line 89-103) calls `chat.postMessage` instead of `chat.update` as its operation — its name claims to test `chat.update` but the path is `/api/chat.postMessage`.

This phase is entirely surgical: modify the data model and resolvers for billing fidelity, and change the conformance runner's twin-mode to execute the operation for structural validation rather than self-comparing.

**Primary recommendation:** Store line items as JSON in the `app_subscriptions` table; surface them in all billing resolvers. Change twin-mode in the runner to compare the twin response against the normalizer-stripped response of a second operation call (or simply skip comparison and replace with structural self-validation). Fix the chat suite labeling.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | SQLite DDL migration (ALTER TABLE / ADD COLUMN) | Already the persistence layer for StateManager |
| graphql-yoga + @graphql-tools/schema | existing | GraphQL resolver changes | Already the twin's GraphQL engine |
| TypeScript | existing | Resolver type changes | Project-standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| deep-diff | existing | Used in conformance comparator | Only for existing twin/offline comparison path |
| @dtu/conformance | workspace | ConformanceRunner, types | Conformance runner changes live here |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

The changes span three packages:

```
packages/
  state/src/state-manager.ts        # ADD line_items column; new storeAppSubscriptionLineItems; new createOneTimePurchase + listOneTimePurchases methods
  conformance/src/runner.ts          # FIX twin-mode self-comparison
twins/
  shopify/src/schema/resolvers.ts   # FIX appSubscriptionCreate, appSubscriptionCancel, currentAppInstallation, appPurchaseOneTimeCreate
  shopify/conformance/suites/
    chat.conformance.ts             # FIX chat-update test id/name/operation
tests/
  sdk-verification/sdk/
    shopify-api-billing.test.ts     # EXTEND: add lineItems + oneTimePurchases assertions
```

### Pattern 1: SQLite Schema Migration (Idempotent ALTER TABLE)

The project uses idempotent `ALTER TABLE ... ADD COLUMN` migrations wrapped in try/catch, consistent with the `token_type` migration at state-manager.ts:402-408.

**What:** Add `line_items TEXT` and `one_time_purchases TEXT` (JSON columns) to the `app_subscriptions` table within the existing `try { ALTER TABLE } catch { }` guard block.

**When to use:** Adding columns to an existing table that may already exist in a running DB instance.

```typescript
// Source: packages/state/src/state-manager.ts:402-408 (existing pattern)
try {
  this.database.exec(
    "ALTER TABLE app_subscriptions ADD COLUMN line_items TEXT"
  );
} catch {
  // Idempotent — column already exists in upgraded DBs
}
```

### Pattern 2: Two-Step INSERT for Auto-Increment GID (existing pattern)

One-time purchases need a GID that includes the numeric row ID. Use the same two-step pattern already used for products and app_subscriptions themselves.

```typescript
// Source: packages/state/src/state-manager.ts:968-981 (existing pattern)
const tempGid = `gid://shopify/AppPurchaseOneTime/temp-${randomUUID()}`;
const result = this.createOneTimePurchaseStmt.run(tempGid, ...fields);
const rowId = result.lastInsertRowid as number;
const finalGid = `gid://shopify/AppPurchaseOneTime/${rowId}`;
this.database.prepare('UPDATE one_time_purchases SET gid = ? WHERE id = ?').run(finalGid, rowId);
return rowId;
```

### Pattern 3: JSON Column for Line Items

Store `lineItems` (the `AppSubscriptionLineItemInput[]` passed to `appSubscriptionCreate`) as a JSON string column. Parse it back in resolvers.

```typescript
// In createAppSubscription INSERT:
const lineItemsJson = data.line_items ? JSON.stringify(data.line_items) : null;

// In resolver when building AppSubscription response:
const lineItems = subscription.line_items
  ? JSON.parse(subscription.line_items)
  : [];
```

This follows the existing `orders.line_items TEXT` column pattern in `state-manager.ts:303`.

### Pattern 4: Conformance Runner Twin-Mode Fix

**What:** In twin mode, instead of `baselineResponse = twinResponse` (comparing response to itself), run the operation a second time against the twin and compare the two responses. This proves structural consistency across two independent calls (idempotency/determinism check) rather than trivial self-equality.

**Alternatively:** In twin mode, skip the comparison entirely and just validate that the operation succeeds (status 200, no errors). This is simpler but provides less structural proof.

**Decision — use structural self-check with second call:**

The phase goal says "eliminate twin self-comparison in twin mode." The intended behavior is that twin mode provides meaningful proof. Running the operation a second time and comparing structurally validates the response shape is consistent. This is more valuable than simply skipping comparison.

```typescript
// Source: packages/conformance/src/runner.ts:91-94 (current bad code)
} else if (this.mode === 'twin') {
  // BAD: baselineResponse = twinResponse; // self-comparison always passes

  // FIXED: run operation again; compare structurally for shape consistency
  baselineResponse = await this.twin.execute(test.operation);
}
```

Then in the comparison branch (currently lines 97-121), the `'twin'` mode should use `compareResponsesStructurally` (not `compareResponses`) so value differences between two independent calls don't cause false failures (timestamps, IDs will differ on second call).

### Pattern 5: Slack Conformance Adapter Scope Fix

The `SlackTwinAdapter.init()` requests `scope=chat:write` only. The conformance suites cover conversations (`channels:read`, `channels:history`), users (`users:read`), and OAuth. Fix: request `allScopesString()` from `method-scopes.ts` — consistent with how `seedSlackBotToken()` works.

```typescript
// twins/slack/conformance/adapters/twin-adapter.ts:26 — current
url: '/oauth/v2/authorize?client_id=test&scope=chat:write&...'

// FIXED — use allScopesString() or a broad multi-scope string
// allScopesString() is in twins/slack/src/services/method-scopes.ts
// Import it or inline the broad scope constant (test files use hardcoded BROAD_SCOPE per Phase 26 decision)
```

Note: Phase 26 decision says "allScopesString() not imported in test file — hardcoded BROAD_SCOPE constant avoids coupling test to twin internals." Apply the same pattern here: hardcode a BROAD_SCOPE constant in the adapter rather than importing from twin internals.

### Anti-Patterns to Avoid

- **Don't change the `app_subscriptions` schema column order:** SQLite's ALTER TABLE ADD COLUMN always appends; don't try to insert in a specific position.
- **Don't add a new SQLite table for line_items:** A JSON column is sufficient and avoids the XCUT-01 reset coverage obligation for a new table (though reset coverage is already proven).
- **Don't use `compareResponses` for twin-mode structural check:** `compareResponses` uses deep-diff which will flag non-deterministic fields (IDs, timestamps). Use `compareResponsesStructurally` with the normalizer.
- **Don't add a `one_time_purchases` table without adding it to StateManager `reset()`:** The project has a proven reset coverage test pattern from Phase 33. If a new table is added, it must be in reset().
- **Don't add `one_time_purchases` as a separate SQLite table if it can be a JSON column in `app_subscriptions`:** Simpler is better here; one-time purchases are per-shop, not per-subscription. A separate table is warranted but adds reset() coverage obligation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serializing lineItems | Custom binary or CSV format | `JSON.stringify` / `JSON.parse` | Existing `orders.line_items TEXT` column uses JSON; consistent, no extra dep |
| Generating GID with row ID | UUID-only approach | Two-step temp-GID → UPDATE pattern | Already proven in products, app_subscriptions |
| Broad scope string | Hand-counting scopes | Inline BROAD_SCOPE constant (or check allScopesString()) | Phase 26 established pattern for test files |
| Structural comparison in twin mode | Custom field-by-field check | `compareResponsesStructurally` (already in comparator.ts) | Bidirectional key comparison already implemented |

**Key insight:** Every primitive needed in Phase 37 already exists in the codebase. This is a wiring phase: connect existing machinery (JSON columns, two-step GID, structural comparator) to gaps that were left as stubs.

## Common Pitfalls

### Pitfall 1: lineItems resolver returns wrong GraphQL shape

**What goes wrong:** `AppSubscriptionLineItem` has `id: ID!` and `plan: AppSubscriptionLinePlan! { pricingDetails: AppPricingDetails! }`. `AppPricingDetails` is an interface implemented by `AppRecurringPricing` and `AppUsagePricing`. If the resolver returns `{ interval, amount, currencyCode }` flat instead of the nested `plan.pricingDetails { ... }` shape, GraphQL Yoga returns resolver errors.

**Why it happens:** The input shape (`AppSubscriptionLineItemInput.plan.appRecurringPricingDetails`) doesn't map 1:1 to the output shape. Input has `appRecurringPricingDetails`, output has `pricingDetails` (interface). The input is stored in JSON; the resolver must translate input JSON → output shape.

**How to avoid:** When building the lineItems array in the resolver, transform stored input into output shape:
```typescript
lineItems: storedItems.map((item: any, idx: number) => ({
  id: `gid://shopify/AppSubscriptionLineItem/${idx}`,
  plan: {
    pricingDetails: item.plan?.appRecurringPricingDetails
      ? {
          interval: item.plan.appRecurringPricingDetails.interval,
          price: item.plan.appRecurringPricingDetails.price ?? { amount: '0.00', currencyCode: 'USD' },
        }
      : { interval: 'EVERY_30_DAYS', price: { amount: '0.00', currencyCode: 'USD' } },
  },
}))
```

**Warning signs:** GraphQL errors mentioning "Cannot return null for non-nullable field" or "Abstract type AppPricingDetails must resolve to an Object type."

### Pitfall 2: AppPricingDetails abstract type resolver missing

**What goes wrong:** `AppPricingDetails` is an interface. `makeExecutableSchema` requires a `__resolveType` resolver for abstract types. The schema already has `AppSubscriptionDiscountValue: { __resolveType }` at resolvers.ts:942. If `AppPricingDetails` lacks `__resolveType`, Yoga will throw at schema construction time.

**Why it happens:** The existing `lineItems: []` stub never exercises the interface resolver. Adding real lineItems triggers the abstract type resolution.

**How to avoid:** Add `AppPricingDetails: { __resolveType(obj) { return 'AppRecurringPricing'; } }` to resolvers. Check whether the schema already has this — look at resolvers.ts around line 933-973 (the abstract type resolvers section).

**Warning signs:** Error "Schema must contain uniquely named types but contains multiple types named 'AppPricingDetails'" or "Abstract type AppPricingDetails was resolved to a type..." at test startup.

### Pitfall 3: `AppSubscriptionLineItem.plan` resolver needed on Product

**What goes wrong:** The schema has `Product.lineItems` (for order line items, a different concept) at resolvers.ts:973. Confusing `AppSubscriptionLineItem` with `Product.lineItems` leads to mutating the wrong resolver.

**How to avoid:** `AppSubscriptionLineItem` resolvers live under the `AppSubscription` object in the response — they're inline in the resolver return values (not field-level resolvers). The `lineItems` field on `AppSubscription` is a plain array in the return object. No separate field resolver is needed unless the SDL has sub-field resolvers.

### Pitfall 4: Conformance twin-mode second call changes state

**What goes wrong:** Some suite tests have `setup` operations that mutate state (e.g., `products-list` creates a product first). If the operation itself also mutates (e.g., `products-create`), running it twice means the second call may return a different product ID. The structural comparison should not flag different IDs.

**Why it happens:** The normalizer's `normalizeFields` maps are applied before comparison — but only if `compareResponsesStructurally` is called with the normalizer. The runner must pass the suite normalizer to the structural comparison in twin mode.

**How to avoid:** In the runner's twin-mode comparison branch, call `compareResponsesStructurally(testId, testName, category, twinResponse, baselineResponse, test.requirements ?? [], suite.normalizer)`. The normalizer strips/replaces non-deterministic fields (IDs, timestamps) before structural comparison.

### Pitfall 5: `one_time_purchases` table reset() coverage

**What goes wrong:** If a new `one_time_purchases` SQLite table is added, Phase 33's reset coverage test checks `pnpm test:sdk`'s reset behavior. A new table not in `reset()` will cause the existing XCUT-01 reset test to fail (it probes all tables).

**Actually:** The Phase 33 reset test uses `reset coverage` pattern (dbBefore/dbAfter with in-memory SQLite). Whether it automatically catches a new table depends on the test implementation. Check Phase 33 plan to confirm.

**How to avoid:** If adding a `one_time_purchases` table, add it to `StateManager.reset()` (the list of tables cleared by the reset). Alternatively, avoid the separate table and store purchases as a JSON column in a `one_time_purchases TEXT` column on `app_subscriptions` or as a top-level `one_time_purchases` table with explicit reset coverage.

### Pitfall 6: Chat conformance suite `chat-update` test

**What goes wrong:** The `chat-update` test (id: `'chat-update'`, line 89-103 of `chat.conformance.ts`) has its operation pointing to `/api/chat.postMessage` with `path: '/api/chat.postMessage'`. The name says "chat.update" but the path calls postMessage. In live mode, this means the suite never exercises `chat.update` against the real Slack API.

**How to avoid:** The fix requires: (1) the setup operation posts a message and captures the `ts` from the response, but since conformance operations don't return captured values to subsequent operations, a different approach is needed. The simplest fix is to change the operation path to `/api/chat.update` and provide a static `ts` that the twin will accept, or to restructure the test to use a known-ts. Alternatively, mark it as `liveSkip: true` since `ts` capture from setup is not supported by the runner.

**The cleaner fix:** Change the test to actually call `chat.update` by:
- Using a hardcoded `ts` that the Slack twin will accept for the update (the twin stores messages by ts and bot user)
- Or: rename the test to `chat-postMessage-second` and remove the misleading name/description

Given that the conformance runner's `setup` operations don't expose their response data to the main `operation`, the most pragmatic fix is to either (a) restructure to post-then-update using a predictable channel+ts pattern, or (b) rename to accurately reflect what it tests. The phase goal says "fix the chat conformance suite labeling" — renaming is the minimal correct fix.

## Code Examples

Verified patterns from existing codebase:

### Storing lineItems as JSON in CREATE

```typescript
// Source: packages/state/src/state-manager.ts (createOrder pattern, line 578-608)
// Apply same pattern to createAppSubscription
createAppSubscription(data: {
  name: string;
  return_url?: string;
  test?: boolean;
  trial_days?: number;
  shop_domain: string;
  line_items?: unknown[];  // ADD THIS
}): number {
  const lineItemsJson = data.line_items ? JSON.stringify(data.line_items) : null;
  // INSERT now includes line_items column
  const result = this.createAppSubscriptionStmt.run(
    tempGid, data.name, data.return_url ?? null,
    data.test !== false ? 1 : 0,
    data.trial_days ?? 0,
    data.shop_domain,
    lineItemsJson,   // NEW
    now, now
  );
}
```

### Resolving lineItems in appSubscriptionCreate response

```typescript
// Source: twins/shopify/src/schema/resolvers.ts:784-810 (existing appSubscriptionCreate)
// Fix lineItems: [] to use stored data
const storedItems = subscription.line_items
  ? JSON.parse(subscription.line_items)
  : [];
const lineItems = storedItems.map((item: any, idx: number) => ({
  id: `gid://shopify/AppSubscriptionLineItem/${idx + 1}`,
  plan: {
    pricingDetails: item.plan?.appRecurringPricingDetails
      ? {
          interval: item.plan.appRecurringPricingDetails.interval,
          price: item.plan.appRecurringPricingDetails.price
            ?? { amount: '0.00', currencyCode: 'USD' },
        }
      : { interval: 'EVERY_30_DAYS', price: { amount: '0.00', currencyCode: 'USD' } },
  },
}));
```

### Conformance runner twin-mode fix

```typescript
// Source: packages/conformance/src/runner.ts:91-94 (current bad code)
// BEFORE:
} else if (this.mode === 'twin') {
  baselineResponse = twinResponse; // self-comparison — always passes
}

// AFTER: run operation again for structural consistency check
} else if (this.mode === 'twin') {
  baselineResponse = await this.twin.execute(test.operation);
}

// And in the comparison section, twin mode uses structural comparison:
// lines 97-121: add an else branch for 'twin' mode using compareResponsesStructurally
if (this.mode === 'live') {
  // existing live comparison logic
} else {
  // twin or offline mode: structural comparison
  result = compareResponsesStructurally(
    test.id, test.name, test.category,
    twinResponse, baselineResponse,
    test.requirements ?? [],
    suite.normalizer
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `lineItems: []` hardcoded in all billing resolvers | Store/retrieve from `line_items TEXT` JSON column | Phase 37 | billing.check with returnObject:true returns real lineItems |
| `baselineResponse = twinResponse` in twin mode | Second execution compared structurally | Phase 37 | Twin mode now validates shape consistency |
| `scope=chat:write` only in Slack conformance adapter | Broad scope (allScopesString equivalent) | Phase 37 | Conformance suites pass in live mode without missing_scope |
| `chat-update` test calls chat.postMessage | Test accurately labeled/fixed | Phase 37 | Chat conformance suite reflects actual coverage |

**Not deprecated:** The `compareResponses` (exact/value mode) path is still used for `comparisonMode: 'exact'` tests and for `offline` mode. Phase 37 only changes behavior for `mode === 'twin'`.

## Open Questions

1. **Does `AppPricingDetails` already have `__resolveType` in resolvers.ts?**
   - What we know: `AppSubscriptionDiscountValue` has `__resolveType` at line 942. The abstract type resolvers section is at lines 933-973.
   - What's unclear: Whether `AppPricingDetails` is already covered (existing `lineItems: []` never triggered it).
   - Recommendation: Check lines 933-973 of resolvers.ts before implementing. If missing, add `AppPricingDetails: { __resolveType(obj) { return 'AppRecurringPricing'; } }`.

2. **Should `one_time_purchases` be a separate table or a JSON column?**
   - What we know: The existing `appPurchaseOneTimeCreate` returns a hardcoded stub with `id: 'gid://shopify/AppPurchaseOneTime/1'`. The `currentAppInstallation.oneTimePurchases` returns `edges: []`.
   - What's unclear: Whether the billing SDK tests verify oneTimePurchases round-trip. The SDK `billing.check` uses `returnObject: true` to inspect `oneTimePurchases` — but the current test doesn't assert oneTimePurchases content.
   - Recommendation: A separate `one_time_purchases` table is cleaner (proper GID generation, queryable by shop domain), but adds XCUT-01 reset obligation. A JSON column on `app_subscriptions` won't work since oneTimePurchases are per-shop not per-subscription. Use a separate table, add to `reset()`.

3. **Should the conformance runner's twin-mode second-call approach handle setup operations?**
   - What we know: Setup operations run before the main operation to seed state. If the second call runs without re-running setup, state should still be there (same twin instance, no reset between calls).
   - What's unclear: Whether any suite test's setup has side effects that would break a second operation call (e.g., creates an order that the operation then queries — second call would find two orders).
   - Recommendation: Don't re-run setup. The second call tests idempotency of the read path. For mutation operations (productCreate), the second call creates a second product — structural comparison is appropriate (both responses have the same shape, just different IDs, which the normalizer handles).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` (root) + `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk -- --reporter=verbose tests/sdk-verification/sdk/shopify-api-billing.test.ts` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map

Phase 37 has no REQUIREMENTS.md requirement IDs (`null` per the phase description), but the findings map to existing verified behaviors:

| Finding | Behavior | Test Type | Automated Command | File Exists? |
|---------|----------|-----------|-------------------|-------------|
| #11 lineItems | appSubscriptionCreate returns real lineItems | unit/integration | `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-api-billing.test.ts` | ✅ (extend existing) |
| #11 currentAppInstallation | currentAppInstallation.activeSubscriptions has lineItems | unit/integration | same | ✅ (extend existing) |
| #11 oneTimePurchases | appPurchaseOneTimeCreate is persistent; currentAppInstallation.oneTimePurchases returns it | integration | same | ✅ (extend existing) |
| #12 twin-mode conformance | pnpm conformance:twin passes with structural check | conformance | `pnpm --filter @dtu/twin-shopify conformance:twin` | ✅ (script exists) |
| #12 chat labeling | chat-update test uses correct path | conformance | same | ✅ (extend existing) |
| #12 Slack scope | Slack conformance adapter requests broad scope | conformance | `pnpm --filter @dtu/twin-slack conformance:twin` | ✅ (script exists) |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-api-billing.test.ts`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

The phase needs Wave 0 RED tests to prove the billing gaps before implementation:

- [ ] Extend `tests/sdk-verification/sdk/shopify-api-billing.test.ts` — add assertions that `billing.request` with `returnObject: true` returns `lineItems` array with the plan's pricing details; add assertion that `currentAppInstallation` on a shop with ACTIVE subscription returns `activeSubscriptions[0].lineItems` non-empty.

*(Conformance runner changes are self-tested by running `conformance:twin` — the chat-update labeling fix and scope fix are visible via the conformance output.)*

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `packages/state/src/state-manager.ts` (app_subscriptions table, createAppSubscription, migration pattern)
- Direct codebase inspection — `twins/shopify/src/schema/resolvers.ts:784-877` (billing resolvers returning empty lineItems)
- Direct codebase inspection — `packages/conformance/src/runner.ts:91-94` (twin-mode self-comparison)
- Direct codebase inspection — `twins/slack/conformance/adapters/twin-adapter.ts:26` (scope=chat:write only)
- Direct codebase inspection — `twins/slack/conformance/suites/chat.conformance.ts:89-103` (chat-update test using chat.postMessage path)
- Direct codebase inspection — `.planning/ROADMAP.md:473-477` (Phase 37 goal specification)

### Secondary (MEDIUM confidence)
- `twins/shopify/src/schema/schema.graphql:272-331` — AppSubscriptionLineItem/AppInstallation schema shape (verified graphql type structure)
- `packages/conformance/src/comparator.ts` — compareResponsesStructurally signature and normalizer integration

### Tertiary (LOW confidence)
- None — all findings verified from codebase directly.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing machinery
- Architecture: HIGH — patterns copied from verified existing code (JSON columns, two-step GID, structural comparator)
- Pitfalls: HIGH — abstract type resolver and twin-mode mutation pitfalls verified by inspecting schema and runner code

**Research date:** 2026-03-14
**Valid until:** Not time-sensitive (internal codebase, no upstream drift risk for this phase)
