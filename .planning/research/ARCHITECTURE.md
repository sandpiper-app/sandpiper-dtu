# Architecture Research: API Twin Monorepo

**Domain:** API Behavioral Clones / Digital Twin Universe
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Standard Architecture

API twin/simulator systems that replicate third-party service behavior follow a layered architecture separating routing concerns from state management, business logic from delivery mechanisms, and shared infrastructure from per-twin customization.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Consumer Layer                                │
│  ┌────────────────┐                      ┌────────────────────────┐  │
│  │   Sandpiper    │──────────────────────│  docker-compose.yaml   │  │
│  │ (base URL swap)│                      │    orchestration       │  │
│  └────────────────┘                      └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│                         Twin Services Layer                           │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │ Shopify Twin │   │  Slack Twin  │   │  Future Twins (Nylas,    │ │
│  │  (GraphQL)   │   │ (Web + Events)│   │  Shippo, Triple Whale)   │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────────────────────┘ │
│         │                  │                                          │
└─────────┼──────────────────┼──────────────────────────────────────────┘
          │                  │
          ↓                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      Shared Infrastructure Layer                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ HTTP Framework │  │  State Manager │  │  Webhook Dispatcher    │ │
│  │ (Express Core) │  │ (SQLite/Memory)│  │  (Queue + Retry)       │ │
│  └────────────────┘  └────────────────┘  └────────────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │  Validation    │  │   Conformance  │  │   Build Tooling        │ │
│  │    Helpers     │  │  Test Harness  │  │  (tsup, TypeScript)    │ │
│  └────────────────┘  └────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
          │                  │                       │
          ↓                  ↓                       ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      Data Persistence Layer                           │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │Shopify State │   │ Slack State  │   │  Webhook Queue Store   │  │
│  │  (SQLite)    │   │  (SQLite)    │   │    (in-memory)         │  │
│  └──────────────┘   └──────────────┘   └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Twin Service** | HTTP API endpoints, business logic specific to one third-party service | Express app with service-specific routes, GraphQL schema (Shopify), REST endpoints (Slack) |
| **HTTP Framework** | Request/response cycle, middleware, routing helpers | Express core with shared middleware (auth, logging, error handling) |
| **State Manager** | CRUD operations on twin state, schema migrations, fixtures | SQLite with better-sqlite3 or in-memory store with query layer |
| **Webhook Dispatcher** | Queue webhook events, retry delivery with backoff, track failures | In-memory queue with worker threads, exponential retry, DLQ |
| **Validation Helpers** | Schema validation, response formatting, OAuth flows | Zod schemas, shared OAuth token exchange logic |
| **Conformance Test Harness** | Run scenarios against twin vs real API, diff responses, report drift | Test runner comparing twin responses to real API responses, flagging mismatches |
| **Build Tooling** | Compile TypeScript, bundle packages, generate types from schemas | tsup for bundling, GraphQL codegen for type generation |

## Recommended Monorepo Structure

```
sandpiper-dtu/
├── apps/                          # Twin service applications
│   ├── shopify-twin/              # Shopify GraphQL API twin
│   │   ├── src/
│   │   │   ├── routes/            # GraphQL resolvers, REST endpoints
│   │   │   ├── logic/             # Business logic (orders, products, inventory)
│   │   │   ├── schema/            # GraphQL schema definitions
│   │   │   ├── state/             # State initialization, fixtures
│   │   │   └── main.ts            # Entry point
│   │   ├── package.json           # Dependencies: workspace:@dtu/core, workspace:@dtu/state
│   │   ├── tsconfig.json          # Extends workspace base config
│   │   └── Dockerfile             # Image for CI/E2E
│   │
│   └── slack-twin/                # Slack Web + Events API twin
│       ├── src/
│       │   ├── routes/            # Web API endpoints, Events API, OAuth
│       │   ├── logic/             # Messages, reactions, Block Kit interactions
│       │   ├── state/             # Channel, user, message state
│       │   └── main.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
│
├── packages/                      # Shared infrastructure
│   ├── core/                      # HTTP framework layer
│   │   ├── src/
│   │   │   ├── server.ts          # Express app factory with sensible defaults
│   │   │   ├── middleware/        # Auth, logging, error handling, CORS
│   │   │   ├── validation.ts      # Zod integration, request validators
│   │   │   └── oauth.ts           # OAuth token exchange flows
│   │   ├── package.json           # Dependencies: express, zod
│   │   └── tsconfig.json
│   │
│   ├── state/                     # State management layer
│   │   ├── src/
│   │   │   ├── sqlite-store.ts    # SQLite adapter with better-sqlite3
│   │   │   ├── memory-store.ts    # In-memory store for fast tests
│   │   │   ├── schema.ts          # Migration helpers, type-safe queries
│   │   │   └── fixtures.ts        # Seed data generators
│   │   ├── package.json           # Dependencies: better-sqlite3
│   │   └── tsconfig.json
│   │
│   ├── webhooks/                  # Webhook delivery system
│   │   ├── src/
│   │   │   ├── dispatcher.ts      # Queue management, worker pool
│   │   │   ├── retry.ts           # Exponential backoff, circuit breaker
│   │   │   ├── dlq.ts             # Dead letter queue for failed deliveries
│   │   │   └── types.ts           # Webhook event types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── conformance/               # Conformance test harness
│   │   ├── src/
│   │   │   ├── runner.ts          # Test orchestration
│   │   │   ├── scenarios/         # Scenario definitions (JSON)
│   │   │   ├── differ.ts          # Response comparison, normalization
│   │   │   └── reporter.ts        # Test results, drift reports
│   │   ├── package.json           # Dependencies: vitest, axios
│   │   └── tsconfig.json
│   │
│   └── types/                     # Shared TypeScript types
│       ├── src/
│       │   ├── shopify.ts         # Shopify API types (codegen)
│       │   ├── slack.ts           # Slack API types
│       │   └── common.ts          # HTTP, state, webhook types
│       ├── package.json
│       └── tsconfig.json
│
├── tests/                         # Integration and E2E tests
│   ├── integration/               # Tests against individual twins
│   │   ├── shopify.test.ts
│   │   └── slack.test.ts
│   └── e2e/                       # Tests with Sandpiper + twins
│       └── sandpiper-integration.test.ts
│
├── docker/                        # Docker orchestration
│   ├── docker-compose.yml         # All twins + dependencies
│   └── docker-compose.ci.yml      # CI-specific overrides
│
├── pnpm-workspace.yaml            # Workspace definition
├── package.json                   # Root scripts, dev dependencies
├── tsconfig.json                  # Base TypeScript config
├── turbo.json                     # Turborepo task pipeline (optional)
└── vitest.config.ts               # Test configuration
```

### Structure Rationale

- **`apps/` vs `packages/`:** Applications are deployable units (twins), packages are libraries. This mirrors industry-standard monorepo patterns from [Monorepo Tools](https://monorepo.tools/) and [pnpm workspaces](https://pnpm.io/workspaces).
- **Per-twin isolation:** Each twin is fully self-contained with its own Dockerfile, routes, logic, and state schema. This allows independent evolution and selective deployment.
- **Shared infrastructure in `packages/`:** Extracts common concerns (HTTP, state, webhooks, conformance) into reusable libraries, reducing duplication while maintaining clear boundaries.
- **Workspace protocol:** Twin apps use `workspace:@dtu/core` syntax to reference local packages, enabling instant propagation of changes without publishing.

## Architectural Patterns

### Pattern 1: Behavioral Clone at the Boundary

**What:** Replicate behavior at the API boundary (HTTP request/response) without reimplementing internal service logic.

**When to use:** When testing integration code that depends on third-party APIs where you need high fidelity but don't care about the service's internal architecture.

**Trade-offs:**
- **Pro:** Much simpler than full reimplementation. Focus on observable behavior (API contracts, edge cases, timing).
- **Pro:** Validated against real API until behavioral differences disappear (conformance testing).
- **Con:** Doesn't replicate internal service state (e.g., Shopify's inventory locking), only external behavior.

**Example:**
```typescript
// StrongDM pattern: replicate from API contracts + observed edge cases
// Source: https://factory.strongdm.ai/techniques/dtu

// apps/shopify-twin/src/routes/products.ts
import { Router } from 'express';
import { ProductStore } from '@dtu/state';
import { validateGraphQL } from '@dtu/core';

const router = Router();

// Replicate Shopify GraphQL product query behavior
router.post('/admin/api/2024-01/graphql.json', async (req, res) => {
  const { query, variables } = validateGraphQL(req.body);

  // Behavioral boundary: respond like Shopify would
  if (query.includes('products')) {
    const products = await ProductStore.findAll(variables);
    return res.json({
      data: { products },
      extensions: { cost: { requestedQueryCost: 5 } } // Shopify-specific metadata
    });
  }

  // Replicate Shopify's error format for invalid queries
  return res.status(400).json({
    errors: [{ message: "Parse error on \"invalid\" (STRING)" }]
  });
});

export default router;
```

### Pattern 2: Layered State Management

**What:** Separate state persistence (SQLite/memory) from state access (query layer) from state schema (migrations/fixtures).

**When to use:** Always. Prevents tight coupling between business logic and storage mechanism.

**Trade-offs:**
- **Pro:** Can swap SQLite for in-memory during tests without changing twin logic.
- **Pro:** Migrations and fixtures become reusable across twins.
- **Con:** Adds abstraction layer that might feel like overkill for simple twins.

**Example:**
```typescript
// packages/state/src/sqlite-store.ts
import Database from 'better-sqlite3';

export class SQLiteStore<T> {
  private db: Database.Database;

  constructor(path: string = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrency
  }

  async create(table: string, data: T): Promise<T> {
    const stmt = this.db.prepare(`INSERT INTO ${table} VALUES (?)`);
    const result = stmt.run(JSON.stringify(data));
    return { ...data, id: result.lastInsertRowid };
  }

  async findAll(table: string, filters?: Partial<T>): Promise<T[]> {
    // Query layer abstracts SQL details
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE ?`);
    return stmt.all(filters).map(row => JSON.parse(row));
  }
}

// apps/shopify-twin/src/state/products.ts
import { SQLiteStore } from '@dtu/state';

export const ProductStore = new SQLiteStore<ShopifyProduct>('shopify.db');

// Initialize schema on startup
ProductStore.migrate(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    vendor TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
```

### Pattern 3: Asynchronous Webhook Delivery

**What:** Decouple webhook emission from HTTP response. Queue events, deliver asynchronously with retry/backoff.

**When to use:** When twins need to simulate real service webhook behavior (state changes → HTTP POST to callback URL).

**Trade-offs:**
- **Pro:** Realistic simulation of webhook timing, retries, failures.
- **Pro:** Doesn't block twin HTTP responses waiting for webhook delivery.
- **Con:** Adds complexity (queue, workers, DLQ). For simple twins, synchronous might suffice.

**Example:**
```typescript
// packages/webhooks/src/dispatcher.ts
import { EventEmitter } from 'events';

interface WebhookEvent {
  url: string;
  payload: object;
  retries: number;
}

export class WebhookDispatcher extends EventEmitter {
  private queue: WebhookEvent[] = [];
  private maxRetries = 5;

  enqueue(url: string, payload: object) {
    this.queue.push({ url, payload, retries: 0 });
    this.emit('event:queued');
  }

  async processQueue() {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;

      try {
        await fetch(event.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event.payload),
          signal: AbortSignal.timeout(5000) // 5s timeout
        });
      } catch (error) {
        // Exponential backoff pattern
        if (event.retries < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, event.retries), 60000);
          setTimeout(() => {
            event.retries++;
            this.queue.push(event);
          }, delay);
        } else {
          this.emit('event:failed', event); // Move to DLQ
        }
      }
    }
  }
}

// apps/shopify-twin/src/routes/orders.ts
import { dispatcher } from '@dtu/webhooks';

router.post('/admin/api/2024-01/orders.json', async (req, res) => {
  const order = await OrderStore.create(req.body);

  // Queue webhook delivery (non-blocking)
  dispatcher.enqueue(process.env.WEBHOOK_URL!, {
    topic: 'orders/create',
    payload: order
  });

  res.status(201).json({ order }); // Respond immediately
});
```

### Pattern 4: Conformance Testing Loop

**What:** Periodically run scenarios against both twin and real API, compare responses, flag differences.

**When to use:** Always. Validates behavioral fidelity and detects upstream API drift.

**Trade-offs:**
- **Pro:** Catches when twins diverge from real behavior (API changes, edge cases missed).
- **Pro:** Documents expected behavior as executable scenarios.
- **Con:** Requires real API credentials and rate limit management.

**Example:**
```typescript
// packages/conformance/src/runner.ts
import { describe, it, expect } from 'vitest';
import axios from 'axios';

interface Scenario {
  name: string;
  request: { method: string; url: string; body?: object };
  expect: { status: number; bodyShape: object };
}

export async function runConformanceTest(
  twinBaseUrl: string,
  realBaseUrl: string,
  scenario: Scenario
) {
  const twinResponse = await axios({
    method: scenario.request.method,
    url: `${twinBaseUrl}${scenario.request.url}`,
    data: scenario.request.body
  });

  const realResponse = await axios({
    method: scenario.request.method,
    url: `${realBaseUrl}${scenario.request.url}`,
    data: scenario.request.body
  });

  // Normalize responses (strip timestamps, IDs)
  const normalizedTwin = normalize(twinResponse.data);
  const normalizedReal = normalize(realResponse.data);

  if (JSON.stringify(normalizedTwin) !== JSON.stringify(normalizedReal)) {
    throw new ConformanceMismatch(scenario.name, normalizedTwin, normalizedReal);
  }
}

// tests/conformance/shopify-products.test.ts
describe('Shopify Products API conformance', () => {
  it('should match real API for product list query', async () => {
    await runConformanceTest(
      'http://localhost:3001', // Twin
      'https://test-store.myshopify.com', // Real Shopify
      {
        name: 'List products',
        request: {
          method: 'POST',
          url: '/admin/api/2024-01/graphql.json',
          body: { query: '{ products(first: 5) { edges { node { id title } } } }' }
        },
        expect: {
          status: 200,
          bodyShape: { data: { products: { edges: [] } } }
        }
      }
    );
  });
});
```

## Data Flow

### Request Flow (Twin Serving HTTP)

```
[HTTP Request from Sandpiper]
    ↓
[Express Router] → [Middleware: Auth, Validation]
    ↓
[Twin-Specific Route Handler]
    ↓
[State Manager: Query SQLite/Memory]
    ↓
[Response Formatter: Match Real API Shape]
    ↓
[HTTP Response to Sandpiper]
```

### Webhook Flow (Twin Emitting State Changes)

```
[State Change in Twin] (e.g., order created)
    ↓
[Webhook Dispatcher: Enqueue Event]
    ↓
[Background Worker: Dequeue Event]
    ↓
[HTTP POST to Callback URL] → [Retry on Failure]
    ↓
[Success: Log] OR [Max Retries: Move to DLQ]
```

### Conformance Flow (Validation Loop)

```
[Conformance Runner: Load Scenario]
    ↓
[Send Request to Twin] ────┬──── [Send Request to Real API]
    ↓                       │           ↓
[Normalize Twin Response]  │     [Normalize Real Response]
    ↓                       │           ↓
    └───────────────────────┴───────────┘
                    ↓
           [Deep Compare Responses]
                    ↓
    [Match: Pass] OR [Mismatch: Report Drift]
```

### Build/Development Flow

```
[pnpm install] → [Resolve workspace: dependencies]
    ↓
[pnpm build] → [Turborepo: Build packages/ in dependency order]
    ↓
[pnpm dev] → [Run all twins in watch mode]
    ↓
[Docker Build] → [Bundle apps/ with dependencies]
    ↓
[docker-compose up] → [Start twins + Sandpiper for E2E]
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-100 scenarios/min** | Single twin instance, in-memory state, synchronous webhooks |
| **100-1000 scenarios/min** | SQLite persistent state, asynchronous webhook queue, consider twin replicas behind load balancer |
| **1000+ scenarios/min** | Persistent webhook queue (Redis/SQS), separate webhook worker processes, database connection pooling |

### Scaling Priorities

1. **First bottleneck:** Webhook delivery blocking HTTP responses. **Fix:** Move to asynchronous queue pattern (Pattern 3).
2. **Second bottleneck:** SQLite write contention under concurrent requests. **Fix:** Enable WAL mode, consider sharding state by tenant ID, or switch to PostgreSQL.
3. **Third bottleneck:** State reset time between test runs. **Fix:** Use in-memory state for fast tests, snapshot/restore for integration tests.

## Anti-Patterns

### Anti-Pattern 1: Tight Coupling to Sandpiper

**What people do:** Build twins that assume Sandpiper's specific request format, auth headers, or workflow.

**Why it's wrong:** Twins become unusable for other consumers. The whole point is reusable behavioral clones.

**Do this instead:** Twins should replicate the real service's API contract exactly. Sandpiper (or any consumer) swaps base URLs and uses standard OAuth/API keys. No special knowledge of the consumer.

**Example:**
```typescript
// BAD: Twin knows about Sandpiper
router.post('/shopify/products', (req, res) => {
  if (!req.headers['x-sandpiper-tenant']) {
    return res.status(400).json({ error: 'Missing Sandpiper tenant header' });
  }
  // ...
});

// GOOD: Twin replicates Shopify's actual auth
router.post('/admin/api/2024-01/products.json', (req, res) => {
  if (!req.headers['x-shopify-access-token']) {
    return res.status(401).json({ errors: 'Unauthorized' }); // Shopify's error format
  }
  // ...
});
```

### Anti-Pattern 2: Monolithic Twin State

**What people do:** Put all Shopify state (products, orders, customers, inventory) in one giant JSON object or single table.

**Why it's wrong:** Makes schema evolution painful, queries slow, and fixtures hard to reason about.

**Do this instead:** Separate tables/stores per entity, just like the real service would. Use foreign keys/relations where appropriate.

**Example:**
```typescript
// BAD: Single state blob
const shopifyState = {
  products: [...],
  orders: [...],
  customers: [...],
  inventory: [...]
};

// GOOD: Separate stores
ProductStore.init();
OrderStore.init();
CustomerStore.init();
InventoryStore.init();

// Queries become type-safe and focused
const order = await OrderStore.findById(123);
const product = await ProductStore.findById(order.product_id);
```

### Anti-Pattern 3: Over-Engineering State Persistence

**What people do:** Introduce full database migrations, ORM layers, connection pooling for twins handling 10 requests/second.

**Why it's wrong:** Twins are test infrastructure, not production services. Complexity budget should go toward behavioral fidelity, not database architecture.

**Do this instead:** Start with SQLite in-memory (fastest), add persistent SQLite when needed (pragmatic), only consider PostgreSQL if scale demands it (unlikely).

### Anti-Pattern 4: Skipping Conformance Tests

**What people do:** Build twins from API docs, assume they're accurate, ship without validation against real API.

**Why it's wrong:** API docs lie. Edge cases aren't documented. Twins diverge silently from real behavior, undermining trust.

**Do this instead:** Conformance testing is non-negotiable. Run scenarios against both twin and real API, flag differences, iterate until behavioral fidelity is proven. Schedule periodic runs to catch drift.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Sandpiper** | Base URL swap in IntegrationClient | Point Shopify client at `http://shopify-twin:3001` instead of `https://shop.myshopify.com` |
| **Real Shopify** | Conformance tests only | Use Shopify dev store credentials, respect rate limits (2 calls/sec) |
| **Real Slack** | Conformance tests only | Use Slack test workspace, avoid production tokens |
| **CI/CD (GitHub Actions)** | docker-compose.ci.yml | Start twins as services, run E2E tests, tear down |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Twin ↔ Shared Packages** | Direct imports via `workspace:` | Changes in `@dtu/core` instantly reflected in twins during dev |
| **Twin ↔ Webhook Dispatcher** | Event emitter pattern | Twin emits state change, dispatcher handles delivery asynchronously |
| **Twin ↔ State Manager** | Async function calls | State layer exposes `create()`, `findAll()`, `update()`, `delete()` methods |
| **Conformance Harness ↔ Twins** | HTTP client (axios) | Treats twin as black box, sends requests, compares responses |
| **Docker Compose ↔ Twins** | HTTP on internal network | Each twin exposed on separate port (3001 for Shopify, 3002 for Slack) |

## Build Order and Dependencies

### Dependency Graph

```
types (no dependencies)
  ↓
core (depends on: types)
  ↓
state (depends on: types)
  ↓
webhooks (depends on: types)
  ↓
shopify-twin (depends on: core, state, webhooks, types)
slack-twin (depends on: core, state, webhooks, types)
  ↓
conformance (depends on: types, runs against twins)
```

### Recommended Build Order for Roadmap

1. **Phase 1: Shared Infrastructure**
   - Build `packages/types`, `packages/core`, `packages/state` first
   - Establishes architectural foundation without committing to specific twin
   - Allows parallel development of twins afterward

2. **Phase 2: First Twin (Shopify)**
   - Implement `apps/shopify-twin` using shared packages
   - Proves pattern works, surfaces missing shared infrastructure
   - Keep scope minimal: OAuth + Orders API only

3. **Phase 3: Webhook System**
   - Build `packages/webhooks` after Shopify twin needs it
   - Retrofit Shopify twin to emit order webhooks
   - Validates async pattern before Slack twin (which is webhook-heavy)

4. **Phase 4: Conformance Harness**
   - Build `packages/conformance` after Shopify twin stabilizes
   - Run first conformance suite: Shopify Orders API twin vs real dev store
   - Use findings to refine behavioral fidelity

5. **Phase 5: Second Twin (Slack)**
   - Implement `apps/slack-twin` leveraging battle-tested shared packages
   - Should be faster than Shopify since infrastructure exists
   - Validates that shared packages are truly reusable, not Shopify-specific

6. **Phase 6: Docker Integration**
   - Write `docker-compose.yml` and `docker-compose.ci.yml`
   - Wire twins into Sandpiper's E2E test suite
   - Validate base URL swap works end-to-end

## Key Architectural Decisions

### Monorepo Tool: pnpm Workspaces

**Rationale:** [pnpm workspaces](https://pnpm.io/workspaces) provide package isolation (no hoisting), fast installs (content-addressable store), and `workspace:` protocol for local dependencies. Lighter than Nx/Lerna, sufficient for this project.

**Alternative considered:** Turborepo for task caching and parallelization. **Verdict:** Add if build times become painful, but start with pnpm for simplicity.

### State Layer: SQLite with better-sqlite3

**Rationale:** [SQLite for testing](https://oneuptime.com/blog/post/2026-02-02-sqlite-testing/view) provides fast in-memory mode, persistent file mode for debugging, and no external dependencies. `better-sqlite3` is synchronous, simpler than async drivers.

**Alternative considered:** PostgreSQL for production-like fidelity. **Verdict:** Overkill. Twins are test infrastructure, not production systems. SQLite pragmas (WAL mode) handle concurrency.

### Webhook Delivery: Custom Queue + Worker

**Rationale:** [Webhook system design patterns](https://www.systemdesignhandbook.com/guides/design-a-webhook-system/) recommend decoupled pipeline with queue, retry logic, and DLQ. Building custom avoids Redis/SQS dependency for twins.

**Alternative considered:** Third-party webhook service (Hookdeck, Svix). **Verdict:** Unnecessary external dependency for deterministic test infrastructure.

### Conformance Testing: Scenario-Based Validation

**Rationale:** [StrongDM's DTU approach](https://factory.strongdm.ai/techniques/dtu) validates twins against real APIs until behavioral differences disappear. Scenario-based tests document expected behavior and catch drift.

**Alternative considered:** Generative testing (fuzzing). **Verdict:** Too much surface area. Targeted scenarios based on Sandpiper's actual usage patterns are more pragmatic.

## Sources

### High Confidence (Official Docs, Direct Examples)
- [pnpm Workspaces](https://pnpm.io/workspaces) — Workspace organization patterns
- [Monorepo Tools](https://monorepo.tools/) — Monorepo conceptual patterns
- [StrongDM Digital Twin Universe](https://factory.strongdm.ai/techniques/dtu) — Behavioral clone architecture
- [SQLite Testing Guide](https://oneuptime.com/blog/post/2026-02-02-sqlite-testing/view) — State management patterns
- [Webhook System Design Handbook](https://www.systemdesignhandbook.com/guides/design-a-webhook-system/) — Webhook delivery architecture

### Medium Confidence (Community Best Practices, Recent Articles)
- [Monorepo Architecture Guide 2025](https://feature-sliced.design/blog/frontend-monorepo-explained) — Monorepo structure
- [Turborepo Enterprise Guide 2026](https://www.askantech.com/monorepo-with-turborepo-enterprise-code-management-guide-2026/) — Build system patterns
- [Docker Compose Integration Testing 2025](https://medium.com/@alexandre.therrien3/docker-compose-for-integration-testing-a-practical-guide-for-any-project-49b361a52f8c) — Docker orchestration
- [Webhook Delivery with Retry Logic](https://oneuptime.com/blog/post/2026-01-25-webhook-service-retry-logic-nodejs/view) — Retry patterns
- [GraphQL Code Generation](https://www.apollographql.com/tutorials/intro-typescript/09-codegen) — Type generation from schemas

### Low Confidence (Single Sources, Needs Validation)
- [Mocking in Monorepos](https://medium.com/lumapps-engineering/mocking-a-monorepo-a5c208e3dd65) — Monorepo mocking patterns
- [TypeScript Monorepo Quest](https://thijs-koerselman.medium.com/my-quest-for-the-perfect-ts-monorepo-62653d3047eb) — Personal monorepo experience

---
*Architecture research for: Sandpiper DTU (Digital Twin Universe)*
*Researched: 2026-02-27*
