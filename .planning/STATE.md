---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: planning
stopped_at: Completed 18-01-PLAN.md
last_updated: "2026-03-10T00:09:34.436Z"
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 24
  completed_plans: 21
  percent: 94
---

# Project State: Sandpiper DTU

**Last Updated:** 2026-03-09T17:33:00Z
**Status:** Ready to plan

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Phase 17 — Shopify Client Surfaces & Strategic REST Stubs

## Current Position

**Phase:** Phase 17 — Shopify Client Surfaces & Strategic REST Stubs
**Plan:** Plan 01 complete — Plan 02 next
**Status:** In Progress
**Progress:** [█████████░] 94%

## Performance Metrics

**Velocity:** Reset for new milestone
**Avg Plans per Phase:** -
**Avg Tasks per Plan:** -
**Success Rate:** -

## Accumulated Context

### Key Decisions

**2026-03-09 - Plan 18-02 Execution:**
- conversations.requestSharedInvite is a nested SDK namespace ({approve,deny,list} sub-methods), not a flat callable — routes registered as conversations.requestSharedInvite.{approve,deny,list} to match SDK dispatch paths
- U_BOT_TWIN seeded without email field in seedDefaults() — lookupByEmail test covers error path via try/catch (Slack SDK throws on ok:false responses); no hardcoded email
- checkAuth() helper extracted as local async function inside each plugin — keeps plugins self-contained without new shared module dependency

**2026-03-09 - Plan 17-04 Execution:**
- StorefrontClient and REST resource classes (Product, Customer, etc.) absent from @shopify/shopify-api root manifest — ts-morph only captures symbols exported from package root; REST resources are at rest/admin/2024-01/ sub-path; SHOP-15 attributed via RestClient.get/post/put/delete
- Phase 16 LIVE_SYMBOLS backfilled into generate-report.ts — Phase 16-04 executor had hand-edited coverage-report.json without updating the generator; restored generator-report parity
- Shopify.billing promoted from stub to live in LIVE_SYMBOLS — generator only supports live|deferred (INFRA-12); billing test file has 3 passing tests against twin, live is accurate attribution

**2026-03-09 - Plan 17-03 Execution:**
- Storefront route rewrites URL to /admin/api/2024-01/graphql.json before yoga.fetch() — graphqlEndpoint must match for Yoga to route correctly; Fastify handles Storefront URL externally, rewrite is yoga-internal only
- shop resolver does not call requireAuth() — Storefront auth enforced at Fastify route handler level (Shopify-Storefront-Private-Token check); Admin API uses per-resolver requireAuth() with x-shopify-access-token
- Two-step URL normalization: admin path replace first, then storefront /api/{version}/graphql.json replace — ordering prevents double-processing of admin paths

**2026-03-09 - Plan 17-02 Execution:**
- shopify.rest.* resource classes require restResources passed to shopifyApi() — createShopifyApiClient gains generic restResources option; callers import { restResources } from @shopify/shopify-api/rest/admin/2024-01
- result.pageInfo always populated by SDK with query params even without Link header; nextPageUrl is the correct nil-safe assertion for RestClient pagination tests
- listOrders() exists in StateManager — orders REST route is state-backed, not a stub

**2026-03-09 - Plan 17-01 Execution:**
- query() in SDK v12.x throws FeatureDeprecatedError (hard-removed via logger.deprecated() version compare >= 12.0.0); backward-compat test must assert throws, not body
- GraphqlClient accessed via shopify.clients.Graphql (instance property, not direct import) — SDK public surface pattern from Phase 16 research

**2026-03-09 - Plan 16-04 Execution:**
- AppPricingDetails interface uses 'interval: String' as shared field — __typename is invalid SDL (built-in meta-field cannot be declared as interface field); both AppRecurringPricing and AppUsagePricing implement via interval
- Decimal scalar added to MoneyInput.amount: SDK sends amount as Number (10.0), not String; custom scalar parses both numeric and string input
- Rate limiter max 1000→2000: billing.check HAS_PAYMENTS_QUERY uses oneTimePurchases(first:250) which costs ~1004 points under conservative twin model; real Shopify charges for actual items returned
- billing.check returns boolean by default (returnObject not set); twin returns empty activeSubscriptions so hasActivePayment is false on clean state
- billing.cancel returns AppSubscription directly (unwrapped from appSubscriptionCancel.appSubscription)

**2026-03-09 - Plan 16-03 Execution:**
- computeCallbackHmac uses hex format (not base64) — validateHmac() in SDK calls createSHA256HMAC with HashFormat.Hex for OAuth callback query params; computeShopifyHmac uses base64 (webhooks only)
- Mock ServerResponse for node adapter must include getHeaders() — nodeConvertIncomingResponse reads rawResponse.getHeaders() to initialize NormalizedResponse headers
- begin→callback cookie round-trip: shopify_app_state + shopify_app_state.sig both required in callback cookie header; getAndVerify() validates the .sig HMAC companion
- URLSearchParams encoding for HMAC: computeCallbackHmac uses new URLSearchParams(sortedEntries).toString() to match ProcessedQuery.stringify(true) in SDK hmac-validator
- refreshToken signature: { shop: string, refreshToken: string } — pass session.accessToken as the refreshToken string; twin accepts any grant_type body

**2026-03-09 - Plan 16-02 Execution:**
- getCurrentId requires isEmbeddedApp: true to extract session ID from Authorization header; isEmbeddedApp: false falls back to cookie extraction and returns undefined when no cookie is present
- embeddedShopify instance pattern: separate createShopifyApiClient({ isEmbeddedApp: true }) in beforeAll for getCurrentId test; default instance for decodeSessionToken and utility tests
- vitest globalSetup absolute path required in vitest 3.x project workspace mode: resolve(__dirname, 'setup/global-setup.ts') prevents CWD-relative resolution error when config is in a sub-directory

**2026-03-09 - Plan 16-01 Execution:**
- setAbstractFetchFunc imported from @shopify/shopify-api/runtime (not runtime/http subpath — not in exports map)
- jose added as direct devDependency at workspace root: pnpm hoistPattern=* marks transitive deps private, unreachable from test files
- BillingConfig type (not Record<string, unknown>) required for shopifyApi() billing option — incompatible index signature
- Module-level shopify instance safe for pure in-process webhook tests — validate() is crypto-only, never calls abstractFetch
- SHOPIFY_API_URL fallback prevents module-level crash when env var not set in isolated test runs

**2026-03-09 - Plan 15-03 Execution:**
- AdminApiClient.request/fetch/getHeaders/getApiUrl LIVE_SYMBOLS entries are no-ops — TypeAliasDeclaration has no emitted members in manifest; only AdminApiClient top-level and REST class members are trackable
- addContentTypeParser added to REST plugin scope: Fastify v5 returns 400 for DELETE with Content-Type:application/json and empty body; explicit parser with empty-body guard fixes this
- Live symbol count is 10 not 14 (plan expected): 4 AdminApiClient method members absent from manifest as TypeAlias — all trackable symbols correctly attributed, drift:check passes

**2026-03-09 - Plan 15-02 Execution:**
- restPlugin NOT wrapped in fastify-plugin — stateManager already decorated on parent scope, no cross-plugin sharing needed
- createRestClient() requires both scheme:'http' AND customFetchApi — scheme alone doesn't prevent DNS resolution of dev.myshopify.com; regex rewrites both http/https prefixes
- retryCounts Map keyed by access token — per-token isolation for concurrent test scenarios; counter resets after 200 response for test reuse

**2026-03-09 - Plan 15-01 Execution:**
- Tests 4-6 (getHeaders/getApiUrl) use hardcoded tokens — client-side assertions that never call the twin; avoids unnecessary async setup
- SDK deprecation stderr for apiVersion '2025-01' is expected — customFetchApi normalizes to /admin/api/2024-01/ in-flight; tests pass cleanly
- fetch() raw body typed as { data: { products: unknown } } to avoid TypeScript any while keeping assertion minimal

**2026-03-09 - Plan 14-03 Execution:**
- Plans 01 and 02 infrastructure was complete: both SDK gateway test files passed immediately on first run without any implementation changes needed
- Legacy test failures (hmac-signature.test.ts, webhook-timing.test.ts) are pre-existing untracked files — deferred, not in scope for Plan 03
- process.env.SLACK_API_URL in createSlackClient() confirmed to propagate correctly from globalSetup to Vitest 3.x workers; no inject() call needed in test files

**2026-03-09 - Plan 14-01 Execution:**
- auth.test assigned tier 1 (20/min) in SlackRateLimiter DEFAULT_RATE_TIERS — Slack docs place auth endpoints in tier 1; unknown methods skip rate limiting silently
- bot_id 'B_BOT_TWIN' hardcoded constant in auth.ts — twin seeds are deterministic, dynamic lookup unnecessary
- authPlugin registered before chatPlugin in buildApp() — auth.test is the gateway endpoint, logical first-in-group

**2026-03-09 - Plan 14-05 Execution:**
- coverage/ gitignored by root .gitignore — force-added generate-report.ts and coverage-report.json with git add -f; a future plan should add !tests/sdk-verification/coverage/ negation to .gitignore
- LIVE_SYMBOLS map uses pkgName@version/symbolPath key format — versioned keys force explicit re-attribution when package versions change; prevents silent attribution drift
- Submodule path in sdk-pins.json is full relative path (third_party/upstream/...) not just the submodule name — check-drift.ts uses join(root, pin.submodule) directly

**2026-03-09 - Plan 14-04 Execution:**
- singleFork:true chosen over fileParallelism:false for sdk-verification vitest config — runs all files in ONE worker process, sharing module instances and process.env; eliminates token-invalidation race where worker A's resetShopify wipes tokens seeded by worker B
- orderCreate mutation requires totalPrice and currencyCode — twin's resolver validates both fields and returns userErrors when absent; plan's example mutation omitted them, causing silent webhook enqueueing failure
- lineItems in twin use title/price/quantity (NOT variantId) — twin's LineItemInput schema differs from real Shopify SDK; productCreate only requires title

**2026-03-09 - Plan 14-02 Execution:**
- POST /admin/tokens added to Slack twin admin plugin: direct slackStateManager.createToken() produces deterministic token values; OAuth flow (/api/oauth.v2.access) returns dynamic tokens that would break auth.test lookups
- Version normalization in customFetchApi for Shopify SDK: replaces /admin/api/[any-version]/ with /admin/api/2024-01/; twin only serves this version, rewrite avoids any twin route changes
- Both ctx.provide() and process.env used in globalSetup: process.env propagates to Vitest 3.x workers; ctx.provide() adds forward compatibility

**2026-03-09 - Plan 13-03 Execution:**
- bolt-js has no git tags for releases — SHA manually identified by user from commit message; no tag-based lookup possible for bolt-js version pinning
- Monorepo submodule SHA sharing: @shopify/admin-api-client and @shopify/shopify-api both pin to the same shopify-app-js SHA; @slack/web-api and @slack/oauth both pin to the same node-slack-sdk SHA
- Fork URLs used in .gitmodules (sandpiper-app org), upstream remotes configured inside each submodule for drift tracking; sdk-pins.json is the atomic version lock linking npm versions to submodule commits

**2026-03-09 - Plan 13-02 Execution:**
- getType().getBaseTypes() used instead of getBaseClasses() for ts-morph class traversal — ClassDeclaration nodes from re-exported symbols lack getBaseClasses(); Type API works universally
- readFileSync on package.json instead of require.resolve('./package.json') for Shopify packages — exports field blocks subpath resolution; direct file read bypasses the guard cleanly
- WebClient members captured as dot-notation paths (admin.analytics.getFile) via recursive collectMembersFromType() — yields 392 traceable method paths covering all 275 Slack API methods

**2026-03-09 - Plan 13-01 Execution:**
- tests/* added to vitest.config.ts projects array before Phase 14 to avoid config-change commit interleaved with submodule setup
- vitest bumped to ^3.0.0 in both twins to match workspace root version and prevent lockfile conflicts when sdk-verification suite is added
- CI submodule verification uses git submodule status | grep ^- pattern: exits non-zero only on uninitialized entries, passes cleanly when no submodules present

**2026-03-09 - Milestone v1.1 Roadmap Creation:**
- 8 phases derived from cloned upstream SDK source and literal package scope
- Phase 14 absorbs the old manual-verification work into the shared SDK harness
- Shopify work is split into low-level client, platform helper, and REST resource waves
- Slack work is split into WebClient, OAuth/Bolt HTTP, and alternate receiver/drift waves

**2026-03-09 - Milestone v1.1 Start:**
- Use cloned upstream SDK repos as source of truth for planning; vendor repo-owned fork submodules during implementation
- Literal scope covers the full public surface of the targeted packages, not just the current twin subset
- Old Phase 12 manual verification work folds into the new SDK verification harness
- Phase numbering resumes at 13 to avoid colliding with existing Phase 12 planning artifacts

**2026-03-01 - Plan 10-01 Execution:**
- sku made nullable in InventoryItem GraphQL schema — matches real Shopify API where sku is optional
- No inventoryItemCreate mutation (Shopify has no such mutation) — creation via admin fixtures endpoint and UI only
- Boolean tracked stored as 0/1 integer in SQLite, converted via ternary in TypeScript

**2026-03-01 - Plan 11-01 Execution:**
- GET /admin/errors uses direct SQL on stateManager.database (SELECT * FROM error_configs) matching Slack twin pattern
- GET /admin/errors/:operation uses existing getErrorConfig() state manager method, returns { config: null } for not-found
- requirements_completed (underscore) normalized across all 28 SUMMARY.md files; hyphenated keys renamed and plan mapping values used as authoritative source

**2026-03-01 - Plan 10-02 Execution:**
- Slack live conformance uses SLACK_BOT_TOKEN secret (matching Shopify pattern with SHOPIFY_ACCESS_TOKEN)
- TWIN_PORT defaults to 3000 in Dockerfile, overridden to 3001 for slack in docker-compose

**2026-02-28 - Plan 09-01 Execution:**
- Use 127.0.0.1:1 instead of localhost:9999 for DLQ tests — port 1 requires root privileges, guaranteeing ECONNREFUSED regardless of dev environment
- DLQ tests use polling with 50ms interval and 10s deadline instead of fixed setTimeout(600)
- updateCustomer follows existing updateProduct pattern; updateUser follows existing updateChannel fetch-then-merge pattern

**2026-03-01 - Plan 08-01 Execution:**
- Separate CI jobs for Shopify vs Slack conformance so failures are independently visible
- No ErrorSimulator class for Slack — uses existing per-method inline getErrorConfig() checks
- GET /admin/errors uses direct SQL on slackStateManager.database (no additional state manager method needed)

**2026-03-01 - Plan 07-01 Execution:**
- node:20-slim (not Alpine) for Docker base: better-sqlite3 native module requires glibc
- Entire twins/${TWIN_NAME}/src/ copied in runtime stage: .eta views and .graphql schema are runtime dependencies not compiled by tsc
- pnpm deploy --prod for isolated production node_modules in Docker images
- Dual-mode smoke tests: in-process via buildApp() for local dev, env var base URLs for Docker/CI
- @fastify/view triple-slash reference fixes pre-existing tsc --build type errors from pnpm strict isolation

**2026-02-28 - Plan 06-04 Execution:**
- extractBearerToken() replaced by extractToken() with 3-way priority: Bearer header > body.token > query.token (matching real Slack API)
- GET routes added for all Slack read methods — getParams(request) helper unifies GET query / POST body extraction
- @fastify/formbody registered at root Fastify scope in index.ts before other plugins so oauth and web-api routes parse form-urlencoded
- @fastify/formbody added as direct dependency to twins/slack and twins/shopify (was only transitive via @dtu/ui)
- Blocks JSON string parsing in chat.postMessage/update: typeof blocks === 'string' ? JSON.parse(blocks) : blocks

**2026-02-28 - Plan 06-06 Execution:**
- authorization header override: set headers.authorization='' in test ops to bypass SlackTwinAdapter's default bearer injection for no-auth and oauth tests
- chat-update conformance test uses second postMessage as operation: avoids ts-capture complexity (twin compares to itself, ts normalization handles non-determinism)
- slackNormalizer.stripFields includes 'ts' at top-level; normalizeFields handles nested message.ts and messages.*.ts separately

**2026-02-28 - Plan 06-05 Execution:**
- hasContentTypeParser() guard in registerUI(): parent scope registers formbody at root; child uiPlugin must skip re-registration to avoid FST_ERR_CTP_ALREADY_PRESENT in Fastify v5
- Self-contained orders/form.eta: replaced include('form', it) passthrough with full template supporting product line item checkboxes not expressible via shared form partial field array
- extractLineItems() helper: parses form checkbox pairs (line_product_{id} + line_qty_{id}) into JSON line_items array for order storage
- Price field added to StateManager products schema: TEXT column matching Shopify's decimal-string format

**2026-02-28 - Plan 06-03 Execution:**
- Channel detail as message timeline: chronological messages with user name lookup, inline Post Message form at bottom — matching Slack UX metaphor
- Event dispatch from UI: channel_created and message events via eventDispatcher.dispatch() matching API side effects
- updateUser via direct SQL: SlackStateManager lacks updateUser method; direct SQL used for user edits
- @dtu/ui layout path fix: relativeLayoutPath broken when viewsDir outside package tree; fixed with root=partialsDir + explicit viewsDir resolvePath override

**2026-02-28 - Plan 06-02 Execution:**
- fastify-plugin wrapper for uiPlugin to share stateManager/webhookQueue/webhookSecret decorators from parent Fastify scope
- Register /ui/orders/new BEFORE /ui/orders/:id to prevent "new" being captured as an ID parameter (same for products, customers)
- @fastify/view layout path must be relative to viewsDir — absolute paths cause join(root, absPath) to produce wrong resolved path during layout validation
- Eta resolvePath override must skip self-references: orders/form.eta include('form') resolves to itself causing infinite recursion
- Customer update uses direct SQL prepare() inline — no updateCustomer method in StateManager
- dispatchWebhooks() helper pattern: UI create/update operations dispatch to same WebhookQueue as GraphQL mutations

**2026-02-28 - Plan 05-03 Execution:**
- EventDispatcher wraps WebhookQueue with Slack event_callback envelope format (type, token, team_id, api_app_id, event, event_id, event_time, authorizations)
- Fire-and-forget event dispatch: events dispatched without await (matching real Slack behavior), syncMode for tests
- Interaction payloads delivered as application/x-www-form-urlencoded with payload= field (Slack convention, not JSON)
- Response URLs as twin endpoints (/response-url/:id): 5 uses within 30 minutes, post messages back to originating channel
- Bot mention detection in chat.postMessage: dispatches both message and app_mention events when text contains <@U_BOT_TWIN>

**2026-02-28 - Plan 05-02 Execution:**
- Slack Web API returns HTTP 200 with {ok: false, error: '...'} for ALL errors except rate limits (429) — never 401/403/404
- Sliding window rate limiting (not leaky bucket): per-method per-token per-minute windows with tier-based limits
- POST for all Web API methods including reads: Slack SDK clients always use POST, so twin does too
- Forward-compatible Block Kit validation: accept unknown block types, only validate structure and 50-block count limit
- Message timestamp (ts) is always STRING format (epoch.sequence) — never numeric

**2026-02-28 - Plan 05-01 Execution:**
- SlackStateManager uses composition (wraps StateManager, not extends) keeping base class clean for all twins
- INSERT OR REPLACE for default seeding: T_TWIN team, U_BOT_TWIN bot user, C_GENERAL channel — idempotent after reset
- @types/better-sqlite3 as devDependency: needed for Database.Statement types in prepared statement declarations
- Port 3001 default: Slack twin on 3001, Shopify twin on 3000, allows simultaneous operation
- OAuth v2 tokens use xoxb-/xoxp- prefixes: Slack SDK/Bolt check these prefixes for token type detection

**2026-02-28 - Plan 04-03 Execution:**
- State machine as pure functions: validateFulfillment/validateClose return string|null — no exceptions for business rule violations, easier to test and compose
- Reject entire fulfillmentCreate on invalid transition: twin's simplified model rejects whole operation with userErrors rather than allowing partial fulfillment records
- financialStatus seeding via OrderInput enum: allows tests to reach PAID state without implementing a payment flow
- @dtu/state dist rebuild required after source changes: stale compiled JS causes integration tests to miss new schema columns
- closedAt checked first in validateClose: gives specific "already closed" error before checking other preconditions

**2026-02-28 - Plan 04-02 Execution:**
- Relay cursor format includes resource type: base64(arrayconnection:{Type}:{id}) prevents cross-resource cursor injection
- ORDER BY id ASC replaces created_at DESC: AUTOINCREMENT id guarantees monotonic ordering; created_at unreliable when fixtures loaded rapidly
- Duck typing for GraphQL cross-realm type checking: ofType property for NonNull/List, getFields() for object type detection — replaces instanceof/isObjectType which fail when graphql module loads twice under tsx/ESM
- hasPreviousPage = true when after cursor provided OR when last sliced fewer than available items

**2026-02-28 - Plan 04-01 Execution:**
- Query cost: scalars=0, objects=1, connections=2+(first??10), mutations=10 base; nested connections multiply child costs by page size
- LeakyBucketRateLimiter: 1000pt max, 50pt/s restore, per-token-key bucket; tryConsume returns allowed+retryAfterMs
- Rate limit integration in graphqlPlugin: pre-check before Yoga execution, HTTP 429 on exhaustion, extensions.cost in all successful responses
- Cross-realm instanceof fix: use duck typing (ofType, getFields) instead of instanceof/isObjectType for graphql types under tsx/ESM

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

**Research context available:** Comprehensive v1.1 research completed from cloned upstream SDK source. Summary and phase implications are in `.planning/research/SUMMARY.md`. Independent research review (2026-03-08) validated and refined requirements and roadmap.

**Milestone note:** v1.1 intentionally expands beyond the current Sandpiper-used subset and treats the official SDK package surface as the compatibility contract.

**2026-03-08 - Independent Research Review findings incorporated:**
- Added SLCK-06.5 (`auth.test`/`api.test` gateway), INFRA-15 (live endpoint URL redirection), INFRA-16 (ts-morph for manifest generation)
- SHOP-15 rescoped: strategic REST stubs instead of full resource coverage (Shopify April 2025 REST deprecation)
- SHOP-13 (billing) noted as lower priority — auth+session+webhooks are the core of Phase 16
- Phase 14 now includes `auth.test` gateway, `customFetchApi`/`slackApiUrl` URL redirection patterns, and basic drift detection
- Phase 17 renamed to "Shopify Client Surfaces & Strategic REST Stubs"
- Phase 18 adds method family tiering: Tier 1 (~60 methods full coverage), Tier 2 (stubbed), Tier 3 (deferred)
- Phase 20 clarified: Socket Mode uses ws.Server broker, Lambda uses direct function invocation (zero AWS deps)
- Tool choices validated: ts-morph@25.0.1 for export enumeration, SDK packages at workspace root, Vitest ^3.0.0 across workspace
- v2 INFRA requirements renumbered (INFRA-15/16 became INFRA-17/18) to accommodate new v1.1 requirements

## Session Continuity

**Last completed:** Phase 18 Plan 02 — conversations.ts 28 methods + users.ts 12 methods; 34 new tests; all 131 SDK tests green
**Stopped at:** Completed 18-01-PLAN.md
**Timestamp:** 2026-03-09T23:08:00Z

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
