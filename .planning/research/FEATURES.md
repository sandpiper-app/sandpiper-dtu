# Feature Research: API Twin/Simulator Systems

**Domain:** API simulators/digital twins for third-party service testing
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Request/Response Matching** | Core API simulation - must accept HTTP requests and return responses based on URL patterns, headers, query params, body content | MEDIUM | WireMock, Mockoon, all major tools provide this. Multiple matcher types needed (exact, regex, JSONPath). |
| **Stateful Behavior** | Real APIs maintain state between calls (create order → query order). Without state, twins can't simulate realistic workflows | HIGH | MockServer, Drydock, stateful-api-mock-server all provide state APIs. Need `.reset()`, `.set()`, `.get()`, `.resetAll()`. |
| **Error Response Simulation** | APIs fail in production. Testing requires 4xx/5xx errors, timeouts, malformed responses | LOW-MEDIUM | All major tools support custom status codes. Need 400, 401, 403, 404, 429, 500, 503, 504. |
| **Dynamic Response Generation** | Static responses don't test edge cases. Need variable data (timestamps, IDs, randomized values) | MEDIUM | WireMock uses Handlebars templating. Mockoon has dynamic templating system. Critical for realistic testing. |
| **Request Verification/Inspection** | Developers need to verify their app sent correct requests with proper headers, params, timing | LOW-MEDIUM | WireMock provides request verification. MockServer has detailed request logs. Essential for debugging. |
| **State Reset Between Tests** | Test isolation requires wiping state between runs. Without reset, tests leak state and become flaky | LOW | Mockoon Admin API `/mockoon-admin/state`, MockServer `.reset()`, MSW `resetHandlers()`. Must-have for CI. |
| **OpenAPI/Schema Integration** | Industry standard for API contracts. Developers expect to import OpenAPI specs and auto-generate mocks | MEDIUM | Stoplight Prism, Mockoon support OpenAPI import. Validates twin matches contract. |
| **Rate Limiting Simulation** | Critical for testing retry logic, backoff strategies, quota handling. APIs throttle in production | MEDIUM | Beeceptor, mock-rate-limiting-endpoint return 429 + Retry-After headers. Need configurable thresholds. |
| **Webhook Delivery** | Shopify/Slack push webhooks on events. Twins must POST to callback URLs on state changes | HIGH | Rare in general tools, critical for event-driven APIs. Active push (not passive response only). |
| **Authentication/OAuth Flows** | Real APIs require auth. Testing needs token exchange, validation, expiry simulation | HIGH | Shopify: OAuth + X-Shopify-Access-Token header. Slack: OAuth + bot tokens. Critical for Sandpiper integration tests. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Conformance Testing Against Real APIs** | Ensures twin doesn't drift from real service. Validates behavioral fidelity periodically | MEDIUM-HIGH | StrongDM approach: run same test suite against twin + real API, compare results. Catches upstream API changes. |
| **Request Recording & Playback** | Capture real API interactions, replay as fixtures. Accelerates twin development with real-world data | MEDIUM | WireMock supports recording. Creates fixtures from production traffic patterns. |
| **GraphQL-Specific Features** | Shopify is GraphQL. Generic HTTP mocking doesn't handle query cost calculation, schema validation, introspection | HIGH | Shopify calculates query costs for rate limiting. Need schema-aware validation, resolver mocking. |
| **Block Kit/Interactive UI Support** | Slack Block Kit has buttons, modals, actions. Twins must handle interaction payloads and state updates | HIGH | Rare in general tools. Critical for Slack twin (message buttons, modal submissions). |
| **Observability/Tracing** | Production-grade logging, metrics, distributed traces help debug twin behavior and integration issues | MEDIUM | Postman Insights, API observability tools provide traces/logs. Helpful but not blocking. |
| **Scenario-Based Test Fixtures** | Pre-configured data sets for common workflows (new order → fulfillment → shipped) | MEDIUM | Paddle webhook simulator, Hookdeck scenarios. Accelerates test writing. |
| **Chaos Engineering Features** | Simulate realistic failures: intermittent errors, packet loss, partial responses, cascading failures | MEDIUM | Mockoon chaos features, network fault injection. Validates resilience beyond simple error codes. |
| **CI/CD Integration Primitives** | Docker Compose overlays, environment variables, health checks for automated testing pipelines | LOW-MEDIUM | Mockoon CLI, WireMock Docker images. Essential for Sandpiper's E2E in GitHub Actions. |
| **Multi-Version API Support** | Shopify has versioned API (2026-01, 2026-04). Twin should support multiple versions simultaneously | MEDIUM | Handles API evolution, tests version upgrades. Shopify releases quarterly. |
| **Deterministic Pagination** | GraphQL cursor-based pagination with stable, repeatable results for test reliability | MEDIUM | Shopify uses cursors. Need consistent page boundaries across test runs. |
| **Webhook Retry Logic** | Real services retry failed webhooks with exponential backoff. Twin should mimic retry behavior | MEDIUM | Tests consumer idempotency, duplicate handling. Matches real Shopify/Slack behavior. |
| **Extensibility/Plugin System** | Custom request matchers, response transformers, admin API extensions for domain-specific needs | MEDIUM | WireMock extensibility model. Enables Shopify-specific logic (inventory validation, order state machines). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full API Coverage (Every Endpoint)** | "We should support the entire Shopify/Slack API" | Massive scope, diminishing returns. Sandpiper uses ~10-15% of Shopify API surface. | **Only endpoints Sandpiper uses.** Build from integration client calls, not full schema. Add endpoints on-demand. |
| **Perfect Real-Time Fidelity** | "Twin should behave identically to production in all cases" | Impossible goal. APIs have undocumented quirks, race conditions, infrastructure-specific behavior. | **High-fidelity for tested scenarios.** Conformance tests validate common paths. Flag edge cases as "known differences." |
| **Production Deployment** | "Let's run twins in prod as failover" | Twins are test infrastructure, not production-grade. Missing monitoring, SLAs, security hardening. | **Dev/test only.** Use real APIs in production. Twins for CI, local dev, E2E tests. |
| **GUI for Twin Management** | "We need a dashboard to configure twins" | Adds UI complexity for developer-focused tooling. Sandpiper team uses code/config. | **Code-first configuration.** TypeScript config files, environment variables. Admin API for programmatic control only. |
| **Shared/Remote Twin State** | "Multiple developers should share twin data" | Introduces coordination, race conditions, slower tests. Defeats determinism. | **Isolated state per instance.** Each developer/CI run gets fresh twin with local SQLite/in-memory state. |
| **Real-Time Socket Connections for All** | "Support WebSocket for everything" | Adds complexity. Shopify doesn't use WebSockets. Slack Socket Mode optional. | **HTTP-first.** Add WebSocket only for Slack Socket Mode if needed. Prefer HTTP webhooks. |

## Feature Dependencies

```
Core Request/Response Matching
    └──requires──> Dynamic Response Generation
                       └──enhances──> Scenario-Based Test Fixtures

Stateful Behavior
    └──requires──> State Reset Between Tests
    └──enables──> Webhook Delivery (state changes trigger webhooks)
    └──enables──> Multi-Step Workflow Testing

OpenAPI/Schema Integration
    └──enables──> Request Validation
    └──enables──> Conformance Testing Against Real APIs

Authentication/OAuth Flows
    └──requires──> Stateful Behavior (token storage)
    └──blocks──> All API Operations (auth first)

GraphQL-Specific Features
    └──requires──> OpenAPI/Schema Integration (GraphQL schema)
    └──requires──> Dynamic Response Generation (resolver logic)

Webhook Delivery
    └──requires──> Stateful Behavior (state change detection)
    └──requires──> Request Recording (webhook payloads)
    └──enhances──> Webhook Retry Logic

Conformance Testing
    └──requires──> Request Verification/Inspection (compare outputs)
    └──requires──> State Reset (test isolation)
```

### Dependency Notes

- **Authentication blocks everything:** OAuth must work before testing any Shopify/Slack operations
- **State is foundational:** Stateful behavior enables webhooks, workflows, OAuth tokens, realistic scenarios
- **Conformance testing validates twin fidelity:** Requires both twin and real API to run same tests
- **GraphQL is Shopify-specific:** Not needed for Slack (REST-based Web API)
- **Webhook delivery is active, not passive:** State changes (create order) must trigger POST to callback URL

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the Sandpiper integration testing approach.

- [x] **Shopify GraphQL Twin: Core Operations** — Orders, products, customers (subset Sandpiper uses). Validates pattern feasibility.
- [x] **Shopify OAuth Flow** — Token exchange, validation. Sandpiper integration client requires auth.
- [x] **Stateful Behavior + Reset API** — Create order → query order. Reset between test runs.
- [x] **Error Simulation** — 401, 429, 500, timeouts. Tests Sandpiper retry/circuit breaker logic.
- [x] **Webhook Delivery (Basic)** — Orders created → POST to callback URL. Critical for event-driven testing.
- [x] **Request/Response Matching** — URL patterns, header validation. Table stakes.
- [x] **Base URL Swap Integration** — Sandpiper IntegrationClient points at twin URL. Proves concept works.
- [x] **Docker Compose Overlay** — Twins + Sandpiper in CI. Validates E2E test infrastructure.

### Add After Validation (v1.x)

Features to add once core Shopify twin is working and pattern is validated.

- [ ] **Slack Twin: Web API + Events API** — Trigger after Shopify proves pattern. Second major integration.
- [ ] **Conformance Test Suite** — Validate twin vs real Shopify sandbox. Prevents drift.
- [ ] **GraphQL Query Cost Calculation** — Shopify rate limits by query complexity. Validates realistic throttling.
- [ ] **Webhook Retry Logic** — Exponential backoff, failure scenarios. Improves test realism.
- [ ] **Scenario-Based Fixtures** — Pre-configured test data (e.g., "abandoned_cart_flow"). Accelerates test authoring.
- [ ] **Request Recording from Real APIs** — Capture Shopify sandbox traffic, replay as fixtures. Enriches edge cases.
- [ ] **Observability/Logging** — Structured logs, request traces. Helps debug integration failures.
- [ ] **Slack Block Kit Interactions** — Buttons, modals, message updates. Critical for Slack twin completeness.

### Future Consideration (v2+)

Features to defer until Shopify + Slack twins are production-ready and pattern is proven.

- [ ] **Multi-Version API Support** — Shopify 2026-01 vs 2026-04. Useful for upgrade testing but not blocking.
- [ ] **Chaos Engineering** — Packet loss, partial responses, cascading failures. Nice-to-have resilience testing.
- [ ] **Nylas/Shippo Twins** — Third/fourth integration services. Pattern proven, lower priority.
- [ ] **Extensibility/Plugin System** — Custom matchers, transformers. Premature until common patterns emerge.
- [ ] **Advanced GraphQL Features** — Introspection, schema stitching, federation. Overkill for Sandpiper's use case.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shopify GraphQL operations (subset) | HIGH | HIGH | P1 |
| Stateful behavior + reset | HIGH | MEDIUM | P1 |
| OAuth flows (Shopify) | HIGH | MEDIUM | P1 |
| Webhook delivery (basic) | HIGH | MEDIUM | P1 |
| Error simulation (4xx, 5xx, timeouts) | HIGH | LOW | P1 |
| Docker Compose integration | HIGH | LOW | P1 |
| Request/response matching | HIGH | MEDIUM | P1 |
| Base URL swap for IntegrationClient | HIGH | LOW | P1 |
| Conformance testing framework | HIGH | MEDIUM | P2 |
| Slack Web API + Events API | HIGH | HIGH | P2 |
| GraphQL query cost calculation | MEDIUM | MEDIUM | P2 |
| Webhook retry logic | MEDIUM | MEDIUM | P2 |
| Scenario-based fixtures | MEDIUM | MEDIUM | P2 |
| Request recording/playback | MEDIUM | MEDIUM | P2 |
| Observability/logging | MEDIUM | LOW | P2 |
| Slack Block Kit interactions | MEDIUM | HIGH | P2 |
| Multi-version API support | LOW | MEDIUM | P3 |
| Chaos engineering features | LOW | MEDIUM | P3 |
| Extensibility/plugin system | LOW | HIGH | P3 |
| Nylas/Shippo twins | LOW | HIGH | P3 |

**Priority key:**
- **P1:** Must have for MVP — validates pattern with Shopify twin + Sandpiper integration tests
- **P2:** Should have for production-ready twins — adds Slack, conformance testing, developer experience
- **P3:** Nice to have for future — enables advanced scenarios, additional services, customization

## Twin-Specific Feature Breakdown

### Shopify Twin Features

| Feature | Why Critical | Implementation Notes |
|---------|--------------|---------------------|
| GraphQL Admin API (subset) | Sandpiper queries orders, products, customers, inventory, fulfillments | Start with 10-15 most-used queries/mutations from IntegrationClient |
| OAuth token exchange | Sandpiper apps install via OAuth, receive access token | Standard OAuth 2.0 flow, token validation |
| Webhook delivery (orders, products) | State changes → POST to callback URL | On `orderCreate`, `orderUpdate`, `productUpdate` mutations |
| Rate limiting (429 responses) | Sandpiper circuit breaker logic needs realistic throttling | Return 429 + Retry-After header based on query cost |
| GraphQL query cost calculation | Shopify throttles by complexity, not request count | Calculate field costs, enforce max cost threshold |
| Versioned API (2026-01, 2026-04) | Shopify releases quarterly, apps must handle versions | Support multiple schemas simultaneously |
| Pagination (cursor-based) | Shopify uses GraphQL cursors for large result sets | Deterministic, stable cursors across test runs |

### Slack Twin Features

| Feature | Why Critical | Implementation Notes |
|---------|--------------|---------------------|
| Web API methods (subset) | Sandpiper posts messages, queries channels, user info | Start with chat.postMessage, conversations.*, users.* |
| Events API delivery | Slack pushes events (messages, reactions) to app URL | POST event payloads to configured webhook URL |
| OAuth installation flow | Sandpiper apps install to workspaces via OAuth | Standard OAuth 2.0, workspace/bot token issuance |
| Block Kit interactions | Messages with buttons, modals, interactive components | Handle action payloads, update messages, open/submit modals |
| Socket Mode (optional) | Alternative to public webhooks for Events API | WebSocket connection, lower priority than HTTP |
| Rate limiting (429 responses) | Slack has tier-based rate limits per method | Return 429 + Retry-After, vary by endpoint |
| Bolt-style event delivery | Sandpiper likely uses @slack/bolt framework | Challenge verification, event envelope format |

### Conformance Testing Features

| Feature | Why Critical | Implementation Notes |
|---------|--------------|---------------------|
| Dual-execution test harness | Run same test against twin + real API, compare results | Requires sandbox API credentials, automated suite |
| Response schema validation | Twin responses must match real API structure | JSON schema comparison, field presence/types |
| State transition validation | Multi-step workflows (create → update → delete) should match | Sequence of operations, state snapshots |
| Error response matching | Twin errors (4xx, 5xx) should match real API error formats | Error messages, error codes, response bodies |
| Periodic drift detection | Run conformance suite on schedule (daily/weekly) | Alerts when real API changes break twin |
| Behavioral equivalence metrics | Track conformance test pass rate over time | Dashboard showing twin fidelity percentage |

### Developer Experience Features

| Feature | Why Critical | Implementation Notes |
|---------|--------------|---------------------|
| Zero-config startup | `docker compose up` or `npm run twin:shopify` just works | Embedded SQLite, no external deps |
| Fast state reset | Tests reset state in <100ms for rapid iteration | In-memory state or optimized SQLite transactions |
| Request/response logging | Developers see what their app sent, what twin returned | Structured logs (JSON), filterable by endpoint |
| Error messages for mismatches | When request doesn't match schema, clear error with fix suggestion | "Missing required field X in mutation Y" |
| Health check endpoint | CI/E2E can verify twin is ready before running tests | `/health` returns 200 when initialized |
| Admin API for test control | Programmatic state manipulation, fixture loading | POST `/admin/reset`, POST `/admin/fixtures/load` |
| OpenAPI/GraphQL schema export | Developers can inspect what twin supports | GET `/schema` returns GraphQL SDL or OpenAPI JSON |

## Competitor/Ecosystem Feature Analysis

| Feature | WireMock | Mockoon | Stoplight Prism | Mock.shop | Our Approach |
|---------|----------|---------|-----------------|-----------|--------------|
| **Request matching** | ✅ Extensive (URL, headers, body, JSONPath) | ✅ Rules + templates | ✅ OpenAPI-based | ✅ GraphQL queries | ✅ Match WireMock flexibility |
| **Stateful behavior** | ✅ Scenarios, state machine | ✅ Global variables, data buckets | ❌ Stateless | ❌ Read-only data | ✅ Full state with reset API |
| **Dynamic responses** | ✅ Handlebars templating | ✅ Handlebars + Faker.js | ✅ Dynamic examples | ✅ Fixed mock data | ✅ Template + domain logic |
| **Error simulation** | ✅ Faults, delays, status codes | ✅ Chaos engineering | ✅ Example-based | ❌ Success-only | ✅ Comprehensive error scenarios |
| **OpenAPI integration** | ✅ Import/export | ✅ Import | ✅ Native (OpenAPI-first) | N/A (GraphQL) | ✅ GraphQL schema + OpenAPI for Slack |
| **Recording/playback** | ✅ Proxy + record | ✅ Proxy mode | ❌ | ❌ | ✅ P2 feature (record from sandbox) |
| **Webhook delivery** | ❌ Response-only | ❌ Response-only | ❌ Response-only | ❌ Response-only | ✅ **Differentiator** (active push) |
| **GraphQL support** | ❌ Generic HTTP | ❌ Generic HTTP | ✅ Limited | ✅ Native (Shopify storefront) | ✅ **Differentiator** (Admin API + costs) |
| **OAuth flows** | ❌ Manual setup | ❌ Manual setup | ❌ | ❌ | ✅ **Differentiator** (built-in) |
| **Conformance testing** | ❌ | ❌ | ✅ Contract validation | ❌ | ✅ **Differentiator** (vs real API) |
| **Deployment** | ✅ Standalone, Docker, embedded | ✅ Desktop, CLI, Docker, serverless | ✅ CLI, Docker | ✅ Hosted SaaS | ✅ Docker Compose (dev/CI) |

**Key Gaps in Ecosystem:**

1. **Active webhook delivery:** WireMock, Mockoon, Prism are all passive (respond to requests). None actively POST webhooks on state changes. **Sandpiper DTU must build this.**

2. **Shopify GraphQL fidelity:** Mock.shop provides Storefront API data (read-only), not Admin API mutations. No query cost calculation, no OAuth. **Sandpiper DTU fills gap.**

3. **Conformance testing against real APIs:** Prism validates OpenAPI contracts, but doesn't run live comparisons against real sandbox. **StrongDM approach is unique.**

4. **Domain-specific twins:** Generic tools (WireMock, Mockoon) require manual configuration. **Sandpiper DTU is purpose-built for Shopify/Slack.**

## Sources

**API Mocking Tools & Features:**
- [WireMock - flexible, open source API mocking](https://wiremock.org/)
- [Mockoon - Create mock APIs in seconds](https://mockoon.com/)
- [Stoplight - Instant API Mock Servers from OpenAPI](https://stoplight.io/api-mocking)
- [Mock.shop - A mock store API for easy prototyping](https://mock.shop/)
- [MockServer - Documentation](https://www.mock-server.com/)
- [Mock Service Worker - API mocking library](https://mswjs.io/)

**Shopify API Documentation:**
- [Shopify GraphQL Admin API reference](https://shopify.dev/docs/api/admin-graphql/latest)
- [Shopify @shopify/graphql-testing NPM package](https://www.npmjs.com/package/@shopify/graphql-testing)
- [Shopify GraphQL Admin API Testing - Community Discussion](https://community.shopify.com/t/graphql-admin-api-testing/410754)

**Slack API Documentation:**
- [Slack Developer Documentation - APIs](https://docs.slack.dev/apis/)

**Conformance & Contract Testing:**
- [API Contract Testing: Best Practices for Developers](https://www.accelq.com/blog/api-contract-testing/)
- [Microcks - Conformance testing](https://microcks.io/documentation/explanations/conformance-testing/)
- [Pact - Introduction to Contract Testing](https://docs.pact.io/)
- [Consumer-Driven Contract Testing - Microsoft Engineering Playbook](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/cdc-testing/)

**State Management & Reset:**
- [MockServer - Clearing & Resetting](https://www.mock-server.com/mock_server/clearing_and_resetting.html)
- [Mock Service Worker - resetHandlers()](https://mswjs.io/docs/api/setup-server/reset-handlers/)
- [Mockoon - Admin API: Server state](https://mockoon.com/docs/latest/admin-api/server-state/)
- [stateful-api-mock-server - NPM package](https://www.npmjs.com/package/stateful-api-mock-server)

**Webhook Testing:**
- [Webhook Testing Guide - Svix Resources](https://www.svix.com/resources/guides/webhook-testing-guide/)
- [Testing webhooks - GitHub Docs](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/testing-webhooks)
- [Complete Guide to Webhook Testing - Hookdeck](https://hookdeck.com/webhooks/guides/complete-guide-webhook-testing)
- [Webhooks Testing: Types, Steps, Tools & Challenges](https://hevodata.com/learn/webhooks-testing/)

**Error Simulation & Rate Limiting:**
- [Beeceptor - Simulate API Rate Limits](https://beeceptor.com/docs/rate-limits-for-apis/)
- [GitHub - mock-rate-limiting-endpoint](https://github.com/bitsofinfo/mock-rate-limiting-endpoint)
- [Simulating API Error Handling Scenarios with Mock APIs](https://dev.to/zuplo/simulating-api-error-handling-scenarios-with-mock-apis-32g3)
- [The Complete Guide to API Mocking - API7.ai](https://api7.ai/blog/complete-guide-to-api-mocking)

**API Observability & Debugging:**
- [API Observability - Enhancing Monitoring and Performance - SigNoz](https://signoz.io/guides/api-observability/)
- [API Observability - Postman](https://www.postman.com/api-platform/api-observability/)
- [Debugging best practices for REST API consumers - Stack Overflow Blog](https://stackoverflow.blog/2022/02/28/debugging-best-practices-for-rest-api-consumers/)

---
*Feature research for: Sandpiper DTU (Digital Twin Universe) - API simulator/twin systems*
*Researched: 2026-02-27*
*Confidence: MEDIUM-HIGH (ecosystem tools verified via official docs, Shopify/Slack features from official documentation, conformance testing from multiple authoritative sources)*
