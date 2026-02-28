# Project State: Sandpiper DTU

**Last Updated:** 2026-02-28
**Status:** Milestone complete

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Phase 3 complete. @dtu/webhooks, @dtu/conformance, and Shopify conformance suite all shipped. Ready for Phase 4 (Shopify Advanced Features).

## Current Position

**Phase:** Phase 3 - Webhook System & Conformance Framework
**Plan:** 03-01 complete, 03-02 complete, 03-03 complete
**Status:** Phase 3 complete
**Progress:** [██████████] 100%

## Performance Metrics

**Velocity:** 2 plans in 7 min
**Avg Plans per Phase:** 2 (Phase 1)
**Avg Tasks per Plan:** 2.5
**Success Rate:** 2/2 (100%)

## Accumulated Context

### Key Decisions

**2026-02-28 - Plan 03-03 Execution:**
- tsx/esm loader strategy: 'node --import tsx/esm' enables running compiled CLI with TS source adapters without separate compilation step
- DLQ not cleared on reset: StateManager.reset() closes SQLite connection invalidating DLQ store's cached DB reference - DLQ cleared via dedicated endpoint
- deep-diff ESM interop fix: use default import with .diff accessor for CJS module under tsx/esm strict ESM resolution
- webhookSubscriptionCreate ID: createWebhookSubscription() returns void; query listWebhookSubscriptions() after creation to find ID

**2026-02-28 - Plan 03-02 Execution:**
- Used deep-diff library for structural response comparison; maps N/D/E/A kinds to added/deleted/changed/array
- Field normalization uses dot-path notation with * wildcard for array traversal (body.edges.*.node.id)
- Twin-only mode compares response to itself (always passes) - useful for structural smoke testing
- CLI requires --twin-adapter flag; suite path can be positional or --suite flag
- Fixture IDs sanitized to filesystem-safe characters via regex

**2026-02-28 - Plan 03-01 Execution:**
- In-memory queue with SQLite DLQ only: BullMQ+Redis rejected as over-engineered for local dev/test tool
- Sync mode (syncMode=true) for test assertions: enqueue() awaits delivery and throws on failure
- SqliteDeadLetterStore shares StateManager's DB connection to avoid multiple SQLite connections
- Compressed timing via timeScale multiplier: 0.001 makes 1-minute retries happen in 60ms
- Retry array [0, 60000, 300000] = 3 total attempts (immediate, 1min, 5min) before DLQ
- Config-file webhook subscriptions loaded from WEBHOOK_SUBSCRIPTIONS_FILE env var

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

**2026-02-27 - Plan 02-05 Execution (Gap Closure):**
- productUpdate resolver: parse GID, check exists, merge fields preserving existing values, trigger products/update webhook
- fulfillmentCreate resolver: validate orderId GID, create with generated fulfillment GID, trigger fulfillments/create webhook
- Fulfillment type resolver includes order reference via getOrderByGid for graph traversal
- Default fulfillment status to "success" matching Shopify common flow

**2026-02-27 - Plan 02-04 Execution:**
- Generate GIDs using Date.now() + Math.floor(Math.random() * 100000) pattern before StateManager create calls in fixtures endpoint (matches resolver pattern)
- Spread fixture data with { ...fixture, gid } to preserve any extra fields callers might include

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

**Last completed:** Phase 3 Plan 03 - Shopify integration with @dtu/webhooks and conformance suites
**Stopped at:** Completed 03-03-PLAN.md
**Timestamp:** 2026-02-28

**For next session:**
1. Phase 3 complete — all 3 plans shipped:
   - 03-01: @dtu/webhooks package (WebhookQueue, SqliteDeadLetterStore)
   - 03-02: @dtu/conformance framework (runner, adapters, CLI)
   - 03-03: Shopify integration (async queue, DLQ admin, GraphQL subscription, conformance suites)
2. `pnpm --filter @dtu/twin-shopify run conformance:twin` passes 10/10 tests
3. All 37 Shopify twin integration tests pass
4. CI workflow at .github/workflows/conformance.yml ready for deployment
5. Next: Phase 4 (Shopify Advanced Features) or research phase

**Context required:**
- .planning/phases/03-webhook-system-conformance-framework/03-03-SUMMARY.md (this phase)
- twins/shopify/conformance/ (suite/adapter patterns to reuse for Slack twin)
- packages/webhooks/src/index.ts (webhook queue API)

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
