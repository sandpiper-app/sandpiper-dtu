# Requirements: Sandpiper DTU

**Defined:** 2026-02-27
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Methodology:** Grounded in StrongDM's [Digital Twin Universe](https://factory.strongdm.ai/techniques/dtu) concept ([overview](https://simonwillison.net/2026/Feb/7/software-factory/)) — behavioral clones of third-party dependencies, built from API contracts and edge cases, validated against real services until behavioral differences disappear.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Shared Infrastructure

- [x] **INFRA-01**: Monorepo with pnpm workspaces — shared packages (types, core, state, webhooks, conformance) and per-twin apps
- [x] **INFRA-02**: Shared state management layer with SQLite/in-memory backends, resettable between test runs in <100ms
- [x] **INFRA-03**: Admin API for programmatic test control — `POST /admin/reset`, `POST /admin/fixtures/load`, `GET /admin/state`
- [x] **INFRA-04**: Configurable error simulation per endpoint — 401, 403, 429, 500, 503, timeout responses with realistic error bodies
- [x] **INFRA-05**: Conformance test framework — same test suite runs against twin AND real sandbox API, reports behavioral differences
- [x] **INFRA-06**: Conformance suites run periodically (CI schedule) to detect upstream API drift
- [x] **INFRA-07**: Health check endpoint (`/health`) returns 200 when twin is initialized and ready
- [x] **INFRA-08**: Structured JSON logging with correlation IDs for debugging twin behavior
- [x] **INFRA-09**: Twin development grounded in StrongDM DTU methodology — replicate behavior at API boundary from contracts + edge cases, validate against real services

### Shopify Twin

- [x] **SHOP-01**: GraphQL Admin API handles queries and mutations Sandpiper uses — orders, products, customers, inventory, fulfillments
- [x] **SHOP-02**: OAuth token exchange flow — authorization code → access token, with token validation on subsequent requests
- [x] **SHOP-03**: Webhook delivery — state mutations (orderCreate, orderUpdate, productUpdate, fulfillmentCreate) trigger POST to configured callback URLs
- [x] **SHOP-04**: Rate limiting by GraphQL query cost — returns 429 + Retry-After header when cost threshold exceeded
- [x] **SHOP-05**: Cursor-based pagination with deterministic, stable results across test runs
- [x] **SHOP-06**: Stateful order lifecycle — create → update → fulfill → close with realistic state transitions
- [x] **SHOP-07**: X-Shopify-Access-Token header validation on all API requests

### Slack Twin

- [x] **SLCK-01**: Web API methods Sandpiper uses — chat.postMessage, chat.update, conversations.list, conversations.info, conversations.history, users.list, users.info
- [x] **SLCK-02**: Events API delivery — POST event payloads (message, app_mention, reaction_added) to configured app URL on state changes
- [x] **SLCK-03**: OAuth installation flow — workspace authorization → bot token + user token issuance
- [x] **SLCK-04**: Block Kit interaction handling — button click payloads, modal submission payloads, message action payloads with response URL support *(Phase 5 covers block_actions/button clicks only; view_submission and message_action deferred — modals are out of Phase 5 scope)*
- [x] **SLCK-05**: Bolt-compatible challenge verification (url_verification) and event envelope format
- [x] **SLCK-06**: Rate limiting — tier-based per method with 429 + Retry-After headers

### Twin UIs

- [x] **UI-01**: Shopify twin web UI — sidebar navigation (Orders, Products, Customers, Inventory), list views with search/filter, detail views per entity
- [x] **UI-02**: Shopify twin web UI — create, edit, delete orders, products, customers through forms
- [x] **UI-03**: Slack twin web UI — channel sidebar, message timeline view, user list, workspace navigation
- [x] **UI-04**: Slack twin web UI — create channels, post messages, manage users through the interface
- [x] **UI-05**: Shared UI framework — consistent barebones styling across twins, reusable list/detail/form components

### Integration

- [x] **INTG-01**: Base URL swap — Sandpiper's IntegrationClient points at twin URLs via environment config
- [x] **INTG-02**: Docker Compose overlay (`docker-compose.twin.yml`) starts all twins + Sandpiper, wired together
- [x] **INTG-03**: Docker images for each twin with health checks and configurable ports

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Additional Twins

- **NYLA-01**: Nylas email twin — email read/send API, OAuth grants, webhooks + polling
- **SHPO-01**: Shippo shipping twin — tracking, rates, label creation, webhook delivery
- **TWHL-01**: Triple Whale analytics twin — OAuth, metrics polling

### Advanced Features

- **ADV-01**: Request recording/playback from real sandbox APIs to generate fixtures
- **ADV-02**: Scenario-based test fixtures — pre-configured workflow data (abandoned cart flow, multi-item fulfillment)
- **ADV-03**: Shopify bulk operations state machine (CREATED → RUNNING → COMPLETED)
- **ADV-04**: Multi-version Shopify API support (2026-01, 2026-04)
- **ADV-05**: Slack Socket Mode (WebSocket alternative to Events API)
- **ADV-06**: Chaos engineering — intermittent errors, partial responses, cascading failures
- **ADV-07**: Activity monitoring in twin UIs — incoming requests, outgoing webhooks, error log

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full Shopify Admin API coverage | Only endpoints Sandpiper uses — build on-demand, not speculatively |
| Perfect real-time fidelity | High-fidelity for tested scenarios, not pixel-perfect API reproduction |
| Production deployment of twins | Dev/test infrastructure only — real APIs in production |
| GUI for twin configuration | Code-first config (TypeScript, env vars). UIs are for state inspection/manipulation only |
| Shared/remote twin state | Isolated state per instance for determinism — no multi-user coordination |
| Go implementation | TypeScript for shared types with Sandpiper and team familiarity |
| Real-time WebSocket for everything | HTTP-first; WebSocket only if Slack Socket Mode needed later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 2 | Complete |
| INFRA-04 | Phase 2 | Complete |
| INFRA-05 | Phase 3 | Complete |
| INFRA-06 | Phase 3 | Complete |
| INFRA-07 | Phase 1 | Complete |
| INFRA-08 | Phase 1 | Complete |
| INFRA-09 | Phase 1 | Complete |
| SHOP-01 | Phase 2 | Complete |
| SHOP-02 | Phase 2 | Complete |
| SHOP-03 | Phase 2 | Complete |
| SHOP-04 | Phase 4 | Complete |
| SHOP-05 | Phase 4 | Complete |
| SHOP-06 | Phase 4 | Complete |
| SHOP-07 | Phase 2 | Complete |
| SLCK-01 | Phase 5 | Complete |
| SLCK-02 | Phase 5 | Complete |
| SLCK-03 | Phase 5 | Complete |
| SLCK-04 | Phase 5 | Complete |
| SLCK-05 | Phase 5 | Complete |
| SLCK-06 | Phase 5 | Complete |
| UI-01 | Phase 6 | Complete |
| UI-02 | Phase 6 | Complete |
| UI-03 | Phase 6 | Complete |
| UI-04 | Phase 6 | Complete |
| UI-05 | Phase 6 | Complete |
| INTG-01 | Phase 7 | Complete |
| INTG-02 | Phase 7 | Complete |
| INTG-03 | Phase 7 | Complete |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
