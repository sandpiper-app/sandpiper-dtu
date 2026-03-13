# Phase 25: Slack Method Coverage, Event Signing & State Tables - Research

**Researched:** 2026-03-12
**Domain:** Slack twin — WebClient method stubs, HMAC event signing, channel membership, view state, pin/reaction deduplication
**Confidence:** HIGH

## Summary

Phase 25 has three requirements. The work is entirely within the existing stack: no new runtime dependencies, all HMAC signing via `node:crypto`, all state via `better-sqlite3` through `SlackStateManager`. No new packages are needed.

**SLCK-14 — WebClient method coverage gap:** The pinned `@slack/web-api@7.14.1` manifest shows 275+ bound API methods (excluding `token.*` string-prototype members). After filtering those, the actual unique API method count is approximately 275. The existing twin handles ~149 of them (all of `conversations.*`, `chat.*`, `users.*`, `files.*`, `search.*`, `reminders.*`, `bots.*`, `emoji.*`, `migration.*`, `tooling.*`, `dnd.*`, `bookmarks.*`, `usergroups.*`, `calls.*`, `team.*`, `dialog.*`, `functions.*`, `assistant.*`, `auth.*`, `apps.*`, `views.*`, `pins.*`, `reactions.*`). The missing families are: `admin.*` (95 methods), `canvases.*` (6), `openid.connect.*` (2), `stars.*` (3), `workflows.*` (7), `slackLists.*` (13), `entity.*` (1), `rtm.*` (2) — total ~129 methods. All missing families are straightforward auth-gated stubs; only the high-value admin sub-families need semantically shaped responses.

**SLCK-16 — Event signing and interaction routing:** The twin's `EventDispatcher` currently delivers webhooks via `WebhookQueue`, which signs payloads using Shopify's `X-Shopify-Hmac-Sha256` header format and base64 digest. Bolt's `verifySlackRequest` requires `X-Slack-Signature` (`v0=<hex>`) and `X-Slack-Request-Timestamp` headers (format: `v0:${ts}:${body}` HMAC-SHA256). The twin's interaction payload delivery via `interactions.ts` posts to `sub.request_url` (the event subscriptions URL), but Bolt uses a separate interactivity URL. The `response_url` field is currently a relative path (`/response-url/:id`) rather than an absolute URL. Three distinct fixes needed.

**SLCK-17 — State tables for membership, views, pins, reactions:** `conversations.invite`/`kick` currently do not write to any membership table — they just return `ok:true`. `conversations.members` returns a hardcoded `['U_BOT_TWIN']`. `conversations.open` returns hardcoded `{ id: 'D_TWIN', is_im: true }`. `views.open`/`update`/`push` generate ephemeral view IDs that are not persisted; update uses the input view's shape rather than updating a stored record. `pins.add`/`remove` are stateless stubs. `reactions.add` is stateful but `reactions.remove` is a no-op; neither enforces deduplication errors. All five feature areas need new SQLite tables or column additions and updated handlers.

**Primary recommendation:** Wave 0 (failing tests) before any implementation. Three implementation waves: (1) SLCK-14 stub registration for all missing families + `method-scopes.ts` additions, (2) SLCK-16 event signing + interaction routing + absolute response_url, (3) SLCK-17 state tables (membership, views, pins with deduplication, reactions with deduplication + remove). XCUT-01 requires that every new table appear in `runSlackMigrations()` and is verified by a reset test.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-14 | All bound WebClient methods from the pinned `@slack/web-api` package are registered and callable; high-value families (admin.apps, admin.conversations, admin.users, workflows) have semantically correct responses; remaining admin.* and low-traffic families are explicitly marked as stubs | ~129 methods missing; all can be auth-gated stubs; `stubs.ts` pattern is established; `method-scopes.ts` must be updated for Phase 26 |
| SLCK-16 | Event delivery uses `X-Slack-Signature` + `X-Slack-Request-Timestamp` headers; interactions route through a dedicated interactivity URL; `response_url` is an absolute URL | `EventDispatcher` currently uses Shopify-format HMAC headers; `interaction-handler.ts` line 59 emits relative path; fix is node:crypto + base URL construction |
| SLCK-17 | `conversations.invite`/`kick` manage actual channel membership; `conversations.members` returns real member list; `conversations.open` returns real DM channel; `views.open`/`update`/`push` maintain persistent view lifecycle with stable view IDs; `pins.add`/`remove`/`list` are stateful with deduplication; `reactions.add`/`remove`/`list`/`get` are stateful with deduplication | Needs 3 new tables: `slack_channel_members`, `slack_views`, `slack_pins`; `slack_reactions` already exists but needs UNIQUE constraint and `removeReaction` method; `conversations.open` needs DM channel creation |
</phase_requirements>

## Standard Stack

### Core (all already in use — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 12.6.2 | SQLite state backing for new tables | Already used by `SlackStateManager` |
| `node:crypto` | built-in | HMAC-SHA256 for `X-Slack-Signature` | Project constraint: "No new runtime dependencies — all HMAC signing via node:crypto" |
| Fastify `FastifyPluginAsync` | v5 | New route registration | All twin routes use this pattern |
| Vitest 3 | 3.x | Test framework | `pnpm test:sdk` and `pnpm -F twins/slack run test` |

### No New Dependencies
The v1.2 roadmap decision (2026-03-11) is explicit: "No new runtime dependencies — all HMAC signing via node:crypto, state via existing better-sqlite3." Phase 25 follows this exactly.

## Architecture Patterns

### Recommended Project Structure (all additions)

```
twins/slack/src/
├── plugins/web-api/
│   ├── admin.ts          # NEW: 95 admin.* stub routes
│   ├── new-families.ts   # NEW: canvases, openid, stars, workflows, slackLists, entity, rtm stubs
│   ├── conversations.ts  # MODIFY: invite/kick membership writes, open DM creation, members read
│   ├── pins.ts           # MODIFY: stateful with deduplication
│   ├── reactions.ts      # MODIFY: remove deduplication, removeReaction
│   └── views.ts          # MODIFY: persistent view store
├── services/
│   ├── event-dispatcher.ts  # MODIFY: Slack HMAC headers
│   └── interaction-handler.ts  # MODIFY: absolute response_url, dedicated interactivity URL
└── state/
    └── slack-state-manager.ts  # MODIFY: 3 new tables + prepared statements

tests/sdk-verification/sdk/
├── slack-method-coverage.test.ts   # NEW: Wave 0 failing tests for SLCK-14
├── slack-signing.test.ts           # NEW: Wave 0 failing tests for SLCK-16
└── slack-state-tables.test.ts      # NEW: Wave 0 failing tests for SLCK-17
```

### Pattern 1: Auth-Gated Stub Registration (SLCK-14)

**What:** Register `POST /api/<family>.<method>` routes that perform auth check and return `{ ok: true, ...shape }`.

**When to use:** All 129 missing methods that do not require state for SDK conformance.

**Example (existing stubs.ts pattern to replicate):**
```typescript
// Source: twins/slack/src/plugins/web-api/stubs.ts
const stubsPlugin: FastifyPluginAsync = async (fastify) => {
  function stub(extra: Record<string, unknown> = {}) {
    return async (request: any, reply: any) => {
      const token = extractToken(request);
      if (!token) return reply.send({ ok: false, error: 'not_authed' });
      const tokenRecord = fastify.slackStateManager.getToken(token);
      if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
      return { ok: true, response_metadata: { next_cursor: '' }, ...extra };
    };
  }
  // ... POST routes
};
```

**Admin family stubs — semantically shaped responses for high-value sub-families:**
```typescript
// admin.users.* — return shaped user objects
fastify.post('/api/admin.users.list', stub({ members: [] }));
fastify.post('/api/admin.users.invite', stub({ user: { id: 'U_STUB' } }));
fastify.post('/api/admin.users.assign', stub({ user: { id: 'U_STUB' } }));
// admin.conversations.* — return shaped channel objects
fastify.post('/api/admin.conversations.create', stub({ channel_id: 'C_STUB' }));
fastify.post('/api/admin.conversations.search', stub({ conversations: [], response_metadata: { next_cursor: '' } }));
// admin.apps.* — return shaped app objects
fastify.post('/api/admin.apps.approve', stub());
fastify.post('/api/admin.apps.approved.list', stub({ approved_apps: [] }));
// admin.teams.* — return shaped team objects
fastify.post('/api/admin.teams.list', stub({ teams: [] }));
fastify.post('/api/admin.teams.create', stub({ team: { id: 'T_STUB' } }));
// workflows.* — return shaped workflow objects
fastify.post('/api/workflows.stepCompleted', stub());
fastify.post('/api/workflows.stepFailed', stub());
fastify.post('/api/workflows.updateStep', stub());
```

### Pattern 2: Slack Event Signing (SLCK-16)

**What:** `EventDispatcher.dispatch()` must set `X-Slack-Signature` and `X-Slack-Request-Timestamp` headers. The signature format is `v0=` + HMAC-SHA256 hex of `v0:${timestamp}:${body}` using the signing secret.

**When to use:** All event deliveries via `WebhookQueue.enqueue()`.

**Current bug:** `webhook-delivery.ts` `generateHmacSignature()` returns base64 and sets `X-Shopify-Hmac-Sha256`. EventDispatcher passes `headers: { 'Content-Type': 'application/json' }`, relying on the delivery function's defaults. The Shopify header is added by `deliverWebhook()` regardless.

**Fix — override headers in WebhookQueue.enqueue() call:**
```typescript
// Source: Bolt verify-request.js verified implementation
// v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}
import { createHmac } from 'node:crypto';

// In EventDispatcher.dispatch(), compute the signature before enqueueing:
const bodyStr = JSON.stringify(envelope);
const ts = Math.floor(Date.now() / 1000);
const sig = `v0=${createHmac('sha256', this.signingSecret).update(`v0:${ts}:${bodyStr}`).digest('hex')}`;

await this.webhookQueue.enqueue({
  id: randomUUID(),
  topic: `slack:${eventType}`,
  callbackUrl: sub.request_url,
  payload: envelope,
  secret: this.signingSecret,
  headers: {
    'Content-Type': 'application/json',
    'X-Slack-Signature': sig,
    'X-Slack-Request-Timestamp': String(ts),
  },
});
```

**Bolt verification contract (from `verify-request.js`):**
- Header `x-slack-request-timestamp` — Unix seconds integer as string
- Header `x-slack-signature` — `v0=<hex>`
- Signed string: `v0:${timestamp}:${rawBody}`
- Freshness window: timestamp must be within 5 minutes of server time

**Important:** `WebhookQueue` passes `delivery.headers` into the fetch call, overriding default headers. The `X-Shopify-Hmac-Sha256` header is still set by `deliverWebhook()`. The Slack event delivery headers must be in `delivery.headers` to take precedence. Verify that the delivery function's header merge gives `delivery.headers` priority over defaults. If not, a Slack-specific delivery path or overriding `deliverWebhook` is needed.

### Pattern 3: Dedicated Interactivity URL (SLCK-16)

**What:** Bolt registers two separate endpoints via `interactivityRequestUrl` (default: same as event URL in some configs, but distinct path). The twin must deliver interaction payloads to a different URL than event callbacks.

**Current bug:** `interactions.ts` delivers interaction payloads to `sub.request_url` from `listEventSubscriptions()`. This sends them to the same URL used for event callbacks. Bolt's `HTTPReceiver` defaults to `/slack/events` for events AND interactions when `interactivityRequestUrl` is not set, but the correct behavior is to have a separate registration.

**Fix — add a separate interactivity_url field to event subscriptions, or add a separate admin endpoint for registering interactivity URLs:**
```typescript
// New admin endpoint: POST /admin/set-interactivity-url { url: string }
// Store in SlackStateManager as ephemeral (like wssUrl)
// In interactions.ts, deliver to the stored interactivity_url instead of event_subscriptions request_url
```

**Alternative fix:** The simplest conformant approach is to store a dedicated `interactivity_request_url` separate from the event `request_url` in the `slack_event_subscriptions` table, or as an ephemeral field on `SlackStateManager` (like `wssUrl`).

### Pattern 4: Absolute response_url (SLCK-16)

**What:** `InteractionHandler.generateInteractionPayload()` currently sets `response_url = '/response-url/${responseUrlId}'`. This is a relative path. Real Slack sends an absolute URL that the app can POST to from its own server.

**Fix — pass base URL to InteractionHandler:**
```typescript
// Source: twins/slack/src/services/interaction-handler.ts line 59
// BEFORE: const responseUrl = `/response-url/${responseUrlId}`;
// AFTER:
const responseUrl = `${this.baseUrl}/response-url/${responseUrlId}`;
```

**Base URL source:** `InteractionHandler` receives `signingSecret` in its constructor options. Add `baseUrl: string` to `InteractionHandlerOptions`. `buildApp()` passes `process.env.SLACK_API_URL ?? 'http://localhost:3001'` as `baseUrl`.

### Pattern 5: Channel Membership State Table (SLCK-17)

**What:** New `slack_channel_members` table to track which users are in which channels. `conversations.invite` inserts rows, `conversations.kick` removes them, `conversations.members` returns them.

**Table schema:**
```sql
CREATE TABLE IF NOT EXISTS slack_channel_members (
  channel_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON slack_channel_members(channel_id);
```

**conversations.open — DM channel creation:** Instead of returning hardcoded `D_TWIN`, create (or find) a DM channel in `slack_channels` with `is_im = 1`. The DM channel ID can be deterministically derived from the user pair: e.g., `D_${userId1}_${userId2}` sorted. The `createChannel` method already supports custom IDs via `data.id`.

### Pattern 6: Persistent View State (SLCK-17)

**What:** New `slack_views` table to persist view objects. `views.open` creates a new view record; `views.update` looks up by `view_id` and updates the stored record; `views.push` creates an additional view on the "stack" (new record); returned view object always has the stable stored ID.

**Table schema:**
```sql
CREATE TABLE IF NOT EXISTS slack_views (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'modal',
  title       TEXT,
  blocks      TEXT DEFAULT '[]',
  callback_id TEXT DEFAULT '',
  state       TEXT DEFAULT '{"values":{}}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

**views.update — look up and update:**
```typescript
// BEFORE: always generates new ID
// AFTER: look up view_id or external_id, update it, return the stored view
const { view_id, external_id, view } = (request.body as any) ?? {};
const storedView = view_id
  ? fastify.slackStateManager.getView(view_id)
  : fastify.slackStateManager.getViewByExternalId(external_id);
if (!storedView) return reply.send({ ok: false, error: 'view_not_found' });
fastify.slackStateManager.updateView(storedView.id, view);
return { ok: true, view: fastify.slackStateManager.getView(storedView.id) };
```

### Pattern 7: Stateful Pins with Deduplication (SLCK-17)

**What:** New `slack_pins` table. `pins.add` inserts; on duplicate (same `channel_id` + `timestamp` or `file`) returns `{ ok: false, error: 'already_pinned' }`. `pins.remove` deletes; `pins.list` returns the channel's pins.

**Table schema:**
```sql
CREATE TABLE IF NOT EXISTS slack_pins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  item_type  TEXT NOT NULL DEFAULT 'message',
  timestamp  TEXT,
  file_id    TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (channel_id, timestamp),
  UNIQUE (channel_id, file_id)
);
CREATE INDEX IF NOT EXISTS idx_slack_pins_channel ON slack_pins(channel_id);
```

**Deduplication error:**
```typescript
// pins.add handler
try {
  fastify.slackStateManager.addPin(channel, timestamp, userId);
} catch (e: any) {
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return reply.send({ ok: false, error: 'already_pinned' });
  }
  throw e;
}
```

### Pattern 8: Stateful Reactions with Deduplication (SLCK-17)

**What:** `slack_reactions` table already exists but is missing a `UNIQUE` constraint and `removeReaction` method. Add `UNIQUE (message_ts, channel_id, user_id, reaction)` constraint. Add `removeReaction()` to `SlackStateManager`. `reactions.remove` handler removes the row instead of being a no-op. On duplicate `reactions.add`, return `{ ok: false, error: 'already_reacted' }`.

**Migration for UNIQUE constraint:** Since `runSlackMigrations()` uses `CREATE TABLE IF NOT EXISTS`, the constraint can only be added if the table is new. For in-memory DB (`:memory:`) this is fine — table is always fresh. For file-backed DBs, use `CREATE UNIQUE INDEX IF NOT EXISTS` which is safe to add to an existing table:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_reactions_unique
  ON slack_reactions(message_ts, channel_id, user_id, reaction);
```

**removeReaction method:**
```typescript
removeReaction(messageTs: string, channelId: string, userId: string, reaction: string): void {
  this.removeReactionStmt!.run(messageTs, channelId, userId, reaction);
}
```

### Anti-Patterns to Avoid

- **Shared event subscription URL for interactions:** Do not deliver interaction payloads to the same `request_url` that receives event callbacks. Bolt uses separate endpoints for events and interactions, and tests set up distinct URLs for each.
- **Relative response_url:** `response_url` in interaction payloads must be an absolute `http://...` URL. Bolt apps will attempt to POST to it from their own process; a relative path fails with a fetch error.
- **Shopify HMAC headers on Slack events:** Bolt's `verifySlackRequest` checks for `x-slack-signature` and `x-slack-request-timestamp`. Receiving `X-Shopify-Hmac-Sha256` causes a hard signature verification failure (not a soft error).
- **Ephemeral view IDs for views.update:** `views.update` passes a `view_id` that refers to a previously opened view. If views are not persisted, the update call can only return a fresh generic view — Bolt tests that check the view's `callback_id` or state after update will fail.
- **Reactions.remove as no-op:** The requirement specifically calls for deduplication errors on `already_reacted` — the existing no-op pass-through on remove means the reaction count never decreases, breaking tests that add then remove then re-add the same reaction.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slack HMAC signatures | Custom HMAC library | `node:crypto` `createHmac('sha256', secret).update(str).digest('hex')` | Already in codebase (tests use it); Bolt verifies against this exact format |
| SQLite deduplication | Application-level duplicate check | `UNIQUE` constraint + catch `SQLITE_CONSTRAINT_UNIQUE` | Atomic; prevents TOCTOU races |
| Slack DM channel IDs | Random UUID-based IDs | Deterministic ID from sorted user pair `D_${[u1,u2].sort().join('_')}` | `conversations.open` with same users twice should return `already_open: true` |
| View ID generation | UUIDs | `V_` prefix + random alphanumeric (same as current `generateViewId()`) | Consistent with existing `V_*` ID patterns in the twin |

**Key insight:** The biggest risk in this phase is the three separate sub-problems of SLCK-16 being conflated. Signing headers, interaction routing, and response_url absolutization are three independent bugs with three independent fixes.

## Common Pitfalls

### Pitfall 1: WebhookQueue Header Override Priority
**What goes wrong:** `webhook-delivery.ts` `deliverWebhook()` sets `X-Shopify-Hmac-Sha256` as a default header regardless of `delivery.headers`. If `delivery.headers` is merged after the defaults, the Shopify header may overwrite a provided `X-Slack-Signature`.
**Why it happens:** The merge order in `deliverWebhook()` is `{ 'X-Shopify-Hmac-Sha256': sig, ..., ...(delivery.headers ?? {}) }` — `delivery.headers` wins because it spreads last. So providing `X-Slack-Signature` in `delivery.headers` does produce the correct header. However, the Shopify header is still sent alongside it. Bolt ignores unknown headers, so this is safe.
**How to avoid:** Verify the spread order in `webhook-delivery.ts` lines 36-42. `delivery.headers` is spread last, so it wins. No change to `deliverWebhook` is needed — just pass correct Slack headers in `EventDispatcher`.
**Warning signs:** Bolt rejects with "Failed to verify authenticity: signature mismatch" in test output.

### Pitfall 2: Reaction UNIQUE Constraint Migration
**What goes wrong:** `runSlackMigrations()` uses `CREATE TABLE IF NOT EXISTS`. If `slack_reactions` already exists without the UNIQUE constraint (in a file-backed DB), the CREATE TABLE IF NOT EXISTS is a no-op and the constraint is never added.
**Why it happens:** SQLite's `ALTER TABLE ADD COLUMN` exists but `ALTER TABLE ADD CONSTRAINT` does not.
**How to avoid:** Use a separate `CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_reactions_unique ON slack_reactions(message_ts, channel_id, user_id, reaction)` statement. This is safe to run on both new and existing tables. Since tests always reset state with `:memory:` DBs, this is a non-issue for tests but matters for file-backed production use.

### Pitfall 3: admin.* Route Naming for Sub-Namespaces
**What goes wrong:** Slack SDK method names like `admin.apps.config.lookup` map to route `/api/admin.apps.config.lookup`. Registering these as separate Fastify routes works fine because Fastify matches literal path strings including dots. But the dots are part of the URL path, not query parameters.
**Why it happens:** The Slack Web API uses dotted method names as literal URL paths (e.g., `POST https://slack.com/api/admin.apps.config.lookup`). The twin follows this convention in all existing routes.
**How to avoid:** Register each method as `fastify.post('/api/admin.apps.config.lookup', ...)` — no special handling needed. Verify against the manifest member list that route names match exactly.

### Pitfall 4: XCUT-01 Reset Coverage
**What goes wrong:** New tables (`slack_channel_members`, `slack_views`, `slack_pins`, `UNIQUE` index on `slack_reactions`) are created in `runSlackMigrations()` but `reset()` only calls `inner.reset()` (which closes+reopens the DB) and then `runSlackMigrations()` again. Since `inner.reset()` closes and reinitializes the DB file, all tables are dropped. This is correct — no extra tracking needed. However, the smoke test's "re-seeds defaults after reset" assertion does NOT check new table counts, so a test gap exists.
**Why it happens:** `StateManager.reset()` closes the DB connection, which for `:memory:` databases means all data is destroyed and a fresh DB is opened. `runSlackMigrations()` recreates all tables. The reset is inherently correct because of the close+reopen pattern.
**How to avoid:** After adding new tables, add a reset coverage test that: (1) seeds data into the new tables, (2) calls `/admin/reset`, (3) asserts the new tables are empty (count = 0). Per XCUT-01 requirement, this test must exist.

### Pitfall 5: interactions.ts uses event subscription URL
**What goes wrong:** The `interactions.ts` plugin delivers interaction payloads by iterating `listEventSubscriptions()` and posting to each `sub.request_url`. This is wrong for SLCK-16 — interactions must route to a dedicated interactivity URL, not the event URL.
**Why it happens:** The current implementation reuses the event subscription table as a simple URL store, not distinguishing event vs. interactivity endpoints.
**How to avoid:** Add ephemeral storage for interactivity URL (like `wssUrl`) or a new `interactivity_request_url` column in `slack_event_subscriptions`. The simplest fix: add `setInteractivityUrl(url)` / `getInteractivityUrl()` to `SlackStateManager` (ephemeral, like `wssUrl`) and a `POST /admin/set-interactivity-url` endpoint. Then `interactions.ts` delivers to `slackStateManager.getInteractivityUrl()` instead.

## Code Examples

Verified patterns from existing codebase:

### Slack HMAC Signature (from Bolt verify-request.js)
```typescript
// Source: node_modules/@slack/bolt/dist/receivers/verify-request.js
// Format: v0=${createHmac('sha256', signingSecret).update(`v0:${ts}:${body}`).digest('hex')}
import { createHmac } from 'node:crypto';

function computeSlackSignature(signingSecret: string, ts: number, body: string): string {
  return `v0=${createHmac('sha256', signingSecret).update(`v0:${ts}:${body}`).digest('hex')}`;
}
```

### EventDispatcher: Slack headers in enqueue call
```typescript
// Source: twins/slack/src/services/event-dispatcher.ts (modified pattern)
const bodyStr = JSON.stringify(envelope);
const ts = Math.floor(Date.now() / 1000);
const sig = `v0=${createHmac('sha256', this.signingSecret).update(`v0:${ts}:${bodyStr}`).digest('hex')}`;

await this.webhookQueue.enqueue({
  id: randomUUID(),
  topic: `slack:${eventType}`,
  callbackUrl: sub.request_url,
  payload: envelope,
  secret: this.signingSecret,
  headers: {
    'Content-Type': 'application/json',
    'X-Slack-Signature': sig,
    'X-Slack-Request-Timestamp': String(ts),
  },
});
```

### Channel Membership: invite/kick/members
```typescript
// conversations.invite — insert membership rows
fastify.post('/api/conversations.invite', async (request, reply) => {
  const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.invite');
  if (!tokenRecord) return;
  const params = getParams(request);
  const { channel, users } = params;
  if (!channel || !users) return reply.send({ ok: false, error: 'invalid_arguments' });
  const ch = fastify.slackStateManager.getChannel(channel);
  if (!ch) return reply.send({ ok: false, error: 'channel_not_found' });
  // users is comma-separated string or array
  const userList = typeof users === 'string' ? users.split(',') : users;
  for (const uid of userList) {
    fastify.slackStateManager.addChannelMember(channel, uid.trim());
  }
  return { ok: true, channel: formatChannel(ch) };
});

// conversations.members — return real member list
fastify.get('/api/conversations.members', async (request, reply) => {
  const tokenRecord = await checkAuth(fastify, request, reply, 'conversations.members');
  if (!tokenRecord) return;
  const params = getParams(request);
  const members = fastify.slackStateManager.getChannelMembers(params.channel);
  return { ok: true, members, response_metadata: { next_cursor: '' } };
});
```

### Pins: stateful with deduplication
```typescript
// pins.add handler
fastify.post('/api/pins.add', async (request, reply) => {
  if (!authCheck(request, reply, 'pins.add')) return;
  const { channel, timestamp } = (request.body as any) ?? {};
  if (!channel || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
  try {
    fastify.slackStateManager.addPin(channel, timestamp, tokenRecord.user_id);
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.message?.includes('UNIQUE')) {
      return reply.send({ ok: false, error: 'already_pinned' });
    }
    throw e;
  }
  return { ok: true };
});
```

### method-scopes.ts: new entries for Phase 25 methods
```typescript
// Add to METHOD_SCOPES in twins/slack/src/services/method-scopes.ts
// admin.* methods require admin scope
'admin.users.list':              ['admin.users:read'],
'admin.users.invite':            ['admin.users:write'],
'admin.conversations.create':    ['admin.conversations:write'],
'admin.conversations.search':    ['admin.conversations:read'],
'admin.teams.list':              ['admin.teams:read'],
'admin.apps.approve':            ['admin.apps:write'],
// workflows
'workflows.stepCompleted':       [],
'workflows.stepFailed':          [],
'workflows.updateStep':          [],
// stars
'stars.add':                     ['stars:write'],
'stars.list':                    ['stars:read'],
'stars.remove':                  ['stars:write'],
// openid
'openid.connect.token':          ['openid'],
'openid.connect.userInfo':       ['openid'],
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stubs for pins/reactions/views | Stateful with deduplication | Phase 25 | Bolt tests that call `views.update` with a real `view_id` now work |
| Shopify-format HMAC on Slack events | Slack HMAC (`v0=hex`) | Phase 25 | `@slack/bolt` request verification passes without error |
| Relative `response_url` | Absolute `http://…/response-url/:id` | Phase 25 | Bolt apps can POST to the response URL |
| Same URL for events + interactions | Separate interactivity URL | Phase 25 | Bolt `HTTPReceiver` doesn't mix event and interaction delivery |
| 126-method gap in admin/workflows/etc | All 275+ methods registered | Phase 25 | Any `WebClient` call returns `{ ok: true }` instead of transport 404 error |

**Deprecated/outdated:**
- Hardcoded `D_TWIN` DM channel ID: replaced by real DM channel creation in `conversations.open`.
- `reactions.remove` as silent no-op: replaced by actual delete + deduplication error path.

## Open Questions

1. **WebhookQueue body serialization timing**
   - What we know: `EventDispatcher` passes `payload: envelope` (object), and `webhook-delivery.ts` calls `JSON.stringify(delivery.payload)` before signing. The HMAC must be computed on the exact string that will be sent as the request body.
   - What's unclear: If `EventDispatcher` computes the signature before calling `enqueue()`, it must serialize the body to the same string that `deliverWebhook` will serialize it to. `JSON.stringify` is deterministic for a given object, so two calls with the same object will produce the same string.
   - Recommendation: Compute signature in `EventDispatcher` by serializing `envelope` to string first, then pass that string as the body (or pass a pre-computed signature and timestamp in headers, letting `deliverWebhook` use the same string). Simplest fix: compute HMAC in `EventDispatcher` before enqueue and include it in `headers`.

2. **Interactivity URL registration mechanism**
   - What we know: Tests currently register a single URL via `createEventSubscription()`. The Bolt SDK app's `interactivity_request_url` is separate from the `event_subscriptions_request_url`.
   - What's unclear: Do existing Bolt tests already set up separate interactivity URLs, or do they rely on the same URL?
   - Recommendation: Read `slack-bolt-http-receivers.test.ts` lines 200-300 for the interaction-related tests. If they don't set a separate URL, the simplest fix is for the twin to deliver interactions to the same registered URL but use a separate dispatch function that adds Slack interaction-specific headers.

3. **better-sqlite3 error codes**
   - What we know: `better-sqlite3` throws JavaScript `Error` objects with a `.code` property for SQLite errors.
   - What's unclear: Whether the code is `SQLITE_CONSTRAINT_UNIQUE` or `SQLITE_CONSTRAINT` in the version used here (12.6.2).
   - Recommendation: Catch and check `e.message.includes('UNIQUE constraint failed')` as a fallback alongside `e.code === 'SQLITE_CONSTRAINT_UNIQUE'`. Both patterns are safe.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk` |
| Full suite command | `pnpm test:sdk` (single pool, all sdk-verification tests) |
| Twin unit tests | `pnpm -F twins/slack run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-14 | All bound WebClient methods return `{ok: true}` | smoke | `pnpm test:sdk -- --reporter=verbose tests/sdk-verification/sdk/slack-method-coverage.test.ts` | ❌ Wave 0 |
| SLCK-16 | Event delivery includes valid `X-Slack-Signature` header; Bolt verification passes | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-signing.test.ts` | ❌ Wave 0 |
| SLCK-16 | Interaction payload routed to dedicated URL (not event URL) | integration | (same file) | ❌ Wave 0 |
| SLCK-16 | `response_url` is absolute URL | unit | (same file) | ❌ Wave 0 |
| SLCK-17 | `conversations.invite` → `conversations.members` shows new member | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-state-tables.test.ts` | ❌ Wave 0 |
| SLCK-17 | `conversations.open` returns real DM channel ID | integration | (same file) | ❌ Wave 0 |
| SLCK-17 | `views.open` then `views.update` with returned view_id | integration | (same file) | ❌ Wave 0 |
| SLCK-17 | `pins.add` twice returns `already_pinned` | integration | (same file) | ❌ Wave 0 |
| SLCK-17 | `reactions.add` twice returns `already_reacted` | integration | (same file) | ❌ Wave 0 |
| SLCK-17 | `reactions.remove` then count decrements | integration | (same file) | ❌ Wave 0 |
| XCUT-01 | New tables included in reset; reset completes in <100ms | unit | `pnpm -F twins/slack run test` (smoke.test.ts) | ❌ Wave 0 (add to existing smoke.test.ts) |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` (or relevant file)
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/sdk/slack-method-coverage.test.ts` — covers SLCK-14: calls one representative method from each missing family
- [ ] `tests/sdk-verification/sdk/slack-signing.test.ts` — covers SLCK-16: signature header, interaction routing, absolute response_url
- [ ] `tests/sdk-verification/sdk/slack-state-tables.test.ts` — covers SLCK-17: membership, views, pins/reactions deduplication
- [ ] Additional reset coverage assertions in `twins/slack/test/smoke.test.ts` — covers XCUT-01 for new tables

## Sources

### Primary (HIGH confidence)
- `twins/slack/src/state/slack-state-manager.ts` — current table schema, prepared statements, reset pattern
- `twins/slack/src/plugins/web-api/stubs.ts` — stub registration pattern
- `twins/slack/src/plugins/web-api/conversations.ts` — existing invite/kick/members/open implementations
- `twins/slack/src/plugins/web-api/pins.ts` — current stateless pins implementation
- `twins/slack/src/plugins/web-api/reactions.ts` — current reactions implementation (has addReaction, missing removeReaction/deduplication)
- `twins/slack/src/plugins/web-api/views.ts` — current ephemeral views implementation
- `twins/slack/src/services/event-dispatcher.ts` — current WebhookQueue.enqueue call showing wrong header format
- `twins/slack/src/services/interaction-handler.ts` line 59 — relative response_url bug confirmed
- `node_modules/@slack/bolt/dist/receivers/verify-request.js` — authoritative Bolt signature verification contract
- `tools/sdk-surface/manifests/slack-web-api@7.14.1.json` — 322 bound API methods enumerated; 129 missing families confirmed

### Secondary (MEDIUM confidence)
- `tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts` — existing HMAC signing test pattern (`signRequest()` helper confirmed)
- `.planning/STATE.md` key decisions — "No new runtime dependencies", "Slack state tables: every new SQLite table must be in a SLACK_TABLES constant iterated by reset()"

### Tertiary (LOW confidence)
- The 126-method gap count from REQUIREMENTS.md aligns with the manifest analysis showing ~129 missing methods (minor discrepancy due to sub-namespace counting in original count)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing dependencies, no new packages
- Architecture (stubs): HIGH — `stubs.ts` pattern is established and proven
- Architecture (signing): HIGH — Bolt source code verified, exact format confirmed
- Architecture (state tables): HIGH — same pattern as Phase 24's `app_subscriptions` table
- Architecture (deduplication): HIGH — `UNIQUE` constraint + `SQLITE_CONSTRAINT` error is standard SQLite/better-sqlite3 pattern
- Pitfalls: HIGH — all confirmed by direct code inspection

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable codebase, no fast-moving external dependencies)
