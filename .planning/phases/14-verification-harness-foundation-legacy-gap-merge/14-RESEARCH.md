# Phase 14: Verification Harness Foundation & Legacy Gap Merge - Research

**Researched:** 2026-03-09
**Domain:** Vitest workspace setup, SDK URL redirection, Slack auth.test, coverage ledger, drift detection
**Confidence:** HIGH

## Summary

Phase 14 constructs the shared SDK verification workspace that Phases 15-20 will build on. Every deliverable is grounded in existing code that already works — `buildApp()`, `vitest.config.ts`, and the smoke test's dual-twin boot pattern are all present. The planner must compose these pieces into a new workspace project under `tests/sdk-verification/`, wire up Vitest global setup to boot both twins, create `createShopifyClient()` and `createSlackClient()` helpers that handle URL redirection, add `auth.test` and `api.test` routes to the Slack twin, migrate legacy conformance suites to Vitest test files, generate a `coverage-report.json` ledger, and add a basic drift check script.

The single most important technical fact is about Shopify URL redirection: `validateDomainAndGetStoreUrl` in the SDK forces `https:` protocol even when you pass `http://localhost`. The `customFetchApi` option receives the constructed (wrong-protocol) URL and must rewrite it to the actual local HTTP endpoint. This means `createShopifyClient()` must intercept every fetch call and swap the protocol/host. The Slack SDK's `slackApiUrl` constructor option is a straightforward URL string replacement and does not have this complication.

The coverage-report.json ledger maps manifest symbols to coverage tier (`live` / `stub` / `deferred`). In Phase 14 the only symbols that get `live` tier are `auth.test`, `api.test`, and the legacy HMAC/webhook/UI symbols. Everything else is `deferred`. CI does not fail on `deferred` symbols until a later phase tightens the gate.

**Primary recommendation:** Mirror the smoke test's `beforeAll`/`afterAll` pattern in a Vitest globalSetup file for the sdk-verification workspace. Use a rewrite-URL `customFetchApi` for Shopify. Use `slackApiUrl` constructor option for Slack. Keep drift detection as a standalone `tsx` script, not a Vitest test, so it can exit non-zero and surface as a CI step independently.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **SDK URL Redirection:** Shared helper pattern — `createShopifyClient()` and `createSlackClient()` utilities in the verification workspace handle twin URL + token + SDK wiring. Tests import helpers and focus on assertions.
- **Shopify URL redirection mechanism:** `customFetchApi`
- **Slack URL redirection mechanism:** `slackApiUrl` constructor option
- **Twin Lifecycle:** Global Vitest setup boots both twins once per suite run, provides URLs via env vars. Matches existing smoke test pattern. Tests are stateless between files via `/admin/reset`. `pnpm test:sdk` is the unified verification command at workspace root.
- **Coverage Reporting:** Generated `coverage-report.json` checked into repo, symbol-by-symbol, diffable in PRs. Three tiers: `live`, `stub`, `deferred`. Phase 14: track but don't fail CI on uncovered symbols.
- **Legacy Check Merge:** Migrate HMAC signature, async webhook timing, and UI structure checks into the SDK verification workspace as standard Vitest test files. Existing `@dtu/conformance` fixture-based runner is replaced by Vitest for the verification workspace.

### Claude's Discretion
- Fixture seeding approach (shared seeders vs per-test)
- Drift detection strictness for Phase 14 (version mismatch, manifest staleness, or both)
- Workspace directory layout (under `tests/sdk-verification/`, or similar)
- `auth.test` and `api.test` implementation details in the Slack twin

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-12 | Per-symbol coverage visibility; CI fails if any v1.1 symbol lacks declared coverage | Coverage-report.json ledger with three-tier system. Phase 14 sets up tracking; CI gate tightened in later phases. |
| INFRA-13 | One verification command runs SDK conformance + HMAC + async webhook timing + UI structure checks | `pnpm test:sdk` at workspace root, unified Vitest project for sdk-verification, legacy suites migrated to `.test.ts` files. |
| INFRA-14 (basic drift) | Detect upstream drift: pinned submodule refs vs installed package versions vs generated manifests | Standalone `check-drift.ts` script using `sdk-pins.json` as the version lock. Reads `package.json` from installed packages, compares to pinned versions and manifest `generatedAt` timestamps. |
| INFRA-15 | SDK tests hit live local HTTP/WebSocket endpoints using official SDK URL redirection mechanisms | `customFetchApi` for Shopify (URL rewrite required due to forced https protocol), `slackApiUrl` for Slack (direct URL string). |
| SLCK-06.5 | `auth.test` and `api.test` via WebClient return valid auth verification responses | New routes in `twins/slack/src/plugins/web-api/`, response shapes from `AuthTestResponse` and `ApiTestResponse` type definitions. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Test runner, global setup, coverage | Already workspace-wide standard; workspace projects pattern in root `vitest.config.ts` |
| @shopify/admin-api-client | 1.1.1 | Shopify SDK under test | Pinned in root `package.json` devDependencies |
| @slack/web-api | 7.14.1 | Slack SDK under test; WebClient with `slackApiUrl` | Pinned in root `package.json` devDependencies |
| tsx | ^4.19.2 | Running TypeScript tools/scripts without compile step | Already devDep in twins; used for drift-check script |
| better-sqlite3 | (transitive via @dtu/state) | In-memory twin state | Already used in both twins |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @shopify/shopify-api | 12.3.0 | Shopify platform SDK (Phase 14 setup only; tested in 16) | Import in helper to test `customFetchApi` wire-up |
| @slack/oauth | 3.0.4 | Slack OAuth (Phase 14 setup only; tested in 19) | Not directly tested in Phase 14 |
| node:crypto | built-in | HMAC verification in legacy check migration | Already used in twins |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest global setup file | `beforeAll` in each test file | Global setup runs once for the whole workspace project; per-file `beforeAll` boots twins repeatedly. Global setup is correct for shared twin lifecycle. |
| Standalone drift `tsx` script | Vitest test for drift | Standalone script exits with non-zero on mismatch (CI step); Vitest test would report as a test failure (less visible for infra checks). |
| `coverage-report.json` (custom) | Vitest's built-in v8 coverage | Vitest coverage tracks source lines, not SDK symbol ownership. Custom ledger maps manifested symbols to tier — a different concept. Both can coexist. |

**Installation:**
```bash
# No new installs needed — all libraries already in devDependencies
# sdk-verification workspace project picks them up via pnpm workspace
```

---

## Architecture Patterns

### Recommended Project Structure
```
tests/
└── sdk-verification/          # New Vitest workspace project
    ├── vitest.config.ts        # Defines globalSetup, testTimeout
    ├── setup/
    │   ├── global-setup.ts     # Boots both twins once; exposes env vars
    │   └── seeders.ts          # Shared fixture seeding helpers
    ├── helpers/
    │   ├── shopify-client.ts   # createShopifyClient() — handles customFetchApi rewrite
    │   └── slack-client.ts     # createSlackClient() — handles slackApiUrl
    ├── sdk/
    │   ├── slack-auth-gateway.test.ts   # SLCK-06.5: auth.test + api.test
    │   └── (placeholder for Phase 15+)
    ├── legacy/
    │   ├── hmac-signature.test.ts       # Migrated from @dtu/conformance suites
    │   ├── webhook-timing.test.ts       # Async webhook delivery timing
    │   └── ui-structure.test.ts         # UI endpoint structure checks
    ├── coverage/
    │   └── coverage-report.json         # Symbol → tier ledger (checked in)
    └── drift/
        └── check-drift.ts               # Standalone drift detection script
```

### Pattern 1: Vitest Global Setup for Twin Lifecycle
**What:** A `globalSetup` file that boots both twins once before all tests in the workspace project run, then tears them down after. URLs are injected via `process.env`.
**When to use:** Exactly once — in `tests/sdk-verification/vitest.config.ts`. Individual test files do NOT boot twins.

```typescript
// tests/sdk-verification/setup/global-setup.ts
import type { GlobalSetupContext } from 'vitest/node';

let shopifyApp: any;
let slackApp: any;

export async function setup(_ctx: GlobalSetupContext) {
  // Respect external env vars (CI with Docker), else boot in-process
  if (!process.env.SHOPIFY_API_URL) {
    const { buildApp } = await import('../../../twins/shopify/src/index.js');
    shopifyApp = await buildApp({ logger: false });
    await shopifyApp.listen({ port: 0, host: '127.0.0.1' });
    const addr = shopifyApp.addresses()[0];
    process.env.SHOPIFY_API_URL = `http://127.0.0.1:${addr.port}`;
  }

  if (!process.env.SLACK_API_URL) {
    const { buildApp } = await import('../../../twins/slack/src/index.js');
    slackApp = await buildApp({ logger: false });
    await slackApp.listen({ port: 0, host: '127.0.0.1' });
    const addr = slackApp.addresses()[0];
    process.env.SLACK_API_URL = `http://127.0.0.1:${addr.port}`;
  }
}

export async function teardown() {
  if (shopifyApp) await shopifyApp.close();
  if (slackApp) await slackApp.close();
}
```

**Key:** Must export named `setup` and `teardown` functions — Vitest 3.x globalSetup API.

### Pattern 2: Shopify SDK URL Redirection via customFetchApi
**What:** `validateDomainAndGetStoreUrl` in `@shopify/admin-api-client` forces `https:` protocol on any `storeDomain` input via `url.protocol = 'https'`. The URL reaching `customFetchApi` will always start with `https://`. The `customFetchApi` function must rewrite the URL to the local twin.

```typescript
// tests/sdk-verification/helpers/shopify-client.ts
import { createAdminApiClient } from '@shopify/admin-api-client';

export function createShopifyClient(options?: { apiVersion?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!; // e.g., http://127.0.0.1:PORT
  const twinUrl = new URL(twinBaseUrl);

  // The SDK constructs: https://myshop.myshopify.com/admin/api/VERSION/graphql.json
  // customFetchApi rewrites just protocol + host, preserving path
  const customFetchApi: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    url.protocol = twinUrl.protocol;     // http:
    url.hostname = twinUrl.hostname;     // 127.0.0.1
    url.port = twinUrl.port;            // dynamic port
    return fetch(url.toString(), init);
  };

  return createAdminApiClient({
    storeDomain: 'dev.myshopify.com',   // any valid domain shape; rewritten by customFetchApi
    apiVersion: options?.apiVersion ?? '2025-07',
    accessToken: 'test-access-token',
    customFetchApi,
    isTesting: true,                    // suppress window check
  });
}
```

**Critical:** `storeDomain` must be a valid domain format (passes `new URL()` parsing). Use a stable fake like `dev.myshopify.com`. The `customFetchApi` handles the rewrite — no changes to twin routing needed.

**API version note:** As of 2026-03-09, `getCurrentSupportedApiVersions()` returns `2025-07`, `2025-10`, `2026-01`, the next quarter `2026-04`, and `unstable`. Use `2025-07` as the default — the oldest currently supported version ensures the twin's existing `2024-01` path still matches after the rewrite.

### Pattern 3: Slack SDK URL Redirection via slackApiUrl
**What:** `WebClient` constructor accepts `slackApiUrl` as a string. This is the base URL for all API calls. No protocol forcing — pass the HTTP URL directly.

```typescript
// tests/sdk-verification/helpers/slack-client.ts
import { WebClient } from '@slack/web-api';

export function createSlackClient(token?: string) {
  const slackApiUrl = process.env.SLACK_API_URL!; // e.g., http://127.0.0.1:PORT
  return new WebClient(token ?? 'xoxb-test-token', {
    slackApiUrl: slackApiUrl + '/api/',  // WebClient appends method name: /api/auth.test
  });
}
```

**Key detail:** The existing Slack twin routes are at `/api/chat.postMessage`, `/api/oauth.v2.access`, etc. `WebClient` appends the method name to `slackApiUrl`. If `slackApiUrl` is `http://host/api/`, the resulting URL is `http://host/api/auth.test` — which matches the existing route pattern. The `slackApiUrl` must end with `/`.

### Pattern 4: auth.test and api.test Routes in Slack Twin
**What:** New Fastify plugin at `twins/slack/src/plugins/web-api/auth.ts` implementing the gateway endpoints.

**auth.test response shape** (from `AuthTestResponse` type in SDK source):
```typescript
// Route: POST /api/auth.test
// Token required: yes (Bearer header or body.token)
{
  ok: true,
  url: 'https://twin-workspace.slack.com/',
  team: 'Twin Workspace',
  user: 'bot',
  team_id: 'T_TWIN',
  user_id: 'U_BOT_TWIN',
  bot_id: 'B_BOT_TWIN',
  is_enterprise_install: false,
}
```

**api.test response shape** (from `ApiTestResponse` type):
```typescript
// Route: POST /api/api.test
// Token: optional (echo-back endpoint)
{
  ok: true,
  args: { /* echo of request params */ },
}
```

**Plugin structure** follows existing `chat.ts` pattern:
- Extract token via `extractToken(request)` for auth.test (required); skip for api.test
- Rate-limit check using `fastify.rateLimiter.check('auth.test', token)`
- Error simulation check via `fastify.slackStateManager.getErrorConfig('auth.test')`
- Return `{ ok: false, error: 'not_authed' }` for missing token (HTTP 200, Slack convention)

### Pattern 5: Coverage-Report Ledger
**What:** A JSON file that maps every inventoried symbol to a coverage tier. Generated by a script that reads the five manifests and merges with test attribution.

```json
// tests/sdk-verification/coverage/coverage-report.json (example structure)
{
  "$schema": "...",
  "generatedAt": "2026-03-09T...",
  "phase": "14",
  "packages": {
    "@slack/web-api@7.14.1": {
      "WebClient.auth.test": { "tier": "live", "testFile": "sdk/slack-auth-gateway.test.ts" },
      "WebClient.api.test": { "tier": "live", "testFile": "sdk/slack-auth-gateway.test.ts" },
      "WebClient.chat.postMessage": { "tier": "deferred", "testFile": null }
    }
  },
  "summary": {
    "live": 2,
    "stub": 0,
    "deferred": 877
  }
}
```

**Generation approach:** A script (`coverage/generate-report.ts`) reads each manifest JSON, walks symbols, and assigns tiers based on which symbols have test files. Run via `tsx` before committing. The file is checked in — CI diffs it.

### Pattern 6: Drift Detection Script
**What:** A standalone `tsx` script that compares `sdk-pins.json` against installed `package.json` versions and manifest `generatedAt` timestamps.

**Drift checks for Phase 14 (basic):**
1. For each package in `sdk-pins.json`: read `version` from `node_modules/<pkg>/package.json` and compare to pinned `version`. Fail if mismatch.
2. For each manifest in `tools/sdk-surface/manifests/`: compare `generatedAt` to last modification time of the corresponding submodule directory. Warn if manifest is older than the submodule's last commit timestamp.

**Exit behavior:** Exit code 1 on version mismatch (hard fail); exit 0 with warning output on stale manifest (soft warn). CI reads exit code.

### Pattern 7: Legacy Conformance Migration
**What:** The existing `@dtu/conformance` suites (webhooks.conformance.ts with HMAC/timing logic) are rewritten as plain Vitest test files in `tests/sdk-verification/legacy/`.

**Key insight:** The `ConformanceRunner` fixture-comparison model is NOT used in the new workspace. Tests simply:
1. Boot-once twins (via globalSetup)
2. Reset twin state via `fetch('/admin/reset', { method: 'POST' })`
3. Make HTTP requests directly
4. Assert on responses

This is simpler than the adapter/runner/reporter pattern, and is consistent with how Phase 14+ SDK tests work.

**HMAC test structure:**
```typescript
// tests/sdk-verification/legacy/hmac-signature.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

const shopifyUrl = () => process.env.SHOPIFY_API_URL!;

beforeEach(async () => {
  await fetch(`${shopifyUrl()}/admin/reset`, { method: 'POST' });
});

describe('HMAC Signature Verification', () => {
  it('valid HMAC signature accepted', async () => { /* ... */ });
  it('invalid HMAC signature rejected', async () => { /* ... */ });
});
```

### Anti-Patterns to Avoid
- **Booting twins inside test files:** Global setup boots twins once. Test files must use env var URLs only.
- **Using `https://localhost`:** `createShopifyClient()` always rewrites to HTTP. Tests must never construct SDK clients with `https://` pointing at localhost directly.
- **Importing from `@dtu/conformance` in the new workspace:** The new workspace uses raw Vitest + direct fetch. The `@dtu/conformance` package remains for the existing twin conformance suites; the SDK verification workspace does not depend on it.
- **Failing CI on deferred symbols in Phase 14:** The coverage-report.json gate is informational only in Phase 14. CI step reads the report but does not fail on `deferred` symbols until Phase 18+.
- **Using `pnpm --filter @dtu/twin-slack run conformance:twin` for SDK tests:** That runs the old conformance runner. The new `pnpm test:sdk` at workspace root runs the Vitest sdk-verification project.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API version compatibility | Custom version format logic | `getCurrentSupportedApiVersions()` from SDK (or just use `unstable` / current quarter) | SDK already has this; passing a valid supported version avoids console warnings |
| HMAC signing | Custom crypto implementation | `node:crypto` `createHmac` | Already used in the Shopify twin's webhook signing |
| Token validation logic | New token parser | Import `extractToken` from `twins/slack/src/services/token-validator.js` | auth.test route uses same token extraction pattern as chat.ts |
| Rate limiting for auth.test | New rate limiter | Use existing `SlackRateLimiter.check()` | Already decorated on `fastify.rateLimiter` |

---

## Common Pitfalls

### Pitfall 1: Shopify SDK Forces https Protocol
**What goes wrong:** Passing `http://127.0.0.1:PORT` as `storeDomain` to `createAdminApiClient` results in `https://127.0.0.1:PORT` being constructed (the `validateDomainAndGetStoreUrl` function forces `url.protocol = 'https'`). The `customFetchApi` receives the https URL and the request fails against the HTTP-only twin.
**Why it happens:** The SDK assumes all Shopify stores use HTTPS. The protocol is forcibly set, not just defaulted.
**How to avoid:** In `createShopifyClient()`, the `customFetchApi` must always rewrite protocol + hostname + port from the URL it receives. Never assume the URL passed to `customFetchApi` has the right protocol.
**Warning signs:** `ECONNREFUSED` or SSL errors when running Shopify SDK tests against the twin.

### Pitfall 2: WebClient slackApiUrl Must End with /
**What goes wrong:** If `slackApiUrl` does not end with `/`, the WebClient constructs URLs like `http://host/apiauth.test` instead of `http://host/api/auth.test`.
**Why it happens:** WebClient concatenates `slackApiUrl + methodName` without inserting a separator.
**How to avoid:** `createSlackClient()` always appends `/` to the base URL before adding `/api/`. The final value should be `http://127.0.0.1:PORT/api/`.
**Warning signs:** 404 responses from the twin; method routes not matching.

### Pitfall 3: Global Setup Env Vars Not Visible in Worker Threads
**What goes wrong:** Vitest runs tests in worker threads by default. `process.env` mutations in the globalSetup file may not propagate to worker processes depending on Vitest version and config.
**Why it happens:** Vitest's worker isolation. The globalSetup file runs in the main process; workers get a snapshot of env at startup.
**How to avoid:** Use Vitest's `provide` / `inject` mechanism (Vitest 3.x) to pass URLs, OR set env vars before workers spawn by using the Vitest config's `env` option. Alternatively, verify by inspecting whether `process.env.SHOPIFY_API_URL` is defined in a test and logging it. The existing smoke test uses `beforeAll` not globalSetup precisely to avoid this — for the sdk-verification workspace, using globalSetup with `forking: false` or worker shared env is worth validating during implementation.
**Warning signs:** `Cannot read properties of undefined (reading 'replace')` when constructing URLs from env vars in tests.

### Pitfall 4: Vitest Workspace Project Discovery
**What goes wrong:** The new `tests/sdk-verification/` directory is not picked up by the root `vitest.config.ts` glob `tests/*`.
**Why it happens:** The root config uses `projects: ['packages/*', 'twins/*', 'tests/*']` — this glob matches subdirectories of `tests/`, but only if each subdirectory has its own `vitest.config.ts`. A missing or misconfigured per-project config causes silent exclusion.
**How to avoid:** The `tests/sdk-verification/vitest.config.ts` must exist. The root config's `tests/*` pattern already covers it — verify with `vitest list --project sdk-verification`.
**Warning signs:** `pnpm test:sdk` runs but reports 0 test suites.

### Pitfall 5: auth.test Token Required on Every Call
**What goes wrong:** Some Slack SDK methods call `auth.test` internally during initialization. If the WebClient is constructed with a valid token but the twin returns `not_authed`, the WebClient constructor may throw or set internal state to failed.
**Why it happens:** `@slack/web-api` WebClient does NOT auto-call `auth.test` on construction — this is a common misconception. `auth.test` is called explicitly by the application or by some Bolt workflows. However, OAuth flows may call it. The test must provide a token the twin recognizes.
**How to avoid:** `createSlackClient()` uses `xoxb-test-token` by default. The `SlackStateManager.getToken()` lookup must succeed for this token. Options: seed a known token in the global setup, or use the OAuth flow in `beforeEach` to get a real token. Seeding is simpler.
**Warning signs:** `{ ok: false, error: 'invalid_auth' }` from auth.test even with a token in the header.

### Pitfall 6: Legacy Conformance Suite Assumptions About Runner State
**What goes wrong:** The migrated HMAC/webhook/UI tests from `twins/shopify/conformance/suites/webhooks.conformance.ts` rely on the `ConformanceRunner` setup/teardown lifecycle. When rewritten as plain Vitest tests, setup/teardown must be explicitly converted to `beforeEach`/`afterEach` blocks.
**Why it happens:** The `ConformanceSuite` format has a `test.setup` array of operations. These must be translated to explicit `beforeEach` fetch calls in the migrated test files.
**How to avoid:** For each conformance suite test with a `setup` array, create a `beforeEach` that executes those setup operations as fetch calls. Use `beforeEach(() => fetch('/admin/reset', { method: 'POST' }))` at the describe block level for state cleanup.

---

## Code Examples

### Verified: Slack WebClient slackApiUrl option
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts line 267
// Default: slackApiUrl = 'https://slack.com/api/'
// Constructor option overrides:
const client = new WebClient('xoxb-token', {
  slackApiUrl: 'http://127.0.0.1:3001/api/',
});
```

### Verified: Shopify customFetchApi signature
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/http-fetch.ts
// customFetchApi?: CustomFetchApi  (defaults to global fetch)
// Called as: response = await customFetchApi(...requestParams)
// requestParams = [url: string, init: RequestInit]
const client = createAdminApiClient({
  storeDomain: 'dev.myshopify.com',
  apiVersion: '2025-07',
  accessToken: 'token',
  customFetchApi: async (url, init) => {
    // URL has https:// forced by SDK; rewrite to local twin
    const rewritten = url.replace('https://dev.myshopify.com', 'http://127.0.0.1:3000');
    return fetch(rewritten, init);
  },
  isTesting: true,
});
```

### Verified: auth.test Response Shape
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/AuthTestResponse.ts
// AuthTestResponse extends WebAPICallResult
// Required for WebClient gateway:
{
  ok: true,
  url: 'https://twin-workspace.slack.com/',
  team: 'Twin Workspace',
  user: 'bot',
  team_id: 'T_TWIN',
  user_id: 'U_BOT_TWIN',
  bot_id: 'B_BOT_TWIN',
  is_enterprise_install: false,
}
```

### Verified: api.test Response Shape
```typescript
// Source: third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/ApiTestResponse.ts
// Echo-back endpoint — args reflects what was sent
{
  ok: true,
  args: { foo: 'bar' },  // whatever query params were sent
}
```

### Verified: Vitest Global Setup API (3.x)
```typescript
// Source: Vitest 3.x docs — globalSetup exports setup() + teardown()
// vitest.config.ts for sdk-verification workspace:
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['./setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: 'node',
  },
});
```

### Verified: Existing Route Pattern for Slack Web API Plugin
```typescript
// Source: twins/slack/src/plugins/web-api/chat.ts
// Pattern for auth.ts plugin:
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/auth.test', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.status(200).send({ ok: false, error: 'not_authed' });
    const tokenRecord = fastify.slackStateManager.getToken(token);
    if (!tokenRecord) return reply.status(200).send({ ok: false, error: 'invalid_auth' });
    const limited = fastify.rateLimiter.check('auth.test', token);
    if (limited) return reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' });
    // ... return auth.test response
  });

  fastify.post('/api/api.test', async (request) => {
    // No token required; echo request args
    return { ok: true, args: { ...request.query, ...request.body } };
  });
};
```

### Verified: Seeding a Known Token for Tests
```typescript
// SlackStateManager.createToken signature (from state/slack-state-manager.ts line 303):
// createToken(token, tokenType, teamId, userId, scope, appId)
// In globalSetup or seeder:
slackStateManager.createToken(
  'xoxb-test-token',
  'bot',
  'T_TWIN',
  'U_BOT_TWIN',
  'chat:write',
  'A_TEST_APP'
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@dtu/conformance` ConformanceRunner + adapters | Vitest test files with direct fetch | Phase 14 | Simpler, unified reporter, one command |
| Twin-specific `conformance:twin` scripts per package | `pnpm test:sdk` at workspace root | Phase 14 | Single entry point for all SDK verification |
| Manual HMAC/webhook checks (separate command) | Vitest suite in `tests/sdk-verification/legacy/` | Phase 14 | Same CI run, same report format |

**Deprecated/outdated for the SDK verification workspace:**
- `@dtu/conformance` runner: The existing twin conformance suites (`pnpm --filter @dtu/twin-shopify run conformance:twin`) continue to exist and run in CI via `conformance.yml`. They are NOT removed in Phase 14 — only the new SDK verification workspace uses plain Vitest. The two systems coexist until Phases 15-20 build out full SDK coverage.

---

## Open Questions

1. **Vitest globalSetup env var propagation to workers**
   - What we know: Vitest 3.x has a `provide`/`inject` API in globalSetup for passing data to test files. `process.env` mutation in globalSetup may or may not propagate.
   - What's unclear: Whether the smoke test's use of `beforeAll` (not globalSetup) is a deliberate workaround for this.
   - Recommendation: In Wave 0, test env var visibility explicitly. Fall back to Vitest's `provide`/`inject` API if `process.env` is not visible in workers. The `globalSetup` file can call `provide('SHOPIFY_API_URL', url)` and tests use `inject('SHOPIFY_API_URL')`.

2. **Shopify API version for twin**
   - What we know: The twin's Shopify GraphQL route is at `/admin/api/2024-01/graphql.json`. The `customFetchApi` rewrites the URL entirely, so the path component (including version) comes from the SDK's `apiUrlFormatter`. As of 2026-03-09, `2024-01` is no longer in the supported versions list returned by `getCurrentSupportedApiVersions()`.
   - What's unclear: Whether the SDK logs a warning for unsupported versions or throws.
   - Recommendation: Use `unstable` as the `apiVersion` in `createShopifyClient()`. The URL becomes `/admin/api/unstable/graphql.json` — the twin must serve this path, or the rewrite logic should strip the version path and always route to the current twin endpoint. Simplest: update the twin's GraphQL route to handle multiple version paths, or use `unstable` and update the twin's route match.

3. **Coverage ledger generation timing**
   - What we know: `coverage-report.json` must be checked in and diffable.
   - What's unclear: Should it be regenerated by the `test:sdk` command on every run, or only by a dedicated `coverage:generate` script?
   - Recommendation: Keep it as a separate script (`pnpm coverage:generate`) that developers run before committing. The CI `test:sdk` reads the existing ledger for the gate check but does not regenerate it. This prevents CI from committing files.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `tests/sdk-verification/vitest.config.ts` (Wave 0 gap) |
| Quick run command | `pnpm --filter sdk-verification test --reporter=verbose` |
| Full suite command | `pnpm test:sdk` (workspace root) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-06.5 | `auth.test` returns valid auth response | live (SDK against twin) | `pnpm test:sdk --reporter=verbose tests/sdk-verification/sdk/slack-auth-gateway.test.ts` | ❌ Wave 0 |
| SLCK-06.5 | `api.test` returns echo response | live (SDK against twin) | same file | ❌ Wave 0 |
| INFRA-15 | Shopify SDK hits twin via customFetchApi | live (SDK against twin) | `pnpm test:sdk --reporter=verbose tests/sdk-verification/sdk/shopify-client-wire.test.ts` | ❌ Wave 0 |
| INFRA-15 | Slack SDK hits twin via slackApiUrl | live (SDK against twin) | `pnpm test:sdk --reporter=verbose tests/sdk-verification/sdk/slack-auth-gateway.test.ts` | ❌ Wave 0 |
| INFRA-13 | Unified command runs SDK + legacy checks | integration | `pnpm test:sdk` (all projects) | ❌ Wave 0 |
| INFRA-13 | HMAC signature check runs | unit | `pnpm test:sdk tests/sdk-verification/legacy/hmac-signature.test.ts` | ❌ Wave 0 |
| INFRA-13 | Async webhook timing check runs | integration | `pnpm test:sdk tests/sdk-verification/legacy/webhook-timing.test.ts` | ❌ Wave 0 |
| INFRA-13 | UI structure check runs | smoke | `pnpm test:sdk tests/sdk-verification/legacy/ui-structure.test.ts` | ❌ Wave 0 |
| INFRA-12 | Coverage ledger present and parseable | manual | inspect `tests/sdk-verification/coverage/coverage-report.json` | ❌ Wave 0 |
| INFRA-14 | Drift check passes on clean repo | script | `npx tsx tests/sdk-verification/drift/check-drift.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk` on the modified test file only
- **Per wave merge:** Full `pnpm test:sdk` — all legacy + SDK gateway tests
- **Phase gate:** Full suite green + drift check exits 0 + coverage-report.json present before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/vitest.config.ts` — workspace project config with globalSetup
- [ ] `tests/sdk-verification/setup/global-setup.ts` — twin boot and env var injection
- [ ] `tests/sdk-verification/helpers/shopify-client.ts` — createShopifyClient with customFetchApi
- [ ] `tests/sdk-verification/helpers/slack-client.ts` — createSlackClient with slackApiUrl
- [ ] `tests/sdk-verification/sdk/slack-auth-gateway.test.ts` — SLCK-06.5 tests
- [ ] `tests/sdk-verification/legacy/hmac-signature.test.ts` — migrated from conformance suites
- [ ] `tests/sdk-verification/legacy/webhook-timing.test.ts` — migrated from conformance suites
- [ ] `tests/sdk-verification/legacy/ui-structure.test.ts` — migrated from conformance suites
- [ ] `tests/sdk-verification/coverage/coverage-report.json` — symbol ledger initial state
- [ ] `tests/sdk-verification/drift/check-drift.ts` — drift detection script
- [ ] `twins/slack/src/plugins/web-api/auth.ts` — auth.test and api.test routes
- [ ] `twins/slack/src/index.ts` — register authPlugin
- [ ] `package.json` (root) — add `test:sdk` script (`vitest run --project sdk-verification` or `vitest --config tests/sdk-verification/vitest.config.ts`)

---

## Sources

### Primary (HIGH confidence)
- `/third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts` — `slackApiUrl` option at line 86, 194, 267, 287-289
- `/third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/AuthTestResponse.ts` — exact response shape
- `/third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/ApiTestResponse.ts` — exact response shape
- `/third_party/upstream/node-slack-sdk/packages/web-api/src/methods.ts` — `auth.test` bound at line 1487, `api.test` at line 1380
- `/third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/api-client-utilities/validations.ts` — `validateDomainAndGetStoreUrl` with `url.protocol = 'https'` at line 22
- `/third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/http-fetch.ts` — `customFetchApi` call site and signature
- `/third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/api-client-utilities/api-versions.ts` — `getCurrentSupportedApiVersions()` logic
- `/tests/integration/smoke.test.ts` — authoritative dual-twin boot pattern
- `/twins/slack/src/index.ts` — `buildApp()` factory and plugin registration order
- `/twins/shopify/src/index.ts` — `buildApp()` factory
- `/twins/slack/src/state/slack-state-manager.ts` — default seeds (T_TWIN, U_BOT_TWIN, C_GENERAL), `createToken` signature
- `/twins/slack/src/plugins/web-api/chat.ts` — route plugin template for auth.ts
- `/vitest.config.ts` — `projects: ['packages/*', 'twins/*', 'tests/*']` workspace config
- `/third_party/sdk-pins.json` — version lock structure for drift detection

### Secondary (MEDIUM confidence)
- Vitest 3.x globalSetup `provide`/`inject` API — documented in Vitest official docs; env var propagation behavior requires empirical validation during Wave 0

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json and upstream source
- Architecture: HIGH — all patterns derived from existing working code in the repo
- Pitfalls: HIGH — URL protocol forcing verified by reading SDK source directly; env var propagation is MEDIUM (known Vitest behavior, needs validation)
- SDK response shapes: HIGH — read directly from generated TypeScript type files in submodule

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (stable SDK versions; 90-day window before quarterly Shopify API version rollover changes supported versions list)
