# Phase 5: Slack Twin - Web API & Events - Research

**Researched:** 2026-02-28
**Domain:** Slack Web API, Events API, OAuth v2, Block Kit, rate limiting
**Confidence:** HIGH

## Summary

Phase 5 builds the second major twin in the DTU system -- a behavioral clone of Slack's Web API, Events API, OAuth installation flow, and Block Kit interactive components. Unlike the Shopify twin (GraphQL), the Slack twin is entirely REST-based with JSON payloads. The Slack API surface is simpler in structure but wider in method count, with each method being a distinct POST/GET endpoint under `/api/{method}`.

The Slack twin reuses the proven infrastructure from Phases 1-3: Fastify for HTTP, `@dtu/state` (StateManager with better-sqlite3) for persistence, `@dtu/webhooks` (WebhookQueue) for async event delivery, and the `buildApp()` factory pattern for testability. The key new challenges are: (1) REST API routing instead of GraphQL, (2) Events API outbound delivery triggered by state mutations, (3) Block Kit validation (50-block limit, structural validation), (4) tier-based per-method rate limiting (different from Shopify's query-cost model), and (5) interaction payload delivery to response URLs.

**Primary recommendation:** Follow the Shopify twin's architecture exactly (Fastify plugins, StateManager extension, WebhookQueue for events delivery), replacing GraphQL Yoga with plain Fastify REST routes. Each Slack Web API method maps to a single Fastify route handler. Reuse `@dtu/webhooks` for Events API delivery with Slack-format HMAC signing.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-01 | Web API methods: chat.postMessage, chat.update, conversations.list, conversations.info, conversations.history, users.list, users.info | REST route handlers, each method = one Fastify POST/GET route. Response formats documented with example JSON from official docs. |
| SLCK-02 | Events API delivery: POST event payloads (message, app_mention, reaction_added) to configured app URL on state changes | Reuse @dtu/webhooks WebhookQueue. Event envelope format documented. Trigger events from Web API method handlers on state mutations. |
| SLCK-03 | OAuth installation flow: workspace authorization -> bot token + user token issuance | Simplified OAuth v2 flow: `/oauth/v2/authorize` redirect -> callback with code -> `oauth.v2.access` token exchange. Bot token (xoxb-) and user token (xoxp-) issuance. |
| SLCK-04 | Block Kit interaction handling: button click payloads, modal submission payloads, message action payloads with response URL support | block_actions payload format documented. Response URL valid 5 times within 30 minutes. Twin generates interaction payloads when simulating user clicks via admin API. |
| SLCK-05 | Bolt-compatible challenge verification (url_verification) and event envelope format | url_verification: echo `challenge` value. Event envelope: `type: "event_callback"` wrapper with `token`, `team_id`, `api_app_id`, `event`, `event_id`, `event_time`, `authorizations`. |
| SLCK-06 | Rate limiting: tier-based per method with 429 + Retry-After headers | Four tiers: T1=1+/min, T2=20+/min, T3=50+/min, T4=100+/min. Per-method per-workspace per-app. Special tier for chat.postMessage (1/sec/channel). |
</phase_requirements>

## Standard Stack

### Core (already in project -- reuse)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.0.0 | HTTP framework for REST routes | Already used by Shopify twin; proven pattern |
| better-sqlite3 (via @dtu/state) | ^11.0.0 | State persistence (channels, messages, users, tokens) | Shared infrastructure from Phase 1 |
| @dtu/webhooks | workspace:* | Async event delivery with retry/DLQ | Shared infrastructure from Phase 3 |
| @dtu/types | workspace:* | Shared type definitions | Shared infrastructure from Phase 1 |
| @dtu/core | workspace:* | Core utilities | Shared infrastructure from Phase 1 |
| pino / pino-pretty | ^9.5.0 / ^13.0.0 | Structured logging | Already used by Shopify twin |
| vitest | ^2.1.8 | Testing | Already used across monorepo |

### New (Slack-specific, minimal additions)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | -- | -- | The Slack twin needs no new external dependencies. All functionality can be built with Fastify routes, Node.js crypto (HMAC-SHA256), and existing @dtu/* packages. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain Fastify routes | Express + express-openapi | Fastify is already the project standard; no benefit from switching |
| Manual HMAC signing | @slack/events-api | The real Slack SDK is for consuming Slack, not emulating it. Our twin IS the server. |
| Custom event queue | BullMQ + Redis | Already rejected in Phase 3 as over-engineered for dev/test tool. @dtu/webhooks is battle-tested. |

**Installation:**
```bash
# No new packages needed. The Slack twin uses only existing workspace dependencies.
pnpm init  # inside twins/slack/ -- then set up package.json dependencies
```

## Architecture Patterns

### Recommended Project Structure
```
twins/slack/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                    # buildApp() factory, Fastify setup
    plugins/
      health.ts                 # GET /health (shared pattern)
      oauth.ts                  # OAuth v2 flow (/oauth/v2/authorize, /api/oauth.v2.access)
      admin.ts                  # /admin/reset, /admin/fixtures/load, /admin/state
      errors.ts                 # Error simulation config (same pattern as Shopify)
      events-api.ts             # POST /events — url_verification + event receipt endpoint
      interactions.ts           # POST /interactions — block_actions handler
      web-api/
        chat.ts                 # chat.postMessage, chat.update routes
        conversations.ts        # conversations.list, conversations.info, conversations.history
        users.ts                # users.list, users.info
    services/
      token-validator.ts        # Bearer token validation for Web API
      rate-limiter.ts           # Tier-based per-method rate limiter
      block-kit-validator.ts    # Block Kit structural validation (50-block limit, type checks)
      event-dispatcher.ts       # Triggers Events API delivery via @dtu/webhooks
      interaction-handler.ts    # Generates block_actions payloads, manages response URLs
      id-generator.ts           # Slack-style ID generation (T/C/U/W prefixed)
  test/
    integration.test.ts         # Full integration tests
    services/
      rate-limiter.test.ts
      block-kit-validator.test.ts
      event-dispatcher.test.ts
```

### Pattern 1: REST Method Routing (Slack Web API)
**What:** Each Slack Web API method maps to a single Fastify route at `/api/{method.name}`
**When to use:** All SLCK-01 Web API methods
**Example:**
```typescript
// Source: https://docs.slack.dev/reference/methods/chat.postMessage/
// Each Slack method = one POST route (Slack uses POST for everything, even reads)
const webApiPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/chat.postMessage
  fastify.post('/api/chat.postMessage', async (request, reply) => {
    // 1. Validate Bearer token
    const token = extractBearerToken(request);
    if (!token) return reply.status(200).send({ ok: false, error: 'not_authed' });

    // 2. Rate limit check (Special tier: 1/sec/channel)
    const limited = fastify.rateLimiter.check('chat.postMessage', token);
    if (limited) {
      return reply.status(429)
        .header('Retry-After', String(limited.retryAfter))
        .send({ ok: false, error: 'ratelimited' });
    }

    // 3. Validate Block Kit blocks if present
    const { channel, text, blocks } = request.body as any;
    if (blocks) {
      const validation = validateBlocks(blocks);
      if (!validation.valid) {
        return reply.status(200).send({ ok: false, error: 'invalid_blocks' });
      }
    }

    // 4. Store message in state
    const ts = generateMessageTs();
    const message = fastify.stateManager.createMessage({ channel, text, blocks, user: botUserId, ts });

    // 5. Dispatch Events API event
    await fastify.eventDispatcher.dispatch('message', { channel, text, user: botUserId, ts });

    // 6. Return Slack-format response
    return { ok: true, channel, ts, message: { text, ts, type: 'message' } };
  });
};
```

### Pattern 2: Events API Delivery via @dtu/webhooks
**What:** State mutations trigger Events API event payloads wrapped in Slack's event envelope, delivered via WebhookQueue
**When to use:** SLCK-02, SLCK-05
**Example:**
```typescript
// Source: https://docs.slack.dev/apis/events-api/
class EventDispatcher {
  constructor(
    private webhookQueue: WebhookQueue,
    private stateManager: StateManager,
    private signingSecret: string,
  ) {}

  async dispatch(eventType: string, eventData: Record<string, unknown>): Promise<void> {
    const subscriptions = this.stateManager.listEventSubscriptions();
    const eventId = `Ev${generateSlackId()}`;
    const eventTime = Math.floor(Date.now() / 1000);

    const envelope = {
      token: 'twin-verification-token',
      team_id: 'T_TWIN',
      api_app_id: 'A_TWIN',
      event: { type: eventType, ...eventData, event_ts: String(eventTime) },
      type: 'event_callback',
      event_id: eventId,
      event_time: eventTime,
      authorizations: [{ enterprise_id: 'E0', team_id: 'T_TWIN', user_id: 'U_BOT', is_bot: true }],
    };

    for (const sub of subscriptions) {
      await this.webhookQueue.enqueue({
        id: randomUUID(),
        topic: `slack:${eventType}`,
        callbackUrl: sub.request_url,
        payload: envelope,
        secret: this.signingSecret,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
```

### Pattern 3: Token Authentication (Bearer Header)
**What:** Slack uses `Authorization: Bearer xoxb-...` header for Web API authentication
**When to use:** All Web API routes
**Example:**
```typescript
// Source: https://docs.slack.dev/apis/web-api/
function extractBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// Slack returns { ok: false, error: 'not_authed' } with 200 status on auth failure
// (NOT 401 -- Slack always returns 200 with ok:false for auth errors on Web API methods)
```

### Pattern 4: Tier-Based Rate Limiting
**What:** Each Slack Web API method has a rate limit tier; limits are per-method per-workspace per-app
**When to use:** SLCK-06
**Example:**
```typescript
// Source: https://docs.slack.dev/apis/web-api/rate-limits/
interface MethodRateConfig {
  tier: 1 | 2 | 3 | 4 | 'special';
  requestsPerMinute: number;
}

const RATE_TIERS: Record<string, MethodRateConfig> = {
  'chat.postMessage': { tier: 'special', requestsPerMinute: 60 }, // ~1/sec/channel
  'chat.update':      { tier: 3, requestsPerMinute: 50 },
  'conversations.list':    { tier: 2, requestsPerMinute: 20 },
  'conversations.info':    { tier: 3, requestsPerMinute: 50 },
  'conversations.history': { tier: 3, requestsPerMinute: 50 },
  'users.list':            { tier: 2, requestsPerMinute: 20 },
  'users.info':            { tier: 4, requestsPerMinute: 100 },
};

// Unlike Shopify's leaky bucket, Slack uses simple sliding window per minute
class SlackRateLimiter {
  private windows: Map<string, { count: number; resetAt: number }> = new Map();

  check(method: string, token: string): { retryAfter: number } | null {
    const config = RATE_TIERS[method];
    if (!config) return null;

    const key = `${method}:${token}`;
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + 60_000 });
      return null;
    }

    if (entry.count >= config.requestsPerMinute) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { retryAfter };
    }

    entry.count++;
    return null;
  }

  reset(): void {
    this.windows.clear();
  }
}
```

### Pattern 5: Slack-Style ID Generation
**What:** Slack uses prefixed alphanumeric IDs (T for teams, C for channels, U for users, W for workspace users)
**When to use:** All entity creation
**Example:**
```typescript
// Slack IDs are uppercase alphanumeric with type prefix
// Team IDs: T + 9-11 alphanumeric chars (e.g., T9TK3CUKW)
// Channel IDs: C + 9-11 chars (e.g., C012AB3CD)
// User IDs: U + 9-11 chars (e.g., U123ABC456)
// Bot User IDs: U + 9-11 chars (same format as users)
// App IDs: A + 9-11 chars (e.g., A0KRD7HC3)
// Message timestamps: epoch.sequence (e.g., 1503435956.000247)

function generateSlackId(prefix: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = prefix;
  for (let i = 0; i < 9; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Message timestamps use epoch.microseconds format
let messageCounter = 0;
function generateMessageTs(): string {
  const epoch = Math.floor(Date.now() / 1000);
  messageCounter++;
  return `${epoch}.${String(messageCounter).padStart(6, '0')}`;
}
```

### Anti-Patterns to Avoid
- **Returning HTTP error codes for auth failures:** Slack Web API always returns HTTP 200 with `{ ok: false, error: "..." }` for most errors. Only rate limits use HTTP 429. Do NOT return 401/403.
- **Using GraphQL Yoga:** The Slack twin is pure REST. Do not bring in GraphQL tooling.
- **Building a real Slack client SDK:** The twin IS the server. Do not import @slack/web-api or @slack/bolt -- those are client libraries for consuming Slack.
- **Implementing Socket Mode:** Explicitly deferred to ADV-05 (v2). Only implement HTTP-based Events API.
- **Generating GIDs:** Slack does not use Shopify-style GIDs. Use Slack-format prefixed IDs (C, U, T, A prefixes).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async event delivery | Custom HTTP delivery with retry | @dtu/webhooks WebhookQueue | Already has retry, backoff, DLQ, sync mode, compressed timing |
| Dead letter queue | Custom SQLite DLQ | @dtu/webhooks SqliteDeadLetterStore | Battle-tested, shared with Shopify twin |
| State persistence | Custom SQLite wrapper | @dtu/state StateManager (extended with Slack tables) | Reset-in-<100ms pattern, prepared statements, WAL mode |
| HMAC-SHA256 signing | Third-party library | Node.js crypto.createHmac('sha256', secret) | Built-in, no dependency needed |
| HTTP framework | Express or custom server | Fastify 5 (project standard) | Already the project standard, plugin architecture proven |
| Test runner | Jest or custom | Vitest (project standard) | Already configured across monorepo |

**Key insight:** The Slack twin's novelty is in the API contract fidelity (REST routes, event envelopes, Block Kit validation, interaction payloads). All infrastructure (HTTP, state, webhooks, testing) is already solved by existing packages.

## Common Pitfalls

### Pitfall 1: HTTP Status Code Confusion
**What goes wrong:** Returning 401/403 for authentication failures on Web API methods.
**Why it happens:** HTTP convention says use 4xx for client errors. Slack does not follow this convention.
**How to avoid:** ALL Slack Web API errors return HTTP 200 with `{ ok: false, error: "error_code" }`. The only exception is rate limiting, which returns HTTP 429 with `Retry-After` header.
**Warning signs:** Integration tests expecting 401 instead of 200 with `ok: false`.

### Pitfall 2: Message Timestamp as String vs Number
**What goes wrong:** Treating Slack `ts` values as numbers instead of strings.
**Why it happens:** They look like numbers (e.g., `1503435956.000247`), but they are string identifiers.
**How to avoid:** Always store and return `ts` as strings. The format is `epoch.sequence` where the decimal portion is a sequence counter, not fractional seconds. Use string comparison, not numeric.
**Warning signs:** Lost precision when parsing ts as float; duplicate ts values in conversations.history.

### Pitfall 3: Event Envelope vs Inner Event Confusion
**What goes wrong:** Sending the inner event object without the outer envelope wrapper.
**Why it happens:** The Events API has a two-layer structure (envelope + inner event) that is easy to flatten.
**How to avoid:** Always wrap events in the envelope: `{ type: "event_callback", token, team_id, api_app_id, event: { ... }, event_id, event_time, authorizations }`.
**Warning signs:** Bolt apps fail to parse events; `type` field is `"message"` instead of `"event_callback"`.

### Pitfall 4: Block Kit 50-Block Limit Only for Messages
**What goes wrong:** Applying the 50-block limit to modals (which allow 100).
**Why it happens:** Different surfaces have different limits.
**How to avoid:** Messages: 50 blocks max. Modals/Home tabs: 100 blocks max. For Phase 5 (no modals yet), enforce 50-block limit on chat.postMessage and chat.update.
**Warning signs:** Tests passing with 51 blocks when they should fail.

### Pitfall 5: StateManager Reset Invalidates DLQ Store
**What goes wrong:** DLQ operations fail after `POST /admin/reset`.
**Why it happens:** StateManager.reset() closes and reopens SQLite DB, invalidating DLQ store's cached connection reference.
**How to avoid:** Same pattern as Shopify twin -- DLQ cleared via dedicated admin endpoint, not during reset. Document this in admin API.
**Warning signs:** "database connection closed" errors after reset.

### Pitfall 6: OAuth Token Prefix Matters
**What goes wrong:** Issuing tokens without proper Slack prefixes.
**Why it happens:** Twin shortcuts token generation.
**How to avoid:** Bot tokens MUST start with `xoxb-`. User tokens MUST start with `xoxp-`. Slack SDKs and Bolt check these prefixes.
**Warning signs:** Bolt apps reject tokens because they don't match expected prefix patterns.

### Pitfall 7: url_verification Must Return Challenge in Body
**What goes wrong:** Returning a JSON response with extra fields instead of just the challenge.
**Why it happens:** Assuming JSON-object response is required.
**How to avoid:** The challenge response can be plain text (just the challenge string), or JSON `{ "challenge": "..." }`. Both are acceptable. The key is responding quickly (< 3 seconds).
**Warning signs:** Bolt apps fail during Request URL verification step.

### Pitfall 8: Interaction Payloads Sent as Form-Encoded
**What goes wrong:** Sending block_actions payloads as JSON.
**Why it happens:** Most APIs use JSON, but Slack sends interaction payloads as `application/x-www-form-urlencoded` with a `payload` field containing JSON.
**How to avoid:** When delivering interaction payloads to the app's Request URL, send as POST with `Content-Type: application/x-www-form-urlencoded` and body `payload=<url-encoded-json>`.
**Warning signs:** Bolt apps cannot parse interaction payloads.

## Code Examples

Verified patterns from official Slack documentation:

### chat.postMessage Response
```typescript
// Source: https://docs.slack.dev/reference/methods/chat.postMessage/
// Success response
{
  ok: true,
  channel: "C123ABC456",
  ts: "1503435956.000247",
  message: {
    text: "Here's a message for you",
    username: "ecto1",
    bot_id: "B123ABC456",
    type: "message",
    subtype: "bot_message",
    ts: "1503435956.000247"
  }
}

// Error response (note: HTTP 200, not 4xx)
{
  ok: false,
  error: "channel_not_found"
}
```

### conversations.history Response with Cursor Pagination
```typescript
// Source: https://docs.slack.dev/reference/methods/conversations.history/
{
  ok: true,
  messages: [
    {
      type: "message",
      user: "U123ABC456",
      text: "message content",
      ts: "1512085950.000216"
    }
  ],
  has_more: true,
  pin_count: 0,
  response_metadata: {
    next_cursor: "bmV4dF90czoxNTEyMDg1ODYxMDAwNTQz"
  }
}
```

### OAuth v2 Token Exchange Response
```typescript
// Source: https://docs.slack.dev/reference/methods/oauth.v2.access/
{
  ok: true,
  access_token: "xoxb-17653672481-19874698323-pdFZKVeTuE8sk7oOcBrzbqgy",
  token_type: "bot",
  scope: "commands,incoming-webhook",
  bot_user_id: "U0KRQLJ9H",
  app_id: "A0KRD7HC3",
  team: { name: "Slack Softball Team", id: "T9TK3CUKW" },
  authed_user: {
    id: "U1234",
    scope: "chat:write",
    access_token: "xoxp-1234",
    token_type: "user"
  }
}
```

### Events API Envelope
```typescript
// Source: https://docs.slack.dev/apis/events-api/
{
  token: "XXYYZZ",
  team_id: "T123ABC456",
  api_app_id: "A123ABC456",
  event: {
    type: "message",
    channel: "C123ABC456",
    user: "U123ABC456",
    text: "Hello world",
    ts: "1355517523.000005",
    event_ts: "1355517523.000005",
    channel_type: "channel"
  },
  type: "event_callback",
  event_context: "EC123ABC456",
  event_id: "Ev123ABC456",
  event_time: 1355517523,
  authorizations: [{
    enterprise_id: "E123ABC456",
    team_id: "T123ABC456",
    user_id: "U123ABC456",
    is_bot: false
  }]
}
```

### url_verification Challenge-Response
```typescript
// Source: https://docs.slack.dev/reference/events/url_verification/
// Incoming from Slack (or from app being tested):
{
  token: "Jhj5dZrVaK7ZwHHjRyZWjbDl",
  challenge: "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P",
  type: "url_verification"
}

// Twin's Events API endpoint responds with:
// Content-Type: text/plain  OR  application/json
// Body: the challenge string (plain text) or { "challenge": "..." } (JSON)
```

### block_actions Interaction Payload
```typescript
// Source: https://docs.slack.dev/reference/interaction-payloads/block_actions-payload/
{
  type: "block_actions",
  trigger_id: "12321423423.333649436676",
  user: { id: "U123ABC456", username: "bobby", name: "Bobby Tables" },
  team: { id: "T9TK3CUKW", domain: "example" },
  api_app_id: "A123ABC456",
  token: "XXYYZZ",
  container: { type: "message", message_ts: "1503435956.000247", channel_id: "C123ABC456" },
  channel: { id: "C123ABC456", name: "general" },
  message: { /* original message object */ },
  actions: [{
    type: "button",
    block_id: "action_block_1",
    action_id: "approve_button",
    text: { type: "plain_text", text: "Approve" },
    value: "approve_123",
    action_ts: "1503435956.000247"
  }],
  response_url: "https://hooks.slack.com/actions/T9TK3CUKW/1234567890/abcdefghijk"
}
```

### Request Signature Verification
```typescript
// Source: https://docs.slack.dev/authentication/verifying-requests-from-slack/
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject requests older than 5 minutes
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  // Compute v0:timestamp:body HMAC
  const baseString = `v0:${timestamp}:${body}`;
  const computed = 'v0=' + createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');

  // Timing-safe comparison
  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
```

### Slack Rate Limit Tiers per Method
```typescript
// Source: https://docs.slack.dev/apis/web-api/rate-limits/
// Methods required by SLCK-01 and their tiers:
const METHOD_TIERS = {
  'chat.postMessage':      'special', // ~1/sec/channel, workspace cap ~several hundred/min
  'chat.update':           3,         // 50+ per minute
  'conversations.list':    2,         // 20+ per minute
  'conversations.info':    3,         // 50+ per minute
  'conversations.history': 3,         // 50+ per minute
  'users.list':            2,         // 20+ per minute
  'users.info':            4,         // 100+ per minute
  'oauth.v2.access':       'special', // 600 per minute (not tier-based)
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OAuth v1 (`oauth.access`) | OAuth v2 (`oauth.v2.access`) | 2020 | Bot tokens in `access_token`, user tokens in `authed_user.access_token` |
| Legacy message formatting | Block Kit | 2019+ | Structured blocks replace attachment-based formatting |
| RTM (WebSocket) API | Events API (HTTP) | 2020+ | HTTP callbacks replace persistent WebSocket connections |
| `authed_users` in events | `authorizations` array | 2021+ | `authorizations` provides richer context; `authed_users` deprecated |
| Verification token | Signing secret (HMAC) | 2018 | HMAC-SHA256 replaces simple token comparison |
| docs at api.slack.com | docs at docs.slack.dev | 2025 | New documentation site; old URLs still work but redirect |

**Deprecated/outdated:**
- `oauth.access` (v1): Replaced by `oauth.v2.access`. Twin should implement v2 only.
- RTM API: Replaced by Events API. Socket Mode (ADV-05) is the WebSocket alternative but is v2/deferred.
- Verification token: Still present in event payloads for backward compatibility, but HMAC signing secret is the correct verification method.
- `authed_users`: Still delivered in events but `authorizations` is preferred. Twin should include both for maximum compatibility.

## StateManager Extension Design

The Slack twin extends StateManager with Slack-specific tables (same pattern as Shopify):

```sql
-- Workspace/Team info (single row for the twin instance)
CREATE TABLE IF NOT EXISTS slack_teams (
  id TEXT PRIMARY KEY,          -- T-prefixed ID (e.g., T9TK3CUKW)
  name TEXT NOT NULL,
  domain TEXT NOT NULL
);

-- Channels (public and private)
CREATE TABLE IF NOT EXISTS slack_channels (
  id TEXT PRIMARY KEY,          -- C-prefixed ID
  name TEXT NOT NULL,
  is_channel BOOLEAN DEFAULT 1,
  is_private BOOLEAN DEFAULT 0,
  is_archived BOOLEAN DEFAULT 0,
  topic TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  creator TEXT,                 -- User ID
  num_members INTEGER DEFAULT 0,
  created INTEGER NOT NULL
);

-- Users (workspace members)
CREATE TABLE IF NOT EXISTS slack_users (
  id TEXT PRIMARY KEY,          -- U-prefixed ID
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,           -- username
  real_name TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  email TEXT,
  is_admin BOOLEAN DEFAULT 0,
  is_bot BOOLEAN DEFAULT 0,
  deleted BOOLEAN DEFAULT 0,
  color TEXT DEFAULT '000000',
  tz TEXT DEFAULT 'America/Los_Angeles'
);

-- Messages
CREATE TABLE IF NOT EXISTS slack_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id TEXT,
  text TEXT,
  blocks TEXT,                  -- JSON array of Block Kit blocks
  ts TEXT UNIQUE NOT NULL,      -- Message timestamp (epoch.sequence)
  thread_ts TEXT,               -- Parent message ts for threads
  subtype TEXT,                 -- e.g., 'bot_message', 'channel_join'
  edited_user TEXT,             -- User who last edited
  edited_ts TEXT,               -- Timestamp of last edit
  created_at INTEGER NOT NULL
);

-- Bot tokens (from OAuth)
CREATE TABLE IF NOT EXISTS slack_tokens (
  token TEXT PRIMARY KEY,       -- xoxb-... or xoxp-...
  token_type TEXT NOT NULL,     -- 'bot' or 'user'
  team_id TEXT NOT NULL,
  user_id TEXT,                 -- Bot user ID (for bot tokens) or authed user ID
  scope TEXT NOT NULL,          -- Comma-separated scopes
  app_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Event subscriptions (apps subscribing to events)
CREATE TABLE IF NOT EXISTS slack_event_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  request_url TEXT NOT NULL,    -- Where to POST events
  event_types TEXT NOT NULL,    -- JSON array of subscribed event types
  created_at INTEGER NOT NULL
);

-- Error configs (reuse same pattern as Shopify)
CREATE TABLE IF NOT EXISTS slack_error_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method_name TEXT UNIQUE NOT NULL,  -- e.g., 'chat.postMessage'
  status_code INTEGER,
  error_body TEXT,
  delay_ms INTEGER,
  enabled BOOLEAN DEFAULT 1
);

-- Reactions (for reaction_added events)
CREATE TABLE IF NOT EXISTS slack_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_ts TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction TEXT NOT NULL,       -- Emoji name without colons
  created_at INTEGER NOT NULL
);
```

## Open Questions

1. **Should StateManager be extended or should Slack have its own state class?**
   - What we know: Shopify twin extends the shared StateManager with Shopify-specific tables and methods. This works but makes StateManager grow large.
   - What's unclear: Whether adding Slack tables to the same StateManager class is maintainable, or if Slack should have a SlackStateManager subclass.
   - Recommendation: Create a `SlackStateManager` that composes (wraps) the base StateManager, adding Slack-specific tables and methods while delegating entity/reset operations. This keeps the base class clean. Alternatively, follow the exact Shopify pattern for consistency even if it's less clean -- consistency across twins has value.

2. **How should the twin simulate user interactions (button clicks)?**
   - What we know: The real Slack sends interaction payloads to the app when a user clicks a button. The twin needs a way to trigger this.
   - What's unclear: Whether to use an admin endpoint (`POST /admin/interactions/trigger`) or to have the twin auto-generate interactions when certain conditions are met.
   - Recommendation: Add `POST /admin/interactions/trigger` admin endpoint that accepts `{ message_ts, channel, action_id, user_id }` and generates + delivers a block_actions payload to the configured interaction URL. This is the most testable approach.

3. **Response URL implementation complexity**
   - What we know: Response URLs are short-lived webhook URLs (usable 5x within 30 minutes) that apps use to send follow-up messages.
   - What's unclear: Whether the twin needs to actually serve these URLs (act as hooks.slack.com) or if it can just include them in payloads without implementing the endpoint.
   - Recommendation: Implement response URLs as twin endpoints (e.g., `POST /response-url/{id}`) that post messages back to the originating channel. This is needed for success criterion #5.

4. **Conformance testing scope for Phase 5**
   - What we know: Phase 3 built @dtu/conformance for the Shopify twin. The Slack twin should eventually have conformance suites too.
   - What's unclear: Whether conformance suite creation belongs in Phase 5 or is deferred.
   - Recommendation: Defer Slack conformance suite creation. Phase 5 focuses on building the twin. Conformance testing against real Slack workspace can be a follow-up. Integration tests (using buildApp + inject) validate behavior.

## Sources

### Primary (HIGH confidence)
- [chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/) -- full API spec, response format, error codes, rate limit tier
- [chat.update](https://docs.slack.dev/reference/methods/chat.update/) -- full API spec, response format, error codes
- [conversations.history](https://docs.slack.dev/reference/methods/conversations.history/) -- cursor pagination, response format, limits
- [conversations.list](https://docs.slack.dev/reference/methods/conversations.list/) -- parameters, response format, pagination
- [conversations.info](https://docs.slack.dev/reference/methods/conversations.info/) -- parameters, response format
- [users.list](https://docs.slack.dev/reference/methods/users.list/) -- parameters, response format, pagination
- [users.info](https://docs.slack.dev/reference/methods/users.info/) -- parameters, response format
- [oauth.v2.access](https://docs.slack.dev/reference/methods/oauth.v2.access/) -- OAuth token exchange spec
- [Events API](https://docs.slack.dev/apis/events-api/) -- event envelope format, retry behavior, rate limits
- [url_verification](https://docs.slack.dev/reference/events/url_verification/) -- challenge-response spec
- [message event](https://docs.slack.dev/reference/events/message/) -- event payload, scopes, subtypes
- [app_mention event](https://docs.slack.dev/reference/events/app_mention/) -- event payload, scopes
- [reaction_added event](https://docs.slack.dev/reference/events/reaction_added/) -- event payload, item types
- [block_actions payload](https://docs.slack.dev/reference/interaction-payloads/block_actions-payload/) -- interaction payload structure
- [Rate limits](https://docs.slack.dev/apis/web-api/rate-limits/) -- tier definitions, 429 + Retry-After
- [Block Kit blocks](https://docs.slack.dev/reference/block-kit/blocks/) -- block types, 50-block message limit
- [OAuth v2 installation](https://docs.slack.dev/authentication/installing-with-oauth/) -- full OAuth flow
- [Request signing](https://docs.slack.dev/authentication/verifying-requests-from-slack/) -- HMAC-SHA256 algorithm
- Existing codebase: `twins/shopify/src/` -- established Fastify plugin architecture, StateManager extension patterns, WebhookQueue integration

### Secondary (MEDIUM confidence)
- [Slack Web API overview](https://docs.slack.dev/apis/web-api/) -- general API structure, content types
- [Bolt for JavaScript](https://tools.slack.dev/bolt-js/) -- Bolt framework expectations for url_verification, event handling

### Tertiary (LOW confidence)
- Rate limit exact numbers: Official docs say tiers are "1+", "20+", "50+", "100+" per minute, implying these are minimums, not exact limits. Twin should use these as the enforced limits.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies needed; reuses proven project infrastructure
- Architecture: HIGH -- Direct parallel to Shopify twin pattern; REST is simpler than GraphQL
- API contracts: HIGH -- All response formats verified against official Slack docs (docs.slack.dev)
- Pitfalls: HIGH -- Common Slack API gotchas well-documented (HTTP 200 for errors, ts as strings, envelope format)
- Rate limiting: MEDIUM -- Exact tier limits are "minimums" per docs; implementation uses stated values as caps

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (Slack API is stable; rate limit policy changes for non-Marketplace apps effective March 3, 2026 noted but not directly relevant to twin behavior)
