# Architecture Patterns

**Domain:** SDK conformance infrastructure for Shopify and Slack digital twins
**Researched:** 2026-03-08
**Confidence:** HIGH (verified against existing codebase, upstream SDK source, and official documentation)

## Recommended Architecture

### System Overview

```text
+=========================================================================+
|                     third_party/upstream/                                |
|  Pinned fork submodules (shopify-app-js, node-slack-sdk, bolt-js)       |
+============================+============================================+
                             |
                    inventory generator
                             |
              +--------------+--------------+
              |                             |
+-------------v-----------+  +--------------v-----------+
| tools/sdk-surface/      |  | tools/sdk-surface/       |
|   manifests/            |  |   generators/             |
|   (checked-in JSON      |  |   (test matrix builders)  |
|    per-package)         |  |                           |
+-------------+-----------+  +--------------+------------+
              |                             |
              +----------+--+---------------+
                         |
         +===============v=================+
         |   tests/sdk-verification/       |
         |                                 |
         |   shared/                       |
         |     twin-lifecycle.ts           |
         |     fixture-seeders.ts          |
         |     callback-server.ts          |
         |     socket-mode-broker.ts       |
         |     lambda-harness.ts           |
         |                                 |
         |   shopify/                      |
         |     admin-api-client.test.ts    |
         |     shopify-api-auth.test.ts    |
         |     shopify-api-billing.test.ts |
         |     rest-resources.test.ts      |
         |     ...                         |
         |                                 |
         |   slack/                        |
         |     web-api-core.test.ts        |
         |     web-api-methods.test.ts     |
         |     oauth-provider.test.ts      |
         |     bolt-listeners.test.ts      |
         |     bolt-http-receiver.test.ts  |
         |     bolt-socket-receiver.test.ts|
         |     bolt-lambda-receiver.test.ts|
         |     ...                         |
         |                                 |
         |   legacy/                       |
         |     hmac-verification.test.ts   |
         |     webhook-timing.test.ts      |
         |     ui-structure.test.ts        |
         +==+===========+==+==============+
            |           |  |
            v           v  v
   +-----------+  +-----------+  +-----------+
   | Shopify   |  | Slack     |  | Slack     |
   | twin      |  | twin      |  | twin      |
   | (Fastify  |  | (Fastify  |  | WS broker |
   |  HTTP)    |  |  HTTP)    |  | (Socket   |
   |           |  |           |  |  Mode)    |
   +-----------+  +-----------+  +-----------+
```

### Key Architectural Principle: Official SDKs Hit Real Transports

The v1.0 conformance system uses `app.inject()` (Fastify's in-process request injection) to bypass the network stack entirely. The v1.1 SDK conformance system must NOT do this for its primary verification path. The official SDK packages construct their own HTTP requests, manage their own WebSocket connections, and enforce their own retry/signing/auth behavior. The harness must boot the twins on real local ports and point the SDKs at those URLs.

`app.inject()` remains useful for admin seeding and state reset operations, but the SDK-under-test must go through real network I/O.

## Component Boundaries

| Component | Responsibility | Communicates With | New vs Existing |
|-----------|----------------|-------------------|-----------------|
| `third_party/upstream/` | Freeze upstream SDK source at pinned commits | `tools/sdk-surface/` reads source | NEW directory |
| `tools/sdk-surface/inventory/` | Walk package exports via TypeScript compiler API | Reads `third_party/upstream/` and `node_modules/` | NEW directory |
| `tools/sdk-surface/manifests/` | Store checked-in JSON manifests per package | Read by `tests/sdk-verification/` and CI | NEW directory |
| `tools/sdk-surface/generators/` | Produce test matrices from manifests | Writes to `tests/sdk-verification/` | NEW directory |
| `tests/sdk-verification/shared/` | Twin lifecycle, fixture seeders, transport harnesses | Boots `twins/shopify/` and `twins/slack/` | NEW directory |
| `tests/sdk-verification/shopify/` | Shopify SDK verification suites | Uses official SDK packages against Shopify twin | NEW directory |
| `tests/sdk-verification/slack/` | Slack SDK verification suites | Uses official SDK packages against Slack twin | NEW directory |
| `tests/sdk-verification/legacy/` | Merged Phase 12 HMAC/timing/UI checks | Reuses twins and shared helpers | NEW (ported from `.planning/carryover/`) |
| `packages/conformance/` | Existing HTTP-level conformance framework | Existing twin adapters, suites, normalizers | EXISTING (unchanged) |
| `twins/shopify/` | Shopify twin Fastify app | Receives SDK HTTP requests on local port | EXISTING (extended with new endpoints) |
| `twins/slack/` | Slack twin Fastify app | Receives SDK HTTP requests on local port | EXISTING (extended with new endpoints + WS broker) |

### What Changes in Existing Packages

| Package | Change | Rationale |
|---------|--------|-----------|
| `twins/shopify/` | Add REST resource routes, billing GraphQL mutations, Storefront proxy, session endpoints | `@shopify/shopify-api` expects these beyond current GraphQL/OAuth surface |
| `twins/slack/` | Add ~250 additional Web API method stubs, add WebSocket endpoint for Socket Mode broker | `@slack/web-api` has 274 methods; Bolt expects Socket Mode transport |
| `packages/types/` | May add shared SDK manifest types | Manifest format must be consistent across Shopify and Slack |
| `packages/conformance/` | No changes needed | Existing conformance framework continues operating independently |
| Root `vitest.config.ts` | Add `tests/sdk-verification` as a workspace project | New test suites need to be discoverable by the workspace runner |
| Root `pnpm-workspace.yaml` | No change needed | `tests/sdk-verification` is not a publishable package; it uses workspace deps directly |

## Directory Layout

### New Directories

```text
sandpiper-dtu/
  third_party/
    upstream/
      shopify-app-js/          # Git submodule -> repo-owned fork
      node-slack-sdk/          # Git submodule -> repo-owned fork
      bolt-js/                 # Git submodule -> repo-owned fork
    VERSIONS.json              # Pinned package name -> version -> commit SHA

  tools/
    sdk-surface/
      inventory/
        walk-exports.ts        # TypeScript compiler API export walker
        package-reader.ts      # Reads package.json exports field
        run-inventory.ts       # CLI entrypoint: generate manifests
      generators/
        test-matrix.ts         # Produces test case skeletons from manifests
      manifests/
        shopify-admin-api-client@1.1.1.json
        shopify-shopify-api@12.3.0.json
        slack-web-api@7.14.1.json
        slack-oauth@3.0.4.json
        slack-bolt@4.6.0.json

  tests/
    sdk-verification/
      vitest.config.ts         # Workspace project config
      package.json             # devDependencies: official SDK packages
      shared/
        twin-lifecycle.ts      # Boot/teardown/reset helpers
        fixture-seeders.ts     # Seed shops, channels, users, tokens
        callback-server.ts     # Ephemeral HTTP server for OAuth callbacks
        socket-mode-broker.ts  # WebSocket broker for Socket Mode
        lambda-harness.ts      # AWS Lambda event/context simulation
        signing.ts             # HMAC/Slack signing secret helpers
      shopify/
        admin-api-client/
          graphql.test.ts
          rest.test.ts
        shopify-api/
          auth.test.ts
          session.test.ts
          webhooks.test.ts
          billing.test.ts
          clients.test.ts
          rest-resources.test.ts
      slack/
        web-api/
          core.test.ts         # apiCall, paginate, retry, rate-limit
          methods.test.ts      # Generated method family coverage
          files.test.ts        # filesUploadV2, ChatStreamer
        oauth/
          install-provider.test.ts
        bolt/
          listeners.test.ts    # event, message, action, command, etc.
          http-receiver.test.ts
          express-receiver.test.ts
          socket-mode-receiver.test.ts
          lambda-receiver.test.ts
      legacy/
        hmac-verification.test.ts
        webhook-timing.test.ts
        ui-structure.test.ts
```

### Layout Rationale

1. **`third_party/upstream/` at repo root**: Submodules are not workspace packages. They live outside `packages/` and `twins/` because they are not first-party code and should not participate in pnpm workspace resolution. A `VERSIONS.json` file at `third_party/` records the pinned package-name-to-version-to-SHA mapping so drift detection can compare it against `pnpm-lock.yaml`.

2. **`tools/sdk-surface/` at repo root**: Inventory and generation tooling is a build-time concern, not a runtime package. It reads upstream source and installed packages, writes manifests, and optionally generates test skeletons. It does not need to be a pnpm workspace member.

3. **`tests/sdk-verification/` as a Vitest workspace project**: This directory has its own `vitest.config.ts` and `package.json` declaring the official SDK packages as `devDependencies`. It is a Vitest workspace project (listed in root `vitest.config.ts` `projects` array) but NOT a pnpm workspace package. This avoids polluting the twin or shared package dependency trees with the upstream SDK dependencies.

4. **`tests/sdk-verification/shared/` contains all harness infrastructure**: Twin lifecycle management, fixture seeding, callback servers, and transport harnesses are shared across Shopify and Slack suites. This avoids duplication and ensures consistent boot/teardown patterns.

5. **Legacy verification stays in the same workspace**: The old Phase 12 HMAC, async timing, and UI checks move into `tests/sdk-verification/legacy/` so they run under the same `pnpm test` invocation and share the same twin lifecycle helpers.

## Patterns to Follow

### Pattern 1: Twin Lifecycle Manager

**What:** A shared helper that boots twin Fastify apps on ephemeral ports, provides base URLs, seeds initial state, and tears down cleanly.

**When:** Every SDK verification test file.

**Why:** The official SDKs construct their own HTTP clients. They need real `http://127.0.0.1:{port}` URLs, not `app.inject()`. Centralizing lifecycle avoids port conflicts and ensures consistent state reset.

**Example:**

```typescript
// tests/sdk-verification/shared/twin-lifecycle.ts

import type { FastifyInstance } from 'fastify';

export interface TwinInstance {
  app: FastifyInstance;
  baseUrl: string;
  port: number;
}

export async function bootTwin(
  twinModule: string,  // e.g., '../../twins/shopify/src/index.js'
  opts?: { dbPath?: string; env?: Record<string, string> }
): Promise<TwinInstance> {
  // Set environment before import
  process.env.DB_PATH = opts?.dbPath ?? ':memory:';
  process.env.WEBHOOK_SYNC_MODE = 'true';
  process.env.WEBHOOK_TIME_SCALE = '0.001';
  Object.assign(process.env, opts?.env ?? {});

  const { buildApp } = await import(twinModule);
  const app = await buildApp({ logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.addresses()[0];
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { app, baseUrl, port };
}

export async function resetTwin(twin: TwinInstance): Promise<void> {
  await fetch(`${twin.baseUrl}/admin/reset`, { method: 'POST' });
}

export async function teardownTwin(twin: TwinInstance): Promise<void> {
  await twin.app.close();
}
```

**Usage in test:**

```typescript
// tests/sdk-verification/shopify/admin-api-client/graphql.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { bootTwin, resetTwin, teardownTwin, TwinInstance } from '../../shared/twin-lifecycle.js';
import { createAdminApiClient } from '@shopify/admin-api-client';

let twin: TwinInstance;
let client: ReturnType<typeof createAdminApiClient>;

beforeAll(async () => {
  twin = await bootTwin('../../../../twins/shopify/src/index.js');

  // Shopify SDK constructs URL from storeDomain.
  // The twin must be reachable at this domain. Two approaches:
  // 1. Use scheme:'http' + storeDomain pointing to 127.0.0.1:{port}
  // 2. Use customFetchApi to rewrite the URL
  // Approach 1 requires DNS or /etc/hosts; approach 2 is simpler for tests.
  client = createAdminApiClient({
    storeDomain: `127.0.0.1:${twin.port}`,
    apiVersion: '2024-01',
    accessToken: 'will-be-set-after-oauth',
    scheme: 'http',  // REST client only; GraphQL uses customFetchApi
    customFetchApi: async (url, init) => {
      // Rewrite https://{storeDomain} -> http://127.0.0.1:{port}
      const rewritten = String(url).replace(
        /^https:\/\/[^/]+/,
        twin.baseUrl
      );
      return fetch(rewritten, init);
    },
  });
}, 30_000);

afterAll(async () => { await teardownTwin(twin); });
beforeEach(async () => { await resetTwin(twin); });
```

### Pattern 2: Shopify SDK URL Redirection via customFetchApi

**What:** The `@shopify/admin-api-client` constructs URLs from `storeDomain` (e.g., `https://{store}.myshopify.com/admin/api/{version}/graphql.json`). There is no `baseUrl` override for the GraphQL client. The REST client has a `scheme` option (`http|https`), but both clients derive the host from `storeDomain`.

**When:** Every Shopify SDK verification test.

**Why:** The twin runs on `http://127.0.0.1:{port}`. The SDK expects `https://{domain}`. Without redirection, SDK requests go to a non-existent HTTPS endpoint.

**Concrete mechanism:**

```typescript
// Option A: customFetchApi URL rewriting (RECOMMENDED)
// Works for both GraphQL and REST clients uniformly.
const client = createAdminApiClient({
  storeDomain: 'test-store.myshopify.com',
  apiVersion: '2024-01',
  accessToken: token,
  customFetchApi: async (url, init) => {
    const rewritten = String(url).replace(
      /^https:\/\/test-store\.myshopify\.com/,
      `http://127.0.0.1:${twinPort}`
    );
    return fetch(rewritten, init);
  },
});

// Option B: For REST client ONLY, use scheme + storeDomain trick
const restClient = createAdminRestApiClient({
  storeDomain: `127.0.0.1:${twinPort}`,
  apiVersion: '2024-01',
  accessToken: token,
  scheme: 'http',
});
```

**Confidence:** HIGH -- `customFetchApi` is documented in the [official README](https://github.com/Shopify/shopify-app-js/blob/main/packages/api-clients/admin-api-client/README.md) and `scheme` is an explicit REST client option.

### Pattern 3: Slack SDK URL Redirection via slackApiUrl

**What:** `@slack/web-api` `WebClient` accepts a `slackApiUrl` constructor option that overrides the base URL for all API calls (default: `https://slack.com/api/`).

**When:** Every Slack SDK verification test.

**Why:** The Slack twin serves at `http://127.0.0.1:{port}/api/`. The WebClient must be pointed there.

**Concrete mechanism:**

```typescript
import { WebClient } from '@slack/web-api';

const client = new WebClient(botToken, {
  slackApiUrl: `http://127.0.0.1:${twinPort}/api/`,
});

// All method calls (chat.postMessage, users.info, etc.) now hit the twin.
await client.chat.postMessage({ channel: 'C_GENERAL', text: 'test' });
```

**Confidence:** HIGH -- `slackApiUrl` is a well-documented WebClient constructor option.

### Pattern 4: Socket Mode Broker (WebSocket Harness)

**What:** A lightweight WebSocket server that simulates Slack's Socket Mode connection endpoint. Bolt's `SocketModeReceiver` wraps `@slack/socket-mode`'s `SocketModeClient`, which:
1. Calls `apps.connections.open` (a Web API method) to get a WebSocket URL
2. Opens a WebSocket to that URL
3. Receives envelopes containing `events_api`, `slash_commands`, and `interactive` payloads
4. Acknowledges each envelope by sending `{ envelope_id }` back over the WebSocket

**When:** Phase 20 (Bolt Alternate Receivers).

**Architecture:**

```text
                            SocketModeReceiver
                                   |
                            SocketModeClient
                                   |
                    +------+-------+-------+------+
                    |                              |
            apps.connections.open             WebSocket connect
            (Web API call to twin)           (to returned wss:// URL)
                    |                              |
              Slack twin HTTP               Socket Mode Broker
              (returns ws:// URL            (WebSocket server on
               pointing to broker)           separate ephemeral port)
                                                   |
                                            Envelope dispatch
                                            (JSON messages with
                                             envelope_id, type,
                                             and payload)
```

**Concrete implementation:**

```typescript
// tests/sdk-verification/shared/socket-mode-broker.ts

import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

export interface SocketModeBroker {
  url: string;           // ws://127.0.0.1:{port} for apps.connections.open response
  port: number;
  connections: WebSocket[];
  sendEnvelope(type: string, payload: unknown): Promise<string>;  // returns envelope_id
  waitForAck(envelopeId: string, timeoutMs?: number): Promise<unknown>;
  close(): Promise<void>;
}

export async function createSocketModeBroker(): Promise<SocketModeBroker> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const port = (wss.address() as any).port;
  const connections: WebSocket[] = [];
  const ackCallbacks = new Map<string, (response: unknown) => void>();

  wss.on('connection', (ws) => {
    connections.push(ws);

    // Send hello message (Slack protocol requirement)
    ws.send(JSON.stringify({
      type: 'hello',
      num_connections: connections.length,
      connection_info: { app_id: 'A_TEST' },
    }));

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      // Acknowledgements come back as { envelope_id, payload? }
      if (msg.envelope_id && ackCallbacks.has(msg.envelope_id)) {
        ackCallbacks.get(msg.envelope_id)!(msg.payload);
        ackCallbacks.delete(msg.envelope_id);
      }
    });

    ws.on('close', () => {
      const idx = connections.indexOf(ws);
      if (idx >= 0) connections.splice(idx, 1);
    });
  });

  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    connections,

    async sendEnvelope(type: string, payload: unknown): Promise<string> {
      const envelopeId = randomUUID();
      const envelope = JSON.stringify({
        envelope_id: envelopeId,
        type,
        payload,
        accepts_response_payload: true,
      });
      // Send to the first active connection
      if (connections.length > 0 && connections[0].readyState === WebSocket.OPEN) {
        connections[0].send(envelope);
      }
      return envelopeId;
    },

    async waitForAck(envelopeId: string, timeoutMs = 5000): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => { ackCallbacks.delete(envelopeId); reject(new Error('Ack timeout')); },
          timeoutMs
        );
        ackCallbacks.set(envelopeId, (response) => {
          clearTimeout(timer);
          resolve(response);
        });
      });
    },

    async close(): Promise<void> {
      for (const ws of connections) ws.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
```

**How it connects to Bolt's SocketModeReceiver:**

The `SocketModeClient` calls `apps.connections.open` via its internal `WebClient`. The Slack twin must handle this endpoint and return the broker's WebSocket URL:

```typescript
// In Slack twin: add apps.connections.open handler
// twins/slack/src/plugins/web-api/apps.ts (new plugin)

fastify.post('/api/apps.connections.open', async (req, reply) => {
  // The SOCKET_MODE_BROKER_URL env var or header tells the twin
  // where the test's broker is listening
  const brokerUrl = process.env.SOCKET_MODE_BROKER_URL
    || req.headers['x-dtu-socket-broker-url'];

  if (!brokerUrl) {
    return reply.send({ ok: false, error: 'socket_mode_not_configured' });
  }

  return reply.send({
    ok: true,
    url: brokerUrl,
  });
});
```

**Test usage:**

```typescript
// tests/sdk-verification/slack/bolt/socket-mode-receiver.test.ts

import { App, SocketModeReceiver } from '@slack/bolt';
import { createSocketModeBroker } from '../../shared/socket-mode-broker.js';
import { bootTwin, teardownTwin } from '../../shared/twin-lifecycle.js';

let twin: TwinInstance;
let broker: SocketModeBroker;
let app: App;

beforeAll(async () => {
  broker = await createSocketModeBroker();
  twin = await bootTwin('../../../../twins/slack/src/index.js', {
    env: { SOCKET_MODE_BROKER_URL: broker.url },
  });

  app = new App({
    socketMode: true,
    appToken: 'xapp-test-token',
    token: botToken,
    // Point WebClient at the Slack twin for apps.connections.open
    // SocketModeReceiver creates its own WebClient internally
    receiver: new SocketModeReceiver({
      appToken: 'xapp-test-token',
      clientOptions: {
        slackApiUrl: `${twin.baseUrl}/api/`,
      },
    }),
  });
});
```

**Confidence:** HIGH for the connection protocol (verified from [SocketModeClient source](https://github.com/slackapi/node-slack-sdk/blob/main/packages/socket-mode/src/SocketModeClient.ts) and [Slack Socket Mode docs](https://docs.slack.dev/apis/events-api/using-socket-mode/)). MEDIUM for `clientOptions.slackApiUrl` passthrough in SocketModeReceiver -- the receiver constructs its own SocketModeClient which constructs its own WebClient. Verify during Phase 20 implementation that the `clientOptions` path reaches the internal WebClient's `slackApiUrl`.

### Pattern 5: AWS Lambda Receiver Harness

**What:** A test helper that simulates the AWS Lambda invocation model. Bolt's `AwsLambdaReceiver` does not open an HTTP server. Instead, its `.start()` returns a handler function with the signature `(event: AwsEvent, context: any, callback: AwsCallback) => Promise<AwsResponse>`. The test harness constructs `AwsEvent` objects that match the `APIGatewayProxyEvent` shape and invokes the handler directly.

**When:** Phase 20 (Bolt Alternate Receivers).

**Architecture:**

```text
Test code
    |
    v
lambda-harness.ts
    |
    +-- constructAwsEvent(method, path, body, headers)
    |     -> builds AwsEvent (APIGatewayProxyEvent-like)
    |
    +-- invokeHandler(handler, event)
    |     -> calls handler(event, context, callback)
    |     -> returns AwsResponse
    |
    +-- Slack twin HTTP (for ack + API calls)
         -> Bolt App's WebClient still calls the twin for
            chat.postMessage, etc.
```

**Concrete implementation:**

```typescript
// tests/sdk-verification/shared/lambda-harness.ts

export interface AwsEvent {
  body: string | null;
  headers: Record<string, string>;
  httpMethod: string;
  isBase64Encoded: boolean;
  path: string;
  queryStringParameters: Record<string, string> | null;
  requestContext: { requestId: string };
  resource: string;
}

export interface AwsResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

export type AwsHandler = (
  event: AwsEvent,
  context: any,
  callback: (err?: Error | null, result?: any) => void
) => Promise<AwsResponse>;

export function constructAwsEvent(opts: {
  method?: string;
  path?: string;
  body: string;
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
}): AwsEvent {
  return {
    body: opts.body,
    headers: opts.headers,
    httpMethod: opts.method ?? 'POST',
    isBase64Encoded: false,
    path: opts.path ?? '/slack/events',
    queryStringParameters: opts.queryParams ?? null,
    requestContext: { requestId: crypto.randomUUID() },
    resource: opts.path ?? '/slack/events',
  };
}

export async function invokeHandler(
  handler: AwsHandler,
  event: AwsEvent
): Promise<AwsResponse> {
  return handler(event, {}, () => {});
}
```

**Key insight:** Unlike HTTP and Socket Mode receivers, the Lambda receiver does NOT open any network listener. The test invokes the handler function directly with constructed events. However, the Bolt `App` still uses its internal `WebClient` for API calls (responding to messages, updating views). That `WebClient` must be pointed at the Slack twin via `slackApiUrl`.

**Test usage:**

```typescript
// tests/sdk-verification/slack/bolt/lambda-receiver.test.ts

import { App, AwsLambdaReceiver } from '@slack/bolt';
import { constructAwsEvent, invokeHandler } from '../../shared/lambda-harness.js';
import { bootTwin, teardownTwin } from '../../shared/twin-lifecycle.js';
import { generateSlackSignature } from '../../shared/signing.js';

let twin: TwinInstance;
let handler: AwsHandler;

beforeAll(async () => {
  twin = await bootTwin('../../../../twins/slack/src/index.js');
  const signingSecret = 'dev-signing-secret';

  const receiver = new AwsLambdaReceiver({ signingSecret });
  const app = new App({
    token: botToken,
    receiver,
    // Point Bolt's WebClient at the twin
    // so that app.client.chat.postMessage hits the twin
  });

  app.event('message', async ({ event, say }) => {
    await say(`Echo: ${event.text}`);
  });

  await app.start();
  handler = receiver.toHandler();
});

it('processes an event payload through the Lambda handler', async () => {
  const body = JSON.stringify({
    type: 'event_callback',
    event: { type: 'message', text: 'hello', channel: 'C_GENERAL', user: 'U_TEST' },
    token: 'test-verification-token',
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSlackSignature('dev-signing-secret', timestamp, body);

  const event = constructAwsEvent({
    body,
    headers: {
      'content-type': 'application/json',
      'x-slack-signature': signature,
      'x-slack-request-timestamp': timestamp,
    },
  });

  const response = await invokeHandler(handler, event);
  expect(response.statusCode).toBe(200);
});
```

**Confidence:** HIGH -- `AwsLambdaReceiver` type definitions verified from [source](https://github.com/slackapi/bolt-js/blob/main/src/receivers/AwsLambdaReceiver.ts). The handler signature, event shape, and `processBeforeResponse` default behavior are well-documented.

### Pattern 6: Callback Server for OAuth Flows

**What:** An ephemeral HTTP server that captures OAuth redirect callbacks. Both Shopify and Slack OAuth flows redirect the browser to a callback URL after authorization. The harness needs to capture these redirects to verify state, codes, and token exchange.

**When:** Phases 15-16 (Shopify auth) and Phase 19 (Slack OAuth/Bolt).

**Concrete mechanism:**

```typescript
// tests/sdk-verification/shared/callback-server.ts

import { createServer, IncomingMessage, ServerResponse } from 'node:http';

export interface CallbackCapture {
  url: string;
  port: number;
  waitForCallback(timeoutMs?: number): Promise<{ path: string; query: URLSearchParams }>;
  close(): Promise<void>;
}

export async function createCallbackServer(): Promise<CallbackCapture> {
  let resolve: (val: { path: string; query: URLSearchParams }) => void;
  const promise = new Promise<{ path: string; query: URLSearchParams }>((r) => { resolve = r; });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsed = new URL(req.url!, `http://localhost`);
    resolve({ path: parsed.pathname, query: parsed.searchParams });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Callback captured');
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    waitForCallback: (timeout = 10_000) => Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Callback timeout')), timeout)
      ),
    ]),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

## Data Flow

### SDK Inventory Flow

```text
1. Clone/update submodule refs in third_party/upstream/
2. Run tools/sdk-surface/inventory/run-inventory.ts
   a. For each targeted package:
      - Resolve entrypoint from package.json "exports" field
      - Walk exported symbols via TypeScript compiler API
      - Record: { symbolName, kind, signatures, source file }
   b. Write manifest JSON to tools/sdk-surface/manifests/
3. Commit manifests alongside submodule ref updates
4. CI compares manifest against VERSIONS.json to detect drift
```

### Conformance Test Flow

```text
1. Vitest discovers tests/sdk-verification/ as workspace project
2. beforeAll():
   a. bootTwin() starts Shopify and/or Slack twin on ephemeral port
   b. Seed initial state via POST /admin/seed or /admin/reset
   c. Obtain auth tokens (OAuth flow through twin)
   d. Construct official SDK client with twin URL
3. Test body:
   a. Call official SDK method (e.g., client.request(query))
   b. SDK constructs HTTP request -> sends to twin on local port
   c. Twin processes request, returns response
   d. Assert response shape, status, and semantics
4. afterEach(): resetTwin() clears state
5. afterAll(): teardownTwin() closes Fastify server
```

### Socket Mode Test Flow

```text
1. beforeAll():
   a. createSocketModeBroker() starts WebSocket server
   b. bootTwin() starts Slack twin with SOCKET_MODE_BROKER_URL
   c. Construct Bolt App with SocketModeReceiver
   d. App.start() -> SocketModeClient calls apps.connections.open
      -> Twin returns broker's ws:// URL
      -> SocketModeClient connects to broker
      -> Broker sends 'hello' message
2. Test body:
   a. broker.sendEnvelope('events_api', { type: 'message', ... })
   b. SocketModeClient receives envelope, dispatches to Bolt
   c. Bolt App listener fires, calls ack()
   d. broker.waitForAck(envelopeId) resolves
   e. Assert ack payload and any side effects
3. afterAll(): close App, broker, and twin
```

### Lambda Receiver Test Flow

```text
1. beforeAll():
   a. bootTwin() starts Slack twin (for WebClient API calls)
   b. Construct Bolt App with AwsLambdaReceiver
   c. Register event/action/command listeners
   d. app.start() -> receiver returns handler function
2. Test body:
   a. constructAwsEvent() builds APIGatewayProxyEvent-shaped object
   b. Sign the body with Slack signing secret
   c. invokeHandler(handler, event) calls handler directly
   d. Handler processes event through Bolt middleware
   e. Assert AwsResponse statusCode and body
3. afterAll(): teardown twin
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Stubbing SDK Network Internals

**What:** Using `vi.mock('@slack/web-api')` or replacing `globalThis.fetch` to avoid starting real twin servers.

**Why bad:** The entire point of SDK conformance is verifying that the official SDK's actual HTTP/WebSocket behavior works against the twin. Stubbing the transport makes the test prove nothing about twin fidelity.

**Instead:** Boot twins on ephemeral ports. Use `customFetchApi` (Shopify) and `slackApiUrl` (Slack) to redirect SDK traffic to the twin. The network round-trip must actually happen.

### Anti-Pattern 2: One Giant Test File Per SDK

**What:** Putting all 274 Slack Web API method tests in a single file.

**Why bad:** Failure triage becomes impossible. Test runtime grows unbounded. File becomes unmaintainable.

**Instead:** Organize by package family (core, methods, files) and by SDK package (admin-api-client, shopify-api, web-api, oauth, bolt). Use generated test matrices for repetitive coverage and curated tests for semantic flows.

### Anti-Pattern 3: Sharing Twin Instances Across Unrelated Test Files

**What:** Booting one Shopify twin for all Shopify tests and relying on `beforeEach` reset to isolate state.

**Why bad:** Test ordering dependencies. One slow test blocks everything. State reset may not be complete for all new features (billing, sessions, REST resources).

**Instead:** Each test file boots its own twin instance. Use Vitest's `--pool forks` if parallel execution is needed. The boot time is <200ms with in-memory SQLite.

### Anti-Pattern 4: Hardcoding Twin Ports

**What:** Using `port: 3000` or `port: 3001` in test harnesses.

**Why bad:** Port conflicts when running tests in parallel or when a development twin is already running.

**Instead:** Always use `port: 0` (OS-assigned) and read the actual port from `app.addresses()[0].port`.

## Scalability Considerations

| Concern | At 50 symbols | At 500 symbols | At 2000+ symbols |
|---------|---------------|----------------|-------------------|
| Test runtime | <30s, single twin instance per file | ~2-5min, split by package family | Parallelize across Vitest pools with isolated twin instances |
| Manifest size | Single JSON per package | Single JSON per package, group symbols by family for readability | Consider per-family manifest files for large packages |
| Twin boot overhead | Negligible (<200ms) | Acceptable with file-level isolation | Add twin instance pooling if boot becomes bottleneck |
| CI time | Single job | Split Shopify and Slack into parallel jobs | Add per-family matrix jobs |

## Integration with Existing CI

The existing CI workflow (`.github/workflows/`) runs twin conformance via `pnpm --filter @dtu/twin-shopify run conformance:twin`. The new SDK verification tests should run as a separate CI job:

```yaml
# .github/workflows/conformance.yml (additions)
  sdk-verification:
    name: SDK Verification
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true  # NEW: fetch third_party/upstream/ submodules
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - run: pnpm build
      - run: pnpm exec vitest run --project sdk-verification
```

The existing `conformance:twin` jobs remain unchanged. They validate the HTTP-level twin behavior through the `@dtu/conformance` framework. The new `sdk-verification` job validates that the official SDK packages work end-to-end against the twins.

## Build Order (Dependency-Aware)

Given existing package dependencies:

```text
@dtu/types           (no deps)
  -> @dtu/state      (depends on types)
  -> @dtu/webhooks   (depends on types)
  -> @dtu/conformance (depends on types via deep-diff)
  -> @dtu/ui         (depends on types)
  -> @dtu/twin-shopify (depends on state, types, webhooks, conformance, ui)
  -> @dtu/twin-slack   (depends on state, types, webhooks, conformance, ui)
```

New components and their build order:

```text
Phase 13:
  1. third_party/upstream/ submodules (no build needed, just git checkout)
  2. tools/sdk-surface/ inventory tooling (standalone, reads node_modules + source)
  3. tools/sdk-surface/manifests/ (generated output, checked in)

Phase 14:
  4. tests/sdk-verification/package.json (adds SDK devDependencies)
  5. tests/sdk-verification/shared/ (depends on twins being importable)
  6. tests/sdk-verification/legacy/ (ports old checks, depends on shared/)

Phases 15-17 (Shopify):
  7. twins/shopify/ expansion (new routes/plugins for REST, billing, etc.)
  8. tests/sdk-verification/shopify/ suites (depends on shared/ + expanded twin)

Phases 18-19 (Slack):
  9. twins/slack/ expansion (new Web API stubs, apps.connections.open)
  10. tests/sdk-verification/slack/ suites (depends on shared/ + expanded twin)

Phase 20:
  11. twins/slack/ WebSocket broker endpoint
  12. tests/sdk-verification/shared/socket-mode-broker.ts
  13. tests/sdk-verification/shared/lambda-harness.ts
  14. tests/sdk-verification/slack/bolt/ receiver suites
  15. CI drift gate (reads manifests + VERSIONS.json)
```

## Sources

- Existing codebase: `packages/conformance/src/` (adapter/runner/types), `twins/shopify/src/index.ts`, `twins/slack/src/index.ts`, `tests/integration/smoke.test.ts`
- [Slack Socket Mode docs](https://docs.slack.dev/apis/events-api/using-socket-mode/) -- WebSocket connection protocol, apps.connections.open
- [Slack Bolt Receiver docs](https://docs.slack.dev/tools/bolt-js/concepts/receiver/) -- Receiver interface contract
- [Bolt AwsLambdaReceiver source](https://github.com/slackapi/bolt-js/blob/main/src/receivers/AwsLambdaReceiver.ts) -- AwsEvent/AwsResponse types, handler signature
- [Bolt SocketModeReceiver source](https://github.com/slackapi/bolt-js/blob/main/src/receivers/SocketModeReceiver.ts) -- constructor options, SocketModeClient integration
- [SocketModeClient source](https://github.com/slackapi/node-slack-sdk/blob/main/packages/socket-mode/src/SocketModeClient.ts) -- apps.connections.open call, WebSocket reconnection
- [@shopify/admin-api-client README](https://github.com/Shopify/shopify-app-js/blob/main/packages/api-clients/admin-api-client/README.md) -- customFetchApi, scheme, storeDomain configuration
- [@slack/web-api npm](https://www.npmjs.com/package/@slack/web-api) -- slackApiUrl constructor option

---
*Architecture research for: SDK conformance infrastructure integration*
*Researched: 2026-03-08*
