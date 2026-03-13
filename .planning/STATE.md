---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Behavioral Fidelity
status: planning
stopped_at: Completed 28-01-PLAN.md
last_updated: "2026-03-13T20:34:32.874Z"
last_activity: "2026-03-13 — Phase 30 Plan 02 complete: reactions.list real state query, views.update view_not_found, SLCK-17 try/catch test fixes, 248/248 GREEN"
progress:
  total_phases: 21
  completed_phases: 17
  total_plans: 62
  completed_plans: 58
  percent: 97
---

# Project State: Sandpiper DTU

**Last Updated:** 2026-03-13
**Status:** Ready to plan

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Milestone v1.2 Behavioral Fidelity — Phase 30 Plan 02 COMPLETE (SLCK-17 state table correctness: views.update view_not_found, reactions.list real state, try/catch test assertions)

## Current Position

Phase: 28 of 33 (Shopify REST Pagination & Version Policy) — IN PROGRESS
Plan: 1 of 3 complete
Status: Plan 28-01 complete — Wave 0 RED tests written; OAuth seeding migrated to POST /admin/tokens; 6 SHOP-23/SHOP-17 failing tests define contracts for Plans 02 and 03
Last activity: 2026-03-13 — Phase 28 Plan 01 complete: pagination.test.ts OAuth migration + 6 RED tests, SDK sentinel replacements with real multi-page assertions

Progress: [██████████] 97% (overall: 57/60 plans complete)

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
| Phase 24-04 P04 | 3min | 2 tasks | 4 files |
| Phase 25-01 P01 | 6min | 3 tasks | 4 files |
| Phase 25-03 P03 | 12min | 2 tasks | 7 files |
| Phase 25 P04 | 18min | 2 tasks | 7 files |
| Phase 25 P02 | 20min | 2 tasks | 6 files |
| Phase 26-01 P01 | 2min | 1 tasks | 1 files |
| Phase 26 P02 | 5min | 2 tasks | 4 files |
| Phase 26 P03 | 9min | 2 tasks | 10 files |
| Phase 27 P02 | 3min | 3 tasks | 6 files |
| Phase 27-01 P01 | 8min | 3 tasks | 6 files |
| Phase 30 P01 | 1min | 1 tasks | 2 files |
| Phase 29-01 P01 | 2min | 2 tasks | 2 files |
| Phase 30-02 P02 | 4min | 2 tasks | 5 files |
| Phase 29 P02 | 10min | 2 tasks | 3 files |
| Phase 28-01 P01 | 7 | 2 tasks | 3 files |

## Accumulated Context

### Key Decisions

**2026-03-13 - Phase 29 Plan 02 (integration test OAuth migration — SHOP-21):**
- OAuth describe blocks use full authorize→exchange flow (GET /admin/oauth/authorize + POST /admin/oauth/access_token with credentials) so OAuth endpoint behavior is genuinely tested
- All non-OAuth describe blocks use seedToken() via POST /admin/tokens — bypasses Phase 23 credential requirement without losing test coverage
- API Conformance form-urlencoded tests use full authorize flow with credentials in form-urlencoded format — preserves content-type coverage path
- rate-limit.test.ts was already migrated in Phase 24-03 (5/5 GREEN, isolation check confirmed skip)
- SHOP-21 fully satisfied: 50 previously-failing tests now GREEN across all 4 files

**2026-03-13 - Phase 28 Plan 01 (Wave 0 REST pagination + version policy tests):**
- Sentinel page_info=test tests removed from pagination.test.ts + SDK files; replaced with real multi-page assertions using limit=2 and 3 seeded products
- OAuth seeding in pagination.test.ts migrated to POST /admin/tokens (bypasses Phase 23 OAuth tightening)
- 4 RED tests define SHOP-23 REST cursor pagination contract (first page Link header, second page via cursor, invalid cursor 400, orders endpoint)
- 2 RED tests define SHOP-17 version policy contract (invalid month 2024-99, sunset version 2023-01)
- shopify-admin-rest-client: headers.get('link') returns null not undefined — use expect(linkHeader).not.toBeNull()

**2026-03-13 - Phase 29 Plan 01 (billing transition guards — SHOP-21e/21f):**
- Cancel guard placed after ownership check, before updateAppSubscriptionStatus — uses already-fetched subscription.status with zero extra DB reads
- Post-condition uses empty currentAppInstallation.activeSubscriptions to prove guard prevented mutation (PENDING/CANCELLED subs not visible in activeSubscriptions)
- SHOP-21 fully satisfied: all 6 billing behaviors (21a–21f) verified by 9/9 GREEN billing-state-machine tests

**2026-03-13 - Phase 30 Plan 01 (Slack EventDispatcher direct fetch() — SLCK-16):**
- Bypass WebhookQueue entirely for Slack event delivery: deliverWebhook() unconditionally injects Shopify headers before merging delivery.headers, so they always win
- EventDispatcherOptions.webhookQueue removed — EventDispatcher is now independent of @dtu/webhooks
- Direct fetch() pattern: JSON body + v0=${createHmac('sha256', secret).update(`v0:ts:body`).digest('hex')} sig in X-Slack-Signature header (same pattern as interactions.ts)
- AbortSignal.timeout(5000) for per-delivery timeout; individual network errors non-fatal (log and continue)
- SLCK-16a GREEN: delivered events carry X-Slack-Signature v0=<hex64> + X-Slack-Request-Timestamp; no X-Shopify-Hmac-Sha256

**2026-03-13 - Phase 30 Plan 02 (SLCK-17 state table correctness):**
- views.update with unknown view_id: return ok:false error:'view_not_found' (not ok:true fallback) — breaking change also requires fixing slack-views.test.ts (SLCK-08) to open a real view first
- reactions.list groups raw DB rows by (channel_id, message_ts) key using Map; each item holds reactions array with count and users — no more empty stub
- SLCK-17 test assertion pattern: WebClient throws on ok:false — tests must use try/catch with e.data?.error (same pattern as SLCK-15 in Phase 26-02)
- Task 1 product changes were pre-committed in feat(29-01) by the prior agent — listReactionsByUser, view_not_found fix, and form-parse guard all already in HEAD before this plan ran

**2026-03-13 - Phase 27 Plan 01 (conformance comparator fix + ShopifyTwinAdapter OAuth fix):**
- Union-of-keys (allKeys Set) in compareStructure catches both directions: twin-extra as 'added', baseline-only as 'deleted'
- Math.max(len) array traversal reports all element mismatches and length differences (not just index 0)
- sortArrayField helpers sort named arrays in both structural and exact modes before comparison
- ShopifyTwinAdapter.init() uses randomUUID token seeded via POST /admin/tokens — fixes Phase 23 OAuth tightening (client_id/client_secret required for /admin/oauth/access_token)
- comparisonMode:'exact' proof-of-concept on products-create-validation (deterministic error response)

**2026-03-13 - Phase 26 Plan 03 (universal scope enforcement — SLCK-18/19 across all 9 remaining plugins):**
- stub(method, extra?) factory pattern for stubs.ts/admin.ts/new-families.ts: method name as first arg enables checkScope() inside factory without 95+ inline call sites
- conversations.ts/users.ts have both shared checkAuth() AND inline auth blocks for list/info/history — both code paths needed separate scope enforcement
- pins.ts/reactions.ts/views.ts use synchronous authCheck() — checkScope() + header injection work synchronously before rate-limit check
- SLCK-18 (5/5) GREEN, SLCK-19 universal across all plugins; Phase 26 complete
- 4 pre-existing failures in slack-state-tables.test.ts are known failures with "This FAILS because..." comments — not caused by this plan

**2026-03-13 - Phase 26 Plan 02 (chat scope enforcement — SLCK-15/18/19):**
- checkAuthRateError return type widened to {token, tokenRecord} enabling ownership checks without second getToken() call
- Scope enforcement placed BEFORE rate-limit/error-sim in checkAuthRateError so missing_scope is never masked by simulated errors
- chat.postMessage refactored from inline auth to checkAuthRateError so SLCK-19 scope headers accompany all postMessage responses
- SLCK-15 tests fixed from result.ok pattern to try/catch (WebClient throws on ok:false, error.data.error contains the Slack error code)
- SLCK-15 (5/5) GREEN, SLCK-18 (3/5 — 18d/18e wait for Plan 03) GREEN, SLCK-19 (2/2) GREEN

**2026-03-13 - Phase 26 Plan 01 (Wave 0 failing tests — SLCK-15/18/19):**
- Attacker token seeded with broad scope ('chat:write,channels:read,...') but different userId (U_ATTACKER) so SLCK-15 tests isolate userId ownership check, not scope mismatch
- allScopesString() not imported in test file — hardcoded BROAD_SCOPE constant avoids coupling test to twin internals
- SLCK-18 non-chat scope tests (18d/18e) seed chat:write-only token inline per test (beforeEach calls resetSlack() clearing all tokens)
- Raw fetch() used for SLCK-18 and SLCK-19 tests: WebClient throws on ok:false masking error details and does not expose response headers
- 10 of 12 tests RED (enforcement not yet implemented), 2 regression guards GREEN (owner update/broad-scope post succeed as expected)

**2026-03-12 - Phase 25 Plan 02 (Slack method coverage — SLCK-14):**
- admin.ts covers 97 routes (plan said 95) — manifest had admin.apps.activities.list and admin.functions.* not in hand-listed plan
- new-families.ts deduplicates against existing plugins — conversations.acceptSharedInvite/inviteShared/etc already in conversations.ts; apps.manifest.*, oauth.*, team.extended, files.upload in stubs.ts
- Rule 1 fix: SlackStateManager was missing addChannelMember/removeChannelMember/getChannelMembers, createView/getView/updateView, addPin/removePin/listPins, removeReaction — 25-04 commit message claimed them but code was not applied
- Rule 1 fix: views.ts duplicate 'id' key { id: fallbackId, ...buildView(view) } -> { ...buildView(view), id: fallbackId }
- SLCK-14 fully satisfied: slack-method-coverage.test.ts 16/16 GREEN

**2026-03-13 - Phase 25 Plan 04 (SLCK-17 state tables):**
- SQLITE_CONSTRAINT_UNIQUE catch pattern used in pins.add and reactions.add for already_pinned/already_reacted errors
- conversations.open uses deterministic DM ID: D_${sorted users joined by _} so same user pair always yields same channel
- After reset() on in-memory SQLite, db reference captured before reset is stale — must re-read app.slackStateManager.database after reset
- InteractionHandler.baseUrl made optional (default localhost:3001) to fix pre-existing build error introduced in Plan 25-03
- views.update falls back to buildView for view_ids not found in store (backward compat with tests using made-up IDs)

**2026-03-13 - Phase 25 Plan 01 (Wave 0 failing tests):**
- openid.connect.token requires client_id and client_secret per @slack/web-api types — test calls must include both fields
- slack-signing.test.ts uses Awaited<ReturnType<typeof buildApp>> type (not FastifyInstance import) to avoid bare specifier resolution error in test files
- XCUT-01 smoke tests seed raw SQL via app.slackStateManager.database before reset, then assert count=0 after — will throw 'no such table' until Plan 04 creates the three new tables

**2026-03-13 - Phase 24 Plan 04 (Billing state machine):**
- Two-step GID pattern reused for app_subscriptions: insert with temp UUID gid, then UPDATE gid to gid://shopify/AppSubscription/{rowId} after AUTOINCREMENT resolves
- SDK billing cancel test updated to realistic flow (Option a): create via billing.request → confirm via GET → cancel using real GID; hardcoded gid://shopify/AppSubscription/1 removed
- GET /admin/charges/:id/confirm_recurring requires no auth — it is the browser confirmation flow (PENDING → ACTIVE transition + 302 redirect to returnUrl)
- SHOP-21 requirement fully satisfied: all 7 billing-state-machine.test.ts tests GREEN

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

**Last completed:** Phase 24 Plan 04 — Billing state machine (commits e6320cb, 18ff247)
**Work in progress:** None — Phase 24 complete, ready for Phase 25
**Stopped at:** Completed 28-01-PLAN.md
**Timestamp:** 2026-03-13

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
