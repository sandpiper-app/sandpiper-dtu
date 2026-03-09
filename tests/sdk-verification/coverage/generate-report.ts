#!/usr/bin/env node
/**
 * Coverage report generator
 * Run: pnpm coverage:generate
 * Reads: tools/sdk-surface/manifests/*.json
 * Writes: tests/sdk-verification/coverage/coverage-report.json
 *
 * IMPORTANT: Re-run this script whenever new tests are added to update tiers.
 * Do NOT run automatically in CI — the file is checked in and diffed.
 *
 * INFRA-12 guarantee: every symbol is emitted with tier 'live' or 'deferred'.
 * null tier is never written. check-drift.ts enforces this as a CI gate.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const manifestsDir = join(root, 'tools/sdk-surface/manifests');
const outputPath = join(__dirname, 'coverage-report.json');

// Phase 14 live symbol attributions.
// Key format: "{packageName}@{version}/{symbolPath}"
// Update this map as new SDK tests are added in Phases 15-20.
const LIVE_SYMBOLS: Record<string, string> = {
  // SLCK-06.5 — slack-auth-gateway.test.ts
  '@slack/web-api@7.14.1/WebClient.auth.test': 'sdk/slack-auth-gateway.test.ts',
  '@slack/web-api@7.14.1/WebClient.api.test': 'sdk/slack-auth-gateway.test.ts',
  // INFRA-15 — shopify-client-wire.test.ts
  // NOTE: AdminApiClient is a TypeAlias in the manifest (no members).
  // The actual tested symbol is createAdminApiClient — the factory function called in tests.
  '@shopify/admin-api-client@1.1.1/createAdminApiClient': 'sdk/shopify-client-wire.test.ts',
};

interface ManifestSymbol {
  kind: string;
  members?: string[];
}

interface Manifest {
  package: string;
  version: string;
  generatedAt: string;
  symbolCount: number;
  symbols: Record<string, ManifestSymbol>;
}

const packages: Record<string, Record<string, { tier: 'live' | 'deferred'; testFile: string | null }>> = {};
let totalLive = 0;
let totalDeferred = 0;

// Read all manifest files
const manifestFiles = readdirSync(manifestsDir).filter(f => f.endsWith('.json'));

for (const file of manifestFiles) {
  const manifest: Manifest = JSON.parse(readFileSync(join(manifestsDir, file), 'utf8'));
  const pkgKey = `${manifest.package}@${manifest.version}`;
  packages[pkgKey] = {};

  for (const [symbolName, symbolDef] of Object.entries(manifest.symbols)) {
    // Emit the top-level symbol — always 'live' or 'deferred', never null
    const topKey = `${pkgKey}/${symbolName}`;
    const testFile = LIVE_SYMBOLS[topKey] ?? null;
    const tier: 'live' | 'deferred' = testFile ? 'live' : 'deferred';
    packages[pkgKey][symbolName] = { tier, testFile };
    if (tier === 'live') totalLive++; else totalDeferred++;

    // Emit member symbols for classes/interfaces (e.g., WebClient.auth.test)
    if (symbolDef.members) {
      for (const member of symbolDef.members) {
        const memberPath = `${symbolName}.${member}`;
        const memberKey = `${pkgKey}/${memberPath}`;
        const memberTestFile = LIVE_SYMBOLS[memberKey] ?? null;
        const memberTier: 'live' | 'deferred' = memberTestFile ? 'live' : 'deferred';
        packages[pkgKey][memberPath] = { tier: memberTier, testFile: memberTestFile };
        if (memberTier === 'live') totalLive++; else totalDeferred++;
      }
    }
  }
}

const report = {
  $schema: 'https://sandpiper.dev/schemas/coverage-report.json',
  generatedAt: new Date().toISOString(),
  phase: '14',
  note: 'Phase 14: tracking established. All symbols declared live or deferred. CI gate: no null tiers allowed.',
  packages,
  summary: { live: totalLive, stub: 0, deferred: totalDeferred },
};

writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Coverage report written to ${outputPath}`);
console.log(`Summary: ${totalLive} live, 0 stub, ${totalDeferred} deferred`);
console.log('INFRA-12: all symbols have declared tier (no null values).');
