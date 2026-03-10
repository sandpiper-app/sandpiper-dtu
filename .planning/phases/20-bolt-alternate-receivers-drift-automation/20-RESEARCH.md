# Phase 20: Bolt Alternate Receivers & Drift Automation - Research

**Researched:** 2026-03-09
**Domain:** `@slack/bolt` SocketModeReceiver, AwsLambdaReceiver, manifest staleness drift detection
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-12 | Developer can use `@slack/bolt` Socket Mode and AWS Lambda receiver flows against twin-backed harnesses with equivalent event delivery and acknowledgement semantics | SocketModeReceiver uses `SocketModeClient` which calls `apps.connections.open` via the Web API to get a WSS URL, then connects over WebSocket. AwsLambdaReceiver exposes a `toHandler()` method that returns a plain function — no HTTP server required. Both can be tested without live AWS or Slack infrastructure. |
| INFRA-14 (full) | CI can detect upstream drift by comparing pinned submodule refs, installed package versions, AND generated manifests on milestone updates (hardened beyond Phase 14 basic detection) | `check-drift.ts` already has a Phase 14 TODO stub for manifest staleness. Phase 20 adds: (1) manifest `generatedAt` vs submodule last commit timestamp comparison, (2) a coverage completeness gate that fails CI when uncovered `deferred` Bolt receiver symbols are newly added to manifests. |

</phase_requirements>

---

## Summary

Phase 20 closes the final Bolt receiver surface (SLCK-12) and hardens drift detection (INFRA-14 full). There are two parallel tracks of work:

**Track A — SocketModeReceiver harness:** `SocketModeReceiver` wraps `SocketModeClient`, which calls `apps.connections.open` over HTTP to get a WSS URL, then connects over WebSocket. Testing requires (1) a new `apps.connections.open` stub in the Slack twin that returns a `ws://` URL pointing to a test broker, and (2) a `ws.Server` broker in the test file that accepts the connection, sends a `{ type: 'hello' }` frame to signal ready, then delivers event payloads with envelope IDs and awaits JSON acknowledgement replies. The `SocketModeReceiver` is constructed with `installerOptions: { clientOptions: { slackApiUrl: ... } }` to redirect the HTTP API calls to the twin.

**Track B — AwsLambdaReceiver harness:** `AwsLambdaReceiver.toHandler()` returns a plain `async (event, context, callback) => AwsResponse` function. No HTTP server, no AWS SDK, no network — the test constructs an `AwsEventV1` or `AwsEventV2` shaped object, calls the handler directly, and asserts on the returned `AwsResponse`. HMAC signing uses the same `signRequest` helper pattern established in Phase 19 for HTTPReceiver.

**Track C — Drift hardening:** `check-drift.ts` has a `// TODO (Phase 20)` comment on line 151 for manifest staleness. The full INFRA-14 gate adds timestamp comparison between `manifest.generatedAt` and the submodule's last commit date.

**Primary recommendation:** Build the SocketModeReceiver harness as a self-contained ws.Server broker in a single test file. Build the AwsLambdaReceiver harness as pure in-process function invocations. Extend `check-drift.ts` with manifest staleness detection as the third gate, converting the existing TODO comment into a real check.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | `^8.19.0` | WebSocket server broker for SocketModeReceiver tests | Already in root devDependencies; `@slack/socket-mode` uses `ws` as its WebSocket client |
| `@slack/bolt` | `4.6.0` | SDK under test (SocketModeReceiver, AwsLambdaReceiver) | Pinned in root devDependencies |
| `vitest` | `^3.0.0` | Test runner, same as all prior phases | Workspace standard |
| `node:crypto` | built-in | HMAC signing for AwsLambdaReceiver signature verification tests | Same as Phase 19 HTTPReceiver pattern |
| `tsx` | `^4.0.0` | Running `check-drift.ts` without compile step | Already used for existing drift check |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/ws` | `^8.18.1` | TypeScript types for ws.Server | Already in root devDependencies |
| `node:http` | built-in | HTTP server for apps.connections.open stub in test file (optional) | Only if not adding to twin; prefer twin route |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Slack twin `apps.connections.open` stub | Inline HTTP server in test | Twin stub is cleaner — test file focuses on WebSocket broker logic, not HTTP server management |
| `ws.Server` broker in test | Mocking `SocketModeClient.start()` | Real `ws.Server` exercises the actual WebSocket handshake and frame parsing; mocking bypasses the actual SocketModeClient transport |
| Direct `toHandler()` invocation for Lambda | HTTP wrapper around Lambda | Direct invocation matches how Lambda runtimes call functions; no HTTP involved |

**Installation:** No new packages needed. `ws` and `@types/ws` are already in root devDependencies.

---

## Architecture Patterns

### Pattern 1: SocketModeReceiver with ws.Server Broker

**What:** `SocketModeReceiver` requires `appToken` (an xapp- token) and redirects HTTP calls via `installerOptions.clientOptions.slackApiUrl`. The `SocketModeClient` inside calls `apps.connections.open` to get a WSS URL, then connects. The test creates a `ws.Server` on a random port, registers a `connection` handler, and sends `{ type: 'hello' }` immediately on connect to unblock `client.start()`.

**Key insight from source:** `SocketModeClient.retrieveWSSURL()` calls `this.webClient.apps.connections.open({})` and uses `resp.url` as the WebSocket URL. So the twin must serve `POST /api/apps.connections.open` returning `{ ok: true, url: 'ws://127.0.0.1:PORT/?app_token=xapp-...' }`.

**When to use:** SocketModeReceiver SDK conformance test only.

**Example broker pattern:**
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/socket-mode/src/SocketModeClient.ts
import { WebSocketServer } from 'ws';
import { AddressInfo } from 'node:net';

// 1. Boot a ws.Server broker on a random port
const wss = new WebSocketServer({ port: 0 });
const wsPort = (wss.address() as AddressInfo).port;

// 2. Register apps.connections.open on the Slack twin (or seed via admin endpoint)
//    Response must include: { ok: true, url: 'ws://127.0.0.1:wsPort/?...' }

// 3. On connection: send hello, then deliver test events
wss.on('connection', (ws) => {
  // Must send hello first — SocketModeClient emits State.Connected on receiving hello
  ws.send(JSON.stringify({ type: 'hello', num_connections: 1 }));

  // Deliver an event with envelope_id (client acks by sending { envelope_id, payload: {} })
  const envelopeId = 'test-env-01';
  ws.send(JSON.stringify({
    type: 'events_api',
    envelope_id: envelopeId,
    payload: {
      token: 'x',
      team_id: 'T_TWIN',
      api_app_id: 'A_TWIN',
      event: { type: 'app_mention', user: 'U_TEST', text: 'hi', channel: 'C_GENERAL', event_ts: '1234' },
      type: 'event_callback',
      event_id: 'Ev_TEST_01',
      event_time: 1234,
    },
    accepts_response_payload: false,
  }));

  // Wait for ack from client
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    // msg.envelope_id === envelopeId — the ack has arrived
  });
});

// 4. Teardown: wss.close() after test
```

**Socket Mode Receiver options:**
```typescript
import { SocketModeReceiver } from '@slack/bolt';

const receiver = new SocketModeReceiver({
  appToken: 'xapp-1-test-token',
  // redirect apps.connections.open HTTP call to twin
  installerOptions: {
    clientOptions: {
      slackApiUrl: process.env.SLACK_API_URL + '/api/',
    },
  },
});
```

**App initialization for SocketModeReceiver:**
```typescript
import { App } from '@slack/bolt';

const app = new App({
  receiver,
  token: TOKEN,  // bot token for WebClient calls in listeners
  clientOptions: { slackApiUrl: process.env.SLACK_API_URL + '/api/' },
});

app.event('app_mention', async ({ event, ack }) => {
  await ack();
  // event delivered
});

await receiver.start();  // calls apps.connections.open, connects WebSocket
// ... deliver events via wss broker
await receiver.stop();   // disconnects WebSocket
```

### Pattern 2: Slack Twin — `apps.connections.open` Stub

**What:** Add `POST /api/apps.connections.open` to the Slack twin's stubs plugin. Returns a `wss://` (or `ws://`) URL pointing at the test broker. The test seeds the broker URL via an admin endpoint or via a process-level coordination mechanism.

**Key challenge:** The WSS URL must be dynamically provided per test run because the `ws.Server` uses port 0 (OS-assigned). The twin cannot know the port at boot time.

**Solution — Option A (preferred):** Add an admin endpoint `POST /admin/set-wss-url` that stores the URL in the state manager. The `apps.connections.open` handler reads it back. Tests call the admin endpoint after spinning up the broker.

**Solution — Option B:** Register `apps.connections.open` directly in the test file using a minimal in-process HTTP server (avoids twin changes but is messier).

**Recommendation:** Option A — add to stubs plugin with an admin setter endpoint. Keeps the test file clean.

```typescript
// In twins/slack/src/plugins/web-api/stubs.ts (or a new sockets.ts plugin):
fastify.post('/api/apps.connections.open', async (request, reply) => {
  const token = extractToken(request);
  if (!token) return reply.send({ ok: false, error: 'not_authed' });
  const wssUrl = fastify.slackStateManager.getWssUrl(); // new state manager method
  if (!wssUrl) return reply.send({ ok: false, error: 'no_wss_url_configured' });
  return reply.send({ ok: true, url: wssUrl });
});

// In twins/slack/src/plugins/admin.ts:
fastify.post('/admin/set-wss-url', async (request, reply) => {
  const { url } = request.body as { url: string };
  fastify.slackStateManager.setWssUrl(url);
  return reply.send({ ok: true });
});
```

### Pattern 3: AwsLambdaReceiver Direct Invocation

**What:** `AwsLambdaReceiver.toHandler()` returns a plain `AwsHandler` function. Call it directly with shaped AWS event objects.

**When to use:** All AwsLambdaReceiver tests — no HTTP server, no network calls.

**Example:**
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/AwsLambdaReceiver.ts
import { AwsLambdaReceiver, App } from '@slack/bolt';
import { createHmac } from 'node:crypto';

const SIGNING_SECRET = 'test-signing-secret-slck12';

function makeAwsEvent(body: string, secret = SIGNING_SECRET): AwsEventV1 {
  const ts = Math.floor(Date.now() / 1000);
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
  return {
    body,
    headers: {
      'X-Slack-Signature': sig,
      'X-Slack-Request-Timestamp': String(ts),
      'Content-Type': 'application/json',
    },
    isBase64Encoded: false,
    httpMethod: 'POST',
    path: '/slack/events',
    resource: '/slack/events',
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    requestContext: {} as any,
    stageVariables: null,
  };
}

// URL verification test — no app needed
const receiver = new AwsLambdaReceiver({ signingSecret: SIGNING_SECRET });
const handler = await receiver.start();

const urlVerifyBody = JSON.stringify({ type: 'url_verification', challenge: 'test-challenge-slck12' });
const response = await handler(makeAwsEvent(urlVerifyBody), {} as any, () => {});
// response.statusCode === 200
// JSON.parse(response.body).challenge === 'test-challenge-slck12'

// Event delivery test — app with listener needed
const app = new App({
  receiver,
  token: TOKEN,
  clientOptions: { slackApiUrl: process.env.SLACK_API_URL + '/api/' },
});

let listenerFired = false;
app.event('app_mention', async ({ ack }) => {
  await ack();
  listenerFired = true;
});

const eventBody = JSON.stringify({
  token: 'x',
  type: 'event_callback',
  team_id: 'T_TWIN',
  api_app_id: 'A_TWIN',
  event: { type: 'app_mention', user: 'U_TEST', text: 'hi', channel: 'C_GENERAL', event_ts: '1' },
  event_id: 'Ev_SLCK12',
  event_time: 1,
  authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
});
const eventResp = await handler(makeAwsEvent(eventBody), {} as any, () => {});
// eventResp.statusCode === 200
// listenerFired === true
```

**Critical detail from source:** `AwsLambdaReceiver` uses `tsscmp` (timing-safe compare) for HMAC. The `isValidRequestSignature` method splits the signature on `=`, giving `[version, hash]`. The HMAC is computed as `sha256(signingSecret, "${version}:${ts}:${body}")`. This is identical to the HTTPReceiver/ExpressReceiver scheme — the same `signRequest()` logic from Phase 19 (adapted to return AWS headers instead of HTTP headers) will work.

### Pattern 4: Manifest Staleness Check (INFRA-14 hardening)

**What:** Extend `check-drift.ts` with a fourth gate: compare `manifest.generatedAt` (ISO timestamp in each `*.json` manifest file) against the corresponding submodule's last commit timestamp. If the submodule has commits newer than the manifest, the manifest is stale.

**When to fail:** When `submodule_last_commit_timestamp > manifest_generatedAt`, the drift check should fail with a message instructing the developer to run `pnpm coverage:generate`.

**Implementation:**
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/check-drift.ts (extending existing pattern)

// ─── 4. Manifest staleness (Phase 20 — hard fail) ────────────────────────
const manifestsDir = join(root, 'tools/sdk-surface/manifests');
for (const [pkgName, pin] of Object.entries(pins.packages)) {
  const manifestFile = join(manifestsDir, `${pkgName.replace('/', '-').replace('@', '')}@${pin.version}.json`);
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const manifestDate = new Date(manifest.generatedAt);

    // Get last commit timestamp in the submodule
    const submodulePath = join(root, pin.submodule);
    const lastCommitTs = execSync(
      `git -C "${submodulePath}" log -1 --format="%cI"`,
      { encoding: 'utf8' }
    ).trim();
    const submoduleDate = new Date(lastCommitTs);

    if (submoduleDate > manifestDate) {
      console.error(`  STALE  ${pkgName}: manifest generatedAt=${manifest.generatedAt}, submodule last commit=${lastCommitTs}`);
      console.error(`         Run: pnpm coverage:generate`);
      hasError = true;
    } else {
      console.log(`  OK  ${pkgName}: manifest is current (generatedAt=${manifest.generatedAt.slice(0,10)})`);
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(`  FAIL  ${pkgName}: manifest file not found at ${manifestFile}`);
    } else {
      console.error(`  FAIL  ${pkgName}: ${err.message}`);
    }
    hasError = true;
  }
}
```

**Manifest file naming convention:** Confirmed from `tools/sdk-surface/manifests/` directory listing:
- `shopify-admin-api-client@1.1.1.json`
- `shopify-shopify-api@12.3.0.json`
- `slack-bolt@4.6.0.json`
- `slack-oauth@3.0.4.json`
- `slack-web-api@7.14.1.json`

Pattern: `{pkgName-without-@-and-scope-slash}@{version}.json`. The `@slack/bolt` → `slack-bolt`, `@shopify/shopify-api` → `shopify-shopify-api`.

### Anti-Patterns to Avoid

- **Mocking SocketModeClient.start():** Bypasses the actual WebSocket transport and `apps.connections.open` call. The goal is to exercise the actual `SocketModeClient` connection logic.
- **Using `autoReconnectEnabled: true` (default) in tests:** SocketModeClient will retry indefinitely if the broker closes. Set `autoReconnectEnabled: false` in tests to prevent reconnection loops that cause hangs.
- **Not sending `{ type: 'hello' }` first:** `SocketModeClient.start()` resolves only when it receives a `hello` frame. Without it, the promise never resolves and the test times out.
- **Forgetting to call `receiver.stop()` in finally:** SocketModeClient's disconnect triggers cleanup timers. Failure to stop causes open handles that prevent Vitest from exiting.
- **Using the default 3001ms `unhandledRequestTimeoutMillis` for AwsLambdaReceiver tests:** The default timeout emits a log error after 3 seconds if ack wasn't called. In tests where an event is dispatched but no matching handler exists (404 path), the timeout fires before the Promise resolves. Use `unhandledRequestTimeoutMillis: 100` in tests to keep test duration short.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server for SocketMode tests | Custom event loop | `ws.WebSocketServer` | Already in devDeps; `SocketModeClient` already uses `ws` as its client |
| HMAC signing for AwsLambdaReceiver | New signing utility | Same `signRequest` logic from Phase 19 (adapted for AWS headers) | Identical scheme — `v0:${ts}:${body}` — just different header names |
| AWS API Gateway event shape | Custom type | `AwsEventV1` / `AwsEventV2` types from `@slack/bolt` | Already exported from the package manifest |
| Manifest file name derivation | Custom naming logic | Match the existing pattern (`{pkg-name-slugged}@{version}.json`) | Manifest files are already checked in; naming must match exactly |
| `apps.connections.open` response | Per-test HTTP server | Slack twin admin endpoint + state manager `setWssUrl` | Twin already has admin endpoints pattern from all previous phases |

**Key insight:** AwsLambdaReceiver is the simplest receiver to test because it is a pure function transformer. No network, no ports, no async coordination needed beyond `await handler(event, ctx, cb)`. SocketModeReceiver is more involved because of the WebSocket handshake, but the `ws` package makes the broker 10 lines of code.

---

## Common Pitfalls

### Pitfall 1: SocketModeClient never resolves `start()` without `hello` frame
**What goes wrong:** Test hangs at `await receiver.start()` until the 30s timeout fires.
**Why it happens:** `SocketModeClient.start()` waits for `State.Connected` event, which is only emitted when `event.type === 'hello'` is received via the WebSocket.
**How to avoid:** In the `ws.Server` `connection` handler, send `{ type: 'hello', num_connections: 1 }` as the very first message before any test events.
**Warning signs:** Test timeout at the `await receiver.start()` line.

### Pitfall 2: SocketModeClient reconnect loop in tests
**What goes wrong:** After the broker closes, the client retries with exponential backoff. Test appears to hang or produces spurious errors.
**Why it happens:** `autoReconnectEnabled` defaults to `true`. When the WebSocket closes, `delayReconnectAttempt` fires.
**How to avoid:** Pass `autoReconnectEnabled: false` to `SocketModeReceiver` via internal `SocketModeClient` options. Check if SocketModeReceiver exposes this — from source, it does not directly expose `autoReconnectEnabled`. Workaround: call `receiver.stop()` in `finally` before closing the `ws.Server`; stopping sets `shuttingDown = true` which prevents reconnect.
**Warning signs:** Test passes but Vitest cannot exit (open handles from reconnect timers).

### Pitfall 3: SocketModeReceiver needs `appToken` (xapp- prefix)
**What goes wrong:** `SocketModeClient` throws `"Must provide an App-Level Token"` at construction time.
**Why it happens:** `SocketModeReceiver` requires `appToken` (an App-Level Token with `xapp-` prefix), distinct from the bot token (`xoxb-`). The App-Level Token is what `apps.connections.open` is called with.
**How to avoid:** Seed a separate `xapp-` prefixed token in the twin for Socket Mode tests. The twin's `apps.connections.open` handler just needs to validate it (or skip validation for test simplicity).

### Pitfall 4: AwsLambdaReceiver ack not called — timeout log in tests
**What goes wrong:** After the test's assertion completes, a `console.error` fires 3 seconds later: "An incoming event was not acknowledged within 3001 ms."
**Why it happens:** `unhandledRequestTimeoutMillis` defaults to 3001. If the listener calls `ack()` but the `setTimeout` ref isn't cleared, it fires anyway in edge cases.
**How to avoid:** Set `unhandledRequestTimeoutMillis: 100` in test receivers. This also makes tests run faster.

### Pitfall 5: Manifest file naming — package name transformation
**What goes wrong:** `check-drift.ts` can't find the manifest file for a package because the file name derivation is wrong.
**Why it happens:** The manifest naming convention strips the `@` scope prefix and replaces `/` with `-`. So `@slack/bolt` → `slack-bolt`.
**How to avoid:** Derive the filename as `pkgName.replace(/^@/, '').replace('/', '-') + '@' + pin.version + '.json'`. Verify against the actual files in `tools/sdk-surface/manifests/`.
**Warning signs:** `ENOENT` errors in the manifest staleness check for scope-prefixed packages.

### Pitfall 6: Bolt receiver symbols in manifest — `SocketModeReceiver.client.*` noise
**What goes wrong:** Many `SocketModeReceiver.client.*` members are in the manifest (WebSocket internals), but they cannot be meaningfully "tested" at the SDK conformance level.
**Why it happens:** `ts-morph` recurses into the `SocketModeClient` type via the `client` property, exposing internal implementation members.
**How to avoid:** Only promote to `live` the three meaningful top-level methods: `SocketModeReceiver.init`, `SocketModeReceiver.start`, `SocketModeReceiver.stop`, plus the `SocketModeReceiver` class itself. Leave all `client.*` members as `deferred`. Same for `AwsLambdaReceiver`: promote `init`, `start`, `stop`, `toHandler`.

---

## Code Examples

Verified patterns from upstream source:

### SocketModeClient WebSocket message format (events_api)
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/socket-mode/src/SocketModeClient.ts
// What the broker must send to trigger a Bolt app.event() listener:
{
  type: 'events_api',
  envelope_id: 'unique-id',
  payload: {
    token: 'verification-token',
    team_id: 'T_TWIN',
    api_app_id: 'A_TWIN',
    event: {
      type: 'app_mention',   // matches app.event('app_mention')
      user: 'U_TEST',
      text: '<@U_BOT_TWIN> hello',
      channel: 'C_GENERAL',
      event_ts: '1234567890.000100',
    },
    type: 'event_callback',
    event_id: 'Ev_UNIQUE',
    event_time: 1234567890,
    authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
  },
  accepts_response_payload: false,
}
```

### SocketModeClient acknowledgement format
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/socket-mode/src/SocketModeClient.ts
// What the broker receives after Bolt listener calls ack():
{
  envelope_id: 'unique-id',  // same envelope_id as the delivered event
  payload: {}                 // empty or ack body
}
```

### AwsLambdaReceiver url_verification response
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/AwsLambdaReceiver.ts
// Response shape for url_verification:
{
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ challenge: body.challenge }),
}
```

### AwsLambdaReceiver invalid signature response
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/AwsLambdaReceiver.ts
// AwsLambdaReceiver returns 401 (not 403) for invalid signatures
{ statusCode: 401, body: '' }
```

### AwsEventV1 shape
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/AwsLambdaReceiver.ts
interface AwsEventV1 {
  body: string | null;
  headers: Record<string, string | undefined>;
  isBase64Encoded: boolean;
  pathParameters: Record<string, string | undefined> | null;
  queryStringParameters: Record<string, string | undefined> | null;
  requestContext: any;
  stageVariables: Record<string, string | undefined> | null;
  httpMethod: string;
  multiValueHeaders: Record<string, string[] | undefined>;
  multiValueQueryStringParameters: Record<string, string[] | undefined>;
  path: string;
  resource: string;
}
```

### SocketModeReceiver construction (redirecting to twin)
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/SocketModeReceiver.ts
// clientOptions.slackApiUrl redirects the WebClient used for apps.connections.open
const receiver = new SocketModeReceiver({
  appToken: 'xapp-1-test-app-token',
  installerOptions: {
    clientOptions: {
      slackApiUrl: process.env.SLACK_API_URL + '/api/',
    },
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 14 drift: version + submodule ref only | Phase 20 drift: + manifest staleness | Phase 20 | Ensures generated manifests are not silently out of date with submodule |
| No SocketMode or Lambda receiver tests | Full receiver harness with ws.Server broker and direct invocation | Phase 20 | Closes SLCK-12 — completes 100% of v1.1 Slack SDK receiver surface |

**Deprecated/outdated:**
- `check-drift.ts` line 151 TODO comment: becomes real implementation in Phase 20.

---

## Open Questions

1. **SocketModeReceiver `autoReconnectEnabled` exposure**
   - What we know: `SocketModeReceiver` constructor does not expose `autoReconnectEnabled` to callers — it passes only `appToken`, `logLevel`, `logger`, and `installerOptions.clientOptions` to `SocketModeClient`. The `SocketModeClient` default is `autoReconnectEnabled: true`.
   - What's unclear: Whether calling `receiver.stop()` before closing the `ws.Server` reliably prevents reconnect attempts in all test scenarios.
   - Recommendation: Always call `receiver.stop()` first in `finally`, then close the `ws.Server`. The `stop()` method calls `client.disconnect()` which sets `shuttingDown = true`, and the `close` event handler checks `shuttingDown` before reconnecting.

2. **`apps.connections.open` twin stub — xapp- token seeding**
   - What we know: The Slack twin's `extractToken()` / `slackStateManager.getToken()` checks token records. `xapp-` tokens (App-Level Tokens) differ from `xoxb-` (bot tokens). The existing `seedSlackBotToken` helper seeds `tokenType: 'bot'`.
   - What's unclear: Whether the twin's token validator accepts `xapp-` tokens, or whether a new `tokenType: 'app'` path is needed.
   - Recommendation: Add `tokenType: 'app'` support to the `seedSlackBotToken` helper (or create `seedSlackAppToken`), and ensure `slackStateManager.getToken()` returns a non-null result for `xapp-` tokens. The `apps.connections.open` stub only needs token presence, not type validation.

3. **Manifest generatedAt precision**
   - What we know: `generate-report.ts` sets `generatedAt: new Date().toISOString()`. The comparison in `check-drift.ts` will compare this to `git log -1 --format="%cI"` which returns ISO 8601.
   - What's unclear: Whether timezone differences between ISO strings cause false positives (both should be UTC, but `%cI` uses local timezone for git).
   - Recommendation: Parse both as `Date` objects and compare timestamps. Use `git log -1 --format="%ct"` (Unix timestamp) instead of `%cI` to avoid timezone parsing ambiguity.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -E "(PASS\|FAIL\|✓\|✗)"` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-12 | SocketModeReceiver delivers events via ws.Server broker and acks | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | Wave 0 |
| SLCK-12 | AwsLambdaReceiver url_verification returns challenge | unit | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | Wave 0 |
| SLCK-12 | AwsLambdaReceiver rejects invalid HMAC signatures (401) | unit | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | Wave 0 |
| SLCK-12 | AwsLambdaReceiver delivers event to app listener and acks | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep slck12` | Wave 0 |
| INFRA-14 | check-drift.ts manifest staleness gate fails on stale manifest | unit | `pnpm drift:check` | Wave 0 |
| INFRA-14 | LIVE_SYMBOLS entries for SocketModeReceiver and AwsLambdaReceiver in generate-report.ts | ledger | `pnpm coverage:generate && pnpm drift:check` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm drift:check`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** `pnpm test:sdk && pnpm drift:check` — both green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts` — covers SLCK-12 (SocketModeReceiver)
- [ ] `tests/sdk-verification/sdk/slack-bolt-aws-lambda-receiver.test.ts` — covers SLCK-12 (AwsLambdaReceiver)
- [ ] `POST /api/apps.connections.open` route in Slack twin (new stub in `stubs.ts` or new `sockets.ts` plugin)
- [ ] `POST /admin/set-wss-url` admin endpoint in Slack twin
- [ ] `setWssUrl(url)` / `getWssUrl()` methods in `SlackStateManager`
- [ ] Manifest staleness gate in `check-drift.ts` (replacing TODO comment at line 151)
- [ ] Phase 20 LIVE_SYMBOLS entries in `generate-report.ts` for `@slack/bolt@4.6.0/SocketModeReceiver` and `@slack/bolt@4.6.0/AwsLambdaReceiver` families

---

## Sources

### Primary (HIGH confidence)
- `third_party/upstream/bolt-js/src/receivers/SocketModeReceiver.ts` — constructor, start/stop, SocketModeClient options
- `third_party/upstream/bolt-js/src/receivers/AwsLambdaReceiver.ts` — toHandler(), HMAC verification, AwsEvent types, AwsResponse
- `third_party/upstream/node-slack-sdk/packages/socket-mode/src/SocketModeClient.ts` — retrieveWSSURL(), onWebSocketMessage(), hello frame requirement, ack format
- `third_party/upstream/node-slack-sdk/packages/socket-mode/src/SlackWebSocket.ts` — WebSocket connection lifecycle
- `third_party/upstream/bolt-js/src/receivers/SocketModeResponseAck.ts` — ack binding
- `tools/sdk-surface/manifests/slack-bolt@4.6.0.json` — confirmed SocketModeReceiver.{init,start,stop} and AwsLambdaReceiver.{init,start,stop,toHandler} as class members
- `tests/sdk-verification/drift/check-drift.ts` — existing drift check structure and the Phase 20 TODO on line 151
- `tests/sdk-verification/coverage/generate-report.ts` — LIVE_SYMBOLS pattern and manifest file naming
- `tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts` — Phase 19 HTTPReceiver patterns (signRequest, token seeding, server lifecycle)

### Secondary (MEDIUM confidence)
- `tests/sdk-verification/setup/seeders.ts` — seedSlackBotToken pattern (xapp- token seeding may need extension)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ws already in devDeps, all other tools established in prior phases
- Architecture: HIGH — all key implementation details verified from upstream source; SocketModeClient message format and AwsLambdaReceiver return values confirmed from source
- Pitfalls: HIGH — reconnect loop, hello frame requirement, and manifest naming all verified from source code
- Drift hardening: HIGH — existing check-drift.ts structure and manifest format confirmed from files

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable — SDK versions pinned, no fast-moving dependencies)
