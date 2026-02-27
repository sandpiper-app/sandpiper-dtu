## Plan 02-03: Webhooks, Error Simulation, and Integration Tests

**Status:** COMPLETE
**Duration:** Manual execution after agent retry

### Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Webhook sender and error simulator services | Done |
| 2 | Wire webhooks/errors into resolvers, integration tests | Done |

### Commits

- `d57e353` feat(02-03): add webhooks, error simulation, and integration tests

### Key Artifacts

| File | Purpose |
|------|---------|
| `twins/shopify/src/services/webhook-sender.ts` | HMAC-SHA256 webhook POST delivery |
| `twins/shopify/src/services/error-simulator.ts` | Per-operation error injection |
| `twins/shopify/src/plugins/errors.ts` | Admin endpoints for error config |
| `twins/shopify/src/schema/resolvers.ts` | Updated with auth, webhooks, error sim |
| `twins/shopify/src/plugins/graphql.ts` | Rewritten with yoga.fetch() for Fastify compat |
| `twins/shopify/test/integration.test.ts` | 24 integration tests |

### Requirements Completed

- **SHOP-03**: Webhook delivery on order create and update mutations
- **INFRA-04**: Configurable error simulation (401, 403, 429, 500, 503)

### Issues Fixed During Execution

1. **Yoga + Fastify integration**: `handleNodeRequestAndResponse` caused 500 errors — switched to `yoga.fetch()` with proper response forwarding
2. **Auth in context factory**: Throwing from context factory escaped Yoga pipeline — moved to `requireAuth()` in resolvers
3. **Error masking**: Yoga masked custom error codes — disabled with `maskedErrors: false`
4. **Snake/camelCase mapping**: DB columns (`created_at`, `updated_at`, `first_name`, etc.) not mapped to GraphQL fields — added type resolvers
5. **Duplicate GIDs**: Mutations used hardcoded GID `gid://shopify/Order/0` — switched to unique temp IDs
6. **HTTP status in errors**: `http: { status }` in GraphQLError extensions changed HTTP response code — removed for consistent 200 responses

### Test Results

```
Tests: 24 passed (24)
Duration: 1.90s
```

All tests passing: OAuth, admin API, GraphQL queries/mutations, token validation, orderUpdate state changes, error simulation, webhooks.
