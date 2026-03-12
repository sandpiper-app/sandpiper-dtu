# Feature Research: v1.2 Behavioral Fidelity Fixes

**Domain:** Digital twin behavioral fidelity — Shopify Admin API and Slack Web API
**Researched:** 2026-03-11
**Confidence:** HIGH (Shopify OAuth, REST, versioning, billing verified against official docs; Slack signing, chat mutations, scope enforcement, views/pins/reactions verified against official method docs; coverage and conformance patterns verified against existing codebase)

---

## Context

This milestone fixes 13 behavioral fidelity gaps identified by external adversarial review of the existing Shopify and Slack digital twins. These are not new features — they are corrections to wrong behavior, missing behavior, and infrastructure weaknesses in the existing twins. The findings are categorized below as Table Stakes (correct behavior required for the twins to be credible), Differentiators (behaviors that distinguish a high-fidelity twin from a basic stub), and Anti-Features (scope creep to avoid).

---

## Feature Landscape

### Table Stakes (Users Expect These)

The following behaviors are required for the digital twins to be considered "correct." Missing or wrong implementations mean integration tests written against the twins will silently accept bugs that would fail against real services.

#### Finding 1 (Critical): Conformance Comparison — Twin-vs-Live Structural Check

**What correct behavior looks like:**

Real conformance comparison must compare the actual twin response against an actual live API response — not twin-against-itself. The current `compareResponsesStructurally` function in `packages/conformance/src/comparator.ts` has the right logic but the runner must be exercised against a real Shopify or Slack live call, not a replayed fixture from a previous twin run.

The structural comparison must check:
1. HTTP status codes match exactly.
2. Every JSON key present in the twin body must also exist in the live body (twin must not add extra keys that live does not have).
3. Type mismatches fail: if live returns `number` and twin returns `string`, that is a failure.
4. Array elements: compare the first element's structure only (array length is allowed to differ between twin and live since state differs). The current code does this correctly.
5. Headers: only semantically meaningful headers should be compared. `content-type` is compared. `x-request-id`, `date`, `x-shopify-request-id` are ephemeral and must be stripped. The current normalizer strips these but the runner must pass a normalizer that includes them.
6. The comparison does NOT need to compare actual values (different IDs, timestamps, etc.) — structural shape is sufficient for live mode.

**What must change in the twin:**
The conformance runner (`packages/conformance/src/runner.ts`) must be verified to actually call `compareResponsesStructurally` (not `compareResponses`) in live mode, and the conformance suites must assert that the runner is indeed calling live APIs for its baseline, not cached fixtures from a previous twin run.

**Complexity:** MEDIUM. The comparator code is correct. The gap is in the runner's mode selection and test suite verification.

**Depends on:** Existing `@dtu/conformance` package.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| Runner uses `compareResponsesStructurally` in live mode | Structural comparison is the only valid approach for twin-vs-live | LOW | Code exists; verify it's selected correctly |
| Live mode baseline comes from real API call, not fixture | Otherwise comparison is twin-vs-twin | MEDIUM | Runner must not cache or replay live responses |
| Headers normalized before comparison | `x-request-id`, `date`, `cf-ray` differ legitimately | LOW | Normalizer already strips most; verify completeness |
| All array elements checked when array is expected type | First-element structural check is correct; verify it happens | LOW | Already in comparator; needs test coverage |

---

#### Finding 2 (Critical): Coverage Status Derived from Execution Evidence

**What correct behavior looks like:**

The current `coverage-report.json` in `tests/sdk-verification/coverage/` is hand-authored metadata — a developer manually writes `"tier": "live"` or `"tier": "deferred"` for each symbol. This does not prove the symbol was actually exercised. Correct behavior is:

1. When an SDK verification test calls a method (e.g., `client.chat.postMessage()`), the twin records that the method endpoint was hit.
2. After the test suite runs, a coverage report is generated from those execution logs.
3. Symbols that appear in the manifest but were never called get status `untested`.
4. Symbols that were called and received a successful response get status `covered`.
5. Symbols that received an error response get status `covered-with-error`.

The standard approach: the twin exposes a `GET /admin/coverage` endpoint that returns a list of all method routes that were hit since the last reset. After each test run, the coverage report generator reads this endpoint and computes the coverage percentage.

**What must change:**
- Each twin adds a request counter map (in-memory) that increments when any `/api/{method}` route is called.
- `GET /admin/coverage` returns `{ hits: { "chat.postMessage": 14, "chat.update": 3, ... } }`.
- A coverage report generator script reads this after `pnpm test:sdk` completes and writes `coverage-report.json` from execution evidence.
- The hand-authored `tier` field in `coverage-report.json` is replaced with `status: "covered" | "untested"` derived from the hits map.

**Complexity:** MEDIUM. The in-memory counter is trivial. The generator script replaces the hand-authored JSON.

**Depends on:** Existing admin plugin pattern in both twins.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| Twin records per-endpoint hit counts | Evidence that a method was actually called | LOW | Simple Map in each twin's admin handler |
| `GET /admin/coverage` returns hit counts | Test runner can read coverage after test suite | LOW | Admin route, same pattern as `/admin/state` |
| Coverage report generated from hit map, not hand-authored | Derived evidence is proof; annotation is not | MEDIUM | Script to run post-test; replaces JSON update workflow |
| `untested` status for never-hit symbols | Visibility into gaps | LOW | Any symbol in manifest but not in hits map |

---

#### Finding 3 (High): Shopify OAuth — Real Authorize Route and Callback Flow

**What correct behavior looks like:**

Real Shopify OAuth Authorization Code Grant (source: [Shopify OAuth docs](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)):

**Step 1 — GET /admin/oauth/authorize**
Query parameters: `client_id`, `scope`, `redirect_uri`, `state`, `grant_options[]`
Response: HTTP 302 redirect to `{redirect_uri}?code={authorization_code}&hmac={hmac}&host={base64_hostname}&shop={shop}&state={state}&timestamp={timestamp}`

The `hmac` is HMAC-SHA256 of the query string (excluding `hmac` itself), sorted alphabetically, using the app's client_secret as the key.

**Step 2 — POST /admin/oauth/access_token**
Request body (form or JSON): `client_id`, `client_secret`, `code`
Response (offline token):
```json
{
  "access_token": "shpat_xxx",
  "scope": "read_orders,write_orders,read_products,write_products,read_customers,write_customers"
}
```
Response (online token adds): `"expires_in": 86399`, `"associated_user_scope"`, `"associated_user": { "id": 902541635, "email": "...", "email_verified": true }`

**What must change in the Shopify twin:**
- Add `GET /admin/oauth/authorize` route that validates `client_id` and `scope`, stores the pending authorization, and redirects to `redirect_uri` with `code` + `hmac` + `shop` + `state` + `timestamp`.
- The HMAC must be computed using the client_secret — `@shopify/shopify-api`'s `auth.callback()` validates this HMAC before calling `auth.access_token`.
- The existing `POST /admin/oauth/access_token` must be updated to validate `client_id`, `client_secret`, and `code` (not just accept any code).
- State nonce must be round-tripped from authorize to callback so `shopify.auth.callback()` can validate the `state` parameter.

**Current twin behavior:** Accepts any `code`, issues token, no authorize route, no HMAC on callback redirect, no `client_id`/`client_secret` validation.

**Complexity:** HIGH. HMAC computation on redirect, state nonce tracking, client credential validation.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `GET /admin/oauth/authorize` redirects with HMAC | `@shopify/shopify-api` `auth.begin()` redirects here | HIGH | Must compute HMAC-SHA256 of sorted params |
| Callback includes `code`, `hmac`, `shop`, `state`, `timestamp` | `auth.callback()` validates all of these | HIGH | `hmac` uses client_secret as key |
| `POST /admin/oauth/access_token` validates `client_id`, `client_secret`, `code` | Real Shopify rejects invalid credentials | MEDIUM | Current twin accepts any code |
| State nonce round-trip (authorize → callback) | CSRF protection validation in `auth.callback()` | MEDIUM | Store nonce between requests |

---

#### Finding 4 (High): Shopify Storefront API — Separate Schema and Correct Auth

**What correct behavior looks like:**

The Storefront API (source: [Shopify Storefront API docs](https://shopify.dev/docs/api/storefront)):
- Endpoint: `POST /api/{version}/graphql.json` (note: `/api/`, not `/admin/api/`)
- Auth header: `X-Shopify-Storefront-Access-Token: {token}` (not `X-Shopify-Access-Token`)
- Schema: customer-facing only — products, collections, cart, checkout. Does NOT expose admin mutations (orderCreate, productCreate, customerCreate, etc.)
- The Storefront API is GraphQL-only (no REST equivalent)

**Current twin behavior:** The twin routes `/api/2024-01/graphql.json` to the same Admin GraphQL schema using `Shopify-Storefront-Private-Token` header. This exposes admin mutations on the Storefront endpoint and uses the wrong auth header name. A real Storefront client sending `X-Shopify-Storefront-Access-Token` will get 401 from the current twin.

**What must change:**
- Register `POST /api/{version}/graphql.json` (accepting any version, not just `2024-01`)
- Accept `X-Shopify-Storefront-Access-Token` header (not `Shopify-Storefront-Private-Token`)
- Serve a minimal Storefront schema: `Query { products, product, shop }` only — no admin mutations
- OR serve the same schema but omit admin-only types from the Storefront endpoint (acceptable for twin purposes since tests only query, not mutate)

**Complexity:** HIGH. Requires a separate minimal GraphQL schema or schema filtering, plus correct header name.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `/api/{version}/graphql.json` accepts `X-Shopify-Storefront-Access-Token` | `@shopify/storefront-api-client` sends this header | MEDIUM | Wrong header currently accepted |
| Storefront schema excludes admin mutations | Real Storefront API has no `orderCreate`, `productCreate` | HIGH | Separate schema or field-level filtering |
| Storefront endpoint separate from Admin endpoint | Different base paths, different auth | LOW | Path already differs; header fix is the main work |

---

#### Finding 5 (High): Shopify API Versioning — Multiple Versions in URL Path

**What correct behavior looks like:**

Shopify serves at least 9 active API versions simultaneously (source: [Shopify versioning docs](https://shopify.dev/docs/api/usage/versioning)). Versions are quarterly date-based: `2024-01`, `2024-04`, `2024-07`, `2024-10`, `2025-01`, etc.

- URL pattern: `/admin/api/{version}/graphql.json`
- If the version is outdated but not yet dropped: Shopify processes the request and responds with an `X-Shopify-API-Version` header showing the actual version used (may differ from requested if it fell back to oldest supported).
- If the version is completely unsupported: Shopify falls forward to the oldest supported stable version and sets `X-Shopify-API-Version` accordingly (it does NOT return a 404 or explicit error).
- The `X-Shopify-API-Version` response header is always present on GraphQL responses.

**Current twin behavior:** Only registers `/admin/api/2024-01/graphql.json` as a hardcoded route. Any other version (e.g., `2025-01`) returns 404. The `@shopify/shopify-api` library constructs URL with the version the app is configured for, so a test using `apiVersion: '2025-01'` fails with 404.

**What must change:**
- Register `/admin/api/:version/graphql.json` as a parameterized route (or a wildcard `*/graphql.json` for the admin path).
- Accept any version string in the path.
- Add `X-Shopify-API-Version: {version}` to all GraphQL responses (the twin can echo back the requested version).
- Same fix for REST routes: `/admin/api/:version/products.json` etc.

**Complexity:** HIGH. Requires refactoring all hardcoded version routes to parameterized patterns.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `/admin/api/:version/graphql.json` accepts any version | SDK uses configured version in URL | HIGH | Refactor route registration |
| `/admin/api/:version/*.json` accepts any version for REST | Same issue for REST client | HIGH | Parameterize all REST routes |
| `X-Shopify-API-Version` header in responses | SDK reads this to detect version fallback | LOW | Echo requested version |
| No 404 for valid but old versions | Real Shopify falls forward, not 404 | LOW | Any registered version pattern handles this |

---

#### Finding 6 (High): Shopify REST Responses — Correct Shapes with Numeric IDs

**What correct behavior looks like:**

Real Shopify REST responses (source: [Shopify REST Product docs](https://shopify.dev/docs/api/admin-rest/2024-01/resources/product)):

1. **Numeric IDs:** REST IDs are 64-bit unsigned integers (e.g., `id: 632910392`), not GID strings. The `@shopify/shopify-api` REST client maps these to numeric types.
2. **`admin_graphql_api_id` field:** Every REST resource includes this field: `"admin_graphql_api_id": "gid://shopify/Product/632910392"`. This is how REST and GraphQL are bridged.
3. **List response pagination:** Uses `Link` header with cursor-based pagination. Format:
   ```
   Link: <https://{shop}/admin/api/{version}/products.json?page_info={cursor}&limit=50>; rel="next"
   ```
   The `page_info` cursor is opaque (base64 encoded position marker). Only `page_info` and `limit` can appear in paginated request URLs.
4. **Resource-level responses:** `GET /products.json` returns `{ products: [...] }`. `GET /products/123.json` returns `{ product: {...} }`. `POST /products.json` with body `{ product: {...} }` returns `{ product: {...} }` with 201.
5. **Persistent CRUD:** `POST /products.json` must create a record visible in subsequent `GET /products.json`. `DELETE /products/123.json` must remove it.

**Current twin behavior:** REST routes are largely stateless stubs. `POST /products.json` returns a hardcoded GID `id: 'gid://shopify/Product/1'` (wrong — should be numeric). No `admin_graphql_api_id`. Many routes return hardcoded empty arrays. `DELETE` is a no-op with no state mutation. No persistent CRUD for products in REST.

**What must change:**
- REST responses must use numeric IDs (integer or numeric string, not GIDs).
- All REST resource responses must include `admin_graphql_api_id: "gid://shopify/{Type}/{numericId}"`.
- List responses must include proper `Link` header when more results exist.
- State must persist across REST CRUD calls (create → read → update → delete cycle works).
- Products, orders, customers must be backed by StateManager state in REST layer.

**Complexity:** HIGH. Requires StateManager to assign and store numeric IDs alongside GIDs, and REST handlers to do full CRUD against state.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| Numeric IDs in REST responses | `@shopify/shopify-api` REST resources parse numeric IDs | HIGH | StateManager must map GIDs to numerics |
| `admin_graphql_api_id` in every REST resource | Bridge between REST and GraphQL | MEDIUM | Derive from numeric ID |
| Persistent CRUD for core resources | REST client tests create, read, update, delete | HIGH | Connect REST handlers to StateManager |
| `Link` header with correct format for list endpoints | REST client pagination reads Link header | MEDIUM | Cursor-based `page_info` format |
| `{ product: {...} }` wrapper on single-resource responses | SDK parses response envelope | LOW | Most routes already have this; verify completeness |

---

#### Finding 7 (High): Shopify Billing — Real State Machine

**What correct behavior looks like:**

Shopify app billing state machine (source: [Shopify GraphQL AppSubscriptionStatus](https://shopify.dev/docs/api/admin-graphql/latest/objects/appsubscription)):

**States:** `PENDING` → (merchant approves) → `ACTIVE` → (app cancels or uninstalls) → `CANCELLED`
Also: `DECLINED`, `EXPIRED`, `FROZEN`

**Mutations:**
1. `appSubscriptionCreate(name, returnUrl, lineItems, test)` → returns `{ appSubscription: { id, status: PENDING, name, returnUrl, test }, confirmationUrl, userErrors }`. The `confirmationUrl` is what the merchant visits to approve.
2. After merchant approval (simulated in twin by a POST to a confirm endpoint), status transitions to `ACTIVE`.
3. `appSubscriptionCancel(id)` → transitions to `CANCELLED`. Must validate that the `id` belongs to the calling app's installation (ownership check).

**`currentAppInstallation` query:**
Returns `{ id, activeSubscriptions: [{ id, name, status, lineItems, currentPeriodEnd, test }] }`. This must return actual subscription data from state, not empty arrays.

**Rate limiting:**
Real Shopify GraphQL rate limiter uses:
- Bucket size: 1000 query cost points (correct)
- Restore rate: 50 points/second (correct)
- Actual query cost calculated from field depth and connection sizes
- `extensions.cost` in responses: `{ requestedQueryCost, actualQueryCost, throttleStatus: { maximumAvailable, currentlyAvailable, restoreRate } }`

**Current twin behavior:** Billing mutations are stubs returning minimal shapes. No state machine. `currentAppInstallation.activeSubscriptions` returns empty array. `appSubscriptionCancel` does not validate ownership.

**What must change:**
- Add `AppSubscription` table to StateManager with fields: `id`, `name`, `status`, `return_url`, `confirmation_url`, `test`, `created_at`.
- `appSubscriptionCreate` creates a PENDING record and returns a `confirmationUrl` pointing to a twin endpoint.
- Add `POST /admin/billing/confirm/:id` endpoint (or accept a GET/POST to `returnUrl`) to simulate merchant approval, transitioning status to ACTIVE.
- `appSubscriptionCancel` looks up the subscription, validates it exists, transitions to CANCELLED.
- `currentAppInstallation` resolves `activeSubscriptions` from state.

**Complexity:** HIGH. Requires new StateManager table, state machine logic, confirm endpoint, and resolver updates.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `appSubscriptionCreate` returns real `confirmationUrl` | `@shopify/shopify-api` billing tests follow this URL | HIGH | URL must point to twin confirm endpoint |
| PENDING → ACTIVE state transition via confirm | SDK billing tests verify post-approval state | HIGH | New admin endpoint to simulate merchant approval |
| `appSubscriptionCancel` transitions to CANCELLED | SDK billing tests cancel and verify | MEDIUM | Validate ownership, set status |
| `currentAppInstallation.activeSubscriptions` returns real data | SDK checks active subs from current install | MEDIUM | Query subscriptions table, filter by ACTIVE |
| Rate limiting `extensions.cost.throttleStatus` with correct fields | SDK reads throttleStatus from extensions | LOW | Already mostly correct; verify field names |

---

#### Finding 8 (High): Slack WebClient Method Families — Missing 126+ Methods

**What correct behavior looks like:**

The `@slack/web-api` WebClient has method namespace objects for every Slack API family. The current twin covers:
- `chat.*` (11 methods), `conversations.*` (28 methods), `users.*` (5 methods), `views.*` (4 methods), `reactions.*` (3 methods), `pins.*` (3 methods), `files.*` (14 methods), `search.*` (3 methods), `reminders.*` (7 methods), `bots.*` (1 method), `emoji.*` (1 method), `migration.*` (1 method), `tooling.*` (1 method), `dnd.*` (7 methods), `bookmarks.*` (5 methods), `usergroups.*` (9 methods), `calls.*` (7 methods), `team.*` (7 methods), `dialog.*` (1 method), `functions.*` (2 methods), `assistant.*` (3 methods), `auth.*` (3 methods), `apps.*` (1 method)

**Missing families** (from `@slack/web-api` source):
- `admin.*` — massive admin namespace: `admin.analytics.*`, `admin.apps.*`, `admin.auth.*`, `admin.barriers.*`, `admin.conversations.*`, `admin.emoji.*`, `admin.inviteRequests.*`, `admin.roles.*`, `admin.teams.*`, `admin.usergroups.*`, `admin.users.*`, `admin.workflows.*` — approximately 70+ methods
- `canvases.*` — `canvases.create`, `canvases.delete`, `canvases.edit`, `canvases.access.delete`, `canvases.access.set`, `canvases.sections.lookup`
- `workflows.*` — `workflows.triggers.create`, `workflows.triggers.delete`, `workflows.triggers.list`, `workflows.triggers.update`, plus `workflows.stepCompleted`, `workflows.stepFailed`, `workflows.updateStep`
- `openid.*` — `openid.connect.token`, `openid.connect.userInfo`
- `oauth.*` — `oauth.v2.exchange`
- `rtm.*` — `rtm.connect`, `rtm.start`
- `stars.*` — `stars.add`, `stars.list`, `stars.remove`
- `entity.*` — `entity.resolve`
- `lists.*` — `lists.getView`, `lists.loadView`, `lists.results.add`, `lists.results.delete`, `lists.results.getView`, `lists.results.list`, `lists.results.update`
- `apps.*` additional — `apps.datastore.bulkDelete`, `apps.datastore.bulkGet`, `apps.datastore.bulkPut`, `apps.datastore.count`, `apps.datastore.delete`, `apps.datastore.get`, `apps.datastore.put`, `apps.datastore.query`, `apps.datastore.update`, `apps.event.authorizations.list`, `apps.manifest.*`, `apps.permissions.*`, `apps.uninstall`

**Correct behavior for stubs:** Every method in the WebClient must return HTTP 200 with `{ ok: true }` (plus any required shape fields) rather than a 404. 404 causes the SDK to throw a transport error instead of an API error, breaking any caller that handles `ok: false` but not transport errors.

The twin does not need to implement full state for all missing methods. Authenticated stubs returning `{ ok: true }` are sufficient for coverage. Stubs already exist as a pattern in `stubs.ts`.

**Complexity:** HIGH (volume). ~70 admin method stubs plus ~30 other stubs. The pattern is established; it is high volume.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `admin.*` family stubs (~70 methods) | SDK binds these; 404 breaks callers | HIGH (volume) | Use `stub()` pattern; no state needed |
| `canvases.*` stubs | WebClient has these namespaces | LOW | 6 methods, use `stub()` |
| `workflows.*` stubs | WebClient has these namespaces | LOW | 7 methods, use `stub()` |
| `openid.*`, `oauth.*` additional stubs | WebClient has these | LOW | 3 methods |
| `stars.*`, `entity.*`, `lists.*` stubs | WebClient has these | LOW | ~15 methods |
| `apps.datastore.*`, `apps.manifest.*` stubs | WebClient has these | LOW | ~15 methods |
| `rtm.*` stubs | WebClient has these | LOW | 2 methods |

---

#### Finding 9 (High): Slack chat.update and chat.delete — Author and Channel Scoping

**What correct behavior looks like:**

**chat.update rules** (source: [Slack chat.update docs](https://docs.slack.dev/reference/methods/chat.update/)):
- Required params: `channel`, `ts` (message timestamp), at least one of `text` or `blocks`.
- Authorization: "Only messages posted by the authenticated user are able to be updated." Bot tokens can only update messages posted by that bot. Error when violated: `cant_update_message`.
- The `channel` param must match the channel the message was actually posted in. Error for mismatch: `channel_not_found` (if channel doesn't exist) or `cant_update_message` (if message is in a different channel).
- Error codes: `cant_update_message`, `message_not_found`, `channel_not_found`, `edit_window_closed`, `missing_scope`, `msg_too_long`.

**chat.delete rules** (source: [Slack chat.delete docs](https://docs.slack.dev/reference/methods/chat.delete/)):
- Required params: `channel`, `ts`.
- Authorization: "This method may delete only messages posted by that bot" (for bot tokens). "This method may only delete messages that user themselves can delete" (for user tokens).
- Error when a bot tries to delete a message it didn't post: `cant_delete_message`.
- Error codes: `cant_delete_message`, `message_not_found`, `channel_not_found`, `access_denied`.

**Current twin behavior:** `chat.update` does not check message author — any token can update any message. `chat.delete` does a "lenient delete" that removes any message regardless of ownership. Neither checks that `channel` matches the message's actual channel.

**What must change:**
- `chat.update`: Look up the message by `ts`. Check that `message.user_id === tokenRecord.user_id` (or bot_id). If not, return `{ ok: false, error: 'cant_update_message' }`. Also check that `message.channel_id === channel` param; if not, return `{ ok: false, error: 'message_not_found' }` or `cant_update_message`.
- `chat.delete`: Look up the message by `ts`. Check ownership same as above. If not owner, return `{ ok: false, error: 'cant_delete_message' }`. Channel param must match.

**Complexity:** MEDIUM. The message lookup exists; add author check and channel check.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `chat.update` enforces `cant_update_message` for non-author | Real Slack does this; conformance tests verify | MEDIUM | Add `user_id` ownership check to existing handler |
| `chat.delete` enforces `cant_delete_message` for non-author | Real Slack does this | MEDIUM | Add ownership check to existing handler |
| `channel` param validated against message's stored channel | Message in wrong channel returns correct error | LOW | Channel field is stored on message; compare it |
| `message_not_found` when `ts` doesn't exist | Already implemented; verify it works | LOW | Already correct |

---

#### Finding 10 (High): Slack Event Delivery — Signing Headers, Separate Interactivity URL, Absolute response_url

**What correct behavior looks like:**

**Signing-secret HMAC** (source: [Slack signing docs](https://docs.slack.dev/authentication/verifying-requests-from-slack)):
Every event delivery from the Slack twin to the app's callback URL must include:
- `X-Slack-Signature: v0={hmac_sha256_hex}` — computed as HMAC-SHA256 of `"v0:{timestamp}:{raw_body}"` using the signing secret as key, prefixed with `v0=`
- `X-Slack-Request-Timestamp: {unix_timestamp}` — Unix timestamp of delivery

`@slack/bolt`'s `HTTPReceiver` validates these on every inbound event. Without them, Bolt rejects all events with a signature verification failure.

**Separate interactivity URL:**
In a real Slack app configuration, the Events API Request URL and the Interactivity Request URL are two separate configuration fields. Bolt's `HTTPReceiver` handles both at the same HTTP server but expects interactions (`block_actions`, `shortcut`, `view_submission`) to arrive at the interactivity path (typically `/slack/events` or a custom path), and Slack sends them to the configured interactivity URL, not the events URL.

The current twin delivers all interaction payloads to `sub.request_url` from `listEventSubscriptions()`. Real Slack sends interactions to the Interactivity Request URL (may be same or different from event URL). The twin should store both URLs and deliver interactions to the interactivity URL when configured.

**Absolute response_url:**
The `response_url` in interaction payloads must be a full absolute URL (e.g., `https://twin.host/response-url/abc123`), not a relative path. The current twin returns `{ ok: true, response_url: responseUrl }` where `responseUrl` is generated by `interactionHandler.generateInteractionPayload()`. This must be an absolute URL that Bolt can call with a standard HTTP client.

**What must change:**
- When the twin delivers events to a subscriber URL, it must compute and include `X-Slack-Signature` and `X-Slack-Request-Timestamp` headers using a configurable signing secret.
- The signing secret must be configurable via environment variable or admin seeding (e.g., `POST /admin/signing-secret` or env var `SLACK_SIGNING_SECRET`).
- Store separate `event_request_url` and `interactivity_request_url` per subscriber. Deliver events to the former, interactions to the latter.
- `response_url` in interaction payloads must be `http://{host}:{port}/response-url/{id}` (absolute URL using the twin's own base URL).

**Complexity:** HIGH. HMAC computation on outbound delivery, URL configuration split, absolute URL generation.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `X-Slack-Signature` on event delivery | Bolt `HTTPReceiver` verifies this; rejects without it | HIGH | HMAC-SHA256 of `"v0:{ts}:{body}"` using signing secret |
| `X-Slack-Request-Timestamp` on event delivery | Bolt checks timestamp for replay prevention | MEDIUM | Unix timestamp of delivery |
| Configurable signing secret | Tests need to know the secret to verify | LOW | Env var `SLACK_SIGNING_SECRET`, default `dev-signing-secret` |
| Separate interactivity URL stored per subscriber | Real Slack delivers interactions to different URL | MEDIUM | Schema change to event subscription table |
| Absolute `response_url` in interaction payloads | Bolt's response_url handling needs full URL | MEDIUM | Use twin's baseUrl prefix |

---

#### Finding 11 (Medium-High): Slack Stateful Conversations, Views, Pins, Reactions

**What correct behavior looks like:**

**Conversations (invite/kick/members):**
- `conversations.invite(channel, users)`: Must add the listed users to the channel's member list. Returns `already_in_channel` if a user is already a member. Requires channels:manage scope.
- `conversations.kick(channel, user)`: Must remove the user from the channel's member list. Returns `not_in_channel` if user is not a member.
- `conversations.members(channel)`: Must return the actual list of user IDs who are members of the channel, not a hardcoded `['U_BOT_TWIN']`.

**Views (open/update/push with lifecycle):**
- `views.open(trigger_id, view)`: Must store the view in state, return `{ ok: true, view: { id, type, ... } }`. The `view.id` is the view_id used for updates.
- `views.update(view_id, view)`: Must update the stored view. Returns `not_found` if `view_id` doesn't exist. Returns `{ ok: true, view: {...} }`.
- `views.push(trigger_id, view)`: Pushes onto the stack. Must store and return a new view_id.
- Error codes: `invalid_trigger_id` (trigger_id doesn't match a known interaction), `expired_trigger_id`, `exchanged_trigger_id`.

**Pins (stateful add/remove/list):**
- `pins.add(channel, timestamp)`: Must store the pin in state. Returns `already_pinned` if the item is already pinned.
- `pins.remove(channel, timestamp)`: Must remove the pin. Returns `no_pin` if not pinned.
- `pins.list(channel)`: Must return the list of pinned items (messages) in the channel. Current twin returns empty list always.

**Reactions (stateful add/remove/list/get):**
- `reactions.add(channel, name, timestamp)`: Must store the reaction. Returns `already_reacted` if the same user has already added this reaction.
- `reactions.remove(channel, name, timestamp)`: Must remove the reaction. Returns `no_reaction` if it doesn't exist.
- `reactions.list()`: Must return the list of reactions made by the calling user.
- `reactions.get(channel, timestamp)`: Must return the reactions on a specific message.

**Current twin behavior:** Conversations invite/kick are no-ops (don't update membership). Members always returns `['U_BOT_TWIN']`. Views are stateless (no persistence). Pins are stateless (no error for double-pin, always returns empty list). Reactions.add is in admin interactions only (no Web API `reactions.add` endpoint with correct scope check).

**Complexity:** HIGH (views, membership tracking). MEDIUM (pins, reactions).

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `conversations.invite` updates member table | Membership tests verify invite worked | HIGH | Need channel_members table in StateManager |
| `conversations.kick` updates member table | Membership tests verify kick worked | MEDIUM | Remove from channel_members |
| `conversations.members` returns real member list | Members query must reflect actual membership | LOW | Query channel_members table |
| `already_in_channel` from `conversations.invite` | Real error for duplicate invite | LOW | Check before insert |
| Views stored and retrievable by view_id | `views.update` needs to find the view | HIGH | Add views table to SlackStateManager |
| `views.update` validates view_id exists | Returns `not_found` for unknown view_id | MEDIUM | Query views table |
| `pins.add` stores pin, returns `already_pinned` for duplicates | Real Slack is stateful | MEDIUM | Pins table with unique constraint |
| `pins.remove` returns `no_pin` if not pinned | Real Slack error | LOW | Check before delete |
| `pins.list` returns actual pinned items | Always empty currently | MEDIUM | Query pins table, join with messages |
| `reactions.add` via Web API (not just admin) | WebClient has `reactions.add` method | MEDIUM | Add `/api/reactions.add` POST route |
| `reactions.add` returns `already_reacted` for duplicates | Real Slack error | LOW | Unique constraint on reactions table |
| `reactions.remove` returns `no_reaction` if missing | Real Slack error | LOW | Check before delete |
| `reactions.list` returns user's reactions | Real Slack returns paginated list | MEDIUM | Query reactions by user_id |
| `reactions.get` returns message's reactions | Real Slack returns reactions on a specific message | MEDIUM | Query reactions by message_ts |

---

#### Finding 12 (Medium): Slack OAuth Scope Enforcement

**What correct behavior looks like:**

Real Slack returns `{ ok: false, error: 'missing_scope', needed: 'chat:write', provided: 'channels:read' }` when a method is called with a token that lacks the required scope. The response includes `needed` (the required scope) and `provided` (comma-separated list of scopes the token has).

**Key scopes per method family:**
- `chat.postMessage`, `chat.update`, `chat.delete`: requires `chat:write`
- `conversations.history`, `conversations.list`, `conversations.info`: requires `channels:read` or `channels:history`
- `conversations.invite`: requires `channels:manage` or `channels:write.invites`
- `conversations.kick`: requires `channels:manage`
- `users.info`, `users.list`: requires `users:read`
- `reactions.add`, `reactions.remove`: requires `reactions:write`
- `reactions.list`, `reactions.get`: requires `reactions:read`
- `pins.add`, `pins.remove`: requires `pins:write`
- `pins.list`: requires `pins:read`
- `views.open`, `views.update`, `views.push`, `views.publish`: no specific scope; requires valid token

**Current twin behavior:** Token validation checks only that the token exists — no scope check. Any valid token can call any method regardless of the token's scope field.

**What must change:**
- Token records already store a `scopes` field. The auth middleware must check `tokenRecord.scopes.includes(requiredScope)` for each method.
- When scope is missing: return `{ ok: false, error: 'missing_scope', needed: '{scope}', provided: '{token.scopes}' }`.
- A per-method scope map is needed (e.g., `{ 'chat.postMessage': 'chat:write', 'reactions.add': 'reactions:write', ... }`).

**Complexity:** MEDIUM. Scope map is data; enforcement logic is straightforward.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| `missing_scope` error with `needed` and `provided` fields | Real Slack response format; SDK conformance tests check this | MEDIUM | Extend auth check in each handler |
| Per-method scope map | Defines what scope each method requires | LOW | Data structure, not complex logic |
| `needed` and `provided` fields in error body | Real Slack includes both | LOW | Add to error response shape |
| Scope check before method execution | Must happen after auth, before business logic | MEDIUM | Refactor shared auth preamble |

---

#### Finding 13 (Medium): `pnpm test:sdk` — Fix "No test files found" and ABI Mismatch

**What correct behavior looks like:**

Running `pnpm test:sdk` must discover and run the 20 test files in `tests/sdk-verification/sdk/` without errors.

**Current failure (observed):**
1. `No test files found` — vitest's `--project sdk-verification` finds the project config but the `include` pattern `**/*.{test,spec}.?(c|m)[jt]s?(x)` does not discover tests in `tests/sdk-verification/sdk/` because the test files are not in the project root's scan path. The vitest workspace config must list `tests/sdk-verification` as a project, and that project's `vitest.config.ts` must include a `testDir` pointing to the correct subdirectory.

2. `better-sqlite3 ABI mismatch` — The native `better_sqlite3.node` binary was compiled for Node.js `NODE_MODULE_VERSION 137` (Node 22.x) but the current Node.js version requires `NODE_MODULE_VERSION 141` (Node 24.x). This means the pnpm-installed prebuilt binaries are stale. Fix: run `pnpm rebuild better-sqlite3` to recompile the native addon for the current Node.js version. The root-level `vitest.config.ts` must reference the `sdk-verification` project correctly so vitest runs it as a workspace member.

**What must change:**
1. Ensure root `vitest.config.ts` includes `tests/sdk-verification` as a workspace project (it may already; verify the path).
2. Ensure `tests/sdk-verification/vitest.config.ts` sets `testDir: '.'` or includes the `sdk/` subdirectory explicitly.
3. Run `pnpm rebuild better-sqlite3` or add it to the postinstall script so the native bindings match the installed Node.js version.
4. Optionally: add `pnpm approve-builds` to CI workflow to handle pnpm 10.x native build permissions.

**Complexity:** LOW. Configuration fixes and a rebuild command.

| Feature | Why Expected | Complexity | Notes |
|---------|-------------|------------|-------|
| vitest discovers `tests/sdk-verification/sdk/*.test.ts` | Core function of `pnpm test:sdk` | LOW | Verify `testDir` or `include` in project config |
| `better-sqlite3` compiled for current Node.js ABI | Twin import fails otherwise | LOW | `pnpm rebuild better-sqlite3` |
| Test runner exits 0 when all tests pass | CI depends on exit code | LOW | Follows from above two fixes |

---

### Differentiators (Competitive Advantage)

These behaviors make the twins genuinely high-fidelity rather than "close enough." They go beyond what most API stubs implement.

| Feature | Value Proposition | Complexity | Notes |
|---------|-----------------|------------|-------|
| Shopify OAuth HMAC validation on callbacks | Proves the twin's OAuth flow is indistinguishable from real Shopify to `@shopify/shopify-api` | HIGH | Required by Finding 3 |
| Signing-secret HMAC on Slack event delivery | Bolt rejects all events without valid HMAC; this makes the twin work with real Bolt apps | HIGH | Required by Finding 10 |
| Shopify billing state machine (PENDING → ACTIVE → CANCELLED) | Billing tests that follow the full approval flow work correctly | HIGH | Required by Finding 7 |
| Slack reactions/pins with duplicate detection | `already_reacted`, `already_pinned` errors make integration tests more realistic | MEDIUM | Required by Finding 11 |
| Coverage derived from execution evidence | Provides honest coverage metrics; no inflation from hand-authoring | MEDIUM | Required by Finding 2 |
| Views stored and retrievable by view_id | Enables `views.update` tests that verify the update was applied | HIGH | Required by Finding 11 |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|-------------|-----------------|-------------|
| Full Storefront API schema with cart/checkout mutations | The real Storefront API has a complete cart/checkout schema | Implementing a full cart/checkout state machine is out of scope for v1.2 | Minimal schema with `products` query and correct auth; defer cart/checkout mutations |
| Strict edit window enforcement (`edit_window_closed` in chat.update) | Real Slack enforces a team-configured edit window | Requires time-based logic and per-team config; no test value unless testing edit window itself | Omit this check; focus on author ownership check |
| Multiple Shopify API versions with different schemas | Real Shopify returns deprecation warnings for old versions | Twin only needs to accept version-parameterized routes, not implement multiple schemas | Accept any version in URL path, serve same schema |
| Shopify admin REST endpoints beyond core 4 resources | Full Shopify REST has ~100+ endpoints | Most are irrelevant to Sandpiper's usage | Implement core 4 (products, orders, customers, inventory) with state; leave others as empty-list stubs |
| Slack admin.* methods with real behavior | Admin methods manage workspaces | Admin API is for Enterprise Grid; no twin state needed | Stub with `{ ok: true }` |
| Real Slack OAuth 2.0 token introspection | Token scopes in production have complex permissions | Scope enforcement from token record is sufficient | Check `tokenRecord.scopes` against per-method scope map |

---

## Feature Dependencies

```
Finding 13 (ABI fix)
    └──enables──> All other tests (test:sdk must work first)

Finding 2 (coverage from evidence)
    └──requires──> Finding 13 (tests must run to generate evidence)

Finding 3 (Shopify OAuth)
    └──enables──> shopify-api-auth.test.ts to pass

Finding 5 (API versioning)
    └──enables──> Finding 6 (REST shapes — same routes need parameterized versions)

Finding 6 (REST shapes)
    └──requires──> StateManager numeric ID support
    └──enables──> shopify-api-rest-client.test.ts

Finding 7 (billing state machine)
    └──requires──> Finding 3 (OAuth provides session needed to test billing)
    └──enables──> shopify-api-billing.test.ts

Finding 10 (signing headers)
    └──enables──> Bolt HTTPReceiver tests to work
    └──enables──> Finding 11 (interactions with verified payloads)

Finding 11 (stateful conversations/views/pins/reactions)
    └──requires──> Finding 12 (scope enforcement validates correct token types)
    └──enables──> slack-pins.test.ts, slack-reactions.test.ts, slack-conversations.test.ts

Finding 12 (scope enforcement)
    └──requires──> Finding 8 (stub methods must exist before testing scope on them)
```

### Dependency Notes

- **Finding 13 must be fixed first:** Without `pnpm test:sdk` working, no other findings can be verified against the test suite.
- **Finding 5 blocks Finding 6:** REST resources use the same version-parameterized URL pattern; fixing versioning first avoids double-work.
- **Finding 12 and Finding 11 are independent** but combined in one phase: scope enforcement is middleware that wraps the stateful operations in Finding 11.
- **Findings 1 and 2 are infrastructure fixes** — they can be done in parallel with any twin behavioral fix.

---

## MVP Definition

### Launch With (v1.2)

Minimum set to close all 13 adversarial review findings:

- [x] Fix `pnpm test:sdk` (Finding 13) — required for everything else
- [x] Conformance comparison uses live API calls in live mode (Finding 1)
- [x] Coverage derived from execution evidence (Finding 2)
- [x] Shopify OAuth authorize + callback + HMAC validation (Finding 3)
- [x] Storefront API correct auth header + minimal separate schema (Finding 4)
- [x] API versioning — parameterized routes accept any version (Finding 5)
- [x] REST responses with numeric IDs + admin_graphql_api_id + persistent CRUD (Finding 6)
- [x] Billing state machine PENDING → ACTIVE → CANCELLED (Finding 7)
- [x] Slack missing method stubs — admin.*, canvases.*, workflows.*, others (Finding 8)
- [x] chat.update/delete author + channel enforcement (Finding 9)
- [x] Signing-secret HMAC on event delivery, separate interactivity URL, absolute response_url (Finding 10)
- [x] Stateful conversations/views/pins/reactions (Finding 11)
- [x] Scope enforcement per method (Finding 12)

### Add After Validation (v1.x)

- Full Storefront cart/checkout mutations — only if Sandpiper integrates with Storefront checkout
- Shopify edit window enforcement — only if integration tests need to test time-based edit restrictions
- Shopify multi-version schema differences — only if testing version-specific field deprecations

### Future Consideration (v2+)

- Additional Slack admin.* methods with real behavior (Enterprise Grid simulation)
- Shopify Markets / multi-currency in Storefront API
- Slack canvas API with real document state

---

## Feature Prioritization Matrix

| Finding | User Value | Implementation Cost | Priority |
|---------|-----------|---------------------|----------|
| F13: pnpm test:sdk fix | HIGH (blocks all tests) | LOW | P1 |
| F1: Conformance comparison | HIGH (critical infrastructure) | LOW | P1 |
| F2: Coverage from evidence | HIGH (critical infrastructure) | MEDIUM | P1 |
| F3: Shopify OAuth full flow | HIGH (breaks auth tests) | HIGH | P1 |
| F9: chat.update/delete scoping | HIGH (behavioral correctness) | MEDIUM | P1 |
| F10: Slack signing + interactivity URL | HIGH (Bolt won't work without) | HIGH | P1 |
| F5: Shopify API versioning | HIGH (client config uses non-2024-01) | HIGH | P2 |
| F6: Shopify REST shapes | HIGH (REST client tests) | HIGH | P2 |
| F7: Shopify billing | HIGH (billing tests) | HIGH | P2 |
| F8: Slack missing methods | HIGH (SDK coverage gaps) | HIGH (volume) | P2 |
| F11: Stateful conversations/views/pins | MEDIUM (fidelity) | HIGH | P2 |
| F4: Storefront auth fix | MEDIUM (auth header wrong) | HIGH | P2 |
| F12: Scope enforcement | MEDIUM (correctness) | MEDIUM | P3 |

---

## Sources

- [Shopify OAuth Authorization Code Grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) — Step-by-step flow, HMAC construction, callback params, token response shapes
- [Shopify Storefront API](https://shopify.dev/docs/api/storefront) — Auth header (`X-Shopify-Storefront-Access-Token`), endpoint path (`/api/{version}/graphql.json`), GraphQL-only
- [Shopify API Versioning](https://shopify.dev/docs/api/usage/versioning) — 9 simultaneous versions, fall-forward behavior, `X-Shopify-API-Version` header
- [Shopify REST Product docs](https://shopify.dev/docs/api/admin-rest/2024-01/resources/product) — Numeric IDs, `admin_graphql_api_id`, resource response shapes
- [Shopify REST Pagination](https://shopify.dev/docs/api/admin-rest/usage/pagination) — `Link` header format, `page_info` cursor, next/previous rel
- [Shopify AppSubscriptionStatus GraphQL](https://shopify.dev/docs/api/admin-graphql/latest/objects/appsubscription) — Status enum: active, pending, declined, expired, frozen, cancelled
- [Shopify appSubscriptionCreate mutation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate) — `confirmationUrl` format, PENDING initial state
- [Slack chat.update docs](https://docs.slack.dev/reference/methods/chat.update/) — Author enforcement, `cant_update_message`, required params
- [Slack chat.delete docs](https://docs.slack.dev/reference/methods/chat.delete/) — Bot/user ownership, `cant_delete_message`, required params
- [Slack verifying requests](https://docs.slack.dev/authentication/verifying-requests-from-slack) — HMAC formula: `v0:{timestamp}:{body}`, SHA256, `v0=` prefix, `X-Slack-Signature`, `X-Slack-Request-Timestamp`
- [Slack views.open docs](https://docs.slack.dev/reference/methods/views.open/) — view_id returned, `invalid_trigger_id`, `expired_trigger_id`, `exchanged_trigger_id`
- [Slack pins.add docs](https://docs.slack.dev/reference/methods/pins.add/) — `already_pinned`, `pins:write` scope
- [Slack reactions.add docs](https://docs.slack.dev/reference/methods/reactions.add/) — `already_reacted`, `reactions:write` scope
- [Slack conversations.invite docs](https://docs.slack.dev/reference/methods/conversations.invite/) — `already_in_channel`, `channels:manage` scope
- [Slack methods reference](https://docs.slack.dev/reference/methods/) — Full method family list
- [existing codebase] — `packages/conformance/src/comparator.ts` (comparison logic), `twins/shopify/src/plugins/` (OAuth, REST, GraphQL), `twins/slack/src/plugins/web-api/` (chat, conversations, views, pins, stubs), `tests/sdk-verification/coverage/coverage-report.json` (hand-authored coverage), actual `pnpm test:sdk` failure output

---
*Feature research for: v1.2 behavioral fidelity gap fixes (13 adversarial review findings)*
*Researched: 2026-03-11*
