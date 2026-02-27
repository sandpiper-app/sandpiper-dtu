# Roadmap: Sandpiper DTU

**Project:** Sandpiper DTU (Digital Twin Universe)
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.
**Created:** 2026-02-27
**Depth:** Comprehensive

## Phases

- [ ] **Phase 1: Foundation & Monorepo Setup** - Establish architectural foundation and shared infrastructure
- [ ] **Phase 2: Shopify Twin - Core Operations** - First twin with GraphQL Admin API, OAuth, and basic webhooks
- [ ] **Phase 3: Webhook System & Conformance Framework** - Production-grade async webhook delivery and behavioral validation
- [ ] **Phase 4: Shopify Twin - Advanced Features** - Query cost calculation, pagination, stateful order lifecycle
- [ ] **Phase 5: Slack Twin - Web API & Events** - Second major twin with REST API, events, Block Kit validation
- [ ] **Phase 6: Twin UIs** - Web interfaces for state inspection and manual testing
- [ ] **Phase 7: Integration & E2E Testing** - Docker Compose orchestration and Sandpiper integration

## Phase Details

### Phase 1: Foundation & Monorepo Setup
**Goal**: Shared infrastructure and architectural foundation ready for twin development
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-07, INFRA-08, INFRA-09
**Success Criteria** (what must be TRUE):
  1. Developer can run `pnpm install` and all shared packages build successfully
  2. Developer can create new twin app that imports `@dtu/core`, `@dtu/state`, `@dtu/types` with full TypeScript support
  3. Any twin can persist state to SQLite and reset to empty state in under 100ms
  4. Any twin returns 200 from `/health` endpoint when initialized
  5. Logs from any twin include correlation IDs and structured JSON format for debugging
**Plans**: 2 plans in 2 waves

Plans:
- [ ] 01-01-PLAN.md — Initialize monorepo structure and shared package foundations
- [ ] 01-02-PLAN.md — Implement state management and example twin validation

### Phase 2: Shopify Twin - Core Operations
**Goal**: Shopify twin handles OAuth and core GraphQL operations with stateful behavior
**Depends on**: Phase 1
**Requirements**: SHOP-01, SHOP-02, SHOP-03, SHOP-07, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Developer can exchange authorization code for access token via OAuth flow
  2. Developer can query orders via GraphQL using valid access token
  3. Developer can create order via GraphQL mutation and immediately query it back
  4. Developer can update existing order and observe state changes
  5. Developer receives webhook POST at callback URL when order is created or updated
  6. Developer can trigger 401, 403, 429, 500, 503, timeout responses via admin API configuration
  7. Developer can reset all Shopify twin state via `POST /admin/reset` and load fixtures via `POST /admin/fixtures/load`
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 02-01-PLAN.md — Shopify twin foundation with OAuth, admin API, and StateManager extensions
- [ ] 02-02-PLAN.md — GraphQL schema, resolvers, and Yoga integration with token validation
- [ ] 02-03-PLAN.md — Webhook delivery, error simulation, and integration tests

### Phase 3: Webhook System & Conformance Framework
**Goal**: Production-grade webhook delivery and automated behavioral validation against real APIs
**Depends on**: Phase 2
**Requirements**: INFRA-05, INFRA-06
**Success Criteria** (what must be TRUE):
  1. Webhooks deliver asynchronously via background queue with exponential backoff (immediate, 1min, 5min)
  2. Failed webhook delivery after retries goes to dead letter queue for inspection
  3. Developer can run conformance suite against both Shopify twin and real Shopify dev store with single command
  4. Conformance suite reports behavioral differences (response mismatches, missing fields, incorrect error codes)
  5. CI runs conformance suites on schedule to detect upstream API drift
**Plans**: TBD

### Phase 4: Shopify Twin - Advanced Features
**Goal**: Shopify twin handles complex features like query cost, pagination, and order lifecycle
**Depends on**: Phase 3
**Requirements**: SHOP-04, SHOP-05, SHOP-06
**Success Criteria** (what must be TRUE):
  1. Developer submits high-cost GraphQL query and receives 429 response with Retry-After header
  2. Developer queries paginated results with cursors and receives deterministic, stable ordering across runs
  3. Developer creates order, fulfills it, and observes realistic state transitions (pending → fulfilled → closed)
  4. Order fulfillment triggers `fulfillments/create` webhook delivery
  5. Invalid state transitions (fulfill already-fulfilled order) return appropriate GraphQL errors
**Plans**: TBD

### Phase 5: Slack Twin - Web API & Events
**Goal**: Slack twin replicates Web API, Events API, OAuth, and Block Kit interactions
**Depends on**: Phase 3
**Requirements**: SLCK-01, SLCK-02, SLCK-03, SLCK-04, SLCK-05, SLCK-06
**Success Criteria** (what must be TRUE):
  1. Developer completes OAuth workspace installation flow and receives bot token
  2. Developer posts message via `chat.postMessage` with Block Kit blocks and message appears in channel
  3. Developer queries conversation history and receives previously posted messages
  4. Developer posts message and receives Events API webhook (message event) at configured callback URL
  5. Developer clicks button in Block Kit message and twin delivers interaction payload to response URL
  6. Developer submits message with 51 blocks and receives validation error (50-block limit)
  7. Developer makes rapid API calls and receives 429 response with tier-appropriate rate limit
  8. Twin passes Bolt-style url_verification challenge on Events API endpoint
**Plans**: TBD

### Phase 6: Twin UIs
**Goal**: Web interfaces enable manual state inspection and testing without API calls
**Depends on**: Phase 4, Phase 5
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Developer opens Shopify twin UI in browser and sees list of orders, products, customers
  2. Developer creates new order via Shopify UI form and order appears in GraphQL queries
  3. Developer edits existing product via Shopify UI and changes persist to twin state
  4. Developer opens Slack twin UI and sees channel list, message timeline, user list
  5. Developer creates channel via Slack UI and channel appears in `conversations.list` API responses
  6. Both UIs share consistent visual styling and reusable list/detail/form components
**Plans**: TBD

### Phase 7: Integration & E2E Testing
**Goal**: Twins integrate with Sandpiper via Docker Compose and base URL swap for E2E testing
**Depends on**: Phase 6
**Requirements**: INTG-01, INTG-02, INTG-03
**Success Criteria** (what must be TRUE):
  1. Developer sets Sandpiper environment variables to point IntegrationClient at twin URLs instead of real APIs
  2. Sandpiper integration tests run successfully against Shopify twin and Slack twin
  3. Developer runs `docker compose -f docker-compose.twin.yml up` and all twins start with health checks passing
  4. Sandpiper container communicates with twin containers via Docker network
  5. CI pipeline runs Sandpiper E2E tests against twins without requiring sandbox API credentials
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Monorepo Setup | 0/2 | Not started | - |
| 2. Shopify Twin - Core Operations | 0/3 | Not started | - |
| 3. Webhook System & Conformance Framework | 0/? | Not started | - |
| 4. Shopify Twin - Advanced Features | 0/? | Not started | - |
| 5. Slack Twin - Web API & Events | 0/? | Not started | - |
| 6. Twin UIs | 0/? | Not started | - |
| 7. Integration & E2E Testing | 0/? | Not started | - |

## Dependencies

```
Phase 1 (Foundation)
  ↓
Phase 2 (Shopify Core) ──→ Phase 3 (Webhooks/Conformance)
                              ↓
                            Phase 4 (Shopify Advanced)
                              ↓                    ↓
                            Phase 5 (Slack) ──→ Phase 6 (UIs)
                                                   ↓
                                                Phase 7 (Integration)
```

**Rationale:**
- Phase 1 must complete before any twin development (provides shared infrastructure)
- Phase 2 creates first twin using Phase 1 infrastructure
- Phase 3 upgrades webhook delivery and adds conformance validation (needs Phase 2 twin to validate against)
- Phase 4 extends Shopify twin after conformance validates approach works
- Phase 5 builds Slack twin using battle-tested infrastructure from Phase 3
- Phase 6 adds UIs after both twins are feature-complete (needs stable APIs)
- Phase 7 integrates twins with Sandpiper after UIs prove twins work independently

---
*Last updated: 2026-02-27 after Phase 2 planning*
