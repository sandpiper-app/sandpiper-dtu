# Technology Stack

**Project:** Sandpiper DTU v1.1 -- Official SDK Conformance
**Researched:** 2026-03-08
**Overall confidence:** HIGH

## Recommended Stack

### Official SDK Packages (Test Dependencies)

These are the packages that define the conformance boundary. They are installed as dev dependencies in a dedicated test workspace and run against live twin backends.

| Technology | Pin Version | Purpose | Why This Version |
|------------|-------------|---------|------------------|
| `@shopify/admin-api-client` | 1.1.1 | Low-level Shopify Admin API client (GraphQL + generic REST) | Latest stable. Depends on `@shopify/graphql-client@^1.4.1`. No peer deps. No explicit Node engine, but its parent `@shopify/shopify-api` requires Node >=20. |
| `@shopify/shopify-api` | 12.3.0 | High-level Shopify platform surface (auth, session, webhooks, billing, REST resources, clients, utils, flow, fulfillment-service) | Latest stable. Declares `engines.node: ">=20.0.0"`. Depends on `@shopify/admin-api-client@^1.1.1`, `@shopify/graphql-client@^1.4.1`, `@shopify/storefront-api-client@^1.0.9`, `jose`, `lossless-json`, `tslib`. |
| `@slack/web-api` | 7.14.1 | Slack Web API client (274+ bound methods, pagination, file uploads, streaming) | Latest stable. Depends on `@slack/logger@^4.0.0`, `@slack/types@^2.20.0`, `axios@^1.13.5`. Engines: Node >=18, npm >=8.6.0. |
| `@slack/oauth` | 3.0.4 | OAuth installation and authorization (InstallProvider, state store, callbacks) | Latest stable. Depends on `@slack/logger@^4`, `@slack/web-api@^7.10.0`, `jsonwebtoken@^9`. Engines: Node >=18, npm >=8.6.0. |
| `@slack/bolt` | 4.6.0 | Slack app framework (App, receivers, middleware, listeners, re-exports) | Latest stable. Depends on `@slack/web-api@^7.12.0`, `@slack/oauth@^3.0.4`, `@slack/socket-mode@^2.0.5`, `axios`, `express`, `tsscmp`. Engines: Node >=18, npm >=8.6.0. |
| `@slack/socket-mode` | 2.0.5 | Socket Mode client (WebSocket transport for events/commands/interactions) | Transitive dependency of Bolt. Depends on `@slack/web-api@^7.10.0`, `@slack/logger@^4`, `eventemitter3@^5`, `ws@^8`, `@types/ws@^8`. Engines: Node >=18, npm >=8.6.0. |

### Upstream Source Mirrors (Git Submodules)

| Repository | Fork Source | Submodule Path | Contains |
|------------|-------------|----------------|----------|
| `shopify-app-js` | `github.com/Shopify/shopify-app-js` | `third_party/upstream/shopify-app-js` | Monorepo: `packages/api-clients/admin-api-client/`, `packages/apps/shopify-api/`, plus graphql-client and storefront-api-client. The old `Shopify/shopify-api-js` is archived and merged here. |
| `node-slack-sdk` | `github.com/slackapi/node-slack-sdk` | `third_party/upstream/node-slack-sdk` | Monorepo: `packages/web-api/`, `packages/oauth/`, `packages/socket-mode/`, `packages/webhook/`. |
| `bolt-js` | `github.com/slackapi/bolt-js` | `third_party/upstream/bolt-js` | Single-package repo: `src/` contains App, receivers (HTTP, Express, SocketMode, AwsLambda), middleware, listeners. |

### Surface Inventory Tooling

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `ts-morph` | 25.0.1 | Enumerate all public exports from TypeScript package entrypoints | Use `getExportedDeclarations()` on source files to build complete symbol manifests. ts-morph wraps the TypeScript compiler API with a much simpler interface for export enumeration. Bundles its own TypeScript internally (design decision to avoid TS patch-version breakage), so it does not conflict with the project's TS 5.7.3 -- the bundled TS is used only for analysis, not for compilation. |

**Why ts-morph over raw TypeScript compiler API:**
- The raw TS compiler API requires ~40 lines of boilerplate to create a Program, get a TypeChecker, resolve module symbols, call `getExportsOfModule()`, and recurse into re-exports. ts-morph reduces this to `sourceFile.getExportedDeclarations()` which returns a `Map<string, ExportedDeclarations[]>` with all re-exports resolved.
- ts-morph handles resolution of `export * from`, `export { X as Y }`, barrel files, and namespace re-exports automatically.
- The `Project` class can load source files from a `tsconfig.json` directly via `addSourceFilesFromTsConfig()`, matching how upstream SDK repos are structured.
- Fallback to raw compiler API is always available via `.compilerNode` on any ts-morph node.

**Why NOT `@microsoft/api-extractor`:**
- API Extractor is designed for generating `.d.ts` rollups and API reports for your own packages. It does not provide a programmatic API for enumerating exports into custom manifest formats. It would require parsing its output files as an intermediary, adding unnecessary complexity.

**Why NOT relying solely on installed `package.json` exports field:**
- The `exports` field in `package.json` defines module resolution entry points, not the complete symbol surface. Many packages (especially `@shopify/shopify-api`) have deep export trees that only become visible by walking the TypeScript source.

### WebSocket Harness (Socket Mode)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `ws` | ^8.19.0 | WebSocket server for Socket Mode test harness | `@slack/socket-mode@2.0.5` uses `ws@^8` internally via its `SlackWebSocket` wrapper. The test harness must use the same `ws` library to create a mock WebSocket server that emulates Slack's Socket Mode endpoint. |

**Socket Mode harness architecture:**

The `SocketModeClient` in `@slack/socket-mode` establishes connections through this flow:
1. Calls `apps.connections.open` via `WebClient` to get a dynamic WebSocket URL
2. Opens a WebSocket connection to that URL using `ws`
3. Receives events via `slack_event` messages, emits typed events (`events_api`, `slash_commands`, `interactive`)
4. Sends acknowledgement frames back on the same socket
5. Handles reconnection with exponential backoff

**The twin must provide:**
1. An HTTP endpoint that responds to `apps.connections.open` with a `ws://localhost:PORT/path` URL
2. A `ws.Server` instance at that URL that speaks the Socket Mode protocol (hello message, envelope framing, ack handling)
3. Event delivery by sending JSON envelopes over the WebSocket when twin state changes

**No additional WebSocket mocking libraries needed.** The `ws` library's `Server` class is sufficient to create a real WebSocket endpoint. Do NOT use `mock-socket`, `jest-websocket-mock`, or similar -- the goal is real transport, not mocked transport.

### AWS Lambda Receiver Harness

| Component | Implementation | Purpose | Why |
|-----------|---------------|---------|-----|
| Lambda event builder | Custom utility (no library needed) | Construct `AwsEventV1` and `AwsEventV2` payloads | Bolt's `AwsLambdaReceiver` accepts plain objects matching AWS API Gateway event shapes. No AWS SDK dependency is needed -- just construct the right JSON shape. |

**AwsLambdaReceiver harness architecture:**

Bolt's `AwsLambdaReceiver` works differently from HTTP receivers:
1. `start()` returns an async handler function: `(event: AwsEvent, context: any, callback: AwsCallback) => Promise<AwsResponse>`
2. The handler parses the event body (handling base64 encoding and content-type detection)
3. It performs HMAC signature verification using `X-Slack-Signature` and `X-Slack-Request-Timestamp` headers
4. It handles URL verification challenges
5. It routes to Bolt middleware and returns an `AwsResponse` with `statusCode`, `headers`, `body`, and optional `isBase64Encoded`

**The test harness must:**
1. Build `AwsEventV1` objects with `{ httpMethod, headers, body, isBase64Encoded }` or `AwsEventV2` objects with `{ rawPath, rawQueryString, requestContext, headers, body, isBase64Encoded }`
2. Sign the body with the twin's signing secret to produce valid HMAC headers
3. Call the handler function directly (no HTTP server, no AWS runtime -- just function invocation)
4. Assert on the returned `AwsResponse` shape

**No AWS SDK needed.** The receiver is designed to run in Lambda but accepts plain objects. The type definitions for `AwsEvent` and `AwsResponse` are in Bolt's source and can be imported directly from `@slack/bolt`.

### OAuth Flow Testing

| Component | Implementation | Purpose | Why |
|-----------|---------------|---------|-----|
| HTTP callback server | Node `http.createServer` or Fastify route | Capture OAuth redirects and authorization callbacks | `InstallProvider` (from `@slack/oauth`) and Shopify OAuth helpers issue HTTP redirects and POST callbacks that need a real endpoint. |
| Cookie/state tracking | In-test state management | Track OAuth state cookies across redirect chains | Both Slack and Shopify OAuth flows use state parameters for CSRF protection. Tests must preserve and validate state across the redirect chain. |

**OAuth test flow for Slack (`@slack/oauth` InstallProvider):**
1. Call `installProvider.generateInstallUrl()` to get the authorization URL with state
2. Simulate the user authorization by hitting the twin's OAuth authorize endpoint
3. Twin redirects to the callback URL with `code` and `state` params
4. `installProvider.handleCallback()` exchanges the code for tokens against the twin's `oauth.v2.access` endpoint
5. Assert that the installation store receives the correct installation data

**OAuth test flow for Shopify (`@shopify/shopify-api`):**
1. Use `shopify.auth.begin()` to generate the authorization redirect URL
2. Simulate the merchant authorization by hitting the twin's OAuth endpoint
3. Twin redirects to the callback URL with `code`, `shop`, `state`, `hmac` params
4. Use `shopify.auth.callback()` to exchange the code, which hits the twin's token endpoint
5. Assert that the session is created and stored correctly

### Existing Stack (Reuse, Do Not Replace)

| Technology | Current Version | Role in v1.1 |
|------------|----------------|--------------|
| `vitest` | ^3.0.0 (root), ^2.1.8 (twins) | Test runner for all SDK conformance suites. Align to ^3.0.0 across the workspace for consistency. |
| `tsx` | ^4.19.2 | Script runner for inventory generation and local tooling. Already in twin devDependencies. |
| `typescript` | ^5.7.3 | Project compilation. Does NOT need to match ts-morph's bundled version -- ts-morph uses its own internally. |
| `fastify` | ^5.0.0 | Twin HTTP servers. SDK tests hit these directly over loopback. |
| `pnpm` | 9.9.0 | Workspace manager. Submodules live outside the pnpm workspace (under `third_party/`). |
| `@dtu/conformance` | workspace:* | Existing conformance framework (adapter/runner/comparator). SDK conformance extends but does not replace this. |
| `@dtu/state` | workspace:* | SQLite state management. SDK tests seed state via admin endpoints, same as existing conformance. |
| `@dtu/webhooks` | workspace:* | WebhookQueue with HMAC signing. Reuse for webhook delivery verification in SDK suites. |

## Version Compatibility Matrix

| Package | Depends On | Version Range | Conflict Risk |
|---------|-----------|---------------|---------------|
| `@shopify/shopify-api@12.3.0` | `@shopify/admin-api-client` | `^1.1.1` | NONE -- installing both resolves cleanly |
| `@shopify/shopify-api@12.3.0` | `@shopify/graphql-client` | `^1.4.1` | NONE -- transitive, no project conflict |
| `@shopify/shopify-api@12.3.0` | `@shopify/storefront-api-client` | `^1.0.9` | NONE -- transitive, no project conflict |
| `@shopify/shopify-api@12.3.0` | `jose` | (any) | NONE -- no overlap with existing deps |
| `@slack/bolt@4.6.0` | `@slack/web-api` | `^7.12.0` | NONE -- 7.14.1 satisfies ^7.12.0 |
| `@slack/bolt@4.6.0` | `@slack/oauth` | `^3.0.4` | NONE -- exact match |
| `@slack/bolt@4.6.0` | `@slack/socket-mode` | `^2.0.5` | NONE -- exact match at 2.0.5 |
| `@slack/bolt@4.6.0` | `express` | (any) | LOW -- Bolt uses express for `ExpressReceiver`. Project uses Fastify for twins. No conflict because express is a Bolt dependency, not a project dependency. |
| `@slack/bolt@4.6.0` | `axios` | (any) | LOW -- Bolt and `@slack/web-api` both use axios. Same range, no conflict. |
| `@slack/socket-mode@2.0.5` | `ws` | `^8` | NONE -- matches test harness ws requirement |
| `ts-morph@25.0.1` | TypeScript | ~5.7.3 (bundled) | NONE -- ts-morph bundles its own TS. Does not affect project's TS version. |
| All Shopify packages | Node.js | `>=20.0.0` | NONE -- project runs Node 24.12.0 |
| All Slack packages | Node.js | `>=18` | NONE -- project runs Node 24.12.0 |

**Critical note on ts-morph version:** ts-morph 27.0.2 (latest) bundles TS 5.9.2. Use ts-morph 25.0.1 because it bundles TS 5.7.3, exactly matching the project's TypeScript version. Since ts-morph bundles its own TS, the version mismatch would be tolerable even with 27.x, but exact match eliminates any risk of the analyzer misinterpreting project syntax. Version history: 25.0.0 bundled TS 5.7.2, 25.0.1 upgraded to 5.7.3, 26.0.0 jumped to TS 5.8, 27.0.0 to TS 5.9.

## Git Submodule Management

### Setup

```bash
# Create fork repos first (one-time, done in GitHub UI)
# Then add submodules pointing at the fork repos

mkdir -p third_party/upstream

git submodule add https://github.com/YOUR_ORG/shopify-app-js.git third_party/upstream/shopify-app-js
git submodule add https://github.com/YOUR_ORG/node-slack-sdk.git third_party/upstream/node-slack-sdk
git submodule add https://github.com/YOUR_ORG/bolt-js.git third_party/upstream/bolt-js

# Pin to specific commits
cd third_party/upstream/shopify-app-js && git checkout <COMMIT_SHA> && cd -
cd third_party/upstream/node-slack-sdk && git checkout <COMMIT_SHA> && cd -
cd third_party/upstream/bolt-js && git checkout <COMMIT_SHA> && cd -

git add .gitmodules third_party/
git commit -m "add upstream SDK submodules at pinned commits"
```

### Key git submodule commands

```bash
# Clone repo with submodules
git clone --recurse-submodules <repo-url>

# Initialize after clone (if forgot --recurse-submodules)
git submodule update --init --recursive

# Update a submodule to a new upstream commit
cd third_party/upstream/shopify-app-js
git fetch origin
git checkout <NEW_COMMIT_SHA>
cd -
git add third_party/upstream/shopify-app-js
git commit -m "bump shopify-app-js submodule to <SHA>"

# Check submodule status
git submodule status
```

### .gitmodules configuration

```ini
[submodule "third_party/upstream/shopify-app-js"]
    path = third_party/upstream/shopify-app-js
    url = https://github.com/YOUR_ORG/shopify-app-js.git
    branch = main

[submodule "third_party/upstream/node-slack-sdk"]
    path = third_party/upstream/node-slack-sdk
    url = https://github.com/YOUR_ORG/node-slack-sdk.git
    branch = main

[submodule "third_party/upstream/bolt-js"]
    path = third_party/upstream/bolt-js
    url = https://github.com/YOUR_ORG/bolt-js.git
    branch = main
```

### Why repo-owned forks (not direct upstream URLs)

- Forks let you add local patches (e.g., exposing internal test helpers) without requesting upstream changes
- Fork refs survive upstream force-pushes or branch deletions
- The fork acts as a cache -- if upstream goes offline, CI still works
- PRs against the fork make submodule updates reviewable before merging

## Installation

```bash
# Official SDK packages -- install at the workspace root as dev dependencies
# These are used in test suites, not in twin runtime code
pnpm add -Dw @shopify/admin-api-client@1.1.1 @shopify/shopify-api@12.3.0
pnpm add -Dw @slack/web-api@7.14.1 @slack/oauth@3.0.4 @slack/bolt@4.6.0

# Surface inventory tooling
pnpm add -Dw ts-morph@25.0.1

# WebSocket library for Socket Mode harness (if not already pulled by @slack/socket-mode)
pnpm add -Dw ws @types/ws

# Align vitest version across workspace
pnpm add -Dw vitest@^3.0.0
```

**Do NOT install these at individual twin package level.** SDK packages are test infrastructure, not twin dependencies. Install at workspace root to keep the dependency boundary clear.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Export enumeration | `ts-morph` | Raw TypeScript compiler API | Compiler API requires significantly more boilerplate for the same result. ts-morph's `getExportedDeclarations()` does the job in one call with automatic re-export resolution. |
| Export enumeration | `ts-morph` | `@microsoft/api-extractor` | API Extractor generates `.d.ts` rollups and `.api.json` reports for your own packages. It does not expose a programmatic API for building custom manifests from third-party package source. |
| Export enumeration | `ts-morph` | Manual `package.json` exports field parsing | The `exports` field describes module entry points, not individual symbols. Misses re-exports, class methods, and type definitions. |
| Submodule management | Git submodules | Vendored source copy | Loses upstream diff history, makes updates opaque, and bloats repo size. Submodules keep the relationship auditable. |
| Submodule management | Repo-owned forks | Direct upstream URLs | Upstream force-pushes, branch renames, or deletions can break submodule resolution. Forks insulate against this. |
| Socket Mode harness | Real `ws.Server` | `mock-socket` or `jest-websocket-mock` | Mock libraries bypass the actual WebSocket transport. The milestone requires real transport verification. `ws.Server` is what Slack itself uses server-side. |
| Lambda harness | Direct function invocation with built event objects | `aws-sdk-mock` or `serverless-offline` | The `AwsLambdaReceiver` is just a function that accepts plain objects. No AWS runtime emulation needed. Direct invocation is simpler and faster. |
| OAuth harness | In-process HTTP server | Separate OAuth proxy service | An in-process `http.createServer` or Fastify route keeps tests self-contained. No container or external service coordination needed. |
| Test runner | Vitest (existing) | Jest | Project already uses Vitest with working configuration. No reason to switch. |

## What NOT to Add

| Avoid | Why | What to Do Instead |
|-------|-----|-------------------|
| `@slack/rtm-api` | Explicitly out of scope for v1.1. RTM is a legacy real-time API. | Defer unless future milestone scope demands it. |
| `@slack/webhook` (standalone) | Standalone incoming webhook client. Not in the targeted package list. | Defer. The webhook concept is already covered by the twin's webhook delivery system. |
| Standalone `@slack/socket-mode` as a direct dependency | It is a transitive dependency of `@slack/bolt@4.6.0`. Installing it separately risks version divergence. | Let pnpm resolve it transitively from Bolt. Only add `ws` + `@types/ws` for the harness server side. |
| `shopify-app-express` or `shopify-app-remix` | Application framework packages, not API client packages. Out of scope per PROJECT.md. | Defer to post-v1.1. |
| `express` as a project dependency | Bolt depends on express internally for `ExpressReceiver`. The project uses Fastify. | Do not add express to the project. It comes as a transitive dep of Bolt, which is fine for the receiver tests. |
| `aws-sdk`, `@aws-sdk/*`, `serverless-offline` | The Lambda harness does not need an AWS runtime. `AwsLambdaReceiver` accepts plain objects. | Build event objects manually using Bolt's own type definitions. |
| `nock`, `msw`, or HTTP interceptors | These mock the transport layer. The milestone explicitly requires real HTTP traffic between SDK and twin. | Use real loopback connections. |

## TypeScript Export Enumeration -- Concrete Approach

```typescript
// tools/sdk-surface/inventory.ts
import { Project } from 'ts-morph';

function inventoryPackage(tsconfigPath: string, entryFile: string) {
  const project = new Project({ tsConfigFilePath: tsconfigPath });
  const sourceFile = project.getSourceFileOrThrow(entryFile);

  const manifest: Record<string, { kind: string; members?: string[] }> = {};

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    const decl = declarations[0]; // Primary declaration
    const kind = decl.getKindName(); // ClassDeclaration, FunctionDeclaration, etc.

    const entry: { kind: string; members?: string[] } = { kind };

    // For classes and interfaces, enumerate public methods
    if ('getMembers' in decl && typeof decl.getMembers === 'function') {
      entry.members = decl.getMembers()
        .filter((m: any) => !m.hasModifier?.('private') && !m.hasModifier?.('protected'))
        .map((m: any) => m.getName?.() ?? '<anonymous>')
        .filter(Boolean);
    }

    manifest[name] = entry;
  }

  return manifest;
}
```

**Run with:** `npx tsx tools/sdk-surface/inventory.ts`

**Output format:** JSON manifest keyed by export name, with declaration kind and public members for classes/interfaces. Checked into `tools/sdk-surface/manifests/` and regenerated when submodule refs or package versions change.

## Sources

| Source | What Was Verified | Confidence |
|--------|-------------------|------------|
| [npm registry: @shopify/admin-api-client](https://registry.npmjs.org/@shopify/admin-api-client/latest) | Version 1.1.1, dependency on `@shopify/graphql-client@^1.4.1`, no peer deps | HIGH |
| [npm registry: @shopify/shopify-api](https://registry.npmjs.org/@shopify/shopify-api/latest) | Version 12.3.0, engines `>=20.0.0`, deps include admin-api-client ^1.1.1 | HIGH |
| [npm registry: @slack/web-api](https://registry.npmjs.org/@slack/web-api/latest) | Version 7.14.1, engines Node >=18, deps include axios ^1.13.5 | HIGH |
| [npm registry: @slack/oauth](https://registry.npmjs.org/@slack/oauth/latest) | Version 3.0.4, engines Node >=18, deps include web-api ^7.10.0 | HIGH |
| [npm registry: @slack/bolt](https://registry.npmjs.org/@slack/bolt/latest) | Version 4.6.0, deps: web-api ^7.12.0, oauth ^3.0.4, socket-mode ^2.0.5 | HIGH |
| [npm registry: @slack/socket-mode](https://registry.npmjs.org/@slack/socket-mode/latest) | Version 2.0.5, deps include ws ^8, engines Node >=18 | HIGH |
| [Bolt SocketModeReceiver source](https://github.com/slackapi/bolt-js/blob/main/src/receivers/SocketModeReceiver.ts) | Uses SocketModeClient, listens for slack_event, supports optional OAuth HTTP server | HIGH |
| [Bolt AwsLambdaReceiver source](https://github.com/slackapi/bolt-js/blob/main/src/receivers/AwsLambdaReceiver.ts) | Handler signature, event parsing, HMAC verification, V1/V2 event types | HIGH |
| [Bolt index.ts exports](https://github.com/slackapi/bolt-js/blob/main/src/index.ts) | Full export list: App, 4 receivers, middleware types, OAuth re-exports, HTTPModuleFunctions, webApi namespace | HIGH |
| [SocketModeClient source](https://github.com/slackapi/node-slack-sdk/blob/main/packages/socket-mode/src/SocketModeClient.ts) | Uses ws via SlackWebSocket wrapper, calls apps.connections.open, exponential backoff reconnection | HIGH |
| [Slack Socket Mode docs](https://docs.slack.dev/apis/events-api/using-socket-mode/) | Protocol: app-level token -> apps.connections.open -> dynamic WebSocket URL, up to 10 connections | HIGH |
| [Shopify/shopify-app-js repo](https://github.com/Shopify/shopify-app-js) | Active monorepo (shopify-api-js archived and merged here). Contains admin-api-client and shopify-api packages. | HIGH |
| [slackapi/node-slack-sdk repo](https://github.com/slackapi/node-slack-sdk) | Monorepo with web-api, oauth, socket-mode, webhook packages | HIGH |
| [slackapi/bolt-js repo](https://github.com/slackapi/bolt-js) | Single-package repo, not a monorepo | HIGH |
| [ts-morph exports documentation](https://ts-morph.com/details/exports) | `getExportedDeclarations()` returns Map of all exports including re-exports | HIGH |
| [ts-morph version compatibility issue #1231](https://github.com/dsherret/ts-morph/issues/1231) | ts-morph bundles its own TypeScript, cannot use project's TS version, by design | HIGH |
| [npm registry: ts-morph 25.0.1](https://registry.npmjs.org/ts-morph/25.0.1) | Version 25.0.1 exists, depends on @ts-morph/common ~0.26.0 | HIGH |
| [ts-morph releases](https://github.com/dsherret/ts-morph/releases) | 25.0.0 bundles TS 5.7.2, 25.0.1 bundles TS 5.7.3, 26.0.0 bundles TS 5.8, 27.0.0 bundles TS 5.9 | HIGH |
| [npm registry: ws](https://registry.npmjs.org/ws/latest) | Version 8.19.0, engines Node >=10 | HIGH |

---
*Stack research for: official SDK-grounded twin conformance*
*Researched: 2026-03-08*
