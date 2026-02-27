# Project State: Sandpiper DTU

**Last Updated:** 2026-02-27
**Status:** Phase 1 Complete, Transitioning to Phase 2

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Phase 2 context gathered. Ready for research and planning.

## Current Position

**Phase:** Phase 2 - Shopify Twin - Core Operations
**Plan:** 02 of 03
**Status:** In progress
**Progress:** [████████░░] 80%

## Performance Metrics

**Velocity:** 2 plans in 7 min
**Avg Plans per Phase:** 2 (Phase 1)
**Avg Tasks per Plan:** 2.5
**Success Rate:** 2/2 (100%)

## Accumulated Context

### Key Decisions

**2026-02-27 - Plan 02-01 Execution:**
- Use @graphql-tools/schema makeExecutableSchema for GraphQL Yoga 5.x compatibility
- Store tokens in StateManager tokens table cleared on reset
- Implement simplified OAuth flow without client_id/client_secret validation (twin-friendly)
- Add getProduct and getCustomer methods to StateManager for resolver lookups

**2026-02-27 - Plan 01-02 Execution:**
- buildApp() factory pattern for test-friendly Fastify twin construction
- Plugin encapsulation without fastify-plugin (no global scope needed)
- Prepared statements in StateManager for performance
- Pino structured logging with pino-pretty dev transport

**2026-02-27 - Plan 01-01 Execution:**
- Used pnpm 9.x (system installed) instead of plan-specified 10.x
- Used version range for typescript in packages instead of workspace:* (external dep)
- Extended @dtu/types with Entity types to prepare for Plan 02 StateManager

**2026-02-27 - Roadmap Creation:**
- 7 phases derived from requirements and research recommendations
- Foundation-first approach to establish shared infrastructure before twin implementation
- Shopify twin before Slack twin (GraphQL complexity validates pattern handles hardest case)
- Webhook system and conformance framework as separate phase after first twin proves pattern
- Twin UIs deferred to Phase 6 after both twins are feature-complete
- All 30 v1 requirements mapped to phases (100% coverage)

### Open Questions

None yet.

### TODOs

- [x] Begin Phase 1 planning with `/gsd:plan-phase 1`
- [x] Execute Phase 1 plans (01-01, 01-02)
- [ ] Research Shopify GraphQL Admin API specifics before Phase 2 planning (query cost calculation, webhook formats, OAuth scopes)
- [ ] Research Shopify bulk operations before Phase 4 planning (state machine, JSONL format, partial failures)
- [ ] Research Slack Events API specifics before Phase 5 planning (event envelope, Block Kit validation, rate limits)

### Blockers

None.

### Notes

**Research context available:** Comprehensive research completed covering stack decisions (Fastify, GraphQL Yoga, better-sqlite3, BullMQ, Vitest), architecture patterns (monorepo, behavioral clones, conformance testing), and critical pitfalls (fidelity traps, state management, twin-API drift).

**Depth setting:** Comprehensive (8-12 phases). Final roadmap has 7 phases respecting natural delivery boundaries and dependency chain.

**Phase ordering rationale:** Foundation → Shopify Core → Webhooks/Conformance → Shopify Advanced → Slack → UIs → Integration. This sequence ensures shared infrastructure is battle-tested before replication and validates patterns before extending them.

## Session Continuity

**Last completed:** 02-01-PLAN.md (Shopify Twin Foundation)
**Timestamp:** 2026-02-27T20:22:32Z

**For next session:**
1. Execute 02-02-PLAN.md (GraphQL API implementation)
2. Plan 02-01 established foundation: StateManager with 8 Shopify tables, OAuth token exchange, admin endpoints
3. GraphQL schema and resolvers framework exists, ready for full API implementation
4. Patterns established: GID format, token validation, @graphql-tools/schema usage

**Context required:**
- .planning/phases/02-shopify-twin-core-operations/02-01-SUMMARY.md (foundation just completed)
- .planning/phases/02-shopify-twin-core-operations/02-CONTEXT.md (Phase 2 decisions)
- .planning/ROADMAP.md (Phase 2 goals and requirements)
- .planning/REQUIREMENTS.md (SHOP-01, SHOP-02, SHOP-03, SHOP-07, INFRA-03, INFRA-04)

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
