# Phase 22: Shopify Version Routing & Response Headers - Research

**Researched:** 2026-03-12
**Domain:** Shopify route version parameterization, response header fidelity, and pagination header transport
**Confidence:** HIGH

## Summary

Phase 22 is not a greenfield feature. The current codebase already proves the Shopify twin can answer
admin GraphQL, admin REST, and Storefront GraphQL requests, and the SDK verification helpers already
rewrite arbitrary Shopify domains into the local twin. The actual gap is narrower and more structural:
the twin itself still registers fixed `2024-01` routes, while the helpers and adapters hide that
limitation by rewriting every requested version back to `2024-01`.

Current runtime state:

- `twins/shopify/src/plugins/graphql.ts` registers only `/admin/api/2024-01/graphql.json` and
  `/api/2024-01/graphql.json`
- `twins/shopify/src/plugins/rest.ts` registers only `/admin/api/2024-01/...` REST endpoints
- pagination `Link` headers are already implemented for `GET /products.json?page_info=test`, but the
  returned URL is hardcoded to `2024-01`
- no central mechanism sets `X-Shopify-API-Version` on API responses

Current test-harness state:

- `tests/sdk-verification/helpers/shopify-client.ts` rewrites every admin request to
  `/admin/api/2024-01/`
- `tests/sdk-verification/helpers/shopify-rest-client.ts` does the same for REST
- `tests/sdk-verification/helpers/shopify-api-client.ts` rewrites both admin and Storefront requests
  to `2024-01`
- conformance adapters and several integration tests also hardcode `2024-01`

The clean phase boundary is therefore:

1. Make the twin accept `:version` path params for admin and Storefront API routes.
2. Echo the requested version via `X-Shopify-API-Version` on every API response path, including
   error and throttling responses.
3. Stop normalizing request URLs back to `2024-01` in the test helpers.
4. Update verification coverage so the real requested version, not a helper rewrite, is what makes
   `2025-01` and `2024-01` both pass.

**Primary recommendation:** Keep Yoga's internal endpoint fixed and add version-parameterized Fastify
wrapper routes around it, centralize version extraction/header emission in a small service, then
remove helper-side version rewrites and add assertions for version echo plus version-aware `Link`
headers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-17 | Shopify twin serves GraphQL and REST routes with parameterized API version (`:version` in URL path) accepting any valid Shopify API version string, not hardcoded to `2024-01`; unsupported/sunset versions return appropriate error responses; test helpers no longer rewrite request URLs to a single version | Runtime routes are fixed to `2024-01`; helper rewrites are the current workaround; wrapper-route approach removes the workaround without reworking schema/resolvers |
| SHOP-22 | Shopify twin returns `X-Shopify-API-Version` response header on all API responses, echoing the version from the request URL path | No shared header propagation exists today; best fit is a shared route/version utility plus explicit error-path coverage |
| SHOP-23 | Shopify REST list endpoints return `Link` header with `rel="next"` and `page_info` cursor parameter for paginated responses, matching real Shopify pagination format | Products REST route already emits a `Link` header for `page_info=test`, but it hardcodes the URL version and needs broader version-awareness |
</phase_requirements>

## Current Codebase Findings

### Runtime files that matter

- `twins/shopify/src/plugins/graphql.ts`
  Fixed admin path and fixed Storefront path; good candidate for dynamic Fastify wrappers that still
  forward into the same Yoga schema.
- `twins/shopify/src/plugins/rest.ts`
  All REST routes are fixed to `2024-01`; products pagination already exists and should be
  generalized to requested-version echo.
- `twins/shopify/src/schema/resolvers.ts`
  Contains a hardcoded webhook-delivery `X-Shopify-API-Version: 2024-01`. This is related transport
  metadata but not a response header. Treat as out of scope unless tests prove Phase 22 needs it.

### Harness files that matter

- `tests/sdk-verification/helpers/shopify-client.ts`
- `tests/sdk-verification/helpers/shopify-rest-client.ts`
- `tests/sdk-verification/helpers/shopify-api-client.ts`
- `twins/shopify/conformance/adapters/live-adapter.ts`
- `twins/shopify/conformance/adapters/twin-adapter.ts`
- `tests/integration/smoke.test.ts`
- `twins/shopify/test/integration.test.ts`
- `twins/shopify/test/integration/pagination.test.ts`

These files either still hardcode `2024-01` or currently prove behavior only through the rewrite
workaround.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | existing | Route matching, reply headers, pre-handlers | Current twin transport layer |
| GraphQL Yoga | existing | GraphQL execution for admin and Storefront requests | Already integrated; no schema-layer rewrite needed |
| `@shopify/shopify-api` | 12.3.0 | SDK surface under test | Existing verification target; already generates versioned admin and Storefront URLs |
| `@shopify/admin-api-client` | 1.1.1 | Low-level admin GraphQL/REST clients | Existing helper layer already exercises per-request versions |
| Vitest | 3.2.4 | SDK verification and integration test runner | Existing verification infrastructure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Fastify `app.inject()` | existing | In-process verification of versioned routes and headers | Twin integration tests and conformance adapter |
| `URL` / `URLSearchParams` | built-in | Safe `Link` header construction | Build version-aware next-page URLs |
| Fetch `Headers` API | built-in | Preserve and inspect response headers | SDK helpers, smoke tests, and conformance adapters |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real versioned routes in the twin | Keep rewriting helpers to `2024-01` | Fails the roadmap goal; later Shopify phases stay coupled to the workaround |
| Changing Yoga's configured endpoint to `:version` | Fixed internal endpoint plus wrapper routes | Wrapper routes are safer; Yoga only needs one canonical execution URL |
| Per-route `reply.header('X-Shopify-API-Version')` everywhere | Shared version utility + route wrapper | Shared utility avoids missing auth/error/429 branches |

**Installation:** No new packages are required.

## Architecture Patterns

### Pattern 1: Centralize request-version parsing and header emission

Create a small Shopify API version utility, for example:

`twins/shopify/src/services/api-version.ts`

Responsibilities:

- validate route params such as `2024-01`, `2025-01`, `2025-07`, and `unstable`
- expose the version string for downstream handlers
- set `X-Shopify-API-Version` consistently on replies
- generate version-aware admin and Storefront path helpers for `Link` headers and wrapper rewrites

Minimal validation can start with:

```ts
const SHOPIFY_API_VERSION_RE = /^(unstable|\\d{4}-\\d{2})$/;
```

This is enough for the phase goal because the SDK already decides what versions it generates. The
twin mainly needs to stop rejecting non-`2024-01` paths. If the implementation chooses to reject
obviously invalid versions, do it centrally in this utility.

### Pattern 2: Use Fastify wrapper routes around the existing Yoga endpoint

Do not re-architect the GraphQL schema or resolver layer for versioning. The schema is version-agnostic
for this phase; only transport is changing.

Recommended shape:

```ts
fastify.route({
  url: '/admin/api/:version/graphql.json',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: async (req, reply) => {
    const version = parseShopifyApiVersion(req.params.version);
    reply.header('X-Shopify-API-Version', version);

    const canonicalUrl = new URL(
      req.url.replace(`/admin/api/${version}/graphql.json`, '/admin/api/2024-01/graphql.json'),
      `http://${req.hostname}`
    );

    return yoga.fetch(canonicalUrl.toString(), ...);
  },
});
```

Why this is the right fit:

- the current Yoga instance already works
- the current schema/resolvers do not care about API version
- throttling, auth, and JSON body handling can stay in one place
- only the outer transport path and response headers need to vary

The Storefront route should use the same pattern for `/api/:version/graphql.json`.

### Pattern 3: Parameterize REST prefixes, not individual code paths

`twins/shopify/src/plugins/rest.ts` currently repeats `/admin/api/2024-01/...` on every route.
Use a shared prefix helper:

```ts
const adminPath = (suffix: string) => `/admin/api/:version${suffix}`;
```

Then every handler should:

1. parse `req.params.version`
2. set `reply.header('X-Shopify-API-Version', version)`
3. enforce the existing token behavior
4. build any pagination `Link` headers using the requested version

The products pagination route already proves the twin can surface `Link`. Phase 22 should keep that
behavior but replace:

```ts
<https://dev.myshopify.com/admin/api/2024-01/products.json?page_info=next123>; rel="next"
```

with a version-aware header based on the current request version.

### Pattern 4: Remove helper-side version normalization and keep only host rewriting

The SDK helpers should stop changing `/admin/api/{version}` and `/api/{version}/graphql.json`.
They only need to:

- rewrite `*.myshopify.com` to the local twin host
- preserve the caller's requested version unchanged

This is the actual trap Phase 22 is meant to remove. Once runtime routes are parameterized, the
helpers should become transport adapters, not behavior shims.

### Pattern 5: Verify with both old and new versions in the same phase

Do not only switch tests from `2024-01` to `2025-01`. The success criteria explicitly require both.
Best verification targets:

- `POST /admin/api/2024-01/graphql.json`
- `POST /admin/api/2025-01/graphql.json`
- `GET /admin/api/2024-01/products.json`
- `GET /admin/api/2025-01/products.json`
- response header assertions for `x-shopify-api-version`
- pagination `Link` header assertions that contain the same version used in the request

### Pattern 6: Conformance and smoke harnesses must stop embedding one admin version

The conformance adapters and smoke tests are not the core implementation, but they are the visible
harnesses that future phases inherit. They should use a shared default version constant or read a
version from configuration instead of embedding `2024-01`.

For this phase, the important change is not "support every possible live-store version". It is
"stop teaching the surrounding tooling that the twin only speaks one version."

## Anti-Patterns to Avoid

- Rewriting every incoming SDK request back to `2024-01` after adding dynamic routes. That would make
  the new transport logic untested.
- Modifying GraphQL resolvers to branch on API version. Phase 22 is a transport/header phase, not a
  schema divergence phase.
- Setting `X-Shopify-API-Version` only on success responses. 401 and 429 paths count as API responses.
- Hardcoding `2024-01` into pagination `Link` headers after the routes become dynamic.
- Expanding scope into webhook outbound headers unless verification proves it is necessary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GraphQL version routing | Separate Yoga instances per version | One Yoga instance with wrapper routes | Less surface area; phase only changes transport |
| Version detection | Regex checks scattered across handlers | Shared `api-version.ts` helper | Prevents drift and missing headers |
| Pagination URLs | String concatenation with embedded version literals | `URL`-based header construction from request version | Lower risk of malformed `Link` headers |
| SDK verification coverage | One-off fetch tests only | Existing SDK helper + Vitest suite pattern | Proves actual consumer surfaces, not just raw HTTP |

## Common Pitfalls

### Pitfall 1: Yoga endpoint mismatch
**What goes wrong:** Changing `graphqlEndpoint` to a param route breaks the current reuse pattern and
introduces routing bugs unrelated to the phase.
**How to avoid:** Leave Yoga canonical and add Fastify wrappers that rewrite the execution URL.

### Pitfall 2: Missing version headers on throttled or unauthorized responses
**What goes wrong:** Success responses echo the version, but 401 or 429 responses do not.
**How to avoid:** Set the header before auth/throttle branches, or centralize it in a helper invoked
at the top of every API handler.

### Pitfall 3: Helper rewrites still mask regressions
**What goes wrong:** Runtime routes become dynamic, but tests still normalize `2025-01` back to
`2024-01`, so the phase appears complete without actually exercising versioned routing.
**How to avoid:** Remove all `replace(/\\/admin\\/api\\/[^/]+\\//, '/admin/api/2024-01/')` style rewrites.

### Pitfall 4: Admin and Storefront drift apart
**What goes wrong:** `/admin/api/:version/graphql.json` is fixed, but `/api/:version/graphql.json`
stays hardcoded to `2024-01`.
**How to avoid:** Use the same version utility and wrapper strategy for both admin and Storefront
GraphQL paths.

### Pitfall 5: Pagination header still points at the wrong version
**What goes wrong:** `GET /admin/api/2025-01/products.json?page_info=test` returns a `Link` header
whose URL still contains `2024-01`.
**How to avoid:** Build the header from `req.params.version`, not from a constant.

### Pitfall 6: Scope creep into webhook metadata
**What goes wrong:** The phase tries to rewrite every `X-Shopify-API-Version` occurrence, including
webhook-delivery headers in `resolvers.ts`, and turns a routing/header transport fix into a wider
behavioral project.
**How to avoid:** Keep the plan scoped to request/response transport unless verification exposes a
real regression.

## Code Examples

### Current helper pattern that must be removed

```ts
const normalized = hostRewritten.replace(/\/admin\/api\/[^/]+\//, '/admin/api/2024-01/');
```

This exists in multiple helper files today. After runtime routing is fixed, host rewriting should
remain but version normalization should be deleted.

### Current pagination header that must become version-aware

```ts
reply.header(
  'Link',
  '<https://dev.myshopify.com/admin/api/2024-01/products.json?page_info=next123>; rel="next"'
);
```

This already proves the SDK parses the `Link` header. The phase only needs to build the same header
from the requested version.

## Validation Architecture

### Fast feedback loop

- Use targeted Shopify SDK verification tests for GraphQL, REST, and Storefront versioned routing.
- Use the existing in-process Shopify integration tests for transport/header behavior that the SDK
  helpers do not directly assert.
- Keep the conformance adapter verification lightweight in automation; live-store adapter validation
  stays manual because it requires real credentials.

### Recommended commands

- **Quick runtime + SDK sweep**
  `pnpm test:sdk -- tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts tests/sdk-verification/sdk/shopify-api-graphql-client.test.ts tests/sdk-verification/sdk/shopify-api-rest-client.test.ts tests/sdk-verification/sdk/shopify-api-storefront-client.test.ts`
- **Transport integration sweep**
  `pnpm test -- twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts tests/integration/smoke.test.ts`
- **Full phase confidence run**
  `pnpm test:sdk && pnpm test -- twins/shopify/test/integration.test.ts twins/shopify/test/integration/pagination.test.ts tests/integration/smoke.test.ts`

### Recommended verification targets

- GraphQL requests through both `2024-01` and `2025-01`
- REST products list through both `2024-01` and `2025-01`
- `x-shopify-api-version` response header assertions on success and non-success API responses
- `Link` header assertions that include `rel="next"` and a `page_info` cursor while preserving the
  request version
- no remaining helper or adapter rewrites that normalize all versions to `2024-01`

