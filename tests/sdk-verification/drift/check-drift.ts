#!/usr/bin/env node
/**
 * SDK drift detection (Phase 14)
 *
 * Run: npx tsx tests/sdk-verification/drift/check-drift.ts
 *
 * Checks:
 *   1. Version drift: installed npm package versions vs sdk-pins.json (hard fail)
 *   2. Coverage null-tier gate: coverage-report.json must have no null-tier symbols (hard fail, INFRA-12)
 *      Every symbol must declare 'live' or 'deferred' — null means the generator missed it.
 *      'deferred' is acceptable in Phase 14. The gate tightens in Phase 18+.
 *   3. Submodule ref check: pinned commit SHAs vs current submodule HEAD (hard fail)
 *
 * Phase 20 will add manifest staleness checks.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

interface PinEntry {
  version: string;
  submodule: string;
  commit: string;
  packagePath: string;
}

interface SdkPins {
  packages: Record<string, PinEntry>;
}

const pins: SdkPins = JSON.parse(
  readFileSync(join(root, 'third_party/sdk-pins.json'), 'utf8')
);

let hasError = false;

// ─── 1. Version drift check ──────────────────────────────────────────────────
console.log('=== SDK Drift Check (Phase 14) ===\n');
console.log('Checking installed package versions against sdk-pins.json...\n');

for (const [pkgName, pin] of Object.entries(pins.packages)) {
  try {
    // Read installed version from node_modules
    const pkgJsonPath = join(root, 'node_modules', pkgName, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const installed = pkgJson.version as string;
    const pinned = pin.version;

    if (installed === pinned) {
      console.log(`  OK  ${pkgName}: ${installed} (matches pinned)`);
    } else {
      console.error(`  MISMATCH  ${pkgName}: installed=${installed}, pinned=${pinned}`);
      hasError = true;
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // pnpm may hoist to .pnpm store — try alternate path
      try {
        const { createRequire } = await import('node:module');
        const require = createRequire(join(root, 'package.json'));
        const pkgJson = require(`${pkgName}/package.json`);
        const installed = pkgJson.version;
        const pinned = pin.version;
        if (installed === pinned) {
          console.log(`  OK  ${pkgName}: ${installed} (matches pinned, resolved via require)`);
        } else {
          console.error(`  MISMATCH  ${pkgName}: installed=${installed}, pinned=${pinned}`);
          hasError = true;
        }
      } catch {
        console.error(`  ERROR  ${pkgName}: cannot resolve package.json`);
        hasError = true;
      }
    } else {
      console.error(`  ERROR  ${pkgName}: ${err.message}`);
      hasError = true;
    }
  }
}

// ─── 2. Coverage null-tier gate (INFRA-12) ───────────────────────────────────
console.log('\n=== Coverage Null-Tier Gate (INFRA-12) ===\n');
console.log('Every symbol must have tier "live" or "deferred". null = generator missed it.\n');

try {
  const coveragePath = join(root, 'tests/sdk-verification/coverage/coverage-report.json');
  const report = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const nullSymbols: string[] = [];

  for (const [pkgKey, symbols] of Object.entries(report.packages as Record<string, Record<string, { tier: string | null }>>)) {
    for (const [symbolPath, entry] of Object.entries(symbols)) {
      if (entry.tier === null || entry.tier === undefined) {
        nullSymbols.push(`${pkgKey}/${symbolPath}`);
      }
    }
  }

  if (nullSymbols.length === 0) {
    console.log(`  OK  All ${Object.values(report.packages as object).reduce((n, s) => n + Object.keys(s).length, 0)} symbols have declared tiers.`);
    console.log(`  Summary: ${report.summary.live} live, ${report.summary.deferred} deferred`);
  } else {
    console.error(`  FAIL  ${nullSymbols.length} symbol(s) have null tier — regenerate coverage-report.json with pnpm coverage:generate:`);
    for (const sym of nullSymbols.slice(0, 20)) {
      console.error(`    - ${sym}`);
    }
    if (nullSymbols.length > 20) {
      console.error(`    ... and ${nullSymbols.length - 20} more`);
    }
    hasError = true;
  }
} catch (err: any) {
  if (err.code === 'ENOENT') {
    console.error('  FAIL  coverage-report.json not found. Run: pnpm coverage:generate');
  } else {
    console.error(`  FAIL  Error reading coverage-report.json: ${err.message}`);
  }
  hasError = true;
}

// ─── 3. Submodule ref check ─────────────────────────────────────────────────
console.log('\n=== Submodule Ref Check ===\n');
console.log('Verifying pinned submodule commits match current git submodule state...\n');

try {
  const { execSync } = await import('node:child_process');
  for (const [pkgName, pin] of Object.entries(pins.packages)) {
    if (!pin.submodule) continue;
    try {
      // Get current submodule HEAD commit
      const submodulePath = join(root, pin.submodule);
      const currentRef = execSync(`git -C "${submodulePath}" rev-parse HEAD`, { encoding: 'utf8' }).trim();
      if (currentRef === pin.commit) {
        console.log(`  OK  ${pkgName}: submodule ref matches (${pin.commit.slice(0, 8)})`);
      } else {
        console.error(`  MISMATCH  ${pkgName}: submodule HEAD=${currentRef.slice(0, 8)}, pinned=${pin.commit.slice(0, 8)}`);
        hasError = true;
      }
    } catch {
      console.log(`  SKIP  ${pkgName}: submodule not found at ${pin.submodule} (may not be initialized)`);
    }
  }
} catch {
  console.log('  SKIP  git not available for submodule ref check');
}

// ─── 4. Manifest staleness (Phase 14 — informational) ────────────────────────
console.log('\n=== Manifest Staleness Check (Phase 14 — informational) ===');
console.log('TODO (Phase 20): Compare manifest generatedAt vs submodule last commit timestamp.\n');

if (hasError) {
  console.error('Drift or coverage issues detected. Resolve before merging.\n');
  process.exit(1);
} else {
  console.log('All checks passed. No drift detected.\n');
  process.exit(0);
}
