# Phase 3: Webhook System & Conformance Framework - Research

**Researched:** 2026-02-27
**Domain:** Async webhook delivery, background job queues, conformance testing
**Confidence:** HIGH

## Summary

Phase 3 upgrades the existing synchronous fire-and-forget webhook delivery to production-grade async delivery with retry/backoff, and builds a generic conformance testing framework for validating twins against real APIs.

The webhook upgrade is straightforward: the current `sendWebhook()` in the Shopify twin already handles HMAC signing and correct headers. What's needed is wrapping it in a queue with retry logic, exponential backoff (immediate/1min/5min), and a dead letter queue for failed deliveries. Given this is a dev/test tool (not a distributed production system), a custom in-memory queue with SQLite-backed dead letter persistence is the right approach -- BullMQ+Redis would be massively over-engineered for a twin that runs locally.

The conformance framework is the more architecturally significant piece. It needs to be generic (reusable for Slack in Phase 5), run the same tests against both twin and real sandbox API, and report behavioral differences with strict pass/fail. The framework should live in a shared `@dtu/conformance` package, use Vitest as the test runner (already in the project), and provide a thin adapter layer for twin vs. real API targeting.

**Primary recommendation:** Build a lightweight in-memory webhook queue with SQLite dead letter persistence (no Redis dependency), and a Vitest-based conformance runner in `@dtu/conformance` with adapter pattern for twin/real API targeting.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Mirror real Shopify API for registration (GraphQL mutations like `webhookSubscriptionCreate`)
- Also support config-file-based subscriptions as a convenience (like Shopify's `shopify.app.toml` approach)
- Both methods coexist -- config file for defaults, API for runtime test changes
- Full HMAC signing (X-Shopify-Hmac-SHA256) on all webhook deliveries -- no shortcut mode
- Payloads match real Shopify's exact documented payload shape -- same fields, nesting, types
- Auto-generate webhook topic for every state mutation the twin supports, not just four named topics
- Configurable delay multiplier for compressed time in tests (e.g., 0.001x so retries happen in milliseconds)
- Real timing available as default, compressed timing for test runs
- Exponential backoff schedule: immediate, 1min, 5min (as specified in success criteria)
- Failed deliveries after retries go to dead letter queue
- Generic, reusable conformance framework -- any twin can plug in, not Shopify-specific
- Shopify is the first plugin, Slack reuses the same framework in Phase 5
- Framework lives in shared `@dtu/conformance` package
- Live mode: runs against real Shopify dev store for accurate drift detection
- Offline mode: runs against recorded API fixtures -- no credentials or network needed
- CI uses offline mode by default, periodic scheduled jobs use live mode
- Strict pass/fail -- no "known differences" concept. Every difference is a failure.

### Claude's Discretion
- Dead letter queue inspection interface (admin API, log output, or both)
- Queue persistence strategy (in-memory vs SQLite-backed) -- pick based on existing state management patterns
- Whether to support optional synchronous delivery mode for simpler test assertions
- Exact retry timing implementation
- Handling non-deterministic fields (IDs, timestamps, created_at) in conformance comparisons
- Test organization (per-behavior, per-endpoint, or per-requirement)
- Machine-readable output format (JUnit XML, JSON, or exit-code-only)
- Upstream drift notification mechanism

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-05 | Conformance test framework -- same test suite runs against twin AND real sandbox API, reports behavioral differences | `@dtu/conformance` package with adapter pattern, Vitest runner, diff-style failure reporting |
| INFRA-06 | Conformance suites run periodically (CI schedule) to detect upstream API drift | CLI command + CI config for scheduled runs, offline mode for default CI, live mode for drift detection |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Test runner for conformance suites | Already in project, fast, TypeScript-native, supports programmatic API |
| better-sqlite3 | (existing) | Dead letter queue persistence | Already used for state management, no new dependency |
| node:crypto | built-in | HMAC-SHA256 signing | Already used in webhook-sender.ts |
| node:timers | built-in | setTimeout for retry delays | No dependency needed for basic scheduling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-retry | ^6.0.0 | Retry with exponential backoff wrapper | Wraps individual webhook delivery attempts |
| deep-diff | ^1.0.2 | Object comparison for conformance | Structural diff between twin and real API responses |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom in-memory queue | BullMQ + Redis | BullMQ adds Redis dependency -- massive overkill for a local dev/test tool |
| Custom in-memory queue | p-queue | p-queue handles concurrency but not retry/backoff/dead-letter natively |
| deep-diff | jest-diff | jest-diff is presentation-focused, deep-diff is structural -- we need both aspects |
| Vitest | Pact.io | Pact is consumer-driven contract testing -- we need behavioral comparison, not contract generation |

**Installation:**
```bash
pnpm add -w p-retry deep-diff
pnpm add -D -w @types/deep-diff
```

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── webhooks/             # NEW: @dtu/webhooks shared package
│   ├── src/
│   │   ├── index.ts           # Public API exports
│   │   ├── webhook-queue.ts   # In-memory queue with retry logic
│   │   ├── webhook-delivery.ts # HTTP delivery with HMAC signing
│   │   ├── dead-letter.ts     # SQLite-backed DLQ
│   │   └── types.ts           # Webhook types (subscription, delivery, DLQ entry)
│   └── package.json
├── conformance/          # NEW: @dtu/conformance shared package
│   ├── src/
│   │   ├── index.ts           # Public API exports
│   │   ├── runner.ts          # Conformance test runner
│   │   ├── adapter.ts         # Abstract adapter interface (twin vs real)
│   │   ├── comparator.ts      # Response comparison with field normalization
│   │   ├── reporter.ts        # Diff-style + summary table output
│   │   ├── fixture-store.ts   # Recorded fixture management for offline mode
│   │   └── types.ts           # Conformance types
│   └── package.json
twins/
├── shopify/
│   ├── conformance/           # Shopify-specific conformance tests
│   │   ├── adapters/
│   │   │   ├── twin-adapter.ts   # Points tests at local twin
│   │   │   └── live-adapter.ts   # Points tests at real Shopify dev store
│   │   ├── suites/
│   │   │   ├── orders.conformance.ts
│   │   │   ├── products.conformance.ts
│   │   │   └── webhooks.conformance.ts
│   │   └── fixtures/             # Recorded API responses for offline mode
│   └── src/
│       └── services/
│           └── webhook-sender.ts  # REFACTOR: delegate to @dtu/webhooks
```

### Pattern 1: Webhook Queue with Configurable Timing
**What:** In-memory queue that processes webhook deliveries with configurable delay multiplier
**When to use:** All webhook delivery in all twins
**Example:**
```typescript
interface WebhookQueueOptions {
  /** Delay multiplier. 1.0 = real timing, 0.001 = compressed for tests */
  timeScale: number;
  /** Retry schedule in ms at timeScale=1.0. Default: [0, 60000, 300000] */
  retryDelays: number[];
  /** Dead letter store for failed deliveries */
  deadLetterStore: DeadLetterStore;
}

class WebhookQueue {
  private pending: Map<string, WebhookJob> = new Map();

  async enqueue(delivery: WebhookDelivery): Promise<string> {
    const jobId = crypto.randomUUID();
    this.pending.set(jobId, { delivery, attempt: 0, jobId });
    this.processJob(jobId); // fire and forget
    return jobId;
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.pending.get(jobId);
    if (!job) return;

    try {
      await deliverWebhook(job.delivery);
      this.pending.delete(jobId);
    } catch (error) {
      if (job.attempt < this.retryDelays.length) {
        const delay = this.retryDelays[job.attempt] * this.timeScale;
        job.attempt++;
        setTimeout(() => this.processJob(jobId), delay);
      } else {
        // Max retries exhausted -- move to dead letter queue
        await this.deadLetterStore.add(job);
        this.pending.delete(jobId);
      }
    }
  }
}
```

### Pattern 2: Conformance Adapter Interface
**What:** Abstract interface that conformance tests use to target either twin or real API
**When to use:** Every conformance test suite
**Example:**
```typescript
interface ConformanceAdapter {
  /** Human-readable name for reporting */
  name: string;
  /** Set up test state (create resources, etc.) */
  setup(fixtures: FixtureSet): Promise<void>;
  /** Execute an API operation and return normalized response */
  execute(operation: ConformanceOperation): Promise<ConformanceResponse>;
  /** Tear down test state */
  teardown(): Promise<void>;
}

// Twin adapter uses app.inject() -- no network needed
class ShopifyTwinAdapter implements ConformanceAdapter {
  name = 'Shopify Twin';
  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    const response = await this.app.inject({ method: op.method, url: op.url, payload: op.body });
    return normalizeResponse(response);
  }
}

// Live adapter uses real HTTP to Shopify dev store
class ShopifyLiveAdapter implements ConformanceAdapter {
  name = 'Shopify Dev Store';
  async execute(op: ConformanceOperation): Promise<ConformanceResponse> {
    const response = await fetch(`${this.baseUrl}${op.url}`, { ... });
    return normalizeResponse(response);
  }
}
```

### Pattern 3: Non-Deterministic Field Normalization
**What:** Strip/normalize fields that differ between twin and real API by nature (IDs, timestamps)
**When to use:** Before comparing twin vs real API responses
**Example:**
```typescript
interface FieldNormalizer {
  /** Fields to strip entirely (auto-generated IDs, timestamps) */
  stripFields: string[];
  /** Fields to normalize (e.g., replace GID numbers with placeholder) */
  normalizeFields: Record<string, (value: unknown) => unknown>;
}

const shopifyNormalizer: FieldNormalizer = {
  stripFields: ['created_at', 'updated_at', 'admin_graphql_api_id'],
  normalizeFields: {
    id: () => '<ID>',
    'node.id': (v) => typeof v === 'string' && v.startsWith('gid://') ? '<GID>' : v,
  },
};
```

### Anti-Patterns to Avoid
- **Redis for a local dev tool:** BullMQ requires Redis, which adds operational overhead and a running daemon. The twin runs locally, in-memory queue is sufficient.
- **Coupling webhook queue to Shopify twin:** The queue should be in `@dtu/webhooks` shared package. Slack twin will use the same queue in Phase 5.
- **Testing conformance with mocks:** Conformance tests MUST hit real endpoints (twin or live API). Mocking defeats the purpose.
- **Ignoring field ordering in comparisons:** JSON field order shouldn't matter. Use structural comparison, not string comparison.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff calculation | Custom delay math | p-retry or simple array of delays | The retry schedule is fixed (immediate, 1min, 5min) -- just use an array |
| Deep object comparison | Recursive JSON diff | deep-diff library | Handles circular refs, type coercion, arrays -- many edge cases |
| HMAC-SHA256 signing | N/A | node:crypto (already using) | Standard library, no dependency needed |
| Test runner | Custom test harness | Vitest programmatic API | Already in project, handles parallelism, reporting, watch mode |

**Key insight:** The webhook queue itself IS simple enough to hand-roll (it's an in-memory Map + setTimeout). The conformance comparison is NOT -- use deep-diff for structural comparison.

## Common Pitfalls

### Pitfall 1: Timer Leak in Tests
**What goes wrong:** setTimeout-based retry creates timers that outlive test runs, causing flaky tests and Jest/Vitest "open handle" warnings.
**Why it happens:** Webhook queue schedules retries with setTimeout, test tears down before timer fires.
**How to avoid:** WebhookQueue MUST have a `drain()` or `shutdown()` method that clears all pending timers. Call it in test afterEach/afterAll.
**Warning signs:** Tests intermittently fail, "async operations still pending" warnings.

### Pitfall 2: Body Parser Consuming Raw Body Before HMAC Check
**What goes wrong:** When receiving webhooks (for conformance testing of delivery), JSON body parser runs first, then HMAC check fails because raw body is gone.
**Why it happens:** Fastify (and Express) parse body before route handler runs.
**How to avoid:** Use Fastify's `addContentTypeParser` to capture raw body, or use `preParsing` hook to store raw buffer.
**Warning signs:** HMAC verification passes locally but fails against real Shopify webhooks.

### Pitfall 3: Non-Deterministic Comparison Noise
**What goes wrong:** Every conformance test fails because IDs, timestamps, cursor values differ between twin and real API.
**Why it happens:** Auto-generated values are inherently different between systems.
**How to avoid:** Apply field normalizer BEFORE comparison. Strip known non-deterministic fields. Make normalizer configurable per-suite.
**Warning signs:** All tests "fail" but failures are only ID/timestamp differences.

### Pitfall 4: Synchronous SQLite in Async Queue Path
**What goes wrong:** Dead letter queue write blocks the event loop because better-sqlite3 is synchronous.
**Why it happens:** better-sqlite3 is designed for synchronous access (a feature, not a bug).
**How to avoid:** DLQ writes happen only on final failure (after all retries exhausted). The write is fast (<1ms for a single row). This is acceptable. Don't try to make it async -- it would add complexity for negligible gain.
**Warning signs:** N/A -- this is a non-issue for this use case.

### Pitfall 5: Conformance Tests Modifying Real Store State
**What goes wrong:** Tests create/modify real resources on Shopify dev store and don't clean up.
**Why it happens:** Live mode tests need real state, but cleanup is fragile.
**How to avoid:** Each conformance test creates its own resources with identifiable prefixes (e.g., `[DTU-TEST]`). Teardown deletes by prefix. Use test-scoped timeouts.
**Warning signs:** Dev store accumulates test data, quota warnings.

## Code Examples

Verified patterns from project codebase and official sources:

### Current Webhook Delivery (to be wrapped)
```typescript
// Source: twins/shopify/src/services/webhook-sender.ts (existing)
export async function sendWebhook(
  url: string,
  topic: string,
  payload: WebhookPayload,
  secret: string
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, secret);
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Hmac-Sha256': signature,
      'X-Shopify-Shop-Domain': 'twin.myshopify.com',
      'X-Shopify-API-Version': '2024-01',
      'X-Shopify-Webhook-Id': crypto.randomUUID()
    },
    body,
    signal: AbortSignal.timeout(2000)
  });
}
```

### Dead Letter Queue Schema
```sql
-- Add to state manager migrations
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT UNIQUE NOT NULL,
  topic TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  payload TEXT NOT NULL,
  error_message TEXT,
  attempts INTEGER NOT NULL,
  first_attempted_at INTEGER NOT NULL,
  last_attempted_at INTEGER NOT NULL
);
```

### Conformance Test Structure
```typescript
// Source: pattern for @dtu/conformance
import { describe, it, expect } from 'vitest';

export function defineConformanceSuite(
  name: string,
  adapter: ConformanceAdapter,
  normalizer: FieldNormalizer
) {
  describe(`Conformance: ${name}`, () => {
    // Compare twin response vs recorded/live response
    it('should return matching response structure', async () => {
      const response = await adapter.execute(operation);
      const normalized = normalizer.apply(response);
      const expected = normalizer.apply(baseline);
      expect(normalized).toMatchConformance(expected);
    });
  });
}
```

### Shopify Webhook Headers (from official docs)
```typescript
// Source: https://shopify.dev/docs/apps/build/webhooks/subscribe/https
// Real Shopify webhook delivery headers
const SHOPIFY_WEBHOOK_HEADERS = {
  'Content-Type': 'application/json',
  'X-Shopify-Topic': 'orders/create',           // Webhook topic
  'X-Shopify-Hmac-Sha256': '<base64-hmac>',     // HMAC-SHA256 of body using client secret
  'X-Shopify-Shop-Domain': 'example.myshopify.com',
  'X-Shopify-API-Version': '2024-01',           // API version used to serialize payload
  'X-Shopify-Webhook-Id': '<uuid>',             // Unique delivery ID
  'X-Shopify-Triggered-At': '<iso-datetime>',   // When event occurred
};
// Twin already sends these correctly (verified in existing code)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shopify REST webhooks API | GraphQL `webhookSubscriptionCreate` mutation | Oct 2024 (REST deprecated) | Twin should support GraphQL subscription management |
| `X-Shopify-Hmac-Sha256` with client_secret | Same, but secret rotation takes up to 1 hour | Ongoing | Twin can ignore rotation delay (instant) |
| Manual webhook retry | Shopify retries 8 times over ~4 hours | Current | Twin uses simpler 3-retry (immediate, 1min, 5min) per user decision |

**Deprecated/outdated:**
- REST Admin API for webhook management: Deprecated Oct 2024, removed for new apps Apr 2025. Twin should focus on GraphQL mutations.

## Discretion Recommendations

### Dead Letter Queue Inspection
**Recommendation:** Both admin API endpoint AND log output.
- `GET /admin/dead-letter-queue` returns DLQ entries as JSON (for programmatic inspection in tests)
- `POST /admin/dead-letter-queue/:id/retry` replays a failed delivery
- `DELETE /admin/dead-letter-queue` clears the DLQ
- Failed deliveries also log at `warn` level via Pino (for human debugging)

### Queue Persistence Strategy
**Recommendation:** In-memory queue, SQLite-backed dead letter only.
- Active queue is in-memory (Map + setTimeout). On twin restart, in-flight deliveries are lost -- this is acceptable for a dev/test tool.
- Dead letter entries persist to SQLite via existing StateManager pattern. They survive twin restart and are inspectable.

### Synchronous Delivery Mode
**Recommendation:** Yes, support optional synchronous mode.
- Add `sync: true` option to webhook queue. When enabled, `enqueue()` awaits delivery and throws on failure.
- This makes test assertions much simpler: `await mutation(); // webhook already delivered`
- Default is async (production-like behavior). Tests can opt into sync for simplicity.

### Conformance Test Organization
**Recommendation:** Per-behavior grouping.
- Group tests by behavior (e.g., "create order and verify response shape") rather than per-endpoint or per-requirement.
- Each behavior test validates both request/response format AND side effects (webhooks triggered, state changes).
- Requirements are mapped via test metadata, not folder structure.

### Machine-Readable Output
**Recommendation:** JSON output + exit code.
- `--json` flag outputs structured JSON report (parseable by CI)
- Exit code 0 = all pass, 1 = failures found
- JUnit XML is unnecessary complexity for a single-team project

### Upstream Drift Notification
**Recommendation:** CI job failure + log output.
- Scheduled CI job runs live conformance. If failures, CI job fails (standard alerting).
- No custom notification mechanism needed -- use existing CI notification (Slack, email, etc.).

## Open Questions

1. **Shopify dev store credentials management**
   - What we know: Live conformance needs a real Shopify dev store with API credentials
   - What's unclear: How to manage credentials in CI (env vars, secrets manager?)
   - Recommendation: Use environment variables (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_STORE_URL`). CI uses GitHub Actions secrets. Document setup in CONTRIBUTING.md.

2. **Fixture recording mechanism**
   - What we know: Offline mode needs recorded fixtures from real API
   - What's unclear: Whether to build a recording tool or manually capture
   - Recommendation: Build a simple `record` command that runs live suite and saves responses as fixtures. This bootstraps offline mode.

## Sources

### Primary (HIGH confidence)
- Shopify webhook delivery docs: https://shopify.dev/docs/apps/build/webhooks/subscribe/https -- delivery headers, HMAC signing, retry behavior (8 retries over 4 hours)
- Shopify WebhookSubscriptionTopic enum: https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic -- complete topic list
- Shopify webhookSubscriptionCreate mutation: https://shopify.dev/docs/api/admin-graphql/latest/mutations/webhookSubscriptionCreate -- subscription management API
- Existing codebase: `twins/shopify/src/services/webhook-sender.ts` -- current HMAC implementation is correct

### Secondary (MEDIUM confidence)
- BullMQ documentation: https://docs.bullmq.io -- confirmed overkill for this use case (requires Redis)
- p-retry npm: https://www.npmjs.com/package/p-retry -- exponential backoff wrapper
- deep-diff npm: structural object comparison library

### Tertiary (LOW confidence)
- Conformance testing patterns: No established Node.js conformance framework exists for this exact use case (twin-vs-real comparison). Custom framework is the right approach.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- existing project dependencies plus minimal additions (p-retry, deep-diff)
- Architecture: HIGH -- patterns follow existing project conventions (shared packages, StateManager, Fastify plugins)
- Pitfalls: HIGH -- identified from existing codebase analysis and Shopify documentation
- Conformance framework: MEDIUM -- custom design since no standard solution exists for this specific pattern

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (30 days -- stable domain, Shopify API versioned quarterly)
