# Sandpiper DTU (Digital Twin Universe)

## What This Is

A collection of high-fidelity behavioral clones ("digital twins") of the third-party services that Sandpiper depends on — starting with Shopify and Slack. Each twin is a standalone TypeScript/Express HTTP server that replicates the real service's API surface, edge cases, and observable behaviors, enabling Sandpiper to run thousands of test scenarios without hitting rate limits, accumulating API costs, or depending on sandbox availability.

Inspired by StrongDM's "software factory" approach, where coding agents built behavioral clones of Okta, Jira, Slack, and Google services to enable deterministic, replayable testing at scale.

## Core Value

Sandpiper's integration tests can run against twins that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

## Current Milestone: v1.2 Behavioral Fidelity

**Goal:** Fix the behavioral fidelity gaps and conformance infrastructure weaknesses identified by external adversarial review, so that the twins genuinely behave like the real services — not just pass their own tests.

**Target features:**
- Conformance harness performs real twin-vs-live structural comparison (not twin-vs-self)
- Coverage tracking derived from execution evidence, not hand-authored metadata
- Shopify OAuth implements real authorize route, callback flow, and validated token exchange
- Shopify Storefront uses separate schema without admin-only mutations and correct auth model
- Shopify twin accepts multiple API versions without test-harness rewriting
- Shopify REST resources persist state with correct shapes (numeric IDs, admin_graphql_api_id)
- Shopify billing mutates install state; rate limiting uses realistic bucket size and actual query costs
- Slack twin covers all bound WebClient methods including admin.*, workflows.*, canvases.*, and 31 other missing families
- Slack chat.update/delete enforce channel and author scoping rules matching real Slack
- Slack events use signing-secret headers, dedicated interactivity URL, and absolute response_url
- Slack conversations/views/pins/reactions are stateful (membership, lifecycle, persistence)
- Slack auth enforces OAuth scope requirements per method, not just token existence
- SDK verification entrypoint (pnpm test:sdk) works reliably end-to-end

## Requirements

### Validated

- Shared monorepo infrastructure (test harness, HTTP framework, validation tools) — Phase 1
- Each twin manages internal state (SQLite, resettable in <100ms) — Phases 1-5
- Shopify twin replicates GraphQL API surface used by Sandpiper — Phases 2, 4
- Shopify twin handles OAuth flows (token exchange) — Phase 2
- Shopify twin delivers webhooks to configured callback URLs on state changes — Phase 3
- Slack twin replicates Web API, Events API, and OAuth installation flow — Phase 5
- Slack twin supports Block Kit interactions (block_actions/button clicks) — Phase 5
- Slack twin delivers event webhooks on state changes (messages, app_mention, reaction_added) — Phase 5
- Each twin simulates error responses, rate limiting, auth failures, and pagination — Phases 2, 4, 5
- Conformance test suites validate twin behavior against real sandbox APIs — Phase 3
- Conformance suites run periodically to catch upstream API drift — Phase 3
- Twin UIs for state inspection and manual testing — Phase 6
- Base URL swap lets Sandpiper point integration clients at twin URLs — Phase 7
- Docker-compose overlay wires twins + Sandpiper together for CI/E2E — Phase 7
- ✓ Official upstream SDK forks live in-repo as pinned git submodules under `third_party/upstream/` — Phase 13
- ✓ Machine-generated public-surface manifests cover every targeted package symbol and method — Phase 13
- ✓ Shopify twin passes `@shopify/admin-api-client` GraphQL and REST client tests — Phases 14-15
- ✓ Shopify twin passes `@shopify/shopify-api` auth, session, webhook, and billing helpers — Phase 16
- ✓ Shopify twin passes `@shopify/shopify-api` client surfaces and strategic REST stubs — Phases 17
- ✓ Slack twin passes official `@slack/web-api`, `@slack/oauth`, and `@slack/bolt` suites across their literal public surface — Phases 18-20
- ✓ SDK conformance, HMAC/timing/UI verification, and drift detection run together in CI — Phase 14, 20

### Active

- [ ] Conformance harness validates twin behavior via real twin-vs-live comparison with full structural checking
- [ ] Coverage status derived from test execution evidence, not hand-authored symbol maps
- [ ] Shopify twin implements real OAuth authorize/callback flow with validated token exchange
- [ ] Shopify twin serves separate Storefront schema with correct auth model
- [ ] Shopify twin routes multiple API versions natively (not test-harness rewritten)
- [ ] Shopify REST resources persist state with real-Shopify-compatible response shapes
- [ ] Shopify billing mutates install state; rate limiting uses correct bucket size and actual query costs
- [ ] Slack twin covers all 275+ bound WebClient methods (closes 126-method gap)
- [ ] Slack message mutations enforce channel/author scoping and conformance tests exercise real operations
- [ ] Slack events use signing-secret headers, dedicated interactivity URL, absolute response_url
- [ ] Slack conversations/views/pins/reactions are stateful (membership, lifecycle, persistence)
- [ ] Slack auth enforces OAuth scope requirements per method
- [ ] SDK verification entrypoint (pnpm test:sdk) works reliably end-to-end

### Out of Scope

- Additional Slack packages (`@slack/rtm-api`, `@slack/webhook`, standalone `@slack/socket-mode`) — deferred unless they become explicit milestone scope beyond what Bolt already depends on or re-exports
- Shopify app frameworks (`shopify-app-express`, `shopify-app-remix`, `shopify-app-react-router`) — application-framework concerns, not the twin fidelity boundary for v1.1
- Multi-version package matrix across many Shopify and Slack releases — pin one version per targeted package first, then expand after the literal-scope baseline exists
- Nylas twin — deferred until Shopify + Slack SDK-grounded conformance proves the pattern
- Shippo twin — deferred until Shopify + Slack SDK-grounded conformance proves the pattern
- Triple Whale twin — low priority, nice-to-have integration after higher-value twins
- Production deployment of twins — these are dev/test infrastructure only
- Go implementation — staying in TypeScript for shared types and team familiarity

## Context

**Sandpiper** is a proactive AI assistant for ecommerce merchants. It processes events from Shopify, Slack, email, and shipping services through a three-tier triage pipeline, learns merchant preferences, and executes actions with permission gating. It's built with Node.js 20+, TypeScript, Express, PostgreSQL, Redis, and Anthropic Claude.

**Current testing pain points:**
- Integration tests depend on sandbox environments (Shopify dev store, Nylas sandbox, Shippo test API) that are flaky, rate-limited, and slow
- Unit tests use `vi.fn()` mocks that don't catch behavioral mismatches with real APIs
- Edge cases (rate limits, circuit breaker trips, webhook retry logic, OAuth token expiry) are hard to trigger reliably against real services
- E2E tests require full Docker stack (PostgreSQL, Redis, Letta) plus live sandbox credentials

**v1.0 proved the twin pattern, but not the full SDK boundary:** the project has hand-written conformance coverage and strong twin behavior for the subset Sandpiper currently uses, yet it does not have a source-derived way to prove that official upstream client libraries still behave correctly against the twins as those libraries evolve.

**v1.1 changes the validation source of truth:** this milestone uses cloned upstream SDK repos plus the installed npm packages themselves as the primary developer-facing contract. The twins must expand until those packages work end to end against local twin backends with no silent gaps.

## Constraints

- **Tech stack**: TypeScript + Express/Fastify for twins — same as Sandpiper, enables shared types and existing harness reuse
- **Runtime floor**: Node 20+ — `@shopify/shopify-api` requires Node `>=20`, and the Slack packages require Node `>=18`
- **State management**: SQLite or in-memory per twin — no external database dependencies for local test infrastructure
- **Source of truth**: Pinned upstream SDK forks plus installed npm packages — docs and README examples alone are not sufficient
- **Test strategy**: Official SDKs must hit live local HTTP, OAuth, and WebSocket paths — mocks are acceptable only for local-only utilities
- **Versioning**: One pinned version per targeted package for v1.1 — no silent floating updates or hidden compatibility assumptions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Official Shopify and Slack SDKs define the v1.1 fidelity boundary | Developer trust depends on the same packages application code actually uses | Validated — Phases 13-16 |
| Clone upstream repos first, then vendor repo-owned fork submodules | Source-level planning and export inventory must happen before long-term vendoring | Validated — Phase 13 |
| Phase numbering resumes at 13 for v1.1 | Existing Phase 12 artifacts already exist and are being rolled into this milestone's scope | Validated — roadmap continuation |
| One pinned version per targeted package for v1.1 | Literal full-surface scope is already large; multi-version matrices come later | Validated — revisit after v1.1 |
| setAbstractFetchFunc for shopify-api twin redirect | Overrides globalThis.fetch after node adapter import; redirects all shopify-api HTTP to twin | Validated — Phase 16 |
| Billing stubs acceptable for Phase 16 | Auth+session+webhooks are the core; billing uses minimal valid shapes without state machine | Validated — Phase 16 |
| TypeScript + Fastify over Go | Same language as Sandpiper, shared types, Fastify plugin architecture | Validated — both twins work well |
| Monorepo with shared tooling | Twins share HTTP framework, state management, webhooks, test harness | Validated — `@dtu/*` packages reused across twins |
| Shopify + Slack first | Critical tier in Sandpiper, largest API surface, highest test value | Validated — both twins complete |
| Conformance suites against real APIs | Catches twin drift, guarantees behavioral fidelity | Validated — framework built |
| Active webhook push | Full simulation of real service behavior, not just request-response | Validated — WebhookQueue with retry/DLQ |
| SQLite/in-memory state | Fast, deterministic, no external deps, resettable between runs | Validated — <100ms reset |
| Composition over inheritance for state | SlackStateManager wraps StateManager, keeps base clean | Validated — better separation |
| HTTP 200 for Slack API errors | Matching real Slack convention (`{ok: false}` on 200, not 4xx) | Validated — SDK-compatible |

| v1.2 fixes behavioral fidelity gaps before expanding scope | External adversarial review found 13 issues (2 Critical, 8 High); must fix before v2 | — Pending |

---
*Last updated: 2026-03-11 after v1.2 milestone start*
