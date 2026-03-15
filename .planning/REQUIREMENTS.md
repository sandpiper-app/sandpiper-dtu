# Requirements: Sandpiper DTU

**Defined:** 2026-03-09
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

## v1.1 Requirements

Requirements for milestone `v1.1 Official SDK Conformance`. All complete.

### Conformance Infrastructure

- [x] **INFRA-10**: Developer can check out repo-owned fork submodules of the targeted upstream SDK repos under `third_party/upstream/`, with each submodule pinned to a recorded commit and package version
- [x] **INFRA-11**: Developer can run a manifest generator that inventories every public export and method in the targeted packages and writes a checked-in coverage ledger
- [x] **INFRA-12**: Developer can see, for each inventoried symbol, whether it is verified by a live twin test or a local-only utility test, and CI fails if any `v1.1` symbol lacks declared coverage
- [x] **INFRA-13**: Developer can run one verification command that executes SDK conformance, HMAC signature, async webhook timing, and UI structure checks together
- [x] **INFRA-14**: CI can detect upstream drift by comparing pinned submodule refs, installed package versions, and generated manifests on milestone updates
- [x] **INFRA-15**: SDK verification tests hit live local HTTP/WebSocket endpoints using official SDK URL redirection mechanisms (`customFetchApi` for Shopify, `slackApiUrl` for Slack), not mocked transports
- [x] **INFRA-16**: Manifest generation uses `ts-morph` (v25.0.1+) for reliable export enumeration rather than raw TypeScript compiler API

### Shopify SDK Coverage

- [x] **SHOP-08**: Developer can use `@shopify/admin-api-client` GraphQL client methods (`request`, `fetch`, `getHeaders`, `getApiUrl`) against the Shopify twin across pinned and per-request API versions
- [x] **SHOP-09**: Developer can use `@shopify/admin-api-client` generic REST client methods (`get`, `post`, `put`, `delete`) against the Shopify twin with supported headers, search params, payloads, and retry behavior
- [x] **SHOP-10**: Developer can use `@shopify/shopify-api` auth helpers (`begin`, `callback`, `tokenExchange`, `refreshToken`, `clientCredentials`, and embedded URL helpers) against the Shopify twin
- [x] **SHOP-11**: Developer can use `@shopify/shopify-api` session and utility helpers to create, decode, validate, and resolve Shopify session data for twin-backed requests
- [x] **SHOP-12**: Developer can use `@shopify/shopify-api` webhook, Flow, and fulfillment-service validation helpers with twin-generated requests and signatures
- [x] **SHOP-13**: Developer can use `@shopify/shopify-api` billing helpers to request, inspect, cancel, and mutate billing state against the Shopify twin
- [x] **SHOP-14**: Developer can use `@shopify/shopify-api` client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) against the Shopify twin with the pinned package configuration
- [x] **SHOP-15**: Developer can use Shopify client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) and strategically stubbed REST resource classes, with deprecated REST resources tracked in manifest but not fully implemented

### Slack SDK Coverage

- [x] **SLCK-06.5**: Developer can call `auth.test` and `api.test` via WebClient and receive valid auth verification responses
- [x] **SLCK-07**: Developer can use `@slack/web-api` `WebClient` base behaviors (`apiCall`, `paginate`, `filesUploadV2`, `ChatStreamer`, retries, and rate-limit handling) against the Slack twin
- [x] **SLCK-08**: Developer can call every bound method exposed by the pinned `@slack/web-api` package against the Slack twin — Tier 1 (~60 methods) with full behavioral coverage, Tier 2 stubbed with valid shapes, Tier 3 (admin.* and 126 other methods) manifest-tracked but deferred to v1.2
- [x] **SLCK-09**: Developer can use `@slack/oauth` `InstallProvider` flows (`handleInstallPath`, `generateInstallUrl`, `handleCallback`, `authorize`) against the Slack twin with valid state, cookie, redirect, and installation-store behavior
- [x] **SLCK-10**: Developer can use `@slack/bolt` `App` listener APIs (`event`, `message`, `action`, `command`, `options`, `shortcut`, `view`, `function`, and `assistant`) against twin-backed Slack requests with correct ack semantics
- [x] **SLCK-11**: Developer can use `@slack/bolt` HTTP and Express receiver flows against the Slack twin, including request verification, URL verification, response_url behavior, and custom routes
- [x] **SLCK-12**: Developer can use `@slack/bolt` Socket Mode and AWS Lambda receiver flows against twin-backed harnesses with equivalent event delivery and acknowledgement semantics

## v1.2 Requirements

Requirements for milestone `v1.2 Behavioral Fidelity`. Fixes 13 adversarial review findings plus differentiator features.

### Test Infrastructure

- [x] **INFRA-19**: Developer can run `pnpm test:sdk` and have it discover and execute all SDK verification tests with no ABI mismatch or "no test files found" errors; CI pipeline and Docker images use matching Node version with correctly rebuilt native dependencies
- [x] **INFRA-20**: Test seeders (`seedShopifyAccessToken`, `seedSlackBotToken`) support behavioral tightening: Shopify twin exposes `POST /admin/tokens` (gated behind test-only admin routes) for direct token seeding bypassing OAuth; Slack seeder uses a checked-in method-to-scope catalog shared by both seeding and enforcement to prevent drift

### Conformance Infrastructure

- [x] **INFRA-21**: Conformance harness performs bidirectional structural comparison in live mode — twin response must contain all baseline fields AND baseline response must contain all twin fields — with full array traversal (not just first element) and primitive value comparison; includes a normalizer contract with declared ignore lists for non-deterministic fields (timestamps, cursor IDs, signed URLs), ordering rules, and per-endpoint exact-vs-structural mode declarations
- [x] **INFRA-22**: Coverage status for each tracked symbol is derived from test execution evidence (Vitest JSON reporter or equivalent instrumentation), not hand-authored `LIVE_SYMBOLS` map; evidence schema defines how test files map to symbols, how aliases are attributed, and how local-only utilities are excluded; dual-run migration keeps `LIVE_SYMBOLS` and evidence in parallel until evidence matches or exceeds the 202+ symbol count, then removes `LIVE_SYMBOLS`
- [x] **INFRA-23**: SDK coverage status is derived from per-symbol execution evidence emitted during the SDK test run, not a hand-authored symbol map; each symbol in the coverage report is marked live only when runtime instrumentation at the shared helper seam confirms that symbol was actually called during a passing test
- [x] **INFRA-24**: Conformance suites and reporters only claim parity where deterministic value checks or exact comparisons actually prove it; structural-only suites are reported as structural smoke, not 1:1 parity proof
- [x] **INFRA-25**: Generated coverage reports, drift gates, and checked-in verification docs carry provenance metadata and reject stale or misleading "live" or "complete" claims; evidence freshness is enforced at the gate level, not assumed from checked-in artifacts

### Shopify Fidelity

- [x] **SHOP-17**: Shopify twin serves GraphQL and REST routes with parameterized API version (`:version` in URL path) accepting any valid Shopify API version string, not hardcoded to `2024-01`; unsupported/sunset versions return appropriate error responses; test helpers no longer rewrite request URLs to a single version
- [x] **SHOP-18**: Shopify twin implements full OAuth authorize flow: `GET /admin/oauth/authorize` returns redirect with HMAC-signed callback URL and state nonce cookie; `POST /admin/oauth/access_token` validates `client_id`, `client_secret`, and authorization code; empty-body requests return error; replayed/expired codes and invalid state are rejected with correct error responses
- [x] **SHOP-19**: Shopify twin serves Storefront API on separate GraphQL schema at `/api/:version/graphql.json` using `X-Shopify-Storefront-Access-Token` header for auth; admin-only mutations are not exposed on the Storefront endpoint; schema covers the types exercised by the pinned `@shopify/storefront-api-client` tests (products, collections, shop at minimum); rejects admin access tokens
- [x] **SHOP-20**: Shopify REST resources use persistent CRUD backed by StateManager: (a) `POST /products.json` creates a product retrievable by subsequent `GET /products.json` and `GET /products/:id.json`; (b) response shapes use numeric integer IDs with `admin_graphql_api_id` field (e.g., `"gid://shopify/Product/12345"`); (c) `GET /orders/:id.json` returns the specific order by numeric ID
- [x] **SHOP-21**: Shopify billing implements state machine: `appSubscriptionCreate` returns subscription in PENDING state with `confirmationUrl`; confirming transitions to ACTIVE; `currentAppInstallation` returns actual subscription data; `appSubscriptionCancel` validates subscription ownership and transitions to CANCELLED
- [x] **SHOP-22**: Shopify twin returns `X-Shopify-API-Version` response header on all API responses, echoing the version from the request URL path
- [x] **SHOP-23**: Shopify REST list endpoints return `Link` header with `rel="next"` and `page_info` cursor parameter for paginated responses, matching real Shopify pagination format
- [x] **SHOP-24**: Shopify rate limiting uses correct bucket size (maxAvailable=1000, restoreRate=50) and computes `actualQueryCost` based on real query field traversal rather than forcing it equal to `requestedQueryCost`

### Slack Fidelity

- [x] **SLCK-14**: All bound WebClient methods from the pinned `@slack/web-api` package are registered and callable against the Slack twin, closing the 126-method gap; high-value families (admin.apps, admin.conversations, admin.users, workflows) have semantically correct responses; remaining admin.* and low-traffic families are explicitly marked as stubs with documented limitations
- [x] **SLCK-15**: Slack `chat.update` enforces channel scoping (message must exist in the specified channel) and author ownership (bot tokens can only update messages they posted), returning `{ok: false, error: "cant_update_message"}` on violations; `chat.delete` enforces equivalent rules with `cant_delete_message`; conformance tests exercise the actual `chat.update` and `chat.delete` methods (not substituting `chat.postMessage`)
- [x] **SLCK-16**: Slack event delivery uses `X-Slack-Signature` (`v0=` + HMAC-SHA256 hex using signing secret) and `X-Slack-Request-Timestamp` headers instead of Shopify webhook signature headers; interactions route through a dedicated interactivity request URL (not through event subscriptions); `response_url` is an absolute URL (not relative path)
- [x] **SLCK-17**: Slack `conversations.invite`/`kick` manage actual channel membership; `conversations.members` returns real member list; `conversations.open` returns a real DM channel (not canned `D_TWIN`); `views.open`/`update`/`push` maintain persistent view lifecycle with stable view IDs; `pins.add`/`remove`/`list` are stateful with deduplication (`already_pinned` error); `reactions.add`/`remove`/`list`/`get` are stateful with deduplication (`already_reacted` error)
- [x] **SLCK-18**: Slack auth enforces OAuth scope requirements per method, returning `{ok: false, error: "missing_scope", needed: "<scope>", provided: "<scopes>"}` when token lacks the required scope; OAuth token exchange validates `client_id`, `scope`, and `redirect_uri` parameters
- [x] **SLCK-19**: Slack API responses include `X-OAuth-Scopes` (token's granted scopes) and `X-Accepted-OAuth-Scopes` (method's required scopes) headers on successful calls
- [x] **SLCK-20**: `openid.connect.token` persists OIDC access tokens that work with `openid.connect.userInfo`; `oauth.v2.access` validates `client_secret`, echoes the authorize-time granted scope string, and `apps.connections.open` requires an app token with `connections:write`
- [x] **SLCK-21**: `conversations.list`, `conversations.info`, and `conversations.history` resolve required `channels/groups/im/mpim` read or history scopes from request `types` or the resolved channel class instead of requiring every family scope at once
- [x] **SLCK-22**: `filesUploadV2` returns Slack-shaped completed file metadata, and `response_url` honors `replace_original` and `delete_original`
- [x] **SLCK-23**: `auth.test` returns identity fields that match the token class instead of always returning the bot identity

### Cross-Cutting

- [x] **XCUT-01**: Every new SQLite table added in v1.2 is included in the corresponding StateManager/SlackStateManager `reset()` logic, verified by a reset coverage test, and keeps reset performance within the existing sub-100ms target

## v2 Requirements

Deferred after the `v1.2` behavioral fidelity baseline exists.

### Additional SDK Targets

- **SLCK-13**: Developer can validate standalone Slack packages outside the v1.1 target set (`@slack/rtm-api`, `@slack/webhook`, standalone `@slack/socket-mode`) against dedicated twins or harnesses
- **SHOP-16**: Developer can validate Shopify app-framework packages (`shopify-app-express`, `shopify-app-remix`, `shopify-app-react-router`) against the twin ecosystem when app-framework fidelity becomes valuable

### Automation

- **INFRA-17**: Developer can open an automated update PR that bumps pinned SDK refs, regenerates manifests, and summarizes compatibility diffs
- **INFRA-18**: Developer can run a multi-version package matrix across more than one pinned Shopify or Slack package release

### Extended Fidelity

- **SHOP-25**: Shopify twin supports multiple API version schemas (not just parameterized routes with one schema)
- **SLCK-24**: Slack `admin.*` methods implement full Enterprise Grid simulation beyond basic stubs
- **SHOP-26**: Shopify Storefront cart/checkout mutations implemented for e-commerce testing workflows

## Out of Scope

Explicitly excluded from v1.2.

| Feature | Reason |
|---------|--------|
| Full Storefront cart/checkout mutations | No Sandpiper integration currently; basic product queries sufficient |
| Shopify edit window enforcement (`edit_window_closed`) | Time-based logic with no current test value |
| Multiple Shopify API version schemas | One schema served at parameterized routes is sufficient for v1.2 |
| Slack admin.* with real Enterprise Grid behavior | Stubs with correct auth gating sufficient; full Enterprise Grid not needed |
| New service twins (Nylas, Shippo, Triple Whale) | Deferred until behavioral fidelity proven on Shopify and Slack |
| Production deployment work | Sandpiper DTU remains dev/test infrastructure |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.1 (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-10 | Phase 13 | Complete |
| INFRA-11 | Phase 13 | Complete |
| INFRA-12 | Phase 14 | Complete |
| INFRA-13 | Phase 14 | Complete |
| INFRA-14 | Phase 14, 20 | Complete |
| INFRA-15 | Phase 14 | Complete |
| INFRA-16 | Phase 13 | Complete |
| SHOP-08 | Phase 15 | Complete |
| SHOP-09 | Phase 15 | Complete |
| SHOP-10 | Phase 16 | Complete |
| SHOP-11 | Phase 16 | Complete |
| SHOP-12 | Phase 16 | Complete |
| SHOP-13 | Phase 16 | Complete |
| SHOP-14 | Phase 17 | Complete |
| SHOP-15 | Phase 17 | Complete |
| SLCK-06.5 | Phase 14 | Complete |
| SLCK-07 | Phase 18 | Complete |
| SLCK-08 | Phase 18 | Complete |
| SLCK-09 | Phase 19 | Complete |
| SLCK-10 | Phase 19 | Complete |
| SLCK-11 | Phase 19 | Complete |
| SLCK-12 | Phase 20 | Complete |

### v1.2 (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-19 | Phase 21, 41 | Complete |
| INFRA-20 | Phase 21, 41 | Complete |
| SHOP-17 | Phase 22, 28, 41 | Complete |
| SHOP-22 | Phase 22 | Complete |
| SHOP-23 | Phase 22, 28 | Complete |
| SHOP-18 | Phase 23, 41 | Complete |
| SHOP-19 | Phase 23 | Complete |
| SHOP-20 | Phase 24, 41 | Complete |
| SHOP-21 | Phase 24, 29 | Complete |
| SHOP-24 | Phase 24 | Complete |
| SLCK-14 | Phase 25, 31, 41 | Complete |
| SLCK-16 | Phase 25, 30 | Complete |
| SLCK-17 | Phase 25, 30 | Complete |
| SLCK-15 | Phase 26 | Complete |
| SLCK-18 | Phase 26, 31, 41 | Complete |
| SLCK-19 | Phase 26 | Complete |
| SLCK-20 | Phase 38, 41 | Complete |
| SLCK-21 | Phase 38 | Complete |
| SLCK-22 | Phase 38, 41 | Complete |
| SLCK-23 | Phase 38 | Complete |
| INFRA-21 | Phase 27, 32 | Complete |
| INFRA-22 | Phase 27, 32 | Complete |
| XCUT-01 | Phase 33 | Complete |
| INFRA-23 | Phase 40, 41 | Complete |
| INFRA-24 | Phase 40, 41 | Complete |
| INFRA-25 | Phase 40, 41 | Complete |

**Coverage:**
- v1.1 requirements: 22 total (all complete)
- v1.2 requirements: 26 total (all complete)
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-15 after Phase 41 completion*
