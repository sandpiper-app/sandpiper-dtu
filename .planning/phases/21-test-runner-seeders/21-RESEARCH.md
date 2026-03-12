# Phase 21: Test Runner & Seeders - Research

**Researched:** 2026-03-11
**Domain:** Vitest project configuration, native module ABI, test fixture seeding patterns
**Confidence:** HIGH

## Summary

Phase 21 has two requirements. INFRA-19 is an infrastructure fix: `pnpm test:sdk` fails with an ABI
mismatch crash (`NODE_MODULE_VERSION 137` vs required `141`) and reports "no test files found" as a
secondary symptom. The root cause is that `better-sqlite3`'s prebuilt binary was compiled for Node 23
when the developer's local environment runs Node 25. The fix is a `node-gyp rebuild` of the native
module plus a durable mechanism to prevent the same failure in CI and Docker. After the rebuild, all
177 tests pass immediately with no code changes required.

INFRA-20 is a forward-protection task: add `POST /admin/tokens` to the Shopify twin admin plugin
(the Slack twin already has this endpoint), update `seedShopifyAccessToken()` to use that new
direct-seeding path instead of `POST /admin/oauth/access_token`, and update `seedSlackBotToken()`
to pass a comprehensive scope set derived from a new checked-in method-to-scope catalog. These two
seeders become regression traps: Phase 23 will tighten Shopify OAuth validation so the current
permissive seeder breaks; Phase 26 will add Slack scope enforcement so the current single-scope
seeder breaks. Both changes must land in Phase 21, before any behavioral changes.

**Primary recommendation:** Fix INFRA-19 first (one rebuild + CI update), then INFRA-20 (new
Shopify endpoint + catalog file + seeder update). No new packages or structural changes required.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-19 | `pnpm test:sdk` discovers and executes all SDK verification tests with no "no test files found" error and no ABI mismatch crash; CI pipeline and Docker images use matching Node version with correctly rebuilt native dependencies | Root cause identified: better-sqlite3 NMV 137 vs 141; fix: node-gyp rebuild + CI update |
| INFRA-20 | Test seeders support behavioral tightening: Shopify twin exposes `POST /admin/tokens` for direct token seeding; Slack seeder uses a checked-in method-to-scope catalog shared by seeding and enforcement | Shopify admin plugin missing endpoint; Slack endpoint exists; catalog pattern identified from existing admin plugin patterns |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 12.6.2 | SQLite native module used by StateManager | Already in use; ABI issues solved with node-gyp rebuild |
| `node-gyp` | (bundled with Node) | Native addon compilation | Standard for rebuilding native modules |
| Vitest 3 | 3.2.4 | Test runner | Already in use; `--project sdk-verification` filter works |
| Fastify `FastifyPluginAsync` | existing | Pattern for admin endpoint | All admin routes use this pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pnpm rebuild` | pnpm 9.9.0 | Rebuilds all native modules | Useful shorthand but may not trigger node-gyp if prebuilt binary already present |
| `node-gyp rebuild` | - | Forces recompilation from source | Required when prebuilt binary has wrong NMV |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Documenting `node-gyp rebuild` | `.nvmrc` pin + CI align | Both work; `.nvmrc` prevents future mismatches but dev may use different Node anyway |
| `node-gyp rebuild` in CI | `pnpm.nativeBuildsFromSource` | `nativeBuildsFromSource` is not a standard pnpm config key; node-gyp rebuild is simpler |

**Installation:** No new packages. The fix is a rebuild of an existing dependency.

## Architecture Patterns

### Pattern 1: Shopify Admin Token Endpoint

The Shopify admin plugin (`twins/shopify/src/plugins/admin.ts`) follows a consistent pattern for
test-only endpoints. The Slack twin already has `POST /admin/tokens` (lines 126-150 of its admin
plugin). The Shopify equivalent should mirror it exactly, calling
`fastify.stateManager.createToken(token, shopDomain, scopes)`.

**Existing Slack implementation to mirror:**
```typescript
// Source: twins/slack/src/plugins/admin.ts (lines 131-150)
fastify.post<{
  Body: {
    token: string;
    tokenType: string;
    teamId: string;
    userId: string;
    scope: string;
    appId: string;
  };
}>('/admin/tokens', async (request, reply) => {
  const { token, tokenType, teamId, userId, scope, appId } = request.body ?? {};
  if (!token || !tokenType || !teamId || !userId || !scope || !appId) {
    return reply.status(400).send({ error: 'Missing required fields: ...' });
  }
  fastify.slackStateManager.createToken(token, tokenType, teamId, userId, scope, appId);
  return { ok: true };
});
```

**Shopify variant (simpler — fewer token fields):**
```typescript
// Analogous pattern for twins/shopify/src/plugins/admin.ts
fastify.post<{
  Body: { token: string; shopDomain?: string; scopes?: string };
}>('/admin/tokens', async (request, reply) => {
  const { token, shopDomain, scopes } = request.body ?? {};
  if (!token) return reply.status(400).send({ error: 'token required' });
  fastify.stateManager.createToken(
    token,
    shopDomain ?? 'twin.myshopify.com',
    scopes ?? 'read_orders,write_orders,read_products,write_products,read_customers,write_customers'
  );
  return { token };
});
```

### Pattern 2: Method-to-Scope Catalog

The catalog is a checked-in TypeScript file that both `seedSlackBotToken()` and Phase 26 scope
enforcement import. This single-source-of-truth prevents drift between what the seeder grants and
what enforcement checks.

**Catalog location:** `twins/slack/src/services/method-scopes.ts`

**Shape:** A `Record<string, string[]>` where key is the full Slack method name
(e.g., `'chat.postMessage'`) and value is the array of required scopes.

```typescript
// Source: derived from official Slack API scope table
export const METHOD_SCOPES: Record<string, string[]> = {
  'auth.test':               [],
  'api.test':                [],
  'chat.postMessage':        ['chat:write'],
  'chat.update':             ['chat:write'],
  'chat.delete':             ['chat:write'],
  'chat.postEphemeral':      ['chat:write'],
  'chat.getPermalink':       [],
  'chat.meMessage':          ['chat:write'],
  'chat.scheduleMessage':    ['chat:write'],
  'chat.scheduledMessages.list': ['chat:write'],
  'chat.deleteScheduledMessage': ['chat:write'],
  'chat.unfurl':             ['links:write'],
  'conversations.list':      ['channels:read', 'groups:read', 'im:read', 'mpim:read'],
  'conversations.info':      ['channels:read', 'groups:read', 'im:read', 'mpim:read'],
  'conversations.history':   ['channels:history', 'groups:history', 'mpim:history', 'im:history'],
  'conversations.create':    ['channels:manage'],
  'conversations.join':      ['channels:join'],
  'conversations.leave':     ['channels:write', 'groups:write'],
  'conversations.archive':   ['channels:manage'],
  'conversations.unarchive': ['channels:manage'],
  'conversations.rename':    ['channels:manage'],
  'conversations.invite':    ['channels:manage'],
  'conversations.kick':      ['channels:manage'],
  'conversations.open':      ['im:write', 'mpim:write'],
  'conversations.close':     ['im:write', 'mpim:write'],
  'conversations.mark':      ['channels:write', 'groups:write', 'im:write', 'mpim:write'],
  'conversations.setPurpose':['channels:write', 'groups:write'],
  'conversations.setTopic':  ['channels:write', 'groups:write'],
  'conversations.members':   ['channels:read', 'groups:read', 'mpim:read', 'im:read'],
  'conversations.replies':   ['channels:history', 'groups:history', 'mpim:history', 'im:history'],
  'conversations.requestSharedInvite.list': ['channels:read'],
  'pins.add':                ['pins:write'],
  'pins.list':               ['pins:read'],
  'pins.remove':             ['pins:write'],
  'reactions.add':           ['reactions:write'],
  'reactions.get':           ['reactions:read'],
  'reactions.list':          ['reactions:read'],
  'reactions.remove':        ['reactions:write'],
  'files.list':              ['files:read'],
  'files.delete':            ['files:write'],
  'search.messages':         ['search:read'],
  'reminders.add':           ['reminders:write'],
  'reminders.list':          ['reminders:read'],
  'bots.info':               ['users:read'],
  'emoji.list':              ['emoji:read'],
  'team.info':               ['team:read'],
  'dnd.info':                ['dnd:read'],
  'usergroups.list':         ['usergroups:read'],
  'users.list':              ['users:read'],
  'users.info':              ['users:read'],
  'users.conversations':     ['channels:read', 'groups:read', 'im:read', 'mpim:read'],
  'users.getPresence':       ['users:read'],
  'users.lookupByEmail':     ['users:read.email'],
  'users.profile.get':       ['users.profile:read'],
  'users.identity':          ['identity.basic'],
  'users.profile.set':       ['users.profile:write'],
  'users.setPresence':       ['users:write'],
  'users.deletePhoto':       ['users:write'],
  'views.open':              [],
  'views.publish':           [],
  'views.push':              [],
  'views.update':            [],
};

/** Return the union of all scopes in the catalog as a comma-separated string. */
export function allScopesString(): string {
  const set = new Set<string>();
  for (const scopes of Object.values(METHOD_SCOPES)) {
    for (const s of scopes) set.add(s);
  }
  return [...set].sort().join(',');
}
```

### Pattern 3: Updated `seedSlackBotToken()`

The seeder imports `allScopesString()` from the catalog and passes it as the scope field:

```typescript
// Source: tests/sdk-verification/setup/seeders.ts
import { allScopesString } from '../../../twins/slack/src/services/method-scopes.js';

export async function seedSlackBotToken(token = 'xoxb-test-token'): Promise<string> {
  const slackUrl = process.env.SLACK_API_URL!;
  const res = await fetch(slackUrl + '/admin/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      tokenType: 'bot',
      teamId: 'T_TWIN',
      userId: 'U_BOT_TWIN',
      scope: allScopesString(),
      appId: 'A_TWIN',
    }),
  });
  // ...
}
```

### Pattern 4: Updated `seedShopifyAccessToken()`

After adding `POST /admin/tokens` to the Shopify twin, update the seeder to use it:

```typescript
// Source: tests/sdk-verification/setup/seeders.ts
export async function seedShopifyAccessToken(): Promise<string> {
  const shopifyUrl = process.env.SHOPIFY_API_URL!;
  const token = `shpat_test_${Date.now()}`; // deterministic-enough for tests
  const res = await fetch(shopifyUrl + '/admin/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`seedShopifyAccessToken: POST /admin/tokens failed with ${res.status}`);
  }
  const body = await res.json() as { token: string };
  return body.token;
}
```

### Anti-Patterns to Avoid

- **Using `pnpm rebuild` without verifying it actually recompiled:** `pnpm rebuild` runs silently and may not trigger `node-gyp rebuild` if the prebuilt binary is considered up-to-date. The manual path is `cd node_modules/.pnpm/better-sqlite3@{version}/node_modules/better-sqlite3 && node-gyp rebuild --release`.
- **Hardcoding tokens in tests:** Tests dynamically use the token returned by the seeder. The seeder can choose the token value; tests must not assume a specific value.
- **Defining scopes inline in `seedSlackBotToken()`:** This creates drift. The catalog is the single source of truth.
- **Adding scope enforcement before the catalog lands:** Phase 26 imports the catalog; Phase 21 must ship the catalog first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Native module ABI fix | Manual binary patching | `node-gyp rebuild --release` | Correct tool; produces properly linked binary |
| Scope list | Hardcoded string in seeder | `allScopesString()` from catalog | Drift prevention |
| Token persistence | New SQL table | Existing `stateManager.createToken()` and `slackStateManager.createToken()` | Both already exist and are called by the OAuth plugins |

**Key insight:** Both state managers already have `createToken()` methods. The only missing piece is
the Shopify admin endpoint that calls it directly (the Slack side already has this).

## Common Pitfalls

### Pitfall 1: `pnpm rebuild` Does Not Recompile
**What goes wrong:** `pnpm rebuild better-sqlite3` exits with code 0 but the binary date does not
update. The prebuilt binary is treated as current.
**Why it happens:** `prebuild-install` marks the binary as installed; pnpm sees no need to rebuild.
**How to avoid:** Use `node-gyp rebuild --release` directly in the package directory.
**Warning signs:** Binary timestamp unchanged after rebuild; ABI mismatch persists.

### Pitfall 2: CI Still Uses Node 20, Developer Uses Node 25
**What goes wrong:** Local tests pass after rebuild, but CI fails with ABI mismatch (different NMV).
**Why it happens:** `pnpm install` in CI on Node 20 downloads NMV 115 binary; local uses NMV 141.
**How to avoid:** Either add `pnpm rebuild better-sqlite3` step in the CI workflow after install,
OR add a `.nvmrc` file and align CI to the same Node version.
**Warning signs:** CI workflow passes on Node 20 but `pnpm test:sdk` run locally on Node 25 fails
after a fresh `pnpm install`.

### Pitfall 3: Shopify `POST /admin/oauth/access_token` Still Works — Tests Pass Now
**What goes wrong:** Phase 21 ships without adding `POST /admin/tokens` because existing tests pass
with the current permissive OAuth endpoint.
**Why it happens:** Phase 23 hasn't tightened OAuth yet, so the current seeder still works.
**How to avoid:** Add `POST /admin/tokens` and update the seeder in Phase 21, before Phase 23 lands.
**Warning signs:** If `POST /admin/tokens` is missing when Phase 23 ships, all three Shopify admin
client test files will fail immediately.

### Pitfall 4: Slack Scope String Mismatch
**What goes wrong:** `seedSlackBotToken()` passes scopes but Phase 26 enforcement uses different
scope names, so valid calls are rejected.
**Why it happens:** Scope strings were defined in two places and diverged.
**How to avoid:** Both seeders and Phase 26 enforcement import `METHOD_SCOPES` from the same file.
**Warning signs:** Tests pass before Phase 26 lands, then fail after scope enforcement is added.

### Pitfall 5: Catalog Imported Across Package Boundary
**What goes wrong:** `seeders.ts` imports from `twins/slack/src/services/method-scopes.ts` using
a relative path; TypeScript complains about cross-package imports.
**Why it happens:** `tests/sdk-verification` is not a package that declares `twins/slack` as a
dependency.
**How to avoid:** The import works at runtime via the relative path `../../../twins/slack/src/...`
— the same pattern used in `global-setup.ts` which imports from `twins/shopify/src/index.js` and
`twins/slack/src/index.js`. Use `.js` extensions in import paths to match the existing pattern.

## Code Examples

### Verified: How global-setup.ts does cross-package imports
```typescript
// Source: tests/sdk-verification/setup/global-setup.ts (lines 19-20)
let shopifyApp: Awaited<ReturnType<typeof import('../../../twins/shopify/src/index.js').buildApp>> | null = null;
let slackApp: Awaited<ReturnType<typeof import('../../../twins/slack/src/index.js').buildApp>> | null = null;
```
The seeder can use the same relative path pattern to import the scope catalog.

### Verified: Shopify StateManager.createToken signature
```typescript
// Source: packages/state/src/state-manager.ts
createToken(token: string, shopDomain: string, scopes: string): void
// Persists to: INSERT INTO tokens (token, shop_domain, scopes, created_at) VALUES (?, ?, ?, ?)
```

### Verified: Slack SlackStateManager.createToken signature
```typescript
// Source: twins/slack/src/state/slack-state-manager.ts (line 321)
createToken(token: string, tokenType: string, teamId: string, userId: string, scope: string, appId: string): void
// Persists to: INSERT INTO slack_tokens (token, token_type, team_id, user_id, scope, app_id, created_at) VALUES (...)
```

### Verified: Current seedShopifyAccessToken (to be replaced)
```typescript
// Source: tests/sdk-verification/setup/seeders.ts (lines 28-47)
// Currently calls POST /admin/oauth/access_token — will break in Phase 23
export async function seedShopifyAccessToken(): Promise<string> {
  const res = await fetch(shopifyUrl + '/admin/oauth/access_token', {
    method: 'POST',
    body: JSON.stringify({ client_id: 'test-client-id', client_secret: 'test-client-secret', code: 'test-auth-code' }),
  });
  const body = await res.json() as { access_token: string };
  return body.access_token;
}
```

### Verified: Current seedSlackBotToken scope (to be broadened)
```typescript
// Source: tests/sdk-verification/setup/seeders.ts (line 98)
// Currently passes scope: 'chat:write' — insufficient once Phase 26 lands
scope: 'chat:write',
```

### Verified: node-gyp rebuild command
```bash
# Source: hands-on testing during research (2026-03-11)
# Run from project root:
cd node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3 && node-gyp rebuild --release
# Produces: build/Release/better_sqlite3.node compiled for current Node version
# After rebuild: pnpm test:sdk runs 27 test files, 177 tests, all pass
```

### Verified: CI workflow node version (currently mismatched)
```yaml
# Source: .github/workflows/conformance.yml (lines 36-38, 96-98)
- uses: actions/setup-node@v4
  with:
    node-version: 20   # Dockerfile also uses node:20-slim
    cache: pnpm
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `seedShopifyAccessToken()` via OAuth | `seedShopifyAccessToken()` via `/admin/tokens` | Phase 21 | Survives Phase 23 OAuth tightening |
| `seedSlackBotToken()` with `'chat:write'` | `seedSlackBotToken()` with all 35 scopes from catalog | Phase 21 | Survives Phase 26 scope enforcement |
| No scope catalog | `twins/slack/src/services/method-scopes.ts` | Phase 21 | Single source of truth for Phase 26 |

**Deprecated/outdated after Phase 21:**
- `POST /admin/oauth/access_token` as a seeding mechanism: still valid for OAuth flow tests (Phase 23 will test it) but seeder must not depend on it being permissive
- `scope: 'chat:write'` as the default bot token scope

## Open Questions

1. **Should `POST /admin/tokens` accept an optional scopes field or always use the default?**
   - What we know: the Shopify OAuth endpoint always stores a hardcoded scope set; Shopify auth
     tests don't test scope enforcement (that's not in v1.2 scope)
   - What's unclear: whether any test needs a token with a specific reduced scope set
   - Recommendation: default to the same broad scope the OAuth endpoint currently issues;
     accept optional override for future flexibility

2. **Should `allScopesString()` be sorted for determinism in scope header responses?**
   - What we know: Phase 26 (SLCK-19) will add `X-OAuth-Scopes` header echoing the token's scope
   - What's unclear: whether Slack's real API sorts scopes or preserves insertion order
   - Recommendation: sort alphabetically in `allScopesString()` for deterministic test assertions

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `tests/sdk-verification/vitest.config.ts` |
| Quick run command | `pnpm test:sdk` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-19 | `pnpm test:sdk` discovers 27 test files and runs 177 tests without ABI crash | smoke | `pnpm test:sdk` | All 27 test files exist |
| INFRA-19 | No "no test files found" error | smoke | `pnpm test:sdk` | existing |
| INFRA-19 | No `NODE_MODULE_VERSION` mismatch | smoke | `pnpm test:sdk` | existing |
| INFRA-20 | `POST /admin/tokens` accepts `{ token }` and returns `{ token }` | unit/integration | `pnpm test:sdk` (shopify-admin tests) | existing tests exercise it indirectly |
| INFRA-20 | `seedSlackBotToken()` seeds token with all 35 catalog scopes | integration | `pnpm test:sdk` (all slack tests) | existing |

### Sampling Rate
- **Per task commit:** `pnpm test:sdk`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** `pnpm test:sdk` green (177 tests) before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Phase 21 does not introduce new
test files; it makes the existing 177 tests run reliably and prepares seeders for future phases.

## Sources

### Primary (HIGH confidence)
- Hands-on: `pnpm test:sdk` run before and after `node-gyp rebuild` — confirmed root cause and fix
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/setup/seeders.ts` — current seeder implementation
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/admin.ts` — existing Slack `POST /admin/tokens` endpoint (lines 126-150)
- `/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/admin.ts` — confirms no `POST /admin/tokens` endpoint exists
- `/Users/futur/projects/sandpiper-dtu/.github/workflows/conformance.yml` — CI uses `node-version: 20`
- `/Users/futur/projects/sandpiper-dtu/Dockerfile` — Docker uses `node:20-slim`
- `/Users/futur/projects/sandpiper-dtu/twins/slack/src/state/slack-state-manager.ts` — `createToken` signature
- `/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts` — Shopify `createToken` signature

### Secondary (MEDIUM confidence)
- Official Slack API method reference: scope requirements per method (standard, well-documented)

### Tertiary (LOW confidence)
- Node.js NODE_MODULE_VERSION mapping (23.x = 137, 25.x = 141): from community documentation;
  not verified against official Node.js release notes during this research session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in use; verified working after rebuild
- Architecture: HIGH — all patterns verified directly from existing code
- Pitfalls: HIGH — ABI mismatch confirmed by running `pnpm test:sdk`; scope risks from requirement spec

**Research date:** 2026-03-11
**Valid until:** 2026-06-11 (stable domain; only changes if Node major version changes or Slack changes scope requirements)
