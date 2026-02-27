# Phase 2: Shopify Twin - Core Operations - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Shopify twin that handles OAuth token exchange and core GraphQL Admin API operations (orders, products, customers, inventory, fulfillments) with stateful behavior. Includes webhook delivery on state mutations, error simulation for testing, and admin API for test control. This phase covers SHOP-01, SHOP-02, SHOP-03, SHOP-07, INFRA-03, and INFRA-04.

Out of scope: Rate limiting by query cost (Phase 4 - SHOP-04), cursor-based pagination (Phase 4 - SHOP-05), stateful order lifecycle (Phase 4 - SHOP-06).

</domain>

<decisions>
## Implementation Decisions

### GraphQL schema scope
- Support only the Shopify Admin API resources Sandpiper actually uses -- orders, products, customers, inventory, fulfillments
- Use GraphQL Yoga as the server (per research stack decision)
- Schema should match Shopify's actual GraphQL schema shape (field names, types, nullability) but only for the subset we implement
- Return realistic GraphQL error responses for unsupported queries/mutations (error with "field not found" style messages)
- IDs should use Shopify's GID format: `gid://shopify/Order/12345`

### OAuth flow fidelity
- Implement simplified but structurally correct OAuth token exchange (authorization code -> access token)
- Twin issues access tokens that are validated on every GraphQL request via X-Shopify-Access-Token header
- No real redirect-based browser flow needed -- twin accepts authorization codes and returns tokens via API
- Tokens stored in StateManager, cleared on reset
- Invalid/expired tokens return 401 with Shopify-realistic error body

### Webhook delivery behavior
- Synchronous delivery within the request cycle (no queue needed for Phase 2 -- BullMQ deferred to Phase 4 if needed)
- POST webhook payloads to configured callback URLs when state mutations occur (orderCreate, orderUpdate, etc.)
- Include HMAC signature in X-Shopify-Hmac-Sha256 header for verification
- Webhook topics configurable via admin API
- Failed deliveries logged but not retried (retry semantics deferred to Phase 3 webhook framework)

### Error simulation interface
- Admin API endpoint: POST /admin/errors/configure
- Per-operation error configuration: specify GraphQL operation name + error response (status code, body)
- Support error types: 401 (auth), 403 (forbidden), 429 (rate limit), 500 (internal), 503 (unavailable), timeout
- Global toggle: POST /admin/errors/enable and /admin/errors/disable
- Error config cleared on reset
- Timeout simulation uses configurable delay before response

### Test data and fixtures
- POST /admin/fixtures/load accepts JSON body with entities to seed (orders, products, customers)
- Fixture format mirrors Shopify's GraphQL response shapes for consistency
- GET /admin/state returns current twin state summary (entity counts, webhook subscriptions, error config)
- POST /admin/reset clears all state including fixtures, tokens, webhook configs, and error configs

### Claude's Discretion
- Internal database schema design for Shopify entities (tables, columns, indexes)
- GraphQL resolver implementation patterns
- Exact Shopify error response body formats (research should validate against actual Shopify responses)
- Webhook payload structure details (research should capture from Shopify docs)
- How to structure the twin app internally (plugin organization, route grouping)

</decisions>

<specifics>
## Specific Ideas

- Twin should feel like a real Shopify Admin API from the client's perspective -- same GID format, same field names, same error shapes
- Follow the example twin pattern established in Phase 1: buildApp() factory, Fastify plugin encapsulation, StateManager for persistence
- The twin lives at `twins/shopify/` following the monorepo convention
- GraphQL endpoint at POST /admin/api/2024-01/graphql.json (versioned like real Shopify API)
- Admin/test control endpoints use the /admin/ prefix pattern from the example twin

</specifics>

<deferred>
## Deferred Ideas

- Rate limiting by GraphQL query cost calculation -- Phase 4 (SHOP-04)
- Cursor-based pagination with stable ordering -- Phase 4 (SHOP-05)
- Full stateful order lifecycle (create -> update -> fulfill -> close) -- Phase 4 (SHOP-06)
- Webhook retry with exponential backoff -- Phase 3 (webhook framework)
- Conformance test suite against real Shopify sandbox -- Phase 3 (INFRA-05, INFRA-06)

</deferred>

---

*Phase: 02-shopify-twin-core-operations*
*Context gathered: 2026-02-27*
