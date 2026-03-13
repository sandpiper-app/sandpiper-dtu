---
phase: 27-conformance-harness-coverage-infrastructure
plan: "01"
subsystem: conformance
tags: [conformance, comparator, structural-comparison, oauth, shopify-twin]
dependency_graph:
  requires: [26-03]
  provides: [bidirectional-structural-comparison, sortFields-normalization, comparisonMode-routing, shopify-twin-adapter-fix]
  affects: [packages/conformance, twins/shopify/conformance]
tech_stack:
  added: []
  patterns: [union-of-keys bidirectional comparison, Math.max array traversal, randomUUID token seeding]
key_files:
  created: []
  modified:
    - packages/conformance/src/types.ts
    - packages/conformance/src/comparator.ts
    - packages/conformance/src/runner.ts
    - packages/conformance/test/comparator.test.ts
    - twins/shopify/conformance/adapters/twin-adapter.ts
    - twins/shopify/conformance/suites/products.conformance.ts
decisions:
  - "Union-of-keys (allKeys Set) in compareStructure catches both directions: twin-extra as 'added', baseline-only as 'deleted'"
  - "Math.max(twinArr.length, baselineArr.length) traversal reports all array mismatches, not just index 0"
  - "sortArrayField helpers placed after normalizeFieldRecursive; sortFields applied in both compareResponsesStructurally and normalizeResponse so exact mode also benefits"
  - "ShopifyTwinAdapter.init() uses randomUUID token seeded via POST /admin/tokens — fixes Phase 23 OAuth tightening (client_id/client_secret required)"
  - "comparisonMode:'exact' proof-of-concept on products-create-validation (empty-title userErrors — deterministic response)"
metrics:
  duration: "8min"
  completed_date: "2026-03-13"
  tasks_completed: 3
  files_modified: 6
---

# Phase 27 Plan 01: Conformance Harness Fix Summary

**One-liner:** Bidirectional structural comparator with full array traversal, sortFields normalization, comparisonMode routing, and ShopifyTwinAdapter OAuth fix using POST /admin/tokens.

## What Was Built

Three coordinated changes make the conformance harness catch real behavioral regressions:

**1. types.ts** — Two new optional fields on existing interfaces:
- `ConformanceTest.comparisonMode?: 'structural' | 'exact'` — per-test live-mode comparison override
- `FieldNormalizerConfig.sortFields?: string[]` — array paths to sort before comparison

**2. comparator.ts** — Three fixes to `compareStructure` and normalization:
- **Bidirectional comparison**: replaced `Object.keys(twinObj)` loop with `allKeys = new Set([...twin keys, ...baseline keys])`. Baseline-only fields now reported as `'deleted'` instead of silently ignored.
- **Full array traversal**: replaced single `arr[0]` comparison with `Math.max(len)` loop. Every element checked; length mismatches reported as `'added'` or `'deleted'`.
- **sortFields pre-processing**: `sortArrayField` + `sortArrayFieldRecursive` helpers sort named array fields before structural or exact comparison. Applied in both `compareResponsesStructurally` (via inline normalization block) and `normalizeResponse` (for exact mode via `compareResponses`).

**3. runner.ts** — `comparisonMode` routing in live branch:
- `test.comparisonMode === 'exact'` → `compareResponses` (full deep-equal after normalization)
- Default → `compareResponsesStructurally` (shape/type only)

**4. twins/shopify/conformance/adapters/twin-adapter.ts** — Fixed broken `init()`:
- Removed `POST /admin/oauth/access_token` with `{ code: 'conformance-test-code' }` (broken since Phase 23 tightened OAuth to require `client_id` + `client_secret`)
- Now generates `shpat_conformance_{randomUUID()}` token and seeds it via `POST /admin/tokens` (introduced Phase 21 for exactly this use case)

**5. comparator.test.ts** — 7 new `compareResponsesStructurally` unit tests covering all new behaviors (11 existing + 7 new = 18 total, all GREEN)

**6. products.conformance.ts** — `comparisonMode: 'exact'` on `products-create-validation` test as proof-of-concept

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
npx vitest run packages/conformance/test/comparator.test.ts
# 18 tests passed (11 existing + 7 new)

pnpm -F @dtu/conformance build
# tsc exits 0

grep -n "allKeys" packages/conformance/src/comparator.ts
# line 164: const allKeys = new Set([...Object.keys(twinObj), ...Object.keys(baselineObj)]);

grep -n "admin/tokens" twins/shopify/conformance/adapters/twin-adapter.ts
# lines 25, 31, 41
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c050b76 | feat(27-01): add comparisonMode and sortFields to conformance types |
| 2 | ec1efe4 | feat(27-01): fix comparator — bidirectional structural comparison + full array traversal + sortFields |
| 3 | dc22c80 | feat(27-01): wire comparisonMode in runner, fix ShopifyTwinAdapter OAuth, add 7 structural tests |

## Self-Check: PASSED

All modified files exist on disk. All 3 task commits verified in git log. 18/18 unit tests GREEN. tsc build exits 0.
