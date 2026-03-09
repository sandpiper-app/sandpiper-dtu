# Feature Landscape

**Domain:** Official SDK conformance testing for Shopify and Slack digital twins
**Researched:** 2026-03-08
**Confidence:** HIGH (Shopify packages), HIGH (Slack packages)

## Current Twin Coverage Baseline

Before defining features, here is what the twins already support and what the SDK packages actually require.

### Shopify Twin: Current State

**GraphQL endpoints:**
- `POST /admin/api/2024-01/graphql.json` -- single versioned endpoint

**GraphQL queries (6):** `orders`, `order`, `products`, `product`, `customers`, `customer`, `inventoryItems`, `inventoryItem`

**GraphQL mutations (8):** `orderCreate`, `orderUpdate`, `orderClose`, `productCreate`, `productUpdate`, `fulfillmentCreate`, `customerCreate`, `inventoryItemUpdate`, `webhookSubscriptionCreate`

**OAuth:** `POST /admin/oauth/access_token` (token exchange only, no auth begin/redirect flow)

**Other behaviors:** Leaky bucket rate limiting (1000 pts, 50 pts/sec restore), HMAC webhook delivery, cursor pagination (Relay spec), GID format IDs, `X-Shopify-Access-Token` header auth, `extensions.cost` in responses, HTTP 429 with Retry-After

**NOT present:** REST API endpoints, full OAuth begin/redirect flow, session management, billing endpoints, webhook registration via REST, API version negotiation, multiple API versions, storefront API

### Slack Twin: Current State

**Web API methods (8 endpoints, GET+POST):**
- `chat.postMessage`, `chat.update`
- `conversations.list`, `conversations.info`, `conversations.history`
- `users.list`, `users.info`
- `oauth.v2.access`

**OAuth:** `GET /oauth/v2/authorize` (redirect with code), `POST /api/oauth.v2.access` (token exchange)

**Events API:** `POST /events` (url_verification + event_callback acknowledgment)

**Interactions:** `POST /admin/interactions/trigger` (button click simulation), `POST /admin/reactions/add`, response URL handling

**Other behaviors:** `xoxb-`/`xoxp-` token prefixes, Bearer + body + query token extraction, HTTP 200 with `{ok: false}` error convention, HTTP 429 for rate limits, cursor pagination, Block Kit validation, event dispatch (message, app_mention, reaction_added), HMAC signing

**NOT present:** ~190+ Web API methods, request signature verification (HMAC on inbound), slash commands endpoint, views/modals endpoints, shortcuts, scheduled messages, files API, reactions API (client-facing), pins API, DnD, search, admin methods, threads/replies, ephemeral messages

---

## Table Stakes

Features users expect. Missing means the SDK conformance claim is not credible.

### Package 1: @shopify/admin-api-client

The low-level GraphQL client. Thin wrapper around HTTP -- the twin's primary contract here is correct HTTP behavior.

| Feature | Why Expected | Complexity | Gap vs Current |
|---------|-------------|------------|----------------|
| `createAdminApiClient()` works against twin URL | This is the entry point for all Shopify GraphQL calls | LOW | **Partially met** -- twin serves GraphQL at the right path, but client config (storeDomain, apiVersion) handling needs verification |
| `client.request()` returns `{data, errors, extensions}` | SDK parses response and exposes structured result | LOW | **Met** -- twin returns JSON with data + extensions.cost |
| `client.fetch()` returns raw Response | Alternative to `request()` for advanced use | LOW | **Met** -- twin serves standard HTTP responses |
| Retry on 429 and 503 (up to 3 retries) | SDK auto-retries throttled/unavailable requests | MEDIUM | **Partially met** -- twin returns 429, but 503 simulation not verified |
| `X-Shopify-Access-Token` header auth | SDK sends token via this header | LOW | **Met** -- twin validates this header |
| API version in URL path | SDK constructs URL with version segment | LOW | **Partially met** -- twin hardcodes `2024-01`, no version negotiation |
| Custom headers passed through | SDK allows per-request custom headers | LOW | **Met** -- standard HTTP |
| Error response structure matches real Shopify | SDK parses `errors` array and `extensions` | MEDIUM | **Partially met** -- need to verify exact error shapes match SDK expectations |

**Estimated gap: 20-30% -- mostly config/retry behavior verification, not new endpoints**

### Package 2: @shopify/shopify-api

The high-level platform library. This is the largest Shopify surface area.

| Feature | Why Expected | Complexity | Gap vs Current |
|---------|-------------|------------|----------------|
| `shopify.auth.begin()` -- OAuth redirect initiation | SDK drives the full OAuth flow, not just token exchange | HIGH | **Not met** -- twin only has token exchange, no redirect/nonce flow |
| `shopify.auth.callback()` -- OAuth callback handling | SDK expects callback with code, HMAC, shop, timestamp params | HIGH | **Not met** -- twin has no callback endpoint with HMAC validation |
| `shopify.auth.tokenExchange()` -- session token to access token | Modern auth for embedded apps | HIGH | **Not met** -- twin has no token exchange endpoint |
| `shopify.session.*` -- session management (5 methods) | `customAppSession`, `getCurrentId`, `getOfflineId`, `decodeSessionToken`, `getJwtSessionId` | MEDIUM | **Not met** -- these are SDK-side but need correct JWT/session token format from twin |
| `shopify.clients.graphql()` -- GraphQL client factory | Creates client from session | LOW | **Partially met** -- twin serves GraphQL but client instantiation path untested |
| `shopify.clients.rest()` -- REST client factory | Creates REST client from session | HIGH | **Not met** -- twin has zero REST endpoints |
| `shopify.webhooks.addHandlers()` | SDK registers webhook handlers locally | LOW | SDK-side only, no twin impact |
| `shopify.webhooks.register()` | SDK registers webhooks with Shopify (GraphQL mutation) | MEDIUM | **Partially met** -- twin has `webhookSubscriptionCreate` mutation |
| `shopify.webhooks.process()` | SDK validates + processes incoming webhook (HMAC verification) | MEDIUM | **Partially met** -- twin delivers with HMAC, but SDK verification path needs testing |
| `shopify.billing.check()` | SDK queries billing status | HIGH | **Not met** -- twin has no billing GraphQL queries |
| `shopify.billing.request()` | SDK creates payment charges | HIGH | **Not met** -- twin has no billing mutations |
| `shopify.utils.*` -- utility functions | Various helpers for shop domain validation, HMAC verification | MEDIUM | **Partially met** -- some overlap with existing HMAC |
| REST resource classes (Products, Orders, Customers, etc.) | `shopify.rest.Product.all()`, `.find()`, `.save()`, etc. | VERY HIGH | **Not met** -- twin has zero REST endpoints. Note: Shopify is deprecating REST (mandatory GraphQL for new apps since April 2025), so REST resources may be deprioritized |
| API version validation | SDK validates version format and availability | LOW | **Partially met** -- twin hardcodes one version |

**Estimated gap: 60-70% -- auth flows, billing, REST resources, session tokens are all missing. REST deprioritized due to Shopify deprecation.**

### Package 3: @slack/web-api

The WebClient with 200+ method aliases. This is the largest single surface area in the project.

| Feature | Why Expected | Complexity | Gap vs Current |
|---------|-------------|------------|----------------|
| **chat family (~12 methods):** `postMessage`, `update`, `delete`, `postEphemeral`, `meMessage`, `getPermalink`, `unfurl`, `scheduledMessages.list`, `scheduleMessage`, `deleteScheduledMessage`, `appendStream`, `completeStream` | Core messaging functionality | HIGH | **2 of ~12 met** (postMessage, update). Missing: delete, postEphemeral, meMessage, getPermalink, unfurl, scheduled messages, streams |
| **conversations family (~22 methods):** `list`, `info`, `history`, `create`, `archive`, `unarchive`, `invite`, `kick`, `join`, `leave`, `members`, `open`, `close`, `mark`, `rename`, `replies`, `setPurpose`, `setTopic`, `acceptSharedInvite`, `declineSharedInvite`, `inviteShared`, `listConnectInvites` | Channel management | HIGH | **3 of ~22 met** (list, info, history). Missing: create, archive, invite, members, replies, mark, and many more |
| **users family (~8 methods):** `list`, `info`, `conversations`, `getPresence`, `setPresence`, `identity`, `lookupByEmail`, `profile.set`, `profile.get` | User information | MEDIUM | **2 of ~8 met** (list, info). Missing: conversations, lookupByEmail, presence, identity, profile |
| **reactions family (3 methods):** `add`, `get`, `list`, `remove` | Emoji reactions | LOW | **0 of 4 met** -- admin endpoint exists but no client-facing `/api/reactions.*` routes |
| **pins family (2 methods):** `add`, `list`, `remove` | Pinning messages | LOW | **0 of 3 met** |
| **files family (~7 methods):** `upload`, `list`, `info`, `delete`, `sharedPublicURL`, `revokePublicURL`, `completeUploadExternal`, `getUploadURLExternal`, `remote.*` | File operations | MEDIUM | **0 of ~7 met** |
| **views family (3 methods):** `open`, `push`, `update`, `publish` | Modal interactions | MEDIUM | **0 of 4 met** |
| **auth family (3 methods):** `test`, `revoke`, `teams.list` | Auth verification | LOW | **0 of 3 met** -- `auth.test` is critical, SDKs use it to verify token validity |
| **search family (3 methods):** `all`, `messages`, `files` | Search functionality | MEDIUM | **0 of 3 met** |
| **dnd family (5 methods):** `endDnd`, `endSnooze`, `info`, `setSnooze`, `teamInfo` | Do Not Disturb | LOW | **0 of 5 met** |
| **reminders family (5 methods):** `add`, `complete`, `delete`, `info`, `list` | Reminders | LOW | **0 of 5 met** |
| **emoji family (1 method):** `list` | Custom emoji | LOW | **0 of 1 met** |
| **team family (~5 methods):** `info`, `accessLogs`, `billableInfo`, `integrationLogs`, `preferences.list` | Team information | LOW | **0 of ~5 met** |
| **usergroups family (~5 methods):** `create`, `disable`, `enable`, `list`, `update`, `users.list`, `users.update` | User groups | LOW | **0 of ~7 met** |
| **bookmarks family (4 methods):** `add`, `edit`, `list`, `remove` | Channel bookmarks | LOW | **0 of 4 met** |
| **bots family (1 method):** `info` | Bot information | LOW | **0 of 1 met** |
| **dialog family (1 method):** `open` | Legacy dialogs | LOW | **0 of 1 met** |
| **api family (1 method):** `test` | API connectivity test | LOW | **0 of 1 met** |
| **admin family (~89 methods):** analytics, apps, auth, barriers, conversations, emoji, functions, inviteRequests, roles, teams, usergroups, users, workflows | Enterprise admin operations | VERY HIGH | **0 of ~89 met** -- enterprise/admin scope, likely deprioritized |
| **apps family (~8 methods):** connections, events, manifests, uninstall | App management | MEDIUM | **0 of ~8 met** |
| **calls family (~6 methods):** add, end, info, participants.add/remove, update | Call management | LOW | **0 of ~6 met** |
| **oauth family (2 methods):** `access`, `v2.access` | OAuth token exchange | LOW | **1 of 2 met** (v2.access exists) |
| **openid family (2 methods):** `connect.token`, `connect.userInfo` | OpenID Connect | LOW | **0 of 2 met** |
| **stars family (2 methods):** `add`, `list`, `remove` (deprecated) | Starred items | LOW | **0 of 3 met** |
| **workflows family (~5 methods):** steps, triggers | Workflow management | LOW | **0 of ~5 met** |
| `apiCall()` generic method | Calls any method by name string | LOW | **Not tested** -- requires twin to handle arbitrary `/api/{method}` routing |
| `paginate()` async iterator | Cursor-based pagination helper | MEDIUM | **Partially met** -- twin returns cursor pagination but SDK auto-pagination untested |
| Retry logic with `retryConfig` | Auto-retry on 429 with Retry-After | MEDIUM | **Partially met** -- twin returns 429 with Retry-After header |

**Estimated gap: 95% by method count (~8 of ~200+ methods). However, practical coverage is higher because admin methods (~89) and deprecated/niche methods (~30) can be deprioritized. Core gap: ~60 high-value methods need implementation.**

### Package 4: @slack/oauth

| Feature | Why Expected | Complexity | Gap vs Current |
|---------|-------------|------------|----------------|
| `InstallProvider.generateInstallUrl()` | Generates OAuth install URL with state encoding | MEDIUM | **Not met** -- twin has basic redirect, but InstallProvider needs correct state cookie/parameter handling |
| `InstallProvider.handleCallback()` | Processes OAuth callback, exchanges code, stores installation | HIGH | **Partially met** -- twin has `oauth.v2.access` but not the full callback flow with state verification |
| `InstallProvider.authorize()` | Resolves tokens for incoming requests (looks up installation) | MEDIUM | **Not met** -- SDK-side but requires consistent token/installation storage semantics |
| State parameter encoding/verification | Uses `stateSecret` to sign state, prevents CSRF | MEDIUM | **Not met** -- twin generates random state but doesn't verify it |
| Installation storage interface | `InstallationStore` with `storeInstallation`/`fetchInstallation` | MEDIUM | SDK-side only, but twin must return correct installation data shape |
| Token rotation support | Handles token refresh when configured | MEDIUM | **Not met** |
| `renderHtmlForInstallPath` | Custom install page rendering | LOW | **Not met** -- but low priority |

**Estimated gap: 60% -- twin has basic OAuth but not the full InstallProvider-compatible flow**

### Package 5: @slack/bolt

| Feature | Why Expected | Complexity | Gap vs Current |
|---------|-------------|------------|----------------|
| Request signature verification (inbound) | Bolt verifies `X-Slack-Signature` and `X-Slack-Request-Timestamp` on every incoming request | HIGH | **Partially met** -- twin generates HMAC for outbound webhooks, but Bolt expects to VERIFY requests FROM Slack. Twin must sign outbound event/interaction payloads correctly |
| `app.event()` listener dispatch | Bolt receives events at its endpoint and dispatches to registered listeners | HIGH | **Partially met** -- twin dispatches events to callback URLs, but envelope format must exactly match what Bolt expects |
| `app.message()` convenience listener | Filtered version of `app.event('message')` | MEDIUM | Same as above -- depends on event envelope format |
| `app.action()` for Block Kit interactions | Bolt receives interaction payloads (block_actions type) | HIGH | **Partially met** -- twin sends interaction payloads but format must match Bolt's expected structure exactly |
| `app.command()` for slash commands | Bolt receives slash command payloads at its endpoint | HIGH | **Not met** -- twin has no slash command dispatch |
| `app.shortcut()` for global/message shortcuts | Bolt receives shortcut payloads | MEDIUM | **Not met** |
| `app.view()` for modal submissions | Bolt receives view_submission/view_closed payloads | MEDIUM | **Not met** -- twin has no views/modals support |
| `app.options()` for external data sources | Bolt receives options load requests | LOW | **Not met** |
| `app.step()` for workflow steps | Bolt receives workflow step callbacks | LOW | **Not met** |
| `ack()` function semantics | Bolt expects HTTP 200 within 3 seconds; response body varies by interaction type | MEDIUM | **Partially met** -- events endpoint returns 200, but timing constraints not enforced |
| `say()` function | Posts message to channel via Web API client | LOW | Depends on chat.postMessage working |
| `respond()` function via response_url | Posts to response URL | MEDIUM | **Partially met** -- twin has response URL endpoint |
| `client` property (WebClient) | Bolt provides pre-configured WebClient | LOW | Depends on Web API compatibility |
| HTTPReceiver / ExpressReceiver | Built-in HTTP servers that handle routing, signature verification, and body parsing | HIGH | Twin must be compatible as the UPSTREAM server, not the receiver. Bolt app is the receiver -- twin must send correctly formatted payloads to it |
| Socket Mode receiver | WebSocket-based real-time events | VERY HIGH | **Not met** -- requires WebSocket server in twin. Likely deferred |

**Estimated gap: 50% -- twin sends events/interactions but format correctness, slash commands, shortcuts, views, and socket mode are missing**

---

## Differentiators

Features that set the project apart from ad-hoc testing approaches.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Source-derived public surface manifest | Machine-generated from cloned SDK repos, not hand-maintained | HIGH | Foundation for all exhaustive testing. Parse TypeScript exports to enumerate every public symbol |
| Symbol-level coverage tracking | Reports exactly which SDK methods hit the twin vs which are stubbed/missing | MEDIUM | CI artifact that makes gap analysis mechanical, not manual |
| `auth.test` golden path | `auth.test` is the method every Slack SDK calls first to validate connectivity. Supporting it unlocks all SDK initialization flows | LOW | High leverage -- single method unblocks entire SDK init |
| Prioritized method tiers | Not all 200+ Slack methods matter equally. Tier 1 (chat, conversations, users, reactions, pins, auth, views, oauth) covers 90%+ of real app usage | MEDIUM | Prevents "boiling the ocean" on admin/enterprise methods |
| REST deprecation awareness | Shopify is mandating GraphQL for new apps (April 2025+). Focus twin on GraphQL conformance, not REST parity | LOW | Saves massive implementation work on deprecated surface |
| Bolt payload format test fixtures | Exact-match test fixtures for every Bolt event/action/command/view payload shape | HIGH | Ensures twin sends what Bolt expects to receive, not what looks approximately right |

---

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full Shopify REST Admin API (~200+ resources) | Shopify deprecated REST; new apps must use GraphQL since April 2025. Hundreds of resource classes would be months of work for diminishing returns | Support only the GraphQL Admin API. If specific REST endpoints are needed for `@shopify/shopify-api` compatibility tests, stub them individually |
| All ~89 admin.* Slack methods | Enterprise-only admin methods require Slack Enterprise Grid. Most apps never call them. Implementation cost is enormous | Mark as "deferred" in manifest. Implement only if a specific SDK test requires them |
| Slack Socket Mode server | Requires a WebSocket server with Slack's socket-mode protocol. Complex, and Bolt's HTTP receiver is the primary path | Defer to v1.2+. Focus on HTTP receiver compatibility first |
| Multi-version API matrix | Testing against multiple Shopify API versions or multiple Slack SDK versions simultaneously | Pin one version per package. Version matrix is a v1.2+ concern |
| Storefront API / Hydrogen support | Different API surface, different auth model, not in milestone scope | Out of scope per PROJECT.md |
| Slack RTM API | Deprecated by Slack in favor of Events API + Socket Mode | Do not implement |
| Patching SDK source to bypass behaviors | Tempting to monkey-patch SDK internals to skip HMAC checks or modify base URLs | Keep SDK code untouched. Adapt twin endpoints instead. Base URL override is the only acceptable configuration change |

---

## Feature Dependencies

```text
Infrastructure Layer:
  Pinned SDK submodules + npm packages
    |
    v
  Public surface manifest generator (parses TS exports)
    |
    v
  Coverage tracking + gap reports

Shopify Layer:
  @shopify/admin-api-client compatibility
    |  (client.request() / client.fetch() work against twin)
    v
  @shopify/shopify-api.clients.graphql() compatibility
    |  (high-level client factory works)
    v
  @shopify/shopify-api.auth.* compatibility
    |  (begin, callback, tokenExchange work)
    v
  @shopify/shopify-api.webhooks.* compatibility
    |  (register, process work end-to-end)
    v
  @shopify/shopify-api.billing.* compatibility (optional, lower priority)

Slack Layer:
  auth.test + api.test (connectivity verification)
    |
    v
  Core Web API methods (chat.*, conversations.*, users.*, reactions.*, pins.*)
    |
    v
  @slack/oauth InstallProvider flow
    |  (generateInstallUrl, handleCallback, authorize)
    v
  @slack/bolt HTTPReceiver compatibility
    |  (event dispatch, action dispatch, command dispatch)
    v
  @slack/bolt views/shortcuts/options (depends on views.* Web API methods)
    v
  Socket Mode (deferred)

Cross-cutting:
  Request signature verification ──> affects both Shopify (HMAC) and Slack (signing secret)
  Rate limiting behavior ──> affects all SDK retry logic
  Error response format ──> affects all SDK error parsing
```

### Critical Path Notes

- **`auth.test` is the gateway for all Slack SDK work.** The WebClient calls `auth.test` during initialization when `token` is provided. Without it, no SDK tests pass.
- **`@shopify/admin-api-client` is the gateway for all Shopify SDK work.** The `@shopify/shopify-api` GraphQL client is built on top of it.
- **Bolt does not call Web API methods directly from events.** The twin sends events TO Bolt. Bolt then uses its built-in `client` (WebClient) to call back. So the twin must both SEND correct payloads AND RECEIVE Web API calls.
- **REST resources are deprioritized** because Shopify mandated GraphQL for new public apps starting April 2025. The `@shopify/shopify-api` REST client still exists but is heading toward deprecation.

---

## MVP Recommendation

### Phase 1: Infrastructure + Critical Gateways

Prioritize:
1. Pinned SDK submodules and manifest generator
2. `auth.test` and `api.test` for Slack (unblocks all WebClient initialization)
3. `@shopify/admin-api-client` end-to-end verification (unblocks all Shopify client work)

### Phase 2: Core Web API Expansion (Slack)

Prioritize high-value method families:
1. **chat family** -- `delete`, `postEphemeral`, `meMessage`, `getPermalink`, `unfurl` (~5 new methods)
2. **conversations family** -- `create`, `archive`, `invite`, `members`, `replies`, `mark`, `open`, `close`, `join`, `leave`, `kick`, `rename`, `setPurpose`, `setTopic` (~14 new methods)
3. **reactions family** -- `add`, `get`, `list`, `remove` (4 new methods)
4. **pins family** -- `add`, `list`, `remove` (3 new methods)
5. **users family** -- `conversations`, `lookupByEmail`, `getPresence` (~3 new methods)

### Phase 3: Shopify Auth + Webhooks (shopify-api)

1. Full OAuth begin/callback/tokenExchange flow
2. Session token JWT format support
3. Webhook registration via GraphQL + process/validate
4. API version negotiation (support multiple version path segments)

### Phase 4: Slack OAuth + Bolt Integration

1. Full InstallProvider flow (state, callback, installation storage)
2. Bolt event envelope format verification
3. Slash command endpoint + dispatch
4. Views/modals Web API methods + view_submission dispatch
5. Shortcut dispatch

### Defer:
- **Shopify REST resources** -- deprecated by Shopify
- **Shopify billing** -- lower priority, can stub
- **Slack admin.* methods (~89)** -- enterprise-only
- **Socket Mode** -- v1.2+ concern
- **files.*, search.*, reminders.*, dnd.*, stars.*, workflows.*` Slack methods** -- implement on demand

---

## Quantified Gap Summary

| Package | Total Public Methods/Features | Currently Supported | Gap | Gap % |
|---------|-------------------------------|--------------------|----|-------|
| `@shopify/admin-api-client` | ~4 client methods + config | ~3 (request, fetch, headers) | ~1 + config gaps | ~25% |
| `@shopify/shopify-api` | ~30 methods across 7 modules | ~3 (token exchange, GraphQL, webhook create) | ~27 methods | ~90% |
| `@slack/web-api` | ~200+ method aliases | 8 endpoints | ~192+ methods | ~96% (but ~60 high-value vs ~130 deprioritizable) |
| `@slack/oauth` | ~7 InstallProvider methods | ~1 (basic token exchange) | ~6 methods | ~85% |
| `@slack/bolt` | ~10 listener types + receivers | ~2 (event, action partial) | ~8 listener types | ~80% |

**Total high-priority gap: ~100-110 features/methods across all packages.**
**Total including deprioritized (admin, REST, enterprise): ~250+ features/methods.**

---

## Sources

- [@shopify/admin-api-client npm](https://www.npmjs.com/package/@shopify/admin-api-client) -- package surface and configuration (HIGH confidence)
- [@shopify/admin-api-client GitHub](https://github.com/Shopify/shopify-app-js/tree/main/packages/api-clients/admin-api-client) -- source reference (HIGH confidence)
- [@shopify/shopify-api npm](https://www.npmjs.com/package/@shopify/shopify-api) -- package overview (HIGH confidence)
- [shopify-api reference docs](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/reference/README.md) -- module structure (HIGH confidence)
- [shopify-api auth.tokenExchange](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/reference/auth/tokenExchange.md) -- auth method details (HIGH confidence)
- [shopify-api session reference](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/reference/session/README.md) -- session methods (HIGH confidence)
- [shopify-api webhooks reference](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/reference/webhooks/README.md) -- webhook methods (HIGH confidence)
- [Shopify REST deprecation announcement](https://shopify.dev/changelog/starting-april-2025-new-public-apps-submitted-to-shopify-app-store-must-use-graphql) -- REST deprecation timeline (HIGH confidence)
- [@slack/web-api npm](https://www.npmjs.com/package/@slack/web-api) -- package overview (HIGH confidence)
- [Slack Web API methods reference](https://docs.slack.dev/reference/methods/) -- complete method listing (HIGH confidence)
- [WebClient class reference](https://docs.slack.dev/tools/node-slack-sdk/reference/web-api/classes/WebClient/) -- method families (HIGH confidence)
- [node-slack-sdk GitHub](https://github.com/slackapi/node-slack-sdk) -- source repository (HIGH confidence)
- [@slack/bolt reference](https://docs.slack.dev/tools/bolt-js/reference/) -- listener methods and configuration (HIGH confidence)
- [bolt-js GitHub](https://github.com/slackapi/bolt-js) -- source repository (HIGH confidence)
- [@slack/oauth npm](https://www.npmjs.com/package/@slack/oauth) -- InstallProvider surface (HIGH confidence)
- [Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/) -- signing secret protocol (HIGH confidence)
- Existing Sandpiper DTU repo source -- current twin implementations (HIGH confidence, inspected directly)

---
*Feature research for: official SDK conformance testing*
*Researched: 2026-03-08*
