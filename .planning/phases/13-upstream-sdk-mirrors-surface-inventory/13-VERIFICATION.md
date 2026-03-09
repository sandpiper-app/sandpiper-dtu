---
phase: 13-upstream-sdk-mirrors-surface-inventory
verified: 2026-03-09T07:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 13: Upstream SDK Mirrors & Surface Inventory Verification Report

**Phase Goal:** Freeze the literal SDK source of truth inside the repo and generate a machine-readable coverage contract.
**Verified:** 2026-03-09T07:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths are drawn from the three plan `must_haves` frontmatter blocks (Plans 01, 02, 03).

#### Plan 01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm test` discovers `tests/*` as a workspace project | VERIFIED | `vitest.config.ts` line: `projects: ['packages/*', 'twins/*', 'tests/*']` (confirmed by grep) |
| 2 | `twins/shopify` and `twins/slack` declare `vitest: "^3.0.0"` | VERIFIED | Both `twins/shopify/package.json` and `twins/slack/package.json` show `"vitest": "^3.0.0"` |
| 3 | Every `actions/checkout` step in `conformance.yml` and `e2e.yml` includes `submodules: recursive` | VERIFIED | conformance.yml: 4 occurrences; e2e.yml: 1 occurrence — all checkout steps covered |
| 4 | CI has an explicit `Verify submodule initialization` step that exits non-zero on uninitialized entries | VERIFIED | Step found in all 4 conformance.yml jobs and e2e.yml (5 total occurrences) |

#### Plan 02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | `npx tsx tools/sdk-surface/inventory/run-inventory.ts` exits 0, producing five JSON manifest files | VERIFIED | Five manifest files present in `tools/sdk-surface/manifests/`; all parse as valid JSON |
| 6 | Each manifest contains at minimum the required symbol count (10/30/20/10/15) | VERIFIED | Counts: shopify-admin-api-client=18(≥10), shopify-api=175(≥30), slack-web-api=879(≥20), slack-oauth=34(≥10), slack-bolt=202(≥15) |
| 7 | `@slack/web-api` manifest records WebClient class with at least 200 member method names | VERIFIED | `WebClient.members.length = 392` — well above the 200 threshold |
| 8 | ts-morph 25.0.1 is the only TypeScript compiler used — no raw compiler API | VERIFIED | `walk-exports.ts` imports only from `'ts-morph'`; no `typescript` package import; no raw `ts.createProgram` / `ts.createSourceFile` calls |
| 9 | All five SDK packages installed at workspace root devDependencies, not inside twin packages | VERIFIED | `package.json` root: exact-pinned entries for all five; no SDK package entries in either `twins/shopify/package.json` or `twins/slack/package.json` |

#### Plan 03 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | `git submodule status` exits 0 and shows three initialized entries (no `-` prefix) | VERIFIED | All three lines have a leading space (initialized+clean): `4cfd376 bolt-js`, `59df200 node-slack-sdk`, `7399c4f shopify-app-js` |
| 11 | `sdk-pins.json` records the npm version and submodule commit SHA for all five targeted packages | VERIFIED | File parses as valid JSON; all five packages present with `version`, `submodule`, `commit`, and `packagePath` fields. SHAs cross-verified against `rev-parse HEAD` in each submodule |

**Score: 11/11 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vitest.config.ts` | Workspace project discovery including `tests/*` | VERIFIED | Contains `'tests/*'` in projects array |
| `twins/shopify/package.json` | Vitest version `^3.0.0` | VERIFIED | `"vitest": "^3.0.0"` present |
| `twins/slack/package.json` | Vitest version `^3.0.0` | VERIFIED | `"vitest": "^3.0.0"` present |
| `.github/workflows/conformance.yml` | Submodule-aware CI checkout + verification step | VERIFIED | `submodules: recursive` on all 4 checkout steps; `Verify submodule initialization` in all 4 jobs |
| `.github/workflows/e2e.yml` | Submodule-aware CI checkout + verification step | VERIFIED | `submodules: recursive` on checkout step; `Verify submodule initialization` step present |
| `tools/sdk-surface/inventory/walk-exports.ts` | ts-morph export walker exporting `walkPackageExports`, `ManifestSymbol`, `PackageManifest` | VERIFIED | All three exports confirmed; uses `addSourceFileAtPath`; no raw TS compiler API |
| `tools/sdk-surface/inventory/run-inventory.ts` | CLI orchestrator for all five packages | VERIFIED | Imports `walkPackageExports` from `./walk-exports.js`; calls `writeFileSync` for manifest output |
| `tools/sdk-surface/manifests/shopify-admin-api-client@1.1.1.json` | Coverage ledger with `symbolCount` | VERIFIED | `symbolCount=18`, `minimumExpectedSymbols=10`, symbols present |
| `tools/sdk-surface/manifests/shopify-shopify-api@12.3.0.json` | Coverage ledger with `symbolCount` | VERIFIED | `symbolCount=175` |
| `tools/sdk-surface/manifests/slack-web-api@7.14.1.json` | Coverage ledger with `WebClient` entry | VERIFIED | `symbolCount=879`, `WebClient.members.length=392` |
| `tools/sdk-surface/manifests/slack-oauth@3.0.4.json` | Coverage ledger | VERIFIED | `symbolCount=34` |
| `tools/sdk-surface/manifests/slack-bolt@4.6.0.json` | Coverage ledger | VERIFIED | `symbolCount=202` |
| `.gitmodules` | Submodule declarations for three upstream forks | VERIFIED | Three entries pointing to `sandpiper-app` fork URLs |
| `third_party/sdk-pins.json` | Single source of truth linking npm versions to submodule commits | VERIFIED | All five packages; SHAs match actual submodule HEADs |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `vitest.config.ts` | `tests/sdk-verification/` | `projects: ['packages/*', 'twins/*', 'tests/*']` | WIRED | Pattern `'tests/*'` confirmed in file |
| `.github/workflows/conformance.yml` | `third_party/upstream/` | `actions/checkout submodules: recursive` | WIRED | `submodules: recursive` on all 4 checkout steps |
| `tools/sdk-surface/inventory/run-inventory.ts` | `tools/sdk-surface/inventory/walk-exports.ts` | `walkPackageExports()` call per package spec | WIRED | Import confirmed; `walkPackageExports` called in manifest generation loop |
| `tools/sdk-surface/inventory/walk-exports.ts` | `node_modules/<pkg>/dist/index.d.ts` | `project.addSourceFileAtPath(entryPoint)` | WIRED | `addSourceFileAtPath` call confirmed in `walk-exports.ts` |
| `tools/sdk-surface/inventory/run-inventory.ts` | `tools/sdk-surface/manifests/` | `writeFileSync` on each manifest path | WIRED | `writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n')` confirmed |
| `third_party/sdk-pins.json` | `third_party/upstream/shopify-app-js` | commit SHA field matches `git submodule HEAD` | WIRED | sdk-pins SHA `7399c4fcc3fc3946bbe6925c2a0710c6493986b9` matches `rev-parse HEAD` exactly |
| `.gitmodules` | `sandpiper-app` fork URLs | `url = https://github.com/sandpiper-app/...` | WIRED | All three entries use fork URLs; `submodule.*path` patterns present |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-10 | 13-01, 13-03 | Developer can check out repo-owned fork submodules under `third_party/upstream/`, each pinned to a recorded commit and package version | SATISFIED | Three submodules initialized at correct SHAs; `sdk-pins.json` records versions and commit SHAs for all five packages; CI checkout has `submodules: recursive` |
| INFRA-11 | 13-01, 13-02 | Developer can run a manifest generator that inventories every public export and method and writes a checked-in coverage ledger | SATISFIED | `run-inventory.ts` generates five manifest JSON files; all five committed; `symbolCount` fields present and above minimum thresholds |
| INFRA-16 | 13-02 | Manifest generation uses `ts-morph` v25.0.1+ for reliable export enumeration rather than raw TypeScript compiler API | SATISFIED | `package.json` root has `"ts-morph": "25.0.1"` (exact pin); `walk-exports.ts` imports exclusively from `'ts-morph'`; no raw `typescript` import or `ts.createProgram` calls |

No orphaned requirements: REQUIREMENTS.md maps INFRA-10, INFRA-11, and INFRA-16 to Phase 13, and all three are claimed and satisfied across the plans.

---

### Anti-Patterns Found

No blockers or warnings found. No `TODO/FIXME/PLACEHOLDER` comments detected in the key delivery files. No stub implementations (manifests contain real symbol data; walker contains substantive ts-morph traversal logic including `getType().getBaseTypes()` recursion).

---

### Human Verification Required

None. All phase deliverables are file-system artifacts (manifests, config files, CI YAML, submodule pointers) verifiable programmatically. No visual rendering, live service calls, or real-time behavior is involved.

---

### Gaps Summary

No gaps. All 11 observable truths are verified. All 14 artifacts exist, are substantive, and are wired to their consumers. All three requirement IDs (INFRA-10, INFRA-11, INFRA-16) are satisfied by the implementation.

**Phase goal achieved:** The SDK source of truth is frozen in the repo (three initialized submodules pinned to npm-version-matching commits, with `sdk-pins.json` as the atomic version lock), and the machine-readable coverage contract exists (five JSON manifests generated by a ts-morph 25.0.1 walker, committed to `tools/sdk-surface/manifests/`, with WebClient exposing 392 traceable member paths).

---

_Verified: 2026-03-09T07:00:00Z_
_Verifier: Claude (gsd-verifier)_
