# Phase 38: slack-auth-scope-and-client-behavior-parity - Research

**Researched:** 2026-03-14
**Domain:** Slack twin auth, scope, and client-visible parity against pinned Slack SDK behavior
**Confidence:** MEDIUM

## Summary

Phase 38 is not a broad Slack rework. It is a tightly scoped parity pass across six confirmed defects where the twin currently returns "successful enough" responses that let SDK tests stay green while violating the behavior expected by the pinned Slack clients and official Slack docs. The biggest planning mistake would be treating these as six unrelated route fixes: four of them share the same root seam, which is that token records, OAuth/OIDC code bindings, and scope resolution are modeled too generically.

The codebase already has the right architectural spine for this phase: keep behavior in the existing Slack plugins, keep cross-request state in `SlackStateManager`, keep SDK-truth anchored to the vendored `node-slack-sdk` sources, and keep verification in `tests/sdk-verification/`. The right plan is to add Wave 0 parity tests first, then fix shared token/scope infrastructure before changing client-visible handlers that depend on it.

The roadmap/requirements mapping is inconsistent. [REQUIREMENTS.md](/Users/futur/projects/sandpiper-dtu/.planning/REQUIREMENTS.md) still defines `SLCK-20` as Enterprise Grid `admin.*` fidelity and does not define `SLCK-21..23`, while [ROADMAP.md](/Users/futur/projects/sandpiper-dtu/.planning/ROADMAP.md) assigns `SLCK-20..23` to this auth/scope/client-parity phase. Planning should stay anchored to the Phase 38 goal and the six confirmed defects, not the older `SLCK-20` text.

**Primary recommendation:** Plan Phase 38 in four passes: Wave 0 tests and seeders, token/auth model fixes, context-aware scope enforcement, then client-visible parity fixes (`filesUploadV2`, `response_url`, `auth.test`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-20 | `REQUIREMENTS.md` currently defines this as `admin.*` Enterprise Grid simulation, which does not match Phase 38. Treat as roadmap-ID mismatch; do not broaden Phase 38 to Enterprise Grid work. | Use the Phase 38 roadmap goal and confirmed defects as the actual planning scope. |
| SLCK-21 | Not defined in `REQUIREMENTS.md`; implied by [ROADMAP.md](/Users/futur/projects/sandpiper-dtu/.planning/ROADMAP.md) as OAuth/OpenID statefulness and credential validation parity. | Defects 1 and 2; sections "Defect Map", "Architecture Patterns", and "Minimal Plan Decomposition". |
| SLCK-22 | Not defined in `REQUIREMENTS.md`; implied by [ROADMAP.md](/Users/futur/projects/sandpiper-dtu/.planning/ROADMAP.md) as token-class and scope semantics parity. | Defects 3, 4, and 6b; sections "Defect Map", "Don't Hand-Roll", and "Common Pitfalls". |
| SLCK-23 | Not defined in `REQUIREMENTS.md`; implied by [ROADMAP.md](/Users/futur/projects/sandpiper-dtu/.planning/ROADMAP.md) as client-visible behavior parity. | Defects 5 and 6a; sections "Defect Map", "Code Examples", and "Validation Architecture". |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@slack/web-api` | `7.14.1` | Source of truth for `WebClient`, `filesUploadV2()`, `openid.*`, and method argument/response contracts | The twin exists to satisfy this exact pinned client surface. |
| `@slack/oauth` | `3.0.4` | Source of truth for `InstallProvider` callback/exchange behavior | Existing OAuth tests already drive Phase 38-sensitive flows through this package. |
| `@slack/bolt` | `4.6.0` | Source of truth for `SocketModeReceiver`, `HTTPReceiver`, and `respond()`/`response_url` behavior | Phase 38 defects include app-token semantics and `response_url` parity that Bolt consumes directly. |
| `fastify` | `^5.0.0` | Existing twin routing/plugin architecture | Current Slack twin already organizes behavior by API family plugin; Phase 38 should extend that pattern, not bypass it. |
| `@dtu/state` + `better-sqlite3` | `workspace:*` + `^12.6.2` | State and reset-safe persistence for tokens, users, messages, and channels | Several defects are state bugs, not transport bugs. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^3.0.0` | SDK verification and Wave 0 RED tests | Use for every behavior change in this phase. |
| `ws` | `^8.19.0` | Socket Mode broker harness | Required when tightening `apps.connections.open` semantics so Socket Mode remains proven. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Editing existing Slack plugins | New Phase 38-only plugin files | Worse locality; current code already groups behavior by Slack family and test plans assume those seams. |
| Generic `METHOD_SCOPES` array lookup | Context-aware scope resolver helper | Required for this phase; flat arrays cannot express request-type or channel-class semantics. |
| New SQL tables for transient upload state | Reset-safe ephemeral state on `SlackStateManager` | Prefer ephemeral state unless a later phase needs files to persist across requests beyond one upload flow. |

**Installation:**
```bash
pnpm install
```

No new third-party packages are required for Phase 38.

## Architecture Patterns

### Recommended Project Structure
```text
twins/slack/src/
├── plugins/
│   ├── oauth.ts                    # OAuth v2 authorize/access flow
│   ├── interactions.ts             # response_url route
│   └── web-api/
│       ├── auth.ts                 # auth.test
│       ├── conversations.ts        # list/info/history/open
│       ├── files.ts                # filesUploadV2 chain
│       ├── new-families.ts         # openid.connect.*
│       └── stubs.ts                # apps.connections.open
├── services/
│   ├── method-scopes.ts            # shared scope catalog/helpers
│   ├── interaction-handler.ts      # response_url state machine
│   └── token-validator.ts          # token extraction only
└── state/
    └── slack-state-manager.ts      # tokens, users, channels, messages, reset-safe ephemeral state

tests/sdk-verification/
├── sdk/                            # Wave 0 + regression tests
├── setup/seeders.ts                # token seeding helpers
└── vitest.config.ts                # single-fork verification harness
```

### Pattern 1: Fix Shared Token Semantics Before Endpoint Semantics
**What:** Treat token type, granted scopes, OAuth/OIDC code bindings, and derived identity as shared infrastructure rather than per-route one-offs.
**When to use:** Defects 1, 2, 3, and 6b.
**Example:**
```typescript
// Source: local pattern derived from oauth.ts + auth.ts + stubs.ts
type TokenClass = 'bot' | 'user' | 'app';

interface BoundCode {
  clientId: string;
  redirectUri: string;
  grantedScopes: string[];
}

function requireTokenClass(record: TokenRecord, expected: TokenClass) {
  if (record.token_type !== expected) return { ok: false, error: 'not_allowed_token_type' };
}
```

### Pattern 2: Resolve Conversation Scopes From Request Context, Not Method Name Alone
**What:** `conversations.list`, `conversations.info`, and `conversations.history` need dynamic scope selection.
**When to use:** Defect 4.
**Example:**
```typescript
// Source: official conversations.list docs + local conversations.ts
function requiredScopesForConversationRead(method: string, params: any, channel?: ChannelRow): string[] {
  if (method === 'conversations.list') {
    const types = (params.types ?? 'public_channel').split(',');
    return scopesForRequestedTypes(types);
  }
  return scopesForChannelClass(channelClass(channel));
}
```

### Pattern 3: Put Cross-Request Client Flows In Reset-Safe State
**What:** Any value created in one request and consumed in a later request must survive long enough to finish the flow and must clear on `/admin/reset`.
**When to use:** OIDC access tokens, OAuth granted scopes, file upload step-1/step-3 metadata, response URL replace/delete behavior.
**Example:**
```typescript
// Source: local pattern derived from SlackStateManager.wssUrl/interactivityUrl
class SlackStateManager {
  private uploadSessions = new Map<string, UploadSession>();

  reset() {
    // existing DB reset...
    this.uploadSessions.clear();
  }
}
```

### Anti-Patterns to Avoid
- **Hardcoded response scopes:** `oauth.v2.access` must not return a fixed scope string unrelated to authorize-time `scope`.
- **Prefix-only token checks:** an `xapp-` string seeded as `tokenType: 'bot'` is still semantically wrong for Socket Mode.
- **Flat family-wide scope ANDing:** `conversations.*` methods are not "require all possible channel scopes" APIs.
- **Resolve-only tests:** `filesUploadV2` passing because it did not throw is exactly the false green this phase exists to remove.
- **Append-only `response_url` handling:** `replace_original` and `delete_original` are state mutations, not extra message posts.

## Defect Map

| Defect | Root Cause | Concrete Code Seams To Modify | Verification Trap |
|--------|------------|-------------------------------|------------------|
| `openid.connect.token` returns a token `userInfo` rejects | [new-families.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/new-families.ts) fabricates an `xoxp-oidc-*` token but never stores it; `openid.connect.userInfo` is auth-gated by token lookup and `openid` scope. | [new-families.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/new-families.ts), [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) | Returning `ok: true` from `openid.connect.token` is not enough; the returned `access_token` must work in a second real `WebClient` call. |
| `oauth.v2.access` ignores `client_secret` and returns hardcoded scopes | [oauth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts) binds `scope` on authorize but does not use it at exchange time, and it never validates `client_secret`. | [oauth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts) | Existing InstallProvider tests only prove callback success; they do not prove secret validation or granted-scope echo. |
| `apps.connections.open` accepts bot tokens | [stubs.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/stubs.ts) only checks token existence + `connections:write`; token class is ignored everywhere. | [stubs.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/stubs.ts), [admin.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/admin.ts), [seeders.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/setup/seeders.ts) | Current Socket Mode test seeds `APP_TOKEN` through `seedSlackBotToken()`, which can keep the test green while semantics stay wrong. |
| `conversations.*` scope logic ANDs all family scopes | [method-scopes.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/method-scopes.ts) models `conversations.list/info/history` as flat arrays and `checkScope()` requires every scope in the array. | [method-scopes.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/method-scopes.ts), [conversations.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/conversations.ts), [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) | Default `conversations.list` behavior is `public_channel`; do not accidentally require all four conversation read scopes when `types` is absent. |
| `filesUploadV2` resolves but completed metadata is empty/wrong | [files.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/files.ts) throws away filename/upload metadata and step 3 returns `{id,title}` only. | [files.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/files.ts), optionally [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) for transient upload sessions | Upstream `filesUploadV2()` returns nested completion responses; a flat `files[]` assertion or `resolves.toBeDefined()` will miss the bug. |
| `response_url` ignores `replace_original`/`delete_original` | [interaction-handler.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/interaction-handler.ts) always posts a new message and has no delete path. | [interaction-handler.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/interaction-handler.ts), [interactions.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/interactions.ts), [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) | Existing Bolt test only proves `respond()` reaches the route; it does not verify state mutation on the original message. |
| `auth.test` always returns bot identity | [auth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/auth.ts) hardcodes bot-flavored `user`, `user_id`, and `bot_id` instead of deriving from `tokenRecord`. | [auth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/auth.ts), [oauth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts), [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) | Do not break existing bot-token expectations from InstallProvider. The safe contract is: bot tokens still return `bot_id`; user tokens do not. |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC/OAuth parity | Independent stub responses for each route | One shared authorize/code/token model in [oauth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts) and [new-families.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/new-families.ts) | The defects are caused by drift between exchange-time and follow-up behavior. |
| Conversation scope checks | One `METHOD_SCOPES[method]` lookup for all read methods | Method-specific resolver that derives scopes from request `types` or channel class | Slack docs and the pinned SDK types encode contextual behavior here. |
| App-token gating | Prefix checks only or bot-token reuse | Explicit `token_type`/token-class enforcement plus `connections:write` | Socket Mode semantics are app-token specific, not just scope specific. |
| `filesUploadV2` output | Ad hoc "looks file-like" objects | Match the vendored `WebClient.filesUploadV2()` nested completion contract | This is a client-visible structure, not an internal convenience return. |
| `response_url` behavior | Always posting another message | Update/delete the original message by stored `messageTs` when flags demand it | Bolt `respond()` utilities depend on this behavior. |

**Key insight:** Phase 38 should not invent new abstractions. It should tighten the existing shared seams until the current plugins can produce the same externally visible behavior the pinned Slack SDKs expect.

## Common Pitfalls

### Pitfall 1: Fixing `apps.connections.open` Without Fixing Seeders
**What goes wrong:** The route starts enforcing app tokens, but Socket Mode tests still create the "app token" through `seedSlackBotToken(APP_TOKEN)`.
**Why it happens:** Test helpers currently treat token string and token class as interchangeable.
**How to avoid:** Add `seedSlackAppToken()` before tightening the route and migrate the Socket Mode test first.
**Warning signs:** A test still passes with a `xoxb-` token that has `connections:write`.

### Pitfall 2: Flattening `filesUploadV2` Responses
**What goes wrong:** The twin returns one flat `files[]` array and the SDK caller appears to work.
**Why it happens:** Local tests currently only assert that `filesUploadV2()` resolves.
**How to avoid:** Assert the exact nested shape returned by vendored `WebClient.spec.ts`: outer `{ ok, files: [completion] }`, inner completion `{ ok, files: [...] }`.
**Warning signs:** Inner file objects have `title` but no `name` or `permalink`.

### Pitfall 3: Over-Enforcing Conversation Read Scopes
**What goes wrong:** `conversations.list` without `types` fails unless the token has `channels:read`, `groups:read`, `im:read`, and `mpim:read`.
**Why it happens:** `checkScope()` currently ANDs every scope in the method catalog entry.
**How to avoid:** Resolve required scopes after parsing `types` or after loading the target channel.
**Warning signs:** A public-channel-only request returns `missing_scope` for `groups:read`.

### Pitfall 4: Making `auth.test` Generic But Breaking Bot Paths
**What goes wrong:** A user-token fix removes `bot_id` from all `auth.test` responses.
**Why it happens:** The current route is hardcoded, so a naive cleanup can over-correct.
**How to avoid:** Branch on `tokenRecord.token_type` and keep the bot path stable.
**Warning signs:** [slack-oauth-install-provider.test.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts) starts failing because `botId` disappears.

### Pitfall 5: Treating `response_url` Flags As Presentation Details
**What goes wrong:** `replace_original` and `delete_original` are parsed but still append follow-up messages.
**Why it happens:** The handler currently only knows how to create a new message.
**How to avoid:** Store and mutate the origin message by `messageTs`; add delete support to state.
**Warning signs:** Message counts increase when `replace_original` or `delete_original` is used.

### Pitfall 6: Planning Against the Wrong Requirement Text
**What goes wrong:** The planner expands into Enterprise Grid `admin.*` work because `SLCK-20` in `REQUIREMENTS.md` still means that.
**Why it happens:** Phase 38 IDs were added in the roadmap before `REQUIREMENTS.md` was updated.
**How to avoid:** Treat the six confirmed defects and the Phase 38 goal as the authoritative scope.
**Warning signs:** Any task mentions `admin.users.*`, `admin.conversations.*`, or Grid simulation.

## Code Examples

Verified patterns from official or pinned sources:

### Socket Mode Uses an App Token, Not a Bot Token
```typescript
// Source: vendored SocketModeClient.ts + official Socket Mode docs
const client = new SocketModeClient({ appToken });
// Internally it calls apps.connections.open with Authorization: Bearer <appToken>.
```

### `filesUploadV2()` Returns Nested Completion Results
```typescript
// Source: vendored WebClient.ts + WebClient.spec.ts
const result = await client.filesUploadV2({ filename, file });
// result.ok === true
// result.files[0].ok === true
// result.files[0].files[0].name is the uploaded filename
```

### `conversations.list` Scope Depends on Requested Types
```typescript
// Source: official conversations.list docs + vendored request types
// No `types` param => default is public_channel => channels:read
await client.conversations.list();

// Mixed request => derive scopes from requested classes, not all possible classes
await client.conversations.list({ types: 'public_channel,private_channel' });
```

### `respond()` Can Replace or Delete the Original Message
```typescript
// Source: vendored Bolt docs/utilities.ts
await respond({
  text: 'updated body',
  replace_original: true,
});
```

## Minimal Plan Decomposition

### Plan A: Wave 0 parity tests and seeders
**Goal:** Make the six confirmed defects fail deterministically before implementation.
**Scope:**
- Add `seedSlackAppToken()` and `seedSlackUserToken()` in [seeders.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/setup/seeders.ts).
- Add a new `slack-auth-client-parity.test.ts` for OIDC, OAuth secret/scope echo, `apps.connections.open`, `auth.test` user-token shape, `response_url`, and `filesUploadV2`.
- Add a new `slack-conversation-scope-parity.test.ts` for `conversations.list/info/history`.
- Migrate [slack-bolt-socket-mode-receiver.test.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts) to seed a real app token.

### Plan B: Shared token/auth model
**Goal:** Fix defects 1, 2, and 6b without duplicating auth logic.
**Scope:**
- Extend authorize-time bindings in [oauth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts) so exchange-time responses derive from the bound request.
- Make `openid.connect.token` persist a usable user token with `openid` scope and create/fetch the user it represents.
- Validate `client_secret` in `oauth.v2.access`.
- Make `auth.test` derive response identity from `tokenRecord.token_type`, `user_id`, and team/user state.

### Plan C: Token-class and conversation-scope semantics
**Goal:** Fix defects 3 and 4.
**Scope:**
- Add explicit app-token enforcement in [stubs.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/stubs.ts) for `apps.connections.open`.
- Add conversation-class inference and a context-aware scope resolver in [method-scopes.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/method-scopes.ts) or a sibling helper.
- Update [conversations.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/conversations.ts) to call the dynamic resolver after parsing params/loading channel state.

### Plan D: Client-visible flow parity
**Goal:** Fix defects 5 and 6a.
**Scope:**
- Preserve upload metadata across the 3-step flow in [files.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/files.ts).
- Add message delete support and original-message mutation paths in [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) and [interaction-handler.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/interaction-handler.ts).
- Strengthen existing base/Bolt tests so they assert actual state changes, not only transport success.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat family-wide scope catalogs for conversation reads | Context-aware scope resolution keyed by requested types or actual channel class | Current Slack docs and pinned SDK typings | Prevents false `missing_scope` errors and false-green broad-scope assumptions |
| Treating any token with the right scope as valid for Socket Mode | App-level `xapp` token semantics with `connections:write` | Current Socket Mode docs and pinned `SocketModeClient` | Prevents bot-token false greens in `apps.connections.open` |
| Testing `filesUploadV2()` only for "no throw" | Testing exact nested completion response shapes | Pinned `WebClient.spec.ts` | Eliminates a class of client-visible shape regressions |
| Append-only `response_url` handling | Replace/delete original-message semantics | Current Bolt `respond()` contract | Prevents false parity claims around interactive updates |

**Deprecated/outdated:**
- Treating `SLCK-20` in `REQUIREMENTS.md` as the authoritative scope for this phase: outdated for planning Phase 38; use the roadmap goal and confirmed defects instead.
- Treating `seedSlackBotToken(APP_TOKEN)` as a valid Socket Mode setup: outdated once app-token semantics are enforced.

## Open Questions

1. **What exact `auth.test` body should a user token return beyond `user_id` and the absence of `bot_id`?**
   - What we know: vendored `AuthTestResponse` makes `bot_id` optional, and Slack docs describe `auth.test` as "tells you who you are".
   - What's unclear: exact `user` display-name semantics for OAuth-generated user tokens in this twin.
   - Recommendation: Phase 38 tests should assert `user_id`, `team_id`, and absence of `bot_id` for user tokens; avoid over-specifying `user` display text unless live conformance is added.

2. **For `conversations.list` with multiple requested types, should partial scope coverage fail or partially filter results?**
   - What we know: official docs say callers can request mixed `types`, and the current "all possible scopes" behavior is wrong.
   - What's unclear: exact Slack behavior when the request asks for multiple types but the token only has one of the corresponding scopes.
   - Recommendation: Plan to require scopes for all requested classes and note this as a candidate live-conformance follow-up if any ambiguity remains.

3. **How should the planner treat `SLCK-20..23` given the roadmap/requirements mismatch?**
   - What we know: [ROADMAP.md](/Users/futur/projects/sandpiper-dtu/.planning/ROADMAP.md) defines Phase 38 against auth/scope/client parity, while [REQUIREMENTS.md](/Users/futur/projects/sandpiper-dtu/.planning/REQUIREMENTS.md) does not.
   - What's unclear: when the requirements file will be updated.
   - Recommendation: Keep Phase 38 bounded to the six confirmed defects and explicitly annotate the mismatch in every planning artifact.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest ^3.0.0` |
| Config file | [tests/sdk-verification/vitest.config.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/vitest.config.ts) |
| Quick run command | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-client-parity.test.ts` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-20 | Requirement text mismatch; planner must not broaden to Enterprise Grid work | manual/planning guard | `rg -n "SLCK-20|SLCK-21|SLCK-22|SLCK-23" .planning/ROADMAP.md .planning/REQUIREMENTS.md` | ✅ |
| SLCK-21 | OIDC/OAuth statefulness and credential validation | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-client-parity.test.ts -t "openid|oauth"` | ❌ Wave 0 |
| SLCK-22 | App-token and conversation-type/channel-class scope semantics | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` | ❌ Wave 0 |
| SLCK-23 | `filesUploadV2`, `response_url`, and token-class-specific `auth.test` parity | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-client-parity.test.ts -t "filesUploadV2|response_url|auth.test"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-client-parity.test.ts`
- **Per wave merge:** `pnpm test:sdk -- tests/sdk-verification/sdk/slack-auth-client-parity.test.ts tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts`
- **Phase gate:** `pnpm test:sdk`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/sdk/slack-auth-client-parity.test.ts` — OIDC token usability, OAuth `client_secret`/scope echo, `apps.connections.open` token class, `auth.test` user-token shape, `filesUploadV2` metadata, `response_url` replace/delete
- [ ] `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` — request-type and channel-class-specific scope matrices for `conversations.list/info/history`
- [ ] `tests/sdk-verification/setup/seeders.ts` — add `seedSlackAppToken()` and `seedSlackUserToken()` so semantic checks are not masked by bot-token helpers
- [ ] Strengthen [tests/sdk-verification/sdk/slack-webclient-base.test.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/slack-webclient-base.test.ts) — assert nested `filesUploadV2` shape, not just resolution
- [ ] Strengthen [tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/slack-bolt-http-receivers.test.ts) — assert original-message replace/delete behavior, not just that `respond()` reached the route

## Sources

### Primary (HIGH confidence)
- Local Slack twin source:
  - [oauth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/oauth.ts) - current OAuth authorize/access behavior
  - [auth.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/auth.ts) - current `auth.test` identity behavior
  - [conversations.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/conversations.ts) - current conversation read/open behavior
  - [files.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/files.ts) - current `filesUploadV2` chain
  - [new-families.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/new-families.ts) - current `openid.connect.*` routes
  - [stubs.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/stubs.ts) - current `apps.connections.open`
  - [interaction-handler.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/interaction-handler.ts) and [interactions.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/interactions.ts) - current `response_url` behavior
  - [method-scopes.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/method-scopes.ts) - current scope model
  - [slack-state-manager.ts](/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts) - current token/state model
- Vendored upstream SDK/docs:
  - [WebClient.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts) - `filesUploadV2()` behavior
  - [WebClient.spec.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.spec.ts) - expected `filesUploadV2` response shape
  - [SocketModeClient.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/socket-mode/src/SocketModeClient.ts) and [README.md](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/socket-mode/README.md) - app-token Socket Mode semantics
  - [common.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/request/common.ts), [openid.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/request/openid.ts), [conversations.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/request/conversations.ts), [AuthTestResponse.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/node-slack-sdk/packages/web-api/src/types/response/AuthTestResponse.ts)
- Official Slack docs:
  - https://docs.slack.dev/reference/methods/openid.connect.token/
  - https://docs.slack.dev/reference/methods/openid.connect.userInfo/
  - https://docs.slack.dev/reference/methods/oauth.v2.access/
  - https://docs.slack.dev/reference/methods/apps.connections.open/
  - https://docs.slack.dev/reference/methods/conversations.list/
  - https://docs.slack.dev/reference/methods/auth.test/
  - https://docs.slack.dev/authentication/tokens/

### Secondary (MEDIUM confidence)
- Vendored Bolt docs:
  - [actions.md](/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/docs/english/concepts/actions.md) - `respond()` semantics
  - [utilities.ts](/Users/futur/projects/sandpiper-dtu/third_party/upstream/bolt-js/src/types/utilities.ts) - `replace_original` / `delete_original` typing

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package versions are pinned locally and the relevant upstream SDK sources are vendored in-repo.
- Architecture: HIGH - the existing Slack twin already exposes the exact plugin/state seams this phase needs.
- Pitfalls: MEDIUM - the exact `auth.test` user-token body and mixed-type `conversations.list` scope failure semantics still have minor ambiguity without live verification.

**Research date:** 2026-03-14
**Valid until:** 2026-04-13
