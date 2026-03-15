---
phase: quick
plan: 3
subsystem: scope-enforcement, symbol-attribution, conformance
tags: [scope, default-deny, shopify-config, conformance, header-comparison, external-review]
dependency_graph:
  requires: []
  provides:
    - default-deny checkScope() for uncatalogued Slack methods
    - Shopify.config symbol hit attributed only on actual proxy access
    - compareAllHeaders denylist mode in conformance package
  affects:
    - twins/slack/src/services/method-scopes.ts
    - tests/sdk-verification/helpers/shopify-api-client.ts
    - packages/conformance/src/types.ts
    - packages/conformance/src/comparator.ts
    - twins/shopify/conformance/normalizer.ts
    - twins/slack/conformance/normalizer.ts
tech_stack:
  added: []
  patterns:
    - default-deny guard pattern for method scope catalog lookups
    - proxy getter for lazy symbol attribution
    - denylist header comparison (compareAllHeaders + ignoreHeaders)
key_files:
  created:
    - tests/sdk-verification/sdk/slack-scope-enforcement.test.ts (added checkScope unit tests)
  modified:
    - twins/slack/src/services/method-scopes.ts
    - tests/sdk-verification/helpers/shopify-api-client.ts
    - packages/conformance/src/types.ts
    - packages/conformance/src/comparator.ts
    - twins/shopify/conformance/normalizer.ts
    - twins/slack/conformance/normalizer.ts
decisions:
  - "compareAllHeaders sits alongside compareHeaders — both work independently; new block skips headers already in allowlist to prevent double-reporting"
  - "ignoreHeaders denylist is identical across both twin normalizers: date, x-request-id, set-cookie, connection, keep-alive, transfer-encoding, content-length"
metrics:
  duration: "~6 minutes"
  completed: "2026-03-15"
  tasks_completed: 2
  files_modified: 6
---

# Quick Task 3: Fix Remaining 3 Issues from External Review Summary

**One-liner:** Default-deny checkScope for uncatalogued methods, lazy Shopify.config attribution via proxy getter, and compareAllHeaders denylist for automatic conformance header coverage.

## Objective

Close three findings from the external review deferred past Milestone v1.2:
- Finding #7: `checkScope()` silently passed uncatalogued methods
- Finding #10: `Shopify.config` symbol hit recorded at construction time, inflating evidence for every test
- Finding #11: Conformance header comparison limited to explicit allowlist; new deterministic headers silently dropped

## Tasks Completed

### Task 1: Default-deny checkScope and Shopify.config attribution fix

**Commit:** 78a2eb6

**Finding #7 — checkScope() default-deny:**

Split the single combined guard in `checkScope()` at `twins/slack/src/services/method-scopes.ts` line 404:

Before:
```typescript
if (!required || required.length === 0) return null;
```

After:
```typescript
if (required !== undefined && required.length === 0) return null; // explicitly empty → pass
if (required === undefined) {
  return { error: 'missing_scope', needed: 'unknown (method not in scope catalog)', provided: tokenScope };
}
```

The original falsy check `!required` treated `undefined` (uncatalogued method) identically to `[]` (explicitly no-scope method like `auth.test`). Both returned null. After the fix, only an explicit empty array returns null; undefined triggers a missing_scope error.

**Finding #10 — Shopify.config attribution:**

Removed the eager `recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify.config')` call at construction time (lines 102-104 in `shopify-api-client.ts`). Added `config: '@shopify/shopify-api@12.3.0/Shopify.config'` to the `SHOPIFY_NAMESPACE_SYMBOLS` proxy map alongside `auth`, `clients`, `rest`, etc. The proxy getter now fires the hit only when a test reads `shopify.config` — not on every call to `createShopifyApiClient()`.

**New unit tests added (`slack-scope-enforcement.test.ts`):**
- `checkScope('nonexistent.method', 'read')` → `{ error: 'missing_scope', needed: 'unknown (method not in scope catalog)', provided: 'read' }`
- `checkScope('auth.test', 'read')` → `null` (explicitly empty scope list)
- `checkScope('chat.postMessage', 'chat:write')` → `null` (valid scope)
- `checkScope('chat.postMessage', 'read')` → `{ error: 'missing_scope', needed: 'chat:write', provided: 'read' }`

### Task 2: Conformance compareAllHeaders denylist mode

**Commit:** bb4c856

**Finding #11 — Header comparison coverage:**

Added two new optional fields to `FieldNormalizerConfig` in `packages/conformance/src/types.ts`:
- `compareAllHeaders?: boolean` — opt-in denylist mode
- `ignoreHeaders?: string[]` — volatile headers to exclude

Updated `normalizeResponse()` in `comparator.ts`: when `compareAllHeaders` is true, retains all response headers not in `ignoreHeaders` (using a Set for O(1) lookup), skipping any already retained by `content-type` or `compareHeaders`.

Updated `compareResponsesStructurally()` in `comparator.ts`: when `compareAllHeaders` is true, unions all header names from both twin and baseline, skips ignored and allowlist headers, then reports added/changed/deleted mismatches for the remainder.

Both twin normalizers updated:
```typescript
compareAllHeaders: true,
ignoreHeaders: ['date', 'x-request-id', 'set-cookie', 'connection', 'keep-alive', 'transfer-encoding', 'content-length'],
```

The existing `compareHeaders` entries are preserved — they remain functional under the allowlist path and the new block explicitly skips them to prevent double-reporting.

## Verification Results

**Scope enforcement tests (vitest):**
- 4 new checkScope unit tests: all pass
- 14 existing SLCK-15/18/19 integration tests: all pass

**TypeScript compilation:**
- `packages/conformance/tsconfig.json`: clean
- `twins/shopify/tsconfig.json`: clean
- `twins/slack/tsconfig.json`: clean

**Full SDK verification suite:**
- 673 tests across 45 files: all pass
- Proof integrity regression test confirmed: "shopify-api-client does not record top-level symbols at construction time" — validates the Shopify.config attribution fix

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All modified files exist on disk. Commits 78a2eb6 and bb4c856 confirmed in git log.
