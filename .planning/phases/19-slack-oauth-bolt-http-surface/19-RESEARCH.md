# Phase 19: Slack OAuth & Bolt HTTP Surface - Research

**Researched:** 2026-03-09
**Domain:** `@slack/oauth` InstallProvider flows, `@slack/bolt` App listener APIs, HTTPReceiver and ExpressReceiver
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-09 | `InstallProvider` flows (`handleInstallPath`, `generateInstallUrl`, `handleCallback`, `authorize`) work against the Slack twin with valid state, cookie, redirect, and installation-store behavior | InstallProvider hits `/oauth/v2/authorize` (redirect) and `oauth.v2.access` (token exchange). The twin's `oauthPlugin` already implements both endpoints, but they need to be extended to support the full `handleCallback` flow — specifically, `handleCallback` calls `oauth.v2.access` then calls `auth.test` on the returned bot token. The twin's `auth.test` endpoint already works. The twin's `oauth.v2.access` response must include `is_enterprise_install`, `app_id`, and `bot_user_id` fields that `handleCallback` reads. State management is done client-side by `ClearStateStore` using JWT signed with `stateSecret` — the twin does not need to implement any server-side state storage. |
| SLCK-10 | Bolt `App` listener APIs (`event`, `message`, `action`, `command`, `options`, `shortcut`, `view`, `function`, and `assistant`) handle twin-backed requests with correct ack semantics | Bolt `App.processEvent()` receives `ReceiverEvent` objects from the receiver. For SDK conformance tests, the test drives the `App` directly by calling `app.processEvent()` with constructed payloads — no live HTTP server required. The twin provides the Slack API (for `client.auth.test` during init and any `say()` calls). Each listener type requires specific body shapes verified from bolt-js source. |
| SLCK-11 | `HTTPReceiver` and `ExpressReceiver` verify requests, satisfy URL verification, support `response_url` flows, and honor custom routes against the Slack twin | HTTPReceiver uses `verifySlackRequest()` — HMAC-SHA256 of `v0:{timestamp}:{body}` with signing secret. The twin already has a signing secret (`signingSecret` decorated on the fastify instance). Tests must generate valid signatures using the same secret. URL verification (`type: 'url_verification'`) is handled by HTTPReceiver before dispatching to Bolt — twin serves nothing special, SDK handles it internally. Custom routes are plain HTTP handlers registered on the receiver object. `response_url` is already implemented in the twin (`/response-url/:id`). |
</phase_requirements>

---

## Summary

Phase 19 adds three distinct SDK layers on top of the existing Slack twin infrastructure: `@slack/oauth` `InstallProvider` flows (SLCK-09), `@slack/bolt` `App` listener APIs (SLCK-10), and `HTTPReceiver`/`ExpressReceiver` request processing (SLCK-11).

The Slack twin's `oauthPlugin` already implements `/oauth/v2/authorize` and `/api/oauth.v2.access` but needs augmentation: `handleCallback` calls `auth.test` on the returned bot token to get `bot_id`, and the `oauth.v2.access` response must include `is_enterprise_install: false` and an `enterprise: null` field or the SDK's Installation object construction will fail. The `ClearStateStore` used by `InstallProvider` is pure client-side JWT — no twin endpoints needed for state management. The authorize flow depends on an `InstallationStore` (in-memory by default) that the test populates after a successful callback.

For SLCK-10, Bolt `App` listener tests do not require the full HTTP server to be running against the twin. The test pattern is: instantiate `App` with `token` pointing to the twin for `auth.test` init, register listeners, then call `app.processEvent()` directly with synthetic payloads. This bypasses receiver machinery and tests the listener APIs (`.event()`, `.message()`, `.action()`, etc.) in isolation. Only the `client` used inside handlers for `say()` or `client.*` calls needs to reach the twin.

For SLCK-11, `HTTPReceiver` and `ExpressReceiver` are tested by spinning up the receiver as an HTTP server on a random port, then sending properly-signed requests from the test. The signing secret must match between the twin and the receiver. The twin's existing `signingSecret` env var pattern covers this.

**Primary recommendation:** Test the three SDK layers independently. SLCK-09 tests drive `InstallProvider` methods directly (no live receiver HTTP server). SLCK-10 tests call `app.processEvent()` directly. SLCK-11 tests spin up a standalone `HTTPReceiver` or `ExpressReceiver` server and POST signed requests to it.

---

## Standard Stack

### Core (all pre-existing — no new installs required for twin side)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@slack/oauth` | 3.0.4 | `InstallProvider` under test (SLCK-09) | Pinned at workspace root devDependencies |
| `@slack/bolt` | 4.6.0 | `App`, `HTTPReceiver`, `ExpressReceiver` under test (SLCK-10/11) | Pinned at workspace root devDependencies |
| `@slack/web-api` | 7.14.1 | `WebClient` — Bolt uses it internally for `auth.test` and `client.*` | Already installed |
| `fastify` | ^5.x | Slack twin HTTP server | All existing plugins use this |
| `vitest` | ^3.0.0 | Test runner | Established in sdk-verification workspace |
| `jsonwebtoken` | (transitive) | `ClearStateStore` uses it to sign/verify state JWTs | Do NOT hand-roll JWT verification |
| `express` | (transitive via bolt) | `ExpressReceiver` depends on express | Already transitive |

### New test-side dependencies (may need to add to sdk-verification devDependencies)
| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| `node:crypto` | built-in | Generate valid HMAC signatures for SLCK-11 tests | Already used in twin |
| `node:http` | built-in | Spin up `HTTPReceiver` standalone server in tests | No install needed |

**No new npm packages need to be added to the twin.** The `@slack/bolt` and `@slack/oauth` packages are already at the workspace root as devDependencies. The sdk-verification workspace may need to add them explicitly if pnpm hoistPattern prevents access.

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
tests/sdk-verification/sdk/
├── slack-oauth-install-provider.test.ts   (NEW — SLCK-09: InstallProvider flows)
├── slack-bolt-app-listeners.test.ts       (NEW — SLCK-10: App listener APIs + ack semantics)
└── slack-bolt-http-receivers.test.ts      (NEW — SLCK-11: HTTPReceiver + ExpressReceiver)

twins/slack/src/plugins/
└── oauth.ts                               (MODIFY — augment oauth.v2.access response shape)
```

No new twin plugins are required. The twin's existing infrastructure (OAuth endpoints, auth.test, signing secret, events-api, interactions, response-url) already supports all Phase 19 flows.

### Pattern 1: InstallProvider Test Pattern (SLCK-09)

**What:** Test `InstallProvider` methods by calling them directly with a mock `IncomingMessage`/`ServerResponse`. The SDK internally calls `oauth.v2.access` on the twin.

**Critical pre-work:** The twin's `oauth.v2.access` response currently lacks `is_enterprise_install` and returns `ok: true` + tokens, but `handleCallback` reads `v2Resp.is_enterprise_install` (which is `undefined` → falsy, OK) and then calls `runAuthTest(v2Resp.access_token, clientOptions)` — meaning it POSTs to `auth.test` using the returned bot token. The `auth.test` endpoint is already live in the twin from Phase 14. However, `clientOptions` passed to `noTokenClient` will use the default `slackApiUrl` (`https://slack.com`), not the twin. To redirect `InstallProvider`'s internal WebClient to the twin, pass `clientOptions: { slackApiUrl: twinUrl + '/api/' }` to the `InstallProvider` constructor.

**Example — handleCallback flow:**
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/oauth/src/install-provider.ts line 609
// handleCallback() calls:
//   1. this.noTokenClient.oauth.v2.access({ code, client_id, client_secret, redirect_uri })
//   2. runAuthTest(v2Resp.access_token, this.clientOptions)  → calls auth.test on the bot token
//   3. this.installationStore.storeInstallation(installation)

// Test setup:
const slackApiUrl = process.env.SLACK_API_URL! + '/api/';
const installer = new InstallProvider({
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  stateSecret: 'test-state-secret',
  clientOptions: { slackApiUrl },   // redirect internal WebClient to twin
  installationStore: new MemoryInstallationStore(),
});
```

**handleInstallPath flow:**
```typescript
// handleInstallPath() calls:
//   1. this.stateStore.generateStateParam() — client-side JWT, no twin call
//   2. this.generateInstallUrl() — builds URL from authorizationUrl (must be redirected to twin)
//   3. Sets Set-Cookie header with state JWT
//   4. Redirects to the authorizationUrl OR renders HTML

// Override authorizationUrl to point to twin's /oauth/v2/authorize:
const installer = new InstallProvider({
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  stateSecret: 'test-state-secret',
  authorizationUrl: process.env.SLACK_API_URL + '/oauth/v2/authorize',
  clientOptions: { slackApiUrl },
  installationStore: new MemoryInstallationStore(),
});
```

**handleCallback with cookie-based state verification:**
```typescript
// handleCallback() requires state cookie to match state in query params
// ClearStateStore verifies: cookie value === query state param

// Test pattern — build synthetic IncomingMessage + ServerResponse:
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

function makeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.url = url;
  Object.assign(req.headers, headers);
  return req;
}

function makeRes(): { res: ServerResponse; captured: { headers: Record<string, string[]>; statusCode: number; body: string } } {
  const captured = { headers: {} as Record<string, string[]>, statusCode: 200, body: '' };
  const res = {
    setHeader(name: string, value: string | string[]) { captured.headers[name] = Array.isArray(value) ? value : [value]; },
    getHeader(name: string) { return captured.headers[name]; },
    writeHead(code: number) { captured.statusCode = code; },
    end(body = '') { captured.body = body; },
  } as unknown as ServerResponse;
  return { res, captured };
}
```

### Pattern 2: Bolt App Listener Test Pattern (SLCK-10)

**What:** Create a Bolt `App` instance with `token` pointing to the twin (for `auth.test` init), register listeners, call `app.processEvent()` directly with synthetic payloads.

**Critical:** `App` with a `token` calls `auth.test` during `init()` if `tokenVerificationEnabled` is true (default). The token must be seeded in the twin before calling `app.init()`.

```typescript
// Source: third_party/upstream/bolt-js/src/App.ts line 474
// this.client.auth.test({ token: this.argToken }) called during init()
// Requires auth.test to succeed — use seedSlackBotToken() + resetSlack() before each test

// App setup pattern for SLCK-10 tests:
const token = await seedSlackBotToken();  // ensures twin has this token
const app = new App({
  token,
  signingSecret: 'test-signing-secret',  // any value — signatureVerification disabled in tests
  signatureVerification: false,           // disable for direct processEvent() tests
  clientOptions: {
    slackApiUrl: process.env.SLACK_API_URL + '/api/',
  },
});
// app.init() is called automatically in constructor when deferInitialization is false (default)
// But auth.test IS called during this — so twin must be running
```

**ReceiverEvent shape for each listener type:**
```typescript
// Source: third_party/upstream/bolt-js/src/App.ts lines 925-930
// App.processEvent() reads body.type to determine IncomingEventType

// Event listener test:
await app.processEvent({
  body: {
    type: 'event_callback',
    team_id: 'T_TWIN',
    api_app_id: 'A_TWIN',
    event: { type: 'app_mention', text: 'hello', user: 'U_TEST', ts: '123.456', channel: 'C_GENERAL' },
    authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
  },
  ack: async () => {},
});

// Message listener test:
await app.processEvent({
  body: {
    type: 'event_callback',
    team_id: 'T_TWIN',
    event: { type: 'message', text: 'hello world', user: 'U_TEST', ts: '123.456', channel: 'C_GENERAL' },
    authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
  },
  ack: async () => {},
});

// Action listener test:
await app.processEvent({
  body: {
    type: 'block_actions',
    team: { id: 'T_TWIN' },
    user: { id: 'U_TEST', team_id: 'T_TWIN' },
    actions: [{ action_id: 'my_button', block_id: 'my_block', type: 'button', value: 'click' }],
    token: 'gIkuvaNzQIHg97ATvDxqgjtO',
    trigger_id: 'trigger_id_value',
    authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
  },
  ack: async () => {},
});

// Command listener test:
await app.processEvent({
  body: {
    type: undefined,        // Commands have no type field — command is inferred from command field
    command: '/test',
    team_id: 'T_TWIN',
    user_id: 'U_TEST',
    channel_id: 'C_GENERAL',
    text: 'arg1',
    token: 'gIkuvaNzQIHg97ATvDxqgjtO',
    trigger_id: 'trigger_id_value',
  },
  ack: async () => {},
});

// View submission listener test:
await app.processEvent({
  body: {
    type: 'view_submission',
    team: { id: 'T_TWIN' },
    user: { id: 'U_TEST', team_id: 'T_TWIN' },
    view: { callback_id: 'my_modal', type: 'modal', id: 'V_TEST', state: { values: {} } },
    authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
  },
  ack: async () => {},
});
```

**Ack semantics:** The `ack` function in `ReceiverEvent` is what the listener must call (via `ack()` in the listener args). If a listener doesn't call `ack()` within `unhandledRequestTimeoutMillis` (3001ms default), Bolt sends a 404-equivalent. For `processEvent()` tests, `ack` is just a resolved promise — test that the listener is called and the `ack` inside the listener is invoked.

```typescript
// Pattern: use a spy on ack to verify it was called
it('event listener receives app_mention and acks', async () => {
  const ackSpy = vi.fn().mockResolvedValue(undefined);
  let receivedEvent: any;
  app.event('app_mention', async ({ event, ack }) => {
    receivedEvent = event;
    await ack();
    ackSpy();
  });
  await app.processEvent({ body: { /* app_mention payload */ }, ack: async () => {} });
  expect(ackSpy).toHaveBeenCalled();
  expect(receivedEvent.text).toContain('hello');
});
```

**Note on `ignoreSelf` middleware:** By default, Bolt registers an `ignoreSelf` middleware that filters events where the bot is the author. If test payloads use `U_BOT_TWIN` as the event user, the event will be silently dropped. Use `U_TEST` (a non-bot user) in test event payloads.

**Assistant API pattern:** Bolt's `app.assistant()` registers an `Assistant` middleware. The `Assistant` class is from `third_party/upstream/bolt-js/src/Assistant.ts`. For SLCK-10, testing `app.assistant()` means verifying that `Assistant` middleware routes `assistant_thread_started`, `assistant_thread_context_changed`, and `message` events with the right context. The twin does not need any new routes for this — the test uses direct `processEvent()`.

**Function API pattern:** `app.function(callbackId, listener)` handles `function_executed` events. Again, `processEvent()` with body `{ type: 'function_executed', function_execution_id: 'Fx...', ... }` triggers it.

### Pattern 3: HTTPReceiver Standalone Test Pattern (SLCK-11)

**What:** Spin up an `HTTPReceiver` as a local HTTP server, POST signed requests to it, verify that listeners are triggered and `ack()` is called.

**Why standalone:** `HTTPReceiver.start()` returns a `Promise<Server>` — it creates its own `http.Server`. In tests, call `start(0)` (port 0 for random port assignment), get the port from `server.address().port`, POST to it, then call `stop()` in afterEach.

**Request signing:** `verifySlackRequest()` computes `v0={timestamp}:{rawBody}` HMAC-SHA256 with signing secret. Tests must generate valid signatures.

```typescript
// Source: third_party/upstream/bolt-js/src/receivers/verify-request.ts line 59-63
// HMAC format: `v0:${requestTimestampSec}:${body}` signed with signingSecret

import { createHmac } from 'node:crypto';

function signRequest(body: string, signingSecret: string, timestampSec?: number): Record<string, string> {
  const ts = timestampSec ?? Math.floor(Date.now() / 1000);
  const sigBase = `v0:${ts}:${body}`;
  const hmac = createHmac('sha256', signingSecret);
  hmac.update(sigBase);
  const signature = `v0=${hmac.digest('hex')}`;
  return {
    'x-slack-signature': signature,
    'x-slack-request-timestamp': String(ts),
    'content-type': 'application/json',
  };
}

// Test pattern:
const signingSecret = 'test-signing-secret';
const app = new App({
  token,
  receiver: new HTTPReceiver({
    signingSecret,
    endpoints: ['/slack/events'],
  }),
  clientOptions: { slackApiUrl: process.env.SLACK_API_URL + '/api/' },
});

it('HTTPReceiver: URL verification challenge', async () => {
  const body = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });
  const headers = signRequest(body, signingSecret);
  const server = await app.start(0);
  const port = (server.address() as AddressInfo).port;

  const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
    method: 'POST',
    headers,
    body,
  });
  const result = await res.json();
  expect(result.challenge).toBe('abc123');
  await app.stop();
});
```

**response_url flow test:** The twin already serves `POST /response-url/:id` (from `interactionsPlugin`). For SLCK-11, testing `response_url` means verifying that Bolt's `respond()` function (which `say()` uses for commands and actions) posts to the given `response_url`. The test sends an action payload with `response_url` pointing to the twin's endpoint, then verifies the twin received the message.

**Custom routes test:**
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/HTTPReceiver.ts line 74-99
// customRoutes: CustomRoute[] — each has { path, method, handler }

const receiver = new HTTPReceiver({
  signingSecret,
  customRoutes: [{
    path: '/health',
    method: 'GET',
    handler: (req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
    },
  }],
});
```

**ExpressReceiver pattern:**
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/ExpressReceiver.ts line 145-223
// ExpressReceiver.app is an Express Application
// ExpressReceiver.router is an Express IRouter — attach additional routes to it

const receiver = new ExpressReceiver({
  signingSecret,
  endpoints: { events: '/slack/events' },
});
// receiver.app is express(); receiver.router has the events endpoint registered
// Attach custom routes before starting server
receiver.router.get('/custom', (req, res) => res.json({ ok: true }));
```

### Pattern 4: oauth.v2.access Response Shape Fix

**What:** `InstallProvider.handleCallback()` calls `this.noTokenClient.oauth.v2.access()` then reads specific fields. The existing twin response is missing fields that cause the SDK to fail.

**Required response shape** (from `install-provider.ts` line 617-647):
```typescript
// oauth.v2.access must return:
{
  ok: true,
  access_token: 'xoxb-...',         // bot token (required for bot installation)
  token_type: 'bot',
  scope: 'chat:write,...',
  bot_user_id: 'U_BOT_TWIN',
  app_id: 'A_TWIN',
  team: { name: 'Twin Workspace', id: 'T_TWIN' },  // team is a REQUIRED object, not null (for non-enterprise)
  enterprise: null,                   // MUST be null for non-enterprise (not undefined)
  is_enterprise_install: false,       // MUST be present (SDK reads this field)
  authed_user: {
    id: 'U_AUTHED',
    scope: 'channels:read,...',
    access_token: 'xoxp-...',
    token_type: 'user',
  },
}
```

**Current twin response** (from `twins/slack/src/plugins/oauth.ts`) is missing `enterprise: null` and `is_enterprise_install: false`. These fields need to be added.

Additionally, `handleCallback` calls `runAuthTest(v2Resp.access_token, this.clientOptions)` to get `bot_id`. This internally calls `auth.test` with the bot token — which means the bot token returned by `oauth.v2.access` must be valid in the twin. The current twin creates the token in `slackStateManager.createToken()` so it IS valid, and `auth.test` is already live. This chain will work if `clientOptions: { slackApiUrl }` is passed to `InstallProvider`.

### Pattern 5: authorize() Flow for SLCK-09

**What:** `InstallProvider.authorize()` is called by Bolt with an `InstallationQuery` to look up the stored installation. It reads from the `InstallationStore` and returns an `AuthorizeResult` with `botToken`, `botId`, `botUserId`, `teamId`.

**Test pattern:** After a successful `handleCallback()` call, the `MemoryInstallationStore` has the installation stored. Then call `authorize()` with the right query:

```typescript
// Source: install-provider.ts line 177-293
// authorize() calls installationStore.fetchInstallation(source, logger)
// Returns AuthorizeResult with botToken, botId, botUserId, teamId

const authResult = await installer.authorize({
  teamId: 'T_TWIN',
  enterpriseId: undefined,
  userId: 'U_TEST',
  conversationId: 'C_GENERAL',
  isEnterpriseInstall: false,
});
expect(authResult.botToken).toMatch(/^xoxb-/);
expect(authResult.botId).toBe('B_BOT_TWIN');
```

**Note:** `authorize()` also handles token rotation (bot/user refresh tokens). For SDK conformance, the test uses `MemoryInstallationStore` without rotation — no twin endpoints needed for token refresh. If token refresh is tested, the twin's `oauth.v2.access` already handles `grant_type: 'refresh_token'` requests (current implementation ignores grant_type and returns new tokens).

### Pattern 6: Coverage Ledger Key Format for @slack/oauth and @slack/bolt

**What:** The manifest for `@slack/oauth@3.0.4` has 34 symbols. The manifest for `@slack/bolt@4.6.0` has 202 symbols. LIVE_SYMBOLS keys follow the format `@{package}@{version}/{symbolPath}`.

**Critical note on bolt manifest:** The `App` class manifest has `client.slackApiUrl.*` members (all the String prototype methods) — these are an artifact of ts-morph resolving the `slackApiUrl: string` property recursively. These should be classified as `deferred` (they are not real API surfaces). The meaningful Bolt App members are: `init`, `use`, `assistant`, `step`, `function`, `start`, `stop`, `event`, `message`, `shortcut`, `action`, `command`, `options`, `view`, `error`, `processEvent`.

**Key format examples:**
```typescript
// @slack/oauth
'@slack/oauth@3.0.4/InstallProvider': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.authorize': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.handleInstallPath': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.generateInstallUrl': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.handleCallback': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.stateStore.generateStateParam': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.stateStore.verifyStateParam': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.installationStore.storeInstallation': 'sdk/slack-oauth-install-provider.test.ts',
'@slack/oauth@3.0.4/InstallProvider.installationStore.fetchInstallation': 'sdk/slack-oauth-install-provider.test.ts',

// @slack/bolt - App class listener methods
'@slack/bolt@4.6.0/App': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.init': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.event': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.message': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.action': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.command': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.options': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.shortcut': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.view': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.function': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.assistant': 'sdk/slack-bolt-app-listeners.test.ts',
'@slack/bolt@4.6.0/App.processEvent': 'sdk/slack-bolt-app-listeners.test.ts',

// @slack/bolt - HTTP receivers
'@slack/bolt@4.6.0/HTTPReceiver': 'sdk/slack-bolt-http-receivers.test.ts',
'@slack/bolt@4.6.0/ExpressReceiver': 'sdk/slack-bolt-http-receivers.test.ts',
```

### Anti-Patterns to Avoid

- **Pointing InstallProvider's internal WebClient to the real Slack API:** `clientOptions.slackApiUrl` must be passed to redirect `auth.test` and `oauth.v2.access` calls to the twin.
- **Using `U_BOT_TWIN` as event user in processEvent() tests:** `ignoreSelf` middleware filters these. Use `U_TEST` as the sending user.
- **Forgetting `enterprise: null` in oauth.v2.access response:** The SDK reads `v2Resp.enterprise == null` to determine if it's a non-enterprise install. `undefined` is NOT the same as `null` here — the SDK uses `==` but the Installation object shape differs.
- **Starting HTTPReceiver on a fixed port in tests:** Use port `0` for random assignment. Fixed ports can conflict with the twin server.
- **Testing Bolt App without `signatureVerification: false`:** For direct `processEvent()` tests, there is no actual HTTP request, so signature verification is irrelevant. Disable it to avoid needing to compute valid signatures for programmatic tests.
- **Importing `App` as named export:** Bolt's `App` is the `default` export from `@slack/bolt`. Use `import App from '@slack/bolt'` or `import { App } from '@slack/bolt'` (both work per the bolt index).
- **Testing response_url with the twin's signing secret mismatch:** The `signingSecret` in `HTTPReceiver` must match the twin's `SLACK_SIGNING_SECRET` env var when the receiver posts back. For SLCK-11, the test controls both ends — use a deterministic secret shared between receiver and assertion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT state signing | Custom state store | `ClearStateStore(stateSecret)` from `@slack/oauth` | Already handles exp, HMAC verification, and cookie round-trip |
| HMAC request signing in tests | Custom signature builder | `createHmac('sha256', secret).update('v0:{ts}:{body}').digest('hex')` with `v0=` prefix | Exact format from verify-request.ts; any deviation fails |
| Installation storage in tests | Custom store | `MemoryInstallationStore()` from `@slack/oauth` | Built-in; persists across handleCallback → authorize round-trip |
| Body parsing in ExpressReceiver | Custom middleware | Express `rawBody` + `tsscmp` already in ExpressReceiver | ExpressReceiver handles body parsing + signature verification internally |
| App listener dispatch | Duplicate processEvent logic | `app.processEvent(event)` | Call the SDK's own dispatch method — tests actual middleware chain |
| Event payload construction | External fixture files | Inline synthetic payloads in tests | Payloads are small enough; inlining makes tests self-contained |

---

## Common Pitfalls

### Pitfall 1: InstallProvider clientOptions Not Redirected to Twin
**What goes wrong:** `InstallProvider` creates a `new WebClient(undefined, this.clientOptions)` for its internal calls (`auth.test`, `oauth.v2.access`). If `clientOptions.slackApiUrl` is not set, all internal calls go to `https://slack.com/api/` — fail with ECONNREFUSED or DNS error in tests.
**Why it happens:** The constructor default is `clientOptions = {}`, and `WebClient` defaults `slackApiUrl` to `https://slack.com`.
**How to avoid:** Always pass `clientOptions: { slackApiUrl: process.env.SLACK_API_URL + '/api/' }` to `InstallProvider`.
**Warning signs:** Network errors mentioning `slack.com`, or `ENOTFOUND` in test output.

### Pitfall 2: oauth.v2.access Missing Required Fields
**What goes wrong:** `handleCallback` reads `v2Resp.is_enterprise_install`, `v2Resp.enterprise`, `v2Resp.team`. If these are missing, the `Installation` object has `undefined` values, and `storeInstallation` may fail or `authorize` may return an incomplete `AuthorizeResult`.
**Why it happens:** The existing twin `oauth.v2.access` was written for WebClient test access (Phase 14), not for full `handleCallback` conformance.
**How to avoid:** Add `enterprise: null, is_enterprise_install: false` to the twin's `oauth.v2.access` response. Verify against the exact fields read in `install-provider.ts` lines 617-647.
**Warning signs:** `authorize()` returns `{}` (empty AuthorizeResult), or `handleCallback` throws `UnknownError`.

### Pitfall 3: Bolt processEvent Skips Unmatched Listeners Silently
**What goes wrong:** If no listener matches the event body, `processEvent()` logs a warning and returns without calling `ack()`. The test `ack` spy is never called, and the test may hang on a promise (if `ack()` was awaited for a response).
**Why it happens:** `getTypeAndConversation(body)` returns `{ type: undefined }` for malformed payloads, or the listener constraint doesn't match.
**How to avoid:** Use exact body shapes from bolt-js source. For event listener tests, ensure `body.type === 'event_callback'` and `body.event.type` matches the listener's registered event type.
**Warning signs:** Warning log `Could not determine the type of an incoming event`, or test assertion fails because `ackSpy` was never called.

### Pitfall 4: ignoreSelf Drops Bot-Authored Events
**What goes wrong:** Bolt's default `ignoreSelf` middleware filters events where `body.event.bot_id === context.botId` OR `body.event.user === context.botUserId`. If the test uses `U_BOT_TWIN` as the event user, the event is silently dropped.
**Why it happens:** `ignoreSelf: true` is the default in `App` constructor.
**How to avoid:** Use `U_TEST` (or any non-bot user ID) as the event sender in test payloads. Alternatively, set `ignoreSelf: false` in `AppOptions` for tests that specifically need to test bot-event handling.
**Warning signs:** Listener callback never called despite matching event type.

### Pitfall 5: HTTPReceiver Port Conflicts
**What goes wrong:** If `HTTPReceiver` tests use a fixed port (e.g., `3000`) that conflicts with a running twin, tests fail with `EADDRINUSE`.
**Why it happens:** Port 0 (OS-assigned random port) is not the default; the default is `3000`.
**How to avoid:** Always call `app.start(0)` (not `app.start(3000)`) and get the port from `server.address().port`. Clean up with `app.stop()` in `afterEach`.

### Pitfall 6: ExpressReceiver Requires express as a Direct Dependency
**What goes wrong:** `ExpressReceiver` imports from `express` and `raw-body`. If these are not accessible from the `sdk-verification` workspace (pnpm hoistPattern isolation), import fails.
**Why it happens:** pnpm's hoistPattern may keep `express` and `raw-body` as private to `@slack/bolt`'s own node_modules.
**How to avoid:** Check if `express` is accessible from sdk-verification. If not, add `"express": "*"` to sdk-verification's devDependencies. The `@slack/bolt` package already has express listed as a peerDependency.

### Pitfall 7: ClearStateStore Cookie Round-Trip in handleCallback Tests
**What goes wrong:** `handleCallback` extracts the state cookie from `req.headers.cookie` using `extractCookieValue(req, this.stateCookieName)` (cookie name defaults to `slack-app-oauth-state`). If the test mock `IncomingMessage` doesn't have `req.headers.cookie` set with the JWT state value, callback fails with `InvalidStateError: The state parameter is not for this browser session`.
**Why it happens:** Browser security: the state JWT generated by `generateStateParam` is set as a cookie by `handleInstallPath`, and the browser sends it back on the callback. Tests must simulate this cookie echo.
**How to avoid:** Use `stateVerification: false` in `InstallProvider` for the simplest SLCK-09 tests (skips cookie check entirely). OR: call `installer.handleInstallPath()` first, capture the `Set-Cookie` header, then pass it as the `Cookie` header in the `handleCallback` mock request.

### Pitfall 8: @slack/bolt App Manifest Has String-Type Member Noise
**What goes wrong:** The manifest for `@slack/bolt@4.6.0` includes 400+ `client.slackApiUrl.*` and `client.token.*` members (all String prototype methods). These appear in the `App` class members array because ts-morph recursively resolved the `string` type of `slackApiUrl` and `token` properties.
**Why it happens:** ts-morph resolves property types to their members — `string` has `.length`, `.charAt()`, etc.
**How to avoid:** When updating LIVE_SYMBOLS, only attribute real API methods (`event`, `message`, `action`, etc.) and leave all `client.slackApiUrl.*` and `client.token.*` members as `deferred`. Do NOT add hundreds of String prototype methods to LIVE_SYMBOLS.

---

## Code Examples

### Minimal Twin oauth.v2.access Fix
```typescript
// Source: twins/slack/src/plugins/oauth.ts — POST /api/oauth.v2.access
// Add missing fields to the response object:
return {
  ok: true,
  access_token: botToken,
  token_type: 'bot',
  scope: botScopes,
  bot_user_id: 'U_BOT_TWIN',
  app_id: appId,
  enterprise: null,              // ADD: must be null (not undefined) for non-enterprise
  is_enterprise_install: false,  // ADD: required field
  team: { name: 'Twin Workspace', id: teamId },
  authed_user: {
    id: 'U_AUTHED',
    scope: userScopes,
    access_token: userToken,
    token_type: 'user',
  },
};
```

### InstallProvider Full Flow Test (SLCK-09)
```typescript
// Source: pattern derived from third_party/upstream/node-slack-sdk/packages/oauth/src/install-provider.ts
import { InstallProvider } from '@slack/oauth';
import { MemoryInstallationStore } from '@slack/oauth';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

it('handleCallback exchanges code for installation and authorize returns botToken', async () => {
  const slackApiUrl = process.env.SLACK_API_URL! + '/api/';
  const authorizationUrl = process.env.SLACK_API_URL! + '/oauth/v2/authorize';
  const installationStore = new MemoryInstallationStore();

  const installer = new InstallProvider({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    stateVerification: false,  // simplest: skip cookie check
    clientOptions: { slackApiUrl },
    installationStore,
  });

  // Build fake callback request — twin redirected to this URL with code+state
  const code = 'test-auth-code';  // twin's /oauth/v2/authorize generates any UUID, we skip authorize redirect
  const fakeReq = new IncomingMessage(new Socket());
  fakeReq.url = `/slack/oauth_redirect?code=${code}`;

  const captured: { headers: Record<string, string | string[]>; statusCode: number; body: string } = {
    headers: {},
    statusCode: 200,
    body: '',
  };
  const fakeRes = {
    setHeader(k: string, v: string | string[]) { captured.headers[k] = v; },
    getHeader(k: string) { return captured.headers[k]; },
    writeHead(code: number) { captured.statusCode = code; },
    end(b = '') { captured.body = b; },
  } as unknown as ServerResponse;

  await installer.handleCallback(fakeReq, fakeRes);

  // After successful callback, installationStore has the installation
  const authResult = await installer.authorize({
    teamId: 'T_TWIN',
    enterpriseId: undefined,
    userId: 'U_TEST',
    conversationId: undefined,
    isEnterpriseInstall: false,
  });

  expect(authResult.botToken).toMatch(/^xoxb-/);
  expect(authResult.teamId).toBe('T_TWIN');
});
```

### Bolt App Listeners Test (SLCK-10)
```typescript
// Source: pattern derived from third_party/upstream/bolt-js/src/App.ts
import App from '@slack/bolt';

it('app.event listener is called for app_mention', async () => {
  await resetSlack();
  const token = await seedSlackBotToken();

  const app = new App({
    token,
    signingSecret: 'test-secret',
    signatureVerification: false,
    clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
  });

  const received: any[] = [];
  app.event('app_mention', async ({ event, ack }) => {
    received.push(event);
    await ack();
  });

  await app.processEvent({
    body: {
      type: 'event_callback',
      team_id: 'T_TWIN',
      api_app_id: 'A_TWIN',
      event: { type: 'app_mention', text: '<@U_BOT_TWIN> hello', user: 'U_TEST', ts: '1234.5678', channel: 'C_GENERAL' },
      authorizations: [{ enterprise_id: null, team_id: 'T_TWIN', user_id: 'U_BOT_TWIN', is_bot: true, is_enterprise_install: false }],
    },
    ack: async () => {},
  });

  expect(received).toHaveLength(1);
  expect(received[0].type).toBe('app_mention');
});
```

### HTTPReceiver URL Verification Test (SLCK-11)
```typescript
// Source: third_party/upstream/bolt-js/src/receivers/HTTPReceiver.ts line 477-481
import { createHmac } from 'node:crypto';
import { AddressInfo } from 'node:net';
import App, { HTTPReceiver } from '@slack/bolt';

function signSlackRequest(body: string, secret: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
  return {
    'x-slack-signature': sig,
    'x-slack-request-timestamp': String(ts),
    'content-type': 'application/json',
  };
}

it('HTTPReceiver handles url_verification challenge', async () => {
  const signingSecret = 'test-signing-secret-19';
  const token = await seedSlackBotToken();

  const receiver = new HTTPReceiver({ signingSecret });
  const app = new App({
    receiver,
    token,
    clientOptions: { slackApiUrl: process.env.SLACK_API_URL! + '/api/' },
  });

  const server = await app.start(0);
  const port = (server.address() as AddressInfo).port;

  try {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'challenge-test-value' });
    const res = await fetch(`http://127.0.0.1:${port}/slack/events`, {
      method: 'POST',
      headers: signSlackRequest(body, signingSecret),
      body,
    });
    const json = await res.json();
    expect(json.challenge).toBe('challenge-test-value');
  } finally {
    await app.stop();
  }
});
```

---

## Twin Modifications Required

Phase 19 requires only one twin modification and two new twin capabilities:

### 1. oauth.ts — Fix oauth.v2.access Response (REQUIRED)
Add `enterprise: null` and `is_enterprise_install: false` to the `POST /api/oauth.v2.access` response body. Without this, `InstallProvider.handleCallback()` cannot construct a valid `Installation` object.

### 2. Verify auth.test Returns bot_id (VERIFY, likely no change needed)
`handleCallback` calls `runAuthTest(botToken, clientOptions)` which calls `auth.test` and reads `authResult.bot_id`. The twin's `auth.test` response already returns `bot_id: 'B_BOT_TWIN'` (set as a constant in `auth.ts`). Verify this and document it.

### 3. No New Twin Routes for Bolt Listeners or HTTP Receivers
Bolt `App.processEvent()` tests are fully in-process — no twin routes needed. `HTTPReceiver` and `ExpressReceiver` tests use the twin only for `auth.test` (during App init) and optionally `chat.postMessage` (for `say()` inside handlers).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Slack twin's OAuth serves WebClient init only | OAuth must support full `InstallProvider` callback flow | Phase 19 | Add missing response fields to `oauth.v2.access` |
| Slack SDK tests use raw `WebClient` | Bolt `App` listener APIs tested via direct `processEvent()` | Phase 19 | No receiver HTTP needed for listener tests |
| Signing secret on twin is decorative | Signing secret must match receiver in SLCK-11 tests | Phase 19 | Tests use a test-specific `signingSecret` constant, not the twin's |

**The Bolt `App.client` property:** In tests, Bolt's internal `WebClient` instance (accessible as `app.client`) uses `slackApiUrl` from `clientOptions`. When a listener calls `say()` or `client.chat.postMessage()`, those calls go to the twin. This confirms the twin's existing `chat.postMessage` route (from Phase 18) will handle listener-triggered API calls.

---

## Open Questions

1. **Does `pnpm` hoist `@slack/bolt` and `@slack/oauth` to sdk-verification?**
   - What we know: `pnpm` uses `hoistPattern` which may prevent sdk-verification from importing packages installed at workspace root as devDependencies.
   - What's unclear: The exact hoistPattern in the root `.npmrc` or `pnpm-workspace.yaml`.
   - Recommendation: Check if `import { App } from '@slack/bolt'` works in a test file. If not, add `"@slack/bolt"` and `"@slack/oauth"` to sdk-verification's own `devDependencies`.

2. **Does the existing `oauth.v2.access` handle the `code` parameter from `handleCallback`?**
   - What we know: The twin's current implementation accepts any non-empty `code` and returns a valid token pair. This is sufficient — `handleCallback` just needs a successful response.
   - What's unclear: Whether any test needs to drive the full `handleInstallPath` → browser redirect → `handleCallback` flow (which requires the twin to generate a real auth code from the authorize endpoint).
   - Recommendation: Use `stateVerification: false` to skip the cookie round-trip, and pass any synthetic `code` value in the mock callback URL. The twin accepts any code.

3. **Does Bolt's `App` with `deferInitialization: false` call `auth.test` synchronously in tests?**
   - What we know: `App` constructor calls `this.initAuthorizeInConstructor()` which calls `singleAuthorization()` → but `auth.test` is only called during `init()` (which is `async`). In the default case with `deferInitialization: false`, `App` constructor is synchronous but `auth.test` is async — it's triggered lazily on first event.
   - What's unclear: Whether the constructor blocks on `auth.test` or defers it.
   - Recommendation: Use `deferInitialization: true` and explicitly call `await app.init()` in test setup. This gives explicit control over when `auth.test` is called and allows proper `await seedSlackBotToken()` before init.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `tests/sdk-verification/vitest.config.ts` (exists) |
| Quick run command | `pnpm --filter sdk-verification test -- slack-oauth` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-09 | `generateInstallUrl` returns URL with client_id and scope | live SDK test | `pnpm test:sdk -- slack-oauth-install-provider` | ❌ Wave 0 |
| SLCK-09 | `handleInstallPath` redirects with Set-Cookie state | live SDK test | `pnpm test:sdk -- slack-oauth-install-provider` | ❌ Wave 0 |
| SLCK-09 | `handleCallback` exchanges code for installation (stateVerification: false) | live SDK test | `pnpm test:sdk -- slack-oauth-install-provider` | ❌ Wave 0 |
| SLCK-09 | `authorize()` returns botToken after successful handleCallback | live SDK test | `pnpm test:sdk -- slack-oauth-install-provider` | ❌ Wave 0 |
| SLCK-10 | `app.event('app_mention')` listener fires on event_callback payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.message()` listener fires on message event | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.action()` listener fires on block_actions payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.command()` listener fires on slash command payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.options()` listener fires on block_suggestion payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.shortcut()` listener fires on shortcut payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.view()` listener fires on view_submission payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.function()` listener fires on function_executed payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-10 | `app.assistant()` listener fires on assistant_thread_started payload | live SDK test | `pnpm test:sdk -- slack-bolt-app-listeners` | ❌ Wave 0 |
| SLCK-11 | HTTPReceiver handles url_verification challenge correctly | live SDK test | `pnpm test:sdk -- slack-bolt-http-receivers` | ❌ Wave 0 |
| SLCK-11 | HTTPReceiver verifies request HMAC signature (rejects invalid) | live SDK test | `pnpm test:sdk -- slack-bolt-http-receivers` | ❌ Wave 0 |
| SLCK-11 | HTTPReceiver delivers event to app.event listener via HTTP | live SDK test | `pnpm test:sdk -- slack-bolt-http-receivers` | ❌ Wave 0 |
| SLCK-11 | HTTPReceiver supports custom routes | live SDK test | `pnpm test:sdk -- slack-bolt-http-receivers` | ❌ Wave 0 |
| SLCK-11 | ExpressReceiver handles url_verification and routes events | live SDK test | `pnpm test:sdk -- slack-bolt-http-receivers` | ❌ Wave 0 |
| SLCK-11 | response_url call from Bolt listener posts to twin `/response-url/:id` | live SDK test | `pnpm test:sdk -- slack-bolt-http-receivers` | ❌ Wave 0 |
| SLCK-09/10/11 | coverage-report.json updated with @slack/oauth and @slack/bolt LIVE_SYMBOLS | manual | `pnpm coverage:generate` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk -- {test-file-name}` on the affected test file only
- **Per wave merge:** Full `pnpm test:sdk`
- **Phase gate:** Full suite green + `pnpm coverage:generate` run + all SLCK-09/10/11 manifest symbols classified before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `twins/slack/src/plugins/oauth.ts` — add `enterprise: null, is_enterprise_install: false` to `oauth.v2.access` response
- [ ] `tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` — SLCK-09 InstallProvider flows
- [ ] `tests/sdk-verification/sdk/slack-bolt-app-listeners.test.ts` — SLCK-10 App listener APIs
- [ ] `tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts` — SLCK-11 HTTPReceiver + ExpressReceiver
- [ ] Verify `@slack/bolt` and `@slack/oauth` are importable from sdk-verification workspace (may need devDependency entries)
- [ ] `tests/sdk-verification/coverage/generate-report.ts` updated — LIVE_SYMBOLS for @slack/oauth and @slack/bolt Phase 19 symbols
- [ ] `pnpm coverage:generate` run — coverage-report.json updated with Phase 19 classifications

---

## Sources

### Primary (HIGH confidence)
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/oauth/src/install-provider.ts` — InstallProvider full source; handleInstallPath, generateInstallUrl, handleCallback, authorize flows verified line by line
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/oauth/src/state-stores/clear-state-store.ts` — ClearStateStore JWT sign/verify; no twin endpoints needed
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/oauth/src/installation-stores/interface.ts` — InstallationStore interface: storeInstallation + fetchInstallation
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/App.ts` — App class source; processEvent(), listener registration (event/message/action/command/options/shortcut/view/function/assistant), auth.test during init
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/receivers/HTTPReceiver.ts` — HTTPReceiver full source; request verification, url_verification, custom routes, OAuth install/redirect paths
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/receivers/ExpressReceiver.ts` — ExpressReceiver full source; router setup, OAuth paths, body parsing middleware
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/receivers/verify-request.ts` — HMAC signature format: `v0:{ts}:{body}` with `createHmac('sha256', secret)`
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/receivers/HTTPModuleFunctions.ts` — url_verification response: `{ challenge: body.challenge }`; body parsing logic
- `/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/receivers/custom-routes.ts` — CustomRoute interface: `{ path, method, handler }`
- `/Users/futur/projects/sandpiper-dtu/tools/sdk-surface/manifests/slack-oauth@3.0.4.json` — 34 symbols; InstallProvider members confirmed
- `/Users/futur/projects/sandpiper-dtu/tools/sdk-surface/manifests/slack-bolt@4.6.0.json` — 202 symbols; App class members confirmed; client.slackApiUrl.* noise identified
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts` — current oauth.v2.access response; missing enterprise + is_enterprise_install fields identified
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/index.ts` — signingSecret decorated on fastify; exists as `process.env.SLACK_SIGNING_SECRET ?? 'dev-signing-secret'`
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/events-api.ts` — existing url_verification twin handler; confirmed it returns `{ challenge }` matching HTTPReceiver expectation
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/interactions.ts` — existing /response-url/:id endpoint; confirmed for SLCK-11 response_url tests
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/helpers/slack-client.ts` — createSlackClient pattern; `slackApiUrl + '/api/'` trailing slash pattern
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/setup/seeders.ts` — resetSlack, seedSlackBotToken patterns

### Secondary (MEDIUM confidence)
- `package.json` at workspace root — confirmed `"@slack/bolt": "4.6.0"` and `"@slack/oauth": "3.0.4"` present as devDependencies; available to sdk-verification workspace pending pnpm hoist check

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all SDKs pinned at workspace root
- Architecture (SLCK-09): HIGH — InstallProvider source read directly; oauth.v2.access gap identified precisely
- Architecture (SLCK-10): HIGH — App.processEvent() source read; payload shapes derived from bolt-js middleware source
- Architecture (SLCK-11): HIGH — HTTPReceiver + ExpressReceiver source read; HMAC format confirmed from verify-request.ts
- Pitfalls: HIGH — all pitfalls derived from reading actual SDK source code, not inference
- Coverage ledger: MEDIUM — @slack/bolt manifest has String-prototype noise; classification strategy documented but not yet executed

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (stable SDK versions; bolt 4.6.0 and oauth 3.0.4 pinned)
