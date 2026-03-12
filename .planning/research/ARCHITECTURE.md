# Architecture Research

**Domain:** Behavioral fidelity fixes for Shopify and Slack digital twins (v1.2)
**Researched:** 2026-03-11
**Confidence:** HIGH (based on direct codebase inspection of all referenced files)

---

## Standard Architecture

### System Overview

```
+------------------------------------------------------------------------+
|                        Monorepo (pnpm workspaces)                       |
+------------------------------+-----------------------------------------+
|     twins/shopify             |           twins/slack                   |
|  +--------------------+       |  +------------------------------------+ |
|  |  Fastify + plugins  |       |  |  Fastify + plugins                 | |
|  |  +-------------+   |       |  |  +---------+ +-----------------+   | |
|  |  | graphql.ts  |   |       |  |  | chat.ts | | conversations   |   | |
|  |  | (Yoga, one  |   |       |  |  | views   | | .ts, stubs.ts   |   | |
|  |  |  schema now)|   |       |  |  +---------+ +-----------------+   | |
|  |  +-------------+   |       |  |  +------------------------------+   | |
|  |  | rest.ts     |   |       |  |  |  events-api.ts               |   | |
|  |  | oauth.ts    |   |       |  |  |  interactions.ts             |   | |
|  |  | admin.ts    |   |       |  |  +------------------------------+   | |
|  |  +-------------+   |       |  +------------------------------------+ |
|  +--------+-----------+       +------------------+---------------------+
|           | StateManager                          | SlackStateManager   |
+-----------+---------------------------------------+---------------------+
|                         packages/                                        |
|  +---------+  +---------+  +-------------+  +------------------------+  |
|  | @dtu/   |  | @dtu/   |  | @dtu/       |  | @dtu/webhooks          |  |
|  | state   |  | types   |  | conformance |  | (WebhookQueue +        |  |
|  +---------+  +---------+  +-------------+  |  webhook-delivery.ts)  |  |
|                                             +------------------------+  |
+--------------------------------------------------------------------------+
|                     tests/sdk-verification                               |
|  +------------------+  +------------------+  +------------------------+ |
|  | setup/           |  | coverage/         |  | drift/                 | |
|  | global-setup.ts  |  | generate-report   |  | check-drift.ts         | |
|  | seeders.ts       |  | .ts (LIVE_SYMBOLS |  | (4 gates)              | |
|  +------------------+  |  hand-authored)   |  +------------------------+ |
|                         +------------------+                             |
+--------------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Current State (Pre-Fix) |
|-----------|----------------|------------------------|
| `twins/shopify/src/plugins/graphql.ts` | Shopify Admin GraphQL + Storefront endpoints | Single Yoga instance, single schema, Storefront URL rewritten to Admin endpoint |
| `twins/shopify/src/plugins/oauth.ts` | OAuth token exchange | Only `POST /admin/oauth/access_token`; no authorize GET route |
| `twins/shopify/src/plugins/rest.ts` | REST CRUD routes | Hardcoded version `2024-01`, GID-format IDs, most POST/PUT return static shapes |
| `twins/shopify/src/schema/schema.graphql` | GraphQL schema | Single schema used for Admin AND Storefront |
| `twins/shopify/src/schema/resolvers.ts` | GraphQL resolvers | Admin-specific mutations accessible via Storefront endpoint |
| `packages/state/src/state-manager.ts` | Shopify SQLite state | Has `tokens`, `products`, `orders`, `customers`, `inventory_items`, `product_variants`, `fulfillments`; missing billing table |
| `twins/slack/src/state/slack-state-manager.ts` | Slack SQLite state | Composition over StateManager; has messages/channels/users/tokens/reactions; missing membership/views/pins tables |
| `twins/slack/src/plugins/web-api/chat.ts` | Chat API methods | `chat.update`/`delete` do not enforce channel+author scoping |
| `twins/slack/src/plugins/web-api/stubs.ts` | Tier 2 method stubs | 126 missing method families not registered |
| `twins/slack/src/services/event-dispatcher.ts` | Event webhook delivery | Uses Shopify HMAC headers (`X-Shopify-Hmac-Sha256`) via shared `@dtu/webhooks` |
| `packages/webhooks/src/webhook-delivery.ts` | HTTP delivery with signing | Hardcodes `X-Shopify-Hmac-Sha256` and `X-Shopify-Topic` headers |
| `packages/conformance/src/runner.ts` | Conformance test orchestration | `twin` mode compares twin to itself (always passes); `live` mode uses structural comparison |
| `packages/conformance/src/comparator.ts` | Response comparison | `compareResponsesStructurally` only checks subset: twin keys must exist in baseline; extra baseline keys silently accepted |
| `tests/sdk-verification/coverage/generate-report.ts` | Coverage tracking | `LIVE_SYMBOLS` is a 300-line hand-authored map; not derived from execution |
| `tests/sdk-verification/vitest.config.ts` | SDK test runner | `globalSetup` exists; `better-sqlite3` ABI mismatch may cause failures |

---

## Fix Integration Map

### Fix 1: Conformance harness — bidirectional structural comparison

**Problem:** `compareResponsesStructurally` in `packages/conformance/src/comparator.ts` iterates only `Object.keys(twinObj)` and checks each against the baseline. Extra keys the real API returns but the twin omits are never detected. The comparison is subset-only, not bidirectional.

**Root cause location:** `comparator.ts` lines 151-167 — the `twinType === 'object'` branch iterates twin keys and checks for presence in baseline, but never checks the reverse.

| File | Change Type | Change |
|------|-------------|--------|
| `packages/conformance/src/comparator.ts` | MODIFY | In `compareStructure()`, after iterating `Object.keys(twinObj)`, add a second loop over `Object.keys(baselineObj)` checking for keys absent in twinObj and reporting them as `deleted` differences. Add a `strict?: boolean` parameter (default `false`) to the function signature so existing twin-only suites continue passing. |
| `packages/conformance/src/runner.ts` | MODIFY | Pass `strict: true` when calling `compareResponsesStructurally` in `live` mode. Alternatively surface as a suite-level option. |
| `packages/conformance/src/types.ts` | MODIFY | Add `strict?: boolean` to function signatures or a `ComparisonOptions` type if one is introduced. |

**New files:** None.

---

### Fix 2: Coverage tracking — execution-evidence-based

**Problem:** `LIVE_SYMBOLS` in `generate-report.ts` is manually maintained. New tests silently miss coverage if a developer forgets to update the map. The map also contains stale entries that point to tests that may have moved or been renamed.

| File | Change Type | Change |
|------|-------------|--------|
| `tests/sdk-verification/coverage/generate-report.ts` | MODIFY | Replace the `LIVE_SYMBOLS` map with logic that reads a Vitest JSON reporter output file to derive live symbols from actual test execution results. Symbol attribution uses a naming convention: test description contains the symbol path, or test files are organized by symbol family and contribute known symbols. |
| `tests/sdk-verification/vitest.config.ts` | MODIFY | Add `reporters: ['json']` (or `['verbose', 'json']`) so a machine-readable `vitest-results.json` is produced after test runs. |
| `tests/sdk-verification/coverage/derive-symbols.ts` | NEW FILE | Helper that reads `vitest-results.json`, extracts test names and file paths, and produces a `Record<string, string>` (symbol key → test file) without requiring manual maintenance. |

**Build dependency:** Fix 13 (SDK test entrypoint) must be working before this automation is valuable.

---

### Fix 3: Shopify OAuth — add authorize GET route and credential validation

**Problem:** `twins/shopify/src/plugins/oauth.ts` only handles `POST /admin/oauth/access_token`. The real Shopify OAuth flow starts with `GET /admin/oauth/authorize` which validates query params and issues a redirect with a code.

| File | Change Type | Change |
|------|-------------|--------|
| `twins/shopify/src/plugins/oauth.ts` | MODIFY | Add `GET /admin/oauth/authorize` route: validate `client_id`, `scope`, `redirect_uri`, `state` query params; redirect to `redirect_uri?code=<generated-uuid>&state=<echo-state>`. Modify `POST /admin/oauth/access_token` to validate `client_id` and `client_secret` are non-empty; return `{ error: 'invalid_client' }` if missing. Store the issued code temporarily so the token exchange can verify it. |
| `twins/shopify/src/plugins/admin.ts` | MODIFY | Optionally add `POST /admin/set-oauth-app` to seed expected `client_id`/`client_secret` pairs for tests that want strict credential validation. |
| `packages/state/src/state-manager.ts` | MODIFY | Add `oauth_codes` table: `(code TEXT PRIMARY KEY, client_id TEXT, redirect_uri TEXT, created_at INTEGER)` with `createOAuthCode(code, clientId, redirectUri)` and `consumeOAuthCode(code)` methods. This enables the token exchange to verify the code was actually issued. |

---

### Fix 4: Shopify Storefront — separate schema

**Problem:** `graphql.ts` registers a single Yoga instance using the Admin schema (`schema.graphql`) and serves it at both `/admin/api/2024-01/graphql.json` and `/api/2024-01/graphql.json`. The Storefront endpoint should only expose product/collection queries, not admin mutations like `productCreate`.

**Recommended approach:** Two independent Yoga instances with two separate SDL files. No schema stitching — the schemas share no mutation surface.

| File | Change Type | Change |
|------|-------------|--------|
| `twins/shopify/src/plugins/graphql.ts` | MODIFY | Create a second `createYoga()` instance (`storefrontYoga`) using a Storefront-specific schema. Register it at `/api/:version/graphql.json`. Remove the URL-rewriting proxy workaround for the Storefront route. The Storefront Yoga instance uses `Shopify-Storefront-Private-Token` for auth (existing token validation in `validateAccessToken` already handles this). |
| `twins/shopify/src/schema/storefront.graphql` | NEW FILE | Storefront-only SDL: `products`, `product`, `collections`, `collection` queries; `Cart` type; no mutations; no `productCreate`, `orderCreate`, etc. |
| `twins/shopify/src/schema/storefront-resolvers.ts` | NEW FILE | Read-only resolvers delegating to existing `stateManager.listProducts()`, `stateManager.getProductByGid()`. |
| `twins/shopify/src/schema/schema.graphql` | NO CHANGE | Stays as Admin-only schema. |
| `twins/shopify/src/schema/resolvers.ts` | NO CHANGE | Admin resolvers unchanged. |

---

### Fix 5: Shopify API versioning — accept multiple versions

**Problem:** All routes in `rest.ts` and the GraphQL endpoint in `graphql.ts` are hardcoded to `/admin/api/2024-01/`. The `@shopify/shopify-api` SDK sends requests with its configured version (e.g., `2024-10`, `2025-01`). The current test harness rewrites URLs to `2024-01` as a workaround; the twin should accept them natively.

| File | Change Type | Change |
|------|-------------|--------|
| `twins/shopify/src/plugins/rest.ts` | MODIFY | Replace all `/admin/api/2024-01/` prefix route registrations with `/admin/api/:version/` parameterized routes. The `:version` param is accessible but ignored — the twin handles all versions identically. No per-version business logic needed. |
| `twins/shopify/src/plugins/graphql.ts` | MODIFY | Register the Admin GraphQL handler at `/admin/api/:version/graphql.json` and Storefront handler at `/api/:version/graphql.json`. The Fastify route handler rewrites the URL to the Yoga `graphqlEndpoint` before calling `yoga.fetch()`. The Yoga `graphqlEndpoint` string does not need to change — only the Fastify route path changes. |

**Implementation note:** Fastify parameterized routes (`/:version/`) match without conflicting with fixed path segments. Existing tests that call `2024-01` continue to work unchanged.

---

### Fix 6: Shopify REST — persistent CRUD with correct response shapes

**Problem:** `rest.ts` POST and PUT handlers return hardcoded static responses (`{ product: { id: 'gid://shopify/Product/1', title: 'New Product' } }`) without persisting state. Real Shopify REST returns numeric `id` fields alongside `admin_graphql_api_id` (GID format).

| File | Change Type | Change |
|------|-------------|--------|
| `twins/shopify/src/plugins/rest.ts` | MODIFY | `POST /products.json`: call `stateManager.createProduct(body.product)`, return `{ product: { id: <integer-autoincrement>, admin_graphql_api_id: <gid>, title, vendor, ... } }` with status 201. `PUT /products/:id.json`: call `stateManager.updateProduct()`. `DELETE /products/:id.json`: call `stateManager.deleteProduct()`. Same CRUD pattern for orders and customers. |
| `packages/state/src/state-manager.ts` | MODIFY | Add `deleteProduct(gid: string)` method. Ensure `createProduct()`, `listProducts()`, `getProductByGid()` responses include the SQLite `id` (INTEGER PRIMARY KEY autoincrement) alongside the existing `gid`. The `products` table already has `id INTEGER PRIMARY KEY AUTOINCREMENT` — just expose it in returned row objects. |

**Key shape:** Real Shopify REST returns `{ id: 1234567890, admin_graphql_api_id: "gid://shopify/Product/1234567890", title: "..." }`. The numeric `id` is the SQLite `id` (autoincrement integer); the GID encodes the same number via the existing `createGID()` utility.

---

### Fix 7: Shopify billing — install state machine

**Problem:** Billing calls are accepted but do not mutate persistent state. The v1.2 requirement asks for state transitions: `appSubscriptionCreate` should persist a subscription with status `PENDING`, and an activation endpoint should transition it to `ACTIVE`.

| File | Change Type | Change |
|------|-------------|--------|
| `packages/state/src/state-manager.ts` | MODIFY | Add `billing_subscriptions` table: `(id INTEGER PRIMARY KEY, shop_domain TEXT, charge_type TEXT, name TEXT, price TEXT, status TEXT, test BOOLEAN, created_at INTEGER)`. Add `createBillingSubscription()`, `getBillingSubscription(id)`, `activateBillingSubscription(id)`, `listBillingSubscriptions(shopDomain)` methods. |
| `twins/shopify/src/schema/resolvers.ts` | MODIFY | `appSubscriptionCreate` mutation: call `stateManager.createBillingSubscription()` with status `PENDING`, return `confirmationUrl` as `<twinBaseUrl>/admin/billing/confirm/<id>`. |
| `twins/shopify/src/schema/schema.graphql` | MODIFY | Ensure `AppSubscriptionStatus` enum exists with `PENDING`, `ACTIVE`, `DECLINED`, `EXPIRED` values. Ensure `appSubscriptionCreate` payload includes `confirmationUrl`. |
| `twins/shopify/src/plugins/rest.ts` | MODIFY | Add REST billing routes: `GET /admin/api/:version/recurring_application_charges.json`, `POST /admin/api/:version/recurring_application_charges.json`, `GET /admin/api/:version/recurring_application_charges/:id/activate.json` — all delegating to the billing state machine. |
| `twins/shopify/src/plugins/admin.ts` | MODIFY | Add `GET /admin/billing/confirm/:id` route that activates the subscription and redirects to the test callback URL. |

---

### Fix 8: Slack 126 missing methods — new plugin files per family

**Problem:** The twin covers ~149 of ~275 bound `@slack/web-api` `WebClient` methods. Families missing include `admin.*`, `workflows.*`, `canvases.*`, `apps.*`, `oauth.v2.exchange`, and others.

**Recommended approach:** One plugin file per method family, mirroring the existing per-family convention (`chat.ts`, `conversations.ts`, `reactions.ts`). The existing `stub()` helper pattern in `stubs.ts` handles auth + `{ ok: true }` in two lines per route.

| File | Change Type | Change |
|------|-------------|--------|
| `twins/slack/src/plugins/web-api/admin.ts` | NEW FILE | Admin family stubs: `admin.apps.*`, `admin.channels.*`, `admin.conversations.*`, `admin.emoji.*`, `admin.teams.*`, `admin.usergroups.*`, `admin.users.*`, `admin.barriers.*` (~60 methods). |
| `twins/slack/src/plugins/web-api/workflows.ts` | NEW FILE | `workflows.triggers.*`, `workflows.steps.listForApp` stubs. |
| `twins/slack/src/plugins/web-api/canvases.ts` | NEW FILE | `canvases.create`, `canvases.delete`, `canvases.edit`, `canvases.sections.lookup` stubs. |
| `twins/slack/src/plugins/web-api/apps.ts` | NEW FILE | `apps.event.authorizations.list`, `apps.manifest.*`, `apps.uninstall`, `apps.permissions.*` stubs. |
| `twins/slack/src/plugins/web-api/slack-oauth-api.ts` | NEW FILE | `oauth.v2.exchange` stub (renamed to avoid collision with the OAuth install plugin at `twins/slack/src/plugins/oauth.ts`). |
| `twins/slack/src/index.ts` | MODIFY | Import and register all new plugin files in `buildApp()` using `await fastify.register(...)`. |

**Anti-pattern to avoid:** Expanding `stubs.ts` into a 500+ line file. Each family gets its own file.

---

### Fix 9: Slack chat.update/delete — channel+author scoping

**Problem:** `chat.update` and `chat.delete` in `chat.ts` do not enforce that the calling token's user owns the message. Real Slack returns `cant_update_message` if a non-author attempts to update; `cant_delete_message` for delete. Bot tokens (`xoxb-`) can update/delete any message they own.

| File | Change Type | Change |
|------|-------------|--------|
| `twins/slack/src/plugins/web-api/chat.ts` | MODIFY | In `chat.update` handler: after fetching `message = slackStateManager.getMessage(ts)`, compare `message.user_id` against `tokenRecord.user_id`. If `tokenRecord.token_type !== 'bot'` and `message.user_id !== tokenRecord.user_id`, return `{ ok: false, error: 'cant_update_message' }`. Apply the same pattern in `chat.delete`, returning `{ ok: false, error: 'cant_delete_message' }`. |
| `twins/slack/src/state/slack-state-manager.ts` | NO CHANGE | `getMessage(ts)` already returns `user_id`; `getToken(token)` already returns `user_id` and `token_type`. Schema change not needed. |

---

### Fix 10: Slack events — Slack signing-secret headers

**Problem:** `packages/webhooks/src/webhook-delivery.ts` hardcodes `X-Shopify-Hmac-Sha256` and `X-Shopify-Topic` headers for all webhook deliveries. Slack Events API requires `X-Slack-Signature: v0=<hex>` and `X-Slack-Request-Timestamp` using a different HMAC format (`v0:{ts}:{body}`, hex-encoded, not base64).

**Slack signing algorithm:** `HMAC-SHA256(signingSecret, "v0:{timestamp}:{body}")` → hex → prefix `"v0="`.

| File | Change Type | Change |
|------|-------------|--------|
| `packages/webhooks/src/types.ts` | MODIFY | Add `signingMode?: 'shopify' \| 'slack'` to `WebhookDelivery` interface. |
| `packages/webhooks/src/webhook-delivery.ts` | MODIFY | Refactor header generation: when `delivery.signingMode === 'slack'`, generate `X-Slack-Request-Timestamp` (current Unix epoch as string) and `X-Slack-Signature: v0=<hex>` using the Slack signing algorithm. When `delivery.signingMode === 'shopify'` or undefined, current behavior unchanged (backward compatible). |
| `twins/slack/src/services/event-dispatcher.ts` | MODIFY | Pass `signingMode: 'slack'` when constructing deliveries for `webhookQueue.enqueue()`. Also: inject `response_url` as an absolute URL in `block_actions` event payloads (requires dispatcher to know the twin's own base URL — pass via constructor option or `process.env.SLACK_TWIN_BASE_URL`). |
| `twins/slack/src/plugins/interactions.ts` | MODIFY | Add `POST /interactions/response-url` route as the target for `response_url` callbacks from Block Kit actions. |

---

### Fix 11: Slack stateful operations — membership, view lifecycle, pin persistence, reaction deduplication

**Problem:** `SlackStateManager` lacks tables for channel membership (join/leave/invite/kick/members), view lifecycle (open/push/update/publish/close), and pin persistence. Reaction deduplication is also missing (adding the same emoji twice by the same user should fail with `already_reacted`).

| File | Change Type | Change |
|------|-------------|--------|
| `twins/slack/src/state/slack-state-manager.ts` | MODIFY | Add to `runSlackMigrations()`: `slack_channel_members (channel_id TEXT, user_id TEXT, joined_at INTEGER, PRIMARY KEY (channel_id, user_id))`, `slack_views (id TEXT PRIMARY KEY, trigger_id TEXT, type TEXT, user_id TEXT, app_id TEXT, hash TEXT, view_json TEXT, created_at INTEGER)`, `slack_pins (id INTEGER PRIMARY KEY, channel_id TEXT, message_ts TEXT, pinned_by TEXT, pinned_to TEXT, created_at INTEGER)`. Prepare statements and add CRUD methods: `addMember`, `removeMember`, `isMember`, `listMembers`, `createView`, `getView`, `updateView`, `deleteView`, `addPin`, `removePin`, `listPins`. Modify `addReaction()` to check for existing reaction and return error signal if duplicate. |
| `twins/slack/src/plugins/web-api/conversations.ts` | MODIFY | `conversations.join`: call `slackStateManager.addMember(channel, tokenRecord.user_id)`. `conversations.leave`: call `removeMember`. `conversations.members`: call `listMembers`, return paginated list. `conversations.invite`: call `addMember` for each user. `conversations.kick`: call `removeMember`. |
| `twins/slack/src/plugins/web-api/views.ts` | MODIFY | `views.open`: call `slackStateManager.createView(...)`, return `{ ok: true, view: { id, hash, type, ... } }`. `views.push`: append to view stack. `views.update`: call `updateView(id, hash)` — reject with `hash_conflict` if hash doesn't match. `views.publish`: upsert app home view (no `trigger_id` needed). |
| `twins/slack/src/plugins/web-api/pins.ts` | MODIFY | `pins.add`: call `slackStateManager.addPin(channel, message_ts, userId)`. `pins.list`: call `listPins(channel)`. `pins.remove`: call `removePin`. |
| `twins/slack/src/plugins/web-api/reactions.ts` | MODIFY | `reactions.add`: call `addReaction()` — if it returns a duplicate signal, return `{ ok: false, error: 'already_reacted' }`. `reactions.get`: query `slack_reactions` by `message_ts` and aggregate. `reactions.remove`: delete from `slack_reactions`. |

---

### Fix 12: Slack scope enforcement

**Problem:** The twin validates token existence but not OAuth scopes. Real Slack returns `{ ok: false, error: 'missing_scope', needed: 'X', provided: 'Y' }` when a token lacks the required scope. The `slack_tokens.scope` column exists and is populated, but plugins ignore it.

| File | Change Type | Change |
|------|-------------|--------|
| `twins/slack/src/services/scope-requirements.ts` | NEW FILE | Static `Record<string, string>` map: method name → required OAuth scope. Example: `'chat.postMessage': 'chat:write'`, `'conversations.list': 'channels:read'`, `'views.open': 'views:write'`. Covers all 275+ methods; methods with no scope requirement map to `''`. |
| `twins/slack/src/services/token-validator.ts` | MODIFY | Add `checkScope(token: string, requiredScope: string, stateManager: SlackStateManager): ScopeCheckResult` where `ScopeCheckResult = { ok: boolean; needed?: string; provided?: string }`. Checks `tokenRecord.scope.split(',')` includes `requiredScope`. |
| `twins/slack/src/plugins/web-api/chat.ts` | MODIFY | In `checkAuthRateError()`, add `checkScope(token, SCOPE_REQUIREMENTS['chat.postMessage'], ...)` call. Return `{ ok: false, error: 'missing_scope', needed, provided }` on failure. Apply to all methods in the chat plugin. |
| `twins/slack/src/plugins/web-api/conversations.ts` | MODIFY | Same scope check pattern for `channels:read`, `channels:write`, `channels:manage`, `channels:join` as appropriate per method. |
| `twins/slack/src/plugins/web-api/views.ts` | MODIFY | Add `views:write` scope check. |

---

### Fix 13: SDK test entrypoint — vitest config and better-sqlite3 ABI

**Problem:** `pnpm test:sdk` fails intermittently due to two causes:
1. `better-sqlite3` is a native Node.js addon compiled against a specific ABI. When Vitest's worker process uses a different Node.js binary than the build environment, the module load fails with `Error: The module was compiled against a different Node.js version`.
2. `vitest.config.ts` configuration issues (pool, global setup path resolution) may cause startup failures.

| File | Change Type | Change |
|------|-------------|--------|
| `tests/sdk-verification/vitest.config.ts` | MODIFY | Confirm `globalSetup` uses `resolve(__dirname, 'setup/global-setup.ts')` (already does). Confirm `pool: 'forks'` with `singleFork: true` (already set). Add `isolate: false` if module singleton sharing is needed across test files. |
| Root `package.json` | MODIFY | Add a `postinstall` script: `"postinstall": "pnpm rebuild better-sqlite3"` to force native recompilation against the active Node.js ABI after every `pnpm install`. |
| `.npmrc` | MODIFY (or create) | Add `rebuild-if-needed=true` if supported by pnpm version, or document the `pnpm rebuild better-sqlite3` step in CI. |

**Diagnosis first:** Run `node -e "require('better-sqlite3')"` in the project root vs. within a `vitest` child process. If the error only appears in tests, ABI mismatch from the forks pool is the cause. If it appears immediately, the initial compile is stale.

---

## Recommended Project Structure (Post-Fix)

```
twins/shopify/src/
+-- plugins/
|   +-- graphql.ts           # MODIFIED: two Yoga instances (Admin + Storefront)
|   +-- oauth.ts             # MODIFIED: GET /admin/oauth/authorize
|   +-- rest.ts              # MODIFIED: :version param, numeric IDs, real CRUD
|   +-- admin.ts             # MODIFIED: billing confirm route
|   +-- errors.ts            # (unchanged)
|   +-- health.ts            # (unchanged)
|   +-- ui.ts                # (unchanged)
+-- schema/
|   +-- schema.graphql       # (unchanged - Admin only)
|   +-- resolvers.ts         # MODIFIED: billing state machine
|   +-- storefront.graphql   # NEW: Storefront-only schema
|   +-- storefront-resolvers.ts # NEW: Storefront read-only resolvers

twins/slack/src/
+-- plugins/web-api/
|   +-- chat.ts              # MODIFIED: channel+author scoping
|   +-- conversations.ts     # MODIFIED: membership operations
|   +-- reactions.ts         # MODIFIED: deduplication
|   +-- pins.ts              # MODIFIED: persistent storage
|   +-- views.ts             # MODIFIED: view lifecycle
|   +-- stubs.ts             # (unchanged)
|   +-- admin.ts             # NEW: admin.* method stubs
|   +-- workflows.ts         # NEW: workflows.* stubs
|   +-- canvases.ts          # NEW: canvases.* stubs
|   +-- apps.ts              # NEW: apps.* stubs
|   +-- slack-oauth-api.ts   # NEW: oauth.v2.exchange stub
+-- services/
|   +-- event-dispatcher.ts  # MODIFIED: Slack signing mode, response_url
|   +-- scope-requirements.ts # NEW: method -> scope map
|   +-- token-validator.ts   # MODIFIED: add checkScope()
+-- state/
|   +-- slack-state-manager.ts # MODIFIED: membership/views/pins tables
+-- index.ts                 # MODIFIED: register new plugins

packages/conformance/src/
+-- comparator.ts            # MODIFIED: bidirectional structural check
+-- runner.ts                # MODIFIED: strict mode in live comparison
+-- types.ts                 # MODIFIED: strict option

packages/webhooks/src/
+-- webhook-delivery.ts      # MODIFIED: Slack signing mode support
+-- types.ts                 # MODIFIED: signingMode field

packages/state/src/
+-- state-manager.ts         # MODIFIED: billing table, deleteProduct, oauth_codes

tests/sdk-verification/
+-- coverage/
|   +-- generate-report.ts   # MODIFIED: execution-evidence derivation
|   +-- derive-symbols.ts    # NEW: reads vitest-results.json
+-- vitest.config.ts         # MODIFIED: JSON reporter
```

---

## Architectural Patterns

### Pattern 1: Two-Yoga Split for Shopify Storefront

**What:** Create a second `createYoga()` instance in `graphql.ts` with a Storefront-specific SDL and resolver set. Register it at `/api/:version/graphql.json`.

**When to use:** When two API surfaces share the same backing data but have different schemas (read-only vs read-write, different field sets).

**Trade-offs:** Two Yoga instances means doubled schema object memory overhead (minimal). The alternative — schema stitching via `@graphql-tools/stitch` — adds a build-time dependency and runtime complexity for a simple isolation problem.

**Example:**
```typescript
// In graphql.ts
const storefrontSchema = makeExecutableSchema({
  typeDefs: readFileSync(storefrontSchemaPath, 'utf-8'),
  resolvers: storefrontResolvers,
});
const storefrontYoga = createYoga({
  schema: storefrontSchema,
  graphqlEndpoint: '/api/STOREFRONT/graphql.json',
  maskedErrors: false,
  context: async ({ req }) => {
    // Validate Shopify-Storefront-Private-Token
    const token = req.headers['shopify-storefront-private-token'];
    // ...
  },
});

fastify.route({
  url: '/api/:version/graphql.json',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: async (req, reply) => {
    // rewrite URL to canonical storefront endpoint before yoga.fetch()
    const url = req.url.replace(/\/api\/[^/]+\/graphql\.json/, '/api/STOREFRONT/graphql.json');
    // ... delegate to storefrontYoga.fetch()
  },
});
```

---

### Pattern 2: Fastify Parameterized Version Routes

**What:** Replace hardcoded `/admin/api/2024-01/` with `/admin/api/:version/` to accept any Shopify API version string.

**When to use:** When a URL path segment is variable but does not change routing behavior — Fastify parameterized routes are the standard approach.

**Trade-offs:** All existing test files using `2024-01` continue to work unchanged. The `:version` parameter is available in `req.params.version` but the twin does not need to use it for v1.2.

---

### Pattern 3: Slack Signing via WebhookDelivery signingMode

**What:** Extend `WebhookDelivery` with a `signingMode` discriminator and branch inside `deliverWebhook()`.

**When to use:** When multiple services share the same delivery infrastructure but use different signing conventions. Avoids duplicating retry/DLQ/queue infrastructure.

**Example:**
```typescript
// packages/webhooks/src/webhook-delivery.ts
if (delivery.signingMode === 'slack') {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const baseString = `v0:${timestamp}:${body}`;
  const hex = crypto.createHmac('sha256', delivery.secret)
    .update(baseString, 'utf8').digest('hex');
  headers['X-Slack-Signature'] = `v0=${hex}`;
  headers['X-Slack-Request-Timestamp'] = timestamp;
  delete headers['X-Shopify-Hmac-Sha256'];
  delete headers['X-Shopify-Topic'];
  delete headers['X-Shopify-Webhook-Id'];
} else {
  // existing Shopify signing (default)
}
```

---

### Pattern 4: Scope Requirement Map

**What:** A static `Record<string, string>` (method name → required OAuth scope) consulted by per-plugin auth helpers.

**When to use:** When many routes share the same enforcement pattern but each has a different required value. Externalizes the data from routing logic, making scope coverage easy to audit and extend.

**Example:**
```typescript
// twins/slack/src/services/scope-requirements.ts (NEW FILE)
export const SCOPE_REQUIREMENTS: Record<string, string> = {
  'chat.postMessage':    'chat:write',
  'chat.update':        'chat:write',
  'chat.delete':        'chat:write',
  'conversations.list': 'channels:read',
  'conversations.join': 'channels:join',
  'views.open':         'views:write',
  // ... 275+ entries
};
```

---

## Data Flow

### Shopify OAuth (After Fix 3)

```
SDK: GET /admin/oauth/authorize?client_id=X&scope=Y&redirect_uri=Z&state=S
    |
    v
oauth.ts
  -> validate client_id, scope, redirect_uri, state
  -> stateManager.createOAuthCode(code, clientId, redirectUri)
  -> HTTP 302 to Z?code=<uuid>&state=S
    |
    v
SDK: POST /admin/oauth/access_token { client_id, client_secret, code }
    |
    v
oauth.ts
  -> validate client_id non-empty, client_secret non-empty
  -> stateManager.consumeOAuthCode(code) -> verify code exists
  -> stateManager.createToken(token, shop_domain, scopes)
  -> { access_token: token, scope: scopes }
```

### Storefront GraphQL (After Fix 4)

```
SDK: POST /api/2025-01/graphql.json
     Header: Shopify-Storefront-Private-Token: xXx
    |
    v
graphql.ts fastify route handler
  -> validateStorefrontToken(xXx, stateManager)
  -> storefrontYoga.fetch(rewritten_url, ...)
    |
    v
storefrontResolvers
  -> stateManager.listProducts() / stateManager.getProductByGid()
  -> { data: { products: { edges: [...] } } }
```

### Slack Events with Signing (After Fix 10)

```
chat.postMessage handler
  -> eventDispatcher.dispatch('message', payload)
    |
    v
EventDispatcher
  -> webhookQueue.enqueue({ signingMode: 'slack', secret: signingSecret, ... })
    |
    v
webhook-delivery.ts
  -> timestamp = Math.floor(Date.now() / 1000)
  -> baseString = "v0:{timestamp}:{body}"
  -> signature = "v0=" + HMAC-SHA256-hex(signingSecret, baseString)
  -> HTTP POST to subscriber:
     X-Slack-Signature: v0=<hex>
     X-Slack-Request-Timestamp: <ts>
     Body: { type: 'event_callback', event: { type: 'message', ... } }
```

---

## Build Order (Dependency-Aware)

```
Phase A: Infrastructure (no dependencies on other fixes)
  Fix 13: SDK test entrypoint (vitest config + better-sqlite3 ABI)
           -> unblocks ability to measure all other fixes
  Fix 1:  Conformance harness bidirectional check
           -> independent of twin changes
  Fix 10: Slack signing headers (webhooks package change)
           -> independent of twin plugin changes

Phase B: Shopify twin (Fix 5 enables Fix 6; Fix 4 independent)
  Fix 5:  API versioning (:version routes)
           -> must come before Fix 6 REST CRUD (routes already parameterized)
  Fix 4:  Storefront separate schema
           -> self-contained, no deps on other fixes
  Fix 3:  OAuth authorize route
           -> self-contained, add after Fix 5 so authorize also uses :version
  Fix 6:  REST CRUD with correct shapes
           -> depends on Fix 5 (version routes already exist)
  Fix 7:  Billing state machine
           -> depends on Fix 6 pattern (numeric IDs established)
           -> depends on Fix 3 (install state after OAuth)

Phase C: Slack twin stateful (Fix 11 enables Fix 9 and Fix 12)
  Fix 11: Stateful operations (membership/views/pins/reaction dedup)
           -> provides tables and methods needed for Fix 9 and Fix 12 tests
  Fix 8:  126 missing method stubs
           -> self-contained, can run parallel with Fix 11
  Fix 9:  chat.update/delete scoping
           -> depends on Fix 11 for reliable test setup (seeded membership)
  Fix 12: Scope enforcement
           -> depends on Fix 11 (token records need scopes verified via clean state)

Phase D: Coverage automation (depends on Fix 13)
  Fix 2:  Execution-evidence coverage
           -> depends on Fix 13 (tests must pass to generate evidence)
```

| Fix | Depends On | Blocks | Can Parallelize With |
|-----|-----------|--------|---------------------|
| 13 (SDK entrypoint) | — | 2 | 1, 10 |
| 1 (conformance bidirectional) | — | — | 13, 10 |
| 10 (Slack signing) | — | — | 1, 13 |
| 5 (API versioning) | — | 6 | 3, 4, 10 |
| 4 (Storefront schema) | — | — | 3, 5 |
| 3 (OAuth authorize) | — | 7 (partially) | 4, 5 |
| 6 (REST CRUD shapes) | 5 | 7 | 4, 3 |
| 7 (Billing state) | 6, 3 | — | 8, 11 |
| 11 (Slack state tables) | — | 9, 12 | 7, 8 |
| 9 (chat scoping) | 11 | — | 8, 12 |
| 12 (scope enforcement) | 11 | — | 9, 8 |
| 8 (126 missing methods) | — | — | 9, 11, 12 |
| 2 (coverage automation) | 13 | — | — |

---

## Anti-Patterns

### Anti-Pattern 1: Expanding stubs.ts for 126 missing methods

**What people do:** Add all 126 missing routes to the existing `stubs.ts` file.

**Why it's wrong:** `stubs.ts` already covers ~60 methods in 150 lines. Adding 126 more produces a 500+ line file that's impossible to navigate. The existing per-family grouping (`chat.ts`, `conversations.ts`, `reactions.ts`) is the established convention.

**Do this instead:** One plugin file per method family: `admin.ts`, `workflows.ts`, `canvases.ts`, `apps.ts`, `slack-oauth-api.ts`.

---

### Anti-Pattern 2: Schema stitching for Shopify Storefront

**What people do:** Use `@graphql-tools/stitch` to combine Admin and Storefront schemas with delegation resolvers.

**Why it's wrong:** The two schemas share no mutation surface. Stitching adds a non-trivial dependency with its own version drift risk for a problem that has a simpler solution.

**Do this instead:** Two independent `createYoga()` instances. Each serves exactly its endpoints. No stitching, no delegation.

---

### Anti-Pattern 3: Global Fastify preHandler for Slack scope enforcement

**What people do:** Register `fastify.addHook('preHandler', scopeCheck)` globally.

**Why it's wrong:** Not every route needs scope enforcement (health, admin, OAuth install flow, stubs serving `{ ok: true }`). A global hook requires explicit exclusion of those routes, inverting the established per-plugin pattern.

**Do this instead:** Call `checkScope()` inside the existing per-plugin auth flow (`checkAuthRateError()` in `chat.ts`, similar helpers in other plugins). The scoping logic stays co-located with the route.

---

### Anti-Pattern 4: Duplicating webhook-delivery.ts for Slack

**What people do:** Create `slack-webhook-delivery.ts` that copies the retry/delivery logic from `webhook-delivery.ts`.

**Why it's wrong:** The retry, timeout, and error handling logic is shared infrastructure. The only difference is header generation and HMAC format.

**Do this instead:** Add `signingMode` to `WebhookDelivery` and branch inside the existing `deliverWebhook()`. One function, two signing behaviors.

---

## Integration Points

### Cross-Package Boundaries

| Boundary | Communication Pattern | Fix # |
|----------|----------------------|-------|
| `@dtu/webhooks` webhook-delivery.ts <-> Slack event-dispatcher.ts | `signingMode: 'slack'` on `WebhookDelivery` | Fix 10 |
| `packages/state` StateManager <-> Shopify REST plugin | `deleteProduct()`, numeric ID in list/get responses | Fix 6 |
| `packages/state` StateManager <-> Shopify OAuth plugin | `createOAuthCode()`, `consumeOAuthCode()` | Fix 3 |
| `packages/state` StateManager <-> Shopify billing resolvers | `billing_subscriptions` CRUD | Fix 7 |
| `SlackStateManager` <-> Slack Web API plugins | `addMember`, `removeMember`, `createView`, `addPin` etc. | Fix 11 |
| `packages/conformance` comparator <-> conformance suites | `strict: true` in live mode | Fix 1 |
| Vitest JSON reporter <-> `generate-report.ts` | `vitest-results.json` artifact | Fix 2 |

### Fastify Plugin Registration Order (twins/slack/src/index.ts)

New plugins for Fix 8 must be registered after `slackStateManager` and `signingSecret` are decorated onto the Fastify instance. Append to the existing registration block:

```typescript
// After existing plugin registrations in buildApp()
await fastify.register(adminWebApiPlugin);    // new — admin.* stubs
await fastify.register(workflowsPlugin);      // new — workflows.* stubs
await fastify.register(canvasesPlugin);       // new — canvases.* stubs
await fastify.register(appsPlugin);           // new — apps.* stubs
await fastify.register(slackOAuthApiPlugin);  // new — oauth.v2.exchange stub
```

---

## Scaling Considerations

These fixes target dev/test infrastructure only. All twins run in-process with in-memory SQLite.

| Scale | Notes |
|-------|-------|
| Single test run | All fixes appropriate |
| CI parallelization | `pool: 'forks', singleFork: true` ensures sequential runs within sdk-verification — no state races |
| Multi-tenant isolation | Each `buildApp()` call creates a fresh `:memory:` SQLite database — full isolation by default |

---

## Sources

All findings are HIGH confidence based on direct codebase inspection.

- `twins/shopify/src/plugins/graphql.ts` — confirmed single Yoga instance, URL-rewrite workaround for Storefront
- `twins/shopify/src/plugins/oauth.ts` — confirmed missing GET authorize route, no credential validation
- `twins/shopify/src/plugins/rest.ts` — confirmed GID IDs on POST response, hardcoded `2024-01` prefix
- `packages/state/src/state-manager.ts` — confirmed schema, existing tables, INTEGER PRIMARY KEY autoincrement on products
- `twins/slack/src/state/slack-state-manager.ts` — confirmed missing membership/views/pins tables, reactions table exists
- `twins/slack/src/plugins/web-api/chat.ts` — confirmed update/delete missing channel+author scope check
- `twins/slack/src/plugins/web-api/stubs.ts` — confirmed 60 methods covered, 126 families absent
- `twins/slack/src/services/event-dispatcher.ts` — confirmed uses `webhookQueue.enqueue()` without `signingMode`
- `packages/webhooks/src/webhook-delivery.ts` — confirmed hardcoded `X-Shopify-Hmac-Sha256` and `X-Shopify-Topic`
- `packages/conformance/src/comparator.ts` — confirmed `compareStructure()` iterates only twin keys, not bidirectional
- `tests/sdk-verification/coverage/generate-report.ts` — confirmed 300-line hand-authored `LIVE_SYMBOLS` map
- `tests/sdk-verification/vitest.config.ts` — confirmed `pool: 'forks', singleFork: true`

---

*Architecture research for: Sandpiper DTU v1.2 behavioral fidelity fixes*
*Researched: 2026-03-11*
