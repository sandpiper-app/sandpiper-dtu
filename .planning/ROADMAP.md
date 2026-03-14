# Roadmap: Sandpiper DTU

**Project:** Sandpiper DTU (Digital Twin Universe)
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.
**Created:** 2026-03-09
**Depth:** Comprehensive

## Milestones

- ✅ **v1.0 Foundation** - Phases 1-12 (shipped 2026-02-28)
- ✅ **v1.1 Official SDK Conformance** - Phases 13-20 (shipped 2026-03-10)
- 🚧 **v1.2 Behavioral Fidelity** - Phases 21-37 (in progress)

## Phases

<details>
<summary>✅ v1.0 Foundation (Phases 1-12) - SHIPPED 2026-02-28</summary>

- [x] **Phase 1: Monorepo Foundation** - Shared tooling, state management, and HTTP framework
- [x] **Phase 2: Shopify GraphQL Twin** - Admin GraphQL API, OAuth, session management
- [x] **Phase 3: Webhooks & Conformance Framework** - Active webhook push, conformance runner
- [x] **Phase 4: Shopify Advanced Features** - Relay pagination, rate limiting, fulfillment state machine
- [x] **Phase 5: Slack Twin** - Web API, Events API, OAuth, Block Kit
- [x] **Phase 6: Twin UIs** - State inspection and manual testing interfaces
- [x] **Phase 7: Docker & CI Integration** - Docker-compose overlay, E2E wiring
- [x] **Phases 8-12: Extended twin coverage and conformance hardening**

</details>

<details>
<summary>✅ v1.1 Official SDK Conformance (Phases 13-20) - SHIPPED 2026-03-10</summary>

- [x] **Phase 13: Upstream SDK Mirrors & Surface Inventory** - Freeze upstream source truth and generate public-surface manifests (completed 2026-03-09)
- [x] **Phase 14: Verification Harness Foundation & Legacy Gap Merge** - Build the shared SDK verification workspace and absorb old manual verification coverage (completed 2026-03-09)
- [x] **Phase 15: Shopify Admin Client Compatibility** - Make the Shopify twin satisfy `@shopify/admin-api-client` (completed 2026-03-09)
- [x] **Phase 16: Shopify `shopify-api` Platform Surface** - Make auth, session, utils, webhooks, billing, flow, and fulfillment-service helpers work against the twin (completed 2026-03-09)
- [x] **Phase 17: Shopify Client Surfaces & Strategic REST Stubs** - Cover Shopify client surfaces and strategically stub deprecated REST resource classes (completed 2026-03-09)
- [x] **Phase 18: Slack WebClient Full Surface** - Make the Slack twin satisfy the full pinned `@slack/web-api` surface (completed 2026-03-10)
- [x] **Phase 19: Slack OAuth & Bolt HTTP Surface** - Make `@slack/oauth` and Bolt's HTTP/Express application surface work against the twin (completed 2026-03-10)
- [x] **Phase 20: Bolt Alternate Receivers & Drift Automation** - Close Socket Mode/AWS receiver gaps and enforce long-term SDK drift detection (completed 2026-03-10)

</details>

### 🚧 v1.2 Behavioral Fidelity (In Progress)

**Milestone Goal:** Fix adversarial review findings so the twins genuinely behave like the real services — builds pass, coverage is truly evidence-based, OAuth flows are real, REST state persists with correct ID round-trips, Slack covers all 275+ methods with correct scope/auth semantics, and conformance proves 1:1 behavior.

- [x] **Phase 21: Test Runner & Seeders** - Fix `pnpm test:sdk` ABI mismatch and update seeders before behavioral changes land (completed 2026-03-12)
- [x] **Phase 22: Shopify Version Routing & Response Headers** - Parameterize API version routes and add conformance response headers (completed 2026-03-12)
- [x] **Phase 23: Shopify OAuth & Storefront** - Implement real OAuth authorize/callback flow and split Storefront schema (completed 2026-03-12)
- [x] **Phase 24: Shopify REST Persistence, Billing State Machine & Rate Limiting** - Persistent CRUD with real shapes, billing state machine, and accurate rate limiting (completed 2026-03-13)
- [x] **Phase 25: Slack Method Coverage, Event Signing & State Tables** - Close 126-method gap, fix event headers, and add membership/view/pin state (completed 2026-03-13)
- [x] **Phase 26: Slack Chat Scoping & Scope Enforcement** - Author/channel ownership rules and per-method OAuth scope requirements (completed 2026-03-13)
- [x] **Phase 27: Conformance Harness & Coverage Infrastructure** - Bidirectional structural comparison and execution-evidence coverage tracking (completed 2026-03-13)
- [x] **Phase 28: Shopify REST Pagination & Version Policy** - Real cursor pagination and supported version validation (gap closure) (completed 2026-03-13)
- [x] **Phase 29: Shopify Billing Transitions & Test Migration** - Billing state machine guards and legacy test migration (gap closure) (completed 2026-03-13)
- [x] **Phase 30: Slack Transport & State Fixes** - Provider-aware event delivery and stateful reactions/views (gap closure) (completed 2026-03-13)
- [x] **Phase 31: Slack OAuth & Method Coverage** - OAuth exchange validation and comprehensive method smoke tests (gap closure) (completed 2026-03-13)
- [x] **Phase 32: Conformance Harness & Evidence** - Primitive value comparison and real execution evidence (gap closure) (completed 2026-03-13)
- [x] **Phase 33: Cross-Cutting Reset Coverage** - Verify all new SQLite tables in StateManager reset logic (gap closure) (completed 2026-03-14)
- [x] **Phase 34: Slack Build Fix & Evidence Pipeline** - Fix Slack twin compile error and rewrite coverage attribution from actual test evidence (second review remediation) (completed 2026-03-14)
- [ ] **Phase 35: Slack Behavioral Parity** - OpenID Connect, filesUploadV2, auth/scope semantics, deferred method registration (second review remediation)
- [ ] **Phase 36: Shopify Behavioral Parity** - OAuth grant types, missing REST routes, ID round-trip, list filter semantics (second review remediation)
- [ ] **Phase 37: Billing Fidelity & Conformance Rigor** - Persistent billing shapes and conformance harness 1:1 proof (second review remediation)

## Phase Details

### Phase 13: Upstream SDK Mirrors & Surface Inventory
**Goal**: Freeze the literal SDK source of truth inside the repo and generate a machine-readable coverage contract.
**Depends on:** Completed v1.0 twin baseline
**Requirements**: INFRA-10, INFRA-11, INFRA-16
**Success Criteria** (what must be TRUE):
  1. Developer can initialize repo-owned fork submodules for `shopify-app-js`, `node-slack-sdk`, and `bolt-js` under `third_party/upstream/` and see pinned SHAs plus package versions recorded
  2. Developer can run inventory tooling (using `ts-morph` v25.0.1+ for reliable export enumeration) that emits manifests for `@shopify/admin-api-client`, `@shopify/shopify-api`, `@slack/web-api`, `@slack/oauth`, and `@slack/bolt`
  3. Generated manifests record every public symbol and method from the pinned packages with stable IDs suitable for coverage tracking
  4. Manifest diffs clearly show added or removed surface when a ref or package version changes
  5. SDK packages are installed at workspace root, not per-twin; Vitest aligns to ^3.0.0 across workspace
**Plans:** 3/3 plans complete

Plans:
- [x] 13-01-PLAN.md — Workspace config and CI submodule checkout (vitest.config.ts, twin Vitest alignment, conformance.yml + e2e.yml)
- [x] 13-02-PLAN.md — SDK package installs, ts-morph inventory generator, and five manifest JSON files
- [x] 13-03-PLAN.md — Git submodule add for three upstream forks, SHA pinning, and sdk-pins.json

### Phase 14: Verification Harness Foundation & Legacy Gap Merge
**Goal**: Build the shared verification harness that all SDK conformance work will use, merge the old manual verification checks into it, and establish the `auth.test` gateway and SDK URL redirection patterns.
**Depends on:** Phase 13
**Requirements**: INFRA-12, INFRA-13, INFRA-14 (basic drift), INFRA-15, SLCK-06.5
**Success Criteria** (what must be TRUE):
  1. Developer can run a dedicated SDK verification workspace that boots reusable Shopify and Slack twin instances plus shared fixture seeders
  2. Official SDK packages hit live local HTTP/WebSocket endpoints using SDK URL redirection mechanisms (`customFetchApi` for Shopify, `slackApiUrl` for Slack), not mocked transports
  3. Slack twin responds to `auth.test` and `api.test` with valid auth verification responses, enabling WebClient initialization (the gateway for all Slack SDK work)
  4. HMAC signature, async webhook timing, and UI structure checks run in the same verification command as the SDK suites
  5. Coverage reports show per-symbol ownership across generated and curated tests
  6. Basic drift detection validates that pinned submodule refs match installed package versions and generated manifests
**Plans:** 5/5 plans complete

Plans:
- [x] 14-01-PLAN.md — Slack twin auth.test and api.test routes (authPlugin)
- [x] 14-02-PLAN.md — SDK verification workspace scaffold (vitest config, global setup, client helpers, test:sdk script)
- [x] 14-03-PLAN.md — SDK gateway tests: Slack auth.test via WebClient, Shopify client wire-up
- [x] 14-04-PLAN.md — Legacy conformance migration: HMAC signature, async webhook timing, UI structure tests
- [x] 14-05-PLAN.md — Coverage ledger (coverage-report.json) and basic drift detection script

### Phase 15: Shopify Admin Client Compatibility
**Goal**: Make the Shopify twin satisfy the low-level Admin GraphQL and generic REST clients.
**Depends on:** Phase 14
**Requirements**: SHOP-08, SHOP-09
**Success Criteria** (what must be TRUE):
  1. `createAdminApiClient()` request, fetch, getHeaders, and getApiUrl behaviors pass against the Shopify twin for pinned and per-request API versions
  2. `createAdminRestApiClient()` get, post, put, and delete behaviors pass against the Shopify twin with correct headers, search params, payload encoding, and retry semantics
  3. Twin-side auth, versioning, and error semantics match what the low-level Shopify clients expect
**Plans:** 3/3 plans complete

Plans:
- [x] 15-01-PLAN.md — GraphQL client method tests (request, fetch, getHeaders, getApiUrl) for SHOP-08
- [x] 15-02-PLAN.md — REST plugin for Shopify twin + createRestClient() helper for SHOP-09
- [x] 15-03-PLAN.md — REST client tests (all 4 verbs, searchParams, headers, retry, auth error) + coverage ledger update

### Phase 16: Shopify `shopify-api` Platform Surface
**Goal**: Make the high-level Shopify platform helpers work against the twin. Auth, session, and webhooks are the core; billing is lower priority and can be stubbed initially.
**Depends on:** Phase 15
**Requirements**: SHOP-10, SHOP-11, SHOP-12, SHOP-13
**Success Criteria** (what must be TRUE):
  1. Auth helpers complete begin, callback, token exchange, refresh, client credentials, and embedded URL flows against the Shopify twin
  2. Session and utility helpers create, decode, validate, and resolve twin-backed session data correctly
  3. Webhook, Flow, and fulfillment-service validation helpers accept valid twin-generated requests and reject invalid ones correctly
  4. Billing helpers can request, inspect, cancel, and mutate billing state against the Shopify twin _(lower priority — can be stubbed initially)_
**Plans:** 4/4 plans complete

Plans:
- [x] 16-01-PLAN.md — shopify-api-client.ts helper factory (setAbstractFetchFunc + mintSessionToken + computeShopifyHmac) + shopify-api-webhooks.test.ts (SHOP-12, 7 tests)
- [x] 16-02-PLAN.md — shopify-api-session.test.ts: decodeSessionToken, getOfflineId, getJwtSessionId, customAppSession, getCurrentId (SHOP-11, 7 tests)
- [x] 16-03-PLAN.md — shopify-api-auth.test.ts: tokenExchange, refreshToken, clientCredentials, begin, embedded URL helpers (SHOP-10, 6 tests)
- [x] 16-04-PLAN.md — Billing GraphQL stubs on twin schema/resolvers + shopify-api-billing.test.ts (SHOP-13, 3 tests) + coverage ledger update

### Phase 17: Shopify Client Surfaces & Strategic REST Stubs
**Goal**: Cover the Shopify client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) and strategically stub deprecated REST resource classes. Full REST resource implementation is deprioritized given Shopify's April 2025 REST deprecation mandate.
**Depends on:** Phase 16
**Requirements**: SHOP-14, SHOP-15
**Success Criteria** (what must be TRUE):
  1. `shopify.clients.Graphql`, `Rest`, `Storefront`, and `graphqlProxy` work against the Shopify twin with the pinned package configuration
  2. Strategic REST resource classes (those still commonly used) have twin coverage for the methods they expose; deprecated REST resources are tracked in manifest but stubbed rather than fully implemented
  3. The Shopify twin exposes the endpoints, shapes, and state transitions required by the client surfaces without hidden manual allowlists
**Plans:** 4/4 plans complete

Plans:
- [x] 17-01-PLAN.md — GraphqlClient + graphqlProxy tests (6 tests, SHOP-14)
- [x] 17-02-PLAN.md — REST plugin Tier 1/2 routes + RestClient + REST resource class tests (8 tests, SHOP-14, SHOP-15)
- [x] 17-03-PLAN.md — Storefront twin endpoint + StorefrontClient tests (3 tests, SHOP-14)
- [x] 17-04-PLAN.md — Coverage ledger update: Phase 17 client surfaces + all 74 REST resource tier attributions (SHOP-14, SHOP-15)

### Phase 18: Slack WebClient Full Surface
**Goal**: Make the Slack twin satisfy the full pinned `@slack/web-api` package surface using a tiered method family strategy.
**Depends on:** Phase 14
**Requirements**: SLCK-07, SLCK-08
**Success Criteria** (what must be TRUE):
  1. `WebClient` base behaviors (`apiCall`, `paginate`, `filesUploadV2`, `ChatStreamer`, retry and rate-limit handling) pass against the Slack twin
  2. Tier 1 method families (chat, conversations, users, reactions, pins, auth, views: ~60 methods) have full twin coverage with correct shapes and semantics
  3. Tier 2 method families (files, search, reminders) are stubbed with valid response shapes
  4. Tier 3 method families (admin.*) are deferred — tracked in manifest but not implemented in this phase
  5. Every bound method in the pinned `@slack/web-api` package maps to a declared coverage entry (live test, stub, or deferred)
**Plans:** 5/5 plans complete

Plans:
- [x] 18-01-PLAN.md — rate-limiter expansion + files.ts plugin (filesUploadV2 chain) + chat.ts expansion (13 methods) + slack-webclient-base.test.ts + slack-chat.test.ts (SLCK-07, SLCK-08)
- [x] 18-02-PLAN.md — conversations.ts expansion (28 methods) + users.ts expansion (12 methods) + slack-conversations.test.ts + slack-users.test.ts (SLCK-08)
- [x] 18-03-PLAN.md — reactions.ts + pins.ts + views.ts plugins + index.ts registration + 3 test files (SLCK-08)
- [x] 18-04-PLAN.md — stubs.ts plugin (Tier 2 + misc families) + index.ts registration + slack-stubs-smoke.test.ts (SLCK-08)
- [x] 18-05-PLAN.md — Coverage ledger update: generate-report.ts LIVE_SYMBOLS + pnpm coverage:generate (SLCK-07, SLCK-08)

### Phase 19: Slack OAuth & Bolt HTTP Surface
**Goal**: Make Slack OAuth and Bolt's HTTP-oriented framework surface work against the twin.
**Depends on:** Phase 18
**Requirements**: SLCK-09, SLCK-10, SLCK-11
**Success Criteria** (what must be TRUE):
  1. `InstallProvider` install path, state, callback, and authorize flows work end to end against the Slack twin
  2. Bolt `App` listener APIs handle events, messages, actions, commands, options, shortcuts, views, functions, and assistant flows with correct ack semantics
  3. HTTPReceiver and ExpressReceiver verify requests, satisfy URL verification, support response_url flows, and honor custom routes against the Slack twin
**Plans:** 4/4 plans complete

Plans:
- [x] 19-01-PLAN.md — oauth.v2.access fix (enterprise: null) + InstallProvider flow tests (SLCK-09)
- [x] 19-02-PLAN.md — Bolt App listener API tests via processEvent() — 9 listener types (SLCK-10)
- [x] 19-03-PLAN.md — HTTPReceiver + ExpressReceiver tests — url_verification, HMAC, event delivery, custom routes (SLCK-11)
- [x] 19-04-PLAN.md — Coverage ledger update: @slack/oauth + @slack/bolt LIVE_SYMBOLS + pnpm coverage:generate (SLCK-09, SLCK-10, SLCK-11)

### Phase 20: Bolt Alternate Receivers & Drift Automation
**Goal**: Close the remaining Bolt receiver surface and harden long-term SDK drift detection (basic drift detection established in Phase 14).
**Depends on:** Phase 19
**Requirements**: INFRA-14 (full), SLCK-12
**Success Criteria** (what must be TRUE):
  1. SocketModeReceiver passes against a twin-backed `ws.Server` broker harness with equivalent WebSocket delivery and acknowledgement semantics
  2. AwsLambdaReceiver passes against direct function invocation harness with zero AWS dependencies
  3. CI fails when submodule refs, installed package versions, manifests, or symbol coverage drift (hardened beyond Phase 14 basic detection)
  4. Developer can update a pinned SDK ref, regenerate manifests, and see compatibility deltas before merging
**Plans:** 3/3 plans complete

Plans:
- [x] 20-01-PLAN.md — SocketModeReceiver harness: SlackStateManager wss methods + apps.connections.open stub + admin/set-wss-url + test file (SLCK-12)
- [x] 20-02-PLAN.md — AwsLambdaReceiver harness: pure in-process test — url_verification, HMAC rejection, event delivery (SLCK-12)
- [x] 20-03-PLAN.md — Drift hardening: manifest staleness Gate 4 in check-drift.ts + Phase 20 LIVE_SYMBOLS + coverage ledger regeneration (INFRA-14)

### Phase 21: Test Runner & Seeders
**Goal**: Developer can run `pnpm test:sdk` and have all 177 existing tests pass, with seeders updated to protect against OAuth and scope-enforcement regressions before any behavioral changes land.
**Depends on:** Phase 20
**Requirements**: INFRA-19, INFRA-20
**Success Criteria** (what must be TRUE):
  1. `pnpm test:sdk` discovers and executes all SDK verification tests with no "no test files found" error and no ABI mismatch crash
  2. All 177 existing SDK verification tests pass after the fix with no regressions
  3. Shopify twin exposes `POST /admin/tokens` endpoint so seeders can inject access tokens without going through OAuth, protecting tests from OAuth tightening in Phase 23
  4. `seedSlackBotToken()` uses a comprehensive default scope set covering all methods exercised across the SDK test suite, protecting tests from scope enforcement added in Phase 26
**Plans:** 2/2 plans complete

Plans:
- [ ] 21-01-PLAN.md — .nvmrc + CI node-version alignment to Node 22 + better-sqlite3 rebuild step + Dockerfile node:22-slim (INFRA-19)
- [ ] 21-02-PLAN.md — Shopify POST /admin/tokens endpoint + Slack method-scopes.ts catalog + seeder updates (INFRA-20)

### Phase 22: Shopify Version Routing & Response Headers
**Goal**: Shopify twin accepts any valid API version string in route paths and echoes conformance headers, making all subsequent Shopify work version-agnostic and removing the test-harness URL rewriting workaround.
**Depends on:** Phase 21
**Requirements**: SHOP-17, SHOP-22, SHOP-23
**Success Criteria** (what must be TRUE):
  1. `POST /admin/api/2025-01/graphql.json` and `POST /admin/api/2024-01/graphql.json` both return valid GraphQL responses (not 404); test helpers no longer rewrite URLs to a single hardcoded version
  2. REST routes accept any `:version` segment; `GET /admin/api/2025-01/products.json` returns the same product list as `GET /admin/api/2024-01/products.json`
  3. Every API response includes an `X-Shopify-API-Version` header that echoes the version string from the request URL path
  4. Paginated REST list responses include a `Link` header with `rel="next"` and a `page_info` cursor parameter, matching real Shopify pagination format
**Plans:** 3/3 plans complete

### Phase 23: Shopify OAuth & Storefront
**Goal**: Shopify twin implements a real OAuth authorize/callback flow and serves a separate Storefront API schema, matching what the official SDKs expect rather than bypassing both.
**Depends on:** Phase 22
**Requirements**: SHOP-18, SHOP-19
**Success Criteria** (what must be TRUE):
  1. `GET /admin/oauth/authorize` redirects to the callback URL with an HMAC-signed query string and sets a state-nonce cookie; the redirect and cookie pass `shopify-api`'s validation
  2. `POST /admin/oauth/access_token` validates `client_id`, `client_secret`, and `code`; requests with an empty body or invalid credentials return an error response
  3. Storefront GraphQL endpoint `POST /api/:version/graphql.json` accepts `X-Shopify-Storefront-Access-Token` for auth and rejects requests using an admin access token
  4. `products(first: N)` query against the Storefront endpoint returns valid product data; admin-only mutations are not present in the Storefront schema
**Plans:** 4/4 plans complete

Plans:
- [x] 23-01-PLAN.md — OAuth foundation: StateManager oauth_codes + token_type, GET /admin/oauth/authorize, tightened POST /admin/oauth/access_token
- [x] 23-02-PLAN.md — Storefront schema separation: storefront.graphql SDL, second Yoga instance, admin token rejection
- [x] 23-03-PLAN.md — OAuth client credential validation: reject wrong `client_id`/`client_secret` pairs while preserving the pinned SDK happy paths
- [x] 23-04-PLAN.md — Storefront public-header compatibility: accept `X-Shopify-Storefront-Access-Token`, preserve private-header precedence, and add focused header-path coverage

### Phase 24: Shopify REST Persistence, Billing State Machine & Rate Limiting
**Goal**: Shopify REST resources persist state with real-Shopify-compatible shapes, billing implements a full PENDING → ACTIVE → CANCELLED state machine, and rate limiting uses correct bucket parameters.
**Depends on:** Phase 22, Phase 23 (billing requires OAuth/session from Phase 23)
**Requirements**: SHOP-20, SHOP-21, SHOP-24
**Success Criteria** (what must be TRUE):
  1. `POST /admin/api/:version/products.json` creates a product with a numeric integer ID and `admin_graphql_api_id` field; a subsequent `GET /admin/api/:version/products/:id.json` returns that product
  2. `GET /admin/api/:version/orders/:id.json` returns the specific order by ID (not a stub or first-order fallback)
  3. `appSubscriptionCreate` mutation returns a subscription in PENDING state with a `confirmationUrl`; visiting the URL transitions it to ACTIVE; `currentAppInstallation` returns the active subscription data
  4. `appSubscriptionCancel` validates that the subscription belongs to the requesting installation and transitions it to CANCELLED, returning an error on invalid ownership
  5. GraphQL rate limiting uses bucket size 1000 and restore rate 50; `actualQueryCost` is computed from real query field traversal rather than echoing `requestedQueryCost`
**Plans:** 4/4 plans complete

Plans:
- [ ] 24-01-PLAN.md — Wave 0 test scaffolds: rest-persistence.test.ts, billing-state-machine.test.ts, rate-limit.test.ts updates (SHOP-20, SHOP-21, SHOP-24)
- [ ] 24-02-PLAN.md — REST persistence: StateManager getProduct/getOrderById + persistent POST /products.json + GET /products/:id.json + GET /orders/:id.json (SHOP-20)
- [ ] 24-03-PLAN.md — Rate limiting fix: maxAvailable=1000 + LeakyBucketRateLimiter.refund() + actualQueryCost from response traversal (SHOP-24)
- [ ] 24-04-PLAN.md — Billing state machine: app_subscriptions table + resolvers + GET /admin/charges/:id/confirm_recurring (SHOP-21)

### Phase 25: Slack Method Coverage, Event Signing & State Tables
**Goal**: Slack twin covers all 275+ bound WebClient methods, delivers events with correct Slack signature headers, and persists membership, view, pin, and reaction state — the shared infrastructure on which Phase 26 scoping and enforcement depend.
**Depends on:** Phase 21
**Requirements**: SLCK-14, SLCK-16, SLCK-17
**Success Criteria** (what must be TRUE):
  1. Every bound WebClient method in the pinned `@slack/web-api` package returns a valid `{ok: true}` response against the twin, closing the 126-method gap including all `admin.*` (~95 methods), `workflows.*`, `canvases.*`, `openid.connect.*`, and `stars.*` families
  2. Slack event delivery headers include `X-Slack-Signature` (format: `v0=` + HMAC-SHA256 hex of body using signing secret) and `X-Slack-Request-Timestamp`; `@slack/bolt` request verification passes without error
  3. Interaction payloads route through a dedicated interactivity URL (not the event subscriptions endpoint); `response_url` is an absolute URL, not a relative path
  4. `conversations.invite` and `conversations.kick` update real channel membership; `conversations.members` returns the actual member list; `conversations.open` returns a real DM channel ID
  5. `views.open`/`update`/`push` maintain persistent view state with stable view IDs; `pins.add`/`remove`/`list` enforce deduplication (`already_pinned` error); `reactions.add`/`remove`/`list` enforce deduplication (`already_reacted` error)
**Plans:** 4/4 plans complete

Plans:
- [ ] 25-01-PLAN.md — Wave 0 test scaffold: slack-method-coverage.test.ts, slack-signing.test.ts, slack-state-tables.test.ts, smoke.test.ts XCUT-01 additions
- [ ] 25-02-PLAN.md — SLCK-14: admin.ts (95 routes), new-families.ts (~34 routes), method-scopes.ts additions, index.ts registration
- [ ] 25-03-PLAN.md — SLCK-16: EventDispatcher Slack HMAC headers, absolute response_url, dedicated interactivity URL routing
- [ ] 25-04-PLAN.md — SLCK-17: 3 new state tables + updated conversations/pins/reactions/views handlers + XCUT-01 reset coverage

### Phase 26: Slack Chat Scoping & Scope Enforcement
**Goal**: Slack twin enforces channel and author ownership on message mutations and validates OAuth scope requirements per method, matching real Slack's access control behavior.
**Depends on:** Phase 25
**Requirements**: SLCK-15, SLCK-18, SLCK-19
**Success Criteria** (what must be TRUE):
  1. `chat.update` returns `{ok: false, error: "cant_update_message"}` when the message does not exist in the specified channel or when the calling bot token did not post the message
  2. `chat.delete` returns `{ok: false, error: "cant_delete_message"}` under equivalent ownership violation conditions
  3. Conformance tests exercise the actual `chat.update` and `chat.delete` methods against messages posted through the twin, not substitute `chat.postMessage` calls
  4. Calling a method with a token that lacks the required scope returns `{ok: false, error: "missing_scope", needed: "<scope>", provided: "<scopes>"}`; OAuth token exchange validates `client_id`, `scope`, and `redirect_uri`
  5. Successful method calls include `X-OAuth-Scopes` (token's granted scopes) and `X-Accepted-OAuth-Scopes` (method's required scopes) response headers
**Plans:** 3/3 plans complete

Plans:
- [ ] 26-01-PLAN.md — Wave 0 failing tests: slack-scope-enforcement.test.ts covering SLCK-15, SLCK-18, SLCK-19
- [ ] 26-02-PLAN.md — SLCK-15 + SLCK-18 + SLCK-19 core: checkScope() helper, checkAuthRateError refactor, chat.update/delete ownership, oauth.ts client_id validation
- [ ] 26-03-PLAN.md — SLCK-18 + SLCK-19 across remaining 9 plugins: conversations, users, pins, reactions, views, stubs, admin, new-families, files, auth

### Phase 27: Conformance Harness & Coverage Infrastructure
**Goal**: Conformance harness performs real twin-vs-live structural comparison (not twin-vs-self), and coverage status is derived from test execution evidence rather than hand-authored metadata — establishing a trustworthy fidelity baseline going into v2.
**Depends on:** Phase 24, Phase 26
**Requirements**: INFRA-21, INFRA-22
**Success Criteria** (what must be TRUE):
  1. Conformance runner in live mode compares twin response against baseline with bidirectional field checking: twin response must contain all baseline fields AND baseline must contain all twin fields; array traversal covers all elements, not just the first
  2. Primitive value comparison catches behavioral mismatches (not just structural ones) where both responses have the same shape but different values
  3. Coverage status for each tracked symbol is derived from Vitest JSON reporter execution evidence (which test files exercised which endpoints), not the hand-authored `LIVE_SYMBOLS` map
  4. CI gate validates that the 202+ live symbol count is satisfied by execution evidence; `pnpm drift:check` continues passing throughout the `LIVE_SYMBOLS` → evidence transition without a coverage gap
**Plans:** 2/2 plans complete

Plans:
- [ ] 27-01-PLAN.md — INFRA-21: bidirectional comparator fix (types, comparator, runner, TwinAdapter, unit tests)
- [ ] 27-02-PLAN.md — INFRA-22: evidence-based coverage generator, 202-live-count gate, LIVE_SYMBOLS migration

### Phase 28: Shopify REST Pagination & Version Policy
**Goal:** Shopify REST list endpoints implement real cursor pagination with result slicing and cursor advancement, and the API version router rejects unsupported/sunset versions with appropriate error responses.
**Requirements:** SHOP-23, SHOP-17
**Gap Closure:** Closes unsatisfied SHOP-23 (fake pagination) and partial SHOP-17 (accepts invalid versions) from audit
**Plans:** 3/3 plans complete

Plans:
- [ ] 28-01-PLAN.md — Wave 0: migrate pagination.test.ts OAuth seeding to POST /admin/tokens, add failing REST pagination + version policy tests
- [ ] 28-02-PLAN.md — SHOP-23: paginateList helper + real cursor pagination on Tier 1 list endpoints (products, orders, customers, inventory_items)
- [ ] 28-03-PLAN.md — SHOP-17: month-range validation + SUNSET_VERSIONS set in api-version.ts, sunset-aware parseVersionHeader in rest.ts + graphql.ts

### Phase 29: Shopify Billing Transitions & Test Migration
**Goal:** Shopify billing state machine validates legal state transitions (rejecting PENDING→CANCELLED and double-cancel) and legacy integration tests are migrated from old OAuth pattern to POST /admin/tokens.
**Requirements:** SHOP-21
**Gap Closure:** Closes partial SHOP-21 (no transition validation) and integration issue (32+ test failures from Phase 23 OAuth tightening)
**Plans:** 2/2 plans complete

Plans:
- [ ] 29-01-PLAN.md — Transition guard tests (SHOP-21e/21f RED) + appSubscriptionCancel status guard in resolvers.ts
- [ ] 29-02-PLAN.md — OAuth migration for integration.test.ts, pagination.test.ts, order-lifecycle.test.ts + rate-limit 429 fixture fix

### Phase 30: Slack Transport & State Fixes
**Goal:** Slack event deliveries carry only Slack signature headers (no Shopify headers), and state tables for reactions, views, and pins work correctly with proper error handling.
**Requirements:** SLCK-16, SLCK-17
**Gap Closure:** Closes partial SLCK-16 (dual headers) and partial SLCK-17 (stub reactions.list, views JSON parse, views.update unknown ID, test assertion bugs)
**Plans:** 2/2 plans complete

Plans:
- [ ] 30-01-PLAN.md — SLCK-16: Replace WebhookQueue with direct fetch() in EventDispatcher (Slack-only headers)
- [ ] 30-02-PLAN.md — SLCK-17: listReactionsByUser, views.update view_not_found, form-encoded parse, test assertion fixes

### Phase 31: Slack OAuth & Method Coverage
**Goal:** Slack OAuth exchange validates scope, redirect_uri, and binds codes to authorize requests; method coverage tests prove all 275+ WebClient methods are callable.
**Requirements:** SLCK-18, SLCK-14
**Gap Closure:** Closes partial SLCK-18 (OAuth under-validated) and partial SLCK-14 (insufficient method coverage testing); adds Phase 25/26 test files to evidence map
**Plans:** 2/2 plans complete

Plans:
- [ ] 31-01-PLAN.md — SLCK-14: expand slack-method-coverage.test.ts (slackLists/rtm/entity families) + EVIDENCE_MAP Phase 25/26 additions
- [ ] 31-02-PLAN.md — SLCK-18: add redirect_uri mismatch + scope tests, tighten oauth.ts with Map binding and scope validation

### Phase 32: Conformance Harness & Evidence
**Goal:** Conformance comparator catches primitive value mismatches in structural mode, and coverage attribution is derived from real test execution evidence rather than a hand-authored symbol map.
**Requirements:** INFRA-21, INFRA-22
**Gap Closure:** Closes unsatisfied INFRA-21 (primitives skipped) and unsatisfied INFRA-22 (hand-authored EVIDENCE_MAP); includes Phase 25/26 test file evidence integration
**Plans:** 2/2 plans complete

Plans:
- [ ] 32-01-PLAN.md — INFRA-21: compareValueFields in FieldNormalizerConfig + comparator implementation + unit tests + shopifyNormalizer proof-of-concept
- [ ] 32-02-PLAN.md — INFRA-22: raise REQUIRED_LIVE_COUNT to 222, integration-test exclusion docs, regenerate coverage-report.json

### Phase 33: Cross-Cutting Reset Coverage
**Goal:** Every new SQLite table added in v1.2 is included in StateManager/SlackStateManager reset() logic, verified by a reset coverage test, within sub-100ms performance target.
**Requirements:** XCUT-01
**Gap Closure:** Closes orphaned XCUT-01 (reset coverage not formally tracked)
**Plans:** 1/1 plans complete

Plans:
- [ ] 33-01-PLAN.md — XCUT-01: Shopify v1.2 table reset coverage + sub-100ms performance tests

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. Upstream SDK Mirrors & Surface Inventory | v1.1 | 3/3 | Complete | 2026-03-09 |
| 14. Verification Harness Foundation & Legacy Gap Merge | v1.1 | 5/5 | Complete | 2026-03-09 |
| 15. Shopify Admin Client Compatibility | v1.1 | 3/3 | Complete | 2026-03-09 |
| 16. Shopify `shopify-api` Platform Surface | v1.1 | 4/4 | Complete | 2026-03-09 |
| 17. Shopify Client Surfaces & Strategic REST Stubs | v1.1 | 4/4 | Complete | 2026-03-09 |
| 18. Slack WebClient Full Surface | v1.1 | 5/5 | Complete | 2026-03-10 |
| 19. Slack OAuth & Bolt HTTP Surface | v1.1 | 4/4 | Complete | 2026-03-10 |
| 20. Bolt Alternate Receivers & Drift Automation | v1.1 | 3/3 | Complete | 2026-03-10 |
| 21. Test Runner & Seeders | 2/2 | Complete    | 2026-03-12 | - |
| 22. Shopify Version Routing & Response Headers | 3/3 | Complete    | 2026-03-12 | - |
| 23. Shopify OAuth & Storefront | 4/4 | Complete    | 2026-03-12 | - |
| 24. Shopify REST Persistence, Billing State Machine & Rate Limiting | 4/4 | Complete    | 2026-03-13 | - |
| 25. Slack Method Coverage, Event Signing & State Tables | 4/4 | Complete    | 2026-03-13 | - |
| 26. Slack Chat Scoping & Scope Enforcement | 3/3 | Complete    | 2026-03-13 | - |
| 27. Conformance Harness & Coverage Infrastructure | 2/2 | Complete    | 2026-03-13 | - |
| 28. Shopify REST Pagination & Version Policy | 3/3 | Complete    | 2026-03-13 | - |
| 29. Shopify Billing Transitions & Test Migration | 2/2 | Complete    | 2026-03-13 | - |
| 30. Slack Transport & State Fixes | 2/2 | Complete    | 2026-03-13 | - |
| 31. Slack OAuth & Method Coverage | 2/2 | Complete    | 2026-03-13 | - |
| 32. Conformance Harness & Evidence | 2/2 | Complete    | 2026-03-13 | - |
| 33. Cross-Cutting Reset Coverage | 1/1 | Complete    | 2026-03-14 | - |
| 34. Slack Build Fix & Evidence Pipeline | 1/1 | Complete   | 2026-03-14 | - |
| 35. Slack Behavioral Parity | 0/0 | Not planned | - | - |
| 36. Shopify Behavioral Parity | 0/0 | Not planned | - | - |
| 37. Billing Fidelity & Conformance Rigor | 0/0 | Not planned | - | - |

## Dependencies

```text
v1.1 Complete (Phases 13-20)
  ↓
Phase 21 (Test Runner & Seeders)
  ├──→ Phase 22 (Shopify Version Routing & Response Headers)
  │      ├──→ Phase 23 (Shopify OAuth & Storefront)
  │      │      ↓
  │      └──→ Phase 24 (Shopify REST, Billing & Rate Limiting) [depends on 22 + 23]
  │                  ↘
  │                   Phase 27 (Conformance Harness & Coverage Infrastructure)
  │                  ↗
  └──→ Phase 25 (Slack Method Coverage, Event Signing & State Tables)
         ↓
       Phase 26 (Slack Chat Scoping & Scope Enforcement)
              ↗ (also feeds Phase 27)

  Gap Closure (Phases 28-33):

  Phase 28 (Shopify REST Pagination & Version Policy) ──┐
  Phase 29 (Shopify Billing Transitions & Test Migration) ─┤
  Phase 30 (Slack Transport & State Fixes) ──┤──→ Phase 32 (Conformance & Evidence)
  Phase 31 (Slack OAuth & Method Coverage) ──┘         ↓
                                                Phase 33 (Cross-Cutting Reset)

  Second Review Remediation (Phases 34-37):

  Phase 33 (Cross-Cutting Reset)
    ↓
  Phase 34 (Slack Build Fix & Evidence Pipeline)  [Critical — unblocks everything]
    ├──→ Phase 35 (Slack Behavioral Parity)       [Findings #3-6]
    │                    ↘
    └──→ Phase 36 (Shopify Behavioral Parity)      [Findings #7-10]
                         ↗
              Phase 37 (Billing Fidelity & Conformance Rigor) [Findings #11-12]
```

### Phase 34: Slack Build Fix & Evidence Pipeline
**Goal:** Fix the Slack twin compile error so both twins are buildable, then rewrite coverage attribution to derive from actual test execution evidence (vitest-evidence.json) instead of the hand-authored EVIDENCE_MAP, removing all provably false live attributions.
**Depends on:** Phase 33
**Findings addressed:** #1 (Critical: Slack twin not buildable — oauth.ts:98 TS2345), #2 (Critical: evidence-based coverage is hand-authored, not execution-derived; provably false live attributions in coverage-report.json)
**Plans:** 1/1 plans complete

Plans:
- [ ] 34-01-PLAN.md — Fix TS2345 compile error in oauth.ts and regenerate vitest-evidence.json + coverage-report.json

### Phase 35: Slack Behavioral Parity
**Goal:** Close remaining Slack twin behavioral gaps — register all deferred WebClient methods, implement real OpenID Connect flow with token persistence, fix the filesUploadV2 upload chain to match upstream WebClient behavior, and correct auth/scope semantics for apps.connections.open, conversation methods, and oauth.v2.access.
**Depends on:** Phase 34
**Findings addressed:** #3 (High: SLCK-14 overstated — deferred methods not registered), #4 (High: OpenID Connect not implemented as real OAuth flow), #5 (High: filesUploadV2 chain diverges on HTTP verb and files field), #6 (High: auth/scope wrong for apps.connections.open, conversation scope model, oauth.v2.access)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 35 to break down)

### Phase 36: Shopify Behavioral Parity
**Goal:** Fix Shopify twin OAuth to differentiate grant types with proper response shapes, add missing REST routes (access_scopes, location inventory_levels, inventory_level mutations, inventory_items CRUD), fix GraphQL-to-REST ID round-trip with canonical GID generation, and support list endpoint filter semantics (since_id, ids).
**Depends on:** Phase 34
**Findings addressed:** #7 (High: OAuth collapses grant types into one response), #8 (High: missing REST routes confirmed 404 live), #9 (High: GraphQL/REST IDs don't round-trip), #10 (High: list endpoints ignore upstream filters)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 36 to break down)

### Phase 37: Billing Fidelity & Conformance Rigor
**Goal:** Make billing state persistent with real response shapes (lineItems, oneTimePurchases, subscription data in currentAppInstallation), and fix the conformance harness to prove 1:1 behavior — eliminate twin self-comparison in twin mode, add Slack value opt-in checks, and fix the chat conformance suite labeling.
**Depends on:** Phase 35, Phase 36
**Findings addressed:** #11 (Medium: billing/install fidelity shallow), #12 (Medium: conformance harness doesn't prove 1:1 behavior)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 37 to break down)
