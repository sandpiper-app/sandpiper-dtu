# Phase 9: Code Quality Cleanup - Research

**Researched:** 2026-02-28
**Domain:** Tech debt cleanup - logging, StateManager gaps, test reliability
**Confidence:** HIGH

## Summary

Phase 9 addresses four non-critical tech debt items identified in the v1.0 milestone audit. All items are localized code changes with minimal risk and no new dependencies. The original `webhook-sender.ts` source file was superseded by `@dtu/webhooks` in Phase 3 -- the `console.error` usage lives only in a stale compiled dist artifact (`twins/shopify/dist/services/webhook-sender.js`) that is no longer imported by any source file. The StateManager gaps are straightforward method additions following existing patterns. The DLQ timing test flakiness requires replacing a fixed `setTimeout` wait with a polling/event-driven approach.

**Primary recommendation:** This is a cleanup phase -- follow existing patterns in the codebase. No new libraries, no architecture changes. Each item is a surgical edit to an existing file.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | SQLite state management | Already used for all StateManager operations |
| vitest | (existing) | Test framework | Already used for all project tests |
| fastify | (existing) | HTTP framework with built-in Pino logger | Already used for all twins |

### Supporting
No new dependencies required. All changes use existing libraries.

### Alternatives Considered
None -- this phase uses only existing stack. No decisions to make.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Pattern 1: StateManager Method Addition (updateCustomer / updateUser)

**What:** Add a typed `updateCustomer` method to `@dtu/state` StateManager following the exact pattern of existing `updateOrder` and `updateProduct` methods. Add `updateUser` to `SlackStateManager` following the existing `updateChannel` pattern.

**When to use:** Whenever UI or API code needs to modify entity state.

**Example -- Shopify updateCustomer (follows updateProduct pattern):**
```typescript
// In packages/state/src/state-manager.ts
// 1. Add prepared statement declaration
private updateCustomerStmt: Database.Statement | null = null;

// 2. Prepare in prepareStatements()
this.updateCustomerStmt = db.prepare(
  'UPDATE customers SET email = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?'
);

// 3. Add method (follows updateProduct signature)
updateCustomer(id: number, data: { email?: string; first_name?: string; last_name?: string }): void {
  if (!this.updateCustomerStmt) {
    throw new Error('StateManager not initialized. Call init() first.');
  }
  const now = Math.floor(Date.now() / 1000);
  this.updateCustomerStmt.run(
    data.email ?? null,
    data.first_name ?? null,
    data.last_name ?? null,
    now,
    id
  );
}

// 4. Null in reset() and close()
this.updateCustomerStmt = null;
```

**Example -- Slack updateUser (follows updateChannel pattern):**
```typescript
// In twins/slack/src/state/slack-state-manager.ts
// 1. Add prepared statement
private updateUserStmt: Database.Statement | null = null;

// 2. Prepare in prepareStatements()
this.updateUserStmt = db.prepare(
  'UPDATE slack_users SET name = ?, real_name = ?, display_name = ?, email = ? WHERE id = ?'
);

// 3. Add method (follows updateChannel pattern)
updateUser(id: string, data: Partial<{
  name: string;
  real_name: string;
  display_name: string;
  email: string;
}>): void {
  const user = this.getUser(id);
  if (!user) return;
  this.updateUserStmt!.run(
    data.name ?? user.name,
    data.real_name ?? user.real_name,
    data.display_name ?? user.display_name,
    data.email ?? user.email,
    id,
  );
}

// 4. Null in nullifyStatements()
this.updateUserStmt = null;
```

### Pattern 2: UI Handler Migration (direct SQL to StateManager method)

**What:** Replace inline `database.prepare().run()` calls in UI plugins with proper StateManager method calls.

**Current (Shopify UI, line 449):**
```typescript
// twins/shopify/src/plugins/ui.ts
fastify.stateManager.database.prepare(
  'UPDATE customers SET email = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?'
).run(data.email, data.first_name, data.last_name, Math.floor(Date.now() / 1000), id);
```

**Target:**
```typescript
fastify.stateManager.updateCustomer(id, {
  email: data.email,
  first_name: data.first_name,
  last_name: data.last_name,
});
```

**Current (Slack UI, line 300):**
```typescript
// twins/slack/src/plugins/ui.ts
fastify.slackStateManager.database.prepare(
  'UPDATE slack_users SET name = ?, real_name = ?, display_name = ?, email = ? WHERE id = ?'
).run(data.name, data.real_name || '', data.display_name || '', data.email || null, id);
```

**Target:**
```typescript
fastify.slackStateManager.updateUser(id, {
  name: data.name,
  real_name: data.real_name || '',
  display_name: data.display_name || '',
  email: data.email || null,
});
```

### Pattern 3: Stale Dist Artifact Cleanup

**What:** The file `twins/shopify/dist/services/webhook-sender.js` (and its `.map`, `.d.ts`, `.d.ts.map` companions) is a compiled artifact from Phase 2 that was superseded when `@dtu/webhooks` was created in Phase 3. The source file `twins/shopify/src/services/webhook-sender.ts` was already deleted. The dist file contains the `console.error` referenced in the audit. No source file imports `sendWebhook` from this module.

**Action:** Delete the stale dist files. The `console.error` tech debt resolves by removing dead code, not by changing logging calls.

**Files to delete:**
```
twins/shopify/dist/services/webhook-sender.js
twins/shopify/dist/services/webhook-sender.js.map
twins/shopify/dist/services/webhook-sender.d.ts
twins/shopify/dist/services/webhook-sender.d.ts.map
```

**Verification:** The `@dtu/webhooks` package's `WebhookQueue` already accepts a `logger` option (typed as `WebhookLogger`) and uses it for all logging. The Shopify twin passes `fastify.log` to the queue constructor (see `twins/shopify/src/index.ts` line 65: `logger: fastify.log as any`). Proper structured logging is already in place for the active webhook delivery path.

### Pattern 4: DLQ Timing Test Fix

**What:** The flaky DLQ test at `twins/shopify/test/integration.test.ts` line 947 uses a fixed `setTimeout(600ms)` to wait for compressed-timing retries to complete. At `WEBHOOK_TIME_SCALE=0.001`, the theoretical retry time is `(0 + 60 + 300) * 0.001 = 360ms`. The 600ms buffer is usually sufficient but race conditions under CI load cause intermittent failures.

**Root cause:** The `setTimeout` is a "best guess" wait. When CI is under load, the 600ms may not be enough for all retry timers to fire, the HTTP requests to fail, and the DLQ write to complete.

**Fix strategy -- polling with timeout:**
```typescript
// Replace:
await new Promise(resolve => setTimeout(resolve, 600));

// With polling:
const deadline = Date.now() + 5000; // 5 second hard timeout
while (Date.now() < deadline) {
  const dlqRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
  const dlq = JSON.parse(dlqRes.body);
  if (dlq.length > 0) break;
  await new Promise(resolve => setTimeout(resolve, 50));
}
```

This pattern:
1. Polls at 50ms intervals (fast enough for test speed)
2. Has a 5-second hard timeout (generous enough for any CI load)
3. Exits immediately when the DLQ entry appears (no unnecessary waiting)
4. Preserves the same assertion structure after the polling loop

**Affected tests:**
- `twins/shopify/test/integration.test.ts` line 970: `await new Promise(resolve => setTimeout(resolve, 600));`
- `twins/shopify/test/integration.test.ts` line 1027: `await new Promise(resolve => setTimeout(resolve, 600));`

Both use the same pattern and both need the same fix.

### Anti-Patterns to Avoid
- **Don't change the `@dtu/webhooks` package logging** -- it already uses proper structured logging via `WebhookLogger` interface
- **Don't add fastify.log dependency to StateManager** -- StateManager is framework-agnostic, keep it that way
- **Don't use `vitest.waitFor`** -- the DLQ check crosses process boundaries (HTTP inject), polling with short intervals is cleaner than vitest's retry mechanism for this case

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured logging | Custom logger | `fastify.log` (Pino) | Already integrated, JSON structured output |
| Prepared statement lifecycle | Manual SQL | StateManager method pattern | Existing pattern handles init/reset/close lifecycle |
| Test timing | Complex event system | Simple polling loop | Minimal change, maximum reliability |

**Key insight:** Every fix in this phase follows an existing pattern in the codebase. The risk is adding unnecessary complexity, not missing something.

## Common Pitfalls

### Pitfall 1: Breaking StateManager Reset/Close Lifecycle
**What goes wrong:** Adding `updateCustomerStmt` to `prepareStatements()` but forgetting to null it in `reset()` and `close()`.
**Why it happens:** The StateManager has three locations that must stay in sync: declaration, prepare, and nullify.
**How to avoid:** Search for an existing statement (e.g., `updateProductStmt`) and replicate all three locations.
**Warning signs:** Tests pass on first run but fail after `POST /admin/reset` because stale prepared statements reference a closed DB connection.

### Pitfall 2: Forgetting to Rebuild @dtu/state dist
**What goes wrong:** Adding `updateCustomer` to the source but not rebuilding, so the Shopify twin imports stale compiled JS that lacks the method.
**Why it happens:** pnpm workspace resolution uses compiled `dist/` output, not TypeScript source.
**How to avoid:** Run `pnpm --filter @dtu/state run build` after changing StateManager source, then verify `dist/state-manager.d.ts` exports the new method.
**Warning signs:** `TypeError: stateManager.updateCustomer is not a function` at runtime.

### Pitfall 3: DLQ Polling Test Never Terminating
**What goes wrong:** Polling loop has no timeout, test hangs forever if DLQ entry never appears.
**Why it happens:** The webhook delivery might complete faster than expected (no DLQ entry if it succeeds).
**How to avoid:** Always include a hard timeout in the polling loop. After the loop, assert on the DLQ contents -- if it timed out, the assertion fails with a clear message.
**Warning signs:** CI test suite hangs indefinitely on a single test.

### Pitfall 4: Null Handling Mismatch in updateCustomer
**What goes wrong:** The UI passes `undefined` for omitted fields, but the SQL UPDATE sets them to `null`, clearing existing data.
**Why it happens:** `updateProduct` uses `data.title ?? null` which converts undefined to null. `updateCustomer` should follow `updateChannel` pattern instead -- read existing record first, merge changes, then update.
**How to avoid:** For the Shopify `updateCustomer`, since the UI always sends all three fields (email, first_name, last_name), the simpler `updateProduct`-style pattern (without merge) is sufficient. For the Slack `updateUser`, follow the `updateChannel` pattern (fetch existing, merge provided fields).

## Code Examples

### updateCustomer Full Implementation
```typescript
// packages/state/src/state-manager.ts

// Declaration (add near other update stmts, ~line 50):
private updateCustomerStmt: Database.Statement | null = null;

// In prepareStatements():
this.updateCustomerStmt = db.prepare(
  'UPDATE customers SET email = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?'
);

// Method (add after createCustomer/getCustomer/listCustomers):
/** Update an existing customer by ID, setting updated_at to current timestamp */
updateCustomer(id: number, data: { email?: string; first_name?: string; last_name?: string }): void {
  if (!this.updateCustomerStmt) {
    throw new Error('StateManager not initialized. Call init() first.');
  }
  const now = Math.floor(Date.now() / 1000);
  this.updateCustomerStmt.run(
    data.email ?? null,
    data.first_name ?? null,
    data.last_name ?? null,
    now,
    id
  );
}

// In reset() and close() -- add alongside other stmt nulls:
this.updateCustomerStmt = null;
```

### updateUser Full Implementation
```typescript
// twins/slack/src/state/slack-state-manager.ts

// Declaration (add near other user stmts, ~line 33):
private updateUserStmt: Database.Statement | null = null;

// In prepareStatements():
this.updateUserStmt = db.prepare(
  'UPDATE slack_users SET name = ?, real_name = ?, display_name = ?, email = ? WHERE id = ?'
);

// Method (add after listUsers()):
updateUser(id: string, data: Partial<{
  name: string;
  real_name: string;
  display_name: string;
  email: string;
}>): void {
  const user = this.getUser(id);
  if (!user) return;
  this.updateUserStmt!.run(
    data.name ?? user.name,
    data.real_name ?? user.real_name,
    data.display_name ?? user.display_name,
    data.email ?? user.email,
    id,
  );
}

// In nullifyStatements():
this.updateUserStmt = null;
```

### DLQ Polling Fix
```typescript
// twins/shopify/test/integration.test.ts
// Replace both instances of:
//   await new Promise(resolve => setTimeout(resolve, 600));
// With:
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  const pollRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
  if (JSON.parse(pollRes.body).length > 0) break;
  await new Promise(resolve => setTimeout(resolve, 50));
}
```

### Shopify UI Customer Update Migration
```typescript
// twins/shopify/src/plugins/ui.ts -- POST /ui/customers/:id handler
// Replace lines 449-451:
fastify.stateManager.updateCustomer(id, {
  email: data.email,
  first_name: data.first_name,
  last_name: data.last_name,
});
```

### Slack UI User Update Migration
```typescript
// twins/slack/src/plugins/ui.ts -- POST /ui/users/:id handler
// Replace lines 299-308:
fastify.slackStateManager.updateUser(id, {
  name: data.name,
  real_name: data.real_name || '',
  display_name: data.display_name || '',
  email: data.email || null,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sendWebhook()` with `console.error` | `WebhookQueue` with structured `WebhookLogger` | Phase 3 | Webhook delivery already uses proper logging |
| Direct SQL in UI handlers | StateManager methods | This phase | Eliminates SQL scattered across UI plugins |

**Deprecated/outdated:**
- `twins/shopify/dist/services/webhook-sender.js`: Dead code, source deleted in Phase 3. Delete dist artifacts.

## Open Questions

None. All four items are straightforward with clear solutions based on existing patterns.

## File Inventory

### Files to Modify
| File | Change | Reason |
|------|--------|--------|
| `packages/state/src/state-manager.ts` | Add `updateCustomer` method + prepared statement | StateManager gap |
| `twins/slack/src/state/slack-state-manager.ts` | Add `updateUser` method + prepared statement | SlackStateManager gap |
| `twins/shopify/src/plugins/ui.ts` | Replace direct SQL with `stateManager.updateCustomer()` | Use proper StateManager API |
| `twins/slack/src/plugins/ui.ts` | Replace direct SQL with `slackStateManager.updateUser()` | Use proper StateManager API |
| `twins/shopify/test/integration.test.ts` | Replace `setTimeout(600)` with polling loop | Fix flaky DLQ timing test |

### Files to Delete
| File | Reason |
|------|--------|
| `twins/shopify/dist/services/webhook-sender.js` | Dead code, superseded by `@dtu/webhooks` |
| `twins/shopify/dist/services/webhook-sender.js.map` | Companion to dead code |
| `twins/shopify/dist/services/webhook-sender.d.ts` | Companion to dead code |
| `twins/shopify/dist/services/webhook-sender.d.ts.map` | Companion to dead code |

### Files to Rebuild
| File | Command | Reason |
|------|---------|--------|
| `packages/state/dist/*` | `pnpm --filter @dtu/state run build` | New `updateCustomer` method must be in compiled output |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/state/src/state-manager.ts` -- existing `updateProduct`, `updateOrder` patterns
- Codebase inspection: `twins/slack/src/state/slack-state-manager.ts` -- existing `updateChannel` pattern
- Codebase inspection: `twins/shopify/src/index.ts` line 65 -- `logger: fastify.log as any` confirms proper logging already wired
- Codebase inspection: `twins/shopify/src/plugins/ui.ts` lines 446-451 -- direct SQL for customer update
- Codebase inspection: `twins/slack/src/plugins/ui.ts` lines 296-308 -- direct SQL for user update
- Codebase inspection: `twins/shopify/test/integration.test.ts` lines 947-980 -- DLQ timing test with 600ms wait
- Codebase inspection: `twins/shopify/dist/services/webhook-sender.js` -- stale artifact with `console.error`
- Codebase inspection: no source file imports `sendWebhook` from `webhook-sender` -- fully dead code

### Secondary (MEDIUM confidence)
- `.planning/v1.0-MILESTONE-AUDIT.md` -- tech debt item list and severity assessment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing patterns
- Architecture: HIGH -- follows existing StateManager method patterns exactly
- Pitfalls: HIGH -- identified from direct codebase analysis, not external sources

**Research date:** 2026-02-28
**Valid until:** Indefinite -- codebase-specific findings, no external dependency concerns
