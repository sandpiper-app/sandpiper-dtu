# Phase 2: Shopify Twin - Core Operations - Research

**Researched:** 2026-02-27
**Domain:** Shopify GraphQL Admin API, OAuth, Webhooks, Error Simulation
**Confidence:** HIGH

## Summary

Phase 2 builds a Shopify Admin API twin that handles OAuth token exchange, GraphQL operations (orders, products, customers, inventory, fulfillments), webhook delivery, and error simulation. The twin must maintain stateful behavior and provide realistic Shopify API responses.

**Primary recommendation:** Use GraphQL Yoga integrated with Fastify (following Phase 1 buildApp() pattern), SQLite tables per Shopify resource type, schema-first SDL approach for GraphQL schema clarity, and synchronous webhook delivery within request cycle. Follow Shopify's exact GID format (`gid://shopify/ResourceType/ID`), API versioning (`/admin/api/2024-01/graphql.json`), and error response structures to maximize fidelity.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**GraphQL schema scope:**
- Support only the Shopify Admin API resources Sandpiper actually uses -- orders, products, customers, inventory, fulfillments
- Use GraphQL Yoga as the server (per research stack decision)
- Schema should match Shopify's actual GraphQL schema shape (field names, types, nullability) but only for the subset we implement
- Return realistic GraphQL error responses for unsupported queries/mutations (error with "field not found" style messages)
- IDs should use Shopify's GID format: `gid://shopify/Order/12345`

**OAuth flow fidelity:**
- Implement simplified but structurally correct OAuth token exchange (authorization code -> access token)
- Twin issues access tokens that are validated on every GraphQL request via X-Shopify-Access-Token header
- No real redirect-based browser flow needed -- twin accepts authorization codes and returns tokens via API
- Tokens stored in StateManager, cleared on reset
- Invalid/expired tokens return 401 with Shopify-realistic error body

**Webhook delivery behavior:**
- Synchronous delivery within the request cycle (no queue needed for Phase 2 -- BullMQ deferred to Phase 4 if needed)
- POST webhook payloads to configured callback URLs when state mutations occur (orderCreate, orderUpdate, etc.)
- Include HMAC signature in X-Shopify-Hmac-Sha256 header for verification
- Webhook topics configurable via admin API
- Failed deliveries logged but not retried (retry semantics deferred to Phase 3 webhook framework)

**Error simulation interface:**
- Admin API endpoint: POST /admin/errors/configure
- Per-operation error configuration: specify GraphQL operation name + error response (status code, body)
- Support error types: 401 (auth), 403 (forbidden), 429 (rate limit), 500 (internal), 503 (unavailable), timeout
- Global toggle: POST /admin/errors/enable and /admin/errors/disable
- Error config cleared on reset
- Timeout simulation uses configurable delay before response

**Test data and fixtures:**
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

### Deferred Ideas (OUT OF SCOPE)

- Rate limiting by GraphQL query cost calculation -- Phase 4 (SHOP-04)
- Cursor-based pagination with stable ordering -- Phase 4 (SHOP-05)
- Full stateful order lifecycle (create -> update -> fulfill -> close) -- Phase 4 (SHOP-06)
- Webhook retry with exponential backoff -- Phase 3 (webhook framework)
- Conformance test suite against real Shopify sandbox -- Phase 3 (INFRA-05, INFRA-06)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-01 | GraphQL Admin API handles queries and mutations Sandpiper uses — orders, products, customers, inventory, fulfillments | GraphQL Yoga + Fastify integration, SDL schema definition, resolver patterns, SQLite backend schema |
| SHOP-02 | OAuth token exchange flow — authorization code → access token, with token validation on subsequent requests | OAuth authorization code grant pattern, X-Shopify-Access-Token header validation, token storage in StateManager |
| SHOP-03 | Webhook delivery — state mutations trigger POST to configured callback URLs | Webhook topic format (resource/action), HMAC SHA-256 signature generation, payload structure, synchronous delivery pattern |
| SHOP-07 | X-Shopify-Access-Token header validation on all API requests | Header extraction in GraphQL context, token validation middleware pattern, 401 error response format |
| INFRA-03 | Admin API for programmatic test control — POST /admin/reset, POST /admin/fixtures/load, GET /admin/state | Admin plugin pattern from Phase 1, fixture loading to SQLite, state inspection endpoints |
| INFRA-04 | Configurable error simulation per endpoint — 401, 403, 429, 500, 503, timeout responses with realistic error bodies | Error configuration storage, per-operation error injection, Shopify error response formats, timeout delay simulation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| graphql-yoga | 5.x | GraphQL server | Modern, framework-agnostic GraphQL server with built-in subscriptions, file upload, excellent Fastify integration |
| graphql | 16.x | GraphQL schema/execution | Required peer dependency for GraphQL Yoga, provides schema building and execution |
| fastify | 5.x | HTTP server | Already established in Phase 1, high-performance, plugin ecosystem, matches project architecture |
| better-sqlite3 | 12.x | SQLite backend | Already established in Phase 1, synchronous API, <100ms reset time, excellent for stateful twin |
| pino | Latest | Structured logging | Already established in Phase 1, correlation IDs, structured JSON logs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @graphql-tools/schema | 10.x | Schema utilities | For makeExecutableSchema if needed beyond Yoga's createSchema |
| graphql-scalars | Latest | Custom scalar types | If Shopify uses DateTime, JSON, or other custom scalars |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GraphQL Yoga | Apollo Server | Apollo is heavier, more opinionated, Yoga integrates better with Fastify and has simpler setup |
| Schema-first SDL | Code-first (Pothos, TypeGraphQL) | Code-first has better TypeScript inference but SDL provides clearer API contract visibility for twin fidelity validation |
| Synchronous webhooks | BullMQ async queue | Async queue adds complexity; synchronous is sufficient for Phase 2, deferred to Phase 3 |

**Installation:**
```bash
pnpm add graphql-yoga graphql
# Supporting (install as needed):
pnpm add @graphql-tools/schema graphql-scalars
```

## Architecture Patterns

### Recommended Project Structure
```
twins/shopify/
├── src/
│   ├── index.ts              # buildApp() factory, Fastify setup, GraphQL Yoga integration
│   ├── schema/
│   │   ├── schema.graphql    # SDL schema definition (QueryRoot, mutations, types)
│   │   └── resolvers.ts      # Resolver map (Query, Mutation, types)
│   ├── plugins/
│   │   ├── health.ts         # GET /health (from Phase 1 pattern)
│   │   ├── admin.ts          # POST /admin/reset, GET /admin/state
│   │   ├── fixtures.ts       # POST /admin/fixtures/load
│   │   ├── errors.ts         # POST /admin/errors/configure, enable, disable
│   │   ├── oauth.ts          # POST /oauth/token (authorization code exchange)
│   │   └── graphql.ts        # GraphQL Yoga route handler at /admin/api/2024-01/graphql.json
│   ├── services/
│   │   ├── token-validator.ts  # X-Shopify-Access-Token validation
│   │   ├── webhook-sender.ts   # HMAC signature + POST delivery
│   │   └── error-simulator.ts  # Per-operation error injection
│   └── db/
│       ├── schema.sql        # SQLite schema for orders, products, customers, inventory, fulfillments, tokens, webhooks, errors
│       └── migrations.ts     # Migration runner (extend Phase 1 StateManager pattern)
├── test/
│   └── integration.test.ts   # GraphQL queries, mutations, OAuth, webhooks, error simulation
└── package.json
```

### Pattern 1: GraphQL Yoga + Fastify Integration
**What:** GraphQL Yoga instance created and mounted on Fastify route at Shopify API path
**When to use:** All GraphQL API endpoints
**Example:**
```typescript
// Source: https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-fastify
import { createYoga } from 'graphql-yoga';
import { FastifyReply, FastifyRequest } from 'fastify';

export async function graphqlPlugin(fastify: FastifyInstance) {
  const yoga = createYoga<{
    req: FastifyRequest;
    reply: FastifyReply;
  }>({
    schema, // from schema/resolvers.ts
    logging: {
      debug: (...args) => args.forEach(arg => fastify.log.debug(arg)),
      info: (...args) => args.forEach(arg => fastify.log.info(arg)),
      warn: (...args) => args.forEach(arg => fastify.log.warn(arg)),
      error: (...args) => args.forEach(arg => fastify.log.error(arg))
    },
    context: async ({ req }) => ({
      req,
      stateManager: fastify.stateManager,
      // Token validation happens here
    })
  });

  fastify.route({
    url: '/admin/api/2024-01/graphql.json',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: (req, reply) =>
      yoga.handleNodeRequestAndResponse(req, reply, {
        req,
        reply
      })
  });
}
```

### Pattern 2: GID Format Handling
**What:** Shopify uses global IDs in format `gid://shopify/ResourceType/ID`
**When to use:** All ID fields in GraphQL schema, entity storage, ID parsing/generation
**Example:**
```typescript
// Source: https://shopify.dev/docs/api/usage/gids
// GID format: gid://shopify/{object_name}/{id}
// Examples:
// - gid://shopify/Order/12345
// - gid://shopify/Product/67890
// - gid://shopify/Customer/11111

function createGID(resourceType: string, id: string): string {
  return `gid://shopify/${resourceType}/${id}`;
}

function parseGID(gid: string): { resourceType: string; id: string } {
  const match = gid.match(/^gid:\/\/shopify\/([^\/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid GID format: ${gid}`);
  return { resourceType: match[1], id: match[2] };
}

// In SQLite, store numeric ID separately, generate GID in resolvers:
// Table: orders (id INTEGER PRIMARY KEY, ...)
// Resolver: id: (parent) => createGID('Order', parent.id)
```

### Pattern 3: OAuth Token Validation Middleware
**What:** Extract and validate X-Shopify-Access-Token header before GraphQL execution
**When to use:** GraphQL context creation, all protected endpoints
**Example:**
```typescript
// Source: https://shopify.dev/docs/api/usage/authentication
// Shopify requires X-Shopify-Access-Token header on all requests

interface TokenValidationResult {
  valid: boolean;
  shopDomain?: string;
}

async function validateAccessToken(token: string, stateManager: StateManager): Promise<TokenValidationResult> {
  const tokenRecord = await stateManager.getToken(token);
  if (!tokenRecord) {
    return { valid: false };
  }
  // Optional: check expiration, scopes
  return { valid: true, shopDomain: tokenRecord.shop_domain };
}

// In GraphQL Yoga context:
context: async ({ req }) => {
  const token = req.headers['x-shopify-access-token'];
  if (!token) {
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHORIZED', http: { status: 401 } }
    });
  }
  const validation = await validateAccessToken(token, stateManager);
  if (!validation.valid) {
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHORIZED', http: { status: 401 } }
    });
  }
  return { shopDomain: validation.shopDomain, stateManager };
}
```

### Pattern 4: Webhook HMAC Signature
**What:** Generate HMAC SHA-256 signature for webhook payloads using shared secret
**When to use:** All webhook deliveries on state mutations
**Example:**
```typescript
// Source: https://shopify.dev/docs/apps/build/webhooks/subscribe/https
import crypto from 'node:crypto';

function generateWebhookSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

async function sendWebhook(
  url: string,
  topic: string,
  payload: object,
  secret: string
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, secret);

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Hmac-Sha256': signature,
      'X-Shopify-Shop-Domain': 'twin.myshopify.com',
      'X-Shopify-API-Version': '2024-01',
      'X-Shopify-Webhook-Id': crypto.randomUUID()
    },
    body
  });
}

// CRITICAL: Use crypto.timingSafeEqual for verification to prevent timing attacks
// Source: https://nodejs.org/api/crypto.html
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
```

### Pattern 5: GraphQL UserError Response
**What:** Shopify mutations return userErrors array for validation failures
**When to use:** All mutations, validation failures, business logic violations
**Example:**
```typescript
// Source: https://shopify.dev/docs/api/admin-graphql/latest/objects/UserError
// UserError has fields: field (array of strings), message (string)

type UserError = {
  field: string[];
  message: string;
};

// GraphQL SDL:
// type OrderCreatePayload {
//   order: Order
//   userErrors: [UserError!]!
// }

// Resolver example:
const orderCreate = async (parent, args, context) => {
  const { input } = args;
  const errors: UserError[] = [];

  if (!input.lineItems || input.lineItems.length === 0) {
    errors.push({
      field: ['lineItems'],
      message: 'Line items are required'
    });
  }

  if (errors.length > 0) {
    return { order: null, userErrors: errors };
  }

  const order = await context.stateManager.createOrder(input);
  return { order, userErrors: [] };
};
```

### Pattern 6: Error Simulation Injection
**What:** Check error configuration before processing, inject configured error response
**When to use:** All GraphQL operations when error simulation is enabled
**Example:**
```typescript
// Error config structure
interface ErrorConfig {
  operationName: string; // e.g., "orderCreate", "orderQuery"
  statusCode: number;    // 401, 403, 429, 500, 503
  errorBody?: object;
  delayMs?: number;      // for timeout simulation
}

async function checkErrorSimulation(
  operationName: string,
  errorSimulator: ErrorSimulator
): Promise<ErrorConfig | null> {
  if (!errorSimulator.isEnabled()) return null;
  return errorSimulator.getConfigForOperation(operationName);
}

// In GraphQL Yoga plugins or resolvers:
const errorConfig = await checkErrorSimulation(operation.name, errorSimulator);
if (errorConfig) {
  if (errorConfig.delayMs) {
    await new Promise(resolve => setTimeout(resolve, errorConfig.delayMs));
  }
  throw new GraphQLError(errorConfig.errorBody?.message || 'Simulated error', {
    extensions: {
      code: errorConfig.statusCode === 401 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
      http: { status: errorConfig.statusCode }
    }
  });
}
```

### Anti-Patterns to Avoid
- **Global state outside StateManager:** All twin state (entities, tokens, webhooks, error config) MUST go through StateManager for reset capability
- **Async webhook delivery in Phase 2:** Adds unnecessary complexity; synchronous delivery is sufficient until Phase 3
- **Code-first GraphQL schema:** While TypeScript-friendly, SDL provides clearer API contract that's easier to compare with real Shopify schema
- **String equality for HMAC verification:** MUST use crypto.timingSafeEqual to prevent timing attacks
- **Parsing request body before HMAC verification:** Webhook signature is computed over raw bytes; body parsers break this

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GraphQL schema validation | Custom query parser | graphql-yoga + graphql | GraphQL spec is complex (introspection, fragments, directives); libraries handle all edge cases |
| HMAC signature generation | Custom crypto implementation | Node.js crypto.createHmac | Subtle timing attack vulnerabilities, encoding issues (base64 vs hex), built-in is audited |
| OAuth token generation | Custom random string generator | Node.js crypto.randomUUID or crypto.randomBytes | Insufficient entropy leads to predictable tokens; crypto module uses OS CSPRNG |
| GraphQL scalar types | Manual validation/coercion | graphql-scalars package | DateTime, JSON, URL scalars have complex parsing/serialization rules |
| Request ID generation | Math.random() or timestamp | crypto.randomUUID | Collisions with Math.random(), UUIDs are globally unique and RFC 4122 compliant |

**Key insight:** Cryptographic operations (HMAC, token generation, signature verification) and GraphQL specification compliance are domains where custom solutions introduce security vulnerabilities and edge case bugs. Use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Schema Mismatch with Real Shopify API
**What goes wrong:** Twin schema diverges from Shopify's actual GraphQL schema (field names, nullability, types), causing integration to fail when switching to real API
**Why it happens:** Building schema from assumptions rather than Shopify's documented schema, not validating field nullability
**How to avoid:**
- Reference Shopify GraphQL Admin API docs for exact field names and types: https://shopify.dev/docs/api/admin-graphql/latest
- Use GraphQL introspection on real Shopify dev store to capture exact schema
- Mark fields nullable only if Shopify does
- Include userErrors field in ALL mutation payloads (Shopify standard)
**Warning signs:** Integration tests pass against twin but fail against sandbox API; field name capitalization differences; missing userErrors responses

### Pitfall 2: HMAC Verification Timing Attacks
**What goes wrong:** Using `===` or string comparison for HMAC signature verification leaks timing information, enabling attackers to forge signatures
**Why it happens:** Not understanding that comparison time varies based on where strings differ, revealing information bit-by-bit
**How to avoid:**
- ALWAYS use crypto.timingSafeEqual for signature comparison
- Convert both signatures to Buffers before comparison
- Check length equality separately before timingSafeEqual (it throws if lengths differ)
**Warning signs:** Security audit failures; string comparison operators in HMAC verification code

### Pitfall 3: Webhook Signature Over Parsed Body
**What goes wrong:** Computing HMAC signature over JSON.parse(body) instead of raw request body breaks verification
**Why it happens:** Body parsing middleware runs before webhook handler, destroying raw body
**Why it's critical:** HMAC is computed over exact bytes; JSON parse/stringify changes whitespace, key ordering, number precision
**How to avoid:**
- Access req.rawBody or req.body as Buffer/string before any parsing
- Configure body parser to preserve raw body: `app.addContentTypeParser('application/json', { bodyLimit: ... }, (req, payload, done) => { ... })`
- Compute signature BEFORE any JSON.parse calls
**Warning signs:** Webhook verification fails even with correct secret; signature mismatches on valid requests

### Pitfall 4: GID Format Inconsistency
**What goes wrong:** Using integer IDs in some places, GIDs in others; inconsistent GID formatting (missing gid://, wrong casing)
**Why it happens:** SQLite stores integer IDs naturally, forgetting to convert to GID format in GraphQL resolvers
**How to avoid:**
- Store numeric IDs in SQLite (id INTEGER PRIMARY KEY)
- ALWAYS return GIDs in GraphQL resolvers: `id: (parent) => createGID('Order', parent.id)`
- Create helper functions: createGID(), parseGID()
- Never expose raw integer IDs in GraphQL schema
**Warning signs:** GraphQL responses have integer IDs; clients can't parse IDs; conformance tests fail

### Pitfall 5: Not Clearing All State on Reset
**What goes wrong:** /admin/reset clears entities but not tokens, webhook configs, or error configs, leaving orphaned state
**Why it happens:** StateManager pattern from Phase 1 only handles generic entities table; new tables added but not included in reset
**How to avoid:**
- Extend StateManager.reset() to drop ALL tables (entities, tokens, webhook_subscriptions, error_configs)
- Use DROP TABLE IF EXISTS for each table in migrations
- Run full migration after drop to recreate clean schema
- Test reset by loading fixtures, configuring errors, then resetting and verifying state is empty
**Warning signs:** Tests fail intermittently; reset doesn't restore deterministic state; error configs persist across tests

### Pitfall 6: Token Validation Performance on Every Request
**What goes wrong:** Querying database for token on EVERY GraphQL request creates bottleneck
**Why it happens:** Not caching token validation results; hitting DB on every context creation
**How to avoid:**
- Use in-memory token cache (Map<token, validation result>) with reasonable TTL
- Invalidate cache on token creation/deletion
- For Phase 2 (low volume), simple Map is sufficient; consider LRU cache for Phase 4
- Still validate format and check cache before DB query
**Warning signs:** High DB query count in logs; GraphQL requests slow even with simple queries; database is bottleneck

### Pitfall 7: Synchronous Webhook Delivery Blocking Requests
**What goes wrong:** Webhook POST hangs or times out, blocking GraphQL mutation response
**Why it happens:** fetch() to webhook URL waits for response; target server slow/down
**How to avoid:**
- Set aggressive timeout on webhook fetch (1-2 seconds)
- Log webhook failures but DON'T throw errors to client
- Return mutation response before webhook completes (fire and forget)
- For Phase 2, acceptable to block briefly; Phase 3 moves to async queue
**Warning signs:** Mutation responses slow; mutations fail when webhook endpoint down; tests flaky due to webhook timeouts

## Code Examples

Verified patterns from official sources:

### Shopify API Versioned Endpoint
```typescript
// Source: https://shopify.dev/docs/api/usage/versioning
// URL format: https://{store}.myshopify.com/admin/api/{version}/graphql.json
// Versions are YYYY-MM format, released quarterly
// Each version supported minimum 12 months

// Twin endpoint should match this structure:
fastify.route({
  url: '/admin/api/2024-01/graphql.json',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: yogaHandler
});
```

### Shopify GraphQL Query Structure
```graphql
# Source: https://shopify.dev/docs/api/admin-graphql/latest
# Queries start at QueryRoot

query GetOrders {
  orders(first: 10) {
    edges {
      node {
        id  # GID format: gid://shopify/Order/12345
        name
        createdAt
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 5) {
          edges {
            node {
              id
              title
              quantity
            }
          }
        }
      }
    }
  }
}
```

### Shopify Mutation with UserErrors
```graphql
# Source: https://shopify.dev/docs/apps/build/graphql/basics/mutations

mutation CreateOrder($input: OrderInput!) {
  orderCreate(input: $input) {
    order {
      id
      name
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### Webhook Topics and Payload
```javascript
// Source: https://shopify.dev/docs/api/webhooks/latest
// Topic format: resource/action
// Examples:
// - orders/create
// - orders/updated
// - products/create
// - products/update
// - products/delete
// - customers/create
// - customers/update
// - fulfillments/create

// Example webhook payload for orders/create
{
  "id": 820982911946154500,
  "admin_graphql_api_id": "gid://shopify/Order/820982911946154508",
  "created_at": "2024-01-02T09:30:47-05:00",
  "name": "#1001",
  "total_price": "598.94",
  "line_items": [
    {
      "id": 866550311766439000,
      "title": "IPod Nano - 8GB",
      "quantity": 1,
      "price": "199.00"
    }
  ]
}

// Headers:
// X-Shopify-Topic: orders/create
// X-Shopify-Hmac-Sha256: [base64-encoded signature]
// X-Shopify-Shop-Domain: example.myshopify.com
// X-Shopify-API-Version: 2024-01
// X-Shopify-Webhook-Id: [UUID]
```

### OAuth Token Exchange
```typescript
// Source: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant

// POST /admin/oauth/access_token
// Body: {
//   client_id: string,
//   client_secret: string,
//   code: string  // authorization code from callback
// }
//
// Response: {
//   access_token: string,
//   scope: string
// }

// Twin simplified version:
app.post('/admin/oauth/access_token', async (req, reply) => {
  const { code } = req.body;

  // For twin: accept any code, issue token
  const token = crypto.randomUUID();

  // Store in StateManager
  await stateManager.createToken({
    token,
    code,
    shop_domain: 'twin.myshopify.com',
    scopes: 'read_orders,write_orders,read_products,write_products'
  });

  return {
    access_token: token,
    scope: 'read_orders,write_orders,read_products,write_products'
  };
});
```

### Shopify Error Response Formats
```typescript
// Source: https://shopify.dev/docs/api/usage/response-codes

// 401 Unauthorized
{
  "errors": "Unauthorized"
}
// Headers: HTTP 401

// 403 Forbidden
{
  "errors": "Forbidden"
}
// Headers: HTTP 403

// 429 Too Many Requests
{
  "errors": "Throttled"
}
// Headers: HTTP 429, Retry-After: 2.0

// 500 Internal Server Error
{
  "errors": "Internal Server Error"
}
// Headers: HTTP 500

// 503 Service Unavailable
{
  "errors": "Service Unavailable"
}
// Headers: HTTP 503

// GraphQL-specific errors (HTTP 200 with errors array)
{
  "data": null,
  "errors": [
    {
      "message": "Field 'invalidField' doesn't exist on type 'Order'",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["order", "invalidField"],
      "extensions": {
        "code": "FIELD_NOT_FOUND"
      }
    }
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST Admin API | GraphQL Admin API | 2020 (stable 2021) | GraphQL is now primary Shopify API; REST in maintenance mode |
| Schema-first with resolvers | Code-first TypeScript (Pothos, Nexus) | 2022-2023 | Better type safety, but SDL-first remains valid for twin fidelity (easier to compare schemas) |
| Manual HMAC implementation | crypto.timingSafeEqual | Always required | Timing attack prevention is critical; string comparison insecure |
| Apollo Server | GraphQL Yoga | 2022-2024 | Yoga is lighter, faster, better Fastify integration; Apollo still viable but heavier |
| API versioning by header | API versioning in URL path | 2019 | Shopify uses URL-based versioning (/admin/api/2024-01/); must match in twin |

**Deprecated/outdated:**
- **REST Admin API as primary:** Still works but GraphQL is recommended for new development (since 2021)
- **Webhook payloads in XML:** Shopify defaults to JSON now (XML option exists but uncommon)
- **Private apps with API password:** Replaced by custom apps with Admin API access tokens (deprecated 2022)

## Open Questions

1. **What exact Shopify entities does Sandpiper use?**
   - What we know: Requirements mention orders, products, customers, inventory, fulfillments
   - What's unclear: Which specific fields on each entity? Are there relationships we need to model (Order -> Customer)?
   - Recommendation: Start with minimal fields (id, name/title, createdAt, updatedAt), expand based on test failures

2. **Should webhook secret be configurable per subscription?**
   - What we know: Real Shopify uses app client secret for HMAC; twin can simplify
   - What's unclear: Does Sandpiper verify webhook signatures? If so, needs configurable secret
   - Recommendation: Use single configurable secret (environment variable) for Phase 2; per-subscription config can come later if needed

3. **How to handle GraphQL query complexity/depth limits?**
   - What we know: Phase 4 handles query cost calculation (SHOP-04)
   - What's unclear: Should Phase 2 have basic depth limits to prevent pathological queries?
   - Recommendation: No limits in Phase 2 for simplicity; add in Phase 4 alongside cost calculation

4. **What Shopify API version to target?**
   - What we know: 2024-01 is stable, 2025-01 is latest (as of Feb 2026)
   - What's unclear: Which version does Sandpiper currently use?
   - Recommendation: Use 2024-01 in URL path as documented example; easy to change later

## Sources

### Primary (HIGH confidence)
- [Shopify GraphQL Admin API Reference](https://shopify.dev/docs/api/admin-graphql/latest) - GraphQL schema structure, queries, mutations
- [Shopify Global IDs (GIDs)](https://shopify.dev/docs/api/usage/gids) - GID format specification
- [Shopify API Versioning](https://shopify.dev/docs/api/usage/versioning) - URL format, version naming, support lifecycle
- [Shopify OAuth Authorization Code Grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) - Token exchange flow
- [Shopify Webhooks HTTPS Delivery](https://shopify.dev/docs/apps/build/webhooks/subscribe/https) - HMAC signature, headers, payload structure
- [Shopify Response Codes](https://shopify.dev/docs/api/usage/response-codes) - Error response formats
- [Shopify UserError Object](https://shopify.dev/docs/api/admin-graphql/latest/objects/UserError) - Mutation error structure
- [GraphQL Yoga Fastify Integration](https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-fastify) - Setup code, logger integration
- [Node.js crypto.timingSafeEqual](https://nodejs.org/api/crypto.html) - HMAC verification security

### Secondary (MEDIUM confidence)
- [Hookdeck Shopify Webhooks Guide](https://hookdeck.com/webhooks/platforms/shopify-webhooks-features-and-best-practices-guide) - Webhook best practices
- [Hookdeck SHA256 Signature Verification](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification) - HMAC implementation patterns
- [LogRocket GraphQL Schema Anti-Patterns](https://blog.logrocket.com/anti-patterns-graphql-schema-design/) - Common mistakes
- [GraphQL Best Practices (graphql.org)](https://graphql.org/learn/best-practices/) - Official GraphQL guidance
- [WireMock](https://wiremock.org/) - API mocking error simulation patterns

### Tertiary (LOW confidence - verify during implementation)
- Community forum discussions on HMAC verification issues
- Third-party blog posts on GraphQL Yoga setup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - GraphQL Yoga and Fastify integration well-documented with official examples
- Architecture: HIGH - Shopify API structure, GID format, error responses verified from official docs
- Pitfalls: MEDIUM-HIGH - HMAC timing attacks and schema fidelity are well-documented; some pitfalls derived from general GraphQL best practices

**Research date:** 2026-02-27
**Valid until:** ~30 days (Shopify API stable, GraphQL Yoga stable; main risk is new Shopify API version release)
