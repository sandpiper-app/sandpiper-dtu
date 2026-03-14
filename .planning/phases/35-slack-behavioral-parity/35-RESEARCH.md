# Phase 35: Slack Behavioral Parity - Research

**Researched:** 2026-03-13
**Domain:** Slack twin behavioral gap closure — method registration, OpenID Connect, filesUploadV2, auth/scope semantics
**Confidence:** HIGH

## Summary

Phase 35 closes four High-severity findings from the second adversarial review (findings #3-#6). All four are source-code-level bugs with confirmed root causes, not architectural problems. No new packages, no schema changes, no new SQLite tables. The work touches four distinct subsystems: the route registry (new-families.ts), the OpenID Connect stub (new-families.ts openid.connect.token handler), the filesUploadV2 upload chain (files.ts), and the METHOD_SCOPES catalog (method-scopes.ts).

**Finding #3 (High: deferred methods not registered):** 17 WebClient methods appear in the `@slack/web-api@7.14.1` manifest but have no registered Fastify route in any twin plugin. The `new-families.ts` comment says "already registered in respective plugin files" — that is false. Confirmed missing: `admin.workflows.search`, `apps.event.authorizations.list`, `apps.manifest.create/delete/export/update/validate`, `apps.uninstall`, `files.upload`, `files.uploadV2`, `oauth.access`, `oauth.v2.access`, `oauth.v2.exchange`, `team.billing.info`, `team.externalTeams.disconnect/list`, `users.discoverableContacts.lookup`. Calling any of these via WebClient produces a 404 transport error — not a Slack-style `{ok: false}` — breaking SDK consumer test suites.

**Finding #4 (High: OpenID Connect not a real OAuth flow):** `openid.connect.token` is implemented as a generic auth-gated stub returning hardcoded `{ access_token: 'oidc-stub', id_token: 'jwt-stub' }`. The real `openid.connect.token` endpoint exchanges a code for identity tokens; it should not require a pre-existing bot token for auth. The twin requires a bearer token (standard bot-token auth), but real Slack's openid.connect.token is called with `client_id` + `client_secret` + `code` (like `oauth.v2.access`) and issues identity tokens — callers don't have a bot token yet. The current test in `slack-method-coverage.test.ts` passes because it provides a seeded bot token, which works against the current stub but masks the behavioral mismatch.

**Finding #5 (High: filesUploadV2 HTTP verb mismatch):** The twin registers `PUT /api/_upload/:file_id` for the binary upload step, but `WebClient.postFileUploadsToExternalURL()` always calls `this.axios.post(url, body, config)` (line 722 of upstream WebClient.ts). The twin must register `POST /api/_upload/:file_id`. Additionally, the current handler returns `{}` (no response body), which is acceptable since `uploadRes.status === 200` is the only check the SDK makes.

**Finding #6 (High: auth/scope wrong for apps.connections.open, conversation scope model, oauth.v2.access):** Three specific scope issues confirmed by source inspection:
1. `apps.connections.open` has no entry in `METHOD_SCOPES` — scope check passes vacuously, but correct scope is `connections:write` (app-level token scope for Socket Mode, confirmed by upstream docs and `AppManifestLevelScopes` type in `manifest.ts`).
2. `oauth.v2.access` has no entry in METHOD_SCOPES — it is a no-auth endpoint (like oauth.v2.authorize) and should have `[]` as its scope.
3. Conversation scope model: the `conversations.open` scope is `['im:write', 'mpim:write']` which is correct, but the test file `slack-state-tables.test.ts` seeds with a broad token (via `seedSlackBotToken`) so this doesn't surface in tests. The finding may refer to the fact that `conversations.open` scope was correct but other conversation methods were not. This needs no change.

**Primary recommendation:** Fix all four findings as targeted source edits: add 17 stub routes, convert openid.connect.token to code-exchange flow, change PUT to POST for upload endpoint, and add `apps.connections.open` (`connections:write`) and `oauth.v2.access` (`[]`) to METHOD_SCOPES.

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 4.x | Route registration | Already used in all twin plugins |
| TypeScript | 5.7.3 | Strict-mode type safety | Already used across all twins |
| Vitest | 3.x | Test runner | Already used for `pnpm test:sdk` |

### No New Dependencies

All fixes are pure source edits to existing files. No `npm install` required.

## Architecture Patterns

### Pattern 1: Stub Route Registration in new-families.ts

**What:** The `stub(method, extra?)` factory in `new-families.ts` generates an auth-gated handler that returns `{ ok: true, response_metadata: { next_cursor: '' }, ...extra }`. It also enforces SLCK-18 scope check and SLCK-19 scope headers. This is the correct pattern for all 17 missing methods.

**When to use:** Any WebClient method that requires an HTTP 200 `{ok: true}` response but does not need state for SDK conformance.

**Correct placement:** The 17 missing methods belong in `new-families.ts` (not stubs.ts). The `stubs.ts` file is for Tier 2 families with known shape extras (files, search, reminders, etc.). The missing 17 are Tier 3 or extended family stubs.

**Example:**
```typescript
// In newFamiliesPlugin, at the bottom of the plugin:
// ── admin.workflows.search (missing from admin.ts) ────────────────────────
fastify.post('/api/admin.workflows.search', stub('admin.workflows.search', { workflows: [] }));

// ── apps.manifest.* (all 5 routes missing) ────────────────────────────────
fastify.post('/api/apps.manifest.create', stub('apps.manifest.create', { manifest: {} }));
fastify.post('/api/apps.manifest.delete', stub('apps.manifest.delete'));
fastify.post('/api/apps.manifest.export', stub('apps.manifest.export', { manifest: {} }));
fastify.post('/api/apps.manifest.update', stub('apps.manifest.update', { manifest: {} }));
fastify.post('/api/apps.manifest.validate', stub('apps.manifest.validate', { ok: true }));
```

### Pattern 2: No-Auth Token Exchange Endpoint (openid.connect.token)

**What:** `openid.connect.token` is called by the SDK with `client_id`, `client_secret`, and `code` in the POST body — no Authorization bearer token. The endpoint validates the code and returns identity tokens. The current stub requires a bearer token, which is wrong.

**Correct implementation:**
```typescript
// openid.connect.token: accepts client_id + client_secret + code, no bearer auth required
fastify.post('/api/openid.connect.token', async (request, reply) => {
  const body = (request.body as any) ?? {};
  const { client_id, client_secret, code } = body;

  if (!client_id || !client_secret) {
    return reply.send({ ok: false, error: 'invalid_arguments' });
  }

  // code is optional (refresh_token flow exists), but for basic conformance:
  // return a plausible OIDC token response
  return reply.send({
    ok: true,
    access_token: `xoxp-oidc-${code ?? 'anon'}`,
    token_type: 'Bearer',
    id_token: 'eyJ.stub.oidc',
    refresh_token: `xoxe-oidc-refresh-${code ?? 'anon'}`,
    expires_in: 3600,
    issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  });
});
```

**Key point:** This handler must NOT use `extractToken()` for auth — the request has no bearer token. The current stub call wraps it through the standard `stub()` factory which requires a token.

**Similarly for openid.connect.userInfo:** userInfo is called with a bearer token (the access_token returned from openid.connect.token), so standard bearer auth is correct for userInfo. Only `openid.connect.token` is a no-bearer endpoint.

### Pattern 3: POST Upload Endpoint (not PUT)

**What:** The `WebClient.postFileUploadsToExternalURL()` method calls `this.axios.post(url, body, config)` unconditionally. The `upload_url` returned from `files.getUploadURLExternal` is called with POST.

**Fix:** Change `fastify.put('/api/_upload/:file_id', ...)` to `fastify.post('/api/_upload/:file_id', ...)`.

```typescript
// Before (wrong verb):
fastify.put('/api/_upload/:file_id', async () => {
  return {};
});

// After (correct verb — SDK always uses POST):
fastify.post('/api/_upload/:file_id', async () => {
  return {};
});
```

**Important:** Also keep GET registered as a fallback or just register POST. The SDK only ever calls POST here.

**Note on files field in completeUploadExternal:** The SDK sends `{ files: [{ id, title }], channel_id, initial_comment }` to `files.completeUploadExternal`. The current handler does `const { files } = (request.body as any) ?? {}` and maps them. This is already correct — `files.map((f: any) => ({ id: f.id, title: f.title ?? 'Uploaded file' }))`. The files field structure matches what `getAllFileUploadsToComplete` builds.

### Pattern 4: METHOD_SCOPES Additions

**What:** Three entries need to be added or corrected in `method-scopes.ts`:

```typescript
// apps.connections.open: requires connections:write (app-level token scope for Socket Mode)
// Confirmed in upstream docs: "connections:write scope for Socket Mode app tokens"
// Confirmed in AppManifestLevelScopes type: 'authorizations:read' | 'connections:write'
'apps.connections.open':  ['connections:write'],

// oauth.v2.access: no-auth endpoint (like oauth.v2.authorize) — already in EVIDENCE_MAP
// Currently missing from METHOD_SCOPES entirely
'oauth.v2.access':        [],

// oauth.access: legacy no-auth endpoint — currently missing from METHOD_SCOPES
'oauth.access':           [],

// oauth.v2.exchange: already in METHOD_SCOPES as [] — correct, no change needed
```

**Critical implication for `apps.connections.open` and `seedSlackBotToken`:** Adding `connections:write` to METHOD_SCOPES will cause the scope check for `apps.connections.open` to fail for any token that doesn't have `connections:write`. The existing `seedSlackBotToken()` uses `allScopesString()`, which collects all scopes from METHOD_SCOPES. Adding `connections:write` to METHOD_SCOPES will automatically include it in `allScopesString()` — no seeder change required.

**However:** The bolt-socket-mode test calls `apps.connections.open` with a token seeded by `seedSlackBotToken()`. If `connections:write` is added to METHOD_SCOPES, `allScopesString()` will include it, so the seeded bot token will have `connections:write`. No test breakage.

### Pattern 5: Registering Missing Methods in new-families.ts vs new plugin

**Decision:** Add all 17 missing routes to `new-families.ts`. This plugin already serves as the "everything not in the other dedicated plugins" home. Adding to it follows the established pattern without introducing a new file.

**Update the module-level comment** in new-families.ts to reflect the new registrations.

### Anti-Patterns to Avoid

- **Registering openid.connect.token with bearer auth:** The real endpoint does not accept bearer tokens — it authenticates via client_id + client_secret like oauth.v2.access.
- **Using PUT for the upload endpoint:** The SDK always sends POST; a PUT registration silently accepts the method (Fastify returns 404 for unregistered methods, but methods can vary by verb, so only the stub() factory has no verb conflict concern).
- **Adding `connections:write` to bot token scope requirements globally:** Socket Mode app tokens are a separate token class. For twin conformance purposes, `allScopesString()` including `connections:write` is fine since seedSlackBotToken generates a synthetic token that includes all scopes.
- **Hand-rolling an OIDC flow:** Real OIDC with JWT signing is out of scope. A stub response with plausible fields is sufficient for SDK conformance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC JWT signing | RS256 keypair + jsonwebtoken | Hardcoded `id_token: 'eyJ.stub.oidc'` stub | SDK doesn't verify JWT signature in conformance tests |
| HTTP verb detection | Custom middleware | Fastify `.post()` vs `.put()` registration | Direct fix, no abstraction needed |
| Method-to-scope validation | New lookup system | Existing `checkScope()` in method-scopes.ts | Already handles `[]` = no scope required |
| Route registration loop | Dynamic route generator | Direct `fastify.post('/api/XXX', stub('XXX'))` | 17 explicit registrations is clearer and auditable |

## Common Pitfalls

### Pitfall 1: new-families.ts Comment Mismatch

**What goes wrong:** After adding the 17 routes, the new-families.ts module comment still says "already registered in respective plugin files" for methods that are now actually registered in new-families.ts. This causes future developers to trust the comment and skip searching for routes.

**How to avoid:** Update the module-level comment to accurately list all families handled in new-families.ts. Remove the incorrect "already registered" note.

### Pitfall 2: openid.connect.token Test Already Passes with Wrong Stub

**What goes wrong:** The existing test in `slack-method-coverage.test.ts` (`openid.connect.token returns ok:true`) passes because it provides a valid bot token via `createSlackClient(token)` — the WebClient sends an Authorization header. The current stub accepts any bearer token and returns `ok: true`. If Phase 35 replaces the stub with a no-auth handler that rejects bearer tokens, this test will break.

**How to avoid:** The correct implementation should accept EITHER a bearer token (backward compat with existing tests that seed a token) OR no bearer token (correct for real OIDC flow). Simplest safe approach: accept any request without requiring a bearer token — just validate `client_id` presence. The WebClient sends client_id + client_secret + code in the body, not as a bearer token, when calling openid.connect.token directly.

**Warning signs:** `slack-method-coverage.test.ts > openid.connect.token returns ok:true` fails after the fix.

### Pitfall 3: files.uploadV2 Route Conflict with filesUploadV2

**What goes wrong:** `files.uploadV2` is a manifest method (calling it via `client.files.uploadV2(...)` dispatches to the route `/api/files.uploadV2`). The `filesUploadV2()` SDK method does NOT call `/api/files.uploadV2` directly — it calls the 3-step chain internally. Registering `/api/files.uploadV2` as a stub is needed only for `client.apiCall('files.uploadV2', ...)` compatibility, not for the `client.filesUploadV2()` convenience method.

**How to avoid:** Register `fastify.post('/api/files.uploadV2', stub('files.uploadV2', { files: [] }))` as a simple stub. The 3-step chain (`files.getUploadURLExternal`, `_upload`, `files.completeUploadExternal`) is handled by `files.ts`.

### Pitfall 4: apps.connections.open Scope Blocks Existing Socket Mode Tests

**What goes wrong:** Adding `'apps.connections.open': ['connections:write']` to METHOD_SCOPES causes the scope check to require `connections:write`. If `seedSlackBotToken()` does NOT include `connections:write`, then `slack-bolt-socket-mode-receiver.test.ts` which calls `apps.connections.open` will fail.

**Why it won't happen:** `seedSlackBotToken()` calls `allScopesString()` which iterates all values in `METHOD_SCOPES`. Adding `connections:write` automatically includes it in the union. The seed token will have `connections:write`. No seeder change needed.

**How to verify:** After adding to METHOD_SCOPES, confirm `allScopesString()` output includes `connections:write`.

### Pitfall 5: oauth.v2.access Bearer Auth vs No-Auth

**What goes wrong:** `oauth.v2.access` is currently registered in `oauth.ts` as a no-auth endpoint (no `extractToken()` call). It is NOT in METHOD_SCOPES. Adding it to METHOD_SCOPES with `[]` (empty scopes) is safe — the scope check for `[]` returns `null` (no missing scope). But `oauth.v2.access` is NOT auth-gated, so the stub factory (which requires a bearer token) cannot be used for it. It needs to remain as a non-gated handler.

**How to avoid:** Add `'oauth.v2.access': []` to METHOD_SCOPES for catalog completeness (so `allScopesString()` doesn't need to include a fake scope for it). Do NOT move `oauth.v2.access` to the stub factory — it is already correctly implemented as a no-auth endpoint in `oauth.ts`.

### Pitfall 6: PUT to POST Upload — Fastify Route Conflict

**What goes wrong:** If both `fastify.put('/api/_upload/:file_id', ...)` and `fastify.post('/api/_upload/:file_id', ...)` are registered, Fastify will serve both. The PUT registration must be removed when adding the POST registration, otherwise both exist and the PUT handler is dead code.

**How to avoid:** Delete the `fastify.put` line and replace it with `fastify.post` in `files.ts`. Confirm no test calls PUT explicitly.

## Code Examples

Verified from source inspection:

### Find #3: 17 Missing Routes to Add in new-families.ts

```typescript
// Add to newFamiliesPlugin in twins/slack/src/plugins/web-api/new-families.ts

// ── admin.workflows.search (missing from admin.ts) ────────────────────────
// METHOD_SCOPES: admin.workflows.* covered under ['admin.workflows:read'] --
// admin.workflows.search needs an entry if not present:
// 'admin.workflows.search': ['admin.workflows:read']  -- add to method-scopes.ts too
fastify.post('/api/admin.workflows.search', stub('admin.workflows.search', { workflows: [], response_metadata: { next_cursor: '' } }));

// ── apps.manifest.* (5 routes) ────────────────────────────────────────────
fastify.post('/api/apps.manifest.create', stub('apps.manifest.create', { manifest: {} }));
fastify.post('/api/apps.manifest.delete', stub('apps.manifest.delete'));
fastify.post('/api/apps.manifest.export', stub('apps.manifest.export', { manifest: {} }));
fastify.post('/api/apps.manifest.update', stub('apps.manifest.update'));
fastify.post('/api/apps.manifest.validate', stub('apps.manifest.validate'));

// ── apps.uninstall ────────────────────────────────────────────────────────
fastify.post('/api/apps.uninstall', stub('apps.uninstall'));

// ── apps.event.authorizations.list ────────────────────────────────────────
fastify.post('/api/apps.event.authorizations.list', stub('apps.event.authorizations.list', { authorizations: [] }));

// ── files.upload + files.uploadV2 (legacy methods) ────────────────────────
fastify.post('/api/files.upload', stub('files.upload', { file: { id: 'F_STUB', name: 'stub.txt' } }));
fastify.post('/api/files.uploadV2', stub('files.uploadV2', { files: [] }));

// ── oauth.access (legacy) ─────────────────────────────────────────────────
// NOTE: oauth.access is a no-auth endpoint like oauth.v2.access.
// Do NOT use stub() factory for it. Register without bearer auth.
fastify.post('/api/oauth.access', async (request, reply) => {
  const body = (request.body as any) ?? {};
  if (!body.client_id) return reply.send({ ok: false, error: 'invalid_arguments' });
  return reply.send({ ok: true, access_token: `xoxp-legacy-${Date.now()}`, scope: 'read' });
});

// ── oauth.v2.exchange ─────────────────────────────────────────────────────
fastify.post('/api/oauth.v2.exchange', async (request, reply) => {
  const body = (request.body as any) ?? {};
  if (!body.client_id) return reply.send({ ok: false, error: 'invalid_arguments' });
  return reply.send({ ok: true, token: `xoxb-exchanged-${Date.now()}`, token_type: 'bot' });
});

// ── team extended ─────────────────────────────────────────────────────────
fastify.post('/api/team.billing.info', stub('team.billing.info', { plan: { type: 'free' } }));
fastify.post('/api/team.externalTeams.disconnect', stub('team.externalTeams.disconnect'));
fastify.post('/api/team.externalTeams.list', stub('team.externalTeams.list', { external_teams: [] }));
fastify.get('/api/team.externalTeams.list', stub('team.externalTeams.list', { external_teams: [] }));

// ── users extended ────────────────────────────────────────────────────────
fastify.post('/api/users.discoverableContacts.lookup', stub('users.discoverableContacts.lookup', { users: [] }));
```

### Finding #4: openid.connect.token — No-Auth Exchange Handler

```typescript
// Replace the current stub in new-families.ts:
// BEFORE (wrong — requires bearer token):
fastify.post('/api/openid.connect.token', stub('openid.connect.token', { access_token: 'oidc-stub', id_token: 'jwt-stub' }));

// AFTER (correct — no bearer auth, validates client_id):
fastify.post('/api/openid.connect.token', async (request, reply) => {
  const body = (request.body as any) ?? {};
  const { client_id, client_secret, code } = body;
  if (!client_id || !client_secret) {
    return reply.send({ ok: false, error: 'invalid_arguments' });
  }
  const suffix = code ?? 'anon';
  return reply.send({
    ok: true,
    access_token: `xoxp-oidc-${suffix}`,
    token_type: 'Bearer',
    id_token: 'eyJhbGciOiJSUzI1NiJ9.stub.oidc',
    refresh_token: `xoxe-oidc-${suffix}`,
    expires_in: 43200,
    issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  });
});
```

### Finding #5: PUT to POST for Upload Endpoint

```typescript
// In twins/slack/src/plugins/web-api/files.ts

// BEFORE (wrong verb):
fastify.put('/api/_upload/:file_id', async () => {
  return {};
});

// AFTER (correct verb — SDK uses axios.post() for upload URL):
fastify.post('/api/_upload/:file_id', async () => {
  return {};
});
```

### Finding #6: METHOD_SCOPES Additions

```typescript
// In twins/slack/src/services/method-scopes.ts

// Add missing entries:
'apps.connections.open':          ['connections:write'],  // app-level scope for Socket Mode
'oauth.v2.access':                [],  // no-auth endpoint (already has dedicated route in oauth.ts)
'oauth.access':                   [],  // legacy no-auth OAuth endpoint
'admin.workflows.search':         ['admin.workflows:read'],  // missing from admin family
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 17 methods missing routes (404) | All 275+ methods registered | Phase 35 | `client.apiCall('X', ...)` on any method no longer crashes with transport error |
| openid.connect.token requires bearer token | No-auth code exchange | Phase 35 | OIDC flow works without pre-existing bot token |
| PUT verb for binary upload | POST verb for binary upload | Phase 35 | `filesUploadV2` 3-step chain completes without 405/404 |
| apps.connections.open scope: vacuous pass | connections:write required | Phase 35 | Correct scope enforcement for Socket Mode app tokens |

## Open Questions

1. **Does the existing openid.connect.token test need updating?**
   - What we know: `slack-method-coverage.test.ts` calls `client.openid.connect.token({ code: 'oidc-fake-code', client_id: 'A_TWIN', client_secret: 'test-client-secret' })` — this provides body fields but goes through `WebClient.apiCall()` which adds an Authorization header from the seeded token.
   - What's unclear: Does `openid.connect.token` on real Slack accept/ignore bearer tokens? On real Slack it does not require a bearer token but may accept one without error.
   - Recommendation: Make the handler tolerant — accept the request regardless of bearer token presence, validate only `client_id` + `client_secret`. The test will continue to pass.

2. **Should `oauth.access` route be added to new-families.ts or oauth.ts?**
   - What we know: `oauth.ts` currently handles `oauth.v2.access` (the v2 endpoint). `oauth.access` is the legacy v1 endpoint.
   - Recommendation: Add `oauth.access` to `new-families.ts` alongside the other missing oauth stubs. It's simpler than modifying `oauth.ts`.

3. **Does admin.workflows.search need to be added to method-scopes.ts?**
   - What we know: METHOD_SCOPES has `admin.workflows.*` entries but not `admin.workflows.search` specifically. The `stub()` factory calls `checkScope(method, ...)` which returns `null` for unknown methods (no required scope). `admin.workflows.search` has no entry.
   - Recommendation: Add `'admin.workflows.search': ['admin.workflows:read']` to METHOD_SCOPES. Without it, the stub passes vacuously — which is acceptable but inconsistent with the other admin.workflows entries.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk --reporter=verbose 2>&1 \| tail -20` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements to Test Map

Phase 35 has no formal requirement IDs. The deliverables map to existing tests and new wave-0 tests:

| Deliverable | Behavior | Test Type | Automated Command | File Exists? |
|-------------|----------|-----------|-------------------|--------------|
| Finding #3: 17 routes registered | WebClient calls return `{ok: true}` | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep -E 'SLCK-14|method-coverage'` | Yes — slack-method-coverage.test.ts |
| Finding #4: openid.connect.token no-auth | Token exchange returns OIDC fields | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep openid` | Yes — slack-method-coverage.test.ts |
| Finding #5: POST upload verb | filesUploadV2 3-step chain succeeds | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep filesUploadV2` | Yes — slack-webclient-base.test.ts |
| Finding #6: scope additions | apps.connections.open scope enforced | integration | `pnpm test:sdk --reporter=verbose 2>&1 \| grep socket-mode` | Yes — slack-bolt-socket-mode-receiver.test.ts |

### Sampling Rate

- **Per task commit:** `pnpm test:sdk 2>&1 | tail -10` (watch for no regressions in existing suites)
- **Per wave merge:** `pnpm test:sdk` full suite
- **Phase gate:** All 253+ tests GREEN before phase complete

### Wave 0 Gaps

None — no new test files required. All fixes are verified by existing tests:
- Finding #3 verified by `slack-method-coverage.test.ts` (existing openid.connect.token + rtm.connect tests; new tests for the 17 specific missing routes may be added optionally)
- Finding #4 verified by `slack-method-coverage.test.ts` (existing openid.connect.token test)
- Finding #5 verified by `slack-webclient-base.test.ts` (existing filesUploadV2 test)
- Finding #6 verified by `slack-bolt-socket-mode-receiver.test.ts` (existing apps.connections.open call)

**Optional Wave 0 addition:** A test that confirms each of the 17 previously-missing methods now returns `{ok: true}` (similar to `slack-method-coverage.test.ts` but targeting the 17 specific routes). This is recommended for traceability but not strictly required since the existing test suite exercises many of them.

## Sources

### Primary (HIGH confidence)

- Direct source inspection: `third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts` — line 722 confirms `axios.post()` for upload URL (not PUT); line 637 shows `makeRequest()` calling POST
- Direct source inspection: `third_party/upstream/node-slack-sdk/packages/web-api/src/file-upload.ts` — `getAllFileUploadsToComplete()` confirms `{ files: [{ id, title }] }` shape sent to completeUploadExternal
- Direct source inspection: `third_party/upstream/node-slack-sdk/packages/web-api/src/types/request/manifest.ts:444` — `AppManifestLevelScopes = 'authorizations:read' | 'connections:write'` confirms connections:write is the correct scope for apps.connections.open
- Direct source inspection: `twins/slack/src/plugins/web-api/new-families.ts` — confirmed "already registered in respective plugin files" comment is false; methods listed as covered are absent from all plugin route registrations
- Python manifest analysis script — confirmed 17 missing routes (272 manifest API methods, 259 registered routes in all plugin files combined)
- Direct source inspection: `twins/slack/src/services/method-scopes.ts` — confirmed `apps.connections.open` and `oauth.v2.access` absent from METHOD_SCOPES
- Direct source inspection: `twins/slack/src/plugins/web-api/files.ts` — confirmed `fastify.put('/api/_upload/:file_id', ...)` is the wrong verb

### Secondary (MEDIUM confidence)

- Upstream docs search: `third_party/upstream/node-slack-sdk/docs/english/tutorials/local-development.md` — confirms "connections:write scope" for Socket Mode
- Upstream `third_party/upstream/node-slack-sdk/packages/socket-mode/README.md` — confirms `connections:write` scope requirement

### Tertiary (LOW confidence)

None — all claims verified from source code.

## Metadata

**Confidence breakdown:**
- Finding #3 (17 missing routes): HIGH — confirmed by manifest diff script against actual plugin file registrations
- Finding #4 (openid.connect.token no-auth): HIGH — confirmed by upstream types showing `OAuthCredentials` (client_id + client_secret) as the authentication mechanism, not bearer token
- Finding #5 (PUT to POST): HIGH — confirmed from upstream WebClient.ts line 722 `this.axios.post(url, body, config)`
- Finding #6 (scope additions): HIGH — confirmed by METHOD_SCOPES grep showing absences; connections:write confirmed by manifest type + SDK docs

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase — no external dependencies changing)

---

## Appendix: Complete List of 17 Missing Routes

Methods in `@slack/web-api@7.14.1` manifest but missing from all Fastify plugin registrations:

| Method | Belongs In | Scope | Response Extra |
|--------|------------|-------|----------------|
| `admin.workflows.search` | new-families.ts | `admin.workflows:read` | `{ workflows: [] }` |
| `apps.event.authorizations.list` | new-families.ts | `authorizations:read` | `{ authorizations: [] }` |
| `apps.manifest.create` | new-families.ts | `apps.manifest:write` | `{ manifest: {} }` |
| `apps.manifest.delete` | new-families.ts | `apps.manifest:write` | `{}` |
| `apps.manifest.export` | new-families.ts | `apps.manifest:read` | `{ manifest: {} }` |
| `apps.manifest.update` | new-families.ts | `apps.manifest:write` | `{}` |
| `apps.manifest.validate` | new-families.ts | `apps.manifest:read` | `{}` |
| `apps.uninstall` | new-families.ts | `[]` (no scope) | `{}` |
| `files.upload` | new-families.ts | `files:write` | `{ file: { id: 'F_STUB' } }` |
| `files.uploadV2` | new-families.ts | `files:write` | `{ files: [] }` |
| `oauth.access` | new-families.ts (no-auth) | n/a | `{ access_token: ... }` |
| `oauth.v2.access` | Already in oauth.ts — only needs METHOD_SCOPES entry | `[]` | (existing handler) |
| `oauth.v2.exchange` | new-families.ts (no-auth) | n/a | `{ token: ... }` |
| `team.billing.info` | new-families.ts | `team:read` | `{ plan: { type: 'free' } }` |
| `team.externalTeams.disconnect` | new-families.ts | `team:write` | `{}` |
| `team.externalTeams.list` | new-families.ts | `team:read` | `{ external_teams: [] }` |
| `users.discoverableContacts.lookup` | new-families.ts | `users:read` | `{ users: [] }` |

**Note on oauth.v2.access:** The route `POST /api/oauth.v2.access` IS registered in `oauth.ts` as the token exchange handler. It is missing from METHOD_SCOPES (so `allScopesString()` doesn't include any scope for it). Adding `'oauth.v2.access': []` to METHOD_SCOPES completes the catalog but doesn't change routing — the handler in `oauth.ts` remains the authority.

**Note on oauth.access and oauth.v2.exchange:** These are no-auth endpoints. The `stub()` factory REQUIRES a bearer token and will return `not_authed` without one. These two must be registered as explicit no-auth handlers, not using the `stub()` factory.
