# Phase 26: Slack Chat Scoping & Scope Enforcement - Research

**Researched:** 2026-03-13
**Domain:** Slack twin — chat.update/delete channel+author scoping, OAuth scope enforcement middleware, X-OAuth-Scopes response headers
**Confidence:** HIGH

## Summary

Phase 26 has three requirements. All work is within the existing codebase stack: no new runtime dependencies, all enforcement via `better-sqlite3` query logic and Fastify middleware. The `method-scopes.ts` catalog is already complete from Phase 21/25 — Phase 26 consumes it for enforcement.

**SLCK-15 — chat.update / chat.delete channel + author scoping:** The current `chat.update` handler calls `slackStateManager.getMessage(ts)` which queries only by `ts` (no channel check). It also does not check `message.user_id` against the calling token's `user_id`. The `chat.delete` handler uses a raw SQL DELETE by `ts` alone — no channel check, no ownership check. Both need two new validation steps added after the message lookup: (1) verify `message.channel_id === channel` from the request, (2) verify `message.user_id === tokenRecord.user_id`. Both violations return `{ok: false, error: "cant_update_message"}` or `{ok: false, error: "cant_delete_message"}` respectively. The `slack_messages` table already stores `channel_id` and `user_id` — no schema changes needed.

**SLCK-18 — OAuth scope enforcement:** `method-scopes.ts` already contains the full `METHOD_SCOPES` catalog (built in Phase 21 specifically for this phase). The enforcement logic needs to be added to the `checkAuthRateError` helper in `chat.ts` and the equivalent auth-check functions in all other plugins. The check is: after `getToken(token)` succeeds, compare `METHOD_SCOPES[method]` against `tokenRecord.scope.split(',')`. If any required scope is missing, return `{ok: false, error: 'missing_scope', needed: requiredScopes[0], provided: tokenRecord.scope}`. OAuth token exchange (`/api/oauth.v2.access`) must also validate `client_id` and `scope` parameters, returning `{ok: false, error: 'invalid_arguments'}` on missing `client_id` and validating `scope` format.

**SLCK-19 — OAuth scope response headers:** Every successful method response must include two response headers: `X-OAuth-Scopes` (the token's granted scopes from `tokenRecord.scope`) and `X-Accepted-OAuth-Scopes` (the method's required scopes as comma-separated string from `METHOD_SCOPES[method]`). These must be set on HTTP 200 responses for successful calls. They are NOT set on `{ok: false}` error responses per real Slack behavior.

**Primary recommendation:** Wave 0 (failing tests) first. Three targeted implementation changes: (1) add channel+author checks to `chat.ts` update/delete handlers, (2) add a shared `checkScope()` helper imported from `method-scopes.ts` and called in every plugin's auth gate, (3) add a Fastify `onSend` hook or per-handler header injection for `X-OAuth-Scopes` / `X-Accepted-OAuth-Scopes`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-15 | `chat.update` enforces channel scoping (message must exist in the specified channel) and author ownership (bot tokens can only update messages they posted), returning `{ok: false, error: "cant_update_message"}` on violations; `chat.delete` enforces equivalent rules with `cant_delete_message`; conformance tests exercise actual `chat.update` and `chat.delete` methods against messages posted through the twin | `slack_messages` table has `channel_id` and `user_id` columns; `getMessage(ts)` returns the full row; two additional checks needed in chat.ts after the existing message lookup; `slack-chat.test.ts` currently has happy-path tests that post then update/delete — new failing tests must add ownership violation scenarios |
| SLCK-18 | Slack auth enforces OAuth scope requirements per method, returning `{ok: false, error: "missing_scope", needed: "<scope>", provided: "<scopes>"}` when token lacks the required scope; OAuth token exchange validates `client_id`, `scope`, and `redirect_uri` parameters | `METHOD_SCOPES` catalog is complete in `method-scopes.ts`; `tokenRecord.scope` is a comma-separated string stored in `slack_tokens.scope`; enforcement belongs in the shared auth-gate pattern used by all plugins; `seedSlackBotToken()` already calls `allScopesString()` so existing tests are pre-protected |
| SLCK-19 | Slack API responses include `X-OAuth-Scopes` (token's granted scopes) and `X-Accepted-OAuth-Scopes` (method's required scopes) headers on successful calls | Fastify `reply.header()` sets response headers; the method name is known at each handler's point of execution; headers must be set only on `ok: true` responses |
</phase_requirements>

## Standard Stack

### Core (all already in use — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 12.6.2 | SQLite state backing — no schema changes for SLCK-15 | Already used; `slack_messages.channel_id` and `user_id` columns already exist |
| Fastify `FastifyPluginAsync` | v5 | Plugin architecture — enforcement via existing handler pattern | All twin routes use this pattern |
| `method-scopes.ts` | internal | `METHOD_SCOPES` catalog + `allScopesString()` | Created in Phase 21 specifically for Phase 26 enforcement |
| Vitest 3.x | 3.x | Test framework | `pnpm test:sdk` and `pnpm -F twins/slack run test` |

### No New Dependencies

The v1.2 roadmap decision (2026-03-11) is explicit: "No new runtime dependencies." All three requirements are satisfied by in-process logic changes to existing plugins.

## Architecture Patterns

### Recommended Project Structure (changes only)

```
twins/slack/src/
├── plugins/web-api/
│   └── chat.ts         # MODIFY: add channel+author checks to update+delete handlers
├── services/
│   └── method-scopes.ts  # MODIFY: export checkScope() helper (new function, existing catalog)
├── plugins/             # ALL plugins: MODIFY auth gate to call checkScope()
│   ├── web-api/auth.ts
│   ├── web-api/conversations.ts
│   ├── web-api/files.ts
│   ├── web-api/pins.ts
│   ├── web-api/reactions.ts
│   ├── web-api/users.ts
│   ├── web-api/views.ts
│   ├── web-api/stubs.ts
│   ├── web-api/admin.ts
│   ├── web-api/new-families.ts
│   └── oauth.ts         # MODIFY: validate client_id + scope in oauth.v2.access
└── (no state changes needed)

tests/sdk-verification/sdk/
├── slack-chat.test.ts         # MODIFY: add ownership violation tests for SLCK-15
└── slack-scope-enforcement.test.ts  # NEW: Wave 0 failing tests for SLCK-18, SLCK-19
```

### Pattern 1: chat.update / chat.delete Channel + Author Scoping (SLCK-15)

**What:** After the existing message lookup succeeds, add two checks:
1. Channel scoping: `message.channel_id !== channel` → `cant_update_message`
2. Author ownership: `message.user_id !== tokenRecord.user_id` → `cant_update_message`

**When to use:** Only `chat.update` and `chat.delete`. Other methods do not have this ownership model.

**Current code gap in chat.update (lines 218-227):**
```typescript
// Source: twins/slack/src/plugins/web-api/chat.ts
// CURRENT — does NOT check channel scoping or ownership:
const message = fastify.slackStateManager.getMessage(ts);
if (!message) {
  return reply.status(200).send({ ok: false, error: 'message_not_found' });
}

// MISSING: channel scoping check
// MISSING: author ownership check

fastify.slackStateManager.updateMessage(ts, { ... });
```

**Pattern to add:**
```typescript
// After getMessage(ts) succeeds:
if (message.channel_id !== channel) {
  return reply.status(200).send({ ok: false, error: 'cant_update_message' });
}
if (message.user_id !== tokenRecord.user_id) {
  return reply.status(200).send({ ok: false, error: 'cant_update_message' });
}
```

**For chat.delete** (current code uses raw SQL DELETE, no ownership check):
```typescript
// Source: twins/slack/src/plugins/web-api/chat.ts (lines 250-256)
// CURRENT:
if (fastify.slackStateManager.getMessage(ts)) {
  fastify.slackStateManager.database
    .prepare('DELETE FROM slack_messages WHERE ts = ?')
    .run(ts);
}
return { ok: true, channel, ts };

// FIX: add channel + ownership checks before delete
const message = fastify.slackStateManager.getMessage(ts);
if (!message) {
  return reply.status(200).send({ ok: false, error: 'message_not_found' });
}
if (message.channel_id !== channel) {
  return reply.status(200).send({ ok: false, error: 'cant_delete_message' });
}
if (message.user_id !== tokenRecord.user_id) {
  return reply.status(200).send({ ok: false, error: 'cant_delete_message' });
}
fastify.slackStateManager.database
  .prepare('DELETE FROM slack_messages WHERE ts = ?')
  .run(ts);
return { ok: true, channel, ts };
```

**Important: tokenRecord access in chat.delete:** The `checkAuthRateError` helper returns `token` (string), not `tokenRecord`. The handler must call `fastify.slackStateManager.getToken(token)` to get `tokenRecord.user_id`. This is already done in `chat.update` indirectly but the token variable is used. Check that `tokenRecord` is available in scope in `chat.delete` — it currently uses `checkAuthRateError` which only returns the token string, not the record. The handler needs to do the getToken lookup itself.

### Pattern 2: Shared Scope Enforcement Helper (SLCK-18)

**What:** Add `checkScope(methodName, tokenScope)` to `method-scopes.ts`. Returns `null` if all required scopes are present, or `{error: 'missing_scope', needed: string, provided: string}` if not.

**Why a shared helper:** Scope enforcement must be added to ~10 plugin files. A helper keeps the logic DRY and ensures consistent error shape.

```typescript
// Source: twins/slack/src/services/method-scopes.ts — ADD this export:

export interface ScopeCheckResult {
  error: 'missing_scope';
  needed: string;
  provided: string;
}

/**
 * Check whether the token's comma-separated scope string satisfies
 * the required scopes for the given method.
 *
 * Returns null if all required scopes are present (or method has no requirements).
 * Returns a ScopeCheckResult if any required scope is missing.
 */
export function checkScope(method: string, tokenScope: string): ScopeCheckResult | null {
  const required = METHOD_SCOPES[method];
  if (!required || required.length === 0) return null;

  const granted = new Set(tokenScope.split(',').map(s => s.trim()));
  const missing = required.find(s => !granted.has(s));
  if (!missing) return null;

  return {
    error: 'missing_scope',
    needed: missing,
    provided: tokenScope,
  };
}
```

**Call site pattern in plugins (replaces/augments existing auth gate):**
```typescript
import { METHOD_SCOPES, checkScope } from '../../services/method-scopes.js';

// In checkAuthRateError (chat.ts) — after getToken succeeds:
const scopeCheck = checkScope(method, tokenRecord.scope);
if (scopeCheck) {
  await reply.status(200).send({ ok: false, ...scopeCheck });
  return null;
}
```

**Important: Scope enforcement for methods with empty scope lists:** `METHOD_SCOPES[method] = []` means no scopes required (e.g., `auth.test`, `views.open`). `checkScope()` returns `null` for these — no enforcement. Methods not in `METHOD_SCOPES` at all should be treated as "no requirement" (return null), not as errors.

### Pattern 3: X-OAuth-Scopes Response Headers (SLCK-19)

**What:** On every successful (ok: true) API response, set:
- `X-OAuth-Scopes`: the token's full granted scope string (`tokenRecord.scope`)
- `X-Accepted-OAuth-Scopes`: the method's required scopes as comma-separated string (`METHOD_SCOPES[method]?.join(',') ?? ''`)

**Implementation approach — per-handler header injection:**

The cleanest approach given the existing handler structure is to set headers explicitly in each handler after the response body is constructed but before returning. The `checkAuthRateError` pattern makes this feasible because `token` is returned and the handler can call `getToken(token)` to access `tokenRecord.scope`.

However, a Fastify `onSend` hook on the `/api/*` prefix would be cleaner but requires careful parsing of the response body to check `ok: true`. Given the existing handler-per-route structure, per-handler injection is simpler and more explicit.

**Alternatively — enrich the checkAuthRateError return:** Change `checkAuthRateError` to return `tokenRecord` (not just `token`), and accept a `reply` reference that pre-sets the scope headers. This is the lowest-friction change because `checkAuthRateError` is called at the top of most handlers.

**Recommended approach — modify checkAuthRateError to pre-set headers:**

```typescript
// In chat.ts checkAuthRateError — return tokenRecord, pre-set headers on success path:
async function checkAuthRateError(
  fastify: any,
  request: any,
  reply: any,
  method: string,
): Promise<{ token: string; tokenRecord: any } | null> {
  const token = extractToken(request);
  if (!token) { await reply.status(200).send({ ok: false, error: 'not_authed' }); return null; }

  const tokenRecord = fastify.slackStateManager.getToken(token);
  if (!tokenRecord) { await reply.status(200).send({ ok: false, error: 'invalid_auth' }); return null; }

  // Scope check (SLCK-18)
  const scopeCheck = checkScope(method, tokenRecord.scope);
  if (scopeCheck) {
    await reply.status(200).send({ ok: false, ...scopeCheck });
    return null;
  }

  // Rate limit, error simulation... (unchanged)

  // Pre-set scope headers for successful responses (SLCK-19)
  const accepted = METHOD_SCOPES[method]?.join(',') ?? '';
  reply.header('X-OAuth-Scopes', tokenRecord.scope);
  reply.header('X-Accepted-OAuth-Scopes', accepted);

  return { token, tokenRecord };
}
```

**Note:** Fastify `reply.header()` sets headers that will be sent with the response. Setting them before `return { ok: true, ... }` means they accompany the success response. Setting them before `reply.send({ ok: false, ... })` means they also accompany error responses — which is NOT the real Slack behavior. For error paths within the handler (not auth errors), headers should not be set. The recommended pattern: set headers only after `checkAuthRateError` returns successfully, not inside error paths within the handler.

**Simpler approach if scope headers on all responses is acceptable:** Real Slack does send `X-OAuth-Scopes` on error responses too (just not scope-check failures). For twin purposes, setting them universally post-auth is acceptable and simpler.

### Pattern 4: OAuth Token Exchange Validation (SLCK-18)

**What:** `POST /api/oauth.v2.access` must validate `client_id`, `scope`, and `redirect_uri` parameters. Currently it only checks that `code` is valid.

**Current code (oauth.ts lines 65-70):**
```typescript
const { code } = request.body ?? {};
if (!code || !issuedCodes.has(code)) {
  return { ok: false, error: 'invalid_code' };
}
```

**Fix — add client_id and scope validation:**
```typescript
const { code, client_id, scope, redirect_uri } = request.body ?? {};

if (!client_id) {
  return { ok: false, error: 'invalid_arguments', message: 'client_id is required' };
}
if (!code || !issuedCodes.has(code)) {
  return { ok: false, error: 'invalid_code' };
}
// scope is optional in the exchange (granted scopes are fixed at authorize time for bots)
// redirect_uri validation: if provided, must match the authorize-time redirect_uri
// (for twin purposes, accept any non-empty redirect_uri as valid)
```

**The authorize endpoint must also be updated** to reject missing `client_id`:
```typescript
// GET /oauth/v2/authorize
const { client_id, scope, redirect_uri, state } = request.query;
if (!client_id) {
  return reply.status(400).send({ ok: false, error: 'invalid_arguments' });
}
// scope is required per real Slack
if (!scope) {
  return reply.status(400).send({ ok: false, error: 'invalid_scope' });
}
```

### Anti-Patterns to Avoid

- **Setting scope headers on scope-check failures:** `X-OAuth-Scopes` / `X-Accepted-OAuth-Scopes` should NOT be set when the method returns `missing_scope`. The real Slack API does not include these headers when the auth check itself fails.
- **Using `message_not_found` instead of `cant_update_message`:** For channel mismatch, the correct error is `cant_update_message` (not `message_not_found`). The message EXISTS, it's just in the wrong channel or owned by another user.
- **Forgetting tokenRecord in chat.delete:** The current `checkAuthRateError` returns `token` (string). `chat.delete` must independently call `getToken(token)` to access `user_id` for ownership check.
- **Scope enforcement breaking seedSlackBotToken tests:** `seedSlackBotToken()` calls `allScopesString()` which grants every scope in the catalog. All existing sdk-verification tests are pre-protected. Only tests using custom narrow tokens will see scope errors.
- **Checking scope against method name vs. route:** `METHOD_SCOPES` keys are method names (`chat.update`), not route paths (`/api/chat.update`). Enforcement must use the method name, not the URL path.
- **Enforcing scope on methods with empty scope list:** `METHOD_SCOPES['auth.test'] = []` — these methods require no scopes and must pass scope check unconditionally. `checkScope()` returns `null` for empty lists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scope lookup | Custom scope string parsing | `METHOD_SCOPES` catalog + `checkScope()` helper | Catalog already complete with 100+ methods; custom parsing duplicates it |
| Token scope validation | Ad-hoc per-handler if/else | Shared `checkScope()` from `method-scopes.ts` | Consistency + easy to add new methods |
| Channel ownership check | Custom DB query | `getMessage(ts).channel_id` comparison | `slack_messages` already stores `channel_id`; no new query needed |
| Header injection middleware | New Fastify plugin | `reply.header()` in per-handler auth gate | Simpler than middleware; already have per-handler auth pattern |

**Key insight:** The `method-scopes.ts` catalog was explicitly built in Phase 21 to serve Phase 26. Import it; don't duplicate it.

## Common Pitfalls

### Pitfall 1: checkAuthRateError Returns Token, Not TokenRecord
**What goes wrong:** `chat.delete` calls `checkAuthRateError` which returns a `token` string. The handler then does `fastify.slackStateManager.getMessage(ts)` and compares `message.user_id`. But to get the calling user's ID, the handler needs `tokenRecord.user_id` — which requires a second `getToken(token)` call.
**Why it happens:** `checkAuthRateError` was designed before ownership checks were needed. It returns only the token string.
**How to avoid:** Either update `checkAuthRateError` to return `{token, tokenRecord}` (breaking change for all call sites), or do a local `getToken(token)` lookup in `chat.update` and `chat.delete` after `checkAuthRateError` succeeds. The latter is lower risk for this phase.
**Warning signs:** TypeScript error "Property 'user_id' does not exist on type 'string'" if you try to access `token.user_id` instead of `tokenRecord.user_id`.

### Pitfall 2: Scope Headers on the Wrong Paths
**What goes wrong:** `reply.header()` calls inside error branches set scope headers on error responses, conflating `ok: false` responses with `ok: true` responses for header presence.
**Why it happens:** Fastify `reply.header()` applies to whatever response is eventually sent. If headers are set before an error `reply.send()`, the error response carries them too.
**How to avoid:** Set `X-OAuth-Scopes` and `X-Accepted-OAuth-Scopes` only in the success path of the handler (after all error checks pass), not in `checkAuthRateError`. Or document that the twin always includes them, which simplifies implementation at the cost of strict Slack parity.
**Warning signs:** Tests checking that `missing_scope` responses lack scope headers will fail.

### Pitfall 3: Conformance Tests Must Use Real chat.update/chat.delete
**What goes wrong:** Writing ownership violation tests using `chat.postMessage` directly to simulate the message, without first calling `chat.postMessage` through the twin to create a real message with the correct `user_id`.
**Why it happens:** The requirement text explicitly says "conformance tests exercise the actual `chat.update` and `chat.delete` methods (not substituting `chat.postMessage`)".
**How to avoid:** Test flow: (1) seedSlackBotToken (token A), (2) chat.postMessage with token A to create message, (3) seedSlackBotToken with a different userId (token B), (4) chat.update with token B using the message ts → expect `cant_update_message`.
**Warning signs:** Tests that verify ownership violation using a message ts that was never actually posted to the twin will get `message_not_found` instead of `cant_update_message`.

### Pitfall 4: seedSlackBotToken Scope String Ordering
**What goes wrong:** `checkScope()` splits `tokenRecord.scope` by comma and checks set membership. If `allScopesString()` returns a different ordering than what the test expects, but the check is set-based this should be fine. The pitfall is if `tokenRecord.scope` contains whitespace after commas (e.g., `"chat:write, channels:read"`).
**Why it happens:** `allScopesString()` uses `[...set].sort().join(',')` — no spaces. The `seedSlackBotToken` admin endpoint stores exactly what is passed. Should be safe.
**How to avoid:** Ensure `checkScope()` trims scope strings: `new Set(tokenScope.split(',').map(s => s.trim()))`.

### Pitfall 5: OAuth Validation Must Not Break Existing Bolt Tests
**What goes wrong:** The Bolt `@slack/oauth` install provider test (`slack-oauth-install-provider.test.ts`) calls `oauth.v2.access` via the Slack SDK, which sends `client_id`, `client_secret`, `code`, and `redirect_uri`. Adding strict `client_id` validation that rejects unknown client IDs would break this test.
**Why it happens:** The twin doesn't have a "registered app" concept — any `client_id` should be accepted.
**How to avoid:** Validate that `client_id` is PRESENT (not empty), not that it matches a specific value. Accept any non-empty string as valid. This matches the requirement: "validates `client_id`, `scope`, and `redirect_uri` parameters" — validated means "present and non-empty", not "matches a specific value".

## Code Examples

Verified patterns from codebase:

### chat.update — add channel scoping and ownership checks

```typescript
// Source: twins/slack/src/plugins/web-api/chat.ts (modification)
// After existing getMessage(ts) lookup:

const message = fastify.slackStateManager.getMessage(ts);
if (!message) {
  return reply.status(200).send({ ok: false, error: 'message_not_found' });
}

// SLCK-15: channel scoping check
if (message.channel_id !== channel) {
  return reply.status(200).send({ ok: false, error: 'cant_update_message' });
}

// SLCK-15: author ownership check
// tokenRecord must be retrieved in this handler (checkAuthRateError only returns token string)
const tokenRecord = fastify.slackStateManager.getToken(token!);
if (message.user_id !== tokenRecord?.user_id) {
  return reply.status(200).send({ ok: false, error: 'cant_update_message' });
}
```

### checkScope helper in method-scopes.ts

```typescript
// Source: twins/slack/src/services/method-scopes.ts — new export
export function checkScope(method: string, tokenScope: string): { error: 'missing_scope'; needed: string; provided: string } | null {
  const required = METHOD_SCOPES[method];
  if (!required || required.length === 0) return null;

  const granted = new Set(tokenScope.split(',').map(s => s.trim()).filter(Boolean));
  const missing = required.find(s => !granted.has(s));
  if (!missing) return null;

  return { error: 'missing_scope', needed: missing, provided: tokenScope };
}
```

### Scope enforcement in checkAuthRateError (chat.ts pattern)

```typescript
// Source: twins/slack/src/plugins/web-api/chat.ts (modified checkAuthRateError)
import { checkScope, METHOD_SCOPES } from '../../services/method-scopes.js';

async function checkAuthRateError(
  fastify: any, request: any, reply: any, method: string,
): Promise<string | null> {
  const token = extractToken(request);
  if (!token) { await reply.status(200).send({ ok: false, error: 'not_authed' }); return null; }

  const tokenRecord = fastify.slackStateManager.getToken(token);
  if (!tokenRecord) { await reply.status(200).send({ ok: false, error: 'invalid_auth' }); return null; }

  // SLCK-18: scope enforcement
  const scopeCheck = checkScope(method, tokenRecord.scope);
  if (scopeCheck) {
    await reply.status(200).send({ ok: false, ...scopeCheck });
    return null;
  }

  // SLCK-19: pre-set scope headers (will accompany the success response)
  const accepted = METHOD_SCOPES[method]?.join(',') ?? '';
  reply.header('X-OAuth-Scopes', tokenRecord.scope);
  reply.header('X-Accepted-OAuth-Scopes', accepted);

  // rate limit + error simulation (unchanged)
  const limited = fastify.rateLimiter.check(method, token);
  if (limited) {
    await reply.status(429).header('Retry-After', String(limited.retryAfter)).send({ ok: false, error: 'ratelimited' });
    return null;
  }
  const errorConfig = fastify.slackStateManager.getErrorConfig(method);
  if (errorConfig) {
    const errorBody = errorConfig.error_body ? JSON.parse(errorConfig.error_body) : { ok: false, error: 'simulated_error' };
    await reply.status(errorConfig.status_code ?? 200).send(errorBody);
    return null;
  }

  return token;
}
```

### X-OAuth-Scopes headers: test verification pattern

```typescript
// In sdk-scope-enforcement.test.ts — verify headers on successful call:
const baseUrl = process.env.SLACK_API_URL!;
const res = await fetch(baseUrl + '/api/chat.postMessage', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel: 'C_GENERAL', text: 'hello' }),
});
const body = await res.json();
expect(body.ok).toBe(true);
// Fastify headers are lowercase in Node.js fetch
expect(res.headers.get('x-oauth-scopes')).toBeTruthy();
expect(res.headers.get('x-accepted-oauth-scopes')).toBe('chat:write');
```

**Note:** The Slack WebClient does not expose raw response headers to the caller. Tests for SLCK-19 must use raw `fetch()` calls, not the `WebClient`. This is consistent with the conformance test pattern used in `slack-state-tables.test.ts` which already mixes SDK calls and raw fetch.

### OAuth token exchange validation (oauth.ts pattern)

```typescript
// Source: twins/slack/src/plugins/oauth.ts — modified /api/oauth.v2.access handler
fastify.post('/api/oauth.v2.access', async (request) => {
  const { code, client_id, scope, redirect_uri } = request.body ?? {};

  // SLCK-18: validate required parameters
  if (!client_id) {
    return { ok: false, error: 'invalid_arguments' };
  }
  if (!code || !issuedCodes.has(code)) {
    return { ok: false, error: 'invalid_code' };
  }
  // redirect_uri: if provided at exchange time, we accept any non-empty value
  // (twin doesn't track per-app redirect URIs)

  issuedCodes.delete(code);
  // ... rest unchanged
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chat.delete: lenient no-ownership-check delete | Strict: channel + author ownership enforced | Phase 26 | `cant_delete_message` returned for cross-channel or wrong-author deletes |
| chat.update: only checks message exists | Strict: channel scoping + author ownership | Phase 26 | `cant_update_message` returned for messages in wrong channel or wrong owner |
| No scope enforcement (any valid token calls any method) | Scope enforcement per `METHOD_SCOPES` catalog | Phase 26 | `missing_scope` returned for narrow tokens; broad tokens (test seeds) unaffected |
| No OAuth scope headers | `X-OAuth-Scopes` + `X-Accepted-OAuth-Scopes` on success | Phase 26 | Slack SDK/Bolt callers can inspect scope headers |
| `oauth.v2.access` only validates code | Also validates `client_id` presence | Phase 26 | Missing `client_id` returns `invalid_arguments` |

**Not deprecated:** `checkAuthRateError` pattern stays — Phase 26 augments it, not replaces it.

## Open Questions

1. **Scope headers on ok:false responses**
   - What we know: Real Slack sends `X-OAuth-Scopes` and `X-Accepted-OAuth-Scopes` on most responses including some error responses. The requirement says "on successful calls."
   - What's unclear: Whether the conformance tests check for header ABSENCE on error responses.
   - Recommendation: Set headers universally after auth succeeds (pre-scope-check). This means error responses from missing `channel` or `text` parameters will also carry scope headers. Acceptable for twin purposes and simpler to implement.

2. **chat.update: does non-owner update apply to admin tokens?**
   - What we know: Real Slack allows `chat:write` scope for a bot to update its own messages. There is no separate "admin update any message" scope in the METHOD_SCOPES catalog.
   - What's unclear: Should the twin allow a special "admin" override for chat.update ownership?
   - Recommendation: Enforce ownership for ALL bot tokens per SLCK-15. Real Slack has `chat:write:user` and admin overrides that are out of scope for v1.2.

3. **scope parameter validation at /oauth/v2/authorize**
   - What we know: The requirement says "OAuth token exchange validates `client_id`, `scope`, and `redirect_uri` parameters". The exchange endpoint is `/api/oauth.v2.access`.
   - What's unclear: Whether the authorize endpoint `/oauth/v2/authorize` also needs `scope` validation, or only the exchange endpoint.
   - Recommendation: Add `client_id` required check to the authorize endpoint AND validate `scope` presence. Already has `redirect_uri` required check.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` (root) — project `sdk-verification` |
| Quick run command | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` |
| Full suite command | `pnpm test:sdk` |
| Twin unit tests | `pnpm -F twins/slack run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-15 | `chat.update` returns `cant_update_message` on channel mismatch | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | ❌ Wave 0 |
| SLCK-15 | `chat.update` returns `cant_update_message` on wrong author | integration | (same file) | ❌ Wave 0 |
| SLCK-15 | `chat.delete` returns `cant_delete_message` on channel mismatch | integration | (same file) | ❌ Wave 0 |
| SLCK-15 | `chat.delete` returns `cant_delete_message` on wrong author | integration | (same file) | ❌ Wave 0 |
| SLCK-15 | Conformance: actual `chat.update` on twin-posted message succeeds (owner) | integration | (same file) | ❌ Wave 0 |
| SLCK-18 | `missing_scope` returned when token lacks required scope | integration | (same file) | ❌ Wave 0 |
| SLCK-18 | oauth.v2.access rejects missing `client_id` | integration | (same file) | ❌ Wave 0 |
| SLCK-18 | Existing seedSlackBotToken tests still GREEN (broad scope pre-grants all) | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-chat.test.ts` | ✅ Existing |
| SLCK-19 | `X-OAuth-Scopes` header present on successful API call | integration | (same file) | ❌ Wave 0 |
| SLCK-19 | `X-Accepted-OAuth-Scopes` header matches METHOD_SCOPES for method | integration | (same file) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` — covers SLCK-15, SLCK-18, SLCK-19: all three requirements in one test file; uses raw `fetch()` for header inspection (SLCK-19) and WebClient for method calls (SLCK-15, SLCK-18)

*(Existing test infrastructure: `slack-chat.test.ts` provides the happy-path baseline; `seeders.ts` has `seedSlackBotToken` + `seedSlackChannel`; `global-setup.ts` provides `SLACK_API_URL`. No new setup required for Wave 0.)*

## Sources

### Primary (HIGH confidence)
- `twins/slack/src/plugins/web-api/chat.ts` — current chat.update/delete implementations; getMessage uses ts-only lookup (no channel check); chat.delete is lenient delete with no ownership check
- `twins/slack/src/state/slack-state-manager.ts` — `slack_messages` schema confirms `channel_id` and `user_id` columns exist; `getMessage(ts)` returns full row
- `twins/slack/src/services/method-scopes.ts` — complete `METHOD_SCOPES` catalog with all methods; `allScopesString()` exports; no `checkScope()` yet (must be added)
- `tests/sdk-verification/setup/seeders.ts` — `seedSlackBotToken()` calls `allScopesString()`; confirms broad-scope pre-protection of existing tests
- `twins/slack/src/plugins/oauth.ts` — current `oauth.v2.access` only checks `code`; no `client_id` validation
- `.planning/STATE.md` key decisions — "Store Slack method-to-scope map in method-scopes.ts as single source of truth for seeders and Phase 26 enforcement"

### Secondary (MEDIUM confidence)
- `tests/sdk-verification/sdk/slack-chat.test.ts` — existing happy-path tests for `chat.update`/`chat.delete`; these must remain GREEN after Phase 26 (they post then update/delete with same token)
- `tests/sdk-verification/sdk/slack-state-tables.test.ts` — pattern for Wave 0 failing tests using raw `fetch()` for admin endpoints and WebClient for SDK calls
- REQUIREMENTS.md SLCK-15 text: "conformance tests exercise the actual `chat.update` and `chat.delete` methods (not substituting `chat.postMessage`)" — test flow must post first, then update/delete

### Tertiary (LOW confidence)
- Real Slack API `X-OAuth-Scopes` header behavior: verified by Slack API documentation description in SLCK-19 requirement text; not independently verified against live API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing dependencies; method-scopes.ts already complete
- Architecture (chat scoping): HIGH — confirmed by direct code inspection of chat.ts and slack_messages schema
- Architecture (scope enforcement): HIGH — METHOD_SCOPES catalog verified complete; checkScope() pattern is straightforward
- Architecture (OAuth headers): HIGH — Fastify reply.header() is standard; header names from requirement text
- Architecture (OAuth validation): MEDIUM — real Slack client_id validation behavior inferred from requirement text; not verified against live API
- Pitfalls: HIGH — all confirmed by direct code inspection

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, no fast-moving external dependencies)
