# Domain Pitfalls

**Domain:** Adding behavioral fidelity fixes to an existing digital twin system with 177 passing SDK tests
**Researched:** 2026-03-11
**Confidence:** HIGH

---

## Critical Pitfalls

Mistakes that cause passing tests to regress, or that "fix" one gap while creating a new one.

---

### Pitfall 1: Tightening OAuth Breaks the Token Seeder

**What goes wrong:**
The current Shopify OAuth flow (`/admin/oauth/access_token`) accepts any `code` and issues a token. This permissive behavior is relied on by `seedShopifyAccessToken()` in `tests/sdk-verification/setup/seeders.ts`, which sends a hardcoded `code: 'test-auth-code'` and gets a real token back. All 24 SDK test files that test Shopify call this seeder.

When implementing real OAuth (add `/admin/oauth/authorize` route, validate `code` against a pending-auth record created by the authorize step), the token exchange endpoint will start rejecting codes that were never issued by the authorize step. `seedShopifyAccessToken()` immediately breaks. Every Shopify SDK test that seeds via this helper fails.

The deeper trap: the fix requires not just adding the authorize route, but also deciding whether the seeder should: (a) call authorize first, then exchange the code (correct but requires following redirects in tests), or (b) continue bypassing OAuth by using a new admin endpoint that directly seeds tokens (parallel path to `seedSlackBotToken()`). Option (b) is safer for test isolation but requires adding a Shopify-side `POST /admin/tokens` admin endpoint analogous to the Slack one.

**Why it happens:**
OAuth tightening looks like a self-contained change to `twins/shopify/src/plugins/oauth.ts`, but the seeder in `tests/sdk-verification/setup/seeders.ts` depends on the permissive behavior. The dependency is invisible from the oauth plugin's perspective.

**How to avoid:**
Before tightening OAuth: add `POST /admin/tokens` to the Shopify twin's admin plugin that directly creates a token in StateManager. Update `seedShopifyAccessToken()` to use the admin endpoint instead of the OAuth exchange endpoint. Verify all 24 SDK test files still pass. Only then add the real authorize route and restrict the exchange endpoint to only accept codes issued by the authorize step.

**Warning signs:**
- Any change to `/admin/oauth/access_token` that validates the `code` parameter
- No corresponding update to `seeders.ts` in the same commit
- `seedShopifyAccessToken()` begins throwing errors in test run logs

**Phase to address:**
Shopify OAuth fix phase. Must update `seeders.ts` and add `POST /admin/tokens` admin endpoint as the first step, before any OAuth validation changes.

---

### Pitfall 2: API Version URL Change Breaks All SDK Tests Simultaneously

**What goes wrong:**
All Shopify REST routes are registered at `/admin/api/2024-01/*` (hardcoded). The SDK test helpers use `apiVersion: '2024-01'` to match. Adding multi-version routing means the twin must now accept `/admin/api/2024-10/*` and `/admin/api/2025-01/*` as well.

The naive implementation adds new hardcoded route sets for each version — three copies of 30+ REST routes. The correct implementation uses a wildcard version segment (`/admin/api/:version/*`). But if the wildcard approach is implemented incorrectly, existing routes that are already registered at `2024-01` will conflict with the new wildcard routes, causing Fastify to throw on startup.

The second trap: `@shopify/shopify-api` uses `apiVersion` from its config object to build request URLs. If the twin starts accepting `2025-01` routes but the Yoga/GraphQL endpoint is still only mounted at `/admin/api/2024-01/graphql.json`, GraphQL tests that use newer API versions will hit 404 on the GraphQL endpoint even though REST routes work.

**Why it happens:**
The GraphQL endpoint (`graphqlEndpoint: '/admin/api/2024-01/graphql.json'`) is registered inside GraphQL Yoga's config, not as a standard Fastify route. Fastify's wildcard routing does not automatically extend to Yoga's internal endpoint routing — Yoga ignores the Fastify route params and uses its configured static endpoint path.

**How to avoid:**
Use a Fastify prefix wildcard (`/admin/api/:version`) with a `preHandler` hook that normalizes the version to `2024-01` before routing. This single normalization point means all downstream routes continue working without changes. The GraphQL endpoint must also be dynamically parameterized or wrapped in a version-normalizing proxy route. Verify the approach by running the full SDK test suite (not just REST tests) after the change.

**Warning signs:**
- GraphQL SDK tests return 404 after version routing is added
- Fastify throws "Route already exists" on startup
- Only REST tests pass; GraphQL tests fail under the new version routing

**Phase to address:**
API version routing phase. Must include a test that fires a request at `/admin/api/2025-01/graphql.json` and verifies the GraphQL response (not 404) before the fix is considered complete.

---

### Pitfall 3: REST Resource ID Format Change Breaks GraphQL Resolvers

**What goes wrong:**
The current REST plugin returns GID-format IDs for some resources (`id: 'gid://shopify/Product/1'`) and numeric IDs for others (`id: 1` for webhooks). The real Shopify REST API always returns numeric IDs and separately provides `admin_graphql_api_id` as the GID bridge.

Fixing this to return `id: 123` (numeric) and `admin_graphql_api_id: 'gid://shopify/Product/123'` is correct for REST fidelity. But the customer GET-by-ID endpoint constructs the GID from the URL parameter: `getCustomerByGid('gid://shopify/Customer/${id}')` where `id` comes from the URL path like `/admin/api/2024-01/customers/123.json`.

If the URL parameter is the numeric ID (as it should be in real Shopify REST), then the GID lookup works correctly because `123` is embedded in the GID. But if any existing GraphQL tests use the GID as both the URL path segment AND the GraphQL ID field, fixing the REST format could break those tests' fixture assumptions.

The second trap: `packages/state/src/state-manager.ts` stores customers with `gid` as the primary lookup key. The REST endpoint currently does `getCustomerByGid('gid://shopify/Customer/${id}')` — which works when `id` is numeric. But if other code anywhere in the system stored resources with `id` equal to the full GID string, the numeric lookup will return null.

**Why it happens:**
The REST and GraphQL APIs in Shopify share the same underlying resource IDs, but the REST URL uses the numeric segment while GraphQL uses the full GID. The twin conflates the two ID formats across different endpoints.

**How to avoid:**
Audit all existing test fixtures (`twins/shopify/conformance/fixtures/`) for resources that assume a specific ID format. Run the full integration test suite (`twins/shopify/test/integration.test.ts`) and SDK verification suite before and after the format change. The key invariant to preserve: the numeric segment in REST URLs must match the numeric segment in the GID — e.g., REST `/customers/123.json` returns a record whose GID is `gid://shopify/Customer/123`.

**Warning signs:**
- Integration tests for customer/order/product endpoints fail after ID format change
- GraphQL resolver tests that use fixture GIDs return null
- `getCustomerByGid()` calls return undefined for resources that previously existed

**Phase to address:**
REST persistence fix phase. Add a "round-trip ID test" to integration.test.ts: create a resource via GraphQL (returns GID), parse the numeric segment, fetch via REST using the numeric ID, verify `admin_graphql_api_id` matches the original GID.

---

### Pitfall 4: Structural Conformance Comparison False Failures on Non-Deterministic Fields

**What goes wrong:**
The `compareResponsesStructurally()` function in `packages/conformance/src/comparator.ts` currently allows the twin to return a subset of the live API's fields (extra keys in baseline are acceptable). When real twin-vs-live comparison is added, the comparison direction matters critically.

If the comparator is inverted — checking that the live response has all the twin's fields, rather than that the twin has all the live response's fields — real Shopify and Slack responses with extra fields (timestamps, pagination cursors, `__typename` injections, non-deterministic IDs) will cause every comparison to fail.

The second trap: some fields exist in the live API response that are intentionally absent from the twin (e.g., `shop_money`, `presentment_money`, Shopify's complex fulfillment edge structures). If the structural comparison is made bidirectional (twin must have all of live's fields), these intentional omissions become false failures that pressure developers to add noise fields to the twin rather than fix real gaps.

**Why it happens:**
The comparator was designed for "twin is a simplified subset" semantics (current offline/fixture mode). Adding real live comparison pressure to make it bidirectional destroys the subset semantics that protect against false failures on optional fields.

**How to avoid:**
Keep the asymmetric comparison semantics: check that every field the twin returns also exists in the live response with a compatible type. Do NOT require the twin to have every field the live API returns. Add a `stripFields` normalizer for known non-deterministic fields (timestamps, UUIDs, cursor values) to both sides before comparison. Run conformance against live APIs in a staging environment before declaring any structural comparison result definitive.

**Warning signs:**
- Conformance report shows 100% structural failures on the first real live run
- Failure messages report missing fields that are timestamps or IDs
- The comparator is changed to flag cases where live has fields the twin does not

**Phase to address:**
Conformance harness phase. Add an explicit normalizer config test that proves non-deterministic fields (timestamps, pagination cursors) are stripped from both sides before comparison.

---

### Pitfall 5: LIVE_SYMBOLS Replacement Silently Drops Coverage Tracking

**What goes wrong:**
The current coverage system uses a hand-authored `LIVE_SYMBOLS` dictionary in `tests/sdk-verification/coverage/generate-report.ts`. The v1.2 goal is to derive coverage from test execution evidence rather than hand-authored metadata. However, replacing `LIVE_SYMBOLS` with execution-derived data requires that every test run actually emits coverage evidence that the report generator can read.

If the execution-evidence mechanism is not wired into CI before `LIVE_SYMBOLS` is removed, `pnpm drift:check` (which checks that no symbol has `null` tier) will start failing because the report generator no longer has data to mark symbols as `live`. The 202 symbols currently tracked as `live` will revert to `deferred`, and the CI gate will fail.

The second trap: `coverage-report.json` is checked into git. If the execution-evidence approach requires regenerating this file on every test run rather than once per milestone, the checked-in file becomes stale immediately after any test is added or changed, creating permanent diff noise.

**Why it happens:**
The migration from hand-authored to execution-derived coverage has two phases: (1) add the evidence collection mechanism, (2) remove the hand-authored fallback. If the commit doing step 2 happens before step 1 is wired into CI, the gate breaks.

**How to avoid:**
Implement execution-evidence collection as an additive change that runs alongside `LIVE_SYMBOLS`. Only remove `LIVE_SYMBOLS` entries for a symbol once the execution-evidence mechanism has proven it covers that symbol in CI. Use a transition period where both mechanisms agree. Never remove `LIVE_SYMBOLS` in the same commit that introduces the evidence mechanism.

**Warning signs:**
- `pnpm drift:check` starts failing after a coverage infrastructure change
- The summary in `coverage-report.json` shows fewer than 202 live symbols
- `coverage-report.json` has large diffs in every PR that touches test files

**Phase to address:**
Coverage infrastructure phase. The transition plan must be: add evidence collection → verify both mechanisms agree for 202 symbols → remove hand-authored entries incrementally → verify CI gate continues passing throughout.

---

### Pitfall 6: Slack Scope Enforcement Breaks Existing Tests With Minimal-Scope Tokens

**What goes wrong:**
The current Slack twin performs token existence validation but no scope validation. `seedSlackBotToken()` seeds tokens with `scope: 'chat:write'`. When per-method scope enforcement is added (e.g., `conversations.list` requires `channels:read`, `users.list` requires `users:read`), all SDK tests that seed a minimal-scope token and then call methods requiring broader scopes will get `missing_scope` errors and fail.

The Slack `stubs.ts` plugin registers 80+ stub methods. Each stub currently does only token existence check. If scope enforcement is added globally, every stub's response changes from `{ ok: true }` to `{ ok: false, error: 'missing_scope' }` for the minimal-scope test token.

**Why it happens:**
The `seedSlackBotToken()` default scope is `'chat:write'` — chosen for the chat tests, not for the 80+ stub methods. Adding scope enforcement without updating the seeder scope exposes this assumption.

**How to avoid:**
Before adding scope enforcement: audit every SDK test file that seeds a token and determine the minimum scope set required by all methods it calls. Update `seedSlackBotToken()` to accept a `scope` parameter (default: a broad scope covering all tested methods). Add a broad-scope token as the test fixture default (`scope: 'channels:read,channels:write,chat:write,users:read,..all common scopes..'`). Add scope enforcement for one method at a time, running the full SDK test suite after each addition.

**Warning signs:**
- `seedSlackBotToken()` hardcodes `scope: 'chat:write'` with no parameter
- Scope enforcement is added to all methods in a single commit
- Stub tests start returning `missing_scope` errors

**Phase to address:**
Slack scope enforcement phase. Must update `seedSlackBotToken()` to use a comprehensive test scope before any scope validation logic is added to the twin.

---

### Pitfall 7: Slack Route Registration Explosion Causes Startup Failures

**What goes wrong:**
Adding 126 new Slack methods means registering 126 new routes in `stubs.ts` or new dedicated plugin files. Fastify uses a trie-based router (`find-my-way`) that scales well with route count, so route registration performance is not the primary risk. The real risk is duplicate route registration.

The current `stubs.ts` already registers ~80 routes. If new routes are added for methods that already have explicit implementations in `chat.ts`, `conversations.ts`, `users.ts`, `files.ts`, `reactions.ts`, `pins.ts`, or `views.ts`, Fastify will throw a `"Route already exists"` error at startup — not at request time. This crash surfaces in the global-setup teardown as an opaque error, and the entire SDK test suite fails to start.

The second trap: Slack API methods like `conversations.members` and `conversations.history` are not currently in `stubs.ts` and are not in any dedicated plugin. Adding them to `stubs.ts` as stubs is safe. But if a developer later adds proper implementations of these methods to a new plugin file AND forgets to remove the stub, the duplicate route crash surfaces again.

**Why it happens:**
There is no enforcement preventing a method from being registered in both the stubs plugin and a dedicated plugin. The only defense is manual audit, which fails at scale.

**How to avoid:**
Before adding any new routes: generate a list of all currently registered Slack API routes by grepping all plugin files for `fastify.post('/api/`. Check this list against the 126 new methods to identify any overlaps. When implementing dedicated plugins for new method families, add a comment to `stubs.ts` removing the stub entry for that method AND add a test that catches duplicate routes.

Optionally, add a startup self-test in the global setup that verifies the total number of registered routes matches the expected count.

**Warning signs:**
- Fastify throws `FST_ERR_DUP_ROUTE` on startup in global-setup
- The error is reported as "global-setup teardown failure" rather than a route conflict
- CI shows all SDK tests as failed with no individual test output (startup crash)

**Phase to address:**
Slack method expansion phase. Do a route audit before adding any routes. Add a startup health check that the Slack twin registers an expected minimum number of routes.

---

### Pitfall 8: Stateful Slack Operations Require Schema Migration That Breaks Test Resets

**What goes wrong:**
Making `conversations`, `views`, `pins`, and `reactions` stateful requires new database tables in `SlackStateManager`. The `POST /admin/reset` endpoint — called in every test's `beforeEach` — resets state by dropping and recreating tables. If new tables are added to `SlackStateManager` but the reset logic (`resetTables()` or equivalent) is not updated to include them, the reset leaves stale data from previous tests. Tests that assume clean state after reset find unexpected records.

The second trap: `SlackStateManager` extends `StateManager` from `@dtu/state`. New tables specific to Slack state (conversation membership, view lifecycle, pin/reaction persistence) must be created in `SlackStateManager.init()` and included in `SlackStateManager.reset()`. If new tables are added to `init()` but not to `reset()`, the reset endpoint leaves the new tables populated — a silent bug that causes intermittent test failures depending on test ordering.

**Why it happens:**
`init()` and `reset()` are symmetrical operations that must stay synchronized. Adding a table to `init()` without adding the corresponding `DELETE FROM <table>` (or `DROP TABLE + CREATE TABLE`) to `reset()` is easy to miss, especially when multiple tables are added at once.

**How to avoid:**
Write a test that verifies the reset endpoint leaves all Slack state tables empty. Run this test as part of the Slack stateful operations phase before any new stateful code. Use a structural approach: `SlackStateManager` should have a `SLACK_TABLES` constant listing every table it owns, and `reset()` should iterate over this constant rather than having individual DELETE statements. Adding a new table requires adding it to `SLACK_TABLES` — a single, reviewable location.

**Warning signs:**
- Tests pass when run in isolation but fail when run in suite order
- Pin/reaction/conversation count assertions are non-deterministic across runs
- A test expecting zero items after reset finds items from a previous test

**Phase to address:**
Slack stateful operations phase. The reset coverage test must be the first test written, before any new stateful code is implemented.

---

### Pitfall 9: Billing State Machine Changes Break Existing Billing Tests

**What goes wrong:**
The existing billing stubs in the Shopify twin accept `appSubscriptionCreate` and similar mutations but return minimal valid shapes without mutating install state. The Shopify SDK tests for billing (`shopify-api-billing.test.ts`) currently pass against these stateless stubs.

When billing is changed to mutate install state (store the subscription, track status transitions, return accurate `status: ACTIVE` or `status: PENDING` responses), any existing billing test that: (a) calls `appSubscriptionCreate` multiple times expecting the same stub response, or (b) checks billing status without setting up the state machine correctly, will fail.

The specific risk: `Shopify.billing.check()` after the fix will return `false` for a shop that has never had `appSubscriptionCreate` called. Currently it may return a hardcoded response. If tests call `check()` first and expect the current stub response, those tests fail after the state machine is added.

**Why it happens:**
The billing tests were written against stateless stubs. The expected behavior was "return a valid shape." After adding state, the expected behavior is "reflect the actual billing state." Tests that don't set up state before checking it will get different responses.

**How to avoid:**
Before adding billing state: read every assertion in `shopify-api-billing.test.ts`. Identify which tests will need to call `appSubscriptionCreate` before calling `billing.check()`. Add a `POST /admin/reset` call at the start of each test (already done via `resetShopify()`). Update test setup to explicitly create billing state before testing billing queries. Run billing tests against the stub first, then against the state-machine implementation.

**Warning signs:**
- `billing.check()` assertions fail after billing state machine is added
- Tests that previously passed `billing.check()` now fail because subscription was never created
- The billing mutation creates state that persists across tests (reset not called)

**Phase to address:**
Shopify billing fix phase. All existing `shopify-api-billing.test.ts` tests must be reviewed and updated as part of the same change that adds the state machine.

---

### Pitfall 10: Signing Secret Header Change Breaks Bolt SDK Request Verification

**What goes wrong:**
The Slack twin's event signing currently uses `signingSecret` for outbound event delivery (signing events the twin sends to apps). The v1.2 fix adds inbound request verification (the twin validates signatures on events it receives from apps/Bolt test helpers).

The Bolt SDK's `HTTPReceiver` and `ExpressReceiver` sign every outbound request to the events URL using `X-Slack-Signature` and `X-Slack-Request-Timestamp` headers. The existing SDK tests for Bolt HTTP receivers (`slack-bolt-http-receivers.test.ts`) send test events to the twin's `/events` endpoint.

If the twin adds signature verification on inbound requests to `/events`, the existing Bolt SDK tests will start failing because the signing secret used in the test may not match the twin's configured `signingSecret` (`dev-signing-secret`). Bolt's test app and the twin must use the same secret.

The second trap: the `EventDispatcher` and `InteractionHandler` use `signingSecret` for signing outbound payloads. If the v1.2 fix also changes which header format is used (e.g., adding `X-Slack-Signature` in addition to or instead of `X-Shopify-Hmac-SHA256` style headers), any test that currently verifies outbound event signatures will fail.

**Why it happens:**
The signing secret is shared infrastructure used for both inbound verification and outbound signing. Changing one direction affects both.

**How to avoid:**
Before adding inbound signature verification: check what signing secret Bolt test apps use in `slack-bolt-http-receivers.test.ts`. Confirm the twin's `SLACK_SIGNING_SECRET` environment variable matches. The global-setup starts the Slack twin without setting `SLACK_SIGNING_SECRET`, so it defaults to `'dev-signing-secret'`. Bolt test apps must be configured with the same secret. Add a test that explicitly verifies the end-to-end signing round-trip before deploying the change.

**Warning signs:**
- Bolt receiver tests fail with `invalid_signature` or `signature_mismatch` errors
- Tests that previously passed start failing only when `signingSecret` is checked
- Tests pass locally but fail in CI where environment variables differ

**Phase to address:**
Event signing fix phase. Must explicitly test that the Bolt test app's signing secret and the twin's `signingSecret` are the same value, as a pre-change assertion.

---

### Pitfall 11: Storefront Schema Split Breaks Shared Resolver Coverage

**What goes wrong:**
The current `graphql.ts` plugin serves both Admin and Storefront GraphQL from a single schema, with the Storefront endpoint proxied to the Admin schema (`req.url.replace('/api/2024-01/graphql.json', '/admin/api/2024-01/graphql.json')`). The v1.2 fix creates a separate Storefront schema that excludes admin-only mutations.

The risk: the `shopify-api-storefront-client.test.ts` SDK test currently passes because the proxy approach works — Storefront queries (which are a subset of Admin queries) succeed against the Admin schema. After splitting, if the Storefront schema is missing any type or field that the SDK test exercises, those tests fail.

The second trap: `makeExecutableSchema` in `@graphql-tools/schema` creates a new schema instance. If the Storefront schema is created by duplicating the Admin schema and removing types, any type that is present in the Admin schema but accidentally removed from the Storefront schema causes a schema validation error at startup, not a test failure.

**Why it happens:**
Schema splitting is done by removing types/fields from the Admin schema rather than building the Storefront schema independently from its own SDL. Removing a type that is referenced by another type causes GraphQL schema validation to fail with `Unknown type: "X"`.

**How to avoid:**
Create the Storefront schema from a separate `storefront.graphql` SDL file rather than by modifying the Admin schema. The Storefront schema should only define types and queries needed for Storefront operations (product, product variants, collections, checkout). Run `makeExecutableSchema` on the new SDL independently. Verify the schema is valid with `assertValidSchema()` from `graphql`. Check `shopify-api-storefront-client.test.ts` to determine exactly which types and fields the SDK exercises against the Storefront endpoint.

**Warning signs:**
- GraphQL schema validation errors at startup after schema split
- `shopify-api-storefront-client.test.ts` tests fail with `field not found in schema`
- The Admin schema tests regress after Storefront schema code is added

**Phase to address:**
Storefront schema fix phase. Must run the full Shopify GraphQL test suite (both Admin and Storefront) before declaring the schema split complete.

---

### Pitfall 12: Chat.update/delete Author Scoping Breaks Existing Chat Tests

**What goes wrong:**
The current `chat.update` implementation checks only token existence and channel existence. It does not enforce that the token's user is the message author. The v1.2 fix adds `cant_update_message` / `user_cannot_edit_message` error returns when the calling user is not the message author.

The existing SDK chat tests (`slack-chat.test.ts`) may test `chat.update` by creating a message with token A and then updating it with token A (same user — should succeed). But if any test creates a message and then updates it using a different token seeded with `seedSlackBotToken()`, that test will start failing with `cant_update_message`.

The conformance test in `twins/slack/conformance/suites/chat.conformance.ts` also exercises `chat.update`. If the conformance fixture was recorded using a token that is not the message author, the conformance comparison will start failing.

**Why it happens:**
The author scoping rule was not enforced during v1.0, so tests were written without needing to guarantee author identity. The fix enforces a rule that tests implicitly violated.

**How to avoid:**
Before enforcing author scoping: read every test in `slack-chat.test.ts` and the chat conformance suite that calls `chat.update` or `chat.delete`. For each test, verify that the token used to post the message is the same token used to update/delete it. Where they differ, update the test to use a consistent token. The seeder pattern to use: seed a token, post a message with that token, update with the same token.

**Warning signs:**
- `chat.update` returns `cant_update_message` in tests where it previously returned success
- Tests that create a message and update it using the default bot token fail
- Conformance tests for chat operations fail with new error responses

**Phase to address:**
Chat scoping fix phase. Must audit and update all chat tests before the scoping rule is enforced.

---

### Pitfall 13: better-sqlite3 ABI Mismatch in Docker Kills CI Silently

**What goes wrong:**
`better-sqlite3` is a native module compiled against a specific `NODE_MODULE_VERSION`. When the Node.js version in the Docker container differs from the version used to install dependencies, the module fails to load with `"The module was compiled against a different Node.js version using NODE_MODULE_VERSION X. This version requires NODE_MODULE_VERSION Y."` The twin process crashes immediately on startup, before any tests run.

In CI, this appears as a global-setup failure: the `buildApp()` call never returns, the timeout fires, and all test files report failure. The error message is buried in the global-setup log output rather than a test result.

Current project: the project runs Node 24.12.0 locally. If the Docker image uses a different Node version (e.g., `node:20-alpine` in `docker-compose.yml`), the `better-sqlite3` binary compiled under Node 24 will not work. This is confirmed by the GitHub issue showing `NODE_MODULE_VERSION 127` (Node 24) vs `NODE_MODULE_VERSION 115` (Node 22) incompatibility.

**Why it happens:**
Native modules are compiled at `pnpm install` time. If install is run outside Docker and the Docker image uses a different Node version, the binary is incompatible. `pnpm install --frozen-lockfile` in CI does not rebuild native modules.

**How to avoid:**
Pin the Node.js version in the Docker image to exactly match the project's `.nvmrc` or `package.json` `engines.node` field. Add `npm rebuild better-sqlite3` (or `pnpm rebuild better-sqlite3`) as a Dockerfile step after copying `node_modules` from the build context. Add a CI startup test: `node -e "require('better-sqlite3')()"` that explicitly loads the module and reports the Node version alongside any error.

**Warning signs:**
- Global-setup times out without individual test failures
- Docker container exits immediately after the twin start command
- `pnpm test:sdk` passes locally but all tests fail in CI with no individual failure output

**Phase to address:**
CI/infrastructure phase. Must be verified on the CI Docker image before any other twin changes.

---

## Sequencing Pitfalls

Mistakes in the order fixes are applied.

---

### Sequencing Pitfall S1: Fixing Infrastructure (Coverage/Conformance) Before Fixing Twins

**What goes wrong:**
If the conformance harness is updated to perform real twin-vs-live structural comparison before the twin behavioral gaps are fixed, every conformance run will report failures for the known gaps. Developers begin to ignore conformance failures, treating them as "expected noise." When the twin fixes are later applied, real failures caused by regressions are hidden in the existing noise.

**How to avoid:**
Fix twin behavioral gaps first (OAuth, Storefront schema, REST persistence, billing, Slack methods, scope enforcement, stateful operations). Then update the conformance harness. The conformance harness update should go from "0 structural failures before" to "0 structural failures after" — a clean transition. If the conformance harness is fixed while the twin still has known gaps, the transition looks like "40 failures before, 0 failures after," which hides whether any regressions were introduced.

**Phase to address:**
All twin fix phases should precede the conformance harness fix phase.

---

### Sequencing Pitfall S2: Fixing Many Gaps Simultaneously

**What goes wrong:**
Making 13 behavioral changes across both twins in parallel creates a situation where any regression is hard to attribute. If Shopify OAuth, API version routing, REST persistence, billing, Storefront schema, and Slack changes all land in overlapping commits, and then `pnpm test:sdk` shows 5 failing tests, the bisection space is large.

**How to avoid:**
Apply fixes in isolated, independently-verifiable phases. Each phase ends with `pnpm test:sdk` passing. The recommended order based on dependency graph:

1. Infrastructure: Docker/ABI fix, coverage transition (LIVE_SYMBOLS → execution evidence), test seeder updates
2. Shopify OAuth (requires seeder update first — see Pitfall 1)
3. Shopify REST persistence (numeric IDs + `admin_graphql_api_id`)
4. Shopify API version routing (requires REST persistence to be correct first)
5. Shopify Storefront schema split
6. Shopify billing state machine
7. Slack method expansion (126 new methods — additive, low regression risk)
8. Slack stateful operations (conversations/views/pins/reactions)
9. Slack scope enforcement (requires broad test-token scope update first — see Pitfall 6)
10. Slack chat.update/delete author scoping
11. Slack event signing verification
12. Conformance harness: real twin-vs-live structural comparison

Steps 7-11 can be parallelized if different developers work on each, but each step must maintain a passing SDK test suite independently.

**Phase to address:**
Roadmap design phase. Build explicit go/no-go gates: each phase requires `pnpm test:sdk` to pass before the next phase begins.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping `LIVE_SYMBOLS` hand-authored dictionary after v1.2 | No migration work | Coverage tracking stays decoupled from actual test execution; any test change requires a manual dictionary update | Never: the v1.2 goal is execution-derived coverage |
| Adding new Slack methods only to `stubs.ts` without dedicated state | Fast to implement | Methods remain non-functional stubs; SDK tests pass but real behavioral fidelity is absent | Acceptable for methods that the real Slack API also returns minimal responses for (info queries on non-existent resources) |
| Using a single broad scope for all Slack test tokens | Zero seeder updates needed | Scope enforcement tests cannot verify that methods correctly reject tokens with insufficient scope | Never: undermines the scope enforcement requirement |
| Reusing Admin schema for Storefront via URL proxy | No schema work | Admin-only mutations are accessible via the Storefront endpoint, creating a security fidelity gap | Only during initial development; must be fixed in v1.2 |
| Hardcoding `2024-01` in all REST route registrations | Simple code | New SDK versions that use newer API versions fail to reach REST endpoints | Never: must be addressed in v1.2 |

---

## Integration Gotchas

Common mistakes when connecting fixes to existing infrastructure.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OAuth fix + test seeders | Adding the authorize route without updating `seedShopifyAccessToken()` | Add `POST /admin/tokens` to Shopify admin plugin first; update seeder; then add authorize route |
| Scope enforcement + token seeder | Leaving `scope: 'chat:write'` as the default for all SDK tests | Update `seedSlackBotToken()` default scope to a comprehensive set before adding enforcement |
| Stateful Slack operations + reset | Adding tables to `init()` without updating `reset()` | Define `SLACK_TABLES` constant; verify reset returns all tables to empty state |
| Schema split + Yoga endpoint | Creating a new Storefront schema but forgetting to update the Yoga endpoint mount | Check `shopify-api-storefront-client.test.ts` to determine exact endpoint URL expected |
| Billing state + existing tests | Adding state machine without updating billing test setup | Review all `shopify-api-billing.test.ts` tests; add state setup steps before adding state enforcement |
| better-sqlite3 + Docker | Using different Node versions in local and CI environments | Pin Node version in Docker to match project's `.nvmrc`; add `pnpm rebuild` step |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Route duplication instead of version wildcard | 3x route count for 3 API versions; startup time grows | Use version-normalizing preHandler hook | When 2+ API versions must coexist |
| Individual `LIVE_SYMBOLS` entries per SDK test | Manifest updates require editing a 300+ line dictionary | Derive coverage from test execution metadata | When new tests are added faster than the dictionary can be maintained |
| `singleFork: true` with long test suite | Full 177-test SDK suite must run in a single worker | Consider file-level forks for independent test groups | When total suite time exceeds 5 minutes in CI |
| Per-method scope checks with individual queries | N+1 scope lookups on each API call | Cache token scopes at token creation time in SlackStateManager | At 80+ Slack methods all enforcing scope per request |

---

## Security Mistakes

Domain-specific security issues relevant to digital twin behavioral fidelity.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Twin's `/admin/*` endpoints accessible from outside localhost | Test control endpoints exposed in non-development deployment | Add host validation to admin endpoints; document as dev-only infrastructure |
| Signing secret hardcoded as `'dev-signing-secret'` in production configs | HMAC signatures are predictable and forgeable | Confirm `SLACK_SIGNING_SECRET` env var is overridden in CI and all non-local configs |
| OAuth authorize endpoint that accepts any redirect_uri | Mimic the real Shopify behavior of validating redirect URIs | Validate `redirect_uri` against app's registered callback URL in twin auth flow |
| Scope enforcement that only checks token existence | Methods appear to succeed with any token regardless of declared scopes | Scope enforcement must check `token.scopes.includes(requiredScope)` per method |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **OAuth fix:** `/admin/oauth/authorize` route exists — verify `seedShopifyAccessToken()` still returns a working token and all 24 Shopify SDK test files pass
- [ ] **Version routing:** Multiple versions route correctly — verify `shopify-api-graphql-client.test.ts` passes with the new API version (GraphQL endpoint reachable, not just REST)
- [ ] **REST persistence:** IDs are numeric in REST responses — verify GraphQL resolvers that use GIDs still work after the format change (round-trip ID test)
- [ ] **Storefront schema:** Separate SDL created — verify `makeExecutableSchema()` does not throw schema validation errors and `shopify-api-storefront-client.test.ts` passes
- [ ] **Billing state machine:** `appSubscriptionCreate` mutates state — verify `billing.check()` returns the correct status after a subscription is created AND that tests reset properly between runs
- [ ] **126 Slack methods:** All routes registered — verify no `FST_ERR_DUP_ROUTE` errors in startup log and all new routes return `{ ok: true }` for a valid token
- [ ] **Stateful Slack:** New tables in `SlackStateManager` — verify `POST /admin/reset` empties all new tables and tests are independent
- [ ] **Scope enforcement:** `missing_scope` returned for wrong scope — verify `seedSlackBotToken()` scope covers all methods tested in the SDK suite
- [ ] **Chat scoping:** `cant_update_message` returned for wrong author — verify all chat tests use the same token to post and update messages
- [ ] **Event signing:** Inbound verification added — verify Bolt receiver tests use the same `signingSecret` as the twin
- [ ] **Coverage transition:** `LIVE_SYMBOLS` replaced by execution evidence — verify `pnpm drift:check` passes with 202+ live symbols after the transition

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| OAuth tightening breaks seeders (Pitfall 1) | MEDIUM | Add `POST /admin/tokens` to Shopify admin plugin; update `seedShopifyAccessToken()` to use it; verify all tests pass |
| API version routing breaks GraphQL (Pitfall 2) | MEDIUM | Add version-normalizing preHandler; verify GraphQL Yoga endpoint is reachable at all version paths; run full SDK suite |
| REST ID format breaks resolvers (Pitfall 3) | MEDIUM | Audit all fixtures for ID format assumptions; update integration tests; add round-trip ID test |
| Conformance false failures (Pitfall 4) | LOW | Restore asymmetric comparison semantics; add `stripFields` normalizer for timestamps/IDs; re-run conformance |
| LIVE_SYMBOLS transition drops coverage (Pitfall 5) | MEDIUM | Revert coverage generation change; add execution-evidence mechanism alongside LIVE_SYMBOLS first; then migrate incrementally |
| Scope enforcement breaks tests (Pitfall 6) | LOW | Update `seedSlackBotToken()` default scope to comprehensive set; re-run all Slack SDK tests |
| Duplicate route crash (Pitfall 7) | LOW | Grep all plugin files for duplicate route patterns; remove duplicate from `stubs.ts`; restart twin |
| Reset doesn't clear new tables (Pitfall 8) | LOW | Add `SLACK_TABLES` constant; update `reset()` to include all tables; add reset-coverage test |
| Billing state breaks billing tests (Pitfall 9) | LOW | Update billing tests to create subscription state before calling `billing.check()` |
| Signing secret mismatch breaks Bolt (Pitfall 10) | LOW | Align `signingSecret` in Bolt test app config with twin's `SLACK_SIGNING_SECRET` env var |
| Schema split breaks type references (Pitfall 11) | MEDIUM | Build Storefront schema from standalone SDL file; run `assertValidSchema()`; test against Storefront SDK test |
| Author scoping breaks chat tests (Pitfall 12) | LOW | Update chat tests to use consistent token for post + update; audit conformance fixtures |
| better-sqlite3 ABI mismatch (Pitfall 13) | LOW | Add `pnpm rebuild better-sqlite3` to Dockerfile; pin Node version in Docker to match project |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| OAuth tightening breaks seeders (1) | Shopify OAuth fix | `seedShopifyAccessToken()` returns working token; all Shopify SDK tests pass |
| Version routing breaks GraphQL (2) | API version routing fix | GraphQL requests at `/admin/api/2025-01/graphql.json` return valid responses |
| REST IDs break GraphQL resolvers (3) | REST persistence fix | Integration test: create via GraphQL, fetch via REST, verify `admin_graphql_api_id` round-trip |
| Conformance false failures (4) | Conformance harness fix | Zero false failures for known-good endpoints; timestamps/IDs stripped before comparison |
| Coverage tracking drops (5) | Coverage infrastructure | `pnpm drift:check` passes with 202+ live symbols throughout transition |
| Scope enforcement breaks tests (6) | Slack scope enforcement | All SDK tests pass with broad-scope token; scope rejection tests use narrow-scope tokens explicitly |
| Duplicate route crash (7) | Slack method expansion | Fastify starts without `FST_ERR_DUP_ROUTE`; route audit passes |
| Reset incompleteness (8) | Slack stateful operations | Reset test: after `POST /admin/reset`, all Slack tables are empty |
| Billing state breaks tests (9) | Shopify billing fix | All `shopify-api-billing.test.ts` tests pass with state machine enabled |
| Signing secret mismatch (10) | Event signing fix | Bolt receiver tests pass with verified signature validation active |
| Schema split breaks types (11) | Storefront schema fix | `assertValidSchema()` passes on new Storefront SDL; `shopify-api-storefront-client.test.ts` passes |
| Author scoping breaks chat (12) | Chat scoping fix | All `slack-chat.test.ts` tests pass; `cant_update_message` test explicitly verifies rejection |
| ABI mismatch in Docker (13) | CI/infra phase (first) | `pnpm test:sdk` passes in CI Docker container without ABI errors in logs |
| Sequencing: infrastructure before twins (S1) | Roadmap design | Conformance harness phase is last; twin fix phases are ordered before it |
| Sequencing: parallel changes (S2) | Roadmap design | Each phase has a go/no-go gate: `pnpm test:sdk` must pass before next phase begins |

---

## Sources

- Direct codebase inspection: `twins/shopify/src/plugins/oauth.ts`, `twins/slack/src/plugins/web-api/stubs.ts`, `twins/slack/src/plugins/web-api/chat.ts`, `twins/shopify/src/plugins/rest.ts`, `twins/shopify/src/plugins/graphql.ts`, `packages/conformance/src/comparator.ts`, `packages/state/src/state-manager.ts`, `tests/sdk-verification/setup/seeders.ts`, `tests/sdk-verification/setup/global-setup.ts`, `tests/sdk-verification/coverage/generate-report.ts` — all read directly (HIGH confidence)
- [better-sqlite3 Node 24 incompatibility issue #1376](https://github.com/WiseLibs/better-sqlite3/issues/1376) — ABI mismatch on Node 24 confirmed (HIGH confidence)
- [better-sqlite3 Node module version mismatch issue #797](https://github.com/WiseLibs/better-sqlite3/issues/797) — Docker-specific ABI mismatch patterns (HIGH confidence)
- [Slack request verification — official docs](https://docs.slack.dev/authentication/verifying-requests-from-slack/) — `X-Slack-Signature` header format and HMAC-SHA256 computation (HIGH confidence)
- [Slack `missing_scope` error in node-slack-sdk issue #1124](https://github.com/slackapi/node-slack-sdk/issues/1124) — scope enforcement error patterns (HIGH confidence)
- [Fastify route registration behavior](https://fastify.dev/docs/latest/Reference/Routes/) — trie-based routing, `FST_ERR_DUP_ROUTE` behavior (HIGH confidence)
- [API drift patterns](https://www.wiz.io/academy/api-security/api-drift) — behavioral gap accumulation in mock/twin systems (MEDIUM confidence)
- [GraphQL schema merging risks](https://the-guild.dev/graphql/tools/docs/schema-merging) — type reference conflicts when splitting schemas (MEDIUM confidence)
- [Shopify API versioning documentation](https://shopify.dev/docs/api/usage/versioning) — version URL format and fallback behavior (HIGH confidence)
- [Shopify AppSubscription object](https://shopify.dev/docs/api/admin-graphql/latest/objects/appsubscription) — billing state transitions (HIGH confidence)
- `.planning/PROJECT.md`, `.planning/v1.1-MILESTONE-AUDIT.md`, `.planning/research/STACK.md` — project context (HIGH confidence)

---
*Pitfalls research for: adding behavioral fidelity fixes to an existing digital twin system with passing SDK verification tests*
*Researched: 2026-03-11*
