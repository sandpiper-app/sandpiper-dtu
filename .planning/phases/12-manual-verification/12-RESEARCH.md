# Phase 12: Manual Verification - Research

**Researched:** 2026-03-01
**Domain:** Automated verification of previously human-only observable behaviors (HMAC webhook signatures, async delivery timing, UI rendering)
**Confidence:** HIGH

## Summary

Phase 12 closes the three "human verification" items identified in the v1.0 milestone audit (items 5, 6, 7 in the tech debt summary). These items were flagged because the verifier could not exercise runtime behaviors during static code review: HMAC webhook signature validation end-to-end, async webhook delivery timing observation, and visual UI inspection.

The good news: the existing codebase already has substantial coverage of two of these three areas. The `packages/webhooks/test/webhook-queue.test.ts` file already contains a test that verifies HMAC signatures end-to-end ("delivers webhook successfully with correct headers and HMAC") and tests that exercise async delivery timing with compressed timing. The primary gap is that the audit explicitly asked for (a) a true end-to-end HMAC test that exercises the full sign-deliver-verify cycle (the existing test verifies the signature matches but does not perform independent HMAC verification on the receiving end), (b) a timing assertion that measures the window between enqueue and delivery, and (c) a UI verification that confirms HTML structure of the rendered templates.

All three items can be implemented as Vitest tests plus a lightweight verification script, using only existing project infrastructure (Vitest, Fastify's `app.inject()`, the `createCallbackServer` pattern from existing integration tests, and Node.js `crypto` module for HMAC verification).

**Primary recommendation:** Create a single new test file (`tests/verification/manual-verification.test.ts`) containing three describe blocks (HMAC e2e, webhook timing, UI rendering) plus document results in `VERIFICATION.md`. No new dependencies required.

## Standard Stack

### Core

No new libraries needed. All verification uses existing infrastructure:

| Component | Location | Purpose |
|-----------|----------|---------|
| Vitest | Root `vitest.config.ts` | Test runner (already configured with workspace projects) |
| Node.js `crypto` | Built-in | HMAC-SHA256 verification on the receiving side |
| `createCallbackServer` pattern | `packages/webhooks/test/webhook-queue.test.ts` | Local HTTP server to receive and inspect webhook deliveries |
| `buildApp()` | `twins/shopify/src/index.ts`, `twins/slack/src/index.ts` | In-process twin instances for testing |
| `app.inject()` | Fastify | HTTP request injection without network overhead |
| `generateHmacSignature` | `packages/webhooks/src/webhook-delivery.ts` | HMAC signing function (already exported) |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `WebhookQueue` | Async webhook delivery with configurable timing | Timing assertion tests |
| `SqliteDeadLetterStore` | DLQ for failed deliveries | Part of queue setup |
| `Database` (better-sqlite3) | In-memory SQLite for test isolation | Queue/DLQ test fixtures |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest test file | Standalone Node.js script | Test file integrates with existing `pnpm test` workflow; standalone script would need separate runner |
| HTML string assertions | Playwright/Puppeteer browser tests | Full browser tests are overkill for verifying template structure; HTML string assertions are fast and sufficient |
| Separate test files per concern | Single test file | Three concerns are small enough for one file; avoids config churn |

## Architecture Patterns

### Recommended Test Structure

```
tests/
  verification/
    manual-verification.test.ts    # All 3 verification tests
    vitest.config.ts               # Workspace vitest config
```

Or alternatively, place the tests in the existing test directories of relevant packages:

```
packages/webhooks/test/
  webhook-queue.test.ts            # Existing tests
  hmac-e2e.test.ts                 # New: HMAC sign -> deliver -> verify

twins/shopify/test/
  webhook-timing.test.ts           # New: async delivery timing
  ui-structure.test.ts             # New: HTML structure verification
```

**Recommendation:** Use a single file at `tests/verification/manual-verification.test.ts` with its own `vitest.config.ts`. This keeps verification tests separate from unit/integration tests and makes the purpose clear. The root `vitest.config.ts` already discovers `tests/*` via workspace projects pattern — add `tests/verification` to the projects array.

### Pattern 1: HMAC End-to-End Verification (Sign -> Deliver -> Verify)

**What:** Test that exercises the complete HMAC workflow: twin signs a webhook payload, delivers it to a callback server, and the callback server independently verifies the HMAC signature using the shared secret.

**When to use:** This is the exact flow that Shopify webhook consumers use in production.

**Key distinction from existing test:** The existing `webhook-queue.test.ts` test at line 85 checks that the delivered HMAC header matches `generateHmacSignature()` output. That validates signing consistency but not the verification side. The new test should independently compute the HMAC using `crypto.createHmac()` on the received body, then compare — proving the full sign-deliver-verify chain works.

**Example:**
```typescript
// Source: packages/webhooks/src/webhook-delivery.ts pattern
it('HMAC e2e: sign -> deliver -> verify', async () => {
  const secret = 'test-webhook-secret';
  const { url, requests, close } = await createCallbackServer();

  try {
    const queue = new WebhookQueue({
      deadLetterStore: dlq,
      syncMode: true,
    });

    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      topic: 'orders/create',
      callbackUrl: url,
      payload: { id: 1, name: '#1001', total_price: '99.99' },
      secret,
    };

    await queue.enqueue(delivery);

    // Receiver side: independently verify HMAC
    const req = requests[0];
    const receivedBody = req.body;
    const receivedSignature = req.headers['x-shopify-hmac-sha256'] as string;

    // Independent verification — the receiver uses crypto directly
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(receivedBody, 'utf8')
      .digest('base64');

    expect(receivedSignature).toBe(expectedSignature);

    // Also verify the body is intact (not corrupted in transit)
    const parsedPayload = JSON.parse(receivedBody);
    expect(parsedPayload).toEqual(delivery.payload);

    queue.shutdown();
  } finally {
    await close();
  }
});
```

### Pattern 2: Async Webhook Delivery Timing Assertion

**What:** Test that measures the time between enqueueing a webhook and receiving it at the callback server, asserting delivery happens within an expected window.

**Key consideration:** The existing webhook tests use `syncMode: true` or `timeScale: 0.001` for speed. This test should use async mode with `timeScale: 0.001` and measure that delivery happens within a reasonable window (e.g., < 500ms with compressed timing for the first attempt at delay=0).

**Example:**
```typescript
it('async webhook delivery: queued -> delivered within expected window', async () => {
  const { url, requests, close } = await createCallbackServer();

  try {
    const queue = new WebhookQueue({
      deadLetterStore: dlq,
      timeScale: 0.001,  // Compressed timing
      syncMode: false,    // Async mode — delivery is NOT awaited
    });

    const delivery = makeDelivery(url);
    const enqueueTime = Date.now();
    await queue.enqueue(delivery);

    // enqueue() returns immediately in async mode
    // Wait for delivery (first attempt has delay=0, so nearly immediate)
    const deadline = Date.now() + 2000;
    while (requests.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const deliveryTime = Date.now();
    const elapsed = deliveryTime - enqueueTime;

    expect(requests).toHaveLength(1);
    // First attempt (delay=0) should deliver within 500ms even with async overhead
    expect(elapsed).toBeLessThan(500);

    queue.shutdown();
  } finally {
    await close();
  }
});
```

### Pattern 3: UI Structure Verification Script

**What:** Test that renders Shopify and Slack twin UI pages via `app.inject()` and asserts on critical HTML structure elements — sidebar navigation, data-twin attribute, key page sections.

**Key consideration:** This is NOT pixel-perfect visual testing. It verifies the structural contract: layout renders, sidebar has nav items, data-twin attribute is set, key content sections exist. Use Fastify `app.inject()` for zero-network-overhead HTML rendering.

**What to verify for Shopify layout:**
- `data-twin="shopify"` attribute on `<html>`
- Sidebar contains nav items: Orders, Products, Customers, Inventory
- Admin items: Admin, Webhooks
- Main content area renders with page title
- CSS includes `--twin-accent: #008060` (Shopify green)

**What to verify for Slack message timeline:**
- `data-twin="slack"` attribute on `<html>`
- Channel detail page contains "Message Timeline" heading
- Messages render with user names, timestamps, text
- "Post a Message" form is present with text input and submit button
- Sidebar contains nav items: Channels, Users

**Example:**
```typescript
describe('UI Structure Verification', () => {
  it('Shopify layout renders with correct structure', async () => {
    const app = await buildShopifyApp({ logger: false });
    await app.ready();

    try {
      const res = await app.inject({ method: 'GET', url: '/ui/orders' });
      expect(res.statusCode).toBe(200);

      const html = res.body;
      // Layout structure
      expect(html).toContain('data-twin="shopify"');
      expect(html).toContain('Shopify Twin');
      expect(html).toContain('class="app-layout"');
      expect(html).toContain('class="sidebar"');
      expect(html).toContain('class="main-content"');

      // Navigation
      expect(html).toContain('/ui/orders');
      expect(html).toContain('/ui/products');
      expect(html).toContain('/ui/customers');
      expect(html).toContain('/ui/inventory');
      expect(html).toContain('/ui/admin');
      expect(html).toContain('/ui/admin/webhooks');

      // Page content
      expect(html).toContain('<h1>Orders</h1>');

      // CSS framework
      expect(html).toContain('pico');
    } finally {
      await app.close();
    }
  });

  it('Slack message timeline renders with correct structure', async () => {
    const app = await buildSlackApp({ logger: false });
    await app.ready();

    try {
      // Seed a message
      app.slackStateManager.createMessage({
        ts: '1700000001.000001',
        channel_id: 'C_GENERAL',
        user_id: 'U_BOT_TWIN',
        text: 'Test timeline message',
      });

      const res = await app.inject({ method: 'GET', url: '/ui/channels/C_GENERAL' });
      expect(res.statusCode).toBe(200);

      const html = res.body;
      // Layout structure
      expect(html).toContain('data-twin="slack"');
      expect(html).toContain('Slack Twin');

      // Message timeline
      expect(html).toContain('Message Timeline');
      expect(html).toContain('Test timeline message');
      expect(html).toContain('twin-bot');  // User name lookup
      expect(html).toContain('1700000001.000001');  // Timestamp

      // Post message form
      expect(html).toContain('Post a Message');
      expect(html).toContain('Post Message');
      expect(html).toContain('name="text"');

      // Navigation
      expect(html).toContain('/ui/channels');
      expect(html).toContain('/ui/users');
    } finally {
      await app.close();
    }
  });
});
```

### Anti-Patterns to Avoid

- **Don't use Playwright/Puppeteer for UI verification**: Browser-based testing is overkill for structural HTML assertions. `app.inject()` renders the full HTML without needing a browser, is faster, and has zero external dependencies.
- **Don't test timing with fixed `setTimeout`**: Use polling loops with deadlines (the pattern established in Phase 9 for DLQ timing tests). Fixed delays are flaky; polling is deterministic.
- **Don't duplicate existing HMAC tests**: The new test should complement, not duplicate, the existing `webhook-queue.test.ts` HMAC test. The existing test verifies signing consistency; the new test verifies the full sign-deliver-verify chain.
- **Don't test CSS rendering**: HTML string assertions verify structure, not visual appearance. CSS rendering requires a browser and is out of scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC computation | Custom crypto wrapper | `crypto.createHmac('sha256', secret)` | Node.js built-in, well-tested, matches existing `generateHmacSignature` |
| Local HTTP server | Express/Koa test server | `createCallbackServer()` pattern from existing tests | Proven pattern, already used in webhook-queue.test.ts and slack integration.test.ts |
| HTML assertion library | Cheerio/JSDOM parser | String `contains` assertions | Sufficient for structural verification; no DOM manipulation needed |
| Test framework | Custom script runner | Vitest | Already configured across the project |

**Key insight:** This phase is verification, not new feature development. Every tool and pattern needed is already in the codebase. The only new code is the test assertions themselves.

## Common Pitfalls

### Pitfall 1: Flaky Timing Assertions

**What goes wrong:** Tests that assert delivery happens within X milliseconds can fail on slow CI runners or under load.
**Why it happens:** CI environments have variable latency; setTimeout granularity is ~1ms but scheduling overhead can be 10-50ms.
**How to avoid:** Use generous timing windows (e.g., < 500ms instead of < 50ms for async delivery). The goal is to prove delivery is asynchronous and reasonably fast, not to benchmark exact latency.
**Warning signs:** Test passes locally but fails intermittently in CI.

### Pitfall 2: Callback Server Port Conflicts

**What goes wrong:** The `createCallbackServer()` binds to port 0 (random), but if multiple tests run in parallel, cleanup timing can cause issues.
**Why it happens:** Vitest runs test files in parallel by default.
**How to avoid:** Each test creates and closes its own server. The existing pattern already handles this correctly with `try/finally` cleanup.
**Warning signs:** EADDRINUSE errors.

### Pitfall 3: WebhookQueue Shutdown Leaks

**What goes wrong:** Tests that create a `WebhookQueue` with async mode and don't call `shutdown()` leave pending timers, causing Vitest to hang or warn about open handles.
**Why it happens:** Async retry timers keep the Node.js event loop alive.
**How to avoid:** Always call `queue.shutdown()` in `afterEach` or `finally` blocks. The existing test patterns already demonstrate this.
**Warning signs:** "Vitest did not exit" warnings, tests hanging after completion.

### Pitfall 4: Root Vitest Config Project Discovery

**What goes wrong:** New test directory at `tests/verification/` is not discovered by Vitest.
**Why it happens:** Root `vitest.config.ts` has `projects: ['packages/*', 'twins/*']` which does not include `tests/*`.
**How to avoid:** Either (a) add `'tests/*'` to the root projects array, or (b) put a `vitest.config.ts` in `tests/verification/` and reference it. Note: the existing `tests/integration/` directory has its own `vitest.config.ts` but is NOT in the root projects array — it is run separately. Check how `tests/integration/smoke.test.ts` is invoked to match the pattern.
**Warning signs:** Tests not found when running `pnpm test`.

### Pitfall 5: HTML Assertions Breaking on Template Changes

**What goes wrong:** String-matching assertions like `expect(html).toContain('Message Timeline')` break if template text changes.
**Why it happens:** Tight coupling between test assertions and template strings.
**How to avoid:** Assert on structural elements (CSS classes, data attributes, HTML tags) rather than content strings where possible. For content strings, use the exact strings from the current templates (verified in this research). Accept that these tests verify a snapshot of current behavior.
**Warning signs:** Tests fail after UI template updates.

## Code Examples

### createCallbackServer Pattern (from existing codebase)

```typescript
// Source: packages/webhooks/test/webhook-queue.test.ts lines 18-55
function createCallbackServer(
  handler?: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{
  server: ReturnType<typeof createServer>;
  url: string;
  requests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }>;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const requests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requests.push({ headers: req.headers, body });
        if (handler) {
          handler(req, res);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({
          server,
          url: `http://127.0.0.1:${addr.port}/webhook`,
          requests,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      }
    });
  });
}
```

### Independent HMAC Verification (receiver side)

```typescript
// Source: Node.js crypto docs — standard HMAC verification pattern
import crypto from 'node:crypto';

function verifyHmacSignature(body: string, secret: string, receivedSignature: string): boolean {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  // Use timingSafeEqual for production; direct comparison fine for tests
  return computed === receivedSignature;
}
```

### Shopify Twin In-Process Build (existing pattern)

```typescript
// Source: twins/shopify/test/integration.test.ts lines 19-26
import { buildApp } from '../src/index.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  process.env.WEBHOOK_TIME_SCALE = '0.001';
  app = await buildApp({ logger: false });
  await app.ready();
});

afterEach(async () => {
  delete process.env.WEBHOOK_TIME_SCALE;
  await app.close();
});
```

### Polling Pattern for Async Assertions (established in Phase 9)

```typescript
// Source: twins/shopify/test/integration.test.ts lines 972-978
// Poll for expected state — wait with 50ms interval and deadline
const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  const pollRes = await app.inject({ method: 'GET', url: '/admin/dead-letter-queue' });
  if (JSON.parse(pollRes.body).length > 0) break;
  await new Promise(resolve => setTimeout(resolve, 50));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual human observation | Automated tests with `app.inject()` | Phase 12 | Closes remaining manual verification items |
| `syncMode: true` for all webhook tests | Mix of sync and async mode | Phase 3 onwards | Allows testing both delivery modes |
| Fixed `setTimeout` delays | Polling with deadlines | Phase 9 | Eliminates timing flakiness |

**Deprecated/outdated:**
- localhost:9999 for webhook test targets: replaced with 127.0.0.1:1 (guaranteed ECONNREFUSED) in Phase 9

## Existing Test Coverage Analysis

Before writing new tests, here is what already exists:

### HMAC Coverage (existing)

| Test | File | What It Verifies | Gap |
|------|------|-----------------|-----|
| "delivers webhook successfully with correct headers and HMAC" | `packages/webhooks/test/webhook-queue.test.ts:85` | Signing consistency — delivered header matches `generateHmacSignature()` output | Does not independently verify on receiver side |
| "verifies HMAC signature is valid base64-encoded SHA256" | `packages/webhooks/test/webhook-queue.test.ts:296` | Signature format (32 bytes, valid base64, matches manual crypto) | Unit test of signing function only |

**Gap:** No test performs independent HMAC verification using only the received body + shared secret (the receiver's perspective).

### Webhook Timing Coverage (existing)

| Test | File | What It Verifies | Gap |
|------|------|-----------------|-----|
| "retries on failure and succeeds on subsequent attempt" | `packages/webhooks/test/webhook-queue.test.ts:123` | Retry behavior with compressed timing | Does not measure actual delivery latency |
| "uses compressed timing for fast test execution" | `packages/webhooks/test/webhook-queue.test.ts:196` | Compressed timing completes < 5s | Does not assert specific queued-to-delivered window |
| DLQ timing test | `twins/shopify/test/integration.test.ts:947` | Polling-based DLQ arrival | Tests failure path, not success timing |

**Gap:** No test measures the elapsed time from `enqueue()` to callback server receipt for successful delivery.

### UI Coverage (existing)

| Test | File | What It Verifies | Gap |
|------|------|-----------------|-----|
| Shopify UI tests | `twins/shopify/test/ui.test.ts` | CRUD operations, 200 status, basic content assertions | Does not verify full layout structure (sidebar, data-twin, CSS classes) |
| Slack UI tests | `twins/slack/test/ui.test.ts` | CRUD operations, 200 status, message timeline presence | Limited structural assertions |

**Gap:** No test verifies the complete layout structure: sidebar navigation items, data-twin attribute, CSS framework inclusion, or the end-to-end message timeline rendering with user name resolution.

## Open Questions

1. **Test file location**
   - What we know: Existing integration smoke tests are at `tests/integration/smoke.test.ts` with their own `vitest.config.ts`. They are not in the root vitest workspace `projects` array.
   - What's unclear: Whether the new verification tests should follow the same pattern (standalone vitest config, run separately) or be integrated into the root workspace.
   - Recommendation: Follow the `tests/integration/` pattern — create `tests/verification/vitest.config.ts` and add to root projects or provide a direct run command. This keeps verification separate from unit tests and matches established convention.

2. **VERIFICATION.md format and content**
   - What we know: Success criterion 4 requires "All verification results documented in VERIFICATION.md."
   - What's unclear: Whether this is the phase's standard VERIFICATION.md (written by the verifier) or a separate project-level verification document.
   - Recommendation: This will be the standard `12-VERIFICATION.md` file written by the verifier after test execution, documenting test pass/fail results. No separate VERIFICATION.md needed at project root.

3. **Vitest root config integration**
   - What we know: Root `vitest.config.ts` has `projects: ['packages/*', 'twins/*']` which would not discover `tests/verification/`.
   - Options: (a) Add `'tests/*'` to projects array, (b) run verification tests via explicit path `pnpm exec vitest run tests/verification/`, or (c) add a `test:verify` script to root package.json.
   - Recommendation: Add `'tests/*'` to the root vitest projects array. This discovers both existing `tests/integration/` and new `tests/verification/`. Note: check if `tests/integration/smoke.test.ts` currently runs via root config — if it was intentionally excluded, keep `tests/verification/` separate too.

## Sources

### Primary (HIGH confidence)
- Direct file reads of all source files in the codebase:
  - `packages/webhooks/src/webhook-delivery.ts` — HMAC signing with `generateHmacSignature()`
  - `packages/webhooks/src/webhook-queue.ts` — WebhookQueue with sync/async modes, retry, DLQ
  - `packages/webhooks/test/webhook-queue.test.ts` — Existing HMAC and timing tests (7 tests)
  - `twins/shopify/test/integration.test.ts` — Shopify integration tests including webhook DLQ timing
  - `twins/slack/test/integration.test.ts` — Slack integration tests with callback server pattern
  - `twins/shopify/test/ui.test.ts` — Shopify UI tests (16 tests)
  - `twins/slack/test/ui.test.ts` — Slack UI tests (16 tests)
  - `packages/ui/src/partials/layout.eta` — Shared layout template
  - `packages/ui/src/partials/sidebar.eta` — Shared sidebar template
  - `twins/slack/src/views/channels/detail.eta` — Slack message timeline template
  - `packages/ui/src/public/styles.css` — Shared CSS with twin accent colors
  - `.planning/v1.0-MILESTONE-AUDIT.md` — Source of the 3 human verification items

### Secondary (MEDIUM confidence)
- Node.js crypto documentation — HMAC verification patterns (well-established, stable API)

## Metadata

**Confidence breakdown:**
- HMAC e2e test: HIGH — existing signing function, callback server pattern, and crypto API are all well-understood and verified by file reads
- Webhook timing: HIGH — existing async queue behavior confirmed via source code; timing assertion is straightforward with polling pattern
- UI verification: HIGH — all templates, CSS, and rendering pipeline confirmed via file reads; HTML string assertions are simple
- Test infrastructure: HIGH — Vitest workspace pattern, `app.inject()`, `createCallbackServer` all confirmed in existing tests

**Research date:** 2026-03-01
**Valid until:** Indefinite (verification of stable, already-implemented functionality)
