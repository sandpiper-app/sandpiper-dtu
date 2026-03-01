# Phase 11: Final Polish - Research

**Researched:** 2026-03-01
**Domain:** Integration tech debt closure (admin API parity, TypeScript config hygiene, documentation backfill)
**Confidence:** HIGH

## Summary

Phase 11 addresses four discrete tech debt items identified in the v1.0 final audit. None involve new requirements -- all 30 v1 requirements are already satisfied. The work is purely mechanical: adding missing endpoints to Shopify's error admin API, removing a stale tsconfig reference, adding a missing tsconfig project reference, and backfilling frontmatter in 24 SUMMARY.md files.

All four items are independently verifiable and have no runtime dependencies on each other. The Shopify error inspection endpoints can be modeled directly on the existing Slack implementation in `twins/slack/src/plugins/errors.ts`. The tsconfig fixes are single-line edits. The SUMMARY frontmatter backfill requires mapping each plan's `requirements:` field from its PLAN.md to determine the correct `requirements_completed` value.

**Primary recommendation:** Execute all four items in a single plan with four tasks. Each task is self-contained and can be verified independently.

## Standard Stack

### Core

No new libraries needed. All changes use existing infrastructure:

| Component | Location | Purpose |
|-----------|----------|---------|
| Fastify route handlers | `twins/shopify/src/plugins/errors.ts` | Add GET endpoints to existing error plugin |
| StateManager | `packages/state/src/state-manager.ts` | Existing `getErrorConfig()` and error_configs table |
| TypeScript project references | `tsconfig.conformance.json`, `tsconfig.json` | Fix stale/missing references |
| YAML frontmatter | `.planning/phases/*/XX-SUMMARY.md` | Add `requirements_completed` field |

### Alternatives Considered

None. This is mechanical tech debt closure with no design decisions.

## Architecture Patterns

### Pattern 1: Shopify Error Inspection Endpoints (matching Slack)

**What:** Add `GET /admin/errors` and `GET /admin/errors/:operation` to Shopify twin, matching Slack twin's error inspection API.

**Current Shopify errors.ts routes:**
- `POST /admin/errors/configure` -- creates error config (EXISTS)
- `POST /admin/errors/enable` -- enables global error simulator (EXISTS)
- `POST /admin/errors/disable` -- disables global error simulator (EXISTS)
- `GET /admin/errors` -- MISSING
- `GET /admin/errors/:operation` -- MISSING (not in Slack either, but SC1 specifies it)

**Current Slack errors.ts routes (reference implementation):**
- `POST /admin/errors/configure` -- creates error config (EXISTS)
- `GET /admin/errors` -- lists all configs (EXISTS)
- `POST /admin/errors/clear` -- clears all configs (EXISTS)

**Key implementation details:**
- Slack's `GET /admin/errors` uses direct SQL: `fastify.slackStateManager.database.prepare('SELECT * FROM slack_error_configs').all()`
- Shopify should use `fastify.stateManager` which has `getErrorConfig(operationName)` for single lookups and the `error_configs` table for listing all
- Shopify's `error_configs` table (from `packages/state/src/state-manager.ts` line 313): columns are `id`, `operation_name`, `status_code`, `error_body`, `delay_ms`, `enabled`
- For `GET /admin/errors/:operation`, use existing `stateManager.getErrorConfig(operationName)` method

**Example (Shopify GET /admin/errors):**
```typescript
// List all configured error configs
fastify.get('/admin/errors', async () => {
  const db = fastify.stateManager.database;
  const rows = db.prepare('SELECT * FROM error_configs').all();
  return { configs: rows };
});

// Get error config for a specific operation
fastify.get<{ Params: { operation: string } }>(
  '/admin/errors/:operation',
  async (request) => {
    const config = fastify.stateManager.getErrorConfig(request.params.operation);
    return config ? { config } : { config: null };
  }
);
```

**Important:** The Shopify StateManager exposes a `.database` getter for the underlying better-sqlite3 Database instance (same pattern Slack uses). Verify this accessor exists before relying on it.

### Pattern 2: tsconfig.conformance.json Fix

**What:** Remove the `{ "path": "../../packages/core" }` reference from `twins/shopify/tsconfig.conformance.json` line 13.

**Current state (from file read):**
```json
{
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/state" },
    { "path": "../../packages/core" },     // <-- DELETE THIS LINE
    { "path": "../../packages/webhooks" },
    { "path": "../../packages/conformance" },
    { "path": "." }
  ]
}
```

**Context:** `packages/core/` was deleted in Phase 8 (commit 897b231). The main `twins/shopify/tsconfig.json` had its `@dtu/core` reference removed then, but `tsconfig.conformance.json` was missed.

### Pattern 3: Slack tsconfig.json Project Reference

**What:** Add `{ "path": "../../packages/conformance" }` to `twins/slack/tsconfig.json` references.

**Current Shopify tsconfig.json references (the pattern to match):**
```json
{
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/state" },
    { "path": "../../packages/webhooks" },
    { "path": "../../packages/conformance" },
    { "path": "../../packages/ui" }
  ]
}
```

**Current Slack tsconfig.json references (missing conformance):**
```json
{
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/state" },
    { "path": "../../packages/webhooks" },
    { "path": "../../packages/ui" }
  ]
}
```

**Note:** Slack twin does have a conformance directory (`twins/slack/conformance/`) and imports from `@dtu/conformance`, but its main tsconfig.json does not list it as a project reference. However, Slack does NOT have a `tsconfig.conformance.json` file (unlike Shopify). The SC says "twins/slack/tsconfig.json includes @dtu/conformance project reference (matching Shopify)". Add `{ "path": "../../packages/conformance" }` to the references array, positioned to match Shopify's ordering (after webhooks, before ui).

### Pattern 4: SUMMARY.md Frontmatter Backfill

**What:** Add `requirements_completed` field to all 24 SUMMARY.md files currently missing it.

**Files that already have `requirements_completed` (4 files -- leave untouched):**
1. `02-02-SUMMARY.md`: `[SHOP-01]`
2. `05-01-SUMMARY.md`: `[SLCK-03]`
3. `05-02-SUMMARY.md`: `[SLCK-01, SLCK-04, SLCK-06]`
4. `05-03-SUMMARY.md`: `[SLCK-02, SLCK-05]`
5. `08-01-SUMMARY.md`: `[INFRA-06, INFRA-09]`

**Requirement-to-plan mapping (derived from PLAN.md `requirements:` fields):**

| SUMMARY File | requirements_completed | Source |
|-------------|----------------------|--------|
| 01-01-SUMMARY.md | `[INFRA-01, INFRA-09]` | 01-01-PLAN.md |
| 01-02-SUMMARY.md | `[INFRA-02, INFRA-07, INFRA-08]` | 01-02-PLAN.md |
| 02-01-SUMMARY.md | `[SHOP-02, SHOP-07, INFRA-03]` | 02-01-PLAN.md |
| 02-02-SUMMARY.md | `[SHOP-01]` | Already has it |
| 02-03-SUMMARY.md | `[SHOP-03, INFRA-04]` | 02-03-PLAN.md |
| 02-04-SUMMARY.md | `[]` | 02-04-PLAN.md lists SHOP-07, INFRA-04 but these are gap closure -- requirements already completed in prior plans |
| 02-05-SUMMARY.md | `[]` | 02-05-PLAN.md is gap closure (productUpdate/fulfillmentCreate) -- requirements already attributed |
| 03-01-SUMMARY.md | `[INFRA-05]` | 03-01-PLAN.md |
| 03-02-SUMMARY.md | `[INFRA-05]` | 03-02-PLAN.md (framework side) |
| 03-03-SUMMARY.md | `[INFRA-06]` | 03-03-PLAN.md (CI integration) |
| 04-01-SUMMARY.md | `[SHOP-04]` | 04-01-PLAN.md |
| 04-02-SUMMARY.md | `[SHOP-05]` | 04-02-PLAN.md |
| 04-03-SUMMARY.md | `[SHOP-06]` | 04-03-PLAN.md |
| 05-01-SUMMARY.md | `[SLCK-03]` | Already has it |
| 05-02-SUMMARY.md | `[SLCK-01, SLCK-04, SLCK-06]` | Already has it |
| 05-03-SUMMARY.md | `[SLCK-02, SLCK-05]` | Already has it |
| 06-01-SUMMARY.md | `[UI-05]` | 06-01-PLAN.md |
| 06-02-SUMMARY.md | `[UI-01, UI-02]` | 06-02-PLAN.md |
| 06-03-SUMMARY.md | `[UI-03, UI-04]` | 06-03-PLAN.md |
| 06-04-SUMMARY.md | `[]` | 06-04-PLAN.md is conformance audit -- requirements already attributed |
| 06-05-SUMMARY.md | `[]` | 06-05-PLAN.md is UI gap closure -- requirements already attributed |
| 06-06-SUMMARY.md | `[]` | 06-06-PLAN.md is Slack conformance infra -- requirements already attributed |
| 07-01-SUMMARY.md | `[INTG-01, INTG-03]` | 07-01-PLAN.md |
| 07-02-SUMMARY.md | `[INTG-02]` | 07-02-PLAN.md |
| 08-01-SUMMARY.md | `[INFRA-06, INFRA-09]` | Already has it |
| 09-01-SUMMARY.md | `[]` | No requirements (tech debt) |
| 10-01-SUMMARY.md | `[SHOP-01]` | 10-01-PLAN.md (InventoryItem wiring) |
| 10-02-SUMMARY.md | `[INFRA-06]` | 10-02-PLAN.md (Slack live conformance CI) |

**Total: 28 SUMMARY files. 5 already have the field. 23 need it added.**

**Frontmatter insertion pattern:** Add `requirements_completed: [...]` as a new line in the YAML frontmatter block. For files with existing structured frontmatter (the `---` delimited block), insert after the last metadata field before `---`. For plans with no requirements, use `requirements_completed: []`.

**Important nuance on duplicate requirements:** Some requirements appear in multiple plans (e.g., SHOP-01 in 02-02 and 10-01, INFRA-05 in 03-01 and 03-02, INFRA-06 in 03-03, 08-01, and 10-02). This is correct -- the requirement was incrementally satisfied across plans. Each plan should list what it contributed to.

### Anti-Patterns to Avoid

- **Don't modify SUMMARY content beyond frontmatter**: Only add the `requirements_completed` field to the YAML frontmatter block. Do not alter the markdown body.
- **Don't reformat existing frontmatter**: Preserve existing field order and formatting. Only add the new field.
- **Don't add `requirements_completed` to non-SUMMARY files**: The SC specifically says "SUMMARY.md files".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error config listing | New StateManager method | Direct SQL on `stateManager.database` | Slack established this pattern; single-use admin query doesn't need a prepared statement |
| Requirement mapping | Manual guesswork | PLAN.md `requirements:` fields | Each plan explicitly declares which requirements it addresses |

## Common Pitfalls

### Pitfall 1: StateManager.database Accessor Availability

**What goes wrong:** Assuming `stateManager.database` is a public accessor without verifying.
**Why it happens:** Slack uses `slackStateManager.database` but Shopify uses the shared StateManager which may or may not expose the raw DB.
**How to avoid:** Check `packages/state/src/state-manager.ts` for a `database` getter. If not present, use a prepared statement approach or add the getter.
**Warning signs:** TypeScript compile error on `fastify.stateManager.database`.

### Pitfall 2: tsconfig.conformance.json Build Validation

**What goes wrong:** Removing the `@dtu/core` reference but not verifying `tsc --build` still works.
**Why it happens:** The conformance tsconfig might have transitive dependencies that relied on `@dtu/core`.
**How to avoid:** Run `pnpm build` after the edit and verify no errors.
**Warning signs:** TypeScript errors referencing missing modules from `@dtu/core`.

### Pitfall 3: YAML Frontmatter Parsing

**What goes wrong:** Malformed YAML after inserting `requirements_completed` field.
**Why it happens:** Inconsistent frontmatter formatting across files -- some use flow sequences `[A, B]`, others might use block sequences.
**How to avoid:** Use flow sequence format `[REQ-ID, REQ-ID]` consistently (matching the pattern in existing files like 05-01-SUMMARY.md).
**Warning signs:** YAML linter errors, frontmatter not rendering correctly.

### Pitfall 4: 02-03-SUMMARY.md Has No YAML Frontmatter Block

**What goes wrong:** Some SUMMARY files (like 02-03) start with markdown content instead of a `---` delimited YAML frontmatter block.
**Why it happens:** Different plans were executed at different times with evolving conventions.
**How to avoid:** For files without a proper YAML frontmatter block, the `requirements_completed` field cannot simply be "inserted into frontmatter" -- it needs a frontmatter block added or the field needs to be appended to whatever pseudo-frontmatter exists.
**Warning signs:** The file starts with `##` instead of `---`.

## Code Examples

### Shopify GET /admin/errors Endpoint

```typescript
// Source: Modeled on twins/slack/src/plugins/errors.ts lines 37-42
// Add to twins/shopify/src/plugins/errors.ts

// GET /admin/errors - List all configured error configs
fastify.get('/admin/errors', async () => {
  const db = fastify.stateManager.database;
  const rows = db.prepare('SELECT * FROM error_configs').all();
  return { configs: rows };
});

// GET /admin/errors/:operation - Get config for specific operation
fastify.get<{ Params: { operation: string } }>(
  '/admin/errors/:operation',
  async (request) => {
    const config = fastify.stateManager.getErrorConfig(request.params.operation);
    return config ? { config } : { config: null };
  }
);
```

### tsconfig.conformance.json Fix

```json
// Remove line 13: { "path": "../../packages/core" },
// Result:
{
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/state" },
    { "path": "../../packages/webhooks" },
    { "path": "../../packages/conformance" },
    { "path": "." }
  ]
}
```

### Slack tsconfig.json Fix

```json
// Add conformance reference after webhooks:
{
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/state" },
    { "path": "../../packages/webhooks" },
    { "path": "../../packages/conformance" },
    { "path": "../../packages/ui" }
  ]
}
```

### SUMMARY Frontmatter Insertion Example

```yaml
# Before (01-01-SUMMARY.md):
---
phase: 01-foundation-monorepo-setup
plan: 01
subsystem: infra
tags: [pnpm, typescript, monorepo, workspace]
# ... other fields ...
---

# After:
---
phase: 01-foundation-monorepo-setup
plan: 01
subsystem: infra
tags: [pnpm, typescript, monorepo, workspace]
requirements_completed: [INFRA-01, INFRA-09]
# ... other fields ...
---
```

## Open Questions

1. **StateManager.database accessor** -- RESOLVED
   - The shared `StateManager` in `packages/state/src/state-manager.ts` exposes a public `get database(): Database.Database` getter on line 174. This is the same pattern Slack's `SlackStateManager` uses. The Shopify error plugin can use `fastify.stateManager.database.prepare('SELECT * FROM error_configs').all()` directly.

2. **02-03-SUMMARY.md frontmatter format**
   - What we know: This file lacks standard `---` delimited YAML frontmatter (starts with `## Plan 02-03:` heading).
   - What's unclear: Whether to add a full frontmatter block or just the minimum `requirements_completed` field.
   - Recommendation: Add a minimal `---` delimited frontmatter block with `requirements_completed: [SHOP-03, INFRA-04]` at the top of the file, matching the convention used in other SUMMARY files.

## Sources

### Primary (HIGH confidence)
- Direct file reads of all referenced source files in the codebase
- `twins/slack/src/plugins/errors.ts` -- reference implementation for error inspection API
- `twins/shopify/src/plugins/errors.ts` -- current Shopify error plugin (missing GET routes)
- `twins/shopify/tsconfig.conformance.json` -- confirmed stale `@dtu/core` reference on line 13
- `twins/slack/tsconfig.json` -- confirmed missing `@dtu/conformance` reference
- All 28 SUMMARY.md files audited for `requirements_completed` frontmatter
- All PLAN.md files read for `requirements:` field to determine correct mapping

### Secondary (MEDIUM confidence)
- Requirement-to-plan mapping derived from PLAN.md files and cross-referenced with REQUIREMENTS.md traceability table

## Metadata

**Confidence breakdown:**
- Error inspection API: HIGH - direct code read of both twins, clear reference implementation
- tsconfig fixes: HIGH - direct file reads confirm exact changes needed
- SUMMARY backfill: HIGH - complete audit of all 28 files with mapping from PLAN.md requirements fields

**Research date:** 2026-03-01
**Valid until:** Indefinite (tech debt closure based on static codebase analysis)
