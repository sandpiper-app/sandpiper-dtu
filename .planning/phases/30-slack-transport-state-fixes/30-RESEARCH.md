# Phase 30: Slack Transport & State Fixes - Research

**Researched:** 2026-03-13
**Domain:** Slack twin — webhook transport headers (SLCK-16) and state table correctness (SLCK-17)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-16 | Slack event deliveries carry only Slack signature headers (`X-Slack-Signature` `v0=` HMAC-SHA256 + `X-Slack-Request-Timestamp`), not Shopify headers; interactions route to dedicated interactivity URL; `response_url` is absolute | Root cause identified in `packages/webhooks/src/webhook-delivery.ts:36-41` which unconditionally prepends Shopify headers before caller-supplied headers; `POST /admin/set-interactivity-url` already exists in `twins/slack/src/plugins/admin.ts:163-169`; `InteractionHandler.baseUrl` already generates absolute URLs; test group SLCK-16a is the sole remaining real failure |
| SLCK-17 | `views.open`/`update`/`push` maintain persistent view lifecycle; `pins.add`/`remove`/`list` are stateful; `reactions.add`/`remove`/`list`/`get` are stateful with deduplication; `conversations.invite`/`kick`/`members` manage actual membership | State tables fully exist in `SlackStateManager`; pins/reactions deduplication is already implemented; views update returns wrong error for unknown `view_id` (fallback returns `ok:true`); `reactions.list` returns hardcoded stub; `views.ts` JSON-parse bug on form-encoded input; 2 tests use wrong assertion pattern (SDK throws, tests check `res.ok`) |
</phase_requirements>

---

## Summary

Phase 30 is a targeted bug-fix phase addressing two partially-complete requirements: SLCK-16 (Slack event signing transport) and SLCK-17 (state table correctness). The codebase is already well-structured — no new SQLite tables, no new services, and no architectural changes are required. All fixes are within existing files.

The core SLCK-16 problem is the shared `packages/webhooks/src/webhook-delivery.ts` function `deliverWebhook()`. It unconditionally writes `X-Shopify-Hmac-Sha256`, `X-Shopify-Topic`, and `X-Shopify-Webhook-Id` as base headers (lines 36-40), then spreads `delivery.headers` on top. The Slack `EventDispatcher` already passes the correct `X-Slack-Signature` and `X-Slack-Request-Timestamp` via `delivery.headers`, but those cannot overwrite the Shopify headers since `Object.assign`/spread preserves earlier keys when there are collisions in practice, and more critically the Shopify headers remain present regardless. The fix is to make `deliverWebhook` NOT inject Shopify-specific headers when `delivery.headers` already contains Slack signing headers, OR to bypass `deliverWebhook` in the `EventDispatcher` and use a direct `fetch()` call. The `interactions.ts` plugin already does direct `fetch()` with only Slack headers — that pattern is the model.

For SLCK-17, the remaining gaps are: (1) `views.update` with an unknown `view_id` returns `ok:true` with a fallback instead of `{ok:false, error:'view_not_found'}`; (2) `reactions.list` returns a hardcoded empty stub instead of querying the stateful reactions table; (3) `views.ts` does not JSON-parse the `view` parameter when it arrives as a string (form-encoded requests); (4) two SDK test assertions use the wrong pattern — the Slack SDK throws an `Error` on `{ok:false}` responses (the `error.data.error` field contains the Slack error code) but the tests for `pins.add` duplicate and `reactions.add` duplicate use `expect(res.ok).toBe(false)` expecting a resolved object.

The audit confirms 4 tests currently fail: views.update title bug (product), views.update unknown-ID bug (product), pins.add duplicate (test assertion bug), reactions.add duplicate (test assertion bug). The `set-interactivity-url` endpoint and `response_url` absolute URL generation are already correctly implemented — SLCK-16b and SLCK-16c tests should be GREEN already.

**Primary recommendation:** Fix `deliverWebhook` to not inject Shopify headers when the caller provides Slack headers (or bypass it in `EventDispatcher` via direct `fetch()`), fix `views.update` unknown-ID to return `view_not_found`, fix `reactions.list` to query state, fix the form-encoded JSON parse in views handlers, and fix the two test assertion bugs to use `try/catch` pattern.

---

## Standard Stack

### Core (all existing, no new dependencies)
| Component | Location | Purpose |
|-----------|----------|---------|
| `packages/webhooks/src/webhook-delivery.ts` | `deliverWebhook()` | HTTP delivery with HMAC signing — root cause of SLCK-16 |
| `twins/slack/src/services/event-dispatcher.ts` | `EventDispatcher.dispatch()` | Already generates correct Slack headers, but they are overshadowed |
| `twins/slack/src/plugins/interactions.ts` | direct `fetch()` | Already uses correct Slack-only headers — model for the fix |
| `twins/slack/src/plugins/web-api/views.ts` | `views.update` handler | Needs `view_not_found` for unknown view_id, JSON-parse fix |
| `twins/slack/src/plugins/web-api/reactions.ts` | `reactions.list` handler | Needs to query `SlackStateManager.listReactions` instead of returning stub |
| `twins/slack/src/state/slack-state-manager.ts` | `removeReaction`, `listReactions` | Already exists and is fully functional |
| `tests/sdk-verification/sdk/slack-signing.test.ts` | SLCK-16 tests | Already written; SLCK-16a will be fixed by the transport fix |
| `tests/sdk-verification/sdk/slack-state-tables.test.ts` | SLCK-17 tests | Already written; product bugs + test assertion bugs need fixes |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure (unchanged)
```
twins/slack/src/
├── services/event-dispatcher.ts   # Fix: bypass deliverWebhook or guard headers
├── plugins/web-api/views.ts       # Fix: view_not_found + JSON-parse
├── plugins/web-api/reactions.ts   # Fix: reactions.list stub -> real query
packages/webhooks/src/
└── webhook-delivery.ts            # Fix: don't inject Shopify headers unconditionally
tests/sdk-verification/sdk/
├── slack-signing.test.ts          # SLCK-16a test — already written
└── slack-state-tables.test.ts     # SLCK-17 tests — fix assertions for pins/reactions
```

### Pattern 1: EventDispatcher Bypass — Direct fetch() for Slack Events

**What:** Instead of routing through `WebhookQueue` → `deliverWebhook()` (which always adds Shopify headers), `EventDispatcher.dispatch()` calls `fetch()` directly for each subscription, mirroring the pattern already used in `interactions.ts`.

**When to use:** When the delivery must carry only Slack-specific headers, not Shopify webhook headers.

**Example (from `interactions.ts` — existing correct pattern):**
```typescript
// Source: twins/slack/src/plugins/interactions.ts:56-68
const formBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
const ts = Math.floor(Date.now() / 1000);
const sig = `v0=${createHmac('sha256', signingSecret).update(`v0:${ts}:${formBody}`).digest('hex')}`;
await fetch(interactivityUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Slack-Signature': sig,
    'X-Slack-Request-Timestamp': String(ts),
  },
  body: formBody,
});
```

**For EventDispatcher (JSON body, not form-encoded):**
```typescript
const bodyStr = JSON.stringify(envelope);
const ts = Math.floor(Date.now() / 1000);
const sig = `v0=${createHmac('sha256', this.signingSecret).update(`v0:${ts}:${bodyStr}`).digest('hex')}`;
await fetch(sub.request_url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Slack-Signature': sig,
    'X-Slack-Request-Timestamp': String(ts),
  },
  body: bodyStr,
});
```

**Note:** This removes retry/DLQ support for Slack events. That is acceptable: the webhook queue retry was originally Shopify-infrastructure. Slack event delivery failures during tests are transient and the test uses `Promise.race` with a 3-second timeout — no retry needed.

### Pattern 2: views.update — Return view_not_found for Unknown IDs

**What:** Remove the fallback `buildView()` path in `views.update` when `view_id` is not found in the store.

**Current broken behavior (lines 139-141 in views.ts):**
```typescript
// Fallback: view_id not in store — return ok:true with input view shape
const fallbackId = view_id ?? generateViewId();
return { ok: true, view: { ...buildView(view), id: fallbackId } };
```

**Fixed behavior:**
```typescript
// If view_id was provided but not found, return view_not_found
if (view_id) {
  return reply.send({ ok: false, error: 'view_not_found' });
}
// If no view_id, generate a new view (open behavior via update)
const newId = generateViewId();
// ... create and return new view
```

**Important:** The test `views.update with unknown view_id returns view_not_found` expects `{ok: false, error: 'view_not_found'}`. The `WebClient` will throw when it gets `ok:false`, so the test must use `try/catch` per the SLCK-15 precedent.

### Pattern 3: reactions.list — Query State Instead of Stub

**What:** Replace the hardcoded empty stub in `reactions.list` with a real query to `SlackStateManager.listReactions`.

**Current stub:**
```typescript
// Source: twins/slack/src/plugins/web-api/reactions.ts:92-97
fastify.post('/api/reactions.list', async (request, reply) => {
  const auth = authCheck(request, reply, 'reactions.list');
  if (!auth) return;
  return { ok: true, items: [], response_metadata: { next_cursor: '' } };
});
```

**`reactions.list` in the real Slack API** returns all reactions made by a user across all messages, not reactions on a specific message. The `listReactions(messageTs)` method queries by `message_ts`. For `reactions.list` (list reactions by a calling user), we need a query scoped by `user_id`. The `SlackStateManager` does not currently have a `listReactionsByUser` method — this needs to be added, OR we can query the database directly since `slackStateManager.database` is accessible.

**Recommended:** Add `listReactionsByUser(userId: string): any[]` to `SlackStateManager` that queries `SELECT * FROM slack_reactions WHERE user_id = ? ORDER BY created_at ASC`. Map results to the Slack API format: `items` array with `{ type: 'message', channel, message: { ts, reactions: [...] } }`.

### Pattern 4: Test Assertion Fix — SDK Throws on ok:false

**What:** The Slack `WebClient` throws an `Error` when the API returns `{ok: false}`. Tests that call `client.pins.add()` or `client.reactions.add()` a second time (to test deduplication) and then check `res.ok` will always fail because `res` never resolves — the client throws instead.

**Existing precedent from SLCK-15 (Phase 26 Plan 02):**
```typescript
// Source: STATE.md key decision — Phase 26 Plan 02
// "SLCK-15 tests fixed from result.ok pattern to try/catch (WebClient throws on ok:false,
//  error.data.error contains the Slack error code)"
try {
  await client.pins.add({ channel, timestamp }); // second call
  expect.fail('Should have thrown');
} catch (e: any) {
  expect(e.data.error).toBe('already_pinned');
}
```

**Apply same fix to tests 3 and 4 in `slack-state-tables.test.ts`:**
- Test: `pins.add with duplicate channel+timestamp returns already_pinned` (lines 221-231)
- Test: `reactions.add with same reaction returns already_reacted` (lines 281-291)

### Pattern 5: Form-Encoded JSON Parse in views.ts

**What:** When a Bolt app sends requests via HTTP receiver using `application/x-www-form-urlencoded`, the `view` parameter arrives as a JSON string. `views.ts` handlers pass `view` directly to `JSON.stringify()` / `buildView()` without checking if it is already a string.

**Evidence from audit:** `views.ts:80-142 does not JSON.parse view when it arrives as a string (form-encoded)`.

**Fix pattern:**
```typescript
// Normalize view: may be string (form-encoded) or object (JSON)
const rawView = (request.body as any)?.view;
const view = typeof rawView === 'string' ? JSON.parse(rawView) : rawView;
```

**Apply to:** `views.open`, `views.update`, `views.push` handlers.

### Anti-Patterns to Avoid

- **Modifying `WebhookQueue.enqueue()` signature:** The webhook queue is Shopify infrastructure used by Shopify twins too. Don't add a `mode` or `provider` flag to the shared queue. Instead, bypass it in `EventDispatcher` with direct `fetch()`.
- **Adding new SQLite tables:** All required tables already exist (`slack_reactions`, `slack_views`, `slack_pins`, `slack_channel_members`). SLCK-17 fixes are query-level, not schema-level.
- **Changing `views.update` fallback to always fail:** Only reject when `view_id` is provided but not found. If `view_id` is absent (client passed `external_id` or similar), the current fallback path may be appropriate — but the test passes `view_id: 'V_NONEXISTENT'` explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slack HMAC signing | Custom HMAC lib | `node:crypto` `createHmac('sha256', secret).update().digest('hex')` | Already used throughout codebase; pattern in `interactions.ts` |
| View ID generation | UUID library | `generateViewId()` (already in views.ts) | Consistent `V_` prefix format |
| Reaction deduplication | Custom dedup logic | `SQLITE_CONSTRAINT_UNIQUE` catch (already implemented for `reactions.add` and `pins.add`) | Already works — the fix is in test assertions, not product code |

---

## Common Pitfalls

### Pitfall 1: Shopify Headers Still Present After Spread

**What goes wrong:** Attempt to fix SLCK-16 by reordering the spread in `deliverWebhook` — e.g. `{ ...(delivery.headers ?? {}), 'X-Shopify-Hmac-Sha256': sig, ... }`. This still leaves Shopify headers present, just overrideable. The requirement is "instead of", not "additionally with a different order."

**How to avoid:** Bypass `deliverWebhook()` entirely in `EventDispatcher`. Use direct `fetch()` as `interactions.ts` already does.

**Warning signs:** Test captures headers; checks `x-shopify-hmac-sha256`; asserts it is undefined. The test currently fails because the header IS present.

### Pitfall 2: views.update Breaks view_not_found for External ID Paths

**What goes wrong:** The current fallback `return { ok: true, view: { ...buildView(view), id: fallbackId } }` at line 139-141 is gated by `if (view_id)` — if `view_id` is not provided, the fallback runs. Removing the fallback entirely would break callers using `external_id` (not tested, but defensively important).

**How to avoid:** Only return `view_not_found` when `view_id` is provided AND no matching view is found. Keep the `!view_id` path as-is or verify no tests use it.

### Pitfall 3: Test Assertions for SDK-Thrown Errors

**What goes wrong:** Tests 3 and 4 in `slack-state-tables.test.ts` assign the result of `client.pins.add()` / `client.reactions.add()` to `dupRes` and then check `dupRes.ok`. The SDK throws before the assignment resolves, so the test always fails with an unhandled error, not an assertion failure.

**How to avoid:** Wrap in `try/catch`. Check `e.data.error` (the Slack SDK sets `error.data` on `WebAPICallError`). Precedent: Phase 26 Plan 02 decision in STATE.md.

**Warning signs:** Test failure message shows "Error: already_pinned" thrown, not "expected false to be true."

### Pitfall 4: reactions.list User Scope

**What goes wrong:** Implementing `reactions.list` using `listReactions(messageTs)` which requires a message timestamp. `reactions.list` returns reactions by the authenticated USER, not reactions on a message. The parameters are `user` (optional), `full` (optional), `cursor`, `limit`.

**How to avoid:** Add `listReactionsByUser(userId)` method to `SlackStateManager`. Query `SELECT * FROM slack_reactions WHERE user_id = ?`. Return formatted `items` array.

### Pitfall 5: `already_reacted` / `already_pinned` — Product Code Already Works

**What goes wrong:** Assuming these are product bugs when they are test bugs. `reactions.add` already catches `SQLITE_CONSTRAINT_UNIQUE` and returns `{ok:false, error:'already_reacted'}`. The `slack_reactions` table has `CREATE UNIQUE INDEX idx_slack_reactions_unique ON slack_reactions(message_ts, channel_id, user_id, reaction)`. Pins also catches and returns `already_pinned`. The product is correct — the test assertion pattern is wrong.

**How to avoid:** Before changing product code, verify behavior with direct `fetch()` call (not WebClient). If `POST /api/reactions.add` returns `{ok:false, error:'already_reacted'}`, the product is fine — fix only the test.

---

## Code Examples

### SLCK-16a Fix: EventDispatcher Using Direct fetch()

```typescript
// Source: twins/slack/src/services/event-dispatcher.ts — proposed fix
import { randomUUID, createHmac } from 'node:crypto';

// Replace WebhookQueue.enqueue() with direct fetch
const bodyStr = JSON.stringify(envelope);
const ts = Math.floor(Date.now() / 1000);
const sig = `v0=${createHmac('sha256', this.signingSecret)
  .update(`v0:${ts}:${bodyStr}`)
  .digest('hex')}`;

try {
  await fetch(sub.request_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Slack-Signature': sig,
      'X-Slack-Request-Timestamp': String(ts),
    },
    body: bodyStr,
    signal: AbortSignal.timeout(5000),
  });
} catch (err) {
  // Log and continue — don't throw; individual delivery failure is non-fatal
}
```

### SLCK-17 Fix: views.update Return view_not_found

```typescript
// Source: twins/slack/src/plugins/web-api/views.ts — views.update handler
fastify.post('/api/views.update', async (request, reply) => {
  if (!authCheck(request, reply, 'views.update')) return;
  const rawView = (request.body as any)?.view;
  const view = typeof rawView === 'string' ? JSON.parse(rawView) : rawView;
  const { view_id } = (request.body as any) ?? {};
  if (!view) return reply.send({ ok: false, error: 'invalid_arguments' });

  if (view_id) {
    const storedView = fastify.slackStateManager.getView(view_id);
    if (!storedView) {
      return reply.send({ ok: false, error: 'view_not_found' });
    }
    fastify.slackStateManager.updateView(view_id, {
      title: view.title ? JSON.stringify(view.title) : undefined,
      blocks: view.blocks ? JSON.stringify(view.blocks) : undefined,
      callback_id: view.callback_id,
    });
    const updated = fastify.slackStateManager.getView(view_id);
    return { ok: true, view: formatStoredView(updated) };
  }

  // No view_id: fallback (used with external_id, not in current tests)
  const fallbackId = generateViewId();
  return { ok: true, view: { ...buildView(view), id: fallbackId } };
});
```

### SLCK-17 Fix: reactions.list with Real State Query

```typescript
// SlackStateManager addition:
listReactionsByUser(userId: string): any[] {
  return this.database
    .prepare('SELECT * FROM slack_reactions WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId);
}

// reactions.ts handler:
fastify.post('/api/reactions.list', async (request, reply) => {
  const auth = authCheck(request, reply, 'reactions.list');
  if (!auth) return;
  const userId = auth.tokenRecord.user_id ?? 'U_BOT_TWIN';
  const rawReactions = fastify.slackStateManager.listReactionsByUser(userId);
  // Group by (message_ts, channel_id) -> item with reactions array
  const itemMap = new Map<string, any>();
  for (const r of rawReactions) {
    const key = `${r.channel_id}:${r.message_ts}`;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        type: 'message',
        channel: r.channel_id,
        message: { ts: r.message_ts, reactions: [] },
      });
    }
    const item = itemMap.get(key);
    let reactionEntry = item.message.reactions.find((re: any) => re.name === r.reaction);
    if (!reactionEntry) {
      reactionEntry = { name: r.reaction, count: 0, users: [] };
      item.message.reactions.push(reactionEntry);
    }
    reactionEntry.count++;
    reactionEntry.users.push(r.user_id);
  }
  return {
    ok: true,
    items: Array.from(itemMap.values()),
    response_metadata: { next_cursor: '' },
  };
});
```

### SLCK-17 Fix: Test Assertion Pattern for SDK-Thrown Errors

```typescript
// Source: Pattern from STATE.md Phase 26 Plan 02 decision
// Apply to slack-state-tables.test.ts tests for already_pinned / already_reacted

it('pins.add with duplicate channel+timestamp returns already_pinned error', async () => {
  const client = createSlackClient(token);
  await client.pins.add({ channel: testChannel, timestamp: testTimestamp });

  try {
    await client.pins.add({ channel: testChannel, timestamp: testTimestamp });
    expect.fail('Should have thrown already_pinned');
  } catch (e: any) {
    expect(e.data?.error ?? e.message).toBe('already_pinned');
  }
});

it('reactions.add with same reaction returns already_reacted error', async () => {
  const client = createSlackClient(token);
  await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });

  try {
    await client.reactions.add({ channel: testChannel, timestamp: testTimestamp, name: reaction });
    expect.fail('Should have thrown already_reacted');
  } catch (e: any) {
    expect(e.data?.error ?? e.message).toBe('already_reacted');
  }
});
```

### Form-Encoded JSON Parse Fix (all views handlers)

```typescript
// Apply this normalization at the top of each views handler body:
const rawView = (request.body as any)?.view;
const view = typeof rawView === 'string' ? JSON.parse(rawView) : rawView;
// Then use `view` instead of `(request.body as any)?.view` below
```

---

## State of the Art

| Old Approach | Current Approach | Status | Impact |
|--------------|------------------|--------|--------|
| `WebhookQueue` for Slack event delivery | Direct `fetch()` in EventDispatcher | Phase 30 fix | Removes Shopify header contamination |
| `reactions.list` returns empty stub | `reactions.list` queries `listReactionsByUser()` | Phase 30 fix | Stateful reactions.list |
| `views.update` fallback `ok:true` | `views.update` returns `view_not_found` | Phase 30 fix | Correct error for unknown view |
| Test `res.ok` pattern for `{ok:false}` | `try/catch` with `e.data.error` | Phase 30 fix | SDK throws, tests must catch |

**Deprecated/outdated:**
- `webhook-delivery.ts generateHmacSignature()`: Not deprecated globally, but should NOT be called for Slack event delivery. The Slack signing algorithm uses a different input format (`v0:<ts>:<body>` with hex output vs Shopify's raw body with base64 output).

---

## Open Questions

1. **Should `EventDispatcher` retain the `WebhookQueue` path for non-Slack uses?**
   - What we know: `EventDispatcher` is only instantiated in the Slack twin. The `webhookQueue` member and `@dtu/webhooks` import can be removed.
   - What's unclear: Whether future phases might reuse EventDispatcher for a hybrid delivery path.
   - Recommendation: Remove the `webhookQueue` dependency from `EventDispatcher` entirely. The Slack twin uses direct fetch for all outbound HTTP (interactions plugin already does this). Simpler is correct here.

2. **Does the `views.update` test (`views.update with unknown view_id returns view_not_found`) use `try/catch` or direct assertion?**
   - What we know: The test at line 183-198 uses `const res = await client.views.update(...)` then `expect(res.ok).toBe(false)`. When `views.update` currently returns `ok:true`, this fails as a product bug. When we fix it to return `ok:false`, the SDK will THROW and `res` will never resolve.
   - Recommendation: Fix this test to use `try/catch` (same pattern as pins/reactions). The test as written will fail even after the product fix.

3. **`reactions.list` format: how does real Slack format the `items` array?**
   - What we know: Real Slack `reactions.list` returns `items` as an array of objects with `type`, `channel`, and `message` (or `file`/`file_comment`) subkeys.
   - Confidence: MEDIUM — inferred from SDK types, not live verification.
   - Recommendation: The existing `reactions.get` handler shows the grouping format (`reactions` array per message). Apply same grouping. The test (`slack-state-tables.test.ts`) does not include a `reactions.list` test case, so the format only needs to match the SDK's TypeScript type.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (single-fork pool) |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -E "(PASS\|FAIL\|Error\|slack-signing\|slack-state-tables)"` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-16 | Event delivery uses X-Slack-Signature header only | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-signing.test.ts` |
| SLCK-16 | response_url is absolute URL | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-signing.test.ts` |
| SLCK-16 | Interactions route to interactivity URL | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-signing.test.ts` |
| SLCK-17 | views.update with known view_id updates title | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-state-tables.test.ts` |
| SLCK-17 | views.update with unknown view_id returns view_not_found | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-state-tables.test.ts` |
| SLCK-17 | pins.add deduplication returns already_pinned | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-state-tables.test.ts` |
| SLCK-17 | reactions.add deduplication returns already_reacted | integration (in-process) | `pnpm test:sdk --reporter=verbose` | YES: `slack-state-tables.test.ts` |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk 2>&1 | grep -E "(slack-signing|slack-state-tables|PASS|FAIL)" | head -30`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite `pnpm test:sdk` green (0 failures) before `/gsd:verify-work`

### Wave 0 Gaps
None — all test files already exist. The goal is to make the 4 currently-failing tests pass and make the SLCK-16a test pass (currently failing because EventDispatcher sends Shopify headers).

> Quick test run before implementation (baseline): `pnpm test:sdk 2>&1 | tail -5` should show `4 failed`.

---

## Sources

### Primary (HIGH confidence)
- `twins/slack/src/services/event-dispatcher.ts` — verified EventDispatcher.dispatch() uses WebhookQueue
- `packages/webhooks/src/webhook-delivery.ts` — verified Shopify headers injected unconditionally at lines 36-40
- `twins/slack/src/plugins/interactions.ts` — verified direct `fetch()` pattern with Slack-only headers
- `twins/slack/src/plugins/web-api/views.ts` — verified fallback `ok:true` for unknown view_id (lines 139-141)
- `twins/slack/src/plugins/web-api/reactions.ts` — verified stub at lines 92-97
- `twins/slack/src/state/slack-state-manager.ts` — verified all state tables exist, `removeReaction`/`listReactions` methods present
- `twins/slack/src/plugins/admin.ts` — verified `POST /admin/set-interactivity-url` already exists (lines 163-169)
- `tests/sdk-verification/sdk/slack-signing.test.ts` — verified test assertions, SLCK-16b/16c may already pass
- `tests/sdk-verification/sdk/slack-state-tables.test.ts` — verified failing test assertion patterns
- `.planning/v1.2-MILESTONE-AUDIT.md` — external adversarial audit confirms exact bugs and locations

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` key decisions: Phase 26 Plan 02 — SLCK-15 test fix pattern (try/catch for SDK errors)
- `.planning/STATE.md` key decisions: Phase 25 Plan 04 — SQLITE_CONSTRAINT_UNIQUE catch pattern confirmed working

---

## Metadata

**Confidence breakdown:**
- SLCK-16 root cause: HIGH — code inspected, header injection in webhook-delivery.ts confirmed
- SLCK-16 fix approach: HIGH — direct fetch() pattern already used in interactions.ts
- SLCK-16b/16c already fixed: MEDIUM — admin endpoint exists, baseUrl generates absolute URLs; needs runtime test to confirm
- SLCK-17 views.update product bugs: HIGH — fallback code and test assertions both inspected
- SLCK-17 reactions.list fix: HIGH — table exists, method to add is clear
- SLCK-17 test assertion bugs: HIGH — SDK throw behavior confirmed in STATE.md Phase 26 decisions
- reactions.list output format: MEDIUM — inferred from SDK types and existing reactions.get handler

**Research date:** 2026-03-13
**Valid until:** 2026-04-12 (stable domain — no external API versioning concerns)
