# Roadmap: Sandpiper DTU

**Project:** Sandpiper DTU (Digital Twin Universe)
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.
**Created:** 2026-02-27
**Depth:** Comprehensive

## Phases

- [x] **Phase 1: Foundation & Monorepo Setup** - Establish architectural foundation and shared infrastructure (completed 2026-02-27)
- [x] **Phase 2: Shopify Twin - Core Operations** - First twin with GraphQL Admin API, OAuth, and basic webhooks (completed 2026-02-27)
- [x] **Phase 3: Webhook System & Conformance Framework** - Production-grade async webhook delivery and behavioral validation (completed 2026-02-28)
- [x] **Phase 4: Shopify Twin - Advanced Features** - Query cost calculation, pagination, stateful order lifecycle (completed 2026-02-28)
- [x] **Phase 5: Slack Twin - Web API & Events** - Second major twin with REST API, events, Block Kit validation (completed 2026-02-28)
- [x] **Phase 6: Twin UIs** - Web interfaces for state inspection and manual testing (completed 2026-02-28)
- [x] **Phase 7: Integration & E2E Testing** - Docker Compose orchestration and Sandpiper integration
- [x] **Phase 8: CI & Integration Polish** - Slack conformance in CI, @dtu/core cleanup, Slack error config API, docs fixes (completed 2026-03-01)
- [x] **Phase 9: Code Quality Cleanup** - Logging fixes, StateManager method gaps, flaky test fix (completed 2026-02-28)
- [x] **Phase 10: Tech Debt Cleanup** - Wire up InventoryItem, Slack live conformance CI, tsconfig fixes, Dockerfile fixes, ROADMAP staleness (completed 2026-03-01)
- [x] **Phase 11: Final Polish** - Shopify /admin/errors endpoint, tsconfig fixes, SUMMARY frontmatter backfill (completed 2026-03-01)
- [ ] **Phase 12: Manual Verification** - Automated HMAC e2e test, webhook timing assertion, UI verification script

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
**Plans**: 5 plans in 2 waves

Plans:
- [ ] 02-01-PLAN.md — Shopify twin foundation with OAuth, admin API, and StateManager extensions
- [ ] 02-02-PLAN.md — GraphQL schema, resolvers, and Yoga integration with token validation
- [ ] 02-03-PLAN.md — Webhook delivery, error simulation, and integration tests
- [ ] 02-04-PLAN.md — Fix fixtures endpoint GID generation (gap closure)
- [ ] 02-05-PLAN.md — Add productUpdate and fulfillmentCreate mutations with webhooks (gap closure)

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
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 03-01-PLAN.md — Create @dtu/webhooks shared package with async queue, retry/backoff, and dead letter store
- [ ] 03-02-PLAN.md — Create @dtu/conformance shared package with runner, adapter interface, comparator, and CLI
- [ ] 03-03-PLAN.md — Integrate webhooks into Shopify twin, create conformance suites, and set up CI

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
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 04-01-PLAN.md — Query cost calculator and leaky bucket rate limiting
- [ ] 04-02-PLAN.md — Cursor-based pagination across all connections
- [ ] 04-03-PLAN.md — Order lifecycle state machine with orderClose mutation

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
**Plans**: 3 plans in 3 waves

Plans:
- [x] 05-01-PLAN.md — Slack twin foundation: package, SlackStateManager, buildApp, health/admin/OAuth plugins
- [x] 05-02-PLAN.md — Web API methods, token auth, Block Kit validation, tier-based rate limiting
- [x] 05-03-PLAN.md — Events API delivery, url_verification, Block Kit interactions, response URLs, integration tests

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
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 06-01-PLAN.md — Shared @dtu/ui package with Eta partials, Pico CSS, and Fastify helpers
- [ ] 06-02-PLAN.md — Shopify twin UI with orders, products, customers CRUD and admin
- [ ] 06-03-PLAN.md — Slack twin UI with channels, message timeline, users CRUD and admin

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
**Plans**: 2 plans in 2 waves

Plans:
- [x] 07-01-PLAN.md — Docker images for both twins, healthcheck script, integration smoke tests
- [x] 07-02-PLAN.md — Docker Compose orchestration and GitHub Actions E2E workflow

### Phase 8: CI & Integration Polish
**Goal**: Close integration gaps from v1.0 audit — Slack conformance in CI, dead code cleanup, missing API surface, documentation fixes
**Depends on**: Phase 7
**Requirements**: INFRA-06, INFRA-09 (integration polish)
**Gap Closure:** Closes integration gaps from v1.0 audit
**Success Criteria** (what must be TRUE):
  1. Slack conformance suite runs in `conformance.yml` CI workflow alongside Shopify conformance
  2. `conformance-offline` CI job renamed to accurately reflect what it does (twin-mode)
  3. `@dtu/core` either provides runtime value to consumers or is removed as a dependency
  4. Slack twin exposes `/admin/errors/*` API surface matching its error config DB schema
  5. Phase 5 SUMMARY frontmatter includes `requirements_completed` for SLCK-02, SLCK-04, SLCK-05, SLCK-06

Plans:
- [ ] 08-01-PLAN.md — CI workflow fixes, @dtu/core cleanup, Slack error config API, frontmatter fixes

### Phase 9: Code Quality Cleanup
**Goal**: Resolve accumulated code quality tech debt — logging, StateManager gaps, test reliability
**Depends on**: Phase 7
**Requirements**: None (tech debt cleanup)
**Gap Closure:** Closes tech debt items from v1.0 audit
**Success Criteria** (what must be TRUE):
  1. webhook-sender.ts uses `fastify.log` instead of `console.error` for failure logging
  2. Shopify StateManager has `updateCustomer` method and UI uses it instead of direct SQL
  3. Slack StateManager has `updateUser` method and UI uses it instead of direct SQL
  4. DLQ timing test is reliable (no race condition flakiness)

Plans:
- [x] 09-01-PLAN.md — Logging fix, StateManager methods, flaky test fix

### Phase 10: Tech Debt Cleanup
**Goal**: Resolve all remaining tech debt from v1.0 audit — wire up orphaned InventoryItem, CI coverage, build config, Docker fixes
**Depends on**: Phase 9
**Requirements**: SHOP-01 (InventoryItem wiring), INFRA-06 (Slack live conformance CI)
**Gap Closure:** Closes all tech debt items from v1.0 re-audit
**Success Criteria** (what must be TRUE):
  1. InventoryItem is queryable via GraphQL QueryRoot field and has StateManager CRUD methods (research Shopify API docs to replicate fully — may require UI changes)
  2. Slack live conformance runs on CI schedule alongside Shopify conformance
  3. `@dtu/ui` has path aliases in `tsconfig.base.json` and twin tsconfig references for `tsc --build` incremental support
  4. Slack Dockerfile exposes correct port (3001) and comments reference only existing packages
  5. ROADMAP.md Phase 7 entry reflects actual completion status

**Plans**: 2 plans in 1 wave

Plans:
- [ ] 10-01-PLAN.md — Wire up InventoryItem: StateManager CRUD, GraphQL schema/resolvers, admin fixtures, UI views
- [ ] 10-02-PLAN.md — Slack live conformance CI, tsconfig @dtu/ui paths, Dockerfile EXPOSE fix, ROADMAP staleness

### Phase 11: Final Polish
**Goal**: Close all remaining integration and documentation tech debt from v1.0 audit
**Depends on**: Phase 10
**Requirements**: None (tech debt closure — all requirements already satisfied)
**Gap Closure:** Closes integration and documentation tech debt from v1.0 final audit
**Success Criteria** (what must be TRUE):
  1. Shopify twin exposes `GET /admin/errors`, `GET /admin/errors/:operation`, matching Slack twin's error inspection API
  2. `twins/shopify/tsconfig.conformance.json` has no reference to deleted `@dtu/core` package
  3. `twins/slack/tsconfig.json` includes `@dtu/conformance` project reference (matching Shopify)
  4. All 28 phase SUMMARY.md files include `requirements_completed` in frontmatter
**Plans**: 1 plan in 1 wave

Plans:
- [ ] 11-01-PLAN.md — Shopify /admin/errors endpoint, tsconfig fixes, SUMMARY frontmatter backfill

### Phase 12: Manual Verification
**Goal**: Validate human-observable behaviors through automated tests and verification scripts
**Depends on**: Phase 11
**Requirements**: None (verification of existing functionality)
**Gap Closure:** Closes human verification items from v1.0 final audit
**Success Criteria** (what must be TRUE):
  1. Automated test verifies HMAC webhook signature end-to-end (sign → deliver → verify)
  2. Automated test asserts async webhook delivery timing (queued → delivered within expected window)
  3. UI verification script confirms Shopify layout and Slack message timeline render correctly
  4. All verification results documented in VERIFICATION.md

Plans:
- [ ] 12-01-PLAN.md — HMAC e2e test, webhook timing assertion, UI verification script

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Monorepo Setup | 2/2 | Complete | 2026-02-27 |
| 2. Shopify Twin - Core Operations | 5/5 | Complete | 2026-02-27 |
| 3. Webhook System & Conformance Framework | 3/3 | Complete    | 2026-02-28 |
| 4. Shopify Twin - Advanced Features | 3/3 | Complete    | 2026-02-28 |
| 5. Slack Twin - Web API & Events | 3/3 | Complete | 2026-02-28 |
| 6. Twin UIs | 6/6 | Complete   | 2026-02-28 |
| 7. Integration & E2E Testing | 2/2 | Complete | 2026-03-01 |
| 8. CI & Integration Polish | 1/1 | Complete   | 2026-03-01 |
| 9. Code Quality Cleanup | 1/1 | Complete | 2026-02-28 |
| 10. Tech Debt Cleanup | 2/2 | Complete    | 2026-03-01 |
| 11. Final Polish | 1/1 | Complete    | 2026-03-01 |
| 12. Manual Verification | 0/1 | Pending | — |

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
                                                   ↓
                                          Phase 8 (CI Polish)
                                          Phase 9 (Code Quality)
                                                   ↓
                                          Phase 10 (Tech Debt)
                                                   ↓
                                          Phase 11 (Final Polish)
                                                   ↓
                                          Phase 12 (Manual Verification)
```

**Rationale:**
- Phase 1 must complete before any twin development (provides shared infrastructure)
- Phase 2 creates first twin using Phase 1 infrastructure
- Phase 3 upgrades webhook delivery and adds conformance validation (needs Phase 2 twin to validate against)
- Phase 4 extends Shopify twin after conformance validates approach works
- Phase 5 builds Slack twin using battle-tested infrastructure from Phase 3
- Phase 6 adds UIs after both twins are feature-complete (needs stable APIs)
- Phase 7 integrates twins with Sandpiper after UIs prove twins work independently
- Phase 8 polishes CI and integration wiring identified by v1.0 audit
- Phase 9 resolves code quality tech debt identified by v1.0 audit
- Phase 10 resolves remaining tech debt from v1.0 re-audit (InventoryItem, CI, build config, Docker)
- Phase 11 closes final integration and documentation polish from v1.0 final audit
- Phase 12 validates human-observable behaviors (HMAC, webhook timing, UI) with automated tests

---
*Last updated: 2026-03-01 after gap closure phases 11-12 added from v1.0 final audit*
