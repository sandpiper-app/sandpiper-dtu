# Technology Stack

**Project:** Sandpiper DTU v1.2 — Behavioral Fidelity Fixes
**Researched:** 2026-03-11
**Confidence:** HIGH

---

## Summary: What Changes for v1.2

v1.1 added new packages. v1.2 adds **zero new runtime dependencies** to the twins. Every fix listed below is implemented using Node.js built-ins or libraries already present in the project. The work is behavioral, not infrastructural.

| Area | Approach | New Dep? |
|------|----------|----------|
| Slack signing verification | `node:crypto` HMAC (already used in `@dtu/webhooks`) | No |
| Shopify OAuth HMAC | `node:crypto` HMAC, same algorithm already in tests | No |
| Shopify OAuth cookie | `node:crypto` HMAC for keygrip-style signing | No |
| Storefront separate schema | Second `.graphql` file + second `graphql-yoga` instance | No |
| API version routing | Fastify wildcard route parameter `:version` | No |
| REST response shapes | Numeric IDs, `admin_graphql_api_id` field in existing route handlers | No |
| Billing state machine | New state table in SQLite via existing `better-sqlite3` | No |
| Rate limit response | Already correct (maxAvailable=1000, restoreRate=50) | No |
| Slack 126 missing methods | Extend existing `stubs.ts` pattern | No |
| Slack chat semantics | Add channel membership check to existing `chat.ts` handlers | No |
| Slack interactivity URL | New Fastify route `/api/interactions` in existing twin | No |
| Slack state (convs/pins/reactions) | New SQLite tables in existing `SlackStateManager` | No |
| Slack scope enforcement | `scopeGuard()` helper using existing token scopes field | No |
| pnpm test:sdk | Fix `vitest.config.ts` project reference | No |
| Conformance overhaul | Extend `@dtu/conformance` with structural diff and coverage tracker | No |

---

## Recommended Stack

### Core Technologies (Unchanged from v1.1)

All existing stack decisions are validated and carry forward.

| Technology | Version | Role in v1.2 |
|------------|---------|--------------|
| `fastify` | ^5.0.0 | Twin HTTP servers. All new routes are Fastify plugin additions. |
| `graphql-yoga` | ^5.8.3 | GraphQL server. New Storefront endpoint uses a second yoga instance. |
| `@graphql-tools/schema` | ^10.0.0 | `makeExecutableSchema` for both Admin and Storefront schemas. |
| `graphql` | ^16.9.0 | Schema parse and execution for both Admin and Storefront. |
| `better-sqlite3` | (via `@dtu/state`) | New billing state tables and Slack stateful tables. |
| `vitest` | ^3.0.0 | Test runner. `test:sdk` fix is a config change, not a library change. |
| `@fastify/formbody` | ^8.0.0 | Already registered. Slack Web API uses `application/x-www-form-urlencoded`. |

### No New Dependencies Needed

The following is an explicit rejection list for libraries that appear tempting but must not be added:

| Library | Why NOT to Add |
|---------|----------------|
| `@slack/signature` (standalone) | Does not exist as a standalone package. Bolt bundles `tsscmp` + `node:crypto` in `verify-request.js`. Replicate the same algorithm using `node:crypto` directly. |
| `keygrip` | Used by some cookie-signing implementations. The `@shopify/shopify-api` SDK uses its own `Cookies` class (in `dist/cjs/runtime/http/cookies.js`) built on `node:crypto` HMAC-SHA256 with `keygrip`-style `name=value.sig=hmac` headers. Implement the same pattern using `node:crypto.createHmac('sha256', apiSecretKey)`. |
| `cookie` or `set-cookie-parser` | `node:http` `IncomingMessage` headers parsed manually by the SDK. The twin uses `request.headers.cookie` string directly — no parser needed. |
| `jose` (new) | Already a root devDependency (pulled in by `@shopify/shopify-api`). Do not add it again. |
| `nonce` or any UUID library | `node:crypto.randomUUID()` covers all nonce generation needs. |
| Additional `graphql-yoga` version | The existing `^5.8.3` supports multiple instances in the same Fastify process. |
| `@graphql-tools/stitch` or schema federation | Not needed. Storefront and Admin are separate schemas on separate routes — no stitching. |

---

## SDK HTTP-Level Behavior (From Source Analysis)

This section documents what the installed SDK packages actually send at the HTTP layer. These are the behaviors the twin must match exactly.

### `@shopify/admin-api-client@1.1.1` — GraphQL Requests

**Source:** `node_modules/@shopify/admin-api-client/dist/graphql/client.js`, `dist/constants.js`

**URL pattern:** `https://{storeDomain}/admin/api/{apiVersion}/graphql.json`

**Headers sent on every request:**
```
Content-Type: application/json
Accept: application/json
X-Shopify-Access-Token: {accessToken}
User-Agent: {userAgentPrefix | }Admin API Client v1.1.1
```

**API version validation behavior:** The client calls `validateApiVersion()` from `@shopify/graphql-client`. This function checks against `getCurrentSupportedApiVersions()`, which computes the current quarter and returns the 3 previous quarters, current, next quarter, and `unstable`. As of March 2026 that is: `2025-04`, `2025-07`, `2025-10`, `2026-01`, `2026-04`, `unstable`. Version `2024-01` (the only one hardcoded in the twin) is **not** in the supported list. The SDK logs a `console.warn` (not a throw) when the version is unsupported. The client still makes the request — the URL simply contains the version string passed in. **The twin must accept any version string in the URL path**, not reject it.

**Key finding:** `validateApiVersion` is a warning, not a hard error. The SDK proceeds to make the HTTP request to `/{version}/graphql.json` regardless. The twin's hardcoded `2024-01` route will fail any test that initializes the SDK client with a different `apiVersion`.

### `@shopify/admin-api-client@1.1.1` — REST Requests

**Source:** `node_modules/@shopify/admin-api-client/dist/rest/client.js`

**URL pattern:** `https://{storeDomain}/admin/api/{apiVersion}/{path}.json`

**Headers:** Same as GraphQL — `Content-Type: application/json`, `Accept: application/json`, `X-Shopify-Access-Token: {accessToken}`.

**ID handling — critical:** The REST client uses `lossless-json` to parse responses. All fields named `id` or ending in `_id` are converted to strings. Fields named in `_ids` arrays are also converted to strings. Non-ID numeric fields become regular JavaScript numbers. **The twin must return numeric IDs as actual JSON numbers** (not GID strings like `gid://shopify/Product/1`) — the lossless-json layer converts them to strings internally. Returning a GID string causes type mismatch in assertions.

**`admin_graphql_api_id` field:** This field is expected in REST resource responses by consuming code that needs to cross-reference REST and GraphQL entities. The SDK REST base class does not add it automatically — it must be in the response JSON from the twin.

**URL formatting:** The REST client prepends `admin/api/{version}/` and appends `.json` if the path does not start with `admin` and does not end with `.json`. The twin's existing routes hardcode `2024-01` — must become a wildcard.

**Retriable status codes:** `429`, `500`, `503` — the client automatically retries on these.

### `@shopify/shopify-api@12.3.0` — OAuth Flow

**Source:** `node_modules/@shopify/shopify-api/dist/cjs/lib/auth/oauth/oauth.js`

**`auth.begin()` flow:**
1. Sets a signed cookie: `shopify_app_state=<nonce>` with a companion `shopify_app_state.sig=<sha256-hmac>` cookie
2. Redirects to: `https://{shop}/admin/oauth/authorize?client_id={apiKey}&scope={scopes}&redirect_uri={callbackUrl}&state={nonce}&grant_options[]={online|''}`
3. The signing key is `config.apiSecretKey`

**`auth.callback()` flow:**
1. Reads `shopify_app_state` cookie from `Cookie` header and verifies its HMAC signature against `config.apiSecretKey`
2. Throws `CookieNotFound` if cookie is absent
3. Validates HMAC of callback query params: strips `hmac` and `signature` keys, sorts remaining keys by `localeCompare`, URL-encodes as `key=value&key=value`, computes SHA256-HMAC in **hex format** using `config.apiSecretKey`
4. Validates `state` query param equals the cookie value (timing-safe `safeCompare`)
5. Validates timestamp within 90-second window
6. POSTs to `https://{shop}/admin/oauth/access_token` with JSON body `{client_id, client_secret, code, expiring}`
7. Token endpoint must return `{access_token: string, scope: string}` — that's the complete required shape

**Cookie signing algorithm:** The SDK uses its own `Cookies` class that implements keygrip-style signing. For the twin to set a state cookie that `auth.callback()` can verify, the twin's `/admin/oauth/authorize` endpoint must:
- Generate a nonce
- Set `Set-Cookie: shopify_app_state={nonce}; Path=/auth/callback; SameSite=Lax; Secure`
- Set `Set-Cookie: shopify_app_state.sig={sha256-hmac-of-"shopify_app_state={nonce}"}; Path=/auth/callback; SameSite=Lax; Secure`
- Where the HMAC key is `config.apiSecretKey` and the input is `shopify_app_state={nonce}` using `createHmac('sha256', key).update(input).digest('base64url')`

**Current twin gap:** `twins/shopify/src/plugins/oauth.ts` only has `POST /admin/oauth/access_token`. It is missing `GET /admin/oauth/authorize` (the redirect with cookie-setting).

### `@shopify/shopify-api@12.3.0` — Billing

**Source:** `node_modules/@shopify/shopify-api/dist/cjs/lib/billing/request.js`, `check.js`, `types.js`

**`billing.request()` sends:**
1. `appSubscriptionCreate` mutation with variables `{name, returnUrl, test, trialDays, replacementBehavior, lineItems}` — expects `{appSubscription: {id, name, status, ...}, confirmationUrl, userErrors}`
2. `appPurchaseOneTimeCreate` mutation — expects `{appPurchaseOneTime: {id, name, test}, confirmationUrl, userErrors}`

**`billing.check()` sends:**
1. `currentAppInstallation` query with `activeSubscriptions` and `oneTimePurchases { edges { node { id name test status } } pageInfo { hasNextPage endCursor } }` — this query shape is what the twin must return data for
2. The check logic reads `installation.activeSubscriptions` and paginates through `oneTimePurchases`

**Current twin gap:** `currentAppInstallation` resolver hardcodes `activeSubscriptions: []` and `oneTimePurchases: { edges: [], pageInfo: { hasNextPage: false } }`. The `appSubscriptionCreate` resolver does not persist state — calling `billing.check()` after `billing.request()` always returns no active subscriptions.

**Fix:** Add a `billing_subscriptions` table to SQLite (via `StateManager`). `appSubscriptionCreate` writes a row. `currentAppInstallation` reads from it. `appSubscriptionCancel` updates status.

### `@shopify/storefront-api-client@1.0.9` — Storefront GraphQL

**Source:** `node_modules/.pnpm/@shopify+storefront-api-client@1.0.9/node_modules/@shopify/storefront-api-client/dist/storefront-api-client.js`, `dist/constants.js`

**URL pattern:** `https://{storeDomain}/api/{apiVersion}/graphql.json` (note: `/api/` not `/admin/api/`)

**Auth headers:**
- Public token: `X-Shopify-Storefront-Access-Token: {publicAccessToken}`
- Private token: `Shopify-Storefront-Private-Token: {privateAccessToken}`

**Additional headers:**
```
X-SDK-Variant: storefront-api-client
X-SDK-Version: 1.0.9
Content-Type: application/json
Accept: application/json
```

**Current twin gap:** `twins/shopify/src/plugins/graphql.ts` line 93-144 proxies `/api/2024-01/graphql.json` to the Admin schema yoga instance, rewriting the URL. This means Storefront requests execute against the Admin schema — which includes admin-only mutations (`orderCreate`, `appSubscriptionCreate`, etc.) that the real Storefront API does not expose. The Storefront schema must be a **separate SDL** with only the subset of types that Storefront exposes: products, collections, cart, customers (read-only), checkout.

**X-Shopify-Storefront-Access-Token vs Shopify-Storefront-Private-Token:** The current twin validates against `validateAccessToken()` using `Shopify-Storefront-Private-Token` only. It does not handle `X-Shopify-Storefront-Access-Token` (the public token). Both must be accepted.

### `@slack/web-api@7.14.1` — Web API Requests

**Source:** `node_modules/@slack/web-api/dist/WebClient.js`, `dist/methods.js`

**Request encoding:**
- Default: `Content-Type: application/x-www-form-urlencoded` with `querystring.stringify()` body
- File uploads: `multipart/form-data` via `form-data` package
- All non-file API calls use form-urlencoded — the twin's `@fastify/formbody` plugin already handles this correctly

**Auth:** `Authorization: Bearer {token}` header. Token is never sent in body by default (the SDK strips it from body for `apps.event.authorizations.list` specifically, but all other methods use the header).

**`slackApiUrl`:** Defaults to `https://slack.com/api/`. All method calls are `POST` to `{slackApiUrl}{method}` (e.g., `POST /api/chat.postMessage`). The base URL is set at WebClient construction time via `new WebClient(token, { slackApiUrl: 'http://localhost:3001/' })`.

**Scope headers the twin must return:** After successful API calls, `WebClient.buildResult()` reads `x-oauth-scopes` and `x-accepted-oauth-scopes` from the response headers. These populate `response_metadata.scopes` and `response_metadata.acceptedScopes`. The twin should add `X-OAuth-Scopes: {token_scopes}` to successful responses for methods where scope checking matters.

**`admin.*` methods:** All 60+ `admin.*` methods call `apiCall('admin.{subgroup}.{action}', args)`, which POSTs to `/api/admin.{subgroup}.{action}`. The SDK requires HTTP 200 `{ok: true}` — a 404 causes a transport error, not an API error. All `admin.*` routes must exist and return `{ok: true, ...}`.

### `@slack/bolt@4.6.0` — Signing Verification

**Source:** `node_modules/@slack/bolt/dist/receivers/verify-request.js`

**Algorithm (from source, verbatim):**
```
baseString = "v0:" + requestTimestamp + ":" + rawBody
hmac = createHmac('sha256', signingSecret)
hmac.update(baseString)
ourSignatureHash = hmac.digest('hex')
signature = "v0=" + ourSignatureHash
```

**Headers the twin must send when delivering events:**
```
X-Slack-Signature: v0={hex_hmac}
X-Slack-Request-Timestamp: {unix_seconds}
```

**Timestamp tolerance:** 5 minutes (300 seconds). Events delivered by the twin must have a timestamp within 5 minutes of the recipient's clock.

**`signatureVerification: false`:** Tests can disable verification for unit tests. But conformance tests must exercise real verification. The twin must sign outgoing events.

**`tsscmp`:** Bolt uses `tsscmp` for timing-safe string comparison of the signature hash. This is a Bolt dependency — the twin does not need to install it.

### `@slack/bolt@4.6.0` — Interactivity

**Source:** `node_modules/@slack/bolt/dist/App.js` lines 632-637

**`response_url`:** Bolt builds a `respond` function from `body.response_url`. For block actions, `body.response_url` must be an **absolute URL** that accepts `POST {text: string}`. For view submissions with `response_url_enabled: true`, `body.response_urls[0].response_url` is used.

**Interactivity URL:** The real Slack delivers `block_actions`, `view_submission`, and `view_closed` payloads to the **Interactivity Request URL** (separate from the Events API URL). Bolt's `HTTPReceiver` handles both events and interactions at the same endpoint, but the real Slack uses two separate app configuration settings (Events Request URL vs Interactivity Request URL). The twin's current `/events` endpoint receives both — the fix is adding a dedicated `/api/interactions` endpoint (or `/slack/interactivity`) that the test harness can point Bolt's HTTPReceiver at.

### `@slack/oauth@3.0.4` — Installation Flow

**Source:** Tested via `tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` which already passes.

**No changes needed for v1.2.** The existing `GET /oauth/v2/authorize` → `POST /api/oauth.v2.access` flow is correct.

---

## API Version Routing — Implementation Pattern

**Problem:** The SDK initializes with the current API version (computed dynamically as `{year}-{quarter}`). In March 2026 this is `2026-01`. Hardcoded `2024-01` routes reject all SDK clients initialized without explicit version override.

**Solution:** Replace all version-specific Fastify routes with wildcard parameter routes.

```typescript
// BEFORE (in rest.ts and graphql.ts):
fastify.get('/admin/api/2024-01/products.json', handler);
fastify.route({ url: '/admin/api/2024-01/graphql.json', ... });

// AFTER:
fastify.get('/admin/api/:version/products.json', handler);
fastify.route({ url: '/admin/api/:version/graphql.json', ... });
// version param is available as req.params.version but typically ignored
// The twin implements one behavior regardless of version
```

**GraphQL Yoga with version parameter:** Yoga's `graphqlEndpoint` must also accept the wildcard. Since Yoga is registered as a route handler (not a middleware), the cleanest approach is to match the route in Fastify and pass through to the same Yoga instance:

```typescript
// Register one Yoga instance
const yoga = createYoga({ schema, graphqlEndpoint: '*' });

// Register Fastify route
fastify.route({
  url: '/admin/api/:version/graphql.json',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: async (req, reply) => {
    const response = await yoga.fetch(req.url, { method: req.method, headers, body });
    // ... forward response
  }
});
```

**Storefront URL pattern:** `/api/:version/graphql.json` — note no `/admin` prefix. Separate Fastify route, separate Yoga instance, separate schema.

---

## Slack Request Signing — Implementation Pattern

**Problem:** Bolt's `HTTPReceiver` and `AwsLambdaReceiver` call `verifySlackRequest()` on incoming events. Real Slack signs every HTTP delivery with `X-Slack-Signature` and `X-Slack-Request-Timestamp`. The twin's `EventDispatcher` does not currently add these headers to outgoing event deliveries.

**Solution:** Implement using `node:crypto` only — no new libraries needed.

```typescript
import { createHmac } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';

function signSlackPayload(body: string, signingSecret: string): {
  signature: string;
  timestamp: string;
} {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const hash = hmac.digest('hex');
  return {
    signature: `v0=${hash}`,
    timestamp,
  };
}
```

**Headers to add to all event deliveries:**
```
X-Slack-Signature: v0={hex_hmac}
X-Slack-Request-Timestamp: {unix_seconds}
Content-Type: application/json
```

**`signatureVerification: false` flag:** The existing SDK test suite passes `signatureVerification: false` to Bolt for tests that don't care about signatures. The new conformance tests for signing verification must use `signatureVerification: true` with a known `signingSecret` matching the twin's secret (default: `twin-signing-secret`).

---

## Shopify OAuth Cookie Signing — Implementation Pattern

**Problem:** `auth.callback()` reads a keygrip-style signed cookie. The twin's `/admin/oauth/authorize` endpoint must set cookies that `auth.callback()` can verify.

**SDK cookie signing algorithm** (from `dist/cjs/runtime/http/cookies.js` and underlying `keygrip`-compatible logic):

```typescript
import { createHmac } from 'node:crypto';

// Sign: "name=value" → base64url HMAC-SHA256
function signCookie(name: string, value: string, secret: string): string {
  const data = `${name}=${value}`;
  return createHmac('sha256', secret).update(data).digest('base64url');
}

// Set-Cookie headers the twin must return:
// shopify_app_state={nonce}; Path={callbackPath}; SameSite=Lax; Secure
// shopify_app_state.sig={base64url_hmac}; Path={callbackPath}; SameSite=Lax; Secure
```

**Cookie reading in callback:** The SDK reads the `Cookie` header, finds `shopify_app_state`, finds `shopify_app_state.sig`, verifies the HMAC, and uses the nonce value as the expected `state` parameter.

---

## Storefront Schema Design

**Problem:** The current Storefront route proxies to the Admin schema. Storefront API does not expose admin mutations. Tests querying Storefront-specific types (`Product.priceRange`, `ProductConnection`, cart operations) either fail (type not in admin schema) or succeed against incorrect types.

**Solution:** Create `twins/shopify/src/schema/storefront.graphql` with the Storefront-specific type subset.

**Storefront schema must include:**
- `ProductConnection`, `Product`, `ProductVariant`, `Image`, `MoneyV2`
- `CollectionConnection`, `Collection`
- `Cart`, `CartLine`, `CartBuyerIdentity`
- `Customer` (read-only fields only)
- `QueryRoot` with `products`, `collections`, `cart`, `product`, `node`
- No admin mutations (`orderCreate`, `appSubscriptionCreate`, etc.)

**Auth model difference:**
- Admin: `X-Shopify-Access-Token` (access token from OAuth)
- Storefront public: `X-Shopify-Storefront-Access-Token` (storefront access token)
- Storefront private: `Shopify-Storefront-Private-Token` (server-side only)

**Two Yoga instances, two routes:**
```
POST /admin/api/:version/graphql.json  →  Admin Yoga (Admin schema, X-Shopify-Access-Token)
POST /api/:version/graphql.json        →  Storefront Yoga (Storefront schema, X-Shopify-Storefront-Access-Token or Shopify-Storefront-Private-Token)
```

---

## Slack Scope Enforcement

**Problem:** All routes check token existence but not which scopes the token was granted. Real Slack returns `{ok: false, error: 'missing_scope'}` with `X-OAuth-Scopes` and `X-Accepted-OAuth-Scopes` headers when the token lacks required scope.

**Solution:** In-process scope check — no new library needed.

```typescript
// Token record already stores scopes as comma-separated string
// Example: 'chat:write,channels:read,channels:history,users:read'

function requireScope(tokenRecord: TokenRecord, required: string, reply: FastifyReply): boolean {
  const scopes = (tokenRecord.scopes ?? '').split(',').map(s => s.trim());
  if (!scopes.includes(required)) {
    reply.status(200).send({
      ok: false,
      error: 'missing_scope',
      needed: required,
      provided: tokenRecord.scopes ?? '',
    });
    return false;
  }
  return true;
}
```

**Response headers for scope info:**
```
X-OAuth-Scopes: {token.scopes}
X-Accepted-OAuth-Scopes: {required_scope}
```

WebClient's `buildResult()` reads these headers to populate `response_metadata.scopes` and `response_metadata.acceptedScopes`.

---

## Conformance Harness Overhaul

**Problem:** The existing `@dtu/conformance` runner in `twin` mode compares the twin against itself (runner.ts lines 91-95: `baselineResponse = twinResponse`). This always passes regardless of twin behavior. Coverage is hand-authored in fixture metadata, not derived from test execution.

**Solution:** Two additions to `@dtu/conformance` — no new npm packages needed.

### 1. Live Structural Comparison (already partially exists)

`compareResponsesStructurally()` in `comparator.ts` is already implemented for live mode. The gap is that `twin` mode short-circuits before calling it. The fix is enabling twin-vs-live mode from the test suite CLI without requiring the full live adapter setup.

**New execution mode:** `twin-vs-live` that runs both adapters and calls `compareResponsesStructurally()`. The existing `live` mode already does this — the CLI flags and docs need clarification.

### 2. Execution-Evidence Coverage Tracking

Currently coverage is declared in fixture metadata. New approach: record which operations actually executed in a test run.

```typescript
// Add to ConformanceRunner:
interface CoverageTracker {
  record(operationId: string, method: string, path: string): void;
  report(): CoverageReport;
}
```

Implementation uses `Map<string, {count: number, paths: string[]}>` — no external dependency. The tracker is populated inside the runner's test loop and written to a JSON file after each run.

---

## Slack Missing Methods Coverage (126 Methods)

**From source analysis of `@slack/web-api/dist/methods.js`:**

The existing `stubs.ts` covers: `files.*`, `search.*`, `reminders.*`, `bots.*`, `emoji.*`, `migration.*`, `tooling.*`, `dnd.*`, `bookmarks.*`, `usergroups.*`, `calls.*`, `team.*`, `dialog.*`, `functions.*`, `assistant.threads.*`, `auth.revoke`, `auth.teams.list`, `apps.connections.open`.

**Missing families that must be added as stubs** (all can use the existing `stub()` pattern):

| Family | Methods | Notes |
|--------|---------|-------|
| `admin.*` (~60+ methods) | All `admin.apps.*`, `admin.auth.*`, `admin.barriers.*`, `admin.conversations.*`, `admin.emoji.*`, `admin.roles.*`, `admin.teams.*`, `admin.usergroups.*`, `admin.users.*`, `admin.workflows.*` | Must stub all — returning 404 breaks WebClient |
| `workflows.*` | `workflows.stepCompleted`, `workflows.stepFailed`, `workflows.updateStep` | Deprecated but still bound; SDK source marks them deprecated |
| `canvases.*` | `canvases.access.delete`, `canvases.access.set`, `canvases.create`, `canvases.delete`, `canvases.edit`, `canvases.sections.lookup` | All can be stubs |
| `conversations.canvases.*` | `conversations.canvases.create` | Stub |
| `apps.event.authorizations.list` | 1 method | Stub; SDK strips token from body for this method specifically |
| `apps.manifest.*` | `apps.manifest.create`, `validate`, `export`, `update` | Stubs |
| `oauth.v2.exchange` | 1 method | Stub |

**Stub response shape convention:** `{ ok: true, response_metadata: { next_cursor: '' }, ...extraFields }` — identical to the existing `stub()` helper. All new admin stubs use `stub()` with an empty extra object unless the WebClient type declaration specifies required fields.

---

## Existing Dependencies — Version Changes

| Package | Current | v1.2 Change | Reason |
|---------|---------|-------------|--------|
| `vitest` | ^3.0.0 (root) | No change | test:sdk fix is config, not version |
| `@shopify/shopify-api` | 12.3.0 | No change | Already installed, covers all billing mutations |
| `@slack/web-api` | 7.14.1 | No change | All 275+ methods already bound via `apiCall` |
| All other deps | As pinned | No change | v1.2 is behavioral, not infrastructural |

---

## Version Compatibility — Confirmed Unchanged

All version compatibility from the v1.1 STACK.md remains valid. The new work adds no dependencies and changes no versions.

---

## test:sdk Fix — Config Only

**Problem:** `pnpm test:sdk` runs `vitest run --project sdk-verification`. The root `vitest.config.ts` uses `projects: ['packages/*', 'twins/*', 'tests/*']`, which discovers the project config at `tests/sdk-verification/vitest.config.ts`. This should work — but the `--project` flag filters by project `name`, and the config at `tests/sdk-verification/vitest.config.ts` sets `name: 'sdk-verification'`.

**Investigation needed during implementation:** Verify whether the project discovery path is correct and whether the `singleFork` pool option is compatible with the current Vitest 3.x version. The fix may be as simple as correcting the project `include` path or the `--project` filter value.

---

## Installation — What to Run for v1.2

```bash
# No new packages — nothing to install
# All dependencies already present from v1.1

# Verify no drift in installed versions
pnpm list @shopify/shopify-api @shopify/admin-api-client @slack/web-api @slack/bolt
```

---

## Alternatives Considered

| Approach | What Was Considered | Why Rejected |
|----------|--------------------|-|
| `keygrip` npm package for cookie signing | Would match Shopify SDK's internal cookie signer | Not needed — `node:crypto.createHmac` implements the same algorithm. Adding a dep for 4 lines of code is unjustified. |
| Separate OAuth cookie library | Express `cookie-parser`, `cookies` npm package | Not needed — the twin reads raw `Cookie` header string. |
| Schema federation for Storefront/Admin | `@graphql-tools/stitch` | Overkill. Two separate GraphQL Yoga instances on two routes is 20 lines of code and zero new packages. |
| API version database of valid versions | Returning 400 for unsupported versions | Wrong behavior. The SDK warns but proceeds. The twin must accept all version strings. |
| `tsscmp` for timing-safe comparison | Bolt uses it internally | The twin is the signer, not the verifier. The twin signs outgoing events — it does not need timing-safe comparison. |
| Adding `deep-diff` version bump | Current `^1.0.2` works correctly | No change needed. The structural comparison extension uses only existing comparator logic. |

---

## Sources

| Source | What Was Verified | Confidence |
|--------|-------------------|------------|
| `node_modules/@shopify/shopify-api/dist/cjs/lib/auth/oauth/oauth.js` | `begin()` sets signed `shopify_app_state` cookie; `callback()` reads and verifies it; POSTs to `/admin/oauth/access_token` with JSON body | HIGH |
| `node_modules/@shopify/shopify-api/dist/cjs/lib/utils/hmac-validator.js` | OAuth HMAC: strips `hmac`+`signature`, sorts by `localeCompare`, `URLSearchParams` encode, SHA256-HMAC hex format, 90-second timestamp tolerance | HIGH |
| `node_modules/@shopify/shopify-api/dist/cjs/lib/auth/oauth/types.js` | Cookie names: `shopify_app_state`, `shopify_app_session` | HIGH |
| `node_modules/@shopify/shopify-api/dist/cjs/lib/billing/check.js` | `billing.check()` queries `currentAppInstallation.activeSubscriptions` and paginates `oneTimePurchases` | HIGH |
| `node_modules/@shopify/shopify-api/dist/cjs/lib/billing/request.js` | `billing.request()` uses `appSubscriptionCreate` and `appPurchaseOneTimeCreate` mutations | HIGH |
| `node_modules/@shopify/admin-api-client/dist/graphql/client.js` | URL pattern `{store}/admin/api/{version}/graphql.json`; headers include `X-Shopify-Access-Token` | HIGH |
| `node_modules/@shopify/admin-api-client/dist/constants.js` | `ACCESS_TOKEN_HEADER = 'X-Shopify-Access-Token'`; `DEFAULT_CONTENT_TYPE = 'application/json'` | HIGH |
| `node_modules/@shopify/admin-api-client/dist/rest/client.js` | URL pattern, lossless-json parsing, numeric ID handling | HIGH |
| `node_modules/@shopify/shopify-api/dist/cjs/lib/clients/admin/rest/client.js` lines 194-238 | `parseJsonWithLosslessNumbers()` converts `id` and `*_id` fields to strings, non-ID numerics to JavaScript numbers | HIGH |
| `node_modules/.pnpm/@shopify+graphql-client@1.4.1/node_modules/@shopify/graphql-client/dist/api-client-utilities/api-versions.js` | `getCurrentSupportedApiVersions()` computes current quarter ±3 quarters + unstable; `2024-01` not in list for March 2026 | HIGH |
| `node_modules/.pnpm/@shopify+graphql-client@1.4.1/node_modules/@shopify/graphql-client/dist/api-client-utilities/validations.js` | `validateApiVersion()` calls `console.warn`, does NOT throw — client proceeds with request | HIGH |
| `node_modules/.pnpm/@shopify+storefront-api-client@1.0.9/node_modules/@shopify/storefront-api-client/dist/storefront-api-client.js` | URL pattern `/api/{version}/graphql.json`; auth headers `X-Shopify-Storefront-Access-Token` (public) and `Shopify-Storefront-Private-Token` (private) | HIGH |
| `node_modules/.pnpm/@shopify+storefront-api-client@1.0.9/node_modules/@shopify/storefront-api-client/dist/constants.js` | Header names `PUBLIC_ACCESS_TOKEN_HEADER`, `PRIVATE_ACCESS_TOKEN_HEADER`, `SDK_VARIANT_HEADER`, `SDK_VERSION_HEADER` | HIGH |
| `node_modules/@slack/web-api/dist/WebClient.js` lines 137-186 | `slackApiUrl` constructor param, `axios` POST, form-urlencoded by default, `Authorization: Bearer {token}` | HIGH |
| `node_modules/@slack/web-api/dist/WebClient.js` lines 695-700 | Reads `x-oauth-scopes` and `x-accepted-oauth-scopes` response headers into `response_metadata` | HIGH |
| `node_modules/@slack/web-api/dist/methods.js` lines 39-end | All `admin.*`, `workflows.*`, `canvases.*` methods bound via `bindApiCall(this, 'admin.x.y')` → POSTs to `/api/admin.x.y` | HIGH |
| `node_modules/@slack/bolt/dist/receivers/verify-request.js` | Full verification algorithm: `v0:{timestamp}:{body}`, HMAC-SHA256 hex, 5-minute tolerance, `tsscmp` for safe comparison | HIGH |
| `node_modules/@slack/bolt/dist/App.js` lines 632-637 | `respond` function built from `body.response_url`; must be absolute URL | HIGH |
| [Shopify API limits — shopify.dev](https://shopify.dev/docs/api/admin-graphql#rate_limits) | `maximumAvailable: 1000.0`, `restoreRate: 50.0` — current twin values are already correct | HIGH |
| `twins/shopify/src/services/rate-limiter.ts` | Current values `maxAvailable=1000`, `restoreRate=50` — already match Shopify docs | HIGH |
| `twins/shopify/src/plugins/graphql.ts` lines 56, 97, 149 | Hardcoded `2024-01` in three places: Yoga endpoint, Storefront route, Admin route | HIGH |
| `twins/shopify/src/plugins/oauth.ts` | Only has `POST /admin/oauth/access_token` — missing `GET /admin/oauth/authorize` with cookie setting | HIGH |
| `twins/shopify/src/schema/resolvers.ts` lines 312-320, 770-820 | `currentAppInstallation` hardcodes empty subscription list; billing mutations do not persist state | HIGH |
| `twins/slack/src/plugins/web-api/stubs.ts` | Missing all `admin.*`, `workflows.*`, `canvases.*` families | HIGH |
| `twins/slack/src/plugins/web-api/chat.ts` lines 250, 219-227 | `chat.delete` does direct SQL; `chat.update` does not check channel membership | HIGH |
| `twins/slack/src/plugins/events-api.ts` | No `X-Slack-Signature` or `X-Slack-Request-Timestamp` headers on event deliveries | HIGH |
| `packages/conformance/src/runner.ts` lines 91-95 | `twin` mode sets `baselineResponse = twinResponse` — always passes | HIGH |

---

*Stack research for: Sandpiper DTU v1.2 behavioral fidelity fixes*
*Researched: 2026-03-11*
