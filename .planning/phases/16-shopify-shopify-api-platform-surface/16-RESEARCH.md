# Phase 16: Shopify `shopify-api` Platform Surface - Research

**Researched:** 2026-03-09
**Domain:** `@shopify/shopify-api` high-level platform helpers — auth, session, webhooks/flow/fulfillment-service validation, billing — tested against the Shopify twin
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-10 | Developer can use `@shopify/shopify-api` auth helpers (`begin`, `callback`, `tokenExchange`, `refreshToken`, `clientCredentials`, and embedded URL helpers) against the Shopify twin | `begin` and `callback` require adaptor pattern (node adapter) and live `POST /admin/oauth/authorize` + `POST /admin/oauth/access_token` twin routes. `tokenExchange`, `refreshToken`, `clientCredentials` all call `POST /admin/oauth/access_token` via `fetchRequestFactory` (uses `abstractFetch`). `getEmbeddedAppUrl`/`buildEmbeddedAppUrl` are pure functions needing no twin route. The twin's oauth plugin already handles the token exchange endpoint; no new routes needed for token-based flows. The `begin`/`callback` flow requires browser-like cookie/redirect handling — recommended as unit-tested with a mock adapter. |
| SHOP-11 | Developer can use `@shopify/shopify-api` session and utility helpers to create, decode, validate, and resolve Shopify session data for twin-backed requests | `decodeSessionToken` uses `jose` to verify HS256 JWTs signed with `apiSecretKey` — testable by minting test JWTs. `getJwtSessionId`, `getOfflineId`, `customAppSession` are pure functions. `getCurrentId` needs an HTTP adapter request. All session helper tests can be purely in-process with known-good JWTs minted via `jose.SignJWT`; no twin routes required. |
| SHOP-12 | Developer can use `@shopify/shopify-api` webhook, Flow, and fulfillment-service validation helpers with twin-generated requests and signatures | `webhooks.validate`, `flow.validate`, `fulfillmentService.validate` all call `validateHmacFromRequestFactory` — they validate HMAC-SHA256 base64 signatures computed as `HMAC(apiSecretKey, rawBody)`. Tests need: (a) a valid signed request constructed using `node:crypto` with the same `apiSecretKey`, (b) an invalid request with a bad HMAC. Webhook `validate` additionally checks five required Shopify headers. No twin routes are needed — these are pure signature-verification functions given an `adapterArgs` containing a mock request. |
| SHOP-13 | Developer can use `@shopify/shopify-api` billing helpers to request, inspect, cancel, and mutate billing state against the Shopify twin | `billing.request`, `billing.check`, `billing.cancel`, `billing.subscriptions`, `billing.createUsageRecord`, `billing.updateUsageCappedAmount` all execute GraphQL mutations/queries via `graphqlClientClass` → `GraphqlClient` → `abstractFetch`. Billing requires specific GraphQL resolvers (`appSubscriptionCreate`, `appPurchaseOneTimeCreate`, `currentAppInstallation`, `appSubscriptionCancel`, `appUsageRecordCreate`, `appSubscriptionLineItemUpdate`) on the Shopify twin. Lower priority — can be stubbed with minimal GraphQL resolvers returning hardcoded valid responses. |
</phase_requirements>

## Summary

Phase 16 verifies that `@shopify/shopify-api@12.3.0` high-level platform helpers work against the Shopify twin. Unlike Phase 15 which tested low-level HTTP clients (`admin-api-client`), Phase 16 tests the `shopifyApi` factory's returned namespaces: `auth`, `session`, `webhooks`, `flow`, `fulfillmentService`, and `billing`.

The core architectural difference from Phase 15 is that `shopifyApi` does NOT expose a `customFetchApi` option — its HTTP requests flow through `abstractFetch`, a module-level mutable function set by the adapter import (`@shopify/shopify-api/adapters/node`). To redirect `shopifyApi` HTTP calls to the local twin, the test helper must call `setAbstractFetchFunc(customFetch)` before creating the `shopifyApi` instance. This is the URL-redirection mechanism for this package.

The four requirement areas have very different test complexity profiles. SHOP-12 (webhook/flow/fulfillment validation) is the simplest — it requires only HMAC signature generation using `node:crypto` and no twin routes. SHOP-11 (session helpers) is nearly as simple — `decodeSessionToken` needs JWTs minted with `jose`, pure functions need no HTTP. SHOP-10 (auth) has two tiers: `tokenExchange`/`refreshToken`/`clientCredentials` are straightforward live-twin calls to the existing `POST /admin/oauth/access_token` endpoint, while `begin`/`callback` are complex because they involve HTTP redirect flows with cookie state — these are best tested with a mock adapter for correctness. SHOP-13 (billing) requires adding GraphQL resolvers to the twin's schema for billing mutations, making it lower priority but architecturally similar to the billing work already done in Phase 4.

**Primary recommendation:** Use `setAbstractFetchFunc` with a host-rewriting wrapper to redirect all `shopifyApi` HTTP traffic to the twin. Test SHOP-12 first (no twin calls) → SHOP-11 (JWT-only) → SHOP-10 token flows (live twin) → SHOP-10 begin/callback (mock adapter) → SHOP-13 (billing GraphQL stubs). Update coverage-report.json after each plan.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@shopify/shopify-api` | 12.3.0 | Platform helper package under test | Pinned in workspace root |
| `@shopify/shopify-api/adapters/node` | 12.3.0 | Sets `abstractFetch`, `abstractConvertRequest`, and other runtime functions | Required for the SDK to function in Node.js; side-effect import |
| `jose` | ^5.9.6 | JWT signing for test session tokens | Transitive dep of shopify-api; used directly in test helpers to mint valid HS256 JWTs |
| Vitest | ^3.0.0 | Test runner | Already installed; `sdk-verification` vitest config |
| `node:crypto` | built-in | HMAC generation for webhook/flow/fulfillment signature test data | Used to compute `HMAC-SHA256(apiSecretKey, rawBody)` in Base64 for valid test requests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@shopify/shopify-api/runtime/http` | (internal) | `setAbstractFetchFunc`, `abstractFetch` exports | Needed to override the fetch function for twin URL redirection |
| `node:http` | built-in | Mock request/response objects for adapter-based helpers | Needed for `begin`/`callback` and `getCurrentId` which expect real request objects |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setAbstractFetchFunc` override | Separate proxy process | `setAbstractFetchFunc` is the SDK's official test hook; a proxy adds unnecessary complexity |
| Live twin for `begin`/`callback` | Mock adapter for `begin`/`callback` | The `begin` flow redirects to `https://{shop}/admin/oauth/authorize` — a URL the twin does not serve. A mock adapter verifies the redirect URL construction without requiring a browser |
| Full billing GraphQL resolver | Stubbed billing resolver | Billing is lower priority (SHOP-13). A stub that returns a valid `appSubscriptionCreate` response shape is sufficient for Phase 16. Full billing fidelity is not required. |

**Installation:** No new packages. All dependencies already installed. `jose` is a transitive dep — it's importable from test files without adding to package.json.

## Architecture Patterns

### Recommended Project Structure

```
tests/sdk-verification/
  helpers/
    shopify-client.ts              EXISTING: createShopifyClient() (GraphQL only)
    shopify-api-client.ts          NEW: createShopifyApiClient() — shopifyApi factory with abstractFetch override
    shopify-api-request-adapter.ts NEW: mock NormalizedRequest/Response builder for adapter-based tests
  sdk/
    shopify-api-auth.test.ts       NEW: SHOP-10 — auth helpers
    shopify-api-session.test.ts    NEW: SHOP-11 — session helpers
    shopify-api-webhooks.test.ts   NEW: SHOP-12 — webhook/flow/fulfillment-service validate
    shopify-api-billing.test.ts    NEW: SHOP-13 — billing helpers (lower priority)

twins/shopify/src/plugins/
  graphql.ts                       EXISTING: add billing GraphQL resolvers (SHOP-13)
  oauth.ts                         EXISTING: already handles POST /admin/oauth/access_token
```

### Pattern 1: `shopifyApi` Factory with `setAbstractFetchFunc`

**What:** The `shopifyApi` package uses a module-level `abstractFetch` variable. Importing `@shopify/shopify-api/adapters/node` sets it to `globalThis.fetch`. Tests override it with a host-rewriting wrapper to redirect all SDK HTTP calls to the local twin.

**Critical:** `setAbstractFetchFunc` must be called BEFORE creating the `shopifyApi` instance. The call is global and lasts for the lifetime of the module in a single-fork Vitest run.

**Example:**
```typescript
// tests/sdk-verification/helpers/shopify-api-client.ts
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/runtime/http/index.ts
import '@shopify/shopify-api/adapters/node';
import { setAbstractFetchFunc } from '@shopify/shopify-api/runtime/http';
import { shopifyApi, ApiVersion, LogSeverity } from '@shopify/shopify-api';

export function createShopifyApiClient(options?: { accessToken?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!;
  const twinUrl = new URL(twinBaseUrl);

  // Override fetch to redirect all SDK HTTP to the twin
  setAbstractFetchFunc(async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    // Rewrite https://{any-shop}.myshopify.com → http://127.0.0.1:PORT
    const hostRewritten = rawUrl.replace(
      /https?:\/\/[^/]+\.myshopify\.com/,
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    // Normalize version to what the twin serves
    const normalized = hostRewritten.replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/');
    return fetch(normalized, init);
  });

  return shopifyApi({
    apiKey: 'test-api-key',
    apiSecretKey: 'test-api-secret',
    hostName: 'test-app.example.com',
    hostScheme: 'https',
    apiVersion: ApiVersion.January24,
    isEmbeddedApp: false,
    isTesting: true,
    logger: {
      level: LogSeverity.Error,
      httpRequests: false,
      timestamps: false,
    },
  });
}
```

### Pattern 2: Auth — Token Exchange, Refresh, Client Credentials (Live Twin)

**What:** `tokenExchange`, `refreshToken`, and `clientCredentials` all POST to `https://{shop}/admin/oauth/access_token`. With `abstractFetch` overridden, this routes to `POST /admin/oauth/access_token` on the twin. The twin's oauth plugin accepts any `code`, `refresh_token`, or `grant_type` and issues a token.

**Session `shop` domain:** The `shop` parameter must be a valid myshopify.com domain (validated by `sanitizeShop`). Use `dev.myshopify.com` consistently.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts
import { RequestedTokenType } from '@shopify/shopify-api';

// Must mint a valid JWT with apiSecretKey to pass decodeSessionToken() validation
import * as jose from 'jose';

const shopify = createShopifyApiClient();
const key = new TextEncoder().encode(shopify.config.apiSecretKey);
const sessionToken = await new jose.SignJWT({
  iss: 'https://dev.myshopify.com/admin',
  dest: 'https://dev.myshopify.com',
  aud: shopify.config.apiKey,
  sub: '1',
  exp: Math.floor(Date.now() / 1000) + 3600,
  nbf: Math.floor(Date.now() / 1000),
  iat: Math.floor(Date.now() / 1000),
  jti: 'test-jti-123',
  sid: 'test-sid-abc',
}).setProtectedHeader({ alg: 'HS256' }).sign(key);

const result = await shopify.auth.tokenExchange({
  shop: 'dev.myshopify.com',
  sessionToken,
  requestedTokenType: RequestedTokenType.OfflineAccessToken,
});
expect(result.session.accessToken).toBeDefined();
expect(result.session.shop).toBe('dev.myshopify.com');
```

### Pattern 3: Auth — `begin` and `callback` (Mock Adapter)

**What:** `begin` produces a redirect response to `https://{shop}/admin/oauth/authorize`. `callback` processes the redirect-back URL, validates HMAC and state cookie, then exchanges the `code` for a token at `POST /admin/oauth/access_token`. Both require the node adapter to convert request/response objects via `abstractConvertRequest`.

**Why mock adapter for `begin`:** The twin does not serve `GET /admin/oauth/authorize`. The correct test approach verifies that `begin` returns a redirect to the expected URL. Using a `NormalizedRequest` with the node adapter.

**Critical:** The node adapter is imported via `@shopify/shopify-api/adapters/node`. It registers `setAbstractConvertRequestFunc(nodeConvertRequest)` etc. For tests, the node adapter's request conversion expects an object matching the `NormalizedRequest` shape — specifically `{ url, method, headers }`.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/adapters/node/adapter.ts
// The node adapter expects rawRequest to be a NormalizedRequest-compatible object
// For begin, pass a fake IncomingMessage-like object
import { createServer } from 'node:http';

const shopify = createShopifyApiClient();
const response = await shopify.auth.begin({
  shop: 'dev.myshopify.com',
  callbackPath: '/auth/callback',
  isOnline: false,
  rawRequest: buildMockIncomingMessage({ url: '/auth?shop=dev.myshopify.com' }),
  rawResponse: buildMockServerResponse(),
});
// begin returns an AdapterResponse — the redirect is in response.headers.Location
// or the rawResponse ServerResponse has statusCode 302 and Location header
```

**Simpler alternative for `begin` test:** Use the built-in `@shopify/shopify-api/adapters/mock` adapter (used by upstream tests). It has `queueMockResponse` and `MockAdapterArgs`.

### Pattern 4: Session — `decodeSessionToken` (Pure)

**What:** Verifies a HS256 JWT signed with `apiSecretKey`. Testable by minting a valid JWT with `jose`. No HTTP calls.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/session/decode-session-token.ts
const shopify = createShopifyApiClient();
const key = new TextEncoder().encode('test-api-secret');
const token = await new jose.SignJWT({
  iss: 'https://dev.myshopify.com/admin',
  dest: 'https://dev.myshopify.com',
  aud: 'test-api-key',
  sub: '1',
  exp: Math.floor(Date.now() / 1000) + 3600,
  nbf: Math.floor(Date.now() / 1000) - 5,
  iat: Math.floor(Date.now() / 1000),
  jti: 'jwt-id-abc',
  sid: 'session-id-xyz',
}).setProtectedHeader({ alg: 'HS256' }).sign(key);

const payload = await shopify.session.decodeSessionToken(token);
expect(payload.dest).toBe('https://dev.myshopify.com');
expect(payload.aud).toBe('test-api-key');
```

### Pattern 5: Session — Pure Utility Functions

**What:** `getJwtSessionId`, `getOfflineId`, `customAppSession` are pure synchronous functions that produce deterministic output from inputs. No HTTP. No twin.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/session/session-utils.ts
const shopify = createShopifyApiClient();

// getOfflineId: 'offline_{shop}'
const offlineId = shopify.session.getOfflineId('dev.myshopify.com');
expect(offlineId).toBe('offline_dev.myshopify.com');

// getJwtSessionId: '{shop}_{userId}'
const jwtId = shopify.session.getJwtSessionId('dev.myshopify.com', '42');
expect(jwtId).toBe('dev.myshopify.com_42');

// customAppSession: Session with shop but no accessToken
const session = shopify.session.customAppSession('dev.myshopify.com');
expect(session.shop).toBe('dev.myshopify.com');
expect(session.isOnline).toBe(false);
```

### Pattern 6: Webhooks — `validate` with HMAC Signature

**What:** `shopify.webhooks.validate` verifies a webhook request by:
1. Computing `HMAC-SHA256(apiSecretKey, rawBody)` and base64-encoding
2. Comparing to the `X-Shopify-Hmac-Sha256` header
3. Checking five required headers: `X-Shopify-API-Version`, `X-Shopify-Shop-Domain`, `X-Shopify-Hmac-Sha256`, `X-Shopify-Topic`, `X-Shopify-Webhook-Id`

**Critical:** The HMAC uses `HashFormat.Base64` — the same as the `createSHA256HMAC` call in `hmac-validator.ts`. Test helpers must compute the HMAC identically:

```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/utils/hmac-validator.ts
import { createHmac } from 'node:crypto';

function computeWebhookHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}
```

**Test structure:** Build a mock NormalizedRequest with the correct headers, pass `rawBody` as a string, call `validate`. Assert `result.valid === true` for valid HMAC, `result.valid === false` for bad HMAC.

**No twin routes needed:** `validate` is entirely local signature computation.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/webhooks/validate.ts
const shopify = createShopifyApiClient();
const rawBody = JSON.stringify({ id: '1', title: 'Test Product' });
const hmac = computeWebhookHmac('test-api-secret', rawBody);

const result = await shopify.webhooks.validate({
  rawBody,
  rawRequest: buildMockWebhookRequest({
    'x-shopify-hmac-sha256': hmac,
    'x-shopify-topic': 'products/create',
    'x-shopify-api-version': '2024-01',
    'x-shopify-shop-domain': 'dev.myshopify.com',
    'x-shopify-webhook-id': 'abc-123',
  }),
});
expect(result.valid).toBe(true);
```

### Pattern 7: Flow and FulfillmentService — `validate`

**What:** `flow.validate` and `fulfillmentService.validate` use the same `validateHmacFromRequestFactory` as webhook validate, but with `HmacValidationType.Flow` and `HmacValidationType.FulfillmentService` respectively. The validation logic is identical — only the debug log message differs.

**Difference from webhooks.validate:** Flow and fulfillmentService do NOT check for Shopify-specific headers after HMAC validation. They return `{ valid: true }` on HMAC success or `{ valid: false, reason: '...' }` on failure.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/flow/validate.ts
const rawBody = JSON.stringify({ action: 'test-flow-action' });
const hmac = computeWebhookHmac('test-api-secret', rawBody);

const result = await shopify.flow.validate({
  rawBody,
  rawRequest: buildMockWebhookRequest({ 'x-shopify-hmac-sha256': hmac }),
});
expect(result.valid).toBe(true);
```

### Pattern 8: Billing — `request` and `check` (GraphQL via abstractFetch)

**What:** `billing.request` calls `appSubscriptionCreate` or `appPurchaseOneTimeCreate` GraphQL mutations via `GraphqlClient`, which uses `abstractFetch` (overridden to hit the twin). The twin's GraphQL plugin must handle these mutations.

**Required GraphQL resolvers on twin (stubbed):**
```graphql
type Mutation {
  appSubscriptionCreate(name: String!, returnUrl: URL!, ...): AppSubscriptionCreatePayload
  appPurchaseOneTimeCreate(name: String!, price: MoneyInput!, returnUrl: URL!, ...): AppPurchaseOneTimeCreatePayload
  appSubscriptionCancel(id: ID!): AppSubscriptionCancelPayload
}
type Query {
  currentAppInstallation: AppInstallation
}
```

**Billing requires a `Session` with `accessToken` and `shop`:** The `GraphqlClient` constructor uses `session.accessToken` as the bearer token. A session must be seeded first.

### Anti-Patterns to Avoid

- **Forgetting to import the node adapter before calling `shopifyApi`:** Without `import '@shopify/shopify-api/adapters/node'`, `abstractFetch` throws `"Missing adapter implementation"`.
- **Setting `abstractFetch` per-test without calling it in `beforeEach`:** Since `setAbstractFetchFunc` is global in a single-fork run, the override persists. Set it once in the helper factory. Do not rely on per-test overrides unless testing error paths.
- **Using `127.0.0.1` directly as the `shop` domain:** `sanitizeShop` validates that `shop` ends in `.myshopify.com`, `.shopify.com`, `.myshopify.io`, or `.shop.dev`. Use `dev.myshopify.com` as the shop domain — the `abstractFetch` override rewrites the host to `127.0.0.1:PORT` at request time.
- **Passing invalid `apiVersion` to `shopifyApi`:** `validateConfig` checks `apiVersion` is not empty. Use `ApiVersion.January24` (the version the twin serves), or let `abstractFetch` normalize the version.
- **Testing `begin`/`callback` with a live twin:** The full OAuth flow requires a browser-initiated redirect chain with cookie state. Use mock adapters for `begin`/`callback` to test the URL construction and HMAC validation logic without needing live endpoints.
- **Generating HMAC for webhook tests with `hex` format instead of `base64`:** The SDK's `validateHmacFromRequestFactory` calls `createSHA256HMAC(secret, data, HashFormat.Base64)`. HMAC must be base64-encoded to match.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT generation for session tests | Custom HMAC signing | `jose.SignJWT` with `setProtectedHeader({alg:'HS256'})` | shopify-api uses jose for JWT verification; using the same lib guarantees format match |
| HMAC computation for webhook tests | Custom base64 encoder | `node:crypto` `createHmac('sha256', secret).update(body).digest('base64')` | Direct use of Node.js crypto matches `HashFormat.Base64` exactly |
| URL redirection for shopifyApi | Proxy server or DNS override | `setAbstractFetchFunc` host-rewriting wrapper | The SDK's official extensibility point for test environments |
| Shop domain validation bypass | `customShopDomains` regex override | Use `dev.myshopify.com` as the shop domain | cleaner than regex override; `abstractFetch` handles the host rewrite transparently |
| Billing GraphQL resolvers (full) | Full billing state machine | Stub resolvers returning valid response shapes | SHOP-13 is lower priority; stubs satisfy the requirement while avoiding schema complexity |

**Key insight:** `shopifyApi` routes ALL HTTP through `abstractFetch`. There is no `customFetchApi` option at the `shopifyApi` level — you cannot configure it per-instance. The `setAbstractFetchFunc` approach is global but safe in a `singleFork` Vitest run.

## Common Pitfalls

### Pitfall 1: Node Adapter Must Be Imported As Side Effect
**What goes wrong:** `abstractFetch` (and `abstractConvertRequest`) throw "Missing adapter implementation" at runtime.
**Why it happens:** The `shopifyApi` factory does not auto-import the adapter. The node adapter must be imported explicitly as a side-effect — it calls `setAbstractFetchFunc(globalThis.fetch)` and other setters.
**How to avoid:** Put `import '@shopify/shopify-api/adapters/node';` at the top of the test helper file that calls `setAbstractFetchFunc`. This import must appear before any `shopifyApi(...)` call.
**Warning signs:** Error message contains "Missing adapter implementation for 'abstractFetch'" or "abstractConvertRequest".

### Pitfall 2: `setAbstractFetchFunc` Is Called After Node Adapter Import (Order Matters)
**What goes wrong:** After importing the node adapter, `abstractFetch` is set to `globalThis.fetch`. Calling `setAbstractFetchFunc(twinFetch)` after the adapter import correctly overrides it. But if the override is called AFTER `shopifyApi(...)` creates an instance, the instance is already constructed — however since `fetchRequestFactory` calls `abstractFetch` at call time (not construction time), the override still applies.
**Why it happens:** `fetchRequestFactory` looks up `abstractFetch` at each call. So `setAbstractFetchFunc` can be called any time before the first HTTP request.
**How to avoid:** Call `setAbstractFetchFunc(twinFetch)` in the helper factory function, before the `shopifyApi(...)` call, for clarity. Since it's global, once set it persists.
**Warning signs:** Requests going to `https://dev.myshopify.com` (DNS failure) rather than the local twin.

### Pitfall 3: `tokenExchange` Validates the JWT First
**What goes wrong:** `tokenExchange` calls `decodeSessionToken(config)(sessionToken)` before making the HTTP call to the twin. A session token with a non-matching `aud` (not equal to `config.apiKey`) throws `InvalidJwtError`.
**Why it happens:** Source: `token-exchange.ts` line 39 — `await decodeSessionToken(config)(sessionToken)`.
**How to avoid:** When minting test session tokens for `tokenExchange` tests, set `aud` to exactly `config.apiKey` (e.g., `'test-api-key'`). The `jose.SignJWT` payload must include `aud`, `iss`, `dest`, `sub`, `exp`, `nbf`, `iat`, `jti`, and `sid` fields.
**Warning signs:** Test throws `InvalidJwtError: Session token had invalid API key` before any network call is made.

### Pitfall 4: `decodeSessionToken` 10-Second Clock Tolerance
**What goes wrong:** A token with `exp` in the past (or too far in the future relative to `nbf`) fails JWT verification.
**Why it happens:** `jose.jwtVerify` has a `clockTolerance` of 10 seconds (`JWT_PERMITTED_CLOCK_TOLERANCE = 10`).
**How to avoid:** Always set `exp: Math.floor(Date.now() / 1000) + 3600`, `nbf: Math.floor(Date.now() / 1000) - 5`, and `iat: Math.floor(Date.now() / 1000)` when minting test tokens.
**Warning signs:** `JWTExpired` or `JWTNotYetValid` errors in tests.

### Pitfall 5: Webhook `validate` Checks Headers After HMAC
**What goes wrong:** HMAC is valid but `validate` returns `{ valid: false, reason: 'missing_headers' }`.
**Why it happens:** `checkWebhookHeaders` runs after HMAC validation and requires all five headers: `X-Shopify-API-Version`, `X-Shopify-Shop-Domain`, `X-Shopify-Hmac-Sha256`, `X-Shopify-Topic`, `X-Shopify-Webhook-Id`. Missing any one returns `{ valid: false }` with `missingHeaders` array.
**How to avoid:** Include ALL five headers in mock webhook requests. The `HANDLER_PROPERTIES` object in `validate.ts` defines exactly which headers are required.
**Warning signs:** Tests expecting `{ valid: true }` return `{ valid: false }` with no HMAC error.

### Pitfall 6: Flow/FulfillmentService `validate` Needs Request Adapter
**What goes wrong:** `flow.validate` and `fulfillmentService.validate` call `abstractConvertRequest(adapterArgs)` internally. Without the node adapter, this throws.
**Why it happens:** The `validateHmacFromRequestFactory` function requires an adapter-compatible request object.
**How to avoid:** Import the node adapter and pass a properly shaped `rawRequest` (Node.js `IncomingMessage`-compatible or a mock). Since tests don't need a real server response, a minimal mock object that satisfies the adapter's `rawRequest` extraction works.
**Warning signs:** "Missing adapter implementation for 'abstractConvertRequest'" error.

### Pitfall 7: Billing Requires a Session With `accessToken`
**What goes wrong:** `billing.request({ session, plan, ... })` throws "Missing access token when creating GraphQL client" if `session.accessToken` is undefined.
**Why it happens:** `GraphqlClient` constructor checks `!params.session.accessToken` when `!config.isCustomStoreApp`.
**How to avoid:** For billing tests, create a real session by calling `tokenExchange` or `clientCredentials` first to get a valid access token, then construct a `Session` object or use the returned session directly.
**Warning signs:** `MissingRequiredArgument: Missing access token when creating GraphQL client`.

### Pitfall 8: Twin OAuth Plugin Returns Access Token With Limited Scope
**What goes wrong:** Twin's `POST /admin/oauth/access_token` issues a token via `stateManager.createToken()`. If the token is consumed for GraphQL operations before billing tests run and the twin resets, the billing test fails because the token is no longer valid.
**Why it happens:** `resetShopify()` in `beforeEach` clears the token table.
**How to avoid:** Seed access tokens in each billing test's `beforeEach` block after `resetShopify()`. Use the session returned by `tokenExchange` or `clientCredentials` — the token it returns is live in the twin's state.
**Warning signs:** Billing GraphQL mutations return 401 authentication errors.

## Code Examples

Verified patterns from official sources:

### `setAbstractFetchFunc` — URL Redirection Core Pattern
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/runtime/http/index.ts
import '@shopify/shopify-api/adapters/node';
import { setAbstractFetchFunc } from '@shopify/shopify-api/runtime/http';

const twinUrl = new URL(process.env.SHOPIFY_API_URL!);

setAbstractFetchFunc(async (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input.toString();
  const rewritten = rawUrl
    // Rewrite any *.myshopify.com host to the twin
    .replace(/https?:\/\/[^/]+\.myshopify\.com/, `${twinUrl.protocol}//${twinUrl.host}`)
    // Normalize API version to what the twin serves
    .replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/');
  return fetch(rewritten, init);
});
```

### `shopifyApi` Factory
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/index.ts
import { shopifyApi, ApiVersion, LogSeverity } from '@shopify/shopify-api';

const shopify = shopifyApi({
  apiKey: 'test-api-key',
  apiSecretKey: 'test-api-secret',
  hostName: 'test-app.example.com',
  hostScheme: 'https',
  apiVersion: ApiVersion.January24,
  isEmbeddedApp: false,
  isTesting: true,
  logger: { level: LogSeverity.Error, httpRequests: false, timestamps: false },
});
```

### JWT Minting for `tokenExchange` / `decodeSessionToken`
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/__tests__/test-helper.ts
import * as jose from 'jose';

async function mintSessionToken(apiKey: string, apiSecretKey: string): Promise<string> {
  const key = new TextEncoder().encode(apiSecretKey);
  return new jose.SignJWT({
    iss: 'https://dev.myshopify.com/admin',
    dest: 'https://dev.myshopify.com',
    aud: apiKey,
    sub: '1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    nbf: Math.floor(Date.now() / 1000) - 5,
    iat: Math.floor(Date.now() / 1000),
    jti: `jti-${Date.now()}`,
    sid: `sid-${Date.now()}`,
  }).setProtectedHeader({ alg: 'HS256' }).sign(key);
}
```

### HMAC Computation for Webhook / Flow / FulfillmentService Validate
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/utils/hmac-validator.ts
// HashFormat.Base64 → digest('base64')
import { createHmac } from 'node:crypto';

function computeShopifyHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}
```

### Mock Request Builder for Adapter-Based Tests
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/adapters/node/adapter.ts
// nodeConvertRequest expects { method, url, headers } (IncomingMessage-compatible)
import type { IncomingMessage } from 'node:http';

function buildMockWebhookRequest(headers: Record<string, string>): IncomingMessage {
  return {
    method: 'POST',
    url: '/webhooks',
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
  } as unknown as IncomingMessage;
}
```

### `tokenExchange` — Full Example
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts
import { RequestedTokenType } from '@shopify/shopify-api';

const shopify = createShopifyApiClient();
const sessionToken = await mintSessionToken(shopify.config.apiKey, shopify.config.apiSecretKey);

// POST /admin/oauth/access_token → twin returns { access_token, scope }
const { session } = await shopify.auth.tokenExchange({
  shop: 'dev.myshopify.com',
  sessionToken,
  requestedTokenType: RequestedTokenType.OfflineAccessToken,
});

expect(session.shop).toBe('dev.myshopify.com');
expect(session.accessToken).toBeDefined();
expect(typeof session.accessToken).toBe('string');
```

### `webhooks.validate` — Valid and Invalid
```typescript
// Source: third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/webhooks/validate.ts
const shopify = createShopifyApiClient();
const rawBody = JSON.stringify({ id: 'gid://shopify/Product/1' });
const hmac = computeShopifyHmac(shopify.config.apiSecretKey, rawBody);

// Valid
const valid = await shopify.webhooks.validate({
  rawBody,
  rawRequest: buildMockWebhookRequest({
    'x-shopify-hmac-sha256': hmac,
    'x-shopify-topic': 'products/create',
    'x-shopify-api-version': '2024-01',
    'x-shopify-shop-domain': 'dev.myshopify.com',
    'x-shopify-webhook-id': 'wh-id-abc',
  }),
});
expect(valid.valid).toBe(true);

// Invalid HMAC
const invalid = await shopify.webhooks.validate({
  rawBody,
  rawRequest: buildMockWebhookRequest({
    'x-shopify-hmac-sha256': 'bad-hmac',
    'x-shopify-topic': 'products/create',
    'x-shopify-api-version': '2024-01',
    'x-shopify-shop-domain': 'dev.myshopify.com',
    'x-shopify-webhook-id': 'wh-id-abc',
  }),
});
expect(invalid.valid).toBe(false);
expect(invalid.reason).toBe('invalid_hmac');
```

### Billing — Stub GraphQL Resolver (Twin)
```typescript
// For SHOP-13: add to twins/shopify/src/plugins/graphql.ts schema/resolvers
// Minimal stub that satisfies billing.request() appSubscriptionCreate mutation:
appSubscriptionCreate: () => ({
  appSubscription: {
    id: 'gid://shopify/AppSubscription/1',
    name: 'Basic Plan',
    test: true,
    lineItems: [],
    currentPeriodEnd: null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    trialDays: 0,
    returnUrl: 'https://test-app.example.com',
  },
  confirmationUrl: 'https://dev.myshopify.com/admin/charges/1/confirm',
  userErrors: [],
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All `@shopify/shopify-api` symbols `deferred` | Auth, session, webhooks, flow, fulfillmentService symbols `live` | Phase 16 | Satisfies SHOP-10 through SHOP-12; SHOP-13 upgraded from deferred to stubbed |
| `customFetchApi` (Phase 15 pattern) | `setAbstractFetchFunc` (Phase 16 pattern) | Phase 16 | Different interception point — `shopifyApi` has no per-instance `customFetchApi` |
| No billing GraphQL resolvers on twin | Minimal billing stubs in twin's GraphQL schema | Phase 16 | Unlocks SHOP-13 baseline coverage |

**Deprecated/outdated:**
- `shopify.auth.nonce`: The `nonce` function is still exported but was part of the older OAuth flow. Not needed for token-exchange-based auth.
- `shopify.auth.safeCompare`: Timing-safe string comparison utility. Not a twin-testable behavior; test as pure function.
- `shopify.auth.migrateToExpiringToken`: Calls `POST /admin/oauth/access_token` like other token flows. Can be stub-tested since it's a variant of tokenExchange.

## Open Questions

1. **Can `begin`/`callback` be adequately tested without a real browser-driven redirect?**
   - What we know: `begin` produces a `302` redirect response. `callback` validates a cookie-signed `state` parameter. Both use the node adapter's request/response conversion.
   - What's unclear: Whether the twin should serve `GET /admin/oauth/authorize` to support the full flow, or whether unit tests using mock adapter arguments are acceptable for SHOP-10 conformance.
   - Recommendation: Test `begin` by asserting the redirect URL shape (`/admin/oauth/authorize?client_id=...&scope=...&state=...`). Test `callback` with a manually constructed request that has the correct HMAC and cookie. Do NOT block on full browser flow — pure adapter-level tests satisfy SHOP-10.

2. **Should the twin's oauth plugin be extended to support `refresh_token` and `client_credentials` grant types?**
   - What we know: The twin's `POST /admin/oauth/access_token` currently accepts any POST body and issues a token without validating `grant_type`. The SDK sends `grant_type: 'refresh_token'` or `'client_credentials'` in the body, which the twin ignores.
   - What's unclear: Whether a stricter twin that validates `grant_type` would break existing tests.
   - Recommendation: Keep the current lenient behavior — the twin accepting any grant type and returning a token is correct for testing SDK conformance without testing real OAuth semantics.

3. **How many billing GraphQL resolvers are needed for a reasonable SHOP-13 stub?**
   - What we know: `billing.request` needs `appSubscriptionCreate` or `appPurchaseOneTimeCreate`. `billing.check` needs `currentAppInstallation`. `billing.cancel` needs `appSubscriptionCancel`. `billing.createUsageRecord` needs `appUsageRecordCreate`. `billing.updateUsageCappedAmount` needs `appSubscriptionLineItemUpdate`.
   - What's unclear: Whether the twin's Yoga schema can accommodate these without conflicts.
   - Recommendation: Add the five billing mutations/queries as simple stubs returning minimal valid response shapes. Each returns `userErrors: []` and minimal required fields to prevent `BillingError` from being thrown.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk --reporter=verbose` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements — Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-10 | `auth.tokenExchange()` returns valid `Session` with `accessToken` and `shop` | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-10 | `auth.refreshToken()` returns valid `Session` from twin's access_token endpoint | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-10 | `auth.clientCredentials()` returns valid `Session` from twin's access_token endpoint | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-10 | `auth.begin()` returns redirect response with correct `Location` URL shape | mock adapter | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-10 | `auth.getEmbeddedAppUrl()` returns correct app URL from host parameter | pure function | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-10 | `auth.buildEmbeddedAppUrl()` returns correct app URL from encoded host | pure function | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-11 | `session.decodeSessionToken()` successfully decodes a valid HS256 JWT | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-11 | `session.decodeSessionToken()` throws `InvalidJwtError` for tampered token | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-11 | `session.getOfflineId()` returns `'offline_{shop}'` format | pure function | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-11 | `session.getJwtSessionId()` returns `'{shop}_{userId}'` format | pure function | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-11 | `session.customAppSession()` returns Session with correct shop and no accessToken | pure function | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `webhooks.validate()` returns `{ valid: true }` for HMAC-correct request with all required headers | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `webhooks.validate()` returns `{ valid: false, reason: 'invalid_hmac' }` for bad HMAC | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `webhooks.validate()` returns `{ valid: false }` when required headers missing | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `flow.validate()` returns `{ valid: true }` for HMAC-correct request | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `flow.validate()` returns `{ valid: false, reason: 'invalid_hmac' }` for bad HMAC | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `fulfillmentService.validate()` returns `{ valid: true }` for HMAC-correct request | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-12 | `fulfillmentService.validate()` returns `{ valid: false }` for bad HMAC | in-process | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-13 | `billing.request()` returns confirmationUrl for subscription plan | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-13 | `billing.check()` returns `hasActivePayment: false` on empty twin state | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-13 | `billing.cancel()` returns cancelled subscription | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk --reporter=verbose`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/helpers/shopify-api-client.ts` — `createShopifyApiClient()` factory with `setAbstractFetchFunc`
- [ ] `tests/sdk-verification/sdk/shopify-api-auth.test.ts` — covers SHOP-10 (tokenExchange, refreshToken, clientCredentials, begin, embedded URL)
- [ ] `tests/sdk-verification/sdk/shopify-api-session.test.ts` — covers SHOP-11 (decodeSessionToken, getOfflineId, getJwtSessionId, customAppSession)
- [ ] `tests/sdk-verification/sdk/shopify-api-webhooks.test.ts` — covers SHOP-12 (webhooks.validate, flow.validate, fulfillmentService.validate)
- [ ] `tests/sdk-verification/sdk/shopify-api-billing.test.ts` — covers SHOP-13 (billing.request, billing.check, billing.cancel) — lower priority
- [ ] Billing GraphQL stubs in `twins/shopify/src/plugins/graphql.ts` — `appSubscriptionCreate`, `appPurchaseOneTimeCreate`, `currentAppInstallation`, `appSubscriptionCancel` resolvers

## Sources

### Primary (HIGH confidence)
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/index.ts` — `shopifyApi` factory, full surface map (auth, session, webhooks, billing, flow, fulfillmentService)
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/index.ts` — `ShopifyAuth` interface, all auth function wiring
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/oauth.ts` — `begin`, `callback` implementation, cookie pattern
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts` — `tokenExchange` implementation, decodeSessionToken pre-check
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/refresh-token.ts` — `refreshToken` — identical pattern to tokenExchange
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/client-credentials.ts` — `clientCredentials` — identical pattern
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/get-embedded-app-url.ts` — `getEmbeddedAppUrl`, `buildEmbeddedAppUrl` — pure functions
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/session/index.ts` — `ShopifySession` surface
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/session/decode-session-token.ts` — `jose.jwtVerify` with HS256, 10s clock tolerance
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/session/session-utils.ts` — pure session ID functions
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/session/session.ts` — `Session` class, `fromPropertyArray`, `toPropertyArray`
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/webhooks/index.ts` — `ShopifyWebhooks` surface
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/webhooks/validate.ts` — HMAC+header validation, `HANDLER_PROPERTIES` required headers
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/flow/validate.ts` — `HmacValidationType.Flow`
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/fulfillment-service/validate.ts` — `HmacValidationType.FulfillmentService`
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/utils/hmac-validator.ts` — `validateHmacFromRequestFactory`, `HashFormat.Base64`, HMAC computation
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/billing/index.ts` — billing surface (check, request, cancel, subscriptions, createUsageRecord, updateUsageCappedAmount)
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/billing/request.ts` — `appSubscriptionCreate` / `appPurchaseOneTimeCreate` mutations
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/billing/check.ts` — `currentAppInstallation` query
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/clients/admin/graphql/client.ts` — `GraphqlClient` uses `abstractFetch` via `createAdminApiClient`
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/runtime/http/index.ts` — `setAbstractFetchFunc`, `abstractFetch`
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/adapters/node/index.ts` — side-effect import pattern
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/utils/shop-validator.ts` — `sanitizeShop` domain validation
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/utils/fetch-request.ts` — `fetchRequestFactory` uses `abstractFetch` at call time
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/config.ts` — `validateConfig`, mandatory fields
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/base-types.ts` — `ConfigParams`, `isTesting` field
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/__tests__/test-config.ts` — upstream test config pattern (reference only)
- `tests/sdk-verification/helpers/shopify-client.ts` — existing Phase 15 URL-rewrite pattern (to replicate for abstractFetch)
- `tests/sdk-verification/setup/seeders.ts` — `resetShopify`, `seedShopifyAccessToken` helpers
- `tests/sdk-verification/coverage/coverage-report.json` — all `@shopify/shopify-api@12.3.0` symbols currently `deferred`

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 15 execution notes confirming twin oauth plugin behavior
- `.planning/REQUIREMENTS.md` — SHOP-10 through SHOP-13 scoped requirements

### Tertiary (LOW confidence)
- None identified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — package version pinned (12.3.0), all dependencies installed, adapter import pattern read from source
- Architecture: HIGH — `abstractFetch`/`setAbstractFetchFunc` mechanism verified from source; all auth/session/webhook flows read directly; URL construction path traced end-to-end
- Pitfalls: HIGH — JWT clock tolerance, required webhook headers, `tokenExchange` pre-validation, node adapter side-effect import all sourced directly from implementation files

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (90 days — `@shopify/shopify-api@12.3.0` is pinned; no upstream drift risk within this window)
