---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Behavioral Fidelity
status: completed
stopped_at: Completed 21-02-PLAN.md
last_updated: "2026-03-12T03:07:22.276Z"
last_activity: 2026-03-12 — Phase 21 plan 01 complete; Node 22 LTS aligned across CI, Docker, and local dev
progress:
  total_phases: 15
  completed_phases: 9
  total_plans: 33
  completed_plans: 33
  percent: 98
---

# Project State: Sandpiper DTU

**Last Updated:** 2026-03-12
**Status:** Active — Phase 21 complete (both plans done)

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Milestone v1.2 Behavioral Fidelity — Phase 21 (Test Runner & Seeders) complete

## Current Position

Phase: 21 of 27 (Test Runner & Seeders)
Plan: 2 of 2 complete in current phase
Status: Phase 21 Complete — Next: Phase 22 (Shopify GraphQL Version Routing)
Last activity: 2026-03-11 — Phase 21 plan 02 complete; seeder forward-protection and Slack method-scopes catalog added

Progress: [██████████] 100% (v1.2: 2/2 plans complete in phase 21)

## Performance Metrics

**Velocity:** Reset for v1.2 milestone
**Avg Plans per Phase (v1.1):** ~4
**Avg Tasks per Plan (v1.1):** ~3
**Success Rate:** 100% (22/22 v1.1 requirements complete)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 21-01 | 01 | 2min | 2 | 4 |
| 21-02 | 02 | 8min | 2 | 3 |

## Accumulated Context

### Key Decisions

**2026-03-12 - Phase 21 Plan 01 (Node 22 LTS alignment):**
- Pin Node to 22 LTS across CI, Docker, and .nvmrc for ABI stability
- Rebuild better-sqlite3 from source in sdk-verification CI job only (the only job running pnpm test:sdk)
- No rebuild step in Dockerfile — pnpm install and runtime are same Node version, prebuilt binary fetched correctly
- pnpm test:sdk confirmed: 27 files, 177 tests, exit 0, no ABI crash

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

**2026-03-11 - Phase 21 Plan 02 (Seeder forward-protection):**
- Use POST /admin/tokens on Shopify twin so seedShopifyAccessToken() survives Phase 23 OAuth tightening
- Store Slack method-to-scope map in twins/slack/src/services/method-scopes.ts as single source of truth for seeders and Phase 26 enforcement
- allScopesString() grants union of all catalog scopes — seeded tokens work for all 177 tests plus future additions
- chat.startStream added to METHOD_SCOPES (was missing from plan, found via grep of test files)

**Critical pitfalls to remember (from research):**
- OAuth tightening (Phase 23) breaks `seedShopifyAccessToken()` unless `POST /admin/tokens` is added first — DONE in Phase 21-02
- Scope enforcement (Phase 26) breaks existing tests unless `seedSlackBotToken()` gets broad default scope first — DONE in Phase 21-02
- Shopify GraphQL version routing: graphql-yoga's `graphqlEndpoint` is static — Fastify handler must rewrite URL before `yoga.fetch()` (Phase 22)
- Slack state tables: every new SQLite table must be in a `SLACK_TABLES` constant iterated by `reset()` (Phase 25)
- Enable bidirectional conformance AFTER twin fixes are complete, not before (Phase 27 depends on Phases 24, 26)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

**Last completed:** Phase 21 plan 02 — Seeder forward-protection; POST /admin/tokens on Shopify twin; METHOD_SCOPES catalog; 177 tests passing
**Stopped at:** Completed 21-02-PLAN.md
**Timestamp:** 2026-03-12

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
