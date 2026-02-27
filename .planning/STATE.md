# Project State: Sandpiper DTU

**Last Updated:** 2026-02-27
**Status:** Planning

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Roadmap created, ready to begin Phase 1 planning.

## Current Position

**Phase:** Phase 1 - Foundation & Monorepo Setup
**Plan:** None (phase planning not started)
**Status:** Not started
**Progress:** [░░░░░░░░░░░░░░░░░░░░] 0% (0/7 phases complete)

## Performance Metrics

**Velocity:** N/A (no phases completed)
**Avg Plans per Phase:** N/A
**Avg Tasks per Plan:** N/A
**Success Rate:** N/A

## Accumulated Context

### Key Decisions

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

- [ ] Begin Phase 1 planning with `/gsd:plan-phase 1`
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
1. Run `/gsd:plan-phase 1` to begin Foundation & Monorepo Setup planning
2. Phase 1 establishes monorepo structure, shared packages, development tooling, Docker base images
3. Phase 1 does NOT need deeper research (standard monorepo patterns well-documented)
4. Success criteria: Developer can create new twin using `@dtu/*` packages with full TypeScript support

**Context required:**
- PROJECT.md (core value, constraints)
- REQUIREMENTS.md (v1 requirements mapped to phases)
- ROADMAP.md (phase goals, success criteria, dependencies)
- research/SUMMARY.md (stack decisions, architecture patterns, pitfalls)

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
