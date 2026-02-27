# Project State: Sandpiper DTU

**Last Updated:** 2026-02-27
**Status:** Executing

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Phase 1 execution complete (2/2 plans). Awaiting verification.

## Current Position

**Phase:** Phase 1 - Foundation & Monorepo Setup
**Plan:** 2/2 complete
**Status:** Verifying
**Progress:** [░░░░░░░░░░░░░░░░░░░░] 0% (0/7 phases complete)

## Performance Metrics

**Velocity:** 2 plans in 7 min
**Avg Plans per Phase:** 2 (Phase 1)
**Avg Tasks per Plan:** 2.5
**Success Rate:** 2/2 (100%)

## Accumulated Context

### Key Decisions

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

**For next session:**
1. Phase 1 complete - monorepo foundation with shared packages, StateManager, example twin
2. Phase 2 next - Shopify GraphQL twin implementation
3. All tests passing (8/8), all packages building
4. StateManager reset: 0.2ms (target <100ms)

**Context required:**
- .planning/phases/01-foundation-monorepo-setup/01-01-SUMMARY.md (monorepo setup)
- .planning/phases/01-foundation-monorepo-setup/01-02-SUMMARY.md (StateManager + twin)
- packages/state/src/state-manager.ts (StateManager implementation)
- twins/example/src/index.ts (twin app pattern)

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
