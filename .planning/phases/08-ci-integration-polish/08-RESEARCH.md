# Phase 8: CI & Integration Polish - Research

**Researched:** 2026-02-28
**Domain:** CI workflows, dead code removal, API surface completion, documentation hygiene
**Confidence:** HIGH

## Summary

Phase 8 is a gap-closure phase addressing five specific issues identified by the v1.0 milestone audit. All five items are well-scoped, non-critical, and involve modifications to existing code rather than new architectural decisions. The work decomposes into: (1) adding Slack conformance to the CI workflow, (2) renaming a misleadingly-named CI job, (3) removing the orphaned `@dtu/core` package, (4) exposing `/admin/errors/*` endpoints on the Slack twin matching the existing Shopify pattern, and (5) adding missing `requirements_completed` frontmatter to Phase 5 SUMMARY files.

No external library research is needed -- all patterns already exist in the codebase from earlier phases. The Shopify twin's `errorsPlugin` (at `twins/shopify/src/plugins/errors.ts`) provides the exact template for the Slack error config API. The `conformance.yml` workflow already has the Shopify conformance job structure that needs to be replicated for Slack. The `@dtu/core` removal is a straightforward dependency cleanup across `package.json`, `tsconfig.json`, and `pnpm-workspace.yaml` files.

**Primary recommendation:** Execute all five items in a single plan. Each is a 5-15 minute task with no dependencies between them. The only ordering constraint is that `pnpm install` must run after `@dtu/core` removal to verify the lockfile regenerates cleanly.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-06 | Conformance suites run periodically (CI schedule) to detect upstream API drift | Gap 1: Slack conformance suite (21 tests, 4 suites) exists at `twins/slack/conformance/` with `conformance:twin` script in package.json, but `conformance.yml` CI workflow only runs Shopify conformance. Add parallel Slack job. |
| INFRA-09 | Twin development grounded in StrongDM DTU methodology | Gap 2-4: CI naming accuracy (twin-mode, not offline), dead code removal (@dtu/core), and API surface completeness (Slack /admin/errors/*) all contribute to integration polish aligning with DTU methodology. |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. Phase 8 uses only existing project infrastructure.

| Library | Version | Purpose | Already In Project |
|---------|---------|---------|-------------------|
| GitHub Actions | N/A | CI workflow definitions | Yes -- `.github/workflows/conformance.yml` |
| Fastify | ^5.0.0 | HTTP framework for Slack error config routes | Yes -- all twins |
| pnpm | 9.x | Workspace dependency management | Yes -- project-wide |
| TypeScript | ^5.7.3 | Build system and type checking | Yes -- project-wide |

### Supporting

None required.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Removing @dtu/core entirely | Moving useful exports into it | No runtime consumers exist; CORE_VERSION export is unused. Removal is simpler and cleaner. |
| Slack-specific ErrorSimulator class | Inline error checking in each route | Slack twin already has inline error checking in each Web API route handler -- this is correct for Slack's HTTP 200 + `{ok: false}` pattern. No ErrorSimulator class needed. |

## Architecture Patterns

### Pattern 1: CI Workflow Job Replication (Slack Conformance)

**What:** Add a `conformance-twin-slack` job to `conformance.yml` that mirrors the existing `conformance-twin` (Shopify) job structure, plus optionally a `conformance-live-slack` job for scheduled runs.

**When to use:** When a new twin has conformance infrastructure but was never wired into CI.

**Current state of `conformance.yml`:**
```yaml
jobs:
  conformance-twin:
    name: Twin Conformance
    # ... setup steps ...
    - name: Run twin conformance suite
      run: pnpm --filter @dtu/twin-shopify run conformance:twin

  conformance-live:
    name: Live Conformance (scheduled only)
    if: github.event_name == 'schedule'
    # ... runs pnpm --filter @dtu/twin-shopify run conformance:live
```

**Required change:** Add parallel jobs for Slack:
```yaml
  conformance-twin-slack:
    name: Slack Twin Conformance
    runs-on: ubuntu-latest
    steps:
      # Same setup as conformance-twin (checkout, pnpm, node, install, build)
      - name: Run Slack twin conformance suite
        run: pnpm --filter @dtu/twin-slack run conformance:twin
```

**Key detail:** The Slack twin already has `conformance:twin` script defined in `twins/slack/package.json` (line 13). The script and suite infrastructure are complete -- only the CI wiring is missing.

**Live conformance for Slack:** The `conformance:live` script exists in `twins/slack/package.json` but would need Slack API credentials as GitHub secrets (`SLACK_BOT_TOKEN`, etc.). This can be added as a future enhancement -- the twin-mode CI job is the audit gap that must close.

### Pattern 2: CI Job Renaming (conformance-offline -> conformance-twin)

**What:** The `conformance-twin` job in `conformance.yml` currently has the correct YAML key (`conformance-twin`) and correct display name (`Twin Conformance`). The audit identified that the job was *previously* named `conformance-offline` during Phase 3 (see `03-VERIFICATION.md` line 33 which references `conformance-offline` job running `conformance:twin`).

**Current state investigation:** Reading the actual `conformance.yml` file, the job key is already `conformance-twin` with name `Twin Conformance`. The audit tech debt item says "conformance-offline CI job name is misleading." This may have already been renamed, or the audit was referencing the original Phase 3 plan which used `conformance-offline` as the job key.

**Action:** Verify the current job key/name in `conformance.yml` is already correct (`conformance-twin` / `Twin Conformance`). If it is, this item is already resolved and just needs to be documented as such. If it still says `conformance-offline`, rename it to `conformance-twin`.

### Pattern 3: Dead Package Removal (@dtu/core)

**What:** Remove `@dtu/core` package entirely -- it exports only `CORE_VERSION = '0.1.0'` and zero consumers import it.

**Files requiring modification:**
1. **Delete:** `packages/core/` directory entirely (src/index.ts, package.json, tsconfig.json, dist/)
2. **`pnpm-workspace.yaml`:** No change needed -- uses `packages/*` glob, removal of directory is sufficient
3. **`tsconfig.base.json`:** Remove `"@dtu/core": ["./packages/core/src"]` from `compilerOptions.paths`
4. **`twins/shopify/package.json`:** Remove `"@dtu/core": "workspace:*"` from dependencies
5. **`twins/slack/package.json`:** Remove `"@dtu/core": "workspace:*"` from dependencies
6. **`twins/example/package.json`:** Remove `"@dtu/core": "workspace:*"` from dependencies
7. **`twins/shopify/tsconfig.json`:** Remove `{ "path": "../../packages/core" }` from references
8. **`twins/slack/tsconfig.json`:** Remove `{ "path": "../../packages/core" }` from references
9. **`twins/example/tsconfig.json`:** Remove `{ "path": "../../packages/core" }` from references
10. **`pnpm-lock.yaml`:** Regenerated automatically via `pnpm install`

**Verification:** After removal, `pnpm build` must succeed and `pnpm test` must pass. The `Dockerfile` copies `packages/` directory (line 21) -- with `packages/core/` removed, this is automatically handled since Docker COPY only copies what exists.

### Pattern 4: Slack Error Config API Surface

**What:** Add `/admin/errors/configure`, `/admin/errors/enable`, `/admin/errors/disable` endpoints to the Slack twin, matching the Shopify twin's `errorsPlugin` pattern.

**Key architectural difference:** The Shopify twin uses an `ErrorSimulator` class with a `globalEnabled` toggle because errors are injected into GraphQL resolver execution via `throwIfConfigured()`. The Slack twin uses a different pattern -- each Web API route handler directly checks `slackStateManager.getErrorConfig('method.name')` and short-circuits with an error response if configured. This means:

1. **No `ErrorSimulator` class needed** -- Slack already does inline error checking per route
2. **No `globalEnabled` toggle needed** -- Slack error configs have per-row `enabled` boolean in `slack_error_configs` table
3. **The `/admin/errors/configure` endpoint** should call `slackStateManager.createErrorConfig(methodName, config)` -- this method already exists (line 316 of `slack-state-manager.ts`)
4. **Enable/disable** can toggle the `enabled` field per method, or use `clearErrorConfigs()` to remove all configs

**Existing DB schema (already created in migrations):**
```sql
CREATE TABLE IF NOT EXISTS slack_error_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method_name TEXT UNIQUE NOT NULL,
  status_code INTEGER,
  error_body TEXT,
  delay_ms INTEGER,
  enabled BOOLEAN DEFAULT 1
);
```

**Existing state manager methods (already implemented):**
- `createErrorConfig(methodName, config)` -- INSERT OR REPLACE
- `getErrorConfig(methodName)` -- SELECT WHERE enabled = 1
- `clearErrorConfigs()` -- DELETE all

**Existing route handler integration (already wired in all 7 methods):**
```typescript
// Already present in chat.ts, conversations.ts, users.ts:
const errorConfig = fastify.slackStateManager.getErrorConfig('chat.postMessage');
if (errorConfig) {
  const errorBody = errorConfig.error_body
    ? JSON.parse(errorConfig.error_body)
    : { ok: false, error: 'simulated_error' };
  return reply.status(errorConfig.status_code ?? 200).send(errorBody);
}
```

**What's missing:** Only the admin API surface to CONFIGURE error configs. The DB schema, state manager methods, and route handler checks are all already wired. This is a matter of adding 3 routes to a new `errors.ts` plugin file or appending to `admin.ts`.

**Route design (matching Shopify pattern adapted for Slack):**
```typescript
// POST /admin/errors/configure
// Body: { methodName: string, statusCode?: number, errorBody?: object, delayMs?: number }
// Creates/replaces error config for the given method

// POST /admin/errors/clear
// Clears all error configs (equivalent of disable-all for Slack's per-method model)

// GET /admin/errors
// Lists all configured error configs for inspection
```

### Pattern 5: SUMMARY Frontmatter Fix

**What:** Add `requirements_completed` field to Phase 5 SUMMARY frontmatter files.

**Mapping (from VERIFICATION.md and REQUIREMENTS.md):**
- **05-01-SUMMARY.md:** SLCK-03 (OAuth), SLCK-05 (url_verification -- though this was wired in 05-03)
- **05-02-SUMMARY.md:** SLCK-01 (Web API methods), SLCK-06 (rate limiting), SLCK-04 (Block Kit)
- **05-03-SUMMARY.md:** SLCK-02 (Events API), SLCK-04 (interactions -- partial), SLCK-05 (url_verification)

**Simplified approach:** The audit specifically flags SLCK-02, SLCK-04, SLCK-05, SLCK-06 as missing from frontmatter. The simplest fix is to add `requirements_completed` to the SUMMARY file where each was primarily implemented:
- **05-02-SUMMARY.md:** Add `requirements_completed: [SLCK-01, SLCK-04, SLCK-06]`
- **05-03-SUMMARY.md:** Add `requirements_completed: [SLCK-02, SLCK-05]`
- **05-01-SUMMARY.md:** Add `requirements_completed: [SLCK-03]`

### Anti-Patterns to Avoid

- **Over-engineering the Slack error API:** Do not create an `ErrorSimulator` class for Slack -- the inline `getErrorConfig()` pattern in each route handler is correct for Slack's HTTP-200-with-error-body model. An ErrorSimulator class is only needed for GraphQL where errors are thrown as exceptions.
- **Adding Slack live conformance secrets prematurely:** Do not add `SLACK_BOT_TOKEN` secrets to the CI workflow unless Slack live conformance is explicitly requested. The audit gap is about twin-mode CI, not live mode.
- **Breaking the Dockerfile build:** When removing `@dtu/core`, do not modify the Dockerfile's `COPY packages/ ./packages/` line -- it copies whatever exists and the absence of `packages/core/` is handled automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slack error config storage | Custom error table/logic | Existing `slack_error_configs` table + `SlackStateManager` methods | Already built, tested, and wired into all 7 Web API routes |
| CI workflow structure | Novel CI pattern | Copy existing `conformance-twin` job structure | Proven pattern, consistent formatting |
| Frontmatter format | Custom format | Match existing `02-02-SUMMARY.md` format | Already established convention |

**Key insight:** Every piece of infrastructure needed for this phase already exists in the codebase. The work is exclusively wiring, cleanup, and documentation -- zero new library integration.

## Common Pitfalls

### Pitfall 1: Forgetting pnpm-lock.yaml Regeneration After @dtu/core Removal

**What goes wrong:** Removing `@dtu/core` from `package.json` files without running `pnpm install` leaves a stale `pnpm-lock.yaml` that references a non-existent workspace package, causing CI `pnpm install --frozen-lockfile` to fail.

**Why it happens:** Developers remove the dependency declarations but forget the lockfile must be regenerated.

**How to avoid:** Run `pnpm install` after all `package.json` modifications to regenerate the lockfile. Commit the updated `pnpm-lock.yaml`.

**Warning signs:** `pnpm install --frozen-lockfile` fails in CI with "workspace package not found" errors.

### Pitfall 2: Breaking TypeScript Build References

**What goes wrong:** Removing `@dtu/core` from `tsconfig.json` references but leaving a stale path alias in `tsconfig.base.json`, or vice versa.

**Why it happens:** TypeScript project references and path aliases are configured in different files.

**How to avoid:** Remove from both `tsconfig.base.json` (paths) AND each twin's `tsconfig.json` (references). Run `pnpm build` to verify.

**Warning signs:** `tsc --build` shows "Referenced project not found" or path resolution errors.

### Pitfall 3: Inconsistent Error API Design Between Twins

**What goes wrong:** Creating Slack error endpoints that work differently from Shopify error endpoints, confusing developers who switch between twins.

**Why it happens:** Slack's error model (HTTP 200 + ok:false) differs from Shopify's (GraphQL errors).

**How to avoid:** Keep the admin API surface similar (`/admin/errors/configure`) but adapt the implementation to use existing Slack patterns. The request body can use `methodName` instead of `operationName` to reflect Slack's terminology, but the endpoint paths should match.

**Warning signs:** Developers need to learn different error configuration APIs for each twin.

### Pitfall 4: CI Job Matrix vs Separate Jobs

**What goes wrong:** Using a matrix strategy to run Shopify and Slack conformance in a single job definition, causing both to fail if one twin has issues.

**Why it happens:** DRY instinct leads to matrix strategies, but conformance failures should be independent.

**How to avoid:** Use separate jobs for each twin's conformance. This gives independent pass/fail status in the GitHub Actions UI.

**Warning signs:** A Slack conformance failure blocks the Shopify conformance status check.

## Code Examples

### CI Workflow: Adding Slack Conformance Job

```yaml
# Source: existing conformance.yml pattern
  conformance-twin-slack:
    name: Slack Twin Conformance
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Install dependencies
        run: pnpm install
      - name: Build packages
        run: pnpm build
      - name: Run Slack twin conformance suite
        run: pnpm --filter @dtu/twin-slack run conformance:twin
```

### Slack Error Config Plugin

```typescript
// Source: adapted from twins/shopify/src/plugins/errors.ts
// File: twins/slack/src/plugins/errors.ts

import type { FastifyPluginAsync } from 'fastify';

export const slackErrorsPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /admin/errors/configure
  fastify.post<{
    Body: {
      methodName: string;
      statusCode?: number;
      errorBody?: object;
      delayMs?: number;
    };
  }>('/admin/errors/configure', async (request) => {
    const { methodName, statusCode, errorBody, delayMs } = request.body;
    fastify.slackStateManager.createErrorConfig(methodName, {
      status_code: statusCode,
      error_body: errorBody,
      delay_ms: delayMs,
      enabled: true,
    });
    return { configured: true, methodName };
  });

  // GET /admin/errors - list all error configs
  fastify.get('/admin/errors', async () => {
    const rows = fastify.slackStateManager.database
      .prepare('SELECT * FROM slack_error_configs')
      .all();
    return { configs: rows };
  });

  // POST /admin/errors/clear - remove all error configs
  fastify.post('/admin/errors/clear', async () => {
    fastify.slackStateManager.clearErrorConfigs();
    return { cleared: true };
  });
};
```

### Removing @dtu/core from package.json

```json
// Before (twins/shopify/package.json):
"dependencies": {
  "@dtu/core": "workspace:*",     // REMOVE THIS LINE
  "@dtu/state": "workspace:*",
  ...
}

// After:
"dependencies": {
  "@dtu/state": "workspace:*",
  ...
}
```

### Removing @dtu/core from tsconfig.json

```json
// Before (twins/shopify/tsconfig.json):
"references": [
  { "path": "../../packages/types" },
  { "path": "../../packages/state" },
  { "path": "../../packages/core" },      // REMOVE THIS LINE
  { "path": "../../packages/webhooks" },
  { "path": "../../packages/conformance" }
]

// After:
"references": [
  { "path": "../../packages/types" },
  { "path": "../../packages/state" },
  { "path": "../../packages/webhooks" },
  { "path": "../../packages/conformance" }
]
```

### SUMMARY Frontmatter Addition

```yaml
# Before (05-02-SUMMARY.md):
---
phase: 05-slack-twin-web-api-events
plan: 02
status: complete
started: 2026-02-28
completed: 2026-02-28
---

# After:
---
phase: 05-slack-twin-web-api-events
plan: 02
status: complete
started: 2026-02-28
completed: 2026-02-28
requirements_completed: [SLCK-01, SLCK-04, SLCK-06]
---
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `conformance-offline` job name | `conformance-twin` job name | Already renamed (post Phase 3) | Workflow file already has correct naming; audit item may be resolved |

**Deprecated/outdated:**
- `@dtu/core` package: Never gained real consumers. Original research envisioned it holding HTTP framework utilities, but these ended up directly in each twin. Should be removed rather than rehabilitated.

## Open Questions

1. **Should `conformance-live-slack` be added for scheduled Slack API drift detection?**
   - What we know: The `conformance:live` script exists in `twins/slack/package.json`. Running it requires Slack API credentials as GitHub secrets.
   - What's unclear: Whether Slack sandbox/test workspace credentials are available.
   - Recommendation: Add the CI job structure with a comment noting that secrets must be configured. Gate it with `if: github.event_name == 'schedule'` like the Shopify live job. Mark as non-blocking for phase completion.

2. **Is the `conformance-offline` rename already done?**
   - What we know: The current `conformance.yml` file uses `conformance-twin` as the job key and `Twin Conformance` as the display name. The audit references `conformance-offline` from Phase 3's original plan.
   - What's unclear: Whether the audit was referencing current state or historical state.
   - Recommendation: Verify at implementation time. If already correct, document as resolved and skip.

3. **Should the Slack error API include enable/disable toggles like Shopify?**
   - What we know: Shopify's ErrorSimulator has a global `enable()`/`disable()` because errors are injected at the GraphQL layer. Slack's error checking is per-method with per-row `enabled` boolean.
   - What's unclear: Whether a global toggle adds value when per-method enable/disable works.
   - Recommendation: Skip global toggle. Provide `/admin/errors/configure` (per-method) and `/admin/errors/clear` (remove all). This matches Slack's existing per-method checking pattern.

## Sources

### Primary (HIGH confidence)

- **Project codebase:** Direct file reads of `conformance.yml`, `twins/slack/package.json`, `twins/shopify/src/plugins/errors.ts`, `twins/slack/src/state/slack-state-manager.ts`, `twins/slack/src/plugins/admin.ts`, Phase 5 SUMMARY files, `packages/core/src/index.ts`, all twin `tsconfig.json` files
- **v1.0 Milestone Audit:** `.planning/v1.0-MILESTONE-AUDIT.md` -- authoritative source for all five gaps
- **ROADMAP.md:** Phase 8 success criteria and gap descriptions

### Secondary (MEDIUM confidence)

- **Phase verification documents:** Cross-referenced requirement completion status across `VERIFICATION.md` and `REQUIREMENTS.md`

### Tertiary (LOW confidence)

None -- all findings are based on direct codebase inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all patterns exist in codebase
- Architecture: HIGH -- direct code inspection of existing patterns to replicate
- Pitfalls: HIGH -- all pitfalls identified from concrete file dependencies
- Gap scope: HIGH -- all five items fully specified by audit report with file-level evidence

**Research date:** 2026-02-28
**Valid until:** Indefinite -- this is internal codebase cleanup with no external dependency risk
