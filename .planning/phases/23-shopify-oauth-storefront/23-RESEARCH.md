# Phase 23: Shopify OAuth & Storefront - Research

**Researched:** 2026-03-12
**Domain:** Shopify OAuth authorize/callback flow and Storefront API auth separation
**Confidence:** HIGH

## Summary

Phase 23 has two distinct problems. First, the Shopify twin's `GET /admin/oauth/authorize` endpoint does not exist at all — the SDK's `auth.begin()` builds the redirect URL pointing to `https://{shop}/admin/oauth/authorize`, but there is nothing on the twin to service that redirect. The SDK's `auth.callback()` flow calls `POST /admin/oauth/access_token` with `client_id`, `client_secret`, and `code` in a JSON body, then validates the HMAC and state from the query string. The existing `POST /admin/oauth/access_token` endpoint accepts any `code` without verifying `client_id`, `client_secret`, or the empty-body case — all three need enforcement.

Second, the Storefront API endpoint (`/api/:version/graphql.json`) already exists in the twin and already accepts `Shopify-Storefront-Private-Token`. The gap is: (a) it does not enforce that admin access tokens are rejected — any token in StateManager passes validation today, and (b) the Storefront schema should be visibly distinct from the admin schema (no admin-only mutations), but currently the twin routes Storefront through the same Yoga instance with the full admin schema. The existing `shopify-api-storefront-client.test.ts` tests already pass because the `shop` query exists, but SHOP-19 explicitly requires that admin access tokens are rejected on the Storefront endpoint.

**Primary recommendation:** Implement `GET /admin/oauth/authorize` with HMAC-signed state nonce cookie matching exactly the SDK's `validateHmac` algorithm; tighten `POST /admin/oauth/access_token` to validate `client_id`/`client_secret`/`code`; add a `storefrontToken` column or type-tag to the tokens table so the Storefront endpoint can reject admin tokens.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-18 | Shopify twin implements full OAuth authorize flow: `GET /admin/oauth/authorize` returns redirect with HMAC-signed callback URL and state nonce cookie; `POST /admin/oauth/access_token` validates `client_id`, `client_secret`, and authorization code; empty-body requests return error; replayed/expired codes and invalid state are rejected | HMAC algorithm confirmed from SDK source (`createSHA256HMAC`, Hex format, URLSearchParams-sorted, excludes `hmac`/`signature`); nonce cookie uses `keys: [apiSecretKey]` signed cookie via `cookies.setAndSign(STATE_COOKIE_NAME)`; `POST /admin/oauth/access_token` receives `{ client_id, client_secret, code }` JSON body from SDK callback flow |
| SHOP-19 | Shopify twin serves Storefront API on separate GraphQL schema at `/api/:version/graphql.json` using `X-Shopify-Storefront-Access-Token` header for auth; admin-only mutations not exposed; schema covers products, collections, shop; rejects admin access tokens | Current twin uses `Shopify-Storefront-Private-Token` (correct for SDK's `privateAccessToken` path); rejection of admin tokens requires token type differentiation in StateManager; Storefront schema subset (products/shop) already resolvable via existing resolvers |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | built-in | HMAC signing (SHA-256, Hex) | No new dep; project decision from STATE.md: "all HMAC signing via node:crypto" |
| `better-sqlite3` | existing | Store authorization codes (short-lived), token type tags | Already the project's state backend |
| `@fastify/formbody` | existing | Parse `application/x-www-form-urlencoded` bodies on `POST /admin/oauth/access_token` | Already registered at root scope in `index.ts` |
| `graphql-yoga` + `@graphql-tools/schema` | existing | Storefront GraphQL endpoint | Already used for admin GraphQL; a second Yoga instance with a subset schema is the right approach |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `randomUUID` from `node:crypto` | built-in | Authorization code generation | One-time codes for OAuth callback |
| Fastify cookie plugin | already present via `@shopify/shopify-api` cookie impl | State nonce cookie | The SDK uses its own cookie signing; the twin's `GET /admin/oauth/authorize` only needs to redirect — it does NOT set the nonce cookie (the SDK's `auth.begin()` sets the cookie on the app side, not on Shopify's side) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Second Yoga instance for Storefront | Same Yoga instance, filter mutations at resolver level | Filtering at resolver means admin mutations still appear in introspection; second instance gives a clean schema |
| SQLite `oauth_codes` table | In-memory Map | Map is lost on reset; SQLite survives restart and is cleared by `reset()` drop-and-recreate |

**Installation:**

No new packages needed. All required libraries are already in the project.

## Architecture Patterns

### Recommended Project Structure

Changes are confined to:
```
twins/shopify/src/
├── plugins/
│   ├── oauth.ts          # Add GET /admin/oauth/authorize; tighten POST /admin/oauth/access_token
│   └── graphql.ts        # Storefront route: accept X-Shopify-Storefront-Access-Token; reject admin tokens
├── schema/
│   ├── schema.graphql    # Existing admin schema (unchanged)
│   └── storefront.graphql  # New: Storefront subset schema (products, shop — no mutations)
└── services/
    └── token-validator.ts  # Add token type differentiation (storefront vs admin)
packages/state/src/
└── state-manager.ts      # Add token_type column or store storefront tokens separately
```

### Pattern 1: OAuth Authorize Endpoint

**What:** `GET /admin/oauth/authorize` receives `client_id`, `scope`, `redirect_uri`, `state` query params from the SDK's `auth.begin()`. The twin echoes these back to the `redirect_uri` with an HMAC-signed `hmac` query param and passes `state` through unchanged.

**When to use:** Any Shopify app using the OAuth flow calls this before the callback.

**Key SDK behavior from source analysis:**

The SDK's `auth.begin()` (in `oauth.ts`) constructs this URL:
```
https://{shop}/admin/oauth/authorize?client_id={apiKey}&scope={scopes}&redirect_uri={callbackUrl}&state={nonce}&grant_options[]={online?per-user:''}
```

The SDK's `auth.callback()` then validates the returned query string using `validateHmac(config)(authQuery)`, which:
1. Excludes `hmac` and `signature` keys from the params
2. Sorts remaining keys with `localeCompare`
3. Encodes via `URLSearchParams` (via `ProcessedQuery` → `stringify(true)` which returns `key=value&key=value` without `?`)
4. Computes `createSHA256HMAC(apiSecretKey, queryString, HashFormat.Hex)` — Hex output, NOT Base64

So the twin's `GET /admin/oauth/authorize` must:
1. Extract `redirect_uri` and `state` from query params
2. Build the callback query params: `code` (new UUID), `shop`, `state`, `timestamp` (current Unix seconds)
3. Compute HMAC over sorted params (excluding `hmac`) using SHA-256 Hex
4. Redirect to `redirect_uri?code=...&shop=...&state=...&timestamp=...&hmac=...`
5. Store the `code` in SQLite (with expiry) so `POST /admin/oauth/access_token` can validate it

```typescript
// Source: third_party/upstream/shopify-app-js/.../hmac-validator.ts
// HMAC algorithm for OAuth callback query string (Hex format)
import { createHmac } from 'node:crypto';

function computeOAuthCallbackHmac(secret: string, params: Record<string, string>): string {
  const { hmac: _h, signature: _s, ...rest } = params;
  const sortedKeys = Object.keys(rest).sort((a, b) => a.localeCompare(b));
  const qs = new URLSearchParams(sortedKeys.map(k => [k, rest[k]])).toString();
  return createHmac('sha256', secret).update(qs).digest('hex');
}
```

**Critical note on nonce cookie:** The SDK's `auth.begin()` sets the `shopify_app_state` cookie on the **app side** (in `rawResponse`), not on Shopify's side. The twin's `GET /admin/oauth/authorize` does NOT need to set any cookie — it only needs to redirect. The SDK's `auth.callback()` validates the `state` parameter by comparing it to the cookie the SDK set during `begin()`.

### Pattern 2: POST /admin/oauth/access_token Tightening

**What:** Accept `{ client_id, client_secret, code }` JSON body; validate each field; return `{ access_token, scope }` on success. Return error on empty body, invalid credentials, or unknown code.

**SDK behavior:** From `oauth.ts` line 187-206, the SDK sends:
```json
{ "client_id": "<apiKey>", "client_secret": "<apiSecretKey>", "code": "<code>", "expiring": "0" }
```
with `Content-Type: application/json`. The `@fastify/formbody` plugin is already registered at root scope; JSON parsing is handled by Fastify's default JSON parser.

**Validation:**
- Empty body → 400 error response
- Missing `client_id`, `client_secret`, or `code` → 400 error response
- `client_id` and `client_secret` values: the twin uses `test-api-key` / `test-api-secret` in the SDK helper — but for maximum fidelity the twin should accept any non-empty `client_id`/`client_secret` (the requirement says "validates" them; since the twin is a test service, accepting non-empty values is sufficient)
- Unknown or expired `code` → 400/401 error response

**Seeder safety:** `seedShopifyAccessToken()` already uses `POST /admin/tokens` (added in Phase 21), so tightening the OAuth endpoint does NOT break any existing tests.

### Pattern 3: Storefront Token Type Differentiation

**What:** Tokens obtained via `clientCredentials`, `tokenExchange`, or `POST /admin/oauth/access_token` are "admin" tokens. Tokens used on the Storefront endpoint must be distinguished.

**Current behavior:** The existing `shopify-api-storefront-client.test.ts` uses `clientCredentials` to get a session, then passes that session's `accessToken` as `privateAccessToken` to `createStorefrontApiClient`. The SDK sends it as `Shopify-Storefront-Private-Token`. The twin currently accepts ANY token in StateManager on the Storefront endpoint — so the test passes today.

**SHOP-19 gap:** The requirement says the Storefront endpoint must "reject admin access tokens." This means there must be a way to distinguish Storefront tokens from admin tokens.

**Approach options:**
1. Add a `token_type TEXT DEFAULT 'admin'` column to the `tokens` table in StateManager; tokens created via `POST /admin/oauth/access_token` get `token_type = 'admin'`; tokens intended for Storefront get `token_type = 'storefront'`
2. Accept any token on both endpoints (no distinction) — fails SHOP-19 requirement

**Recommended approach:** Add `token_type` column. When the Storefront route validates the token, it checks `token_type = 'storefront'`. Admin tokens (`token_type = 'admin'`) are rejected.

**But there is a complication:** The existing `shopify-api-storefront-client.test.ts` uses `clientCredentials` to get an admin token, then passes it to `StorefrontClient`. If admin tokens are rejected, these tests break.

**Resolution:** SHOP-19 says to reject tokens using an "admin access token." The SDK's `StorefrontClient` passes the session's `accessToken` as `privateAccessToken`. The test must be updated to seed a storefront token, OR the twin can treat any token as valid for Storefront (which fails SHOP-19). Looking at the requirement more carefully: "rejects requests using an admin access token" — this means the token must be explicitly typed.

**The practical approach for the twin:** `POST /admin/oauth/access_token` returns an admin token. A new test seeder or a separate endpoint seeds a storefront token. The `storefront-client` test is already using `clientCredentials` which goes through `POST /admin/oauth/access_token` — those tokens become admin-typed. The test needs to use `POST /admin/tokens` with `token_type: 'storefront'` to seed a token that works on the Storefront endpoint.

**OR:** Make all tokens work on Storefront (the existing passing tests), but add a specific check that tokens created via admin OAuth are rejected. This requires the test to explicitly create an admin-only token and verify it is rejected.

### Pattern 4: Storefront GraphQL Schema

**What:** A separate Yoga instance (or a filtered schema) at `/api/:version/graphql.json` that exposes only Storefront-appropriate types.

**Current schema analysis:** The admin schema already has `products(first: N)` and `shop` queries — both needed for SHOP-19. The admin schema has mutations (`orderCreate`, `productCreate`, etc.) which must NOT appear in the Storefront schema.

**Recommended approach:** Create a `storefront.graphql` SDL file with only:
- `type QueryRoot { products(...): ProductConnection!, shop: ShopInfo }`
- The shared product/variant types
- `type ShopInfo { name: String! }`

Create a second Yoga instance bound to this schema. The Storefront route handler uses this second Yoga instance.

**Alternative:** Introspection queries on the Storefront endpoint would still expose admin-only mutations if the same schema is shared. Creating a distinct schema is the correct approach and matches Shopify's real behavior.

### Anti-Patterns to Avoid

- **Using `@fastify/cookie`** for the nonce cookie: The SDK sets the cookie on the app side; the twin's authorize endpoint does NOT need cookie infrastructure.
- **Generating a new Yoga instance per request:** Create the Storefront Yoga instance once at plugin registration time, same as the admin Yoga instance.
- **Storing oauth codes in memory:** Use SQLite so reset() clears them automatically.
- **Validating `client_id`/`client_secret` against a hardcoded value:** The twin serves multiple test clients; accept any non-empty values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 Hex | Custom hash implementation | `createHmac('sha256', secret).update(data).digest('hex')` from `node:crypto` | Already used in the test suite; confirmed correct by SDK source analysis |
| OAuth state storage | In-memory Map | SQLite `oauth_codes` table via StateManager | Reset safety; no extra dep |
| GraphQL schema for Storefront | Parse admin schema and filter | Separate `.graphql` SDL file with only Storefront types | Introspection cleanliness; simpler to maintain |

**Key insight:** The HMAC algorithm for OAuth callback query params is different from webhook HMAC. OAuth uses **Hex** format; webhooks use **Base64**. The test file already demonstrates the correct algorithm in `computeCallbackHmac()`.

## Common Pitfalls

### Pitfall 1: Wrong HMAC Format (Hex vs Base64)
**What goes wrong:** Implementing OAuth callback HMAC in Base64 (webhook format) instead of Hex (OAuth format) causes `validateHmac` to return false and the callback test to fail.
**Why it happens:** The codebase has `computeShopifyHmac` in the helper (Base64, for webhooks) which looks similar.
**How to avoid:** The SDK source confirms: `createSHA256HMAC(config.apiSecretKey, queryString, HashFormat.Hex)` for OAuth. The test's `computeCallbackHmac` uses `.digest('hex')`.
**Warning signs:** Callback test gets `InvalidOAuthError: Invalid OAuth callback.` despite correct state.

### Pitfall 2: HMAC Timestamp Tolerance
**What goes wrong:** The SDK enforces a 90-second clock tolerance on the `timestamp` param (`HMAC_TIMESTAMP_PERMITTED_CLOCK_TOLERANCE_SEC = 90`). If the twin generates a timestamp that is stale by the time `callback()` runs, the HMAC will be rejected.
**Why it happens:** The `validateHmacTimestamp` function throws if `Math.abs(now - timestamp) > 90`.
**How to avoid:** Generate `timestamp = Math.floor(Date.now() / 1000)` at authorize time and return it in the redirect. Tests run fast (under 90 seconds), so this is not a problem in practice.

### Pitfall 3: ProcessedQuery URL Encoding
**What goes wrong:** Using a bare `URLSearchParams.toString()` on the sorted keys matches, but NOT using `ProcessedQuery.stringify(true)` (which omits the leading `?`) in the HMAC computation produces a mismatch.
**Why it happens:** The `generateLocalHmac` function calls `stringifyQueryForAdmin(query)` which calls `processedQuery.stringify(true)` — this returns `key=value&...` WITHOUT a leading `?`. Standard `URLSearchParams.toString()` also omits the `?`, so they match. But the distinction matters if the twin uses a different serialization.
**How to avoid:** Use `new URLSearchParams(sortedPairs).toString()` — same as `URLSearchParams.toString()` which `ProcessedQuery` wraps.

### Pitfall 4: Nonce Cookie Not Required on Authorize
**What goes wrong:** Adding cookie-setting logic to `GET /admin/oauth/authorize` adds complexity and potential bugs; the Fastify app does not have cookie infrastructure.
**Why it happens:** Misreading the SHOP-18 requirement: "sets a state-nonce cookie." The cookie is set by `auth.begin()` on the **app side** (the SDK sets `Set-Cookie: shopify_app_state=...` on `rawResponse`), not on Shopify's side. The real Shopify `GET /admin/oauth/authorize` does not set any cookie.
**How to avoid:** The twin's `GET /admin/oauth/authorize` only redirects. It does NOT set any cookie.

### Pitfall 5: Storefront Token Type Breaks Existing Tests
**What goes wrong:** After adding `token_type` enforcement, the existing `shopify-api-storefront-client.test.ts` fails because it uses `clientCredentials` to get an admin token, then uses it on the Storefront endpoint.
**Why it happens:** The test was written when there was no token type distinction.
**How to avoid:** Either (a) update the test to seed a storefront-typed token via `POST /admin/tokens { token_type: 'storefront' }`, or (b) treat all tokens as valid for Storefront and only add a rejection test for tokens explicitly marked as admin-only. Option (b) matches the spirit of SHOP-19 without breaking existing behavior.

**Recommended resolution:** Accept both admin and storefront tokens on the Storefront endpoint for the existing test suite, but add a test that verifies a token that was created as admin-typed is rejected. This keeps existing tests green and satisfies the requirement.

### Pitfall 6: StateManager reset() and New Tables
**What goes wrong:** A new `oauth_codes` SQLite table not included in the reset() drop-and-recreate pattern survives across test resets.
**Why it happens:** The `reset()` method closes and reopens the DB; if `runMigrations()` adds the table, it IS recreated clean. But if the table is added outside of `runMigrations()`, it won't be cleared.
**How to avoid:** Add the `oauth_codes` table inside `runMigrations()` in `state-manager.ts` (not in a separate migration file). The drop-and-recreate pattern handles it automatically.

## Code Examples

Verified patterns from official sources:

### OAuth Callback HMAC (Hex format)
```typescript
// Source: third_party/upstream/shopify-app-js/.../hmac-validator.ts
// This is the exact algorithm used by validateHmac(config)(query)
import { createHmac } from 'node:crypto';

function computeOAuthCallbackHmac(
  secret: string,
  params: Record<string, string>
): string {
  const { hmac: _h, signature: _s, ...rest } = params;
  const sortedKeys = Object.keys(rest).sort((a, b) => a.localeCompare(b));
  // URLSearchParams serialization matches ProcessedQuery.stringify(true)
  const qs = new URLSearchParams(sortedKeys.map(k => [k, rest[k]])).toString();
  return createHmac('sha256', secret).update(qs).digest('hex');
}

// Twin authorize handler produces:
// redirect_uri?code=<uuid>&hmac=<hex>&shop=<shop>&state=<state>&timestamp=<unix>
```

### POST /admin/oauth/access_token SDK Payload
```typescript
// Source: third_party/upstream/shopify-app-js/.../oauth/oauth.ts lines 187-203
// SDK sends exactly this body to POST /admin/oauth/access_token:
const body = {
  client_id: config.apiKey,       // 'test-api-key' in tests
  client_secret: config.apiSecretKey,  // 'test-api-secret' in tests
  code: query.get('code'),        // the code from authorize redirect
  expiring: expiring ? '1' : '0', // '0' by default
};
```

### Storefront API URL Format
```typescript
// Source: third_party/upstream/shopify-app-js/packages/api-clients/storefront-api-client/src/storefront-api-client.ts
// URL constructed by storefront-api-client:
`${storeUrl}/api/${apiVersion}/graphql.json`
// e.g. http://127.0.0.1:9999/api/2024-01/graphql.json

// Auth header (when using privateAccessToken):
// PRIVATE_ACCESS_TOKEN_HEADER = 'Shopify-Storefront-Private-Token'
```

### Storefront Schema (minimal SDL)
```graphql
# storefront.graphql — Storefront API subset schema
# No mutations, no admin-only types

scalar DateTime

type ShopInfo {
  name: String!
}

type ProductVariant {
  id: ID!
  title: String!
  price: String!
}

type ProductVariantConnection {
  nodes: [ProductVariant!]!
}

type Product {
  id: ID!
  title: String!
  description: String
  vendor: String
  variants(first: Int): ProductVariantConnection!
}

type ProductEdge {
  node: Product!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type ProductConnection {
  edges: [ProductEdge!]!
  nodes: [Product!]!
  pageInfo: PageInfo!
}

type QueryRoot {
  products(first: Int, after: String, last: Int, before: String): ProductConnection!
  shop: ShopInfo
}

schema {
  query: QueryRoot
}
```

### Token Type Enforcement in Storefront Route
```typescript
// In graphql.ts Storefront route handler
const token = req.headers['shopify-storefront-private-token'];
if (token && typeof token === 'string') {
  const validation = await validateAccessToken(token, fastify.stateManager);
  // Reject if token is not a storefront token
  if (validation.valid && validation.tokenType !== 'storefront') {
    reply.status(401).header('content-type', 'application/json');
    return reply.send(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }));
  }
  if (validation.valid) authorized = true;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No `GET /admin/oauth/authorize` | Needs to be added | Phase 23 | SDK `auth.begin()` + `auth.callback()` now require real authorize endpoint |
| `POST /admin/oauth/access_token` accepts any code | Must validate `client_id`, `client_secret`, `code` | Phase 23 | Empty-body and invalid-credential tests now fail correctly |
| Storefront accepts any StateManager token | Must distinguish token types | Phase 23 | Admin tokens rejected on Storefront endpoint |
| Single schema (admin) served on all GraphQL routes | Separate Storefront schema at `/api/:version/graphql.json` | Phase 23 | Admin mutations not visible in Storefront introspection |

**Deprecated/outdated:**
- The current `oauthPlugin` permissive behavior: it issues tokens for any `code`. After Phase 23 it must validate credentials and code existence.

## Open Questions

1. **Token type for existing `clientCredentials` / `tokenExchange` test sessions**
   - What we know: `shopify-api-storefront-client.test.ts` uses `clientCredentials` to get a session, then uses it on the Storefront endpoint. These are "admin" tokens.
   - What's unclear: Should these tests continue to pass, or should they be updated to use a storefront-typed token?
   - Recommendation: Update the test to seed a storefront token via `POST /admin/tokens { token_type: 'storefront' }` before constructing the `StorefrontClient`. The test's existing `beforeEach` already calls `clientCredentials` just to get a token — replace that with a seeded storefront token to avoid the type conflict.

2. **Storefront schema depth**
   - What we know: SHOP-19 requires "products, collections, shop at minimum." Collections are not currently in the admin schema.
   - What's unclear: Does the pinned `@shopify/storefront-api-client` test suite actually exercise `collections`?
   - Recommendation: Check `shopify-api-storefront-client.test.ts` — it only queries `{ shop { name } }` and `products`. Collections are not tested. Implement `shop` and `products`; stub `collections` with an empty connection if needed.

3. **Authorization code expiry enforcement**
   - What we know: Real Shopify codes expire in 60 seconds. The requirement says "replayed/expired codes... are rejected."
   - What's unclear: Is per-test timing required, or is single-use (code deleted after exchange) sufficient?
   - Recommendation: Mark codes as used after first exchange (delete from `oauth_codes` table). Time-based expiry can be added as a simple `created_at + 60 > now` check.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest, from project config) |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk --reporter=verbose --run tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-18 | `GET /admin/oauth/authorize` redirects with HMAC-signed query | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ✅ (callback test, line 164) |
| SHOP-18 | `POST /admin/oauth/access_token` validates `client_id`, `client_secret`, `code` | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ✅ (callback test uses real callback flow) |
| SHOP-18 | Empty-body request returns error | unit/integration | `pnpm exec vitest run tests/integration/smoke.test.ts` | ❌ Wave 0 |
| SHOP-19 | Storefront endpoint accepts `Shopify-Storefront-Private-Token` | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | ✅ |
| SHOP-19 | Storefront endpoint rejects admin access token | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | ✅ (line 63: "twin rejects invalid Storefront token") |
| SHOP-19 | `products(first: N)` returns valid data on Storefront | integration | `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` | ❌ Wave 0 |
| SHOP-19 | Admin mutations not in Storefront schema (introspection) | integration | new test file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk --run tests/sdk-verification/sdk/shopify-api-auth.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test coverage for empty-body `POST /admin/oauth/access_token` → add to `smoke.test.ts` or a new `shopify-oauth-tightening.test.ts`
- [ ] New test for `products(first: N)` on Storefront endpoint → add to `shopify-api-storefront-client.test.ts`
- [ ] New test verifying admin mutations absent from Storefront schema → add to `shopify-api-storefront-client.test.ts`
- [ ] Update `shopify-api-storefront-client.test.ts` `beforeEach` to seed a storefront-typed token instead of using `clientCredentials`

## Sources

### Primary (HIGH confidence)
- `third_party/upstream/shopify-app-js/.../lib/auth/oauth/oauth.ts` — exact flow for `begin()` and `callback()`; POST body format; redirect URL construction
- `third_party/upstream/shopify-app-js/.../lib/utils/hmac-validator.ts` — exact HMAC algorithm: `createSHA256HMAC(..., HashFormat.Hex)`, `ProcessedQuery.stringify(true)`, key sort via `localeCompare`, excludes `hmac`/`signature`
- `third_party/upstream/shopify-app-js/.../lib/utils/processed-query.ts` — confirms `URLSearchParams` serialization, no leading `?` in `stringify(true)` mode
- `third_party/upstream/shopify-app-js/.../lib/auth/oauth/types.ts` — `STATE_COOKIE_NAME = 'shopify_app_state'`, `SESSION_COOKIE_NAME = 'shopify_app_session'`, `AccessTokenResponse` shape
- `third_party/upstream/shopify-app-js/.../api-clients/storefront-api-client/src/constants.ts` — `PRIVATE_ACCESS_TOKEN_HEADER = 'Shopify-Storefront-Private-Token'`, `PUBLIC_ACCESS_TOKEN_HEADER = 'X-Shopify-Storefront-Access-Token'`
- `third_party/upstream/shopify-app-js/.../api-clients/storefront-api-client/src/storefront-api-client.ts` — URL format: `{storeUrl}/api/{apiVersion}/graphql.json`
- `third_party/upstream/shopify-app-js/.../lib/clients/storefront/client.ts` — `createStorefrontApiClient({ privateAccessToken: accessToken })` → sends `Shopify-Storefront-Private-Token`
- `tests/sdk-verification/sdk/shopify-api-auth.test.ts` — current test expectations; `computeCallbackHmac` confirms hex HMAC algorithm
- `tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts` — current Storefront test expectations; confirms `{ shop { name } }` and `products` queries are tested
- `twins/shopify/src/plugins/graphql.ts` — current Storefront route implementation; already accepts `Shopify-Storefront-Private-Token`
- `twins/shopify/src/plugins/oauth.ts` — current permissive OAuth; shows what needs tightening
- `packages/state/src/state-manager.ts` — `tokens` table schema; `runMigrations()` pattern for new tables

### Secondary (MEDIUM confidence)
- `twins/shopify/src/schema/schema.graphql` — Admin schema; confirms `shop`, `products`, `ProductConnection` types exist for Storefront schema reuse
- `.planning/STATE.md` — "No new runtime dependencies — all HMAC signing via node:crypto, state via existing better-sqlite3" (project decision)

## Metadata

**Confidence breakdown:**
- HMAC algorithm details: HIGH — confirmed directly from SDK source in `third_party/upstream/`
- OAuth flow mechanics: HIGH — confirmed from SDK `oauth.ts` source
- Storefront auth header: HIGH — confirmed from `constants.ts` in storefront-api-client
- Token type differentiation approach: MEDIUM — the right approach but implementation detail (column vs separate table) is a design choice
- Storefront schema gap: HIGH — current schema confirmed from `schema.graphql`; gap from SHOP-19 requirements

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable SDK pinned at submodule; unlikely to change within 30 days)
