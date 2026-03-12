# Project Research Summary

**Project:** Sandpiper DTU v1.2 — Behavioral Fidelity Fixes
**Domain:** Digital twin behavioral fidelity — Shopify Admin API and Slack Web API
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

Sandpiper DTU v1.2 is a behavioral correction milestone, not a feature expansion. The project involves fixing 13 specific behavioral fidelity gaps in existing Shopify and Slack digital twins, identified through adversarial review of a system with 177 currently passing SDK verification tests. Every fix uses zero new runtime dependencies — all work is achievable with Node.js built-ins (`node:crypto`) and libraries already present in the monorepo. This is a critical constraint: every tempting external library (keygrip, @slack/signature, jose, cookie-parser) has been explicitly researched and rejected in favor of in-process implementations using existing tooling.

The recommended approach is a strictly sequenced, phase-gated implementation where each phase ends with `pnpm test:sdk` passing before the next begins. The architecture research reveals a clean dependency graph: infrastructure fixes (ABI, test runner) must come first to enable measurement; Shopify fixes build on each other (version routing enables REST fixes, REST fixes enable billing); Slack fixes cluster around shared state infrastructure (SlackStateManager tables enable membership, views, pins, and scope enforcement). The most dangerous risk across all fixes is inadvertently breaking the 177 existing tests by tightening behavior that currently-passing tests relied on being permissive.

The dominant pitfall pattern is "tighten behavior without first updating the test infrastructure that depended on the permissive behavior." This surfaces three times: Shopify OAuth tightening will break `seedShopifyAccessToken()` unless a new `POST /admin/tokens` endpoint is added first; Slack scope enforcement will break minimal-scope test tokens unless `seedSlackBotToken()` receives a comprehensive default scope first; `chat.update`/`chat.delete` author scoping will break tests that implicitly used different tokens for post and update unless those tests are pre-audited. These are not hard problems, but they require seeder and test infrastructure changes to land in the same phase as the behavioral fixes.

## Key Findings

### Recommended Stack

No new dependencies are added in v1.2. The existing stack — Fastify 5, graphql-yoga 5, @graphql-tools/schema, better-sqlite3, vitest 3, @fastify/formbody — handles all requirements. Two areas deserve special attention: Shopify OAuth cookie signing uses `createHmac('sha256', apiSecretKey).update('name=value').digest('base64url')` (node:crypto, 4 lines), and Slack event signing uses `createHmac('sha256', signingSecret).update('v0:{ts}:{body}').digest('hex')` prefixed with `v0=` (node:crypto, 5 lines). Both algorithms were verified directly from SDK source files in `node_modules/`.

**Core technologies:**
- `fastify ^5.0.0`: Twin HTTP servers. All new routes are Fastify plugin additions; version wildcards use `:version` param.
- `graphql-yoga ^5.8.3`: Two separate Yoga instances in the Shopify twin post-fix — Admin at `/admin/api/:version/graphql.json`, Storefront at `/api/:version/graphql.json`.
- `@graphql-tools/schema ^10.0.0`: `makeExecutableSchema` for both Admin and Storefront schemas independently.
- `better-sqlite3 (via @dtu/state)`: New tables needed — `billing_subscriptions`, `oauth_codes` (Shopify); `slack_channel_members`, `slack_views`, `slack_pins` (Slack).
- `node:crypto`: All HMAC signing — Slack events (`v0=` prefix, hex), Shopify OAuth cookies (base64url), Shopify OAuth callback HMAC validation (hex, sorted params).
- `vitest ^3.0.0`: `test:sdk` fix is a config/ABI issue, not a version change.

### Expected Features

All 13 findings from adversarial review constitute the v1.2 feature set. There are no net-new features — only corrections to wrong or missing behavior.

**Must have (table stakes — required for twins to be considered correct):**
- Fix `pnpm test:sdk` (ABI mismatch + vitest config) — blocks all verification
- Bidirectional structural comparison in conformance harness — currently always passes in twin mode (compares twin against itself)
- Execution-evidence-based coverage tracking — currently hand-authored `LIVE_SYMBOLS` (300 lines, not proof)
- Shopify OAuth full flow: `GET /admin/oauth/authorize` with HMAC-signed redirect and cookie state, `POST /admin/oauth/access_token` with code validation
- Shopify Storefront API: separate schema at `/api/:version/graphql.json`, accept `X-Shopify-Storefront-Access-Token` header, no admin mutations exposed
- Shopify API version routing: parameterized `:version` routes replacing hardcoded `2024-01`
- Shopify REST: numeric IDs (not GIDs), `admin_graphql_api_id` field, persistent CRUD backed by StateManager
- Shopify billing state machine: PENDING → ACTIVE → CANCELLED with `confirmationUrl` endpoint
- Slack missing 126+ method stubs: `admin.*` (~70 methods), `canvases.*`, `workflows.*`, `apps.*`, `oauth.v2.exchange`
- Slack `chat.update`/`chat.delete` author + channel ownership enforcement
- Slack event delivery: `X-Slack-Signature` (v0=hex) + `X-Slack-Request-Timestamp` headers; absolute `response_url`; separate interactivity URL storage
- Slack stateful conversations/views/pins/reactions: membership tracking, view lifecycle, pin deduplication, reaction deduplication
- Slack OAuth scope enforcement: per-method scope map, `missing_scope` error with `needed` + `provided` fields

**Should have (differentiators that raise fidelity above basic stub behavior):**
- Shopify `X-Shopify-API-Version` response header (echo requested version)
- Slack `X-OAuth-Scopes` / `X-Accepted-OAuth-Scopes` response headers on successful calls
- Billing `appSubscriptionCancel` with ownership validation
- `Link` header with `page_info` cursor for paginated REST list endpoints

**Defer (v2+):**
- Full Storefront cart/checkout mutations — no Sandpiper integration currently
- Shopify edit window enforcement (`edit_window_closed`) — requires time-based logic, no test value unless testing edit windows
- Slack `admin.*` methods with real behavior — Enterprise Grid simulation not needed; stubs are sufficient
- Multiple Shopify API version schemas — version-parameterized routes with one schema is sufficient

### Architecture Approach

The v1.2 architecture modifies existing components without introducing new services or packages. The critical structural changes are: (1) the Shopify twin's `graphql.ts` goes from one Yoga instance to two, each with its own schema and registered at distinct route prefixes; (2) the `@dtu/webhooks` package's `WebhookDelivery` type gains a `signingMode: 'shopify' | 'slack'` discriminator so Slack events get the correct headers through the shared delivery infrastructure; and (3) `SlackStateManager` gains three new tables with a `SLACK_TABLES` constant that keeps `init()` and `reset()` synchronized. The existing per-family plugin structure for Slack Web API methods (one file per family: `chat.ts`, `conversations.ts`, etc.) is the established pattern that must be followed when adding the 126 missing method stubs.

**Major components (with v1.2 changes):**
1. `twins/shopify/src/plugins/graphql.ts` — MODIFIED: second Yoga instance (storefrontYoga) + Storefront schema; both routes parameterized with `:version`
2. `twins/shopify/src/plugins/oauth.ts` — MODIFIED: add `GET /admin/oauth/authorize` with HMAC-signed redirect and cookie state; add `POST /admin/tokens` admin seeder endpoint
3. `twins/shopify/src/plugins/rest.ts` — MODIFIED: `:version` wildcard, numeric IDs, `admin_graphql_api_id`, real CRUD via StateManager
4. `twins/shopify/src/schema/storefront.graphql` + `storefront-resolvers.ts` — NEW: Storefront-only SDL (products, collections, cart, no admin mutations)
5. `packages/state/src/state-manager.ts` — MODIFIED: `billing_subscriptions` table, `oauth_codes` table, `deleteProduct()`, expose integer `id` alongside GID
6. `twins/slack/src/plugins/web-api/admin.ts` + `workflows.ts` + `canvases.ts` + `apps.ts` + `slack-oauth-api.ts` — NEW: one file per method family, ~126 stubs total
7. `twins/slack/src/state/slack-state-manager.ts` — MODIFIED: `slack_channel_members`, `slack_views`, `slack_pins` tables; `SLACK_TABLES` constant; `reset()` includes all new tables
8. `twins/slack/src/services/event-dispatcher.ts` — MODIFIED: pass `signingMode: 'slack'` to WebhookQueue; inject absolute `response_url`
9. `packages/webhooks/src/webhook-delivery.ts` — MODIFIED: branch on `signingMode` for Slack vs Shopify header generation
10. `twins/slack/src/services/scope-requirements.ts` — NEW: static `Record<string, string>` of method → required scope
11. `packages/conformance/src/comparator.ts` — MODIFIED: bidirectional structural check; `strict?: boolean` parameter

### Critical Pitfalls

1. **OAuth tightening breaks `seedShopifyAccessToken()` before the seeder is updated** — Add `POST /admin/tokens` admin endpoint and update the seeder to use it before any OAuth code validation is added to the token exchange endpoint. All 24 Shopify SDK test files use this seeder.

2. **Scope enforcement breaks existing tests with minimal-scope tokens** — `seedSlackBotToken()` defaults to `scope: 'chat:write'`. Before any scope validation logic lands, update the seeder default to a comprehensive scope set covering all methods exercised in SDK tests. Add scope enforcement per-method, one at a time, running the full suite after each addition.

3. **API version routing breaks GraphQL while REST appears to work** — Fastify parameterized routes extend naturally to REST routes, but `graphql-yoga`'s internal `graphqlEndpoint` is a static string that does not honor Fastify route params. The Fastify handler must rewrite the URL before calling `yoga.fetch()`. Verify with an explicit test: `POST /admin/api/2025-01/graphql.json` must return a valid GraphQL response, not 404.

4. **Stateful Slack operations: `init()` tables not included in `reset()`** — Every new SQLite table must be added to a `SLACK_TABLES` constant and `reset()` must iterate it. Asymmetry between `init()` and `reset()` produces non-deterministic test failures that only surface when tests run in a certain order. Write the reset coverage test before any new tables are added.

5. **Conformance harness fixed before twin behavioral gaps are closed** — If bidirectional structural comparison is enabled while the twin still has known gaps, every conformance run reports failures and developers begin treating them as noise. Apply all twin behavioral fixes first; then enable strict conformance comparison against live APIs from a clean "0 failures" baseline.

## Implications for Roadmap

Based on combined research, the dependency graph is unambiguous. There is one clear Phase A that unblocks everything else, two parallel tracks (Shopify and Slack), and a final Phase D that can only land after the twin fixes are complete.

### Phase 1: Infrastructure Foundation

**Rationale:** The `pnpm test:sdk` entrypoint is broken. Without it, no other fix can be verified. The ABI fix and vitest config fix are low-effort; they unblock the entire remaining sequence. The seeder updates for OAuth and scope enforcement must also land here — not when the behavioral fixes land — to prevent the regression traps described in Pitfalls 1 and 6.
**Delivers:** Working `pnpm test:sdk` (all 177 existing tests pass); `POST /admin/tokens` seeder endpoint on Shopify twin; `seedSlackBotToken()` updated to use broad default scope; Node.js version pinned in Docker matching project's ABI.
**Addresses:** Fix 13 (SDK test entrypoint).
**Avoids:** Pitfall 1 (OAuth seeder), Pitfall 6 (scope seeder), Pitfall 13 (ABI mismatch in CI).

### Phase 2: Shopify Twin Fixes

**Rationale:** Shopify fixes have a clear internal dependency chain: (1) version routing must land before REST shape fixes (same routes need the wildcard), (2) OAuth must land after the seeder is updated (Phase 1), (3) billing must land after OAuth (requires authenticated session) and after REST shapes (numeric IDs establish the pattern). Storefront schema split is independent and can run in parallel with other Shopify work within this phase.
**Delivers:** All Shopify SDK tests passing against correct behavior — parameterized routes, OAuth full flow with HMAC-signed redirect, REST with numeric IDs + `admin_graphql_api_id` + persistent CRUD, Storefront separate schema, billing state machine.
**Implements:** Fix 5 (version routing) → Fix 3 (OAuth) + Fix 4 (Storefront) → Fix 6 (REST CRUD) → Fix 7 (billing).
**Avoids:** Pitfall 2 (version routing breaks GraphQL), Pitfall 3 (REST ID format breaks GraphQL resolvers), Pitfall 9 (billing state breaks existing billing tests), Pitfall 11 (Storefront schema split breaks type references).

### Phase 3: Slack Twin Fixes

**Rationale:** Slack fixes cluster around the `SlackStateManager` table additions (Fix 11) which must land before the operational fixes that depend on them (Fix 9 chat scoping requires reliable test setup, Fix 12 scope enforcement requires clean state). Fix 8 (126 missing methods) is purely additive with no state dependencies and can land in parallel. Event signing (Fix 10) touches the `@dtu/webhooks` shared package and is also independent.
**Delivers:** All Slack SDK tests passing against correct behavior — 126+ method stubs, stateful conversations/views/pins/reactions, chat author+channel scoping, event signing headers, scope enforcement per method.
**Implements:** Fix 8 (method stubs) + Fix 10 (event signing) + Fix 11 (state tables) → Fix 9 (chat scoping) + Fix 12 (scope enforcement).
**Avoids:** Pitfall 7 (duplicate route crash — pre-audit existing routes before adding stubs), Pitfall 8 (reset incompleteness — SLACK_TABLES constant), Pitfall 10 (signing secret mismatch breaks Bolt), Pitfall 12 (chat scoping breaks existing tests — pre-audit tests).

### Phase 4: Conformance and Coverage Infrastructure

**Rationale:** The conformance harness bidirectional check (Fix 1) and execution-evidence coverage tracking (Fix 2) must come after all twin behavioral fixes. Enabling strict structural comparison before the twin gaps are closed produces noisy failures. Replacing `LIVE_SYMBOLS` before the execution-evidence mechanism is wired into CI drops coverage tracking below the 202-symbol gate. Both fixes land cleanly when the twin is already correct.
**Delivers:** Conformance runner uses real twin-vs-live structural comparison in live mode; coverage report derived from execution evidence via Vitest JSON reporter rather than hand-authored `LIVE_SYMBOLS`; `pnpm drift:check` continues passing with 202+ live symbols throughout the transition.
**Implements:** Fix 1 (bidirectional conformance), Fix 2 (execution-evidence coverage).
**Avoids:** Pitfall 4 (conformance false failures on non-deterministic fields), Pitfall 5 (LIVE_SYMBOLS transition drops coverage tracking), Sequencing Pitfall S1 (infrastructure before twin fixes).

### Phase Ordering Rationale

- Phase 1 before everything: `pnpm test:sdk` must work to verify any fix, and the seeder updates must precede the behavioral changes they protect.
- Phases 2 and 3 can run in parallel if separate developers work on each track; they do not share code paths.
- Phase 4 after both Phases 2 and 3: the conformance harness needs a correct twin to establish a clean 0-failure baseline.
- Within Phase 2: Fix 5 → Fix 6 is a hard dependency (same routes); Fix 3 and Fix 4 are independent of each other and can run in parallel within the phase.
- Within Phase 3: Fix 8 and Fix 11 are independent and can run in parallel; Fix 9 and Fix 12 both depend on Fix 11 tables being available for test setup.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2, Fix 3 (Shopify OAuth):** The HMAC computation on the authorize redirect callback has many required fields (`code`, `hmac`, `host`, `shop`, `state`, `timestamp`). The exact algorithm (sorted params, URL-encoded, hex) is documented in STACK.md from source inspection but requires careful implementation planning. The seeder-first migration path also needs a concrete implementation plan before coding begins.
- **Phase 4, Fix 2 (Coverage transition):** The `LIVE_SYMBOLS` → execution-evidence migration must not drop the `pnpm drift:check` gate below 202 symbols at any point. The transition strategy (run both mechanisms in parallel, remove LIVE_SYMBOLS entries incrementally) needs a concrete plan per symbol group.

Phases with standard patterns (skip research-phase):
- **Phase 1:** ABI rebuild and vitest config fixes are straightforward operational tasks.
- **Phase 2, Fix 5 (version routing):** Well-documented Fastify parameterized route pattern; code example is in STACK.md.
- **Phase 2, Fix 6 (REST shapes):** SQLite autoincrement integer ID alongside GID is already the StateManager schema; just expose it in returned row objects.
- **Phase 3, Fix 8 (126 method stubs):** High volume, zero logic complexity. The `stub()` helper pattern is established; this is purely additive work.
- **Phase 3, Fix 10 (event signing):** 5-line HMAC computation fully specified in STACK.md with code example.
- **Phase 3, Fix 12 (scope enforcement):** Static data map + one function call per plugin. Pattern is fully specified in STACK.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings verified directly from `node_modules/` SDK source files. No version changes needed. Algorithm implementations are byte-for-byte from SDK source. |
| Features | HIGH | 13 adversarial review findings are precisely specified with exact error codes, field names, and correct behaviors from official Shopify and Slack documentation plus SDK source. |
| Architecture | HIGH | Based on direct codebase inspection of all referenced files with exact file+line references. Component modification targets are unambiguous. |
| Pitfalls | HIGH | 13 named pitfalls all derived from direct inspection of the test infrastructure (seeders.ts, vitest configs, existing plugin code). Not speculative — these are actual code paths that will break. |

**Overall confidence:** HIGH

### Gaps to Address

- **`pnpm test:sdk` exact failure mode:** FEATURES.md and ARCHITECTURE.md both note the ABI mismatch as confirmed, but the exact vitest config path issue ("no test files found") requires a quick diagnostic run before implementation to confirm whether the fix is a `testDir` change or a workspace project path correction.
- **`shopify-api-storefront-client.test.ts` coverage scope:** The Storefront schema must include exactly the types and fields that the existing SDK test exercises. The required type set is specified in STACK.md (products, collections, cart, customer read-only, QueryRoot) but should be cross-referenced against the test file during implementation.
- **`billing.check()` existing test behavior:** PITFALLS.md flags that existing `shopify-api-billing.test.ts` assertions must be audited before the state machine is added. The specific assertions that will break are not enumerated; this is a pre-implementation audit task.
- **Slack `SLACK_SIGNING_SECRET` in CI:** The default `'dev-signing-secret'` must match across the twin and all Bolt test apps. The exact env var configuration in the CI workflow was not inspected as part of this research.

## Sources

### Primary (HIGH confidence — direct SDK source inspection)
- `node_modules/@shopify/shopify-api/dist/cjs/lib/auth/oauth/oauth.js` — OAuth `begin()` cookie signing, `callback()` HMAC validation algorithm
- `node_modules/@shopify/shopify-api/dist/cjs/lib/auth/oauth/types.js` — Cookie names (`shopify_app_state`, `shopify_app_session`)
- `node_modules/@shopify/shopify-api/dist/cjs/lib/billing/check.js` + `request.js` — Billing query shapes, mutation names
- `node_modules/@shopify/admin-api-client/dist/graphql/client.js` + `dist/rest/client.js` — URL patterns, header names, lossless-json ID handling
- `node_modules/.pnpm/@shopify+graphql-client@1.4.1/.../api-versions.js` + `validations.js` — `validateApiVersion()` is a warning, not a throw; `2024-01` not in supported list as of March 2026
- `node_modules/.pnpm/@shopify+storefront-api-client@1.0.9/.../storefront-api-client.js` — URL `/api/{version}/graphql.json`, public vs private token headers
- `node_modules/@slack/web-api/dist/WebClient.js` + `dist/methods.js` — `slackApiUrl` param, `admin.*` bound methods, `x-oauth-scopes` header reading
- `node_modules/@slack/bolt/dist/receivers/verify-request.js` — Slack signing algorithm (verbatim)
- `node_modules/@slack/bolt/dist/App.js` lines 632-637 — `response_url` must be absolute URL

### Primary (HIGH confidence — direct codebase inspection)
- `twins/shopify/src/plugins/graphql.ts` — Single Yoga instance confirmed, hardcoded `2024-01` in 3 places
- `twins/shopify/src/plugins/oauth.ts` — Missing `GET /admin/oauth/authorize`, no credential validation confirmed
- `twins/shopify/src/plugins/rest.ts` — GID-format IDs on POST confirmed, hardcoded `2024-01` prefix
- `packages/state/src/state-manager.ts` — Schema, existing tables, `INTEGER PRIMARY KEY AUTOINCREMENT` on products
- `twins/slack/src/state/slack-state-manager.ts` — Missing membership/views/pins tables confirmed
- `twins/slack/src/plugins/web-api/chat.ts` — update/delete missing author+channel scope check confirmed
- `twins/slack/src/plugins/web-api/stubs.ts` — 60 methods covered, 126 families absent confirmed
- `packages/webhooks/src/webhook-delivery.ts` — Hardcoded Shopify headers confirmed
- `packages/conformance/src/runner.ts` lines 91-95 — `twin` mode sets `baselineResponse = twinResponse` confirmed
- `tests/sdk-verification/coverage/generate-report.ts` — 300-line hand-authored `LIVE_SYMBOLS` map confirmed

### Secondary (MEDIUM confidence — official documentation)
- [Shopify OAuth Authorization Code Grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) — authorize redirect shape, HMAC fields, token response shape
- [Shopify Storefront API docs](https://shopify.dev/docs/api/storefront) — endpoint URL, auth header names, schema surface
- [Shopify API versioning docs](https://shopify.dev/docs/api/usage/versioning) — fallback behavior, `X-Shopify-API-Version` header
- [Shopify REST Product docs](https://shopify.dev/docs/api/admin-rest/2024-01/resources/product) — numeric ID format, `admin_graphql_api_id` field, Link header pagination
- [Shopify GraphQL AppSubscriptionStatus](https://shopify.dev/docs/api/admin-graphql/latest/objects/appsubscription) — billing state machine states
- [Slack chat.update docs](https://docs.slack.dev/reference/methods/chat.update/) — author ownership rule, error codes
- [Slack chat.delete docs](https://docs.slack.dev/reference/methods/chat.delete/) — bot token deletion rules
- [Slack signing docs](https://docs.slack.dev/authentication/verifying-requests-from-slack) — HMAC algorithm for event delivery signing
- [Shopify API rate limits](https://shopify.dev/docs/api/admin-graphql#rate_limits) — `maximumAvailable: 1000.0`, `restoreRate: 50.0` (twin already correct)

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
