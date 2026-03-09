# Phase 15: Shopify Admin Client Compatibility - Research

**Researched:** 2026-03-09
**Domain:** `@shopify/admin-api-client` GraphQL client and REST client — behavioral verification against the Shopify twin
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-08 | Developer can use `@shopify/admin-api-client` GraphQL client methods (`request`, `fetch`, `getHeaders`, `getApiUrl`) against the Shopify twin across pinned and per-request API versions | Confirmed: all four methods exist on the `AdminApiClient` interface. `request` and `fetch` hit `/admin/api/{version}/graphql.json`. `getHeaders` and `getApiUrl` are pure client-side accessors that require no twin route. The twin's GraphQL plugin already handles the `2024-01` version route. |
| SHOP-09 | Developer can use `@shopify/admin-api-client` generic REST client methods (`get`, `post`, `put`, `delete`) against the Shopify twin with supported headers, search params, payloads, and retry behavior | Confirmed: `createAdminRestApiClient()` exposes four HTTP-method functions. All route through `generateHttpFetch` with retry on 429/500/503. URL formatting adds `/admin/api/{version}/{path}.json` unless `formatPaths:false`. The twin currently has NO REST routes at these paths. Phase 15 must add them. |
</phase_requirements>

## Summary

Phase 15 verifies that `@shopify/admin-api-client@1.1.1` works end-to-end against the Shopify twin. The package exports two distinct clients: `createAdminApiClient` (GraphQL) and `createAdminRestApiClient` (generic REST). Phase 14 established that `createAdminApiClient` can execute a GraphQL query through `customFetchApi` URL rewriting, but that smoke test only covers `request` with a products query. Phase 15 must extend coverage to all four `AdminApiClient` methods (`request`, `fetch`, `getHeaders`, `getApiUrl`) including per-request API version overrides, and introduce `createAdminRestApiClient` coverage for all four HTTP verbs with header correctness, search-param encoding, JSON payload encoding, and retry-on-retriable-status behavior.

The GraphQL side requires expanding the existing `shopify-client-wire.test.ts` (or a sibling file) to exercise `fetch` directly (returns raw `Response` before JSON parsing), `getHeaders` (pure accessor, no HTTP needed), and `getApiUrl` (pure accessor that formats the versioned URL). Per-request version overrides call `getApiUrl('2024-01')` through `customFetchApi` which normalizes any version to what the twin actually serves — the existing rewrite already handles this. The REST side requires: (1) a new `createAdminRestApiClient` factory helper parallel to `createShopifyClient`, (2) twin-side REST route stubs under `/admin/api/2024-01/` that return valid JSON so the client's `response.ok` check passes, and (3) tests for GET/POST/PUT/DELETE with header assertions, search-param encoding, and simulated 429/503 retry scenarios.

The key constraint is that `createAdminRestApiClient` bypasses `customFetchApi` by default — it accepts `customFetchApi` as a constructor option but defaults to global `fetch`. The REST client also accepts a `scheme` option (`'https' | 'http'`) which, combined with `customFetchApi` rewriting, is the correct pattern for pointing it at the local twin. The twin's existing GraphQL endpoint already validates `X-Shopify-Access-Token` via `token-validator.ts`; REST routes must implement the same validation pattern.

**Primary recommendation:** Add a `createRestClient` helper to `tests/sdk-verification/helpers/shopify-rest-client.ts` that uses `customFetchApi` host rewriting (same as `shopify-client.ts`) plus `scheme: 'http'`, add a minimal REST plugin to the Shopify twin with GET/POST/PUT/DELETE routes under `/admin/api/2024-01/products.json` (and optionally `/admin/api/2024-01/orders.json`), and write tests in `tests/sdk-verification/sdk/shopify-admin-client.test.ts`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@shopify/admin-api-client` | 1.1.1 | GraphQL and REST low-level clients | Pinned in workspace root; the package under test |
| `@shopify/graphql-client` | (transitive) | Underlying GraphQL transport, retry, `generateHttpFetch` | Pulled by admin-api-client; `generateHttpFetch` provides retry-after semantics |
| Vitest | ^3.0.0 | Test runner | Already in use for `sdk-verification` project |
| node `http` | built-in | Inline webhook-receipt HTTP listener in tests (Phase 14 pattern) | Established pattern from hmac-signature.test.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | built-in | HMAC signature helpers (if needed) | Only if retry tests need signed webhook delivery; not needed for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `customFetchApi` host rewrite | `scheme: 'http'` alone | `scheme` only sets protocol prefix at URL construction time — the storeDomain is still `dev.myshopify.com` so DNS resolution fails. Must combine both. |
| Extending `shopify-client.ts` helper | Separate `shopify-rest-client.ts` helper | Separate file is cleaner; the REST client factory signature differs enough that mixing concerns in one file adds confusion |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure

```
tests/sdk-verification/
  helpers/
    shopify-client.ts            # EXISTING: createShopifyClient() (GraphQL)
    shopify-rest-client.ts       # NEW: createRestClient() (REST)
  sdk/
    shopify-client-wire.test.ts  # EXISTING: extend with fetch/getHeaders/getApiUrl
    shopify-admin-client.test.ts # NEW: REST client tests (SHOP-09)

twins/shopify/src/plugins/
  rest.ts                        # NEW: Fastify plugin with GET/POST/PUT/DELETE stubs
```

Note: The phase may produce 1 or 2 test files depending on how the planner chooses to split GraphQL and REST concerns. One file per requirement (`shopify-graphql-client.test.ts` + `shopify-rest-client.test.ts`) or a combined `shopify-admin-client.test.ts` are both acceptable.

### Pattern 1: GraphQL Client — `fetch` vs `request`

**What:** `client.fetch()` returns a raw `Response` (a `Promise<ResponseWithType<FetchResponseBody>>`). `client.request()` parses the JSON and returns `ClientResponse<T>` with `.data` / `.errors`. Both call the same underlying HTTP fetch via `customFetchApi`.

**When to use:** `fetch` when the test cares about raw response shape (content-type, status code). `request` when the test cares about parsed GraphQL data. For conformance, test both.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/graphql-client.ts
// fetch() returns the raw Response before JSON parsing
const response = await client.fetch('{ products(first: 1) { edges { node { id } } } }');
expect(response.status).toBe(200);
expect(response.headers.get('content-type')).toContain('application/json');

// request() returns parsed ClientResponse<T>
const result = await client.request('{ products(first: 1) { edges { node { id } } } }');
expect(result.data).toBeDefined();
expect(result.data.products).toBeDefined();
```

### Pattern 2: GraphQL Client — `getHeaders` and `getApiUrl`

**What:** Both are pure accessors that never make HTTP calls. `getHeaders(customHeaders?)` merges custom headers over the client's configured headers. `getApiUrl(apiVersion?)` returns the full versioned URL string.

**When to use:** Test these as pure function behaviors — no twin interaction required. Verify that per-request version override changes the URL segment, and that custom headers are merged correctly.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/api-client-utilities/utilities.ts
const client = createShopifyClient({ accessToken, apiVersion: '2025-07' });

// getHeaders merges custom headers UNDER the default ones
const headers = client.getHeaders({ 'X-Custom': 'value' });
expect(headers['X-Shopify-Access-Token']).toBe(accessToken);
expect(headers['X-Custom']).toBe('value');

// getApiUrl with no args returns the configured version
expect(client.getApiUrl()).toContain('2025-07');
// getApiUrl with version arg returns that version
expect(client.getApiUrl('2025-01')).toContain('2025-01');
```

**Caution:** `getHeaders` merges `customHeaders` first, then config headers on top (config wins for conflicting keys). Verified from source: `{...customHeaders ?? {}, ...config.headers}`. Tests must assert the correct merge direction.

### Pattern 3: Per-Request API Version Override (Twin Compatibility)

**What:** Both GraphQL and REST clients accept `apiVersion` per-request. The `customFetchApi` normalizes any version to `/admin/api/2024-01/` for the twin. This means per-request version tests always succeed as long as the version string is in the SDK's `getCurrentSupportedApiVersions()` list.

**When to use:** Tests should pass a different version than the client-level default to prove the per-request override path is exercised.

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/graphql/client.ts
const client = createShopifyClient({ accessToken, apiVersion: '2025-07' });
// Pass a different version per-request; customFetchApi normalizes it to 2024-01
const result = await client.request(
  '{ products(first: 1) { edges { node { id } } } }',
  { apiVersion: '2025-01' }
);
expect(result.data).toBeDefined();
```

### Pattern 4: REST Client — URL Construction and `formatPaths`

**What:** `createAdminRestApiClient` builds URLs as `{storeUrl}/admin/api/{version}/{path}.json`. With `formatPaths: true` (default), it prepends `admin/api/{version}/` if the path does not already start with `admin`, and appends `.json` if not already present.

**When to use:** Use the default `formatPaths: true`. Pass short paths like `products` or `products/123`.

**The constructed URL for the twin must be:**
`http://127.0.0.1:{port}/admin/api/2024-01/products.json`

The REST client uses `validateDomainAndGetStoreUrl` which always produces `https://`. The solution is:
- Pass `scheme: 'http'` option to force `http://` prefix
- Pass `customFetchApi` that rewrites the host (same host-rewriting pattern as the GraphQL helper)
- Both together ensure `http://127.0.0.1:{port}/admin/api/2024-01/products.json`

**Example:**
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/rest/client.ts
import { createAdminRestApiClient } from '@shopify/admin-api-client';

export function createRestClient(options: { accessToken: string; apiVersion?: string }) {
  const twinBaseUrl = process.env.SHOPIFY_API_URL!;
  const twinUrl = new URL(twinBaseUrl);

  const customFetchApi: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const hostRewritten = rawUrl.replace(
      /https?:\/\/dev\.myshopify\.com/,
      `${twinUrl.protocol}//${twinUrl.host}`
    );
    const normalized = hostRewritten.replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/');
    return fetch(normalized, init);
  };

  return createAdminRestApiClient({
    storeDomain: 'dev.myshopify.com',
    apiVersion: options.apiVersion ?? '2025-07',
    accessToken: options.accessToken,
    customFetchApi,
    scheme: 'http',       // overrides https:// prefix before customFetchApi rewrites host
    isTesting: true,
  });
}
```

### Pattern 5: REST Client — Retry Behavior Test

**What:** The REST client retries on HTTP 429, 500, and 503 (defined in `RETRIABLE_STATUS_CODES`). Retry count is passed per-call as `retries: N`. The `Retry-After` header (in seconds, as a float string) controls wait time.

**When to use:** Test retry semantics by having the twin return 429 once, then 200. Use the `errors` admin endpoint to inject a one-shot error for a specific REST route.

**Caution:** The default `DEFAULT_RETRY_WAIT_TIME` is 1000ms (1 second). In tests, this would make each retry slow. Options:
1. Pass a tiny `Retry-After` header value (e.g., `0.001` = 1ms) from the twin on the 429 response — the SDK's `http-fetch.ts` reads it as `parseInt(retryAfter, 10)` which would parse `0.001` as `0`ms
2. Use the errors plugin's one-shot injection and rely on the existing `defaultRetryTime` — acceptable for 1 retry
3. Keep retry tests to a single retry with `retries: 1` and a 429 response to minimize wait time

The safest approach for test speed: pass `Retry-After: 0` in the twin's 429 response. The REST client interprets `parseInt('0', 10)` as `0`ms delay.

### Pattern 6: REST Client — Search Params Encoding

**What:** The `searchParams` option is encoded as `URLSearchParams`. Arrays become `key[]=val1&key[]=val2`. Nested objects become `key[subkey]=val`. This matches the Shopify REST API convention.

**When to use:** Include at least one GET test with `searchParams: { limit: 1 }` to verify the query string is appended correctly.

**Example:**
```typescript
const response = await client.get('products', {
  searchParams: { limit: 1, fields: 'id,title' }
});
// URL: /admin/api/2024-01/products.json?limit=1&fields=id%2Ctitle
expect(response.ok).toBe(true);
```

### Pattern 7: Twin REST Plugin Design

**What:** The Shopify twin needs REST routes under `/admin/api/2024-01/` to accept the REST client's requests. These routes do NOT need full CRUD semantics — they need to return `200 OK` with a valid JSON body and validate the access token.

**Auth pattern:** Read `X-Shopify-Access-Token` header, validate via `validateAccessToken()` (same as the GraphQL plugin), return `401 {"errors": "Not Found"}` if invalid.

**Recommended routes (minimal, covers all four verbs):**
```
GET    /admin/api/2024-01/products.json          → { products: [...] }
POST   /admin/api/2024-01/products.json          → { product: {...} }
PUT    /admin/api/2024-01/products/:id.json      → { product: {...} }  (or /products.json)
DELETE /admin/api/2024-01/products/:id.json      → {} with 200
```

Note: Shopify REST paths typically end in `.json` — Fastify route patterns must include `.json` literally.

**Caution:** Fastify route patterns with `.json` extension need to be written as literal strings. Fastify does NOT strip file extensions from routes. The path `/admin/api/2024-01/products.json` is a valid Fastify route pattern and matches exactly.

### Anti-Patterns to Avoid

- **Using `scheme: 'http'` without `customFetchApi`:** `scheme` only sets the URL protocol at construction time. Without host rewriting in `customFetchApi`, the request goes to `http://dev.myshopify.com` which is not the twin. Always combine both.
- **Mocking `fetch` in SDK conformance tests:** Project pattern (INFRA-15) requires live HTTP transport. No `vi.mock('node-fetch')` or similar. The `customFetchApi` is the correct interception point.
- **Hardcoding access tokens:** Use `seedShopifyAccessToken()` from `setup/seeders.ts`. The token-validator in the twin checks the state manager — only tokens seeded via the OAuth endpoint pass validation.
- **Testing `getHeaders`/`getApiUrl` against the twin:** These are pure client-side accessors. Assert their return values directly without making HTTP calls.
- **Registering the REST plugin at a different prefix:** The REST client constructs URLs with `/admin/api/2024-01/` as the path prefix. Routes must match this exact path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL host-rewriting for twin | Custom proxy or middleware | `customFetchApi` option on both clients | Already established in `shopify-client.ts`; `customFetchApi` is the SDK's official test hook |
| JSON body serialization | Manual `JSON.stringify` in REST routes | Fastify's built-in JSON serialization | Fastify handles `reply.send(object)` automatically |
| Retry wait timing in tests | `setTimeout` wrappers or fake timers | `Retry-After: 0` header in twin 429 responses | Cleaner than fake timers; the SDK reads `Retry-After` before sleeping |
| Access token validation in REST plugin | Custom token lookup | Reuse `validateAccessToken()` from `../services/token-validator.js` | Already battle-tested in the GraphQL plugin |

**Key insight:** The SDK's `customFetchApi` and `scheme` options were designed exactly for test environments where you can't control DNS. Phase 14 already proved the GraphQL path. Phase 15 applies the same pattern to REST.

## Common Pitfalls

### Pitfall 1: `validateDomainAndGetStoreUrl` forces `https://` and ignores `scheme`
**What goes wrong:** `scheme: 'http'` is applied AFTER `validateDomainAndGetStoreUrl` strips and replaces the protocol. The code does: `validateDomainAndGetStoreUrl(...).replace('https://', `${scheme}://`)`. If the storeDomain is passed as `https://dev.myshopify.com`, the validation strips it to `https://dev.myshopify.com` and then the replace works. But if `customFetchApi` also rewrites the host, the `scheme` value is effectively redundant — both are needed for correctness but `customFetchApi` does the actual work.
**Why it happens:** The REST client source (`rest/client.ts` line 57) explicitly does the `scheme://` substitution.
**How to avoid:** Use both `scheme: 'http'` and host-rewriting in `customFetchApi`. This matches the GraphQL approach which also rewrites `https://dev.myshopify.com` to `http://127.0.0.1:PORT`.
**Warning signs:** Test hangs or gets `ECONNREFUSED` against `dev.myshopify.com` — means host rewrite is not happening.

### Pitfall 2: Fastify routes with `.json` extension
**What goes wrong:** Routes like `/admin/api/2024-01/products/:id.json` need careful handling. Fastify treats `:id.json` as a parameter that includes the `.json` suffix, meaning `params.id` would be `"123.json"` not `"123"`.
**Why it happens:** Fastify's router treats `.json` in a path segment as part of the parameter value when using `:param.json` syntax.
**How to avoid:** Use route pattern `/admin/api/2024-01/products/:idWithExt` and strip `.json` suffix in the handler, or register separate routes for the exact pattern needed. Alternatively, use a wildcard parameter and regex pattern. For Phase 15 (which just needs to verify HTTP method routing and auth), using fixed paths like `/admin/api/2024-01/products.json` for collection endpoints is simpler — PUT/DELETE of a specific resource can use `/admin/api/2024-01/products/:id.json` with `parseInt(params.id, 10)` (Fastify captures `"123.json"` so strip the suffix).
**Warning signs:** `404` when calling `client.put('products/123', ...)` even though the route is registered.

### Pitfall 3: `getHeaders` merge order is config-wins, not caller-wins
**What goes wrong:** A test asserts that passing `{ 'X-Shopify-Access-Token': 'custom' }` to `getHeaders()` returns a client with the custom token. It doesn't — the config headers overwrite custom headers for conflicting keys.
**Why it happens:** Source: `{...customHeaders ?? {}, ...config.headers}` — config spread is last, so it wins on conflict.
**How to avoid:** Tests for `getHeaders` should assert that non-conflicting custom headers are preserved, and that conflicting keys retain the config value. Only assert that `X-Custom-Header` is merged, not that `X-Shopify-Access-Token` can be overridden via `getHeaders`.
**Warning signs:** Test assertion fails on `X-Shopify-Access-Token` value being the client's token rather than the caller's.

### Pitfall 4: `retries` per-call vs client-level retries
**What goes wrong:** `client.get('/path', { retries: 2 })` overrides the client-level retries, but the retry logic uses `retries ?? clientRetries` (see REST client source line 125). If `retries: 0` is passed, it overrides but does NOT fall back to client default — it genuinely disables retries for that call.
**Why it happens:** `??` operator: `0 ?? clientRetries` evaluates to `0` since `0` is not nullish.
**How to avoid:** In retry tests, always pass an explicit positive `retries` value per-call. Do not rely on client-level retry defaults unless testing the default path explicitly.
**Warning signs:** Test expects a retry to happen but the request only fires once.

### Pitfall 5: Coverage report not updated after Phase 15
**What goes wrong:** The `coverage-report.json` has all `@shopify/admin-api-client` symbols except `createAdminApiClient` as `"deferred"`. After Phase 15, the newly-covered symbols must be updated to `"live"` with the correct `testFile` path.
**Why it happens:** The coverage report is not auto-updated — it requires a manual or scripted update.
**How to avoid:** Include a task in the plan to update `tests/sdk-verification/coverage/coverage-report.json` with correct `"live"` tier entries for all symbols exercised in the new test files.
**Warning signs:** CI drift check reports that all admin-api-client symbols are still deferred after Phase 15 plans execute.

## Code Examples

Verified patterns from official sources:

### createAdminApiClient — `fetch` (raw Response)
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/graphql-client.ts
// fetch() returns Promise<ResponseWithType<FetchResponseBody>> which is a typed Response
const response = await client.fetch('{ products(first: 1) { edges { node { id } } } }');
// response is a raw fetch Response
expect(response.status).toBe(200);
const body = await response.json();
expect(body.data.products).toBeDefined();
```

### createAdminApiClient — `getHeaders` behavior
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/api-client-utilities/utilities.ts
// Merge direction: {...customHeaders, ...config.headers} — config wins on conflict
const client = createShopifyClient({ accessToken: 'token-abc', apiVersion: '2025-07' });
const headers = client.getHeaders({ 'X-App-Context': 'test' });
// config headers present
expect(headers['X-Shopify-Access-Token']).toBe('token-abc');
expect(headers['Content-Type']).toBe('application/json');
// custom header merged in
expect(headers['X-App-Context']).toBe('test');
```

### createAdminApiClient — `getApiUrl` with per-request version
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/graphql/client.ts
const client = createShopifyClient({ accessToken, apiVersion: '2025-07' });
// No-arg: returns configured version URL
const defaultUrl = client.getApiUrl();
expect(defaultUrl).toContain('2025-07');
expect(defaultUrl).toContain('/admin/api/');
expect(defaultUrl).toContain('graphql.json');
// With version: returns override URL
const overrideUrl = client.getApiUrl('2025-01');
expect(overrideUrl).toContain('2025-01');
```

### createAdminRestApiClient — basic GET
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/rest/client.ts
// Path 'products' becomes /admin/api/2024-01/products.json
const client = createRestClient({ accessToken });
const response = await client.get('products', { searchParams: { limit: 1 } });
expect(response.ok).toBe(true);
const body = await response.json();
expect(body.products).toBeDefined();
```

### createAdminRestApiClient — POST with JSON body
```typescript
// body is JSON.stringify'd if not already a string
const response = await client.post('products', {
  data: { product: { title: 'Test Product' } }
});
expect(response.ok).toBe(true);
```

### createAdminRestApiClient — retry on 429
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/http-fetch.ts
// Twin must return Retry-After: 0 to avoid 1-second delay
// First call returns 429, second returns 200
const response = await client.get('products', { retries: 1 });
expect(response.ok).toBe(true);
// Two HTTP calls were made (fetchMock pattern from upstream tests)
```

### Twin REST plugin skeleton
```typescript
// twins/shopify/src/plugins/rest.ts
import type { FastifyPluginAsync } from 'fastify';
import { validateAccessToken } from '../services/token-validator.js';

const restPlugin: FastifyPluginAsync = async (fastify) => {
  // Auth helper for REST endpoints
  const requireToken = async (request: any, reply: any) => {
    const token = request.headers['x-shopify-access-token'] as string | undefined;
    if (!token) {
      reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
      return false;
    }
    const result = await validateAccessToken(token, fastify.stateManager);
    if (!result.valid) {
      reply.status(401).send({ errors: '[API] Invalid API key or access token.' });
      return false;
    }
    return true;
  };

  fastify.get('/admin/api/2024-01/products.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    return { products: fastify.stateManager.listProducts() };
  });

  fastify.post('/admin/api/2024-01/products.json', async (req, reply) => {
    if (!await requireToken(req, reply)) return;
    reply.status(201);
    return { product: {} };
  });

  fastify.put('/admin/api/2024-01/products/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    return { product: {} };
  });

  fastify.delete('/admin/api/2024-01/products/:id.json', async (req: any, reply) => {
    if (!await requireToken(req, reply)) return;
    reply.status(200);
    return {};
  });
};

export default restPlugin;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Only `createAdminApiClient` (GraphQL) tested | Both GraphQL and REST clients verified against twin | Phase 15 | Completes admin-api-client surface coverage |
| `shopify-client-wire.test.ts` smoke test for wire-up | Comprehensive method-level tests for all four interfaces | Phase 15 | Coverage report transitions from `deferred` to `live` for all admin-api-client symbols |
| No REST routes on Shopify twin | REST plugin with GET/POST/PUT/DELETE stubs | Phase 15 | Foundation for Phase 17 REST resource expansion |

**Deprecated/outdated:**
- `AdminApiClient` type exports (`AdminQueries`, `AdminMutations`, `AdminOperations`): TypeScript-only, no runtime behavior to test against the twin. Mark as `deferred` with note "type-only export" in coverage report.

## Open Questions

1. **Should the existing `shopify-client-wire.test.ts` be extended or replaced?**
   - What we know: It has 2 passing tests covering `request` basic path and URL rewrite confirmation. These should remain passing.
   - What's unclear: Whether the planner prefers in-place extension or a dedicated SHOP-08 test file.
   - Recommendation: Create a new `shopify-admin-graphql-client.test.ts` for SHOP-08 and leave `shopify-client-wire.test.ts` as-is (it covers INFRA-15). Avoids retroactively changing passing tests.

2. **How many REST resource paths does the twin plugin need?**
   - What we know: `createAdminRestApiClient` is generic — it doesn't care which resource the path points to. One resource (`products`) exercising all four HTTP verbs is sufficient for SHOP-09 behavioral conformance.
   - What's unclear: Whether future phases (17) want Phase 15 to lay a broader foundation.
   - Recommendation: Keep Phase 15 minimal — one resource, four verbs. Phase 17 expands REST resource coverage explicitly.

3. **Retry test implementation approach**
   - What we know: The `errors` admin plugin in the Shopify twin already supports one-shot error injection per operation.
   - What's unclear: Whether the errors plugin supports injecting errors for REST paths (it likely keys on GraphQL operation names, not HTTP paths).
   - Recommendation: For the retry test, add a dedicated twin endpoint (e.g., `GET /admin/api/2024-01/test-retry.json`) that tracks call count and returns 429 on the first call, 200 on subsequent calls. This is simpler than adapting the errors plugin.

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
| SHOP-08 | `request()` executes GraphQL query, returns `{ data }` | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-08 | `fetch()` returns raw `Response` with status 200 and JSON body | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-08 | `getHeaders()` merges custom headers, config headers win on conflict | client-side assertion | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-08 | `getApiUrl()` with no args returns configured version URL | client-side assertion | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-08 | `getApiUrl('2025-01')` returns URL with per-request version | client-side assertion | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-08 | `request()` with `apiVersion` override routes through `customFetchApi` to twin | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.get('products')` returns 200 with JSON body | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.post('products', { data: ... })` returns 201 | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.put('products/1', { data: ... })` returns 200 | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.delete('products/1')` returns 200 | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.get` with `searchParams` encodes query string correctly | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.get` with custom `headers` sends them to twin | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.get` with `retries: 1` retries on 429 and succeeds on second attempt | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |
| SHOP-09 | `client.get` without valid token returns auth error | live twin | `pnpm test:sdk --reporter=verbose` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk --reporter=verbose`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts` — covers SHOP-08 (GraphQL methods)
- [ ] `tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` — covers SHOP-09 (REST methods)
- [ ] `tests/sdk-verification/helpers/shopify-rest-client.ts` — `createRestClient()` factory
- [ ] `twins/shopify/src/plugins/rest.ts` — REST stub plugin with GET/POST/PUT/DELETE
- [ ] Register `restPlugin` in `twins/shopify/src/index.ts`

## Sources

### Primary (HIGH confidence)
- `third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/graphql/client.ts` — `createAdminApiClient` implementation, `getApiUrl` and `getHeaders` wiring
- `third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/rest/client.ts` — `createAdminRestApiClient` implementation, `scheme` option, URL formatter, retry wiring
- `third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/constants.ts` — `RETRIABLE_STATUS_CODES = [429, 500, 503]`, `DEFAULT_RETRY_WAIT_TIME = 1000`, `ACCESS_TOKEN_HEADER = 'X-Shopify-Access-Token'`
- `third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/graphql-client.ts` — `fetch` vs `request` distinction, `generateFetch`, `processJSONResponse`
- `third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/graphql-client/http-fetch.ts` — `Retry-After` header interpretation, `parseInt(retryAfter, 10)` behavior
- `third_party/upstream/shopify-app-js/packages/api-clients/graphql-client/src/api-client-utilities/utilities.ts` — `generateGetHeaders` merge direction (`{...customHeaders, ...config.headers}`)
- `third_party/upstream/shopify-app-js/packages/api-clients/admin-api-client/src/rest/tests/client.test.ts` — canonical upstream test patterns for REST client
- `tests/sdk-verification/helpers/shopify-client.ts` — existing `createShopifyClient` factory (Phase 14 pattern to replicate for REST)
- `twins/shopify/src/plugins/graphql.ts` — auth validation pattern via `validateAccessToken()`
- `tests/sdk-verification/coverage/coverage-report.json` — current coverage state, all admin-api-client symbols except `createAdminApiClient` are `deferred`

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — Phase 15 rationale, confirms GraphQL-first approach and REST stub minimalism

### Tertiary (LOW confidence)
- None identified for this phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions pinned and installed, no new dependencies needed
- Architecture: HIGH — REST client source read directly, URL construction logic verified line-by-line, existing `shopify-client.ts` pattern directly reusable
- Pitfalls: HIGH — sourced from direct source code inspection (merge direction, `parseInt` for Retry-After, Fastify `.json` route handling)

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (90 days — `@shopify/admin-api-client@1.1.1` is pinned; no upstream drift risk within this window)
