# Project Research Summary

**Project:** Sandpiper DTU (Digital Twin Universe)
**Domain:** High-fidelity API simulators/twins for third-party service testing
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Executive Summary

Sandpiper DTU is an API twin/simulator system designed to replicate the behavioral contracts of third-party services (Shopify, Slack) for testing without relying on real APIs. Experts build these systems as monorepo architectures with shared infrastructure libraries and per-service twin applications, focusing on **behavioral fidelity at the API boundary** rather than reimplementing internal service logic. The recommended approach is TypeScript-first with Fastify (performance), GraphQL Yoga (Shopify), better-sqlite3 (state persistence), and BullMQ (webhook delivery), deployed via Docker Compose for CI/E2E integration.

The critical success factor is **conformance testing** — periodically running identical test scenarios against both twins and real sandbox APIs to validate behavioral equivalence and detect drift. Without this, twins become technical debt as real APIs evolve. The recommended stack emphasizes modern, TypeScript-native tooling (Fastify over Express, Vitest over Jest, Zod over Joi) because type safety prevents common twin implementation errors and schema changes are caught at compile time rather than runtime.

Key risks include the "Fidelity Trap" (over-simulating implementation details vs under-simulating edge cases), state management issues causing flaky tests, and twin-API drift over time. Mitigation requires: (1) building from API contracts only, (2) implementing asynchronous webhook delivery with retry logic, (3) automated conformance test suites running against real APIs, and (4) proper state reset mechanisms between test runs.

## Key Findings

### Recommended Stack

**Core decision: Fastify over Express** for TypeScript-first development with native schema validation and 10x performance (77K req/s). While Express is familiar to the Sandpiper team, Fastify's built-in Zod integration and type safety align perfectly with API twin requirements where request/response contracts must match real services exactly.

**Core technologies:**
- **Fastify 5.x**: HTTP framework — TypeScript-native with schema-based validation, 10x faster than Express, efficient Pino logging
- **GraphQL Yoga 5.x**: GraphQL server for Shopify twin — built-in subscriptions, zero-config TypeScript, lighter than Apollo Server
- **better-sqlite3 12.x**: State persistence — synchronous API (simpler for test data), 11-24x faster than alternatives, zero dependencies, easy reset
- **Zod**: Schema validation — TypeScript-first with automatic type inference, doubles as type definitions (no duplication)
- **BullMQ 5.x**: Webhook queue with retry — Redis-backed distributed queue, TypeScript-native, exponential backoff/rate limiting/deduplication
- **Vitest 4.x**: Test runner — TypeScript/ESM native, 4x faster cold start than Jest, 10-20x faster watch mode
- **pnpm workspaces + Turborepo**: Monorepo tooling — fastest install, strict dependency isolation, intelligent build caching

**Critical version requirements:**
- Node.js 20.6+ (for Fastify 5.x ESM support)
- GraphQL 16.x (required by Yoga 5)
- Redis 6.2+ (for BullMQ advanced features)

**Alternative considered:** Express + Jest + npm workspaces for team familiarity. **Verdict:** TypeScript fidelity matters more than familiarity for twins where contract accuracy is critical.

### Expected Features

**Must have (table stakes) — MVP blockers:**
- **Request/response matching** — URL patterns, headers, query params, body content (WireMock/Mockoon standard)
- **Stateful behavior** — Create order → query order workflows with `.reset()`, `.set()`, `.get()` APIs
- **Error simulation** — 4xx/5xx responses, timeouts, malformed data (critical for retry logic testing)
- **Dynamic responses** — Variable timestamps, IDs, randomized values (Handlebars/template patterns)
- **State reset between tests** — Wipe state for test isolation (prevents "generous leftovers" anti-pattern)
- **Webhook delivery** — Active POST to callback URLs on state changes (rare in general tools, critical for Shopify/Slack)
- **Authentication/OAuth flows** — Token exchange, validation, expiry simulation (blocks all API operations)
- **Rate limiting simulation** — 429 + Retry-After headers (tests backoff strategies)

**Should have (competitive advantage) — v1.x additions:**
- **Conformance testing against real APIs** — Validates twin doesn't drift from real service, catches upstream changes
- **GraphQL-specific features** — Query cost calculation, schema validation, resolver mocking (Shopify requirement)
- **Webhook retry logic** — Exponential backoff matching real Shopify/Slack behavior
- **Scenario-based test fixtures** — Pre-configured data sets for common workflows (accelerates test authoring)
- **CI/CD integration primitives** — Docker Compose overlays, health checks, environment variables

**Defer (v2+) — nice-to-have:**
- **Multi-version API support** — Shopify 2026-01 vs 2026-04 (useful for upgrade testing, not blocking)
- **Chaos engineering** — Packet loss, partial responses, cascading failures
- **Request recording/playback** — Capture real API traffic, replay as fixtures
- **Extensibility/plugin system** — Custom matchers, transformers (premature until patterns emerge)

**Anti-features to avoid:**
- **Full API coverage** — Sandpiper uses ~10-15% of Shopify API surface, build from actual usage not full schema
- **Perfect real-time fidelity** — Impossible goal, APIs have undocumented quirks, focus on tested scenarios
- **GUI for twin management** — Code-first configuration via TypeScript, not dashboards
- **Shared/remote twin state** — Defeats determinism, use isolated state per instance

### Architecture Approach

**Monorepo pattern:** Separate `apps/` (deployable twins) from `packages/` (shared infrastructure). Each twin is self-contained with its own Dockerfile, routes, logic, and state schema. Shared packages extract common concerns (HTTP framework, state management, webhook delivery, conformance testing) into reusable libraries. Use pnpm workspace protocol (`workspace:@dtu/core`) for instant change propagation without publishing.

**Major components:**
1. **Twin Services** (`apps/shopify-twin`, `apps/slack-twin`) — HTTP endpoints, business logic specific to one third-party service, GraphQL/REST routes
2. **Shared Core** (`packages/core`) — Express/Fastify app factory, middleware (auth, logging, CORS), OAuth flows, Zod validation
3. **State Manager** (`packages/state`) — SQLite/in-memory store with query layer, migrations, fixtures, type-safe CRUD operations
4. **Webhook Dispatcher** (`packages/webhooks`) — Queue management, worker pool, exponential backoff, circuit breaker, dead letter queue
5. **Conformance Harness** (`packages/conformance`) — Test orchestration, scenario definitions, response comparison/normalization, drift reporting

**Key patterns:**
- **Behavioral Clone at the Boundary**: Replicate behavior at API boundary (HTTP request/response) without reimplementing internal service logic. Validated against real API until behavioral differences disappear.
- **Layered State Management**: Separate persistence (SQLite/memory) from access (query layer) from schema (migrations/fixtures). Allows swapping storage without changing twin logic.
- **Asynchronous Webhook Delivery**: Decouple webhook emission from HTTP response. Queue events, deliver async with retry/backoff. Realistic simulation of timing and failures.
- **Conformance Testing Loop**: Periodically run scenarios against both twin and real API, compare responses, flag differences. Catches drift and validates fidelity.

**Build order for roadmap:**
1. Shared infrastructure first (types, core, state)
2. First twin (Shopify) using shared packages
3. Webhook system after Shopify needs it
4. Conformance harness after Shopify stabilizes
5. Second twin (Slack) leveraging battle-tested infrastructure
6. Docker integration for E2E

### Critical Pitfalls

1. **The Fidelity Trap (Over-Simulation)** — Teams replicate internal implementation details (database schemas, business logic) instead of external behavioral contracts. **Avoid:** Build from API contracts only (GraphQL schemas, OpenAPI specs), never look at real service source code, validate against real sandbox APIs not assumptions.

2. **The Fidelity Trap (Under-Simulation)** — Twins handle happy path but miss edge cases: rate limiting, pagination boundaries, partial failures, auth token expiry, webhook retry logic. **Avoid:** Build conformance suites targeting edge cases, mine community sources (Stack Overflow, GitHub issues), simulate 429s/timeouts/errors from the start.

3. **State Management — Shared State Between Tests** — Tests create data that persists across runs, causing flaky order-dependent failures ("Generous Leftovers" anti-pattern). **Avoid:** Implement reset endpoints, use transaction rollback, spin up isolated instances per test, use `:memory:` SQLite or delete DB files between runs.

4. **Conformance Testing Gaps** — Tests verify twin internal logic instead of comparing twin vs real API behavior ("Conjoined Twins" anti-pattern). **Avoid:** Dual-mode conformance tests (same test runs against twin and real sandbox, compares responses), periodic validation weekly/monthly, never write twin-only tests.

5. **Webhook Delivery — Unreliable Simulation** — Twin delivers webhooks synchronously with 100% reliability, but real APIs deliver async with retry/delays/failures. **Avoid:** Deliver webhooks via background queue, implement retry sequences (immediate → 1min → 5min), support idempotency testing, simulate network failures.

6. **Maintenance Burden — Twin-API Drift** — Real APIs evolve but twins don't keep pace, drift silently from reality. **Avoid:** Automated conformance runs against real sandbox APIs, specification-based generation from OpenAPI/GraphQL schemas, monitor API changelogs/release notes, version tracking.

7. **Shopify-Specific: Bulk Operations Failures** — Complex state machines (CREATED → RUNNING → COMPLETED), 10-day timeouts, webhook delivery on completion, partial failures. **Avoid:** Simulate full state machine, deliver `bulk_operations/finish` webhook, support offline tokens (online expire in 24h), realistic timing not instant.

8. **Slack-Specific: Block Kit Validation Gaps** — Strict validation rules (50-block limit in messages, 100 in modals, surface-specific compatibility). **Avoid:** Enforce block count limits, validate surface compatibility, check required fields, return meaningful validation errors matching Slack.

9. **Slack-Specific: Event Ordering Assumptions** — Tests assume in-order immediate delivery, but Slack has no ordering guarantees, potential 2+ hour delays, retry sequences. **Avoid:** Deliver events async with configurable delays, support out-of-order delivery simulation, add timestamps for ordering logic.

10. **OAuth Scope Drift** — Twin accepts tokens without validating scopes or uses outdated scope lists. **Avoid:** Validate scopes per endpoint (return 403 if missing), use scope lists from official docs not hardcoded assumptions, test insufficient scope scenarios.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Monorepo Setup
**Rationale:** Establish architectural foundation and shared infrastructure before committing to specific twins. Allows parallel twin development afterward and prevents rework when patterns emerge.

**Delivers:**
- Monorepo structure (pnpm workspaces + Turborepo)
- Shared packages: `@dtu/types`, `@dtu/core` (HTTP framework), `@dtu/state` (SQLite manager)
- Development tooling (TypeScript config, ESLint, Vitest setup)
- Docker base images and compose skeleton

**Addresses:**
- Prevents Pitfall #3 (state management) by designing reset/isolation strategy upfront
- Prevents Pitfall #1 (over-simulation) by establishing "behavioral contract only" principle
- Establishes stack choices (Fastify, Zod, better-sqlite3) from STACK.md

**Avoids:**
- Jumping into twin implementation without shared infrastructure (causes duplication)
- Tight coupling to Sandpiper (twins should replicate real service contracts exactly)

**Research flag:** Standard patterns, skip `/gsd:research-phase` (monorepo architecture well-documented)

---

### Phase 2: Shopify Twin — Core Operations (MVP)
**Rationale:** First twin validates the pattern works and surfaces missing shared infrastructure. Shopify chosen over Slack because GraphQL complexity is higher (proves pattern handles hardest case first). Keep scope minimal: OAuth + Orders API only.

**Delivers:**
- `apps/shopify-twin` with GraphQL Admin API (orders subset)
- OAuth token exchange and validation
- Stateful behavior: create order → query order → update order
- Error simulation (401, 429, 500, timeouts)
- Basic webhook delivery (orders/create, orders/update)
- State reset API (`POST /admin/reset`)

**Uses:**
- GraphQL Yoga 5.x for GraphQL server
- @graphql-codegen/cli for type generation from Shopify schema
- `@dtu/core` for HTTP framework and OAuth flows
- `@dtu/state` for SQLite persistence

**Implements:**
- Twin Service component (apps/ pattern)
- Behavioral Clone at Boundary pattern
- Layered State Management pattern

**Addresses:**
- Must-have features: request/response matching, stateful behavior, OAuth, webhooks, error simulation
- Pitfall #7: Shopify bulk operations (defer to Phase 4, start with simple mutations)

**Avoids:**
- Full Shopify API coverage (anti-feature) — only orders subset Sandpiper uses
- Synchronous webhook delivery (Pitfall #5) — build async queue from start

**Research flag:** **NEEDS RESEARCH** — Shopify GraphQL Admin API specifics (query cost calculation, webhook payload formats, OAuth scope requirements). Use `/gsd:research-phase` before implementation.

---

### Phase 3: Webhook System & Conformance Framework
**Rationale:** Shopify twin needs async webhook delivery (Phase 2 builds basic version, this upgrades it). Conformance harness validates Shopify twin before building Slack twin. Both are infrastructure improvements that benefit all future twins.

**Delivers:**
- `packages/webhooks` with BullMQ queue, retry logic, exponential backoff, DLQ
- `packages/conformance` with scenario runner, response differ, drift reporter
- Conformance test suite: Shopify Orders API twin vs real Shopify dev store
- Retrofit Shopify twin to use production webhook system

**Uses:**
- BullMQ + ioredis for distributed queue
- Vitest + axios for conformance test harness
- Mockttp for HTTP interception testing

**Implements:**
- Webhook Dispatcher component
- Conformance Harness component
- Asynchronous Webhook Delivery pattern
- Conformance Testing Loop pattern

**Addresses:**
- Should-have features: conformance testing, webhook retry logic
- Pitfall #4: Conformance testing gaps (dual-mode tests from start)
- Pitfall #5: Unreliable webhook delivery (async queue with retry)
- Pitfall #6: Twin-API drift (periodic conformance runs)

**Avoids:**
- Building Slack twin before validating Shopify pattern works
- Manual conformance checks (automate from start)

**Research flag:** Standard patterns (webhook retry logic, conformance testing are well-documented), skip `/gsd:research-phase`

---

### Phase 4: Shopify Twin — Advanced Features
**Rationale:** After Shopify basics work and conformance validates fidelity, add complex features that Sandpiper needs: bulk operations, GraphQL query cost calculation, multi-resource support.

**Delivers:**
- Bulk operations state machine (CREATED → RUNNING → COMPLETED/FAILED)
- `bulk_operations/finish` webhook delivery
- GraphQL query cost calculation and rate limiting
- Expanded GraphQL schema: products, customers, inventory, fulfillments
- Multi-version API support (2026-01, 2026-04)

**Addresses:**
- Pitfall #7: Bulk operations failures (full state machine with webhooks)
- Pitfall #2: Under-simulated edge cases (pagination, rate limiting, partial failures)
- Should-have features: GraphQL query cost, scenario-based fixtures

**Avoids:**
- Instant bulk operations (simulate realistic timing with configurable delays)
- Online tokens for bulk ops (require offline tokens, expire online after 24h)

**Research flag:** **NEEDS RESEARCH** — Shopify bulk operations specifics (state machine transitions, JSONL format, partial failure handling, concurrent operation limits). Use `/gsd:research-phase`.

---

### Phase 5: Slack Twin — Web API & Events
**Rationale:** Second major twin leverages battle-tested shared infrastructure. Validates that `packages/` are truly reusable, not Shopify-specific. Slack is REST-based (simpler than GraphQL) but has complex event delivery and Block Kit requirements.

**Delivers:**
- `apps/slack-twin` with Web API methods (chat.postMessage, conversations.*, users.*)
- Events API delivery (messages, reactions, app_mention)
- OAuth installation flow (workspace/bot tokens)
- Block Kit validation (50-block limit in messages, 100 in modals)
- Rate limiting per endpoint (tier-based limits)

**Uses:**
- Fastify for REST endpoints (not GraphQL Yoga)
- `@dtu/core` for HTTP framework and OAuth
- `@dtu/state` for workspace/channel/user state
- `@dtu/webhooks` for event delivery

**Addresses:**
- Must-have features: Slack Web API + Events API (second major integration)
- Pitfall #8: Block Kit validation gaps (enforce limits, surface compatibility)
- Pitfall #9: Event ordering assumptions (async delivery, out-of-order support)
- Should-have features: Bolt-style event delivery, Socket Mode (optional)

**Avoids:**
- Synchronous in-order event delivery (use async queue from webhooks package)
- Missing Block Kit validation (50/100 block limits from start)

**Research flag:** **NEEDS RESEARCH** — Slack Events API specifics (event envelope format, challenge verification, retry sequences, Block Kit validation rules). Use `/gsd:research-phase`.

---

### Phase 6: Docker Integration & E2E Testing
**Rationale:** Wire twins into Sandpiper's E2E test suite after both Shopify and Slack twins are stable. Validates base URL swap works end-to-end and twins can replace real APIs in CI.

**Delivers:**
- `docker-compose.yml` with all twins + dependencies (Redis for BullMQ)
- `docker-compose.ci.yml` for GitHub Actions (optimized for CI)
- Health check endpoints for orchestration
- Sandpiper E2E tests using twins instead of real APIs
- Documentation for base URL swap in IntegrationClient

**Uses:**
- Docker multi-stage builds (Alpine images, 87% size reduction)
- tsup for bundling twins for production
- Turborepo for build orchestration

**Addresses:**
- Must-have feature: Docker Compose overlay for CI/E2E
- CI/CD integration primitives (health checks, environment variables)

**Avoids:**
- Running twins in production (anti-feature: dev/test only)
- Shared twin state across developers (isolated instances per test run)

**Research flag:** Standard patterns (Docker Compose for integration testing well-documented), skip `/gsd:research-phase`

---

### Phase Ordering Rationale

1. **Foundation first** prevents rework when patterns emerge across twins
2. **Shopify before Slack** because GraphQL complexity is higher (if pattern handles Shopify, it handles Slack)
3. **Webhook system after first twin** because requirements become clear from actual usage
4. **Conformance framework before second twin** validates Shopify pattern before replicating it
5. **Advanced Shopify features after Slack twin** because Slack validates infrastructure is reusable, then can extend Shopify confidently
6. **Docker integration last** because twins must work individually before orchestrating them

**Dependency chain:**
- Phase 2 (Shopify) depends on Phase 1 (Foundation)
- Phase 3 (Webhooks/Conformance) depends on Phase 2 (needs Shopify twin to test against)
- Phase 4 (Advanced Shopify) depends on Phase 3 (needs conformance validation)
- Phase 5 (Slack) depends on Phase 3 (needs battle-tested webhooks package)
- Phase 6 (Docker) depends on Phases 4 + 5 (needs both twins stable)

**How this avoids pitfalls:**
- **Pitfall #1 (over-simulation)**: Foundation phase establishes "behavioral contract only" principle before any twin code
- **Pitfall #3 (shared state)**: Foundation phase designs reset/isolation strategy before implementing state
- **Pitfall #4 (conformance gaps)**: Conformance framework built in Phase 3 before expanding Shopify or building Slack
- **Pitfall #6 (drift)**: Automated conformance runs established early, applied to both twins
- **Pitfalls #7, #8, #9 (service-specific)**: Research flags ensure these are addressed before implementation

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 2 (Shopify Twin — Core)**: Shopify GraphQL Admin API specifics (query cost calculation, webhook payload formats, OAuth scope requirements, GraphQL schema structure). Use `/gsd:research-phase` to mine Shopify official docs, community resources, and IntegrationClient usage patterns.

- **Phase 4 (Shopify Twin — Advanced)**: Shopify bulk operations implementation (state machine transitions, JSONL response format, partial failure handling, concurrent operation limits, webhook timing). Complex feature needs dedicated research. Use `/gsd:research-phase`.

- **Phase 5 (Slack Twin)**: Slack Events API specifics (event envelope format, challenge verification, retry sequences, Block Kit validation rules, surface compatibility matrices, rate limiting per endpoint). Use `/gsd:research-phase`.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Foundation)**: Monorepo architecture, pnpm workspaces, TypeScript config — well-documented patterns, use STACK.md recommendations directly
- **Phase 3 (Webhooks/Conformance)**: Webhook retry logic, conformance testing patterns — addressed in ARCHITECTURE.md and PITFALLS.md, sufficient guidance exists
- **Phase 6 (Docker Integration)**: Docker Compose for integration testing — standard practice, extensive documentation available

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | **HIGH** | Versions verified via official GitHub repos and package docs. Fastify, GraphQL Yoga, better-sqlite3, BullMQ, Vitest all have clear documentation and active maintenance. TypeScript-first recommendations validated by multiple 2026 sources. |
| **Features** | **MEDIUM-HIGH** | Table stakes features verified via WireMock, Mockoon, Stoplight Prism docs (industry standard). Shopify/Slack specifics from official documentation (high confidence). Differentiators based on StrongDM DTU approach and community best practices (medium confidence). Edge case coverage from community sources needs validation. |
| **Architecture** | **MEDIUM-HIGH** | Monorepo patterns verified via pnpm/Turborepo official docs (high confidence). Behavioral clone approach from StrongDM Factory article (high confidence on concept, medium on execution details). Layered state management and webhook patterns from multiple authoritative sources. Specific component boundaries need validation during implementation. |
| **Pitfalls** | **MEDIUM** | Shopify/Slack specifics from official docs (high confidence). General API simulator pitfalls from community sources, testing anti-patterns from Google SWE book and established resources (medium confidence). Some pitfalls inferred from testing best practices rather than direct twin-specific experience. Conformance testing approach validated by StrongDM but limited other examples. |

**Overall confidence:** **MEDIUM-HIGH**

Research provides strong foundation for stack choices and architectural approach. Shopify/Slack API behaviors are well-documented (official sources). Main uncertainty is in execution details (conformance test implementation, webhook retry timing, bulk operation state machines) which will surface during implementation and require iteration.

### Gaps to Address

**During Phase 2 (Shopify Twin) planning:**
- **GraphQL query cost calculation algorithm**: Shopify docs describe concept but don't provide exact calculation formula. May need reverse engineering from real API responses or Shopify client library inspection.
- **Webhook payload schemas**: Official docs show examples but not complete schema definitions. May need to capture real webhook payloads from Shopify dev store for accurate simulation.
- **OAuth scope-to-endpoint mapping**: Which scopes are required for which GraphQL operations? Docs are incomplete. Build from IntegrationClient actual usage.

**During Phase 4 (Shopify Bulk Operations) planning:**
- **State machine transition timing**: How long do real bulk operations take? Is timing consistent or variable? Need to measure against real API to set realistic defaults.
- **Partial failure format**: How does `partialDataUrl` JSONL differ from successful JSONL? Need examples from failed bulk operations.
- **Concurrent operation limits**: Docs say "5 in 2026-01+, 1 earlier" but need verification. Test against real API.

**During Phase 5 (Slack Twin) planning:**
- **Block Kit surface compatibility matrix**: Which blocks work in messages vs modals vs Home tabs? Slack docs are scattered. Compile from official Block Kit builder and validation errors.
- **Event retry sequence timing**: Docs say "immediate → 1min → 5min" but need to verify actual timing observed from real Events API.
- **Rate limiting per endpoint**: Slack has tier-based limits (Tier 1: 1/min, Tier 2: 20/min, etc.) but endpoint-to-tier mapping is incomplete in docs. May need community sources or real API observation.

**General implementation gaps:**
- **Conformance test normalization logic**: How to normalize responses for comparison (strip timestamps, normalize IDs, handle randomness)? Will emerge during Phase 3 implementation.
- **Performance benchmarks**: What response times should twins target? "As fast as real API" or "fast enough for test suites"? Define during Phase 2.
- **Webhook idempotency key handling**: Should twins deduplicate webhooks by idempotency key? Real APIs do, but is this necessary for test infrastructure? Decide during Phase 3.

## Sources

### Primary (HIGH confidence)

**Stack & Tooling:**
- [Fastify GitHub](https://github.com/fastify/fastify) — Version 5.x features, TypeScript support, performance benchmarks
- [GraphQL Yoga GitHub](https://github.com/dotansimha/graphql-yoga) — Version 5.x features, subscription support
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — Version 12.6.2, synchronous API, performance data
- [BullMQ GitHub](https://github.com/taskforcesh/bullmq) — Version 5.70.1, webhook delivery patterns
- [Vitest GitHub](https://github.com/vitest-dev/vitest) — Version 4.0.18, TypeScript/ESM support
- [pnpm Workspaces Docs](https://pnpm.io/workspaces) — Monorepo organization patterns
- [Turborepo Docs](https://turborepo.dev/docs) — Build caching and task orchestration

**API Documentation:**
- [Shopify GraphQL Admin API Reference](https://shopify.dev/docs/api/admin-graphql/latest) — Official schema, operations, versioning
- [Shopify Bulk Operations Guide](https://shopify.dev/docs/api/usage/bulk-operations) — State machine, webhooks, limits
- [Slack Developer Docs — APIs](https://docs.slack.dev/apis/) — Web API, Events API, OAuth
- [Slack Block Kit](https://docs.slack.dev/block-kit/) — Block validation rules, surface compatibility
- [Slack Events API](https://docs.slack.dev/apis/events-api/) — Event delivery, retry logic, ordering

**Architecture Patterns:**
- [StrongDM Digital Twin Universe](https://factory.strongdm.ai/techniques/dtu) — Behavioral clone approach, conformance testing
- [Monorepo Tools](https://monorepo.tools/) — Conceptual patterns for monorepo structure

### Secondary (MEDIUM confidence)

**API Mocking & Testing:**
- [WireMock Documentation](https://wiremock.org/) — Request matching, stateful scenarios, templating
- [Mockoon Documentation](https://mockoon.com/) — API mocking features, admin API, chaos engineering
- [Stoplight Prism](https://stoplight.io/api-mocking) — OpenAPI-based mocking, contract validation
- [MockServer Documentation](https://www.mock-server.com/) — State management, clearing/resetting
- [Mock Service Worker](https://mswjs.io/) — API mocking library (confirmed: not suitable for standalone servers)

**Testing Best Practices:**
- [Google Software Engineering Book — Test Doubles](https://abseil.io/resources/swe-book/html/ch13.html) — Test double patterns, anti-patterns
- [Codepipes — Software Testing Anti-patterns](https://blog.codepipes.com/testing/software-testing-antipatterns.html) — "Generous Leftovers", "Conjoined Twins"
- [Microcks — Conformance Testing](https://microcks.io/documentation/explanations/conformance-testing/) — Contract testing approach

**Webhook Delivery:**
- [Hookdeck — Complete Guide to Webhook Testing](https://hookdeck.com/webhooks/guides/complete-guide-webhook-testing) — Retry patterns, idempotency
- [Svix — Webhook Testing Guide](https://www.svix.com/resources/guides/webhook-testing-guide/) — Delivery patterns
- [OneUpTime — Webhook Service Retry Logic](https://oneuptime.com/blog/post/2026-01-25-webhook-service-retry-logic-nodejs/view) — Node.js retry implementation

**Monorepo & Build Tooling:**
- [Vitest vs Jest 2026 Benchmarks](https://www.sitepoint.com/vitest-vs-jest-2026-migration-benchmark/) — Performance comparison
- [Zod vs Joi Comparison](https://betterstack.com/community/guides/scaling-nodejs/joi-vs-zod/) — TypeScript type inference
- [Monorepo Insights: Nx, Turborepo, PNPM](https://medium.com/ekino-france/monorepo-insights-nx-turborepo-and-pnpm-3-4-96a3fb363cf4) — Decision framework
- [Docker Node.js Best Practices](https://medium.com/@regansomi/4-easy-docker-best-practices-for-node-js-build-faster-smaller-and-more-secure-containers-151474129ac0) — Alpine, multi-stage builds

### Tertiary (LOW confidence)

**Community Sources (needs validation during implementation):**
- [Shopify Community — GraphQL Admin API Testing](https://community.shopify.com/t/graphql-admin-api-testing/410754) — Testing approaches discussion
- [Medium — Shopify GraphQL Bulk Query](https://medium.com/@markwkiehl/shopify-graphql-bulk-query-5be70cccfe40) — Bulk operations experience
- [Slack Bolt GitHub — Block Validation](https://github.com/slackapi/bolt-js/issues/1652) — Block Kit validation utility discussion
- Various Stack Overflow threads and blog posts on API mocking, webhook retry logic, OAuth testing

---

*Research completed: 2026-02-27*
*Ready for roadmap: yes*
