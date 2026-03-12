---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Behavioral Fidelity
status: active
stopped_at: null
last_updated: "2026-03-11T00:00:00.000Z"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State: Sandpiper DTU

**Last Updated:** 2026-03-11
**Status:** Roadmap created — ready to plan Phase 21

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Milestone v1.2 Behavioral Fidelity — Phase 21 (Test Runner & Seeders)

## Current Position

Phase: 21 of 27 (Test Runner & Seeders)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-11 — v1.2 roadmap created; 7 phases mapped across 18 requirements

Progress: [░░░░░░░░░░] 0% (v1.2: 0/7 phases complete)

## Performance Metrics

**Velocity:** Reset for v1.2 milestone
**Avg Plans per Phase (v1.1):** ~4
**Avg Tasks per Plan (v1.1):** ~3
**Success Rate:** 100% (22/22 v1.1 requirements complete)

## Accumulated Context

### Key Decisions

**2026-03-11 - v1.2 Roadmap Creation:**
- 7 phases derived from 18 adversarial review requirements; granularity is fine
- Phase 21 (infrastructure) must land before behavioral changes — seeders are the regression trap
- Phases 22-24 (Shopify) and 25-26 (Slack) can execute as parallel tracks after Phase 21
- Phase 27 (conformance/coverage) must come after all twin behavioral fixes are complete
- Within Shopify: version routing (Phase 22) unblocks OAuth/Storefront (Phase 23) and REST/billing (Phase 24)
- Within Slack: state tables (Phase 25) unblock chat scoping and scope enforcement (Phase 26)
- No new runtime dependencies — all HMAC signing via node:crypto, state via existing better-sqlite3

**2026-03-11 - Completed quick task 2:**
- Fix Shopify twin empty variants resolver and audit related hardcoded resolvers (commit 83640c6)

**Critical pitfalls to remember (from research):**
- OAuth tightening (Phase 23) breaks `seedShopifyAccessToken()` unless `POST /admin/tokens` is added first (Phase 21)
- Scope enforcement (Phase 26) breaks existing tests unless `seedSlackBotToken()` gets broad default scope first (Phase 21)
- Shopify GraphQL version routing: graphql-yoga's `graphqlEndpoint` is static — Fastify handler must rewrite URL before `yoga.fetch()` (Phase 22)
- Slack state tables: every new SQLite table must be in a `SLACK_TABLES` constant iterated by `reset()` (Phase 25)
- Enable bidirectional conformance AFTER twin fixes are complete, not before (Phase 27 depends on Phases 24, 26)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

**Last completed:** v1.2 roadmap creation — 7 phases, 18 requirements mapped, 100% coverage
**Stopped at:** Roadmap written; ready for `pnpm plan-phase 21`
**Timestamp:** 2026-03-11

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
