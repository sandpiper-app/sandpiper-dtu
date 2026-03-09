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

// Phase 14+ live symbol attributions.
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
  // Phase 15: SHOP-08 GraphQL client methods — shopify-admin-graphql-client.test.ts
  '@shopify/admin-api-client@1.1.1/AdminApiClient': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.request': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.fetch': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.getHeaders': 'sdk/shopify-admin-graphql-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminApiClient.getApiUrl': 'sdk/shopify-admin-graphql-client.test.ts',
  // Phase 15: SHOP-09 REST client methods — shopify-admin-rest-client.test.ts
  '@shopify/admin-api-client@1.1.1/createAdminRestApiClient': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.get': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.post': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.put': 'sdk/shopify-admin-rest-client.test.ts',
  '@shopify/admin-api-client@1.1.1/AdminRestApiClient.delete': 'sdk/shopify-admin-rest-client.test.ts',
  // Phase 16: SHOP-11/12/13 platform surface — shopify-api-auth/session/webhooks/billing.test.ts
  // NOTE: manifest confirmed all keys below exist in shopify-shopify-api@12.3.0.json
  '@shopify/shopify-api@12.3.0/shopifyApi': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.config': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.auth': 'sdk/shopify-api-auth.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.session': 'sdk/shopify-api-session.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.webhooks': 'sdk/shopify-api-webhooks.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.flow': 'sdk/shopify-api-webhooks.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.fulfillmentService': 'sdk/shopify-api-webhooks.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.billing': 'sdk/shopify-api-billing.test.ts',
  // Phase 17: SHOP-14 client surfaces — shopify-api-graphql-client/rest-client/storefront-client.test.ts
  // NOTE: StorefrontClient is not in the @shopify/shopify-api manifest (separate Storefront SDK);
  //       REST resource classes (Product, Customer, etc.) are not in this manifest either.
  //       Only manifest-confirmed symbols are listed here.
  '@shopify/shopify-api@12.3.0/GraphqlClient': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlClient.request': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlClient.query': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.get': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.post': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.put': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/RestClient.delete': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Graphql': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Rest': 'sdk/shopify-api-rest-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.Storefront': 'sdk/shopify-api-storefront-client.test.ts',
  '@shopify/shopify-api@12.3.0/ShopifyClients.graphqlProxy': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/GraphqlProxy': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.clients': 'sdk/shopify-api-graphql-client.test.ts',
  '@shopify/shopify-api@12.3.0/Shopify.rest': 'sdk/shopify-api-rest-client.test.ts',
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
  phase: '17',
  note: 'Phase 17: @shopify/shopify-api GraphqlClient, RestClient, ShopifyClients, graphqlProxy, Shopify.clients and Shopify.rest client surfaces attributed (SHOP-14). Phase 16 platform surface (shopifyApi, Shopify.auth/session/webhooks/billing/flow/fulfillmentService) backfilled. REST resource classes (Product, Customer, etc.) are not in the @shopify/shopify-api manifest — SHOP-15 coverage is via RestClient.get/post/put/delete methods. SHOP-14 + SHOP-15 complete.',
  packages,
  summary: { live: totalLive, stub: 0, deferred: totalDeferred },
};

writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Coverage report written to ${outputPath}`);
console.log(`Summary: ${totalLive} live, 0 stub, ${totalDeferred} deferred`);
console.log('INFRA-12: all symbols have declared tier (no null values).');
