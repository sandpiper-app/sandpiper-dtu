/**
 * Phase 41 — RED contracts for currently open proof-integrity regressions.
 *
 * This file reads source files directly from disk to assert proof-integrity
 * invariants. Tests are designed to fail on the current branch for the exact
 * proof gaps identified in the post-remediation re-audit.
 *
 * Tests 2–4 must FAIL on the current branch with assertion-style failures.
 * None should fail with SyntaxError, module-load errors, or fixture crashes.
 *
 * Note (deviation): Test 1 is GREEN on this branch because plan 41-02 ran
 * ahead of 41-01 and already fixed the root build script. It is retained as
 * a regression guard so subsequent plans cannot revert the fix.
 *
 * Proof gaps under contract:
 *   1. Root build script must include both ./packages/* and ./twins/*
 *      (REGRESSION GUARD — already fixed by 41-02)
 *   2. shopify-api-client.ts records top-level symbol hits outside proxy getters
 *      (eager construction-time hits inflate live symbol count)
 *   3. slack-method-coverage.test.ts proves only representative methods per family,
 *      not the full pinned bound surface
 *   4. comparator.ts normalizeResponse collapses headers to content-type only,
 *      stripping deterministic proof headers like x-shopify-api-version
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Test 1: build script includes twin builds
// ---------------------------------------------------------------------------

describe('Proof integrity regression contracts — Phase 41', () => {
  it('build script includes twin builds', () => {
    const pkgJson = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8')
    ) as { scripts?: { build?: string } };

    const buildScript = pkgJson.scripts?.build ?? '';

    // Regression guard: the build script must include both ./packages/* and ./twins/*
    // so that pnpm build fails when either a package or a twin fails to compile.
    // This was fixed in plan 41-02 — assertion retained to prevent regression.
    expect(buildScript).toContain('./packages/*');
    expect(buildScript).toContain('./twins/*');
  });

  // ---------------------------------------------------------------------------
  // Test 2: shopify-api-client does not record top-level symbols at construction time
  // ---------------------------------------------------------------------------

  it('shopify-api-client does not record top-level symbols at construction time', () => {
    const clientSrc = readFileSync(
      join(root, 'tests/sdk-verification/helpers/shopify-api-client.ts'),
      'utf8'
    );

    // The following symbols are recorded eagerly at the top level of
    // createShopifyApiClient(), OUTSIDE of proxy getters or wrapped constructors.
    // This inflates the live symbol count because the hits are recorded on every
    // call to createShopifyApiClient() regardless of which surfaces are actually
    // exercised during the test.
    //
    // The correct implementation: these symbols should only be recorded when
    // a test actually accesses shopify.auth, shopify.clients, shopify.rest, etc.
    // (i.e., inside the proxy getter or when a RestClient is constructed).
    //
    // RED: the file currently contains all of these as bare recordSymbolHit()
    // calls outside proxy getters. The test fails because these eager calls exist.
    const eagerSymbols = [
      'Shopify.auth',
      'Shopify.clients',
      'ShopifyClients',
      'ShopifyClients.Rest',
      'Shopify.rest',
      'ShopifyClients.graphqlProxy',
    ];

    // Extract all lines that are bare recordSymbolHit calls (not inside a Proxy
    // construct handler or instrument block). The pattern is a top-level call
    // (indented with 2 spaces, the level of the function body) immediately
    // recording one of the eager symbols.
    //
    // We check: does the file contain recordSymbolHit(...) calls for these symbols
    // at function-body level (not inside a Proxy construct block)?
    // A proxy construct block would have the line indented >= 6 spaces (inside the handler).
    //
    // Simpler heuristic: assert that NONE of the following patterns appear in the file
    // as a 2-space-indented top-level call (right after shopifyApi() returns).
    // We look for the pattern: 2-space indent + recordSymbolHit + the symbol name.

    for (const symbol of eagerSymbols) {
      // Check for eager call: 2-space-indented recordSymbolHit at function body level
      // (2 spaces = function body, not inside a construct() handler which would be 6+ spaces)
      const eagerPattern = new RegExp(`^  recordSymbolHit\\([^)]*${symbol.replace('.', '\\.')}[^)]*\\)`, 'm');
      const hasEagerCall = eagerPattern.test(clientSrc);

      // RED: these eager calls currently exist in the file.
      // After the fix, recordSymbolHit for Shopify.auth, Shopify.clients, etc.
      // must be inside proxy getters or construct handlers, not at function body level.
      expect(hasEagerCall).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: slack method coverage proof is not representative-only
  // ---------------------------------------------------------------------------

  it('slack method coverage proof is not representative-only', () => {
    const coverageSrc = readFileSync(
      join(root, 'tests/sdk-verification/sdk/slack-method-coverage.test.ts'),
      'utf8'
    );

    // RED: the file currently contains "representative method" which signals that
    // only a subset of the bound WebClient surface is tested (one per family).
    // After the fix, every method in the pinned @slack/web-api@7.14.1 manifest
    // must be proven, not just representative samples.
    expect(coverageSrc).not.toContain('representative method');
  });

  // ---------------------------------------------------------------------------
  // Test 4: conformance comparator preserves deterministic proof headers
  // ---------------------------------------------------------------------------

  it('conformance comparator preserves deterministic proof headers', () => {
    const comparatorSrc = readFileSync(
      join(root, 'packages/conformance/src/comparator.ts'),
      'utf8'
    );

    // The normalizeResponse function currently strips all headers except content-type.
    // This is the buggy implementation:
    //   const { 'content-type': contentType } = response.headers;
    //   headers: contentType ? { 'content-type': contentType } : {},
    //
    // In exact-mode comparison (comparisonMode: 'exact'), this means deterministic
    // proof headers like x-shopify-api-version, x-oauth-scopes, and x-accepted-oauth-scopes
    // are stripped before comparison. The twin's proof that it echoes these headers
    // is thus unverifiable.
    //
    // RED: the comparator currently collapses to content-type-only.
    // Assert the implementation does NOT contain this exact-mode-header-stripping pattern.
    // After the fix, exact-mode comparison must compare all headers (or at least
    // the deterministic proof headers: x-shopify-api-version, x-oauth-scopes,
    // x-accepted-oauth-scopes).

    // The current broken pattern: only content-type survives normalization
    const onlyContentTypePattern = /const \{ 'content-type': contentType \} = response\.headers/;
    const stripsToContentTypeOnly = onlyContentTypePattern.test(comparatorSrc);

    // RED: this pattern currently exists — normalizeResponse strips all non-content-type headers.
    // After the fix, this destructuring-only-content-type pattern must be removed or
    // replaced with logic that preserves deterministic proof headers.
    expect(stripsToContentTypeOnly).toBe(false);
  });
});
