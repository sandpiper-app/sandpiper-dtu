# Sandpiper DTU (Digital Twin Universe)

## What This Is

A collection of high-fidelity behavioral clones ("digital twins") of the third-party services that Sandpiper depends on — starting with Shopify and Slack. Each twin is a standalone TypeScript/Express HTTP server that replicates the real service's API surface, edge cases, and observable behaviors, enabling Sandpiper to run thousands of test scenarios without hitting rate limits, accumulating API costs, or depending on sandbox availability.

Inspired by StrongDM's "software factory" approach, where coding agents built behavioral clones of Okta, Jira, Slack, and Google services to enable deterministic, replayable testing at scale.

## Core Value

Sandpiper's integration tests can run against twins that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

## Requirements

### Validated

- Shopify twin replicates GraphQL API surface used by Sandpiper — Phases 2, 4
- Shopify twin handles OAuth flows (token exchange) — Phase 2
- Shopify twin delivers webhooks to configured callback URLs on state changes — Phase 3
- Slack twin replicates Web API, Events API, and OAuth installation flow — Phase 5
- Slack twin supports Block Kit interactions (block_actions/button clicks) — Phase 5
- Slack twin delivers event webhooks on state changes (messages, app_mention, reaction_added) — Phase 5
- Each twin manages internal state (SQLite, resettable in <100ms) — Phases 1-5
- Each twin simulates error responses, rate limiting, auth failures, and pagination — Phases 2, 4, 5
- Conformance test suites validate twin behavior against real sandbox APIs — Phase 3
- Conformance suites run periodically to catch upstream API drift — Phase 3
- Shared monorepo infrastructure (test harness, HTTP framework, validation tools) — Phase 1

### Active

- [ ] Base URL swap lets Sandpiper point integration clients at twin URLs
- [ ] Docker-compose overlay wires twins + Sandpiper together for CI/E2E
- [ ] Twin UIs for state inspection and manual testing

### Out of Scope

- Nylas twin — deferred to after Shopify + Slack prove the pattern
- Shippo twin — deferred to after Shopify + Slack prove the pattern
- Triple Whale twin — low priority, nice-to-have integration in Sandpiper
- Full Shopify Admin API coverage — only endpoints Sandpiper uses, built from API contracts + real-world edge cases
- Production deployment of twins — these are dev/test infrastructure only
- Go implementation — staying in TypeScript for shared types and team familiarity

## Context

**Sandpiper** is a proactive AI assistant for ecommerce merchants. It processes events from Shopify, Slack, email, and shipping services through a three-tier triage pipeline, learns merchant preferences, and executes actions with permission gating. It's built with Node.js 20+, TypeScript, Express, PostgreSQL, Redis, and Anthropic Claude.

**Current testing pain points:**
- Integration tests depend on sandbox environments (Shopify dev store, Nylas sandbox, Shippo test API) that are flaky, rate-limited, and slow
- Unit tests use `vi.fn()` mocks that don't catch behavioral mismatches with real APIs
- Edge cases (rate limits, circuit breaker trips, webhook retry logic, OAuth token expiry) are hard to trigger reliably against real services
- E2E tests require full Docker stack (PostgreSQL, Redis, Letta) plus live sandbox credentials

**StrongDM's DTU approach solves this by:**
- Building behavioral clones from API contracts (official docs, GraphQL schemas) and real-world edge cases (Stack Overflow, GitHub issues, client library behavior)
- Validating clones against real services until behavioral differences disappear
- Running conformance suites periodically to detect upstream API drift
- Enabling deterministic, replayable test conditions at any scale

**Sandpiper's integration architecture helps:** All external calls go through `IntegrationClient` with configurable base URLs, circuit breakers, and retry logic. Swapping real service URLs for twin URLs requires minimal changes.

## Constraints

- **Tech stack**: TypeScript + Express for twins — same as Sandpiper, enables shared types
- **State management**: SQLite or in-memory per twin — no external database dependencies for test infrastructure
- **Fidelity source**: API contracts (Shopify GraphQL schema, Slack API docs) as primary source, verified against real sandbox APIs and enriched with edge cases from community sources
- **Integration**: Must support both base-URL swap (dev/unit) and docker-compose overlay (CI/E2E)
- **Webhook delivery**: Twins actively push webhooks on state changes — not passive-only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + Fastify over Go | Same language as Sandpiper, shared types, Fastify plugin architecture | Validated — both twins work well |
| Monorepo with shared tooling | Twins share HTTP framework, state management, webhooks, test harness | Validated — @dtu/* packages reused across twins |
| Shopify + Slack first | Critical tier in Sandpiper, largest API surface, highest test value | Validated — both twins complete |
| Conformance suites against real APIs | Catches twin drift, guarantees behavioral fidelity | Validated — framework built |
| Active webhook push | Full simulation of real service behavior, not just request-response | Validated — WebhookQueue with retry/DLQ |
| SQLite/in-memory state | Fast, deterministic, no external deps, resettable between runs | Validated — <100ms reset |
| Composition over inheritance for state | SlackStateManager wraps StateManager, keeps base clean | Validated — better separation |
| HTTP 200 for Slack API errors | Matching real Slack convention ({ok: false} on 200, not 4xx) | Validated — SDK-compatible |

---
*Last updated: 2026-02-28 after Phase 5*
