# Phase 13: Upstream SDK Mirrors & Surface Inventory — Research

**Researched:** 2026-03-09
**Domain:** Git submodule management, ts-morph TypeScript export enumeration, SDK package pinning, Vitest workspace configuration
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-10 | Developer can check out repo-owned fork submodules of the targeted upstream SDK repos under `third_party/upstream/`, with each submodule pinned to a recorded commit and package version | Git submodule setup patterns, `.gitmodules` configuration, `sdk-pins.json` design, CI checkout flags |
| INFRA-11 | Developer can run a manifest generator that inventories every public export and method in the targeted packages and writes a checked-in coverage ledger | ts-morph `getExportedDeclarations()` API, manifest JSON format, CLI runner design, output path conventions |
| INFRA-16 | Manifest generation uses `ts-morph` (v25.0.1+) for reliable export enumeration rather than raw TypeScript compiler API | ts-morph version pinning rationale (bundles TS 5.7.3 matching project), `Project` + `getExportedDeclarations()` API, re-export resolution |
</phase_requirements>

## Summary

Phase 13 establishes the foundational infrastructure that all v1.1 SDK conformance work depends on. It has two distinct tracks: (1) adding three repo-owned fork submodules under `third_party/upstream/` pinned to specific commits, and (2) building and running inventory tooling that generates machine-readable JSON manifests enumerating every public symbol in the five targeted SDK packages. Neither track requires changes to the existing twin code.

The phase is deliberately infrastructure-only with no test suite output of its own. Its deliverables — pinned submodule refs, an `sdk-pins.json` linking submodule commits to npm package versions, ts-morph-generated manifests, and workspace-level SDK devDependencies — are the inputs consumed by every downstream phase. Getting the sync mechanism right here prevents the most expensive pitfall in the entire milestone: submodule refs and installed package versions drifting out of alignment and silently corrupting the coverage contract.

All the technology choices were settled during v1.1 research (conducted 2026-03-08). ts-morph 25.0.1 is pinned specifically because it bundles TypeScript 5.7.3, exactly matching the project's TypeScript version. The five targeted packages (`@shopify/admin-api-client@1.1.1`, `@shopify/shopify-api@12.3.0`, `@slack/web-api@7.14.1`, `@slack/oauth@3.0.4`, `@slack/bolt@4.6.0`) have a verified zero-conflict dependency graph. No alternatives are under consideration — the choices are locked.

**Primary recommendation:** Create directory structure and submodules first, install SDK packages second, build and run the inventory generator third, then commit all manifests and the `sdk-pins.json` together in a single atomic commit. CI workflow updates for `submodules: recursive` must be included in this phase — do not defer to Phase 20.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ts-morph` | 25.0.1 (exact) | TypeScript export enumeration for manifest generation | Bundles TS 5.7.3 matching project; `getExportedDeclarations()` resolves re-exports automatically; avoids 40-line raw compiler API boilerplate. Pin exact: 26.0.0 bundles TS 5.8 which creates unnecessary divergence. |
| `@shopify/admin-api-client` | 1.1.1 (exact) | Official Shopify low-level GraphQL/REST client SDK | Target of INFRA-11 inventory; gateway for all Shopify SDK conformance work |
| `@shopify/shopify-api` | 12.3.0 (exact) | Official Shopify high-level platform SDK | Target of INFRA-11 inventory; Node >=20 required (project runs Node 24.12.0) |
| `@slack/web-api` | 7.14.1 (exact) | Official Slack WebClient SDK (274+ methods) | Target of INFRA-11 inventory; Node >=18 |
| `@slack/oauth` | 3.0.4 (exact) | Official Slack OAuth SDK (InstallProvider) | Target of INFRA-11 inventory; depends on web-api ^7.10.0 (satisfied by 7.14.1) |
| `@slack/bolt` | 4.6.0 (exact) | Official Slack app framework SDK | Target of INFRA-11 inventory; brings socket-mode 2.0.5 as transitive dep |
| `tsx` | ^4.19.2 | Script runner for inventory generator CLI | Already in twin devDependencies; avoids separate compilation step for tooling |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ws` | ^8.19.0 | WebSocket server for future Socket Mode broker | Install now alongside SDK packages so lockfile stays stable; used in Phase 20 |
| `@types/ws` | ^8 | TypeScript types for ws | Same as above |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ts-morph` | Raw TypeScript compiler API | Raw API requires ~40 lines of boilerplate per entrypoint; does not auto-resolve `export * from` chains; ts-morph handles all of this with one call |
| `ts-morph` | `@microsoft/api-extractor` | API Extractor generates `.d.ts` rollups for publishing your own packages — not a programmatic API for building custom manifests from third-party source |
| `ts-morph` | Parsing `package.json` exports field | The `exports` field describes module entry points, not individual symbols; misses re-exports, class methods, and type definitions |
| Repo-owned fork submodules | Direct upstream URLs | Upstream force-pushes, branch renames, or deletions can break submodule resolution; forks insulate against this |
| Git submodules | Vendored source copy | Loses upstream diff history, makes updates opaque, bloats repo; submodules keep the relationship auditable |

**Installation:**
```bash
# SDK packages at workspace root (devDependencies)
pnpm add -Dw @shopify/admin-api-client@1.1.1 @shopify/shopify-api@12.3.0
pnpm add -Dw @slack/web-api@7.14.1 @slack/oauth@3.0.4 @slack/bolt@4.6.0

# Inventory tooling
pnpm add -Dw ts-morph@25.0.1

# Socket Mode harness (needed in Phase 20, install now for lockfile stability)
pnpm add -Dw ws @types/ws

# Vitest version alignment (twins currently use ^2.1.8 — align to ^3.0.0)
# Run in each twin package that needs updating:
pnpm add -Dw vitest@^3.0.0
```

## Architecture Patterns

### Recommended Project Structure

```
sandpiper-dtu/
  .gitmodules                           # Submodule configuration
  third_party/
    upstream/
      shopify-app-js/                   # Git submodule -> repo-owned fork
      node-slack-sdk/                   # Git submodule -> repo-owned fork
      bolt-js/                          # Git submodule -> repo-owned fork
    sdk-pins.json                       # Links submodule SHAs to npm package versions

  tools/
    sdk-surface/
      inventory/
        run-inventory.ts                # CLI entrypoint
        walk-exports.ts                 # ts-morph export walker
      manifests/
        shopify-admin-api-client@1.1.1.json
        shopify-shopify-api@12.3.0.json
        slack-web-api@7.14.1.json
        slack-oauth@3.0.4.json
        slack-bolt@4.6.0.json

  .github/
    workflows/
      conformance.yml                   # Updated: add submodules: recursive
```

### Pattern 1: Submodule Setup and Pinning

**What:** Add three repo-owned fork submodules, pin each to the commit matching the installed npm package version, record the pin in `sdk-pins.json`.

**When to use:** Once during Phase 13. Subsequent ref bumps follow the same pattern but happen in later phases.

**Prerequisite:** The developer must first fork `Shopify/shopify-app-js`, `slackapi/node-slack-sdk`, and `slackapi/bolt-js` to a repo-accessible location (e.g., a GitHub organization or personal account). The fork URLs go in `.gitmodules`. Submodule paths use the descriptive `third_party/upstream/` prefix to prevent naming confusion.

**Example:**
```bash
# One-time setup (create forks in GitHub UI first)
mkdir -p third_party/upstream

git submodule add https://github.com/YOUR_ORG/shopify-app-js.git \
  third_party/upstream/shopify-app-js

git submodule add https://github.com/YOUR_ORG/node-slack-sdk.git \
  third_party/upstream/node-slack-sdk

git submodule add https://github.com/YOUR_ORG/bolt-js.git \
  third_party/upstream/bolt-js

# Pin to the commit matching installed package versions
# @shopify/shopify-api@12.3.0 — find matching commit in fork
cd third_party/upstream/shopify-app-js
git fetch origin
git checkout <SHA_FOR_12.3.0>
cd -

# Repeat for node-slack-sdk (@slack/web-api@7.14.1, @slack/oauth@3.0.4)
# Repeat for bolt-js (@slack/bolt@4.6.0)

git add .gitmodules third_party/upstream/
git commit -m "add upstream SDK submodules at pinned commits"
```

**`.gitmodules` configuration:**
```ini
[submodule "third_party/upstream/shopify-app-js"]
    path = third_party/upstream/shopify-app-js
    url = https://github.com/YOUR_ORG/shopify-app-js.git
    branch = main

[submodule "third_party/upstream/node-slack-sdk"]
    path = third_party/upstream/node-slack-sdk
    url = https://github.com/YOUR_ORG/node-slack-sdk.git
    branch = main

[submodule "third_party/upstream/bolt-js"]
    path = third_party/upstream/bolt-js
    url = https://github.com/YOUR_ORG/bolt-js.git
    branch = main
```

### Pattern 2: sdk-pins.json — The Single Source of Truth

**What:** A JSON file that records, for each targeted package, the npm version installed AND the submodule commit SHA. Any drift between these is a bug.

**When to use:** Create in Phase 13 alongside submodule setup. Updated atomically whenever a submodule ref changes.

**Format:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "Links installed npm package versions to upstream submodule commits. Both must be updated together.",
  "packages": {
    "@shopify/admin-api-client": {
      "version": "1.1.1",
      "submodule": "third_party/upstream/shopify-app-js",
      "commit": "<SHA>",
      "packagePath": "packages/api-clients/admin-api-client"
    },
    "@shopify/shopify-api": {
      "version": "12.3.0",
      "submodule": "third_party/upstream/shopify-app-js",
      "commit": "<SHA>",
      "packagePath": "packages/apps/shopify-api"
    },
    "@slack/web-api": {
      "version": "7.14.1",
      "submodule": "third_party/upstream/node-slack-sdk",
      "commit": "<SHA>",
      "packagePath": "packages/web-api"
    },
    "@slack/oauth": {
      "version": "3.0.4",
      "submodule": "third_party/upstream/node-slack-sdk",
      "commit": "<SHA>",
      "packagePath": "packages/oauth"
    },
    "@slack/bolt": {
      "version": "4.6.0",
      "submodule": "third_party/upstream/bolt-js",
      "commit": "<SHA>",
      "packagePath": "."
    }
  }
}
```

### Pattern 3: ts-morph Export Walker

**What:** A script that loads a package's TypeScript source from the installed `node_modules/` (not from the submodule — installed packages have compiled `.d.ts` files that are the actual public surface), walks all exported declarations, and emits a JSON manifest.

**When to use:** Called by `run-inventory.ts` for each of the five targeted packages.

**Key decision:** Enumerate from installed package `.d.ts` files, not from submodule source TypeScript. The installed package is what consuming code actually sees. The submodule source is the reference for understanding internals and checking drift. This distinction matters: a package's public `.d.ts` exports may differ from its raw TypeScript source exports due to bundling and declaration rollup.

**Example:**
```typescript
// tools/sdk-surface/inventory/walk-exports.ts
// Source: ts-morph documentation (https://ts-morph.com/details/exports)

import { Project } from 'ts-morph';
import { resolve } from 'node:path';

export interface ManifestSymbol {
  kind: string;
  members?: string[];
  signatures?: string[];
}

export interface PackageManifest {
  package: string;
  version: string;
  generatedAt: string;
  symbolCount: number;
  minimumExpectedSymbols: number;
  symbols: Record<string, ManifestSymbol>;
}

export function walkPackageExports(opts: {
  packageName: string;
  version: string;
  entryPoint: string;    // absolute path to the package's index.d.ts
  tsconfigPath?: string; // optional tsconfig for project loading
  minimumExpectedSymbols: number;
}): PackageManifest {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      moduleResolution: 2, // Node
      declaration: true,
    },
  });

  const sourceFile = project.addSourceFileAtPath(opts.entryPoint);
  const manifest: Record<string, ManifestSymbol> = {};

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    const decl = declarations[0];
    if (!decl) continue;

    const kind = decl.getKindName();
    const entry: ManifestSymbol = { kind };

    // For classes and interfaces, enumerate public members
    if ('getMembers' in decl && typeof decl.getMembers === 'function') {
      const members = (decl as any).getMembers();
      entry.members = members
        .filter((m: any) => {
          // Skip private and protected members
          if (m.hasModifier && m.hasModifier('private')) return false;
          if (m.hasModifier && m.hasModifier('protected')) return false;
          return true;
        })
        .map((m: any) => m.getName?.() ?? '<anonymous>')
        .filter(Boolean);
    }

    manifest[name] = entry;
  }

  const symbolCount = Object.keys(manifest).length;
  if (symbolCount < opts.minimumExpectedSymbols) {
    throw new Error(
      `Export enumeration for ${opts.packageName} found only ${symbolCount} symbols, ` +
      `expected at least ${opts.minimumExpectedSymbols}. Walker may have a bug.`
    );
  }

  return {
    package: opts.packageName,
    version: opts.version,
    generatedAt: new Date().toISOString(),
    symbolCount,
    minimumExpectedSymbols: opts.minimumExpectedSymbols,
    symbols: manifest,
  };
}
```

**Minimum expected symbol counts (verified from SDK source inspection):**

| Package | Minimum Expected Symbols | Rationale |
|---------|--------------------------|-----------|
| `@shopify/admin-api-client` | 10 | Small package: `createAdminApiClient`, `createAdminRestApiClient`, types |
| `@shopify/shopify-api` | 30 | Auth, session, webhooks, billing, clients, utils, REST resources, types |
| `@slack/web-api` | 20 | WebClient class (with 274+ methods as member), helper types, enums |
| `@slack/oauth` | 10 | InstallProvider, InstallationStore, types |
| `@slack/bolt` | 15 | App class, 4 receiver classes, middleware types, re-exported web-api |

Note: for `@slack/web-api`, the WebClient class itself has 274+ bound methods as members. The symbol count (20) refers to top-level exports; member count per class is what matters for coverage tracking and will appear in `entry.members`.

### Pattern 4: run-inventory.ts CLI

**What:** The top-level script that orchestrates walking all five packages and writing the manifest files.

**When to use:** Run with `npx tsx tools/sdk-surface/inventory/run-inventory.ts` after SDK packages are installed.

**Example:**
```typescript
// tools/sdk-surface/inventory/run-inventory.ts
import { walkPackageExports } from './walk-exports.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = resolve(__dirname, '../../..');
const manifestDir = resolve(__dirname, '../manifests');

mkdirSync(manifestDir, { recursive: true });

interface PackageSpec {
  packageName: string;
  version: string;
  minimumExpectedSymbols: number;
}

const packages: PackageSpec[] = [
  { packageName: '@shopify/admin-api-client', version: '1.1.1', minimumExpectedSymbols: 10 },
  { packageName: '@shopify/shopify-api', version: '12.3.0', minimumExpectedSymbols: 30 },
  { packageName: '@slack/web-api', version: '7.14.1', minimumExpectedSymbols: 20 },
  { packageName: '@slack/oauth', version: '3.0.4', minimumExpectedSymbols: 10 },
  { packageName: '@slack/bolt', version: '4.6.0', minimumExpectedSymbols: 15 },
];

for (const spec of packages) {
  console.log(`Inventorying ${spec.packageName}@${spec.version}...`);

  // Resolve the package's main type entry point from node_modules
  const pkgJsonPath = require.resolve(`${spec.packageName}/package.json`);
  const pkgJson = require(pkgJsonPath) as { types?: string; typings?: string; main?: string };
  const pkgDir = dirname(pkgJsonPath);
  const typesRelPath = pkgJson.types ?? pkgJson.typings ?? 'index.d.ts';
  const entryPoint = resolve(pkgDir, typesRelPath);

  const manifest = walkPackageExports({
    packageName: spec.packageName,
    version: spec.version,
    entryPoint,
    minimumExpectedSymbols: spec.minimumExpectedSymbols,
  });

  const safeName = spec.packageName.replace('@', '').replace('/', '-');
  const outputPath = resolve(manifestDir, `${safeName}@${spec.version}.json`);
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`  -> ${manifest.symbolCount} symbols -> ${outputPath}`);
}

console.log('Inventory complete.');
```

### Pattern 5: Vitest Workspace and Package JSON Changes

**What:** Phase 13 requires two root-level configuration changes that affect downstream phases.

**Change 1 — Root `vitest.config.ts`:** Add `tests/*` to the workspace projects array so the future `tests/sdk-verification/` directory is discovered.

```typescript
// vitest.config.ts (updated)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'twins/*', 'tests/*'],
  },
});
```

**Change 2 — Twin Vitest version alignment:** The twin packages (`twins/shopify`, `twins/slack`) currently use `vitest@^2.1.8`. They must be aligned to `^3.0.0` to prevent workspace version conflicts when the SDK verification test suite (which requires Vitest 3.x) is added in Phase 14.

Check current twin vitest versions with:
```bash
pnpm list vitest --depth=0
```

Align by updating devDependencies in each twin's `package.json` and running `pnpm install`.

### Pattern 6: CI Workflow Update

**What:** The existing `conformance.yml` uses `actions/checkout@v4` without `submodules: recursive`. This causes `third_party/upstream/` to be empty in CI, breaking any future step that reads submodule content (including manifest regeneration checks in Phase 20).

**When:** Must be done in Phase 13, immediately after adding submodules. Do not defer.

```yaml
# .github/workflows/conformance.yml (updated checkout steps)
- uses: actions/checkout@v4
  with:
    submodules: recursive
    fetch-depth: 0

# Add a submodule status verification step after checkout
- name: Verify submodule initialization
  run: |
    git submodule status | grep "^-" && \
      echo "ERROR: Uninitialized submodules detected" && exit 1 || \
      echo "All submodules initialized"
```

Also update `.github/workflows/e2e.yml` with the same change.

### Anti-Patterns to Avoid

- **Installing SDK packages in individual twin packages:** SDK packages are test infrastructure, not twin runtime dependencies. Installing in `twins/shopify/package.json` or `twins/slack/package.json` pollutes the twin dependency tree and can cause hoisting conflicts. Install at workspace root with `pnpm add -Dw`.
- **Pointing the ts-morph walker at submodule source TypeScript:** The submodule contains raw TypeScript source. The installed package exposes compiled `.d.ts` declaration files. The `.d.ts` files are the actual public API surface. Walk the `.d.ts` files.
- **Using direct upstream URLs in `.gitmodules`:** If `Shopify/shopify-app-js` force-pushes or renames a branch, the submodule URL breaks. Use repo-owned fork URLs.
- **Deferring the CI submodule checkout update:** A common mistake is to set up submodules locally, push, and then discover CI is broken when the next run happens. Update CI in the same commit that adds the submodules.
- **Generating manifests without a minimum symbol count assertion:** If the ts-morph walker has a bug that silently misses re-exports, the manifest will appear complete but will be wrong. Always assert a minimum symbol count to catch walker bugs early.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript export enumeration | Custom AST walker | `ts-morph` `getExportedDeclarations()` | Handles `export * from`, `export { X as Y }`, barrel files, and namespace re-exports automatically |
| Submodule version tracking | Custom git hooks or scripts that parse git log | `sdk-pins.json` checked into the repo | JSON file is simple, diffable, and visible in PRs |
| Package type entry resolution | Custom logic to find `.d.ts` entry points | `require.resolve(pkg + '/package.json')` + read `types`/`typings` field | Standard Node.js resolution; handles scoped packages correctly |
| Manifest diffing | Custom diff algorithm | `git diff` on the checked-in manifest files | JSON manifests diffed by git provide exactly the "added/removed symbol" visibility required by INFRA-11 |

**Key insight:** The entire phase is glue between existing tools. ts-morph, git submodules, and plain JSON files are all battle-tested. The only custom code is the thin CLI that connects them.

## Common Pitfalls

### Pitfall 1: Submodule SHA Does Not Match Installed Package Version

**What goes wrong:** The git submodule is pinned to a commit from before `@shopify/shopify-api@12.3.0` was released, but `pnpm install` resolves `12.3.0`. The manifest describes one API shape; the tests exercise another.

**Why it happens:** Submodule refs and npm dependency versions are updated through completely independent mechanisms. No built-in enforcement links them.

**How to avoid:** Create `sdk-pins.json` in the same commit as the submodule setup. Find the exact commit SHA for each package's version by checking the package's `CHANGELOG.md` in the submodule or using `git log --oneline` to find the release commit. Include a script or manual verification step.

**Warning signs:** `git submodule status` shows a SHA that, when checked against the submodule's changelog, does not correspond to the installed npm version.

### Pitfall 2: ts-morph Misses Bound Methods on WebClient

**What goes wrong:** `@slack/web-api`'s `WebClient` binds 274+ methods at runtime via `methods.ts`. The static type declarations expose these as properties on the class. The walker finds the class but lists only ~10 members instead of 274+.

**Why it happens:** The method binding pattern may use index signatures or dynamic property assignment that ts-morph enumerates differently depending on how the `.d.ts` is generated.

**How to avoid:** Set the minimum expected symbol count for `@slack/web-api`'s WebClient members to at least 200. Run the walker and inspect the output before declaring the manifest complete. If the count is wrong, add logic to follow `getProperties()` in addition to `getMembers()` on the WebClient class declaration.

**Warning signs:** Generated `slack-web-api@7.14.1.json` shows WebClient with fewer than 200 members.

### Pitfall 3: Fork Naming Confusion

**What goes wrong:** Fork names (e.g., `myorg/shopify-app-js`) are identical to upstream names. Developers accidentally push to upstream or pull from the wrong remote.

**Why it happens:** GitHub forks use the same name by default.

**How to avoid:** After creating the fork, add the upstream remote explicitly in the submodule:
```bash
cd third_party/upstream/shopify-app-js
git remote add upstream https://github.com/Shopify/shopify-app-js.git
git remote -v  # Verify: origin=fork, upstream=official
```

Document the convention in `third_party/upstream/` with a README or in `CONTRIBUTING.md`.

**Warning signs:** `git remote -v` in a submodule shows only one remote.

### Pitfall 4: CI Checkout Missing Submodule Initialization

**What goes wrong:** CI jobs run `actions/checkout@v4` without `submodules: recursive`. The `third_party/upstream/` directories are empty. Future manifest regeneration steps fail with confusing "file not found" errors rather than clear "submodule not initialized" messages.

**Why it happens:** The existing CI workflows were written before submodules existed. Forgetting to update them is the most common submodule CI failure.

**How to avoid:** Update both `conformance.yml` and `e2e.yml` in the same PR that adds the submodules. Add the verification step (`git submodule status | grep "^-"`) as an explicit CI step.

**Warning signs:** CI jobs pass locally but fail in GitHub Actions with path-related errors.

### Pitfall 5: Manifest File Naming Collisions

**What goes wrong:** Two packages from the same monorepo submodule (e.g., `shopify-app-js` contains both `@shopify/admin-api-client` and `@shopify/shopify-api`) generate manifest files with names that could collide.

**How to avoid:** Use the full scoped package name in the manifest filename, stripping `@` and replacing `/` with `-`:
- `@shopify/admin-api-client@1.1.1` → `shopify-admin-api-client@1.1.1.json`
- `@shopify/shopify-api@12.3.0` → `shopify-shopify-api@12.3.0.json`
- `@slack/web-api@7.14.1` → `slack-web-api@7.14.1.json`

### Pitfall 6: pnpm Hoisting Conflicts From SDK Transitive Dependencies

**What goes wrong:** `@shopify/shopify-api@12.3.0` depends on `@shopify/admin-api-client@^1.1.1`. Installing both at workspace root causes pnpm to install one copy, which is correct. But if any twin package had a different version pinned, conflicts can arise.

**How to avoid:** Before installing, run `pnpm list @shopify/admin-api-client --depth=0` to see what's currently resolved. After installing, run it again to verify no duplicate versions exist. If conflicts arise, use `pnpm.overrides` in root `package.json` to pin the version.

**Warning signs:** `pnpm install` output shows peer dependency warnings. Running `pnpm list <package> --depth=3` shows multiple resolved versions.

## Code Examples

Verified patterns from official sources:

### ts-morph: getExportedDeclarations basic usage

```typescript
// Source: https://ts-morph.com/details/exports
import { Project } from 'ts-morph';

const project = new Project({ skipAddingFilesFromTsConfig: true });
const sourceFile = project.addSourceFileAtPath('/path/to/index.d.ts');

for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
  const decl = declarations[0];
  console.log(name, decl.getKindName());
  // Outputs: 'WebClient' 'ClassDeclaration', etc.
}
```

### ts-morph: Class member enumeration

```typescript
// Source: ts-morph documentation on class details
import { ClassDeclaration, Node } from 'ts-morph';

function getPublicMethods(cls: ClassDeclaration): string[] {
  return cls.getMethods()
    .filter(m => !m.hasModifier('private') && !m.hasModifier('protected'))
    .map(m => m.getName());
}

// For WebClient, this should return 274+ method names
```

### Git submodule: checking current status

```bash
# Source: git-scm.com/docs/git-submodule
# Shows each submodule's current commit SHA and status prefix:
#   ' ' = initialized and matching superproject
#   '-' = uninitialized
#   '+' = checked out to different SHA than superproject records
#   'U' = merge conflicts
git submodule status

# Expected output after Phase 13 is complete:
# <SHA> third_party/upstream/shopify-app-js (v12.3.0-release-commit)
# <SHA> third_party/upstream/node-slack-sdk (v7.14.1-release-commit)
# <SHA> third_party/upstream/bolt-js (v4.6.0-release-commit)
```

### Resolving npm package type entry point

```typescript
// Pattern for finding the .d.ts file for any installed package
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

function resolvePackageTypes(packageName: string): string {
  const pkgJsonPath = require.resolve(`${packageName}/package.json`);
  const pkgJson = require(pkgJsonPath) as {
    types?: string;
    typings?: string;
    exports?: Record<string, unknown>;
  };
  const pkgDir = dirname(pkgJsonPath);

  // Prefer types > typings > index.d.ts
  const typesRelPath = pkgJson.types ?? pkgJson.typings ?? 'index.d.ts';
  return resolve(pkgDir, typesRelPath);
}

// Example:
// resolvePackageTypes('@slack/web-api')
// -> /path/to/node_modules/@slack/web-api/dist/index.d.ts
```

### Verify refs script (detects submodule/version drift)

```typescript
// tools/sdk-surface/verify-refs.ts
// Reads sdk-pins.json and compares against actual submodule commits and lockfile
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const pinsPath = resolve(process.cwd(), 'third_party/sdk-pins.json');
const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));

let hasErrors = false;

for (const [pkgName, pin] of Object.entries(pins.packages) as any[]) {
  // Check actual submodule commit
  const actualSha = execSync(
    `git -C ${pin.submodule} rev-parse HEAD`,
    { encoding: 'utf8' }
  ).trim();

  if (actualSha !== pin.commit) {
    console.error(
      `ERROR: ${pkgName} submodule commit mismatch.\n` +
      `  sdk-pins.json: ${pin.commit}\n` +
      `  actual:        ${actualSha}`
    );
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\nFix: update sdk-pins.json to match actual submodule commits,\nor run the submodule update flow.');
  process.exit(1);
}

console.log('All submodule refs match sdk-pins.json');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw TypeScript compiler API for export enumeration | ts-morph `getExportedDeclarations()` | INFRA-16 added during 2026-03-08 review | Eliminates ~40-line boilerplate per package; automatically resolves re-exports |
| No upstream source reference in repo | Pinned fork submodules at `third_party/upstream/` | v1.1 milestone start | Manifest generation reads installed `.d.ts` files; submodules provide source-level drift detection |
| No version link between submodule refs and npm versions | `sdk-pins.json` as atomic record | Phase 13 | Drift between submodule and npm version becomes visible in PRs and CI |

**Deprecated/outdated:**
- Direct upstream submodule URLs (e.g., `github.com/Shopify/shopify-app-js`): replaced by repo-owned fork URLs for stability against upstream force-pushes.
- ts-morph versions above 25.0.1: 26.0.0 bundles TS 5.8 and 27.0.x bundles TS 5.9, creating unnecessary divergence from the project's TypeScript 5.7.3.

## Open Questions

1. **Finding the exact commit SHA for each package version**
   - What we know: Each SDK package version was released from its upstream monorepo at a specific commit. The commit SHA must be found by inspecting the fork's git log or release tags.
   - What's unclear: The exact methodology for reliably matching a published npm package version to a git commit SHA varies by project (some use tags, some use changelogs, some use `package.json` version bumps in commits).
   - Recommendation: For each submodule, run `git log --oneline --grep="<version>"` or check GitHub releases for the matching tag. Monorepos like `shopify-app-js` use lerna/changesets release tags (e.g., `@shopify/shopify-api@12.3.0`). Record the found SHA in `sdk-pins.json`.

2. **GitHub token scope for fork submodules**
   - What we know: If the fork repos are private or in an org that requires auth, `actions/checkout@v4` with `submodules: recursive` needs a PAT or the default `GITHUB_TOKEN` to have read access.
   - What's unclear: Whether the project's current CI setup has appropriate token scope.
   - Recommendation: Use public fork repos to avoid auth complexity. If that is not possible, configure a PAT in the repository secrets and pass it to the checkout action.

3. **@slack/web-api WebClient method member enumeration**
   - What we know: WebClient dynamically binds 274+ methods. The `.d.ts` declaration files may expose these as class properties or index signatures.
   - What's unclear: Whether `getMembers()` on the WebClient `ClassDeclaration` from ts-morph will enumerate all 274 method names, or whether `getProperties()` is needed.
   - Recommendation: Run the walker first with a minimum count of 200. If the count is wrong, inspect the `.d.ts` file directly (`cat node_modules/@slack/web-api/dist/WebClient.d.ts | grep -c "("`) to understand the structure and adjust the walker accordingly.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (root workspace) |
| Config file | Root `vitest.config.ts` (projects: packages/*, twins/*, tests/*) |
| Quick run command | `pnpm exec vitest run --project packages/webhooks` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

Phase 13 is infrastructure-only. Its deliverables are files (submodule config, sdk-pins.json, manifest JSON files, updated CI workflows) and package.json changes, not behavior that can be unit tested. Verification is structural:

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-10 | Submodules present and initialized | manual + CI check | `git submodule status` (exit 0 = pass) | ❌ Wave 0 (CI step) |
| INFRA-10 | sdk-pins.json present and valid | manual | `node -e "JSON.parse(require('fs').readFileSync('third_party/sdk-pins.json'))"` | ❌ Wave 0 |
| INFRA-11 | Five manifest JSON files present in `tools/sdk-surface/manifests/` | manual | `ls tools/sdk-surface/manifests/*.json \| wc -l` (expect 5) | ❌ Wave 0 |
| INFRA-11 | Manifests record expected minimum symbol counts | automated | `npx tsx tools/sdk-surface/inventory/run-inventory.ts` (throws on count failure) | ❌ Wave 0 |
| INFRA-16 | Manifest generator uses ts-morph (not raw TS compiler API) | code review | Inspect `walk-exports.ts` imports | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run `git submodule status` and `pnpm list ts-morph --depth=0` to confirm installs.
- **Per wave merge:** Run `npx tsx tools/sdk-surface/inventory/run-inventory.ts` to confirm all five manifests generate without errors.
- **Phase gate:** All five manifest files committed, `sdk-pins.json` committed, CI workflows updated with `submodules: recursive`, Vitest workspace updated with `tests/*`.

### Wave 0 Gaps

- [ ] `tools/sdk-surface/inventory/walk-exports.ts` — core ts-morph walker
- [ ] `tools/sdk-surface/inventory/run-inventory.ts` — CLI entrypoint
- [ ] `third_party/sdk-pins.json` — version lock file (hand-authored after submodule setup)
- [ ] `third_party/upstream/` directories — created by `git submodule add` commands
- [ ] `tools/sdk-surface/manifests/` — created by running the inventory generator
- [ ] `.gitmodules` — created by `git submodule add` commands
- [ ] CI: `submodules: recursive` in `conformance.yml` and `e2e.yml`
- [ ] Root `vitest.config.ts`: add `tests/*` to projects array
- [ ] Vitest alignment: twin packages updated from `^2.1.8` to `^3.0.0`

## Sources

### Primary (HIGH confidence)

- `.planning/research/STACK.md` — Stack choices for all v1.1 phases (ts-morph version rationale, SDK package versions, compatibility matrix)
- `.planning/research/ARCHITECTURE.md` — Directory structure, submodule patterns, inventory generator code examples, CI configuration
- `.planning/research/PITFALLS.md` — Pitfalls 1, 7, 8, 12, 13 directly applicable to Phase 13
- `.planning/research/SUMMARY.md` — Phase 13 scope boundaries and "what this phase delivers"
- `vitest.config.ts` (project root) — Current projects array: `['packages/*', 'twins/*']`; must add `'tests/*'`
- `pnpm-workspace.yaml` — Current workspace layout; `third_party/` is intentionally outside workspace
- `.github/workflows/conformance.yml` — Current CI workflows; missing `submodules: recursive`
- [ts-morph exports documentation](https://ts-morph.com/details/exports) — `getExportedDeclarations()` return type and behavior
- [ts-morph releases](https://github.com/dsherret/ts-morph/releases) — Version 25.0.1 bundles TS 5.7.3; 26.0.0 bundles TS 5.8

### Secondary (MEDIUM confidence)

- [GitHub Actions checkout action docs](https://github.com/actions/checkout) — `submodules: recursive` option behavior
- [git-scm.com submodule reference](https://git-scm.com/docs/git-submodule) — `git submodule status` prefix meanings

### Tertiary (LOW confidence)

- Community guides on git submodule CI integration — patterns for token scope and shallow clone avoidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified during v1.1 research; no alternatives under consideration
- Architecture: HIGH — directory layout verified against existing codebase; ts-morph patterns verified against official docs
- Pitfalls: HIGH — sourced from v1.1 research which inspected upstream SDK repos, issue trackers, and existing codebase directly

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable infrastructure; SDK versions are pinned so no urgency to re-verify)
