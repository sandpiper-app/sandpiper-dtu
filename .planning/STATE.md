---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Behavioral Fidelity
status: executing
stopped_at: Completed 24-03-PLAN.md
last_updated: "2026-03-13T02:44:22.343Z"
last_activity: "2026-03-13 — Phase 24 Plan 02 complete: persistent POST/GET products and GET orders/:id backed by StateManager prepared statements"
progress:
  total_phases: 15
  completed_phases: 11
  total_plans: 44
  completed_plans: 43
  percent: 97
---

# Project State: Sandpiper DTU

**Last Updated:** 2026-03-13
**Status:** In progress

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Milestone v1.2 Behavioral Fidelity — Phase 24 Plan 03 complete (rate limiter correctness)

## Current Position

Phase: 24 of 27 (Shopify REST Persistence, Billing State Machine & Rate Limiting)
Plan: 3 of 4 complete — ready for Plan 04 (billing state machine)
Status: Plan 24-03 complete — SHOP-24 rate limiter GREEN (5/5 tests pass), actualQueryCost computed from real items
Last activity: 2026-03-12 — Phase 24 Plan 03 complete: leaky bucket corrected to 1000 pts with refund() and computeActualCost() making empty-connection queries cost 1 pt

Progress: [██████████] 99% (overall: 43/44 currently planned plans complete)

## Performance Metrics

**Velocity:** Reset for v1.2 milestone
**Avg Plans per Phase (v1.1):** ~4
**Avg Tasks per Plan (v1.1):** ~3
**Success Rate:** 100% (22/22 v1.1 requirements complete)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 21-01 | 01 | 2min | 2 | 4 |
| 21-02 | 02 | 8min | 2 | 3 |
| 22-01 | 01 | 4min | 2 | 3 |
| 22-02 | 02 | 8min | 2 | 8 |
| 22-03 | 03 | 3.5min | 2 | 8 |
| 23-01 | 01 | 13min | 2 | 5 |
| 23-02 | 02 | 13min | 2 | 3 |
| 23-03 | 03 | 35min | 1 | 2 |
| 23-04 | 04 | 10min | 1 | 2 |
| 24-01 | 01 | 5min | 3 | 3 |
| 24-02 | 02 | 4min | 2 | 2 |
| 24-03 | 03 | 8min | 2 | 5 |

## Accumulated Context

### Key Decisions

**2026-03-12 - Phase 24 Plan 03 (Rate limiter correctness):**
- Shopify tryConsume allows requests when bucket > 0 (not >= cost) — bucket can go negative, next request throttled at <= 0; this matches real Shopify behavior and eliminates false billing.check throttling
- computeActualCost returns 1 (base cost) when all connections are empty; billing.check with 0 oneTimePurchases costs 1 pt instead of ~1000 pts post-execution
- Integration tests testing bucket exhaustion must seed matching fixtures — empty-result queries are nearly free after refund logic (net cost ~1 pt), so cannot exhaust bucket in a small loop
- POST /admin/tokens used for token seeding in rate-limit integration tests — consistent with Phase 24-01 decision, required because Phase 23 OAuth tightening broke the code-only OAuth pattern

**2026-03-13 - Phase 24 Plan 02 (REST persistence implementation):**
- Two-step product insert: createProduct with temp GID, then UPDATE gid to gid://shopify/Product/{rowId} after AUTOINCREMENT resolves — avoids needing to know row id before insert
- State package dist rebuild required after adding new StateManager methods — twin imports from compiled dist (pnpm -F @dtu/state build); plan 03 must include this step
- GET /products/:id.json uses getProduct(numericId) directly (integer PK lookup), not GID construction + getProductByGid() — simpler and correct
- SHOP-20 requirement fully satisfied: all 5 rest-persistence.test.ts tests GREEN

**2026-03-13 - Phase 24 Plan 01 (Wave 0 test scaffold):**
- Use POST /admin/tokens (not /admin/oauth/access_token) for token seeding in all new Phase 24 integration tests — Phase 23 OAuth tightening broke the code-only pattern used in older tests
- SHOP-21a uniqueness test calls appSubscriptionCreate twice and asserts different IDs — directly catches the hardcoded stub returning gid://shopify/AppSubscription/1
- SHOP-21d ownership test seeds a second token for other-shop.myshopify.com to test cross-shop rejection
- Wave 0 pattern established: write failing tests in RED state before implementation plans; Plans 02-04 have concrete verify commands

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

**2026-03-12 - Phase 22 Plan 01 (Shopify version routing and response headers):**
- Keep Yoga canonical endpoint fixed at /admin/api/2024-01/graphql.json; Fastify wrapper routes accept :version and rewrite URL before yoga.fetch()
- Set X-Shopify-API-Version before auth/throttle branches so 401 and 429 responses also carry the version header
- Build pagination Link header URL from req.params.version via buildAdminApiPath() — no hardcoded 2024-01 in Link header
- api-version.ts is the single shared utility for both GraphQL and REST plugins (parseShopifyApiVersion, setApiVersionHeader, buildAdminApiPath)

**2026-03-12 - Phase 22 Plan 02 (SDK helper cleanup and verification expansion):**
- Remove /admin/api/{version}/ → 2024-01 shims from all three SDK helpers; keep host rewriting only — twin routes :version natively (Phase 22-01)
- shopify-api canonicalizes response headers to Title-Case arrays: access X-Shopify-Api-Version (not x-shopify-api-version) with [0] index
- storefront-api-client response.headers is native Fetch Headers object — use .get('x-shopify-api-version') via cast, not bracket notation
- Dual-version SDK verification (2024-01 and 2025-01) now covers admin GraphQL, admin REST, and Storefront surfaces end-to-end

**2026-03-12 - Phase 22 Plan 03 (Shopify conformance harness version cleanup):**
- SHOPIFY_ADMIN_API_VERSION set to 2025-01 in conformance version helper; suites now declare current default, not legacy 2024-01
- op.path honored when present in both live and twin adapters; shopifyAdminGraphqlPath() used only as fallback
- gql() helper in pagination.test.ts parameterized with optional version argument defaulting to 2024-01 for backward compat

**2026-03-12 - Phase 23 Plan 02 (Storefront schema separation):**
- Storefront GraphQL now uses a dedicated SDL and Yoga instance so introspection on `/api/:version/graphql.json` cannot expose admin-only mutations
- Storefront auth rejects admin tokens in the Fastify route and again in Yoga context, producing a clean HTTP 401 while keeping resolver auth defensive
- Storefront SDK coverage now seeds explicit storefront/admin tokens and product fixtures through twin admin endpoints instead of relying on `clientCredentials()`

**2026-03-12 - Phase 23 Plan 04 (Storefront public-header compatibility):**
- Storefront auth now accepts both `Shopify-Storefront-Private-Token` and `X-Shopify-Storefront-Access-Token`, but always resolves the private header first so the pinned SDK path remains canonical
- The Fastify Storefront route and Storefront Yoga context share the same token-resolution helper, keeping public-header and private-header requests aligned on admin-token rejection behavior
- Sandbox restrictions blocked `pnpm test:sdk` socket-based verification here, so plan 04 was verified in-process with `buildApp()` plus `app.inject()` instead

**2026-03-12 - Phase 23 Plan 03 (OAuth client credential validation):**
- `/admin/oauth/access_token` now validates `client_id` and `client_secret` against `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` before issuing tokens for any grant type
- Auth-code requests still return `invalid_request` for missing fields, then `invalid_client` for wrong values, preserving the existing empty-body and invalid-grant contract
- Sandbox restrictions blocked live `pnpm test:sdk` verification here, so plan 03 was verified in-process with `buildApp()` plus `app.inject()` and the official Shopify SDK wired through `setAbstractFetchFunc()`

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

- This sandbox still blocks local socket binds, so `pnpm test:sdk` cannot boot the live twin harness here. Use in-process `buildApp()` verification or a normal shell when socket-bound test runs are required.

## Session Continuity

**Last completed:** Phase 24 Plan 03 — Rate limiter correctness (commits 227f6c6, 95268ce)
**Work in progress:** Phase 24 Plan 04 (billing state machine)
**Stopped at:** Completed 24-03-PLAN.md
**Timestamp:** 2026-03-12

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
