# Phase 17: Shopify Client Surfaces & Strategic REST Stubs - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Cover the `@shopify/shopify-api` client surfaces (`shopify.clients.Graphql`, `shopify.clients.Rest`, `shopify.clients.Storefront`, `shopify.utils.graphqlProxy`) against the Shopify twin. Strategically stub deprecated REST resource classes — track all 77 in manifest but only implement twin coverage for commonly-used resources. Reflects Shopify's April 2025 REST deprecation mandate.

Requirements: SHOP-14, SHOP-15

</domain>

<decisions>
## Implementation Decisions

### Client surfaces scope
- `GraphqlClient` wraps `@shopify/admin-api-client`'s `createAdminApiClient` — uses `abstractFetch` (same as Phase 16's `setAbstractFetchFunc` redirect). Tests verify constructor, `request()`, `query()` with variables, error handling (`GraphqlQueryError`), and API version override
- `RestClient` wraps HTTP methods (get/post/put/delete) using `abstractFetch` — similar to `@shopify/admin-api-client` REST client already tested in Phase 15. Tests verify session-based auth, path construction, pagination via `Link` header, retry on 429/5xx
- `StorefrontClient` uses `@shopify/storefront-api-client`'s `createStorefrontApiClient` — requires `privateAppStorefrontAccessToken` or session token. Twin needs a `/admin/api/{version}/graphql.json` Storefront-compatible endpoint (or reuse existing GraphQL endpoint with Storefront access token validation)
- `graphqlProxy` is a thin wrapper: validates session, creates `GraphqlClient`, proxies `rawBody` as query — test verifies proxy round-trip works with valid session and rejects unauthenticated sessions

### REST resource strategy
- 77 REST resource classes exist in `@shopify/shopify-api/rest/admin/2024-01/`
- **Tier 1 (implement):** Resources the twin already supports with state — Product, Customer, Order, Fulfillment, InventoryItem, InventoryLevel (~6 resources). These map to existing twin REST plugin routes
- **Tier 2 (stub):** Resources that apps commonly use but twin has no state for — Collection, Page, Blog, Article, Metafield, Webhook (subscription CRUD). Return valid shapes with hardcoded/minimal data
- **Tier 3 (manifest-only):** Remaining deprecated resources — tracked in coverage ledger as `deferred` with note about REST deprecation. No twin implementation needed
- REST resource classes use `RestClient` internally — they call `this.request()` which delegates to the underlying HTTP client

### Storefront API approach
- StorefrontClient uses a different access token type (`privateAppStorefrontAccessToken`) and hits the Storefront API endpoint
- Twin can reuse existing GraphQL plugin with a separate token validation path for Storefront tokens
- Minimal Storefront schema needed: just enough to verify the client surface works (a simple query like `shop { name }`)

### Coverage ledger update
- All 77 REST resources added to coverage report with tier attributions
- `GraphqlClient`, `RestClient`, `StorefrontClient`, `graphqlProxy` tracked as live symbols
- Final Phase 17 coverage closes all `@shopify/shopify-api` symbols — remaining are type exports (deferred)

### Claude's Discretion
- Exact REST resource tier assignments beyond the core 6
- Storefront API schema depth (minimal is fine — just enough for client surface verification)
- Whether to test REST resource class inheritance pattern or just HTTP-level behavior
- Test file organization (one file per client surface vs grouped)

</decisions>

<specifics>
## Specific Ideas

- GraphqlClient's `request()` delegates to `@shopify/admin-api-client` which Phase 15 already verified — Phase 17 tests should focus on the wrapper behavior (session validation, API version override, error wrapping as `GraphqlQueryError`)
- `graphqlProxy` is ~35 lines of code — a single test file with 3-4 tests (valid proxy, missing session, missing query, string vs object body) is sufficient
- REST resource tests should verify the class→HTTP→twin pipeline, not re-test HTTP semantics already covered in Phase 15

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/sdk-verification/helpers/shopify-api-client.ts`: `createShopifyApiClient()` factory — creates configured `shopifyApi()` instance with `setAbstractFetchFunc` twin redirect. All Phase 17 client surface tests should use this
- `tests/sdk-verification/helpers/shopify-client.ts`: Phase 15 helper for `@shopify/admin-api-client` — demonstrates `customFetchApi` pattern
- `tests/sdk-verification/helpers/shopify-rest-client.ts`: Phase 15 helper for `createAdminRestApiClient` — demonstrates REST client configuration

### Established Patterns
- `setAbstractFetchFunc` intercept pattern: redirects all `shopify-api` HTTP to twin (Phase 16)
- `customFetchApi` for lower-level `admin-api-client` (Phase 15)
- Module-level shopify instance for pure tests, `beforeAll`/`afterAll` with twin for live tests
- Version normalization: twin serves `2024-01` only, client-side rewrite in `customFetchApi`

### Integration Points
- `twins/shopify/src/plugins/graphql.ts`: Existing GraphQL endpoint — `GraphqlClient` and `graphqlProxy` will hit this
- `twins/shopify/src/plugins/rest.ts`: Existing REST endpoint — `RestClient` and REST resources will hit this
- `twins/shopify/src/plugins/oauth.ts`: Token validation — Storefront may need separate token type
- `twins/shopify/src/schema/schema.graphql`: May need Storefront-specific query if different from admin

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-shopify-rest-resource-client-expansion*
*Context gathered: 2026-03-09*
