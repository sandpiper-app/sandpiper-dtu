# Phase 27: Conformance Harness & Coverage Infrastructure - Research

**Researched:** 2026-03-13
**Domain:** Conformance comparator, Vitest JSON reporter, coverage evidence schema
**Confidence:** HIGH

## Summary

Phase 27 closes two independent but related gaps in the conformance/coverage infrastructure. The conformance harness (`compareResponsesStructurally` in `packages/conformance/src/comparator.ts`) has two bugs in live mode: it only checks that twin fields exist in baseline (not the reverse), and it only inspects the first element of any array. The coverage system currently derives "live" tier from a hand-authored `LIVE_SYMBOLS` record literal inside `generate-report.ts` — the requirement is to replace this with test execution evidence produced by Vitest's built-in JSON reporter.

Both fixes are surgical. The comparator fix is a localised change to two functions in one file plus new unit tests. The coverage migration is a new generator script that reads a `--reporter=json` output file, a dual-run path to keep `pnpm drift:check` green during transition, and a new CI gate asserting the 202+ count. No new runtime dependencies are needed for either work stream.

**Primary recommendation:** Fix comparator first (simpler, fully self-contained), then build the evidence-based generator so `LIVE_SYMBOLS` and evidence run in parallel until evidence count >= 202, then remove `LIVE_SYMBOLS`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-21 | Conformance harness performs bidirectional structural comparison in live mode — twin response must contain all baseline fields AND baseline response must contain all twin fields — with full array traversal (not just first element) and primitive value comparison; includes a normalizer contract with declared ignore lists for non-deterministic fields, ordering rules, and per-endpoint exact-vs-structural mode declarations | Existing `compareResponsesStructurally` in `comparator.ts` only walks twin→baseline direction and only checks `arr[0]`; fix is additive to the same function; per-endpoint mode flag fits in `ConformanceTest` |
| INFRA-22 | Coverage status for each tracked symbol is derived from test execution evidence (Vitest JSON reporter or equivalent), not hand-authored `LIVE_SYMBOLS` map; evidence schema defines how test files map to symbols, how aliases are attributed, and how local-only utilities are excluded; dual-run migration keeps `LIVE_SYMBOLS` and evidence in parallel until evidence matches or exceeds the 202+ symbol count, then removes `LIVE_SYMBOLS` | Vitest 3.x JSON reporter is already in `devDependencies`; it emits `testResults[].name` (absolute filepath) + `assertionResults[].status`; a new `generate-report-evidence.ts` can replace `LIVE_SYMBOLS` lookup with filepath-based attribution |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dtu/conformance` | workspace | Comparator, runner, types | Project-owned; fix goes here |
| `vitest` | 3.2.4 (installed) | Test runner + JSON reporter | Already in devDependencies; JSON reporter built-in |
| `deep-diff` | ^1.0.2 | Deep value comparison (twin/offline mode) | Already in @dtu/conformance dependencies |
| `tsx` | ^4.0.0 | Run TypeScript scripts directly | Already used for `generate-report.ts` and `check-drift.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` | built-in | Read/write JSON evidence file | Evidence generator |
| `node:path` | built-in | Normalize absolute filepaths from vitest output | Path normalization in evidence generator |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest JSON reporter | Custom Vitest reporter plugin | Reporter plugin is complex to write; JSON reporter is built-in and sufficient |
| File-per-test attribution map | Inline annotation in test file names | Attribution map is more flexible; test name patterns are fragile |

**Installation:** No new dependencies needed.

---

## Architecture Patterns

### Recommended Project Structure
```
packages/conformance/src/
  comparator.ts          # INFRA-21: fix compareResponsesStructurally (bidirectional + all array elements)
  types.ts               # INFRA-21: add comparisonMode field to ConformanceTest

tests/sdk-verification/coverage/
  generate-report.ts           # INFRA-22: keep during dual-run (LIVE_SYMBOLS still present)
  generate-report-evidence.ts  # INFRA-22: new script reading vitest JSON output
  vitest-evidence.json         # INFRA-22: output of `pnpm test:sdk --reporter=json --outputFile=...`
  coverage-report.json         # INFRA-22: updated by generate-report-evidence.ts once evidence >= 202

tests/sdk-verification/drift/
  check-drift.ts         # INFRA-22: add 202+ live count gate using evidence
```

### Pattern 1: Bidirectional Structural Comparison

**What:** `compareResponsesStructurally` must walk baseline→twin as well as twin→baseline, and must recurse into every array element (not just index 0).

**When to use:** Called by `ConformanceRunner.run()` when `mode === 'live'`.

**Current code path (buggy):**
```typescript
// packages/conformance/src/comparator.ts, lines 151-177
// Current compareStructure only checks: for (const key of Object.keys(twinObj)) { ... }
// Missing: check that every key in baselineObj exists in twinObj
// Current array handling: only compares twinArr[0] vs baselineArr[0]
// Missing: all elements beyond index 0
```

**Fixed pattern:**
```typescript
// In compareStructure(), object branch — after iterating twinObj keys:
// Also iterate baselineObj keys to catch fields present in baseline but absent in twin:
for (const key of Object.keys(baselineObj)) {
  if (!(key in twinObj)) {
    differences.push({
      path: `${path}.${key}`,
      kind: 'deleted',
      rhs: `[type: ${getType(baselineObj[key])}]`,
    });
  }
}

// In array branch — replace first-element-only check with full traversal:
const len = Math.max(twinArr.length, baselineArr.length);
for (let i = 0; i < len; i++) {
  if (i >= twinArr.length) {
    differences.push({ path: `${path}[${i}]`, kind: 'deleted', rhs: baselineArr[i] });
  } else if (i >= baselineArr.length) {
    differences.push({ path: `${path}[${i}]`, kind: 'added', lhs: twinArr[i] });
  } else {
    compareStructure(twinArr[i], baselineArr[i], `${path}[${i}]`, differences);
  }
}
```

**Primitive value comparison:** The requirement says "catches behavioral mismatches where both responses have the same shape but different values." The current `compareStructure` explicitly skips primitive value differences ("Primitives: types already match, values can differ — no difference reported"). This must be made conditional on a per-suite or per-test `comparisonMode` flag. In `exact` mode, primitive values must match. In `structural` (default live) mode, values can differ.

### Pattern 2: Per-Endpoint Comparison Mode

**What:** `ConformanceTest` gains an optional `comparisonMode: 'structural' | 'exact'` field. Structural = current live behavior (shape only). Exact = value equality for primitives. Normalizer stripFields/normalizeFields still apply in both modes before comparison.

**When to use:** Most endpoints use `structural` (live data differs). Use `exact` for deterministic endpoints like error shapes where values must match even in live mode.

**Type change to `types.ts`:**
```typescript
export interface ConformanceTest {
  // ... existing fields ...
  /**
   * Comparison mode for live mode. Default: 'structural'.
   * 'structural': field shapes and types must match; primitive values may differ.
   * 'exact': full deep-equal after normalization (same as twin/offline mode).
   */
  comparisonMode?: 'structural' | 'exact';
}
```

**Runner change to `runner.ts`:**
```typescript
// In mode === 'live' branch:
const result = (test.comparisonMode === 'exact')
  ? compareResponses(...)       // existing deep-equal comparator
  : compareResponsesStructurally(...)  // fixed bidirectional structural comparator
```

### Pattern 3: Vitest JSON Evidence Schema

**What:** `pnpm test:sdk --reporter=json --outputFile=tests/sdk-verification/coverage/vitest-evidence.json` produces a file that `generate-report-evidence.ts` reads to derive live coverage.

**Vitest 3.x JSON reporter output shape** (confirmed from source in `node_modules/vitest/dist/chunks/index.VByaPkjc.js`):
```json
{
  "testResults": [
    {
      "name": "/absolute/path/to/tests/sdk-verification/sdk/slack-chat.test.ts",
      "status": "passed",
      "assertionResults": [
        {
          "fullName": "slack-chat chat.postMessage posts a message",
          "status": "passed",
          "title": "posts a message"
        }
      ]
    }
  ]
}
```

Key field: `testResults[].name` is the absolute filepath. Normalize to a relative path by stripping the repo root prefix to get `sdk/slack-chat.test.ts` — matching the `LIVE_SYMBOLS` attribution format.

**Evidence schema (new `evidence-schema.ts` or inline in generator):**
```typescript
interface EvidenceEntry {
  testFile: string;       // relative path: "sdk/slack-chat.test.ts"
  passed: boolean;        // test file had no failures
}
// Symbol attribution: same logic as LIVE_SYMBOLS but read from evidence file
// Key: "{pkgName}@{version}/{symbolPath}" -> testFile (same format)
// Attribution map: a static TS file (evidence-map.ts) replacing LIVE_SYMBOLS
```

**Attribution approach:** Keep a static symbol-to-testfile map (call it `EVIDENCE_MAP` in the new generator). The difference from `LIVE_SYMBOLS`:
- `EVIDENCE_MAP` maps symbol → test file path
- Generator validates that the mapped test file actually appears in `vitest-evidence.json` with `status: "passed"`
- Symbols whose mapped test file is absent or failed in the evidence are reported as `deferred`

This approach keeps explicit symbol tracking (no implicit "test filename implies coverage") while using execution evidence to validate that coverage is real.

### Pattern 4: Dual-Run Migration

**What:** During transition, both `generate-report.ts` (LIVE_SYMBOLS-based) and `generate-report-evidence.ts` (evidence-based) can produce a `coverage-report.json`. The migration is complete when evidence generator produces `live >= 202`.

**Migration gate in `check-drift.ts`:**
```typescript
// New check: evidence-based live count must be >= 202
const REQUIRED_LIVE_COUNT = 202;
if (report.summary.live < REQUIRED_LIVE_COUNT) {
  console.error(`FAIL live coverage: ${report.summary.live} < ${REQUIRED_LIVE_COUNT} required`);
  hasError = true;
}
```

**When to remove `LIVE_SYMBOLS`:** After `generate-report-evidence.ts` runs in CI and produces `live >= 202`, delete `generate-report.ts` + the `LIVE_SYMBOLS` map and update `pnpm coverage:generate` script to point to the new generator.

### Pattern 5: Normalizer Contract

The requirement says the normalizer must have "declared ignore lists for non-deterministic fields, ordering rules, and per-endpoint exact-vs-structural mode declarations." The existing `FieldNormalizerConfig` already covers `stripFields` and `normalizeFields`. Two additions are needed:

1. **Ordering rules:** An optional `sortFields` array in `FieldNormalizerConfig` — field paths whose array values should be sorted before comparison (e.g. `['channels', 'members.*.id']`). This prevents false failures when twin and live return the same elements in different orders.

2. **Per-endpoint mode:** Already covered by `ConformanceTest.comparisonMode` above.

```typescript
export interface FieldNormalizerConfig {
  stripFields: string[];
  normalizeFields: Record<string, string>;
  /** Array field paths to sort before comparison (prevents order sensitivity) */
  sortFields?: string[];
  custom?: (obj: unknown) => unknown;
}
```

### Anti-Patterns to Avoid

- **Fixing only twin→baseline direction:** The bug is two-sided. Must also check baseline→twin in `compareStructure`.
- **Still checking only `arr[0]`:** The array fix must iterate all elements.
- **Generating evidence without running tests first:** The evidence generator must fail fast if `vitest-evidence.json` is missing.
- **Removing `LIVE_SYMBOLS` before evidence covers >= 202 symbols:** The dual-run window prevents a coverage gap.
- **Using `--coverage` flag for evidence:** The JSON *reporter* (`--reporter=json`) is what emits `testResults[].name`. The `--coverage` flag is for code coverage, not test result evidence.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deep structural diff | Custom recursive differ | `deep-diff` (already in deps) + existing `compareResponses` | Edge cases around circular refs, special types |
| Test evidence collection | Custom test spy/hook | Vitest built-in JSON reporter | Already built in, zero new deps |
| JSON parsing/writing | Custom serializer | `JSON.parse`/`JSON.stringify` + `node:fs` | Sufficient for this use case |

**Key insight:** Both INFRA-21 and INFRA-22 are fixes to existing code, not new systems. The hard work is understanding the existing code contracts precisely.

---

## Common Pitfalls

### Pitfall 1: `compareStructure` only adds to `twinObj` keys
**What goes wrong:** After the fix, if you only add the baseline→twin direction check at the *function* level but forget to skip the recursive call for the twin→baseline direction when the key doesn't exist in baseline, you'll get duplicate diffs.
**Why it happens:** Both directions need to be tracked in one pass or guards must prevent double-reporting.
**How to avoid:** Use a Set of already-reported keys when iterating the second direction, or restructure to compute union of keys once.
**Warning signs:** Tests report the same path difference twice with `kind: 'added'` and `kind: 'deleted'`.

### Pitfall 2: Array length mismatch creates off-by-one errors
**What goes wrong:** When iterating `Math.max(twinArr.length, baselineArr.length)`, accessing past the end of either array throws unless guarded.
**Why it happens:** Array index access on undefined.
**How to avoid:** Explicit length checks: `if (i >= twinArr.length)` before accessing `twinArr[i]`.

### Pitfall 3: Vitest JSON reporter `name` field is absolute path
**What goes wrong:** Evidence generator tries to match `name` against the relative paths stored in `EVIDENCE_MAP` (e.g. `"sdk/slack-chat.test.ts"`) and finds no matches.
**Why it happens:** Vitest emits absolute paths like `/home/runner/work/.../tests/sdk-verification/sdk/slack-chat.test.ts`.
**How to avoid:** Normalize by stripping repo root: `name.replace(root + '/', '')` or use `path.relative(root, name)`.

### Pitfall 4: Evidence generator runs before `pnpm test:sdk`
**What goes wrong:** `vitest-evidence.json` is stale or missing, evidence count is 0, `drift:check` fails.
**Why it happens:** Developer runs generator standalone without generating fresh evidence.
**How to avoid:** Evidence generator checks that `vitest-evidence.json` exists and was modified within the last N minutes (or is newer than the test files). Fail fast with a clear error message.

### Pitfall 5: `pnpm test:sdk --reporter=json` also changes the console output
**What goes wrong:** The JSON reporter silences the human-readable output, making CI harder to debug.
**Why it happens:** Vitest JSON reporter replaces default reporter when specified alone.
**How to avoid:** Use multiple reporters: `--reporter=verbose --reporter=json --outputFile.json=...` — Vitest 3.x supports this pattern.

### Pitfall 6: Conformance suites currently use `ShopifyTwinAdapter.init()` with a hard-coded `conformance-test-code` OAuth exchange
**What goes wrong:** Phase 23 OAuth tightening added `client_id` + `client_secret` validation. The twin-adapter's `POST /admin/oauth/access_token` with `{ code: 'conformance-test-code' }` may now fail validation.
**Why it happens:** Phase 23 tightened OAuth — `client_id` and `client_secret` are now required for all grant types.
**How to avoid:** Check whether `ShopifyTwinAdapter.init()` still works as-is, or switch it to `POST /admin/tokens` (the test-only seeding endpoint introduced in Phase 21). The Slack twin-adapter and live adapters are not affected by this.

### Pitfall 7: `@dtu/conformance` package build must be done after comparator changes
**What goes wrong:** Twin packages import from `@dtu/conformance` dist. If `comparator.ts` is changed but the package is not rebuilt, the twins run old comparator code.
**Why it happens:** pnpm workspace uses compiled dist output for cross-package imports.
**How to avoid:** Include `pnpm -F @dtu/conformance build` as a task step whenever comparator.ts or types.ts changes.

---

## Code Examples

Verified patterns from existing source:

### Vitest JSON reporter invocation
```bash
# Source: vitest 3.2.4 CLI
# Produces testResults[].name (absolute filepath) + assertionResults[].status
pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json
```

### Evidence generator skeleton (new file)
```typescript
// tests/sdk-verification/coverage/generate-report-evidence.ts
// Source: mirrors generate-report.ts structure
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidencePath = join(root, 'tests/sdk-verification/coverage/vitest-evidence.json');

// Load vitest-evidence.json
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));

// Build a set of test files that ran and passed
const passedFiles = new Set<string>();
for (const result of evidence.testResults) {
  const relPath = relative(root, result.name);  // normalize absolute -> relative
  if (result.status === 'passed') {
    passedFiles.add(relPath);
  }
}

// EVIDENCE_MAP: same structure as LIVE_SYMBOLS
// Key: "{pkgKey}/{symbolPath}" -> "sdk/slack-chat.test.ts"
// (same file as generate-report.ts but renamed constant)
const EVIDENCE_MAP: Record<string, string> = { /* ... copy from LIVE_SYMBOLS ... */ };

// Derive coverage: same logic as generate-report.ts but uses passedFiles check
// ...
```

### Bidirectional structural comparison (fixed `compareStructure`)
```typescript
// packages/conformance/src/comparator.ts
// Source: fixes existing compareStructure function
function compareStructure(twin: unknown, baseline: unknown, path: string, differences: Difference[]): void {
  const twinType = getType(twin);
  const baselineType = getType(baseline);
  if (twinType !== baselineType) {
    differences.push({ path, kind: 'changed', lhs: `[type: ${twinType}]`, rhs: `[type: ${baselineType}]` });
    return;
  }
  if (twinType === 'object') {
    const twinObj = twin as Record<string, unknown>;
    const baselineObj = baseline as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(twinObj), ...Object.keys(baselineObj)]);
    for (const key of allKeys) {
      const inTwin = key in twinObj;
      const inBaseline = key in baselineObj;
      if (inTwin && inBaseline) {
        compareStructure(twinObj[key], baselineObj[key], `${path}.${key}`, differences);
      } else if (inTwin && !inBaseline) {
        differences.push({ path: `${path}.${key}`, kind: 'added', lhs: `[type: ${getType(twinObj[key])}]` });
      } else {
        differences.push({ path: `${path}.${key}`, kind: 'deleted', rhs: `[type: ${getType(baselineObj[key])}]` });
      }
    }
    return;
  }
  if (twinType === 'array') {
    const twinArr = twin as unknown[];
    const baselineArr = baseline as unknown[];
    const len = Math.max(twinArr.length, baselineArr.length);
    for (let i = 0; i < len; i++) {
      if (i >= twinArr.length) {
        differences.push({ path: `${path}[${i}]`, kind: 'deleted', rhs: baselineArr[i] });
      } else if (i >= baselineArr.length) {
        differences.push({ path: `${path}[${i}]`, kind: 'added', lhs: twinArr[i] });
      } else {
        compareStructure(twinArr[i], baselineArr[i], `${path}[${i}]`, differences);
      }
    }
    return;
  }
  // Primitives: in structural mode, values can differ; in exact mode, must match
  // (exact mode calls compareResponses, not compareResponsesStructurally, so
  //  this branch is only reached in structural mode — no action needed here)
}
```

### Per-endpoint exact mode in runner.ts
```typescript
// packages/conformance/src/runner.ts (in mode === 'live' branch)
const result = (test.comparisonMode === 'exact')
  ? compareResponses(
      test.id, test.name, test.category,
      twinResponse, baselineResponse,
      suite.normalizer, test.requirements ?? []
    )
  : compareResponsesStructurally(
      test.id, test.name, test.category,
      twinResponse, baselineResponse,
      test.requirements ?? [],
      suite.normalizer
    );
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twin-only mode (no live comparison) | Live mode calls `compareResponsesStructurally` | Phase 3+ conformance framework | Requires fixing bugs before live mode is trustworthy |
| `LIVE_SYMBOLS` hand-authored map | Vitest JSON evidence (Phase 27) | Phase 27 | Live coverage no longer requires manual map updates per phase |
| First-array-element comparison | Full array traversal | Phase 27 (INFRA-21) | Catches multi-element array shape mismatches |
| One-directional structural check | Bidirectional (INFRA-21) | Phase 27 | Catches extra fields in twin that don't exist in baseline |

**Deprecated/outdated after Phase 27:**
- `LIVE_SYMBOLS` record in `generate-report.ts`: superseded by `EVIDENCE_MAP` + execution evidence. Remove after evidence count >= 202 is confirmed in CI.

---

## Open Questions

1. **ShopifyTwinAdapter OAuth in init() after Phase 23 tightening**
   - What we know: Phase 23 added `client_id` + `client_secret` validation to `POST /admin/oauth/access_token`; `ShopifyTwinAdapter.init()` calls that endpoint with `{ code: 'conformance-test-code' }` (no client credentials)
   - What's unclear: Whether the Shopify twin's auth-code path still accepts the test code without credentials, or whether `ShopifyTwinAdapter.init()` is now broken
   - Recommendation: In Wave 0, add a conformance:twin smoke test that boots the adapter; if it fails, update `ShopifyTwinAdapter.init()` to use `POST /admin/tokens` (the seeding endpoint) and seed a real token

2. **`sortFields` in `FieldNormalizerConfig` — is it needed for existing suites?**
   - What we know: The requirement mentions "ordering rules" in the normalizer contract; no current conformance suite has this issue
   - What's unclear: Whether current live conformance suites encounter ordering differences
   - Recommendation: Add `sortFields?: string[]` to `FieldNormalizerConfig` and a helper in `normalizeResponse` — even if unused now, it completes the normalizer contract. Low implementation cost.

3. **`vitest-evidence.json` gitignore status**
   - What we know: It's a generated artifact from `pnpm test:sdk`
   - What's unclear: Whether to check it in (like `coverage-report.json`) or always regenerate
   - Recommendation: Regenerate in CI before running `drift:check`; do not check in (add to `.gitignore`). CI workflow: `pnpm test:sdk --reporter=json --outputFile.json=... && pnpm coverage:generate && pnpm drift:check`

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `tests/sdk-verification/vitest.config.ts` (sdk-verification project) |
| Quick run command | `pnpm test:sdk` |
| Full suite command | `pnpm test:sdk` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-21 | `compareResponsesStructurally` catches baseline fields missing from twin | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (existing) |
| INFRA-21 | `compareResponsesStructurally` traverses all array elements, not just first | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (existing, needs new cases) |
| INFRA-21 | `comparisonMode: 'exact'` triggers deep value comparison in live mode | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (existing, needs new cases) |
| INFRA-21 | `FieldNormalizerConfig.sortFields` sorts array elements before comparison | unit | `vitest run --project conformance packages/conformance/test/comparator.test.ts` | ✅ (existing, needs new cases) |
| INFRA-22 | Evidence generator produces `live >= 202` from vitest-evidence.json | integration (script) | `tsx tests/sdk-verification/coverage/generate-report-evidence.ts && node -e "..."` | ❌ Wave 0 |
| INFRA-22 | `drift:check` gate validates live count >= 202 from evidence | integration | `pnpm drift:check` | ✅ (existing, needs 202-gate code) |
| INFRA-22 | Transition: `LIVE_SYMBOLS` removed after evidence >= 202 confirmed | manual validation | `grep -c LIVE_SYMBOLS tests/sdk-verification/coverage/generate-report.ts` | manual |

### Sampling Rate
- **Per task commit:** `vitest run --project conformance packages/conformance/test/comparator.test.ts`
- **Per wave merge:** `pnpm test:sdk && pnpm drift:check`
- **Phase gate:** Full suite green (`pnpm test:sdk`) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sdk-verification/coverage/generate-report-evidence.ts` — covers INFRA-22 (new script)
- [ ] `tests/sdk-verification/coverage/vitest-evidence.json` — generated artifact, needs to be regenerated in CI; add to `.gitignore`
- [ ] New test cases in `packages/conformance/test/comparator.test.ts` — bidirectional checks, full array traversal, exact mode, sortFields

*(Existing `comparator.test.ts` is missing test cases for the new behaviors but the file exists.)*

---

## Sources

### Primary (HIGH confidence)
- `/Users/futur/projects/sandpiper-dtu/packages/conformance/src/comparator.ts` — current comparator implementation; bugs confirmed by code reading
- `/Users/futur/projects/sandpiper-dtu/packages/conformance/src/types.ts` — type definitions; no `comparisonMode` or `sortFields` fields exist yet
- `/Users/futur/projects/sandpiper-dtu/packages/conformance/src/runner.ts` — runner; live mode uses `compareResponsesStructurally`
- `/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/coverage/generate-report.ts` — LIVE_SYMBOLS map; source of current hand-authored coverage
- `/Users/futur/projects/sandpiper-dtu/node_modules/vitest/dist/chunks/index.VByaPkjc.js` — Vitest 3.2.4 JSON reporter implementation; `testResults[].name` is absolute filepath

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` INFRA-21/22 definitions — authoritative requirement text
- `.planning/STATE.md` — key decision: "Enable bidirectional conformance AFTER twin fixes are complete"
- `tests/sdk-verification/drift/check-drift.ts` — existing drift check; section to extend for 202-gate
- Coverage report summary: `{"live":202,"stub":0,"deferred":32477}` — current live count is exactly 202

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in devDependencies; no new dependencies
- Architecture: HIGH — confirmed by reading all relevant source files; bugs identified by direct code inspection
- Pitfalls: HIGH — confirmed from project history (Phase 23 OAuth tightening) and direct code reading

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase; no external API changes relevant)
