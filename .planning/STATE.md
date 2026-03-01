---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 09-01-PLAN.md
last_updated: "2026-02-28T23:57:00.000Z"
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 26
  completed_plans: 26
  percent: 100
---

# Project State: Sandpiper DTU

**Last Updated:** 2026-03-01
**Status:** Phase 9 complete

## Project Reference

**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

**Current Focus:** Phase 9 complete — code quality cleanup, StateManager methods, DLQ test fix.

## Current Position

**Phase:** Phase 9 — Code Quality Cleanup (1/1 plans complete)
**Plan:** 09-01 — StateManager methods, UI migration, flaky test fix
**Status:** All 9 phases complete
**Progress:** [██████████] 100%

## Performance Metrics

**Velocity:** 2 plans in 7 min
**Avg Plans per Phase:** 2 (Phase 1)
**Avg Tasks per Plan:** 2.5
**Success Rate:** 2/2 (100%)

## Accumulated Context

### Key Decisions

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

**Research context available:** Comprehensive research completed covering stack decisions (Fastify, GraphQL Yoga, better-sqlite3, BullMQ, Vitest), architecture patterns (monorepo, behavioral clones, conformance testing), and critical pitfalls (fidelity traps, state management, twin-API drift).

**Depth setting:** Comprehensive (8-12 phases). Final roadmap has 7 phases respecting natural delivery boundaries and dependency chain.

**Phase ordering rationale:** Foundation → Shopify Core → Webhooks/Conformance → Shopify Advanced → Slack → UIs → Integration. This sequence ensures shared infrastructure is battle-tested before replication and validates patterns before extending them.

## Session Continuity

**Last completed:** Phase 9 Plan 01 - StateManager methods, UI migration, DLQ test fix
**Stopped at:** Completed 09-01-PLAN.md
**Timestamp:** 2026-02-28

**All Phase 6 plans complete:**
1. 06-01: @dtu/ui shared package with registerUI(), 6 Eta partials, Pico CSS
2. 06-02: Shopify twin UI (orders, products, customers, admin with webhooks)
3. 06-03: Slack twin UI (channels with message timeline, users, admin with event subscriptions)
4. 06-04: API conformance audit (GET methods, form-urlencoded, token-in-body/query auth)
5. 06-05: UI gap closure (webhook create form, product price field, order-product association, load fixtures buttons)
6. 06-06: Slack conformance infrastructure (21 tests, 4 suites) + CONFORMANCE.md process documentation

**Milestone v1.0 complete:**
- 71 Slack twin tests pass (4 test files)
- 236/237 monorepo tests pass — 1 pre-existing flaky DLQ timing test in Shopify integration
- Shopify conformance: 12 tests (orders, products, webhooks suites)
- Slack conformance: 21 tests (conversations, chat, users, oauth suites)
- CONFORMANCE.md: new endpoint checklist + new twin checklist

**Context required:**
- .planning/phases/06-twin-uis/06-03-SUMMARY.md
- twins/slack/src/plugins/ui.ts (Slack UI plugin)
- twins/shopify/src/plugins/ui.ts (Shopify UI plugin)

---
*State tracking for Sandpiper DTU project - updated by GSD agents*
