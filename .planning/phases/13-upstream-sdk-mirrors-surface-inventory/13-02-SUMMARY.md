---
phase: 13-upstream-sdk-mirrors-surface-inventory
plan: 02
subsystem: infra
tags: [ts-morph, sdk-inventory, shopify, slack, manifest, coverage-ledger]

# Dependency graph
requires:
  - phase: 13-01
    provides: Vitest workspace with tests/*, CI checkout with submodules:recursive
provides:
  - ts-morph 25.0.1 export walker that recursively enumerates all public symbols from installed .d.ts files
  - Five committed JSON manifest files covering all five targeted SDK packages
  - WebClient member enumeration via getType().getBaseTypes() traversal (392 members captured)
  - resolvePackageEntryPoint() handles packages with exports field guard (Shopify pattern)
  - All five SDK packages installed at workspace root as exact-pinned devDependencies
affects: [14-sdk-verification-harness, 15-shopify-client-surfaces, 16-shopify-platform-sdk-session, 17-shopify-client-surfaces-rest, 18-slack-webclient-coverage, 19-slack-oauth-bolt-http, 20-slack-alternate-receivers-drift]

# Tech tracking
tech-stack:
  added:
    - "@shopify/admin-api-client@1.1.1 (exact pin)"
    - "@shopify/shopify-api@12.3.0 (exact pin)"
    - "@slack/web-api@7.14.1 (exact pin)"
    - "@slack/oauth@3.0.4 (exact pin)"
    - "@slack/bolt@4.6.0 (exact pin)"
    - "ts-morph@25.0.1 (exact pin, bundles TS 5.7.3)"
    - "ws@^8.19.0 and @types/ws@^8 (Phase 20 Socket Mode, installed now for lockfile stability)"
  patterns:
    - "ts-morph walker uses getType().getBaseTypes() to traverse abstract base classes — required for @slack/web-api WebClient which inherits 275 API methods from the Methods abstract class"
    - "collectMembersFromType() recursively descends into nested object type literals up to 6 levels deep, collecting only leaf callable members as dot-notation names (e.g., admin.analytics.getFile)"
    - "resolvePackageEntryPoint() falls back to readFileSync on package.json instead of require.resolve('./package.json') for packages that restrict the exports field"
    - "Manifest filenames strip @ and replace / with - for filesystem safety"

key-files:
  created:
    - tools/sdk-surface/inventory/walk-exports.ts
    - tools/sdk-surface/inventory/run-inventory.ts
    - tools/sdk-surface/manifests/shopify-admin-api-client@1.1.1.json
    - tools/sdk-surface/manifests/shopify-shopify-api@12.3.0.json
    - tools/sdk-surface/manifests/slack-web-api@7.14.1.json
    - tools/sdk-surface/manifests/slack-oauth@3.0.4.json
    - tools/sdk-surface/manifests/slack-bolt@4.6.0.json
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "getType().getBaseTypes() used instead of getBaseClasses() — ts-morph ClassDeclaration nodes returned by getExportedDeclarations() do not expose getBaseClasses(); base type traversal via the Type API is the correct approach"
  - "collectMembersFromType() with depth limit of 6 and cycle guard on prefix+type text — prevents infinite recursion on recursive types while capturing all deeply-nested Slack API method namespaces"
  - "readFileSync on package.json instead of require.resolve('./package.json') — Shopify packages use exports field that blocks subpath resolution; fs read bypasses the guard cleanly"
  - "Minimum member count enforcement for WebClient (>= 200) hard-coded in run-inventory.ts — catches silent walker failures early"
  - "WebClient members captured in dot-notation (admin.analytics.getFile) — captures the actual callable identity rather than just the namespace name"

patterns-established:
  - "SDK inventory pattern: walk installed .d.ts files (not submodule source) using ts-morph, assert minimum symbol/member counts, commit manifests as coverage contract"
  - "ts-morph base type traversal: use cls.getType().getBaseTypes() for inherited members when getBaseClasses() is unavailable on the declaration node"

requirements-completed:
  - INFRA-11
  - INFRA-16

# Metrics
duration: 20min
completed: 2026-03-09
---

# Phase 13 Plan 02: SDK Inventory Generator & Manifests Summary

**Five SDK surface manifest files committed via ts-morph 25.0.1 walker with recursive nested-namespace enumeration — WebClient exposes 392 members including all 275 Slack API methods**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-09T05:16:01Z
- **Completed:** 2026-03-09T05:36:00Z
- **Tasks:** 2
- **Files modified/created:** 9

## Accomplishments

- All five SDK packages (`@shopify/admin-api-client@1.1.1`, `@shopify/shopify-api@12.3.0`, `@slack/web-api@7.14.1`, `@slack/oauth@3.0.4`, `@slack/bolt@4.6.0`) installed at workspace root as exact-pinned devDependencies; no SDK packages in twin package.json files
- `walk-exports.ts` walker uses ts-morph 25.0.1 exclusively; `getType().getBaseTypes()` traversal captures inherited members from abstract base classes (essential for WebClient/Methods inheritance)
- `collectMembersFromType()` recurses into nested object type literals, producing dot-notation member names (e.g., `admin.analytics.getFile`) capturing all 275 Slack API methods
- Five manifest JSON files committed and passing all verification checks: symbolCounts of 18, 175, 879, 34, 202; WebClient has 392 members (>= 200 threshold)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install SDK packages, ts-morph, and ws at workspace root** - `e608665` (chore)
2. **Task 2: Write ts-morph export walker and inventory CLI, generate manifests** - `a5ac3f5` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `package.json` - Added 7 devDependencies (5 SDK packages + ts-morph + ws/@types/ws), all exact-pinned
- `pnpm-lock.yaml` - Updated lockfile
- `tools/sdk-surface/inventory/walk-exports.ts` - ts-morph export walker: walkPackageExports(), ManifestSymbol, PackageManifest interfaces
- `tools/sdk-surface/inventory/run-inventory.ts` - CLI orchestrator: resolves .d.ts entry points, runs walker, writes manifest JSON
- `tools/sdk-surface/manifests/shopify-admin-api-client@1.1.1.json` - 18 symbols
- `tools/sdk-surface/manifests/shopify-shopify-api@12.3.0.json` - 175 symbols
- `tools/sdk-surface/manifests/slack-web-api@7.14.1.json` - 879 symbols, WebClient: 392 members
- `tools/sdk-surface/manifests/slack-oauth@3.0.4.json` - 34 symbols
- `tools/sdk-surface/manifests/slack-bolt@4.6.0.json` - 202 symbols

## Decisions Made

- Used `cls.getType().getBaseTypes()` for inherited member traversal instead of `cls.getBaseClasses()` — the latter method does not exist on ClassDeclaration nodes returned by `getExportedDeclarations()` when the class is re-exported (as WebClient is in `@slack/web-api`)
- Collected WebClient members in dot-notation path form (`admin.analytics.getFile`) to capture the actual callable identity, not just namespace names — this yields 392 traceable member paths rather than 33 top-level namespace names
- `resolvePackageEntryPoint()` uses `readFileSync` on package.json rather than `require.resolve('./package.json')` — Shopify packages restrict the exports field and block subpath resolution; direct file read bypasses this cleanly
- Depth limit of 6 + prefix-based cycle guard in `collectMembersFromType()` — prevents infinite recursion on self-referential types while still capturing 4–5 levels of nested Slack API namespaces

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `require.resolve('./package.json')` fails for Shopify packages**
- **Found during:** Task 2 (first run of inventory generator)
- **Issue:** `@shopify/admin-api-client` and `@shopify/shopify-api` use the `exports` field in package.json and do not expose `./package.json` as a subpath. `require.resolve('@shopify/admin-api-client/package.json')` throws `Package subpath './package.json' is not defined by "exports"`.
- **Fix:** Changed `resolvePackageEntryPoint()` to first try `require.resolve('<pkg>/package.json')`; on failure, walk up the directory tree from `require.resolve('<pkg>')` to find `package.json`, then read it with `readFileSync`.
- **Files modified:** `tools/sdk-surface/inventory/run-inventory.ts`
- **Verification:** Both Shopify manifests generated successfully
- **Committed in:** `a5ac3f5`

**2. [Rule 1 - Bug] `getBaseClasses()` is not a function on ClassDeclaration from re-exports**
- **Found during:** Task 2 (first run — WebClient and App class errors)
- **Issue:** `cls.getBaseClasses()` throws `TypeError: cls.getBaseClasses is not a function` for ClassDeclaration nodes that are re-exported (e.g., `export { WebClient }` in index.d.ts). The node returned by `getExportedDeclarations()` lacks this method.
- **Fix:** Replaced `cls.getBaseClasses()` with `cls.getType().getBaseTypes()` which works via the Type API regardless of declaration context.
- **Files modified:** `tools/sdk-surface/inventory/walk-exports.ts`
- **Verification:** WebClient now yields 392 members via base type traversal of the Methods class
- **Committed in:** `a5ac3f5`

**3. [Rule 1 - Bug] `@slack/oauth` fallback `index.d.ts` path resolved to non-existent file**
- **Found during:** Task 2 (first run)
- **Issue:** `@slack/oauth` has no `types` or `typings` field in package.json. Fallback to `index.d.ts` resolved to the package root (`node_modules/@slack/oauth/index.d.ts`) which doesn't exist. Actual entry is `dist/index.d.ts`.
- **Fix:** `resolvePackageEntryPoint()` now tries `dist/index.d.ts` before `index.d.ts` as a candidate, using `readFileSync` to verify existence before returning.
- **Files modified:** `tools/sdk-surface/inventory/run-inventory.ts`
- **Verification:** `@slack/oauth` manifest generated with 34 symbols
- **Committed in:** `a5ac3f5`

**4. [Rule 1 - Bug] `collectMembersFromType()` used `prop.getValueDeclarationOrThrow()` which throws for inherited symbols**
- **Found during:** Task 2 (second run after fix 1 — `@shopify/shopify-api` failing with "Expected to find the value declaration of symbol 'apiSecretKey'")
- **Issue:** Some type symbols (especially in complex generic or inherited types) have no value declaration. `getValueDeclarationOrThrow()` throws for these.
- **Fix:** Changed to `sym.getValueDeclaration()` (returns undefined instead of throwing) with fallback to `sym.getDeclarations()[0]`.
- **Files modified:** `tools/sdk-surface/inventory/walk-exports.ts`
- **Verification:** All five manifests generated without errors
- **Committed in:** `a5ac3f5`

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs in initial implementation)
**Impact on plan:** All fixes necessary for correctness. The base type traversal fix (deviation 2) was the key insight — it enables the walker to correctly enumerate WebClient's 275 Slack API methods. No scope creep.

## Issues Encountered

- WebClient member count was 110 on first working run (after fixes 1–3). Root cause: `getBaseClasses()` was being silently skipped by the `typeof` guard added in fix 2's first attempt. The actual fix (using `getType().getBaseTypes()`) correctly traverses the `Methods` abstract base class which declares all 275 Slack API methods as nested object namespaces.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 (SDK verification harness) can proceed: all five manifests are committed and parseable; WebClient has 392 traceable member paths ready for coverage tracking
- Re-running `npx tsx tools/sdk-surface/inventory/run-inventory.ts` is idempotent — manifests will differ only in `generatedAt` timestamp, symbol content is stable
- Manifests are git-diffable: any package version bump that changes the public surface will appear as a JSON diff

## Self-Check: PASSED

All created files exist on disk. Both task commits (e608665, a5ac3f5) confirmed in git log.

---
*Phase: 13-upstream-sdk-mirrors-surface-inventory*
*Completed: 2026-03-09*
