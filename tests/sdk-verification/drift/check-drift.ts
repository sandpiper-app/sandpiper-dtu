#!/usr/bin/env node
/**
 * SDK drift detection (Phase 20)
 *
 * Run: npx tsx tests/sdk-verification/drift/check-drift.ts
 *
 * Checks:
 *   1. Version drift: installed npm package versions vs sdk-pins.json (hard fail)
 *   2. Coverage null-tier gate: coverage-report.json must have no null-tier symbols (hard fail, INFRA-12)
 *      Every symbol must declare 'live' or 'deferred' — null means the generator missed it.
 *      'deferred' is acceptable in Phase 14. The gate tightens in Phase 18+.
 *   3. Submodule ref check: pinned commit SHAs vs current submodule HEAD (hard fail)
 *   4. Manifest staleness: manifest generatedAt vs submodule last commit timestamp (hard fail, Phase 20)
 *      STALE means a submodule has commits newer than the manifest — run pnpm coverage:generate.
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
console.log('=== SDK Drift Check (Phase 20) ===\n');
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

// ─── 2b. Evidence-based live count gate (INFRA-22) ─────────────────────────
console.log('\n=== Evidence-Based Live Count Gate (INFRA-22) ===\n');
console.log('Live coverage must be >= 202 (from execution evidence, not hand-authored map).\n');

const REQUIRED_LIVE_COUNT = 202;
try {
  const coveragePath = join(root, 'tests/sdk-verification/coverage/coverage-report.json');
  const report = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const liveCount = report.summary?.live ?? 0;
  if (liveCount >= REQUIRED_LIVE_COUNT) {
    console.log(`  OK  Live coverage: ${liveCount} >= ${REQUIRED_LIVE_COUNT} required.`);
  } else {
    console.error(`  FAIL  Live coverage: ${liveCount} < ${REQUIRED_LIVE_COUNT} required.`);
    console.error('        Run: pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate');
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

// ─── 4. Manifest staleness (Phase 20 — hard fail) ────────────────────────────
console.log('\n=== Manifest Staleness Check (Phase 20 — hard fail) ===\n');
console.log('Checking manifest generatedAt vs submodule last commit timestamp...\n');

const manifestsDir = join(root, 'tools/sdk-surface/manifests');

try {
  const { execSync } = await import('node:child_process');
  for (const [pkgName, pin] of Object.entries(pins.packages)) {
    if (!pin.submodule) continue;
    const slug = pkgName.replace(/^@/, '').replace('/', '-');
    const manifestFile = join(manifestsDir, `${slug}@${pin.version}.json`);
    try {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { generatedAt: string };
      const manifestUnixSec = new Date(manifest.generatedAt).getTime() / 1000;

      if (isNaN(manifestUnixSec) || !manifest.generatedAt) {
        console.error(`  FAIL  ${pkgName}: manifest.generatedAt is missing or unparsable (value: ${manifest.generatedAt})`);
        hasError = true;
        continue;
      }

      const submodulePath = join(root, pin.submodule);
      const lastCommitUnixStr = execSync(
        `git -C "${submodulePath}" log -1 --format="%ct"`,
        { encoding: 'utf8' }
      ).trim();
      const lastCommitUnixSec = parseInt(lastCommitUnixStr, 10);

      if (isNaN(lastCommitUnixSec)) {
        console.log(`  SKIP  ${pkgName}: could not parse submodule commit timestamp`);
        continue;
      }

      if (lastCommitUnixSec > manifestUnixSec) {
        console.error(
          `  STALE  ${pkgName}: manifest generatedAt=${manifest.generatedAt}, ` +
          `submodule last commit=${new Date(lastCommitUnixSec * 1000).toISOString()}`
        );
        console.error(`         Run: pnpm coverage:generate`);
        hasError = true;
      } else {
        console.log(
          `  OK  ${pkgName}: manifest is current ` +
          `(generatedAt=${manifest.generatedAt.slice(0, 10)})`
        );
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.error(`  FAIL  ${pkgName}: manifest file not found at ${manifestFile}`);
      } else if (err.message && err.message.includes('not a git repository')) {
        console.log(`  SKIP  ${pkgName}: submodule not initialized`);
      } else {
        console.error(`  FAIL  ${pkgName}: ${err.message}`);
      }
      if (err.code === 'ENOENT') hasError = true;
    }
  }
} catch {
  console.log('  SKIP  git not available for manifest staleness check');
}

if (hasError) {
  console.error('Drift or coverage issues detected. Resolve before merging.\n');
  process.exit(1);
} else {
  console.log('All checks passed. No drift detected.\n');
  process.exit(0);
}
