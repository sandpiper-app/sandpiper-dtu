# Phase 31: Slack OAuth & Method Coverage - Research

**Researched:** 2026-03-13
**Domain:** Slack twin — OAuth exchange validation (SLCK-18 closure), method coverage evidence map (SLCK-14 closure)
**Confidence:** HIGH

## Summary

Phase 31 closes two partial requirements identified in the v1.2 milestone audit. All work is within the existing codebase stack: no new runtime dependencies, no new SQLite tables, no new services. The fixes are targeted to two specific areas: `twins/slack/src/plugins/oauth.ts` and `tests/sdk-verification/coverage/generate-report-evidence.ts`.

**SLCK-18 (partial — OAuth exchange under-validated):** The milestone audit identified that `oauth.ts:64-118` only validates `client_id` presence. The requirement also demands validation of `scope` parameter presence, binding of issued codes to their authorize-time `redirect_uri` (so the exchange can reject mismatched redirect URIs), and removal of the security concern on line 79 (logging the raw authorization code). The authorize endpoint (`GET /oauth/v2/authorize`) does not validate that `scope` was provided — this must also be checked. The existing `InstallProvider` test (`slack-oauth-install-provider.test.ts`) sends all required parameters (client_id, client_secret, code, redirect_uri) — tightening validation must not break it.

**SLCK-14 (partial — insufficient method coverage testing):** The milestone audit confirmed that `slack-method-coverage.test.ts` only samples ~5 of the 127+ missing families and that NONE of the four new Phase 25/26 test files (`slack-method-coverage.test.ts`, `slack-signing.test.ts`, `slack-state-tables.test.ts`, `slack-scope-enforcement.test.ts`) are in `EVIDENCE_MAP`. These test files are GREEN and running in the test suite but are invisible to the coverage report. Phase 31 must: (1) expand `slack-method-coverage.test.ts` to call at least one representative method from every registered family (admin, canvases, openid, stars, slackLists, rtm, workflows, entity), and (2) add all four Phase 25/26 test files to EVIDENCE_MAP with their respective symbol attributions.

**Phase 31 also adds Phase 25/26 test files to the evidence map** per the phase goal: "adds Phase 25/26 test files to evidence map." This is the INFRA-22 closure action for the Slack-specific portion of coverage evidence.

**Primary recommendation:** Two independent implementation waves. Wave 1: expand `slack-method-coverage.test.ts` and add Phase 25/26 files to EVIDENCE_MAP. Wave 2: tighten `oauth.ts` authorize + exchange validation (scope, redirect_uri binding, remove code log).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCK-18 | Slack auth enforces OAuth scope requirements per method; OAuth token exchange validates `client_id`, `scope`, and `redirect_uri` parameters | `oauth.ts` authorize endpoint must validate scope presence; exchange endpoint must validate redirect_uri matches authorize-time value; code-to-redirect binding via Map; `client_id` presence already done (Phase 26); no new tables needed; existing `InstallProvider` test sends correct params so tightening is safe |
| SLCK-14 | All bound WebClient methods from the pinned `@slack/web-api` package are registered and callable; method coverage tests prove all 275+ methods are callable | Routes registered (Phase 25); `slack-method-coverage.test.ts` needs broader family coverage; EVIDENCE_MAP needs 4 new test file entries + symbol attributions for admin, canvases, openid, stars, slackLists, rtm, workflows, entity families |
</phase_requirements>

## Standard Stack

### Core (all already in use — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | built-in | randomUUID() for authorization codes | Already used in `oauth.ts` |
| `better-sqlite3` | 12.6.2 | SQLite state — no changes needed | No new tables for SLCK-18 |
| Fastify `FastifyPluginAsync` | v5 | Route registration | All twin routes use this |
| Vitest 3.x | 3.x | Test framework | `pnpm test:sdk` |

### No New Dependencies

The v1.2 roadmap decision is explicit: "No new runtime dependencies." Both SLCK-18 and SLCK-14 closures require only in-process changes to existing files.

## Architecture Patterns

### Recommended Project Structure (changes only)

```
twins/slack/src/plugins/
└── oauth.ts                # MODIFY: bind codes to redirect_uri, validate scope, remove log

tests/sdk-verification/sdk/
└── slack-method-coverage.test.ts   # MODIFY: add representative calls for all registered families

tests/sdk-verification/coverage/
└── generate-report-evidence.ts     # MODIFY: add Phase 25/26 test files + symbol attributions to EVIDENCE_MAP
```

No new files needed. All changes are modifications to existing files.

### Pattern 1: Code-to-Redirect Binding in oauth.ts (SLCK-18)

**What:** Replace `issuedCodes: Set<string>` with `issuedCodes: Map<string, { redirectUri: string; scope: string; clientId: string }>` so that when a code is exchanged, the exchange can verify that the `redirect_uri` provided at exchange time matches the one used at authorize time.

**When to use:** `GET /oauth/v2/authorize` stores binding; `POST /api/oauth.v2.access` validates binding.

**Current code (oauth.ts lines 38-50):**
```typescript
// CURRENT — Set, stores only codes:
const issuedCodes = new Set<string>();
const code = randomUUID();
issuedCodes.add(code);
```

**Fixed approach — Map binding:**
```typescript
// Source: oauth.ts (proposed fix)
interface CodeBinding {
  redirectUri: string;
  scope: string;
  clientId: string;
}
const issuedCodes = new Map<string, CodeBinding>();

// In GET /oauth/v2/authorize:
const { client_id, scope, redirect_uri, state } = request.query;

// SLCK-18: validate scope presence at authorize time
if (!scope) {
  return reply.status(400).send({ ok: false, error: 'invalid_scope' });
}

const code = randomUUID();
issuedCodes.set(code, { redirectUri: redirect_uri, scope, clientId: client_id ?? '' });
```

**In POST /api/oauth.v2.access:**
```typescript
// SLCK-18: validate redirect_uri binding
const { code, client_id, redirect_uri } = request.body ?? {};

if (!client_id) {
  return { ok: false, error: 'invalid_arguments' };
}

const binding = code ? issuedCodes.get(code) : undefined;
if (!binding) {
  return { ok: false, error: 'invalid_code' };
}

// Validate redirect_uri matches authorize-time value (if provided at exchange)
if (redirect_uri && redirect_uri !== binding.redirectUri) {
  return { ok: false, error: 'redirect_uri_mismatch' };
}

issuedCodes.delete(code);
// Remove: request.log.info({ code }, ...) — security concern
```

**Why this is safe with the InstallProvider test:** The existing `slack-oauth-install-provider.test.ts` calls `GET /oauth/v2/authorize?client_id=test-client-id-19&scope=chat:write&redirect_uri=http://localhost/slack/oauth_redirect&state=test` — all parameters present, scope provided. The callback test passes `redirect_uri` in the `InstallProvider` configuration. The tightened validation accepts all these correctly.

**Specific case: `handleCallback` with stateVerification: false:** The test at line 118 of `slack-oauth-install-provider.test.ts` calls `handleCallback` which internally calls `oauth.v2.access`. The Slack SDK's `InstallProvider.handleCallback()` sends `client_id`, `client_secret`, `code`, and `redirect_uri` to the exchange endpoint. All required parameters are present — tightening is safe.

### Pattern 2: Authorize Endpoint scope Validation (SLCK-18)

**What:** `GET /oauth/v2/authorize` currently only requires `redirect_uri`. The SLCK-18 requirement says OAuth token exchange validates `scope`. Real Slack also requires `scope` at the authorize step.

**Current code (oauth.ts line 32-34):**
```typescript
const { redirect_uri, state } = request.query;
if (!redirect_uri) {
  return reply.status(400).send({ ok: false, error: 'missing_redirect_uri' });
}
```

**Fixed approach:**
```typescript
const { client_id, scope, redirect_uri, state } = request.query;

if (!redirect_uri) {
  return reply.status(400).send({ ok: false, error: 'missing_redirect_uri' });
}
if (!scope) {
  return reply.status(400).send({ ok: false, error: 'invalid_scope' });
}
```

**Note:** `client_id` is declared in the query type (line 26) but not currently validated. Add presence check for completeness (but the InstallProvider test sends it, so it's safe).

### Pattern 3: EVIDENCE_MAP Additions (SLCK-14 + INFRA-22)

**What:** Add four Phase 25/26 test files to EVIDENCE_MAP in `generate-report-evidence.ts` with symbol attributions for the methods each test file exercises.

**Existing EVIDENCE_MAP format:**
```typescript
const EVIDENCE_MAP: Record<string, string> = {
  // format: '@pkg@version/WebClient.method': 'sdk/test-file.test.ts'
  '@slack/web-api@7.14.1/WebClient.auth.test': 'sdk/slack-auth-gateway.test.ts',
  // ...
};
```

**Phase 25 additions — `slack-method-coverage.test.ts`:**
The Phase 25 method coverage test exercises one representative method from each missing family: `admin.users.list`, `admin.conversations.search`, `admin.teams.list`, `admin.apps.approved.list`, `admin.users.invite`, `admin.conversations.create`, `workflows.stepCompleted`, `workflows.stepFailed`, `workflows.updateStep`, `canvases.create`, `canvases.delete`, `openid.connect.token`, `openid.connect.userInfo`, `stars.list`, `stars.add`, `stars.remove`.

EVIDENCE_MAP entries to add:
```typescript
// Phase 25: SLCK-14 — slack-method-coverage.test.ts
'@slack/web-api@7.14.1/WebClient.admin.users.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.conversations.search': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.teams.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.apps.approved.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.users.invite': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.conversations.create': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.workflows.stepCompleted': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.workflows.stepFailed': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.workflows.updateStep': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.canvases.create': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.canvases.delete': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.openid.connect.token': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.openid.connect.userInfo': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.stars.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.stars.add': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.stars.remove': 'sdk/slack-method-coverage.test.ts',
```

**Phase 25 additions — `slack-signing.test.ts`:** Covers SLCK-16 (event signing, interactivity routing, absolute response_url). No new WebClient method symbols — this test exercises twin infrastructure not WebClient methods. Add a representative @slack/bolt entry if applicable, or skip (the EVIDENCE_MAP only needs to attribute symbols from the package manifests).

**Phase 25 additions — `slack-state-tables.test.ts`:** Exercises conversations.invite, conversations.members, conversations.open, views.open/update, pins.add/list, reactions.add/remove/get. These are already in EVIDENCE_MAP (from `slack-conversations.test.ts`, `slack-views.test.ts`, `slack-pins.test.ts`, `slack-reactions.test.ts`). The state-tables file tests the stateful behavior — do NOT duplicate attribution; existing attributions already cover these symbols.

**Phase 26 additions — `slack-scope-enforcement.test.ts`:** Exercises chat.postMessage, chat.update, chat.delete, conversations.list, users.list. These are already in EVIDENCE_MAP (from `slack-chat.test.ts`, `slack-conversations.test.ts`, `slack-users.test.ts`). The scope enforcement file adds SLCK-18 OAuth validation and header assertion tests. Add the OAuth entry:
```typescript
// Phase 26: SLCK-18 — slack-scope-enforcement.test.ts
// NOTE: Chat/conversations/users methods already attributed to their primary test files
// Add only the OAuth.v2.access method symbol if it appears in the manifest:
'@slack/web-api@7.14.1/WebClient.oauth.v2.access': 'sdk/slack-scope-enforcement.test.ts',
```

**Critical note on EVIDENCE_MAP attribution:** The manifest lists `WebClient.admin` as a top-level key with sub-members. Check the manifest structure for `admin.*` entries — they may be registered as `WebClient.admin.users.list` or as `WebClient.admin` with members. The manifest's structure determines the key format. Use the same dotted path format as existing entries (e.g., `WebClient.chat.postMessage`).

### Pattern 4: Expanding slack-method-coverage.test.ts (SLCK-14)

**What:** The Phase 25 research noted 16 tests covering 6 families (admin, workflows, canvases, openid, stars). The remaining registered families from Phase 25's `new-families.ts` that are NOT covered by the existing 16 tests: `slackLists.*` (13 methods), `rtm.*` (2 methods), `entity.*` (1 method). These routes are registered in `new-families.ts`. Adding one representative test per family completes coverage proof.

**Methods to add (representative per missing family):**
- `slackLists` family: check `new-families.ts` for the actual method names registered (e.g., `slackLists.create`, `slackLists.delete`)
- `rtm` family: `rtm.connect` or `rtm.start`
- `entity` family: whatever single method `entity.*` registers

**Current test count:** 16 tests covering 6 families. After Phase 31: ~19 tests covering all 9 families.

**Test pattern to follow (matches existing tests exactly):**
```typescript
// Source: tests/sdk-verification/sdk/slack-method-coverage.test.ts
it('slackLists.create returns ok:true', async () => {
  const client = createSlackClient(token);
  await expect(client.slackLists.create({})).resolves.toMatchObject({ ok: true });
});

it('rtm.connect returns ok:true', async () => {
  const client = createSlackClient(token);
  await expect(client.rtm.connect({})).resolves.toMatchObject({ ok: true });
});
```

### Anti-Patterns to Avoid

- **Breaking existing InstallProvider tests with strict validation:** `slack-oauth-install-provider.test.ts` relies on the OAuth flow. Adding `scope` as required at authorize time is safe only because the InstallProvider test sends `scope=chat:write` in every authorize URL. Verify before tightening.
- **Duplicate EVIDENCE_MAP attributions:** Do not add `slack-state-tables.test.ts` entries for symbols already attributed to `slack-conversations.test.ts`, `slack-views.test.ts`, etc. The generator picks the FIRST (or any) mapping — duplicate keys would be a TypeScript error. Only add new symbols not already in the map.
- **Attributing symbols to non-primary test files:** EVIDENCE_MAP is a declaration of which test file is responsible for proving a symbol. Use the most targeted test file. `slack-method-coverage.test.ts` is the primary file for admin/canvases/openid/stars/workflows/slackLists/rtm/entity symbols.
- **Adding scope validation to exchange before authorize:** The authorize endpoint stores scope in the binding. If authorize is changed after exchange, the binding doesn't contain scope. Both must change together or the authorize change must land first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code-to-redirect binding | Custom state store | `Map<string, CodeBinding>` (in-closure) | Ephemeral per-process — codes are short-lived; no SQLite needed |
| EVIDENCE_MAP symbol lookup | Dynamic introspection | Explicit string keys | EVIDENCE_MAP is a static attribution contract — explicit is correct |
| OAuth scope parsing | Custom parser | String presence check (`!scope`) | Scope validation is presence-only per SLCK-18; scope content is not validated |
| Method coverage verification | Full manifest diff | Representative sampling per family | One route per family proves the registration works; SDK would 404 on missing routes |

**Key insight:** The code-to-redirect binding DOES NOT require a database. OAuth codes are consumed once and expire when used. An in-memory `Map` inside the plugin closure is correct. This matches the existing `issuedCodes` Set pattern — just extend it to a Map.

## Common Pitfalls

### Pitfall 1: InstallProvider Uses redirect_uri at Exchange Time

**What goes wrong:** The Slack `InstallProvider.handleCallback()` internally calls `oauth.v2.access` and sends `redirect_uri`. If the exchange validates `redirect_uri` strictly (must match EXACTLY), URL encoding differences between the authorize URL and the exchange body could cause false rejections.

**Why it happens:** The test's authorize URL sends `redirect_uri=http://localhost/slack/oauth_redirect`. The `InstallProvider` may percent-encode or canonicalize this differently when sending it to the exchange endpoint.

**How to avoid:** Compare normalized URIs (trim, no trailing slash differences) OR only validate when `redirect_uri` is present at BOTH authorize and exchange time. The existing InstallProvider test sends the same literal URL at both steps — a simple string equality check is sufficient for the twin.

**Warning signs:** `InstallProvider.handleCallback` returns `invalid_grant` or `redirect_uri_mismatch` after tightening.

### Pitfall 2: scope Validation Breaks authorize-only Flows

**What goes wrong:** Adding `scope` as required at `GET /oauth/v2/authorize` breaks any test that calls the authorize endpoint without a scope parameter.

**Why it happens:** Some test helpers call the authorize endpoint directly with minimal parameters (e.g., only `redirect_uri` and `state`).

**How to avoid:** Grep all tests and test helpers for calls to `/oauth/v2/authorize` before adding scope validation. Confirmed affected test: `slack-oauth-install-provider.test.ts` which always provides `scope`. The `slack-bolt-http-receivers.test.ts` may also hit OAuth URLs — check.

**Warning signs:** `handleInstallPath` or related OAuth flow tests fail with `invalid_scope`.

### Pitfall 3: EVIDENCE_MAP Key Format Must Match Manifest

**What goes wrong:** EVIDENCE_MAP keys use dotted paths like `@slack/web-api@7.14.1/WebClient.admin.users.list`. If the manifest at `tools/sdk-surface/manifests/slack-web-api@7.14.1.json` stores admin methods differently (e.g., `WebClient.admin` as top-level with `users.list` as a nested member), the key format must match the manifest's `${symbolName}.${member}` computation in the generator.

**Why it happens:** The generator computes `topKey = "${pkgKey}/${symbolName}"` for top-level symbols and `memberKey = "${pkgKey}/${symbolName}.${member}"` for nested members. If `admin` is a symbol with members, the key would be `@slack/web-api@7.14.1/WebClient.admin.users.list` only if `member = 'users.list'` (dotted member) or if `users.list` is a top-level symbol named `WebClient.admin.users.list`.

**How to avoid:** Check the manifest JSON before adding EVIDENCE_MAP entries. Run:
```bash
cat tools/sdk-surface/manifests/slack-web-api@7.14.1.json | python3 -c "import json,sys; d=json.load(sys.stdin); print([k for k in d['symbols'] if 'admin' in k][:10])"
```
Use EXACTLY the key format the manifest uses.

**Warning signs:** `pnpm coverage:generate` reports unchanged live count despite new EVIDENCE_MAP entries.

### Pitfall 4: Log Line Security — Don't Just Delete, Ensure No Sensitive Data

**What goes wrong:** Removing `request.log.info({ code }, 'OAuth v2 token exchange')` is correct but the log entry provides useful debugging information. Remove the `code` field but keep the log entry without sensitive data.

**How to avoid:**
```typescript
// BEFORE: request.log.info({ code }, 'OAuth v2 token exchange');
// AFTER:
request.log.info('OAuth v2 token exchange');
```

### Pitfall 5: slackLists Method Names

**What goes wrong:** The `slackLists.*` family uses camelCase in the WebClient but the twin's routes use dotted paths. The SDK method `client.slackLists.create` maps to `POST /api/slackLists.create`. Check `new-families.ts` for the exact route names registered — they may not match the manifest method names exactly.

**How to avoid:** Read `new-families.ts` to confirm registered route paths before writing new tests.

## Code Examples

Verified patterns from codebase:

### oauth.ts: Code-to-Redirect Binding (SLCK-18)

```typescript
// Source: twins/slack/src/plugins/oauth.ts — proposed modification

// Replace Set with Map
interface CodeBinding {
  redirectUri: string;
  scope: string;
  clientId: string;
}
const issuedCodes = new Map<string, CodeBinding>();

// In GET /oauth/v2/authorize — validate scope and store binding:
const { client_id, scope, redirect_uri, state } = request.query;

if (!redirect_uri) {
  return reply.status(400).send({ ok: false, error: 'missing_redirect_uri' });
}
if (!scope) {
  return reply.status(400).send({ ok: false, error: 'invalid_scope' });
}

const code = randomUUID();
issuedCodes.set(code, { redirectUri: redirect_uri, scope, clientId: client_id ?? '' });

// In POST /api/oauth.v2.access — validate redirect_uri binding:
const { code, client_id, redirect_uri } = request.body ?? {};

if (!client_id) {
  return { ok: false, error: 'invalid_arguments' };
}

const binding = code ? issuedCodes.get(code) : undefined;
if (!binding) {
  return { ok: false, error: 'invalid_code' };
}

if (redirect_uri && redirect_uri !== binding.redirectUri) {
  return { ok: false, error: 'redirect_uri_mismatch' };
}

issuedCodes.delete(code);
// Remove: request.log.info({ code }, 'OAuth v2 token exchange');
request.log.info('OAuth v2 token exchange');
```

### EVIDENCE_MAP additions (generate-report-evidence.ts)

```typescript
// Source: tests/sdk-verification/coverage/generate-report-evidence.ts — add to EVIDENCE_MAP

// Phase 25: SLCK-14 — slack-method-coverage.test.ts
// Add after the existing Phase 18 SLCK-08 stubs section:
'@slack/web-api@7.14.1/WebClient.admin.users.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.conversations.search': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.teams.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.apps.approved.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.users.invite': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.admin.conversations.create': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.workflows.stepCompleted': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.workflows.stepFailed': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.workflows.updateStep': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.canvases.create': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.canvases.delete': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.openid.connect.token': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.openid.connect.userInfo': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.stars.list': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.stars.add': 'sdk/slack-method-coverage.test.ts',
'@slack/web-api@7.14.1/WebClient.stars.remove': 'sdk/slack-method-coverage.test.ts',
// Add rtm and slackLists/entity after confirming manifest key names (see Pitfall 3)

// Phase 25: SLCK-16 — slack-signing.test.ts
// No new WebClient method symbols (covers infrastructure, not SDK methods)

// Phase 26: SLCK-18/19 — slack-scope-enforcement.test.ts
// Chat/conversations/users already attributed; only add OAuth method if in manifest:
// '@slack/web-api@7.14.1/WebClient.oauth.v2.access': 'sdk/slack-scope-enforcement.test.ts',
```

### Verify manifest key format for admin methods

```bash
# Run before writing EVIDENCE_MAP entries:
cat /Users/futur/projects/sandpiper-dtu/tools/sdk-surface/manifests/slack-web-api@7.14.1.json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print([k for k in d['symbols'] if 'admin' in k][:5])"
# Expected output: ['WebClient.admin.apps.approve', ...] or ['WebClient', ...] with 'admin.apps.approve' as member
```

### Test expansion pattern for missing families

```typescript
// Source: tests/sdk-verification/sdk/slack-method-coverage.test.ts — add to existing describe block
// (after checking new-families.ts for exact method names)

it('rtm.connect returns ok:true', async () => {
  const client = createSlackClient(token);
  // RTM family — registered in new-families.ts
  await expect(client.rtm.connect({})).resolves.toMatchObject({ ok: true });
});

it('slackLists.create returns ok:true', async () => {
  const client = createSlackClient(token);
  await expect(client.slackLists.create({})).resolves.toMatchObject({ ok: true });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `issuedCodes: Set<string>` — stores only codes | `issuedCodes: Map<string, CodeBinding>` — stores redirect_uri + scope | Phase 31 | `redirect_uri` mismatch at exchange time returns `redirect_uri_mismatch`; scope presence validated at authorize time |
| EVIDENCE_MAP: 24 test files, no Phase 25/26 Slack files | EVIDENCE_MAP: 28 test files including Phase 25/26 Slack tests | Phase 31 | Coverage report reflects actual test execution across all Slack tests |
| `slack-method-coverage.test.ts`: 16 tests, 6 families | `slack-method-coverage.test.ts`: ~19 tests, all 9 registered families | Phase 31 | All admin/canvases/openid/stars/workflows/slackLists/rtm/entity families have coverage proof |
| Log: `request.log.info({ code }, ...)` | Log: `request.log.info('OAuth v2 token exchange')` | Phase 31 | Authorization code no longer appears in server logs |

**Not deprecated:** `checkScope()` enforcement in all plugins (Phase 26) — remains in place. The SLCK-18 closure is only about OAuth exchange validation, not the per-method scope check.

## Open Questions

1. **manifest key format for admin.* sub-namespaces**
   - What we know: EVIDENCE_MAP uses dotted paths matching the generator's key computation. The generator builds `memberKey = ${pkgKey}/${symbolName}.${member}`.
   - What's unclear: Whether `admin` is a top-level symbol with members like `users.list` or whether each admin method is a separate top-level symbol like `WebClient.admin.users.list`.
   - Recommendation: Read the manifest JSON directly before writing EVIDENCE_MAP keys (see Pitfall 3 and the verification bash command above). Do NOT guess.

2. **Does `redirect_uri` at exchange time need to be present or must it match?**
   - What we know: SLCK-18 requirement says "validates `redirect_uri` parameters". Real Slack validates: if `redirect_uri` was provided at authorize time, the exchange MUST include a matching `redirect_uri`. If no `redirect_uri` was provided at authorize time, the exchange does not need to include it.
   - What's unclear: Does the twin need the full RFC 6749 behavior or simpler validation?
   - Recommendation: For twin purposes, simple binding: if `redirect_uri` is provided at exchange time, it must match the authorize-time value. If not provided at exchange time, accept (same as current behavior). This satisfies SLCK-18 without over-engineering.

3. **Does slack-scope-enforcement.test.ts need EVIDENCE_MAP entries for oauth.v2.access?**
   - What we know: `slack-scope-enforcement.test.ts` test 18b calls `POST /api/oauth.v2.access` directly. The `oauth.v2.access` method may or may not appear in the `@slack/web-api` manifest (it's in the `@slack/oauth` SDK surface, not WebClient).
   - What's unclear: Whether `WebClient.oauth.v2.access` is in the `slack-web-api@7.14.1.json` manifest.
   - Recommendation: Check the manifest. If absent, no EVIDENCE_MAP entry needed for it — the test still runs and is counted, but the symbol is not in the manifest so it doesn't affect the coverage count.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` |
| Full suite command | `pnpm test:sdk` |
| Coverage report | `pnpm coverage:generate` (uses vitest-evidence.json) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-18 | oauth.v2.access rejects missing `client_id` | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | YES (test 18b) |
| SLCK-18 | oauth.v2.access rejects redirect_uri mismatch | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | NO — Wave 0 |
| SLCK-18 | authorize endpoint rejects missing scope | integration | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` | NO — Wave 0 |
| SLCK-18 | InstallProvider flow still works after tightening | regression | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` | YES (existing) |
| SLCK-14 | admin.users.list returns ok:true | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` | YES (existing) |
| SLCK-14 | slackLists.create returns ok:true | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` | NO — Wave 0 |
| SLCK-14 | rtm.connect returns ok:true | smoke | `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` | NO — Wave 0 |
| SLCK-14 | EVIDENCE_MAP includes Phase 25/26 test files | verification | `pnpm coverage:generate 2>&1 \| grep -E "live\|deferred"` | NO — Wave 0 |
| SLCK-14 | Coverage report live count increases after EVIDENCE_MAP additions | verification | `pnpm coverage:generate` | NO — Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test:sdk -- tests/sdk-verification/sdk/slack-method-coverage.test.ts` (or `slack-scope-enforcement.test.ts`)
- **Per wave merge:** `pnpm test:sdk`
- **Coverage verification:** `pnpm coverage:generate` after EVIDENCE_MAP additions
- **Phase gate:** Full suite green + coverage report live count increased before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New test case in `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` for `redirect_uri` mismatch: `oauth.v2.access with redirect_uri that doesn't match authorize-time redirect_uri returns redirect_uri_mismatch`
- [ ] New test case in `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` for missing scope at authorize: `GET /oauth/v2/authorize without scope parameter returns invalid_scope`
- [ ] New test cases in `tests/sdk-verification/sdk/slack-method-coverage.test.ts` for `slackLists.*`, `rtm.*`, and `entity.*` families (method names to be confirmed from `new-families.ts`)
- [ ] EVIDENCE_MAP additions in `tests/sdk-verification/coverage/generate-report-evidence.ts` for Phase 25/26 test files

*(Existing test infrastructure covers all fixtures: `seedSlackBotToken`, `SLACK_API_URL`. No new framework install required.)*

## Sources

### Primary (HIGH confidence)

- `twins/slack/src/plugins/oauth.ts` — current OAuth implementation; `issuedCodes: Set`, authorize validates only `redirect_uri`, exchange validates only `client_id`; line 79 logs authorization code
- `tests/sdk-verification/sdk/slack-oauth-install-provider.test.ts` — confirms `client_id`, `scope`, and `redirect_uri` are all provided; tightening is safe
- `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts` — 18b already tests `client_id` validation (GREEN); 18c-18e test scope enforcement (GREEN)
- `tests/sdk-verification/sdk/slack-method-coverage.test.ts` — confirmed 16 tests, 6 families; `slackLists`, `rtm`, `entity` not yet covered
- `tests/sdk-verification/coverage/generate-report-evidence.ts` — EVIDENCE_MAP confirmed to not include Phase 25/26 test files
- `tests/sdk-verification/coverage/vitest-evidence.json` — confirmed `slack-method-coverage.test.ts`, `slack-signing.test.ts`, `slack-state-tables.test.ts`, `slack-scope-enforcement.test.ts` all MISSING from evidence
- `.planning/v1.2-MILESTONE-AUDIT.md` — authoritative external adversarial audit; exact gaps confirmed with file/line references

### Secondary (MEDIUM confidence)

- `.planning/phases/25-slack-method-coverage-event-signing-state-tables/25-VERIFICATION.md` — confirms 16/16 GREEN for method coverage; confirms `new-families.ts` registers `slackLists`, `rtm`, `entity`
- `.planning/phases/26-slack-chat-scoping-scope-enforcement/26-VERIFICATION.md` — confirms 12/12 GREEN for scope enforcement; confirms `client_id` validation in `oauth.ts`
- `.planning/STATE.md` key decisions — "Store Slack method-to-scope map in method-scopes.ts as single source of truth"; Phase 26 decision: "SLCK-15 tests fixed from result.ok pattern to try/catch"

### Tertiary (LOW confidence)

- Real Slack OAuth `redirect_uri` validation behavior: inferred from SLCK-18 requirement text and RFC 6749; not verified against live Slack API
- `slackLists.*` and `rtm.*` WebClient method signatures: inferred from existing test pattern; actual signatures must be confirmed from `new-families.ts` routes and/or `@slack/web-api` TypeScript types

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all changes within existing files
- Architecture (OAuth binding): HIGH — in-closure Map pattern is standard; `issuedCodes` scope is plugin-level closure
- Architecture (EVIDENCE_MAP): HIGH — format confirmed from existing entries; generator logic verified
- SLCK-18 safe with InstallProvider: HIGH — test confirmed to send all required parameters
- SLCK-14 family completion: MEDIUM — method names for `slackLists`, `rtm`, `entity` need confirmation from `new-families.ts`
- EVIDENCE_MAP admin key format: LOW — must verify from manifest JSON before writing keys

**Research date:** 2026-03-13
**Valid until:** 2026-04-12 (stable codebase; no fast-moving external SDK changes)
