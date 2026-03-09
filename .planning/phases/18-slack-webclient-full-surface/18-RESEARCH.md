# Phase 18: Slack WebClient Full Surface - Research

**Researched:** 2026-03-09
**Domain:** `@slack/web-api` WebClient method families, Slack twin expansion, coverage ledger update
**Confidence:** HIGH

## Summary

Phase 18 expands the Slack twin from its current 8-method footprint (auth.test, api.test, chat.postMessage, chat.update, conversations.list, conversations.info, conversations.history, users.list, users.info) to full coverage of the 271-method `@slack/web-api` surface using a three-tier strategy. The twin, test infrastructure, and coverage ledger pattern are all already working from Phases 13-14. This phase is additive: new Fastify route plugins, new test files, and LIVE_SYMBOLS entries in the coverage generator.

The WebClient base behaviors — `apiCall`, `paginate`, `filesUploadV2`, `chatStream`, retry handling, and rate-limit handling — are not separate endpoint-level features. They are SDK-level behaviors tested by exercising the specific endpoints they depend on. `paginate` is tested by calling conversations.list with multiple pages; `filesUploadV2` is tested by exercising the three-endpoint sequence (files.getUploadURLExternal + external upload PUT + files.completeUploadExternal); `chatStream` is tested via chat.startStream/appendStream/stopStream; retry behavior is tested by configuring the twin's error simulator to return 429 once then succeed.

The tiering strategy is: Tier 1 (full live tests with correct shapes) covers chat (13 methods), conversations (28 methods), users (12 methods), reactions (4 methods), pins (3 methods), auth (3 methods), views (4 methods), plus the base behaviors. Tier 2 (stub: returns `{ ok: true }` with minimal valid shape, no state) covers files (16 methods), search (3 methods), reminders (5 methods). Tier 3 (deferred: manifest entry with `"tier": "deferred"`) covers all 95 admin.* methods. Everything else in the manifest (slackLists, team, apps, usergroups, etc.) is addressed using the same coverage system — each symbol is classified as live, stub, or deferred before phase gate.

**Primary recommendation:** Add new Fastify plugins for each Tier 1 family following the established `auth.ts`/`chat.ts`/`conversations.ts`/`users.ts` patterns (token check, rate limit, error sim, then handler). For Tier 2, create a single `stubs.ts` plugin that handles all 24 stub methods returning `{ ok: true }`. Update `DEFAULT_RATE_TIERS` in `rate-limiter.ts` with Tier 1 methods. Update `LIVE_SYMBOLS` in `generate-report.ts`. Run `pnpm coverage:generate` after each wave.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-07 | WebClient base behaviors (apiCall, paginate, filesUploadV2, ChatStreamer, retries, rate-limit handling) pass against the Slack twin | apiCall is exercised by all method tests. paginate uses `response_metadata.next_cursor` which existing conversations.list already returns. filesUploadV2 requires three twin endpoints. chatStream requires chat.startStream/appendStream/stopStream. Retry requires error simulator to return 429-then-200. |
| SLCK-08 | Every bound method in the pinned `@slack/web-api` package maps to a declared coverage entry (live, stub, or deferred) | 271 methods in manifest. Tier 1 (~60 methods full live coverage), Tier 2 (24 methods stub), Tier 3 (95 admin methods deferred), plus smaller families (slackLists, team, apps, etc.) classified in LIVE_SYMBOLS or deferred. |
</phase_requirements>

---

## Standard Stack

### Core (all pre-existing — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@slack/web-api` | 7.14.1 | SDK under test | Pinned at workspace root devDependencies |
| `fastify` | ^5.x | Slack twin HTTP server | All existing plugins use this pattern |
| `vitest` | ^3.0.0 | Test runner | Established in sdk-verification workspace |
| `better-sqlite3` | (transitive) | SlackStateManager storage | All Slack twin state uses this |

### No new dependencies
Phase 18 adds no new npm packages. All routes follow existing plugin patterns. All tests follow the existing `createSlackClient` + `seedSlackBotToken` + `resetSlack` pattern.

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
twins/slack/src/plugins/web-api/
├── auth.ts             (exists — auth.test, api.test)
├── chat.ts             (exists — chat.postMessage, chat.update)
├── conversations.ts    (exists — conversations.list, .info, .history)
├── users.ts            (exists — users.list, .info)
├── reactions.ts        (NEW — Tier 1: reactions.add/get/list/remove)
├── pins.ts             (NEW — Tier 1: pins.add/list/remove)
├── views.ts            (NEW — Tier 1: views.open/publish/push/update)
├── files.ts            (NEW — Tier 1 base: filesUploadV2 3-endpoint chain; rest Tier 2)
├── stubs.ts            (NEW — Tier 2: search, reminders, + misc stub methods)
└── [family].ts         (NEW per family as needed for Tier 1 expansion)

tests/sdk-verification/sdk/
├── slack-auth-gateway.test.ts   (exists — auth.test, api.test)
├── slack-webclient-base.test.ts (NEW — SLCK-07: apiCall, paginate, filesUploadV2, chatStream, retry, rate-limit)
├── slack-chat.test.ts           (NEW — chat family Tier 1)
├── slack-conversations.test.ts  (NEW — conversations family Tier 1)
├── slack-users.test.ts          (NEW — users family Tier 1)
├── slack-reactions.test.ts      (NEW — reactions family Tier 1)
├── slack-pins.test.ts           (NEW — pins family Tier 1)
├── slack-views.test.ts          (NEW — views family Tier 1)
└── slack-stubs-smoke.test.ts    (NEW — Tier 2 stubs smoke test)
```

### Pattern 1: Tier 1 Plugin (Full Implementation)
**What:** Full Fastify plugin with token validation, rate limiting, error simulation, state reads/writes, and correct response shape.
**When to use:** All chat, conversations, users, reactions, pins, auth, views family methods.
**Template based on existing plugins:**

```typescript
// Source: twins/slack/src/plugins/web-api/reactions.ts (new file following existing pattern)
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { extractToken } from '../../services/token-validator.js';
import type { SlackStateManager } from '../../state/slack-state-manager.js';
import type { SlackRateLimiter } from '../../services/rate-limiter.js';

const reactionsPlugin: FastifyPluginAsync = async (fastify) => {
  // Shared auth check helper (inline — matches existing plugin style)
  function authCheck(request: FastifyRequest, reply: any, method: string) {
    const token = extractToken(request);
    if (!token) { reply.status(200).send({ ok: false, error: 'not_authed' }); return null; }
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) { reply.status(200).send({ ok: false, error: 'invalid_auth' }); return null; }
    const limited = fastify.rateLimiter.check(method, token);
    if (limited) { reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' }); return null; }
    const errorConfig = fastify.slackStateManager.getErrorConfig(method);
    if (errorConfig) {
      const body = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
      reply.status(errorConfig.status_code ?? 200).send(body); return null;
    }
    return { token, tokenRecord };
  }

  // POST /api/reactions.add
  fastify.post('/api/reactions.add', async (request, reply) => {
    const auth = authCheck(request, reply, 'reactions.add');
    if (!auth) return;
    const { channel, name, timestamp } = (request.body as any) ?? {};
    if (!channel || !name || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
    fastify.slackStateManager.addReaction(timestamp, channel, auth.tokenRecord.user_id ?? 'U_BOT_TWIN', name);
    return { ok: true };
  });

  // ... reactions.get, reactions.list, reactions.remove follow same pattern
};
```

### Pattern 2: Tier 2 Stub Plugin
**What:** Minimal implementation returning `{ ok: true }` (plus required fields for pagination-enabled endpoints). No state reads or writes. Handles auth check only to satisfy SDK token validation.
**When to use:** files.*, search.*, reminders.*

```typescript
// Source: twins/slack/src/plugins/web-api/stubs.ts (new file)
import type { FastifyPluginAsync } from 'fastify';
import { extractToken } from '../../services/token-validator.js';

const stubsPlugin: FastifyPluginAsync = async (fastify) => {
  // Helper: return { ok: true } after token check
  function stubHandler(method: string) {
    return async (request: any, reply: any) => {
      const token = extractToken(request);
      if (!token) return reply.status(200).send({ ok: false, error: 'not_authed' });
      const tokenRecord = fastify.slackStateManager.getToken(token);
      if (!tokenRecord) return reply.status(200).send({ ok: false, error: 'invalid_auth' });
      // Stub response — paginated stubs must include response_metadata for WebClient.paginate()
      return { ok: true, response_metadata: { next_cursor: '' } };
    };
  }

  // files.* stubs (not the filesUploadV2 chain — those are in files.ts)
  fastify.post('/api/files.delete', stubHandler('files.delete'));
  fastify.post('/api/files.info', stubHandler('files.info'));
  fastify.post('/api/files.list', stubHandler('files.list'));
  // ... etc
};
```

### Pattern 3: filesUploadV2 Three-Endpoint Chain
**What:** `filesUploadV2` in the SDK calls three twin endpoints in sequence: `files.getUploadURLExternal`, then a PUT to the `upload_url`, then `files.completeUploadExternal`. The twin must serve all three.
**Sequence verified from SDK source:**

```typescript
// Source: third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts line 559
// filesUploadV2() flow:
//   1. this.files.getUploadURLExternal({ filename, length }) → { upload_url, file_id }
//   2. fetch(upload_url, { method: 'PUT', body: fileData }) → 200 OK
//   3. this.files.completeUploadExternal({ files: [{ id, title }], channel_id }) → { files: [...] }

// Twin implementation for files.ts plugin:
// POST /api/files.getUploadURLExternal → { ok: true, upload_url: '/api/_upload/:id', file_id: 'F_...' }
// PUT /api/_upload/:id → 200 OK (stores nothing, just returns 200)
// POST /api/files.completeUploadExternal → { ok: true, files: [{ id: '...', title: '...' }] }
```

**Critical:** The `upload_url` returned by `getUploadURLExternal` must be an absolute URL pointing to the twin. Use the twin's base URL from an env variable OR make the upload_url a path (`/api/_upload/...`) and have the SDK rewrite it. Since the SDK uses the absolute URL directly (not through `slackApiUrl`), the twin must return an absolute URL for the upload endpoint.

The simplest approach: since `allowAbsoluteUrls` defaults to `true` in WebClient, returning `http://127.0.0.1:PORT/api/_upload/FILEID` as the `upload_url` will work. The twin needs to know its own port. Use a Fastify hook to derive the URL from the incoming request's host header, or use an env variable `SLACK_API_URL` (already set by globalSetup).

### Pattern 4: Pagination Compatibility
**What:** The SDK's `paginate` method reads `response_metadata.next_cursor` from each page response. If `next_cursor` is empty string or undefined, pagination stops.
**Why it matters:** The existing `conversations.list` already returns the correct format. All new list endpoints must follow the same pattern.

```typescript
// Required pagination response shape (source: WebClient.ts line 967-973)
// nextCursor = '' signals no more pages
{
  ok: true,
  items: [...],  // family-specific array name
  response_metadata: { next_cursor: nextCursor },  // empty string = done
}
```

### Pattern 5: Rate Tier Assignments for New Methods
**What:** `DEFAULT_RATE_TIERS` in `rate-limiter.ts` must be updated for all new Tier 1 methods. Unknown methods are silently allowed (not rate-limited) but should be explicitly registered.
**Source:** Slack API documentation tier assignments.

Tier assignments for Phase 18 additions:
```typescript
// Add to DEFAULT_RATE_TIERS in twins/slack/src/services/rate-limiter.ts
// Tier 1 (1 req/min → twin uses 20/min matching existing auth.test)
'auth.revoke': { tier: 1, requestsPerMinute: 20 },
'auth.teams.list': { tier: 2, requestsPerMinute: 20 },
// Tier 2 (20 req/min)
'conversations.create': { tier: 2, requestsPerMinute: 20 },
'conversations.join': { tier: 2, requestsPerMinute: 20 },
'conversations.members': { tier: 2, requestsPerMinute: 20 },
'conversations.open': { tier: 3, requestsPerMinute: 50 },
// Tier 3 (50 req/min)
'reactions.add': { tier: 3, requestsPerMinute: 50 },
'reactions.remove': { tier: 3, requestsPerMinute: 50 },
'reactions.get': { tier: 3, requestsPerMinute: 50 },
'reactions.list': { tier: 2, requestsPerMinute: 20 },
'pins.add': { tier: 2, requestsPerMinute: 20 },
'pins.list': { tier: 2, requestsPerMinute: 20 },
'pins.remove': { tier: 2, requestsPerMinute: 20 },
'views.open': { tier: 4, requestsPerMinute: 100 },
'views.publish': { tier: 4, requestsPerMinute: 100 },
'views.push': { tier: 4, requestsPerMinute: 100 },
'views.update': { tier: 4, requestsPerMinute: 100 },
// ... etc
```

### Pattern 6: views.* State — No Modal State Needed
**What:** `views.open`, `views.push`, `views.update` require a `trigger_id` but do NOT require persistent modal state in the twin for SDK conformance. The SDK only checks `ok: true` and the `view` object in the response.
**Response shape for views.open (from ViewsOpenResponse type):**
```typescript
{
  ok: true,
  view: {
    id: 'V_TWIN_VIEW',
    type: 'modal',
    title: { type: 'plain_text', text: request.body.view?.title?.text ?? 'Modal' },
    blocks: request.body.view?.blocks ?? [],
    callback_id: request.body.view?.callback_id ?? '',
    state: { values: {} },
  }
}
```

### Pattern 7: Retry Behavior Test
**What:** Testing WebClient retry on 429 requires the twin to return 429 once then 200.
**Implementation:** Use the error simulator with a one-shot pattern OR configure error simulation for the first call only. The simpler approach: use a method-level error count in the twin's admin state, OR just verify the SDK's `rejectRateLimitedCalls: false` behavior by configuring the error simulator to return 429 and using `retryConfig: rapidRetryPolicy` (0ms timeouts from sdk source) in the test WebClient.

```typescript
// From retry-policies.ts in sdk source:
export const rapidRetryPolicy: RetryOptions = { minTimeout: 0, maxTimeout: 1 };

// In test:
const client = new WebClient(token, {
  slackApiUrl: slackApiUrl + '/api/',
  retryConfig: { retries: 1, minTimeout: 0, maxTimeout: 1 },
  rejectRateLimitedCalls: false,
});
// Configure twin to return 429 exactly once for auth.test via error simulator
await fetch(`${slackApiUrl}/admin/errors`, { method: 'POST', ... });
// client.auth.test() triggers retry — SDK handles the 429 transparently
```

**Note on one-shot error simulation:** The current error simulator in `SlackStateManager` does not support one-shot (fire-once) semantics — `getErrorConfig` returns the same config every time until cleared. For retry testing, the test must:
1. Configure error simulator to return 429
2. Use `rejectRateLimitedCalls: true` to get an immediate throw (test that 429 IS returned)
3. Clear error simulator
4. Verify normal call succeeds

OR use a `rapidRetryPolicy` client and verify that the second attempt succeeds after clearing the error via a second admin call — but this is racy. The simplest valid approach: test that `{ ok: false, error: 'ratelimited' }` is returned when the error simulator is set, then test that normal calls succeed when it is not. Full auto-retry testing (SDK waits N seconds) is impractical without one-shot semantics or a configurable `Retry-After: 0` response.

### Pattern 8: chat.* Expansion
**What:** The existing `chat.ts` has `chat.postMessage` and `chat.update`. Phase 18 adds the remaining 11 chat methods.
**New methods to add:**
- `chat.delete` — requires `ts` and `channel`; removes message from state
- `chat.postEphemeral` — returns `{ ok: true, message_ts: generateMessageTs() }` (no state needed)
- `chat.getPermalink` — returns `{ ok: true, permalink: 'https://twin-workspace.slack.com/archives/CHANNEL/pTS' }`
- `chat.meMessage` — creates message with subtype `me_message`
- `chat.scheduleMessage` — returns `{ ok: true, channel, scheduled_message_id: generateId(), post_at }`
- `chat.scheduledMessages.list` — returns `{ ok: true, scheduled_messages: [], response_metadata: { next_cursor: '' } }`
- `chat.deleteScheduledMessage` — returns `{ ok: true }`
- `chat.unfurl` — returns `{ ok: true }`
- `chat.startStream` — returns `{ ok: true, ts: generateMessageTs() }` (no real stream state needed)
- `chat.appendStream` — returns `{ ok: true }`
- `chat.stopStream` — returns `{ ok: true }`

### Anti-Patterns to Avoid
- **Implementing admin.* methods in Phase 18:** All 95 admin.* methods are Tier 3 deferred. Do NOT implement any. Their manifest entries remain `"tier": "deferred"`.
- **Returning HTTP non-200 for Slack errors:** All error responses use HTTP 200 with `{ ok: false, error: '...' }`. Only rate limits return 429.
- **Stateful views:** views.open/push/update do not need to store modal state. Return a synthetic view object.
- **filesUploadV2 with a non-absolute upload_url:** The SDK calls the upload_url directly using axios, bypassing slackApiUrl. The upload_url must be an absolute HTTP URL pointing to the twin.
- **Forgetting GET+POST dual registration:** The existing conversations.ts pattern registers both GET (query params) and POST (body) handlers for read methods. New Tier 1 read methods must follow the same pattern where appropriate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paginated list cursor | Custom cursor format | `Buffer.from(id).toString('base64')` — matches existing conversations.ts pattern | Already established; tests depend on this format |
| Token extraction | New auth middleware | `extractToken(request)` from `services/token-validator.js` | Used by every existing plugin |
| Rate limiting | New limiter | `fastify.rateLimiter.check(method, token)` | Already decorated on fastify instance |
| Error simulation | New error injection | `fastify.slackStateManager.getErrorConfig(method)` | Already implemented and tested |
| Message timestamp | Custom generator | `generateMessageTs()` from `services/id-generator.js` | Already used in chat.ts |
| ID generation | Custom IDs | `generateChannelId()`, `generateUserId()` etc. from `id-generator.js` | Deterministic test-friendly IDs |
| Reactions storage | New table | `slackStateManager.addReaction()` and `listReactions()` | Already in SlackStateManager |

---

## Common Pitfalls

### Pitfall 1: filesUploadV2 upload_url Must Be Absolute
**What goes wrong:** `filesUploadV2` calls `this.makeRequest(upload_url, ...)` which calls `this.deriveRequestUrl(url)`. If `upload_url` starts with `http://` and `allowAbsoluteUrls: true` (default), it goes directly to the URL without prepending slackApiUrl. If the URL is relative (e.g., `/api/_upload/F123`), it becomes `http://host/api//api/_upload/F123` — double path.
**How to avoid:** Return an absolute URL from `files.getUploadURLExternal`: `http://127.0.0.1:${PORT}/api/_upload/${file_id}`. The twin should construct this from the `SLACK_API_URL` env var (already set by globalSetup).
**Warning signs:** `ECONNREFUSED` on the upload step, or 404 with double-path URL.

### Pitfall 2: ChatStreamer Uses chat.startStream/appendStream/stopStream
**What goes wrong:** Testing `chatStream()` requires the twin to serve `chat.startStream`, `chat.appendStream`, and `chat.stopStream`. If only `chat.startStream` is implemented, `chatStream.append()` fails with 404 on `chat.appendStream`.
**How to avoid:** Implement all three stream endpoints together. `startStream` must return `{ ok: true, ts: '...' }` — the `ts` value from `startStream` response is stored by `ChatStreamer` and passed as the `ts` param to subsequent `appendStream`/`stopStream` calls.
**Source:** `chat-stream.ts` line ~80: `this.streamTs = res.ts; this.state = 'in_progress';`
**Warning signs:** `Cannot read properties of undefined (reading 'ts')` in ChatStreamer.

### Pitfall 3: views.* Requires trigger_id in Request Body
**What goes wrong:** `views.open` requires a `trigger_id` parameter. The SDK sends it, but the twin may return `invalid_arguments` if it validates too strictly.
**How to avoid:** Accept `trigger_id` as a required field but do minimal validation. Return `{ ok: false, error: 'invalid_arguments' }` only if `view` is missing (not if `trigger_id` is absent — the SDK always sends it from valid test payloads).

### Pitfall 4: reactions.get Response Shape Is Non-trivial
**What goes wrong:** `reactions.get` returns the message with its reactions grouped, not a flat list. The SDK's `ReactionsGetResponse` expects `{ ok: true, type: 'message', channel, message: { reactions: [{name, count, users}] } }`.
**How to avoid:** Read message from state, aggregate reactions from `listReactions(ts)`, group by reaction name, return the expected shape.

### Pitfall 5: Conversations Tier 1 Has 28 Methods — Not All Need State
**What goes wrong:** Trying to implement full stateful behavior for all 28 conversations methods creates scope explosion. Methods like `conversations.acceptSharedInvite`, `conversations.approveSharedInvite`, `conversations.declineSharedInvite` are Slack Connect features with no realistic twin state.
**How to avoid:** For conversations methods involving Slack Connect (invite sharing, external permissions, connect invites): return `{ ok: true }` or a minimal stub response. Full semantic behavior is only needed for the core methods: `create`, `join`, `leave`, `archive`, `unarchive`, `rename`, `invite`, `kick`, `open`, `close`, `mark`, `setPurpose`, `setTopic`, `members`, `replies`.

### Pitfall 6: Rate Tier for New Methods Must Be Added Before Tests Run
**What goes wrong:** If a new method is not in `DEFAULT_RATE_TIERS`, the rate limiter silently allows unlimited calls. This is fine for tests, but the coverage ledger should accurately reflect that rate limiting is configured. More importantly, tests that verify rate-limit behavior for new methods will NOT fail even if the twin is misconfigured.
**How to avoid:** Add all Tier 1 method names to `DEFAULT_RATE_TIERS` before adding tests.

### Pitfall 7: Coverage Ledger Keys Must Match Manifest Symbol Paths Exactly
**What goes wrong:** Adding `'@slack/web-api@7.14.1/WebClient.reactions.add': 'sdk/slack-reactions.test.ts'` to `LIVE_SYMBOLS` has no effect if the manifest records the member as `reactions.add` (without `WebClient.` prefix) or vice versa.
**How to avoid:** The manifest shows `WebClient` as a ClassDeclaration with `members: ['reactions.add', ...]`. The `generate-report.ts` script builds the member path as `WebClient.reactions.add` (symbolName + '.' + member). So LIVE_SYMBOLS keys for WebClient methods are `@slack/web-api@7.14.1/WebClient.reactions.add`. Verify by checking `manifest.symbols.WebClient.members` against the key pattern in `generate-report.ts` lines ~90-100.

---

## Code Examples

### Reactions Plugin (Tier 1)

```typescript
// Source: pattern from twins/slack/src/plugins/web-api/conversations.ts
// POST /api/reactions.add
fastify.post('/api/reactions.add', async (request, reply) => {
  const token = extractToken(request);
  if (!token) return reply.send({ ok: false, error: 'not_authed' });
  const tokenRecord = fastify.slackStateManager.getToken(token);
  if (!tokenRecord) return reply.send({ ok: false, error: 'invalid_auth' });
  const limited = fastify.rateLimiter.check('reactions.add', token);
  if (limited) return reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' });
  const errorConfig = fastify.slackStateManager.getErrorConfig('reactions.add');
  if (errorConfig) { const body = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' }; return reply.status(errorConfig.status_code ?? 200).send(body); }
  const { channel, name, timestamp } = (request.body as any) ?? {};
  if (!channel || !name || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
  fastify.slackStateManager.addReaction(timestamp, channel, tokenRecord.user_id ?? 'U_BOT_TWIN', name);
  return { ok: true };
});

// POST /api/reactions.get
fastify.post('/api/reactions.get', async (request, reply) => {
  // ... auth/rate/error checks ...
  const { channel, timestamp } = (request.body as any) ?? {};
  if (!channel || !timestamp) return reply.send({ ok: false, error: 'invalid_arguments' });
  const rawReactions = fastify.slackStateManager.listReactions(timestamp);
  // Group by name: [{ name, count, users }]
  const reactionMap = new Map<string, { count: number; users: string[] }>();
  for (const r of rawReactions) {
    const entry = reactionMap.get(r.reaction) ?? { count: 0, users: [] };
    entry.count++; entry.users.push(r.user_id);
    reactionMap.set(r.reaction, entry);
  }
  const reactions = Array.from(reactionMap.entries()).map(([name, data]) => ({ name, count: data.count, users: data.users }));
  return { ok: true, type: 'message', channel, message: { reactions } };
});
```

### filesUploadV2 Twin Endpoints

```typescript
// Source: WebClient.ts line 587-610 — fetchAllUploadURLExternal
// The upload_url must be an absolute URL. Twin constructs from known base.

// POST /api/files.getUploadURLExternal
fastify.post('/api/files.getUploadURLExternal', async (request, reply) => {
  // ... auth checks ...
  const { filename } = (request.body as any) ?? {};
  const file_id = `F_${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
  const baseUrl = process.env.SLACK_API_URL ?? `http://127.0.0.1:${fastify.addresses()[0].port}`;
  return { ok: true, file_id, upload_url: `${baseUrl}/api/_upload/${file_id}` };
});

// PUT /api/_upload/:file_id — binary upload endpoint (no auth required per SDK source)
fastify.put('/api/_upload/:file_id', async () => {
  // Just accept the upload and return 200. No state storage needed for conformance.
  return {}; // Fastify returns 200 with empty body
});

// POST /api/files.completeUploadExternal
fastify.post('/api/files.completeUploadExternal', async (request, reply) => {
  // ... auth checks ...
  const { files } = (request.body as any) ?? {};
  return { ok: true, files: (files ?? []).map((f: any) => ({ id: f.id, title: f.title ?? 'Uploaded file' })) };
});
```

### Paginate Test Pattern

```typescript
// Source: WebClient.ts line 433 — paginate overloads
// Test: paginate over conversations.list with 2 pages of 1 item each

it('paginate iterates over pages via response_metadata.next_cursor', async () => {
  // Seed 3 channels so we get 2 pages with limit=2
  await seedChannels(3);
  const client = createSlackClient(token);
  const pages: any[] = [];
  for await (const page of client.paginate('conversations.list', { limit: 2 })) {
    pages.push(page);
  }
  expect(pages.length).toBeGreaterThanOrEqual(2);
  expect(pages[0].channels).toHaveLength(2);
});
```

### Coverage Ledger Update Pattern (LIVE_SYMBOLS)

```typescript
// Source: tests/sdk-verification/coverage/generate-report.ts — LIVE_SYMBOLS map
// Format: '@slack/web-api@7.14.1/WebClient.{method.path}': 'sdk/{testFile}.test.ts'

// After adding slack-reactions.test.ts:
'@slack/web-api@7.14.1/WebClient.reactions.add': 'sdk/slack-reactions.test.ts',
'@slack/web-api@7.14.1/WebClient.reactions.remove': 'sdk/slack-reactions.test.ts',
'@slack/web-api@7.14.1/WebClient.reactions.get': 'sdk/slack-reactions.test.ts',
'@slack/web-api@7.14.1/WebClient.reactions.list': 'sdk/slack-reactions.test.ts',
// Base behaviors (from slack-webclient-base.test.ts):
'@slack/web-api@7.14.1/WebClient.apiCall': 'sdk/slack-webclient-base.test.ts',
'@slack/web-api@7.14.1/WebClient.paginate': 'sdk/slack-webclient-base.test.ts',
'@slack/web-api@7.14.1/WebClient.filesUploadV2': 'sdk/slack-webclient-base.test.ts',
'@slack/web-api@7.14.1/WebClient.chatStream': 'sdk/slack-webclient-base.test.ts',
// ChatStreamer class (separate manifest symbol):
'@slack/web-api@7.14.1/ChatStreamer': 'sdk/slack-webclient-base.test.ts',
'@slack/web-api@7.14.1/ChatStreamer.append': 'sdk/slack-webclient-base.test.ts',
'@slack/web-api@7.14.1/ChatStreamer.stop': 'sdk/slack-webclient-base.test.ts',
```

### Stub Verification Pattern

```typescript
// Source: pattern for Tier 2 smoke test
// Verify stub methods return { ok: true } without error

it('search.messages returns ok:true (stub)', async () => {
  const client = createSlackClient(token);
  const result = await client.search.messages({ query: 'hello' });
  expect(result.ok).toBe(true);
});

it('reminders.add returns ok:true (stub)', async () => {
  const client = createSlackClient(token);
  const result = await client.reminders.add({ text: 'Do a thing', time: '1234567890' });
  expect(result.ok).toBe(true);
});
```

---

## Tier Classification Reference

### Tier 1 — Full Live Tests (~60 methods)

| Family | Methods | Count | Test File |
|--------|---------|-------|-----------|
| auth | auth.test (exists), api.test (exists), auth.revoke, auth.teams.list | 4 | slack-auth-gateway.test.ts + slack-webclient-base.test.ts |
| chat | postMessage (exists), update (exists), delete, postEphemeral, getPermalink, meMessage, scheduleMessage, scheduledMessages.list, deleteScheduledMessage, unfurl, startStream, appendStream, stopStream | 13 | slack-chat.test.ts |
| conversations | list (exists), info (exists), history (exists), create, join, leave, archive, unarchive, rename, invite, kick, open, close, mark, setPurpose, setTopic, members, replies + 10 stub-shaped Slack Connect methods | 28 | slack-conversations.test.ts |
| users | list (exists), info (exists), conversations, getPresence, lookupByEmail, profile.get, profile.set + 5 others | 12 | slack-users.test.ts |
| reactions | add, get, list, remove | 4 | slack-reactions.test.ts |
| pins | add, list, remove | 3 | slack-pins.test.ts |
| views | open, publish, push, update | 4 | slack-views.test.ts |
| **Base behaviors** | apiCall, paginate, filesUploadV2, chatStream | 4 manifest members | slack-webclient-base.test.ts |

### Tier 2 — Stubs (~24 methods)

| Family | Methods | Count |
|--------|---------|-------|
| files | delete, info, list, remote.add, remote.info, remote.list, remote.remove, remote.share, remote.update, revokePublicURL, sharedPublicURL, upload (deprecated), comments.delete | 13 |
| search | all, files, messages | 3 |
| reminders | add, complete, delete, info, list | 5 |
| filesUploadV2 chain | getUploadURLExternal, completeUploadExternal | 2 (Tier 1 via base test) |
| misc stubs | bots.info, emoji.list, migration.exchange, tooling.tokens.rotate | 4 |

### Tier 3 — Deferred (95 methods)
All `admin.*` methods remain `"tier": "deferred"` in the coverage report. No twin routes, no tests.

### Remaining Families — Classify Before Phase Gate
The following families (~87 manifest members) must be explicitly classified as live, stub, or deferred before the phase gate:

| Family | Count | Recommended Classification |
|--------|-------|---------------------------|
| slackLists | 12 | deferred |
| team | 9 | stub (team.info minimal) |
| apps | 8 | deferred (apps.connections.open is Phase 19) |
| usergroups | 7 | stub |
| workflows | 7 | deferred |
| calls | 6 | stub |
| canvases | 6 | deferred |
| dnd | 5 | stub |
| bookmarks | 4 | stub |
| stars | 3 | deferred (deprecated per Slack docs) |
| oauth | 3 | deferred (Phase 19) |
| functions | 2 | stub |
| openid | 2 | deferred |
| rtm | 2 | deferred |
| assistant | 3 | stub |
| dialog | 1 | stub |
| entity | 1 | deferred |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Slack twin serves 8 Web API methods | Slack twin must serve ~70+ methods (Phase 18) | Phase 18 | Requires new plugin files per family |
| Coverage ledger has 2 live Slack symbols | Must have all 392 WebClient members classified (live/stub/deferred) | Phase 18 | generate-report.ts LIVE_SYMBOLS expansion |
| Single stubs handled by returning 404 | Stubs return `{ ok: true }` (HTTP 200, Slack convention) | Phase 18 | Slack SDK treats any non-200 as a transport error |

**Current twin state at Phase 18 start:**
- `auth.ts`: auth.test, api.test (live since Phase 14)
- `chat.ts`: chat.postMessage, chat.update (live since Phase 5)
- `conversations.ts`: conversations.list, .info, .history (live since Phase 5)
- `users.ts`: users.list, .info (live since Phase 5)
- All other methods: 404 (no routes registered)

---

## Open Questions

1. **filesUploadV2 upload_url construction without a known port**
   - What we know: The twin binds to port 0 (random) in tests. `SLACK_API_URL` env var is set by globalSetup. The upload_url must be absolute.
   - What's unclear: The files.ts plugin does not have access to `process.env.SLACK_API_URL` directly at route handler time — it needs to be read per-request.
   - Recommendation: Read `process.env.SLACK_API_URL` inside the route handler (not at module load time, since the env var is set after twin boot). `process.env.SLACK_API_URL` is reliably set by globalSetup for all workers given `singleFork: true` configuration.

2. **conversations.members response — does it need pagination?**
   - What we know: `ConversationsMembersResponse` has `response_metadata.next_cursor`. The SDK's paginate method stops when next_cursor is empty.
   - What's unclear: Whether any Phase 18 test exercises cursor pagination for members vs. just asserting the first page.
   - Recommendation: Return first page only with `next_cursor: ''` for simplicity. If a paginate test is written for members, add a `listChannelMembers` query to `SlackStateManager` (or use an in-memory list from channel creation fixtures).

3. **SlackStateManager missing a pins table**
   - What we know: `slackStateManager.addReaction()` and `listReactions()` exist. There is no `addPin()` or `listPins()` method.
   - What's unclear: Whether pins need to be persisted in state or can be stubbed.
   - Recommendation: For SLCK-07/08 conformance, `pins.add/remove/list` only need to return `{ ok: true }` / `{ ok: true, items: [] }`. No state table needed for Phase 18 — add a pins table in Phase 19 if Bolt integration tests require it.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `tests/sdk-verification/vitest.config.ts` (exists) |
| Quick run command | `pnpm --filter sdk-verification test -- slack-webclient-base` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-07 | apiCall works against twin | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ Wave 0 |
| SLCK-07 | paginate iterates cursor pages | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ Wave 0 |
| SLCK-07 | filesUploadV2 completes 3-step upload | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ Wave 0 |
| SLCK-07 | chatStream append/stop sequence | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ Wave 0 |
| SLCK-07 | retry: SDK retries on 429 | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ Wave 0 |
| SLCK-07 | rate-limit: twin returns 429 when limit exceeded | live SDK test | `pnpm test:sdk -- slack-webclient-base` | ❌ Wave 0 |
| SLCK-08 | chat family (13 methods) all return ok:true | live SDK test | `pnpm test:sdk -- slack-chat` | ❌ Wave 0 |
| SLCK-08 | conversations family (28 methods) core behavior | live SDK test | `pnpm test:sdk -- slack-conversations` | ❌ Wave 0 |
| SLCK-08 | users family (12 methods) | live SDK test | `pnpm test:sdk -- slack-users` | ❌ Wave 0 |
| SLCK-08 | reactions family (4 methods) with correct shapes | live SDK test | `pnpm test:sdk -- slack-reactions` | ❌ Wave 0 |
| SLCK-08 | pins family (3 methods) | live SDK test | `pnpm test:sdk -- slack-pins` | ❌ Wave 0 |
| SLCK-08 | views family (4 methods) with view object in response | live SDK test | `pnpm test:sdk -- slack-views` | ❌ Wave 0 |
| SLCK-08 | Tier 2 stubs return ok:true (smoke) | smoke test | `pnpm test:sdk -- slack-stubs-smoke` | ❌ Wave 0 |
| SLCK-08 | coverage-report.json: all WebClient members classified | manual | `pnpm coverage:generate` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk` on the affected test file only (e.g., `-- slack-reactions`)
- **Per wave merge:** Full `pnpm test:sdk`
- **Phase gate:** Full suite green + `pnpm coverage:generate` run + every WebClient member has a non-null tier before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `twins/slack/src/plugins/web-api/reactions.ts` — reactions.add/get/list/remove (Tier 1)
- [ ] `twins/slack/src/plugins/web-api/pins.ts` — pins.add/list/remove (Tier 1)
- [ ] `twins/slack/src/plugins/web-api/views.ts` — views.open/publish/push/update (Tier 1)
- [ ] `twins/slack/src/plugins/web-api/files.ts` — filesUploadV2 3-endpoint chain + Tier 2 file stubs
- [ ] `twins/slack/src/plugins/web-api/stubs.ts` — Tier 2 search/reminders/misc stubs
- [ ] `twins/slack/src/plugins/web-api/chat.ts` updated — add 11 new chat methods
- [ ] `twins/slack/src/plugins/web-api/conversations.ts` updated — add 25 new conversation methods
- [ ] `twins/slack/src/plugins/web-api/users.ts` updated — add 10 new user methods
- [ ] `twins/slack/src/services/rate-limiter.ts` updated — add Tier 1 method rate tier assignments
- [ ] `twins/slack/src/index.ts` updated — register new plugins
- [ ] `tests/sdk-verification/sdk/slack-webclient-base.test.ts` — SLCK-07 base behaviors
- [ ] `tests/sdk-verification/sdk/slack-chat.test.ts` — chat family
- [ ] `tests/sdk-verification/sdk/slack-conversations.test.ts` — conversations family
- [ ] `tests/sdk-verification/sdk/slack-users.test.ts` — users family
- [ ] `tests/sdk-verification/sdk/slack-reactions.test.ts` — reactions family
- [ ] `tests/sdk-verification/sdk/slack-pins.test.ts` — pins family
- [ ] `tests/sdk-verification/sdk/slack-views.test.ts` — views family
- [ ] `tests/sdk-verification/sdk/slack-stubs-smoke.test.ts` — Tier 2 stubs smoke
- [ ] `tests/sdk-verification/coverage/generate-report.ts` updated — LIVE_SYMBOLS for all Phase 18 live symbols
- [ ] `pnpm coverage:generate` run — coverage-report.json updated with Phase 18 classifications

---

## Sources

### Primary (HIGH confidence)
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/methods.ts` — complete method surface (271 methods enumerated by family)
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts` — apiCall, paginate, filesUploadV2, chatStream, makeRequest, retry, rate-limit handling source
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/chat-stream.ts` — ChatStreamer.append() stores streamTs from startStream response
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/retry-policies.ts` — rapidRetryPolicy for test use
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/FilesGetUploadURLExternalResponse.ts` — upload_url and file_id fields
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/FilesCompleteUploadExternalResponse.ts` — files array shape
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/ViewsOpenResponse.ts` — view object shape
- `/Users/futur/projects/sandpiper-dtu/tools/sdk-surface/manifests/slack-web-api@7.14.1.json` — WebClient has 392 tracked members; verified family names and member paths
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/auth.ts` — authoritative plugin template
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/chat.ts` — authoritative plugin template
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/conversations.ts` — authoritative plugin template with pagination
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts` — addReaction/listReactions exist; pins table does NOT exist
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/rate-limiter.ts` — DEFAULT_RATE_TIERS and SlackRateLimiter.check() behavior
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/admin.ts` — error simulator, token seeding, reset endpoints
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/coverage/generate-report.ts` — LIVE_SYMBOLS key format and generation logic
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/helpers/slack-client.ts` — createSlackClient
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/setup/seeders.ts` — resetSlack, seedSlackBotToken
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/vitest.config.ts` — singleFork:true confirmed

### Secondary (MEDIUM confidence)
- Slack API documentation tier assignments for rate limiting (auth, conversations, reactions, views tiers verified against Slack docs website) — confirms tier numbers match existing DEFAULT_RATE_TIERS pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing patterns verified from codebase
- Architecture: HIGH — all plugin patterns verified from existing working code; method lists verified from SDK source
- Pitfalls: HIGH — filesUploadV2 upload_url shape and ChatStreamer.streamTs read directly from SDK source; other pitfalls from codebase pattern analysis
- Tier classification: HIGH for Tier 1 (chat/conversations/users from prior phases); MEDIUM for misc families (slackLists, calls, team — classified as stubs based on complexity estimate, not prior implementation)

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (stable SDK version; WebClient method surface does not change between patch releases)
