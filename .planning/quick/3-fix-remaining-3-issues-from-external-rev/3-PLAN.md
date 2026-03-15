---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - twins/slack/src/services/method-scopes.ts
  - tests/sdk-verification/sdk/slack-scope-enforcement.test.ts
  - tests/sdk-verification/helpers/shopify-api-client.ts
  - packages/conformance/src/types.ts
  - packages/conformance/src/comparator.ts
  - twins/shopify/conformance/normalizer.ts
  - twins/slack/conformance/normalizer.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "checkScope() returns a missing_scope error for any method not in METHOD_SCOPES (default-deny)"
    - "checkScope() still passes for methods with an explicitly empty scope list (e.g., auth.test)"
    - "Shopify.config is credited only to tests that actually access shopify.config, not every test that calls createShopifyApiClient()"
    - "Twin normalizers can opt in to compare all non-volatile headers rather than only an explicit allowlist"
  artifacts:
    - path: "twins/slack/src/services/method-scopes.ts"
      provides: "Default-deny checkScope()"
      contains: "method not in scope catalog"
    - path: "packages/conformance/src/types.ts"
      provides: "compareAllHeaders and ignoreHeaders on FieldNormalizerConfig"
      exports: ["compareAllHeaders", "ignoreHeaders"]
    - path: "packages/conformance/src/comparator.ts"
      provides: "Header comparison logic honoring compareAllHeaders"
      contains: "compareAllHeaders"
  key_links:
    - from: "twins/slack/src/services/method-scopes.ts"
      to: "tests/sdk-verification/sdk/slack-scope-enforcement.test.ts"
      via: "checkScope() called with uncatalogued method → expect error result"
      pattern: "checkScope"
    - from: "packages/conformance/src/types.ts"
      to: "packages/conformance/src/comparator.ts"
      via: "FieldNormalizerConfig.compareAllHeaders read in normalizeResponse() and compareResponsesStructurally()"
      pattern: "compareAllHeaders"
---

<objective>
Close three findings from the external review that were deferred past Milestone v1.2:
- Finding #7: `checkScope()` silently passes uncatalogued methods (should default-deny)
- Finding #10: `Shopify.config` symbol hit recorded at construction time, inflating evidence for every test
- Finding #11: Conformance header comparison is limited to an explicit allowlist; new deterministic headers are silently dropped

Purpose: Harden correctness guarantees — scope enforcement, test evidence attribution, and conformance coverage are all tightened to fail loudly rather than pass silently.
Output: Patched source files and a new unit test for default-deny scope behavior.
</objective>

<execution_context>
@/Users/futur/.claude/get-shit-done/workflows/execute-plan.md
@/Users/futur/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Default-deny checkScope and fix Shopify.config attribution</name>
  <files>
    twins/slack/src/services/method-scopes.ts,
    tests/sdk-verification/sdk/slack-scope-enforcement.test.ts,
    tests/sdk-verification/helpers/shopify-api-client.ts
  </files>
  <behavior>
    Fix 1 — checkScope() default-deny (twins/slack/src/services/method-scopes.ts line 404):
    - BEFORE: `if (!required || required.length === 0) return null;`
    - AFTER: split into two guards:
      ```
      if (required !== undefined && required.length === 0) return null; // explicitly empty → pass (e.g. auth.test)
      if (required === undefined) {
        return { error: 'missing_scope', needed: 'unknown (method not in scope catalog)', provided: tokenScope };
      }
      ```
    - Test cases to add to tests/sdk-verification/sdk/slack-scope-enforcement.test.ts:
      - `checkScope('nonexistent.method', 'read')` returns `{ error: 'missing_scope', needed: 'unknown (method not in scope catalog)', provided: 'read' }`
      - `checkScope('auth.test', 'read')` still returns `null` (auth.test has `[]` in METHOD_SCOPES)
      - `checkScope('chat.postMessage', 'chat:write')` still returns `null` (scope present)
      - `checkScope('chat.postMessage', 'read')` still returns a missing_scope error for 'chat:write'

    Fix 2 — Shopify.config inflation (tests/sdk-verification/helpers/shopify-api-client.ts):
    - Remove the `recordSymbolHit('@shopify/shopify-api@12.3.0/Shopify.config')` call at line 104
      (and its comment block at lines 102-103).
    - Add `config: '@shopify/shopify-api@12.3.0/Shopify.config'` as a new entry in the
      `SHOPIFY_NAMESPACE_SYMBOLS` map at lines 213-222 so it is recorded by the proxy getter
      only when a test actually reads `shopify.config`.
    - Do NOT touch the `shopifyApi` (line 81) or `Shopify` (line 82) hits — those are genuine
      construction-time events (you call `shopifyApi()` and receive a `Shopify` instance).
      Add a comment: `// shopifyApi and Shopify hits above are legitimate construction-time events.`
  </behavior>
  <action>
    1. Open `twins/slack/src/services/method-scopes.ts`. At line 404, replace the single combined guard with two separate guards as specified in the behavior block above.
    2. Open `tests/sdk-verification/sdk/slack-scope-enforcement.test.ts`. Add a new `describe` block (or add to an existing one) with the four test cases listed above, importing `checkScope` and `METHOD_SCOPES` from `../../../twins/slack/src/services/method-scopes.js`.
    3. Open `tests/sdk-verification/helpers/shopify-api-client.ts`:
       - Delete lines 102-104 (the `Shopify.config` construction-time hit and its comment).
       - Add `config: '@shopify/shopify-api@12.3.0/Shopify.config'` to the `SHOPIFY_NAMESPACE_SYMBOLS` map (lines 213-222 in the current file; the map keys are `auth`, `clients`, `rest`, `session`, `webhooks`, `flow`, `fulfillmentService`, `billing`).
  </action>
  <verify>
    <automated>cd /Users/futur/projects/sandpiper-dtu && npx vitest run tests/sdk-verification/sdk/slack-scope-enforcement.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - `checkScope('nonexistent.method', 'read')` returns a missing_scope object (not null)
    - `checkScope('auth.test', any)` still returns null
    - Shopify.config hit is absent from the construction path; the proxy getter emits it on actual access
    - All existing scope enforcement tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Conformance compareAllHeaders denylist mode</name>
  <files>
    packages/conformance/src/types.ts,
    packages/conformance/src/comparator.ts,
    twins/shopify/conformance/normalizer.ts,
    twins/slack/conformance/normalizer.ts
  </files>
  <action>
    **packages/conformance/src/types.ts** — after the `compareHeaders?: string[]` field (line 109),
    add two new optional fields inside `FieldNormalizerConfig`:

    ```typescript
    /**
     * When true, compare ALL headers except those listed in ignoreHeaders.
     * Denylist approach — new deterministic headers are automatically included.
     * When false (default), only headers in compareHeaders are compared (allowlist).
     */
    compareAllHeaders?: boolean;

    /**
     * Headers to exclude when compareAllHeaders is true.
     * Has no effect when compareAllHeaders is false.
     * Always use lowercase header names.
     */
    ignoreHeaders?: string[];
    ```

    **packages/conformance/src/comparator.ts** — two sites to update:

    Site A — `normalizeResponse()` starting at line 270. After the existing block that retains
    `content-type` and `compareHeaders` entries, add a branch for `compareAllHeaders`:
    - When `normalizer.compareAllHeaders` is true: iterate ALL keys of `response.headers`
      and retain any not present in `normalizer.ignoreHeaders ?? []` (compare lowercased).
      The `content-type` already retained above should not be duplicated (use a Set or
      check existence before writing).
    - When false (no change): keep existing allowlist behaviour.

    Site B — `compareResponsesStructurally()` starting at line 123. After the existing
    `if (normalizer?.compareHeaders?.length)` block that iterates the allowlist, add:
    ```typescript
    if (normalizer?.compareAllHeaders) {
      const ignoreSet = new Set((normalizer.ignoreHeaders ?? []).map(h => h.toLowerCase()));
      const allHeaderNames = new Set([
        ...Object.keys(twin.headers),
        ...Object.keys(baseline.headers),
      ]);
      for (const lcName of allHeaderNames) {
        if (ignoreSet.has(lcName)) continue;
        // skip headers already compared via compareHeaders allowlist
        if (normalizer.compareHeaders?.map(h => h.toLowerCase()).includes(lcName)) continue;
        const twinVal = twin.headers[lcName];
        const baselineVal = baseline.headers[lcName];
        if (twinVal !== undefined && baselineVal !== undefined && twinVal !== baselineVal) {
          differences.push({ path: `headers.${lcName}`, kind: 'changed', lhs: twinVal, rhs: baselineVal });
        } else if (twinVal === undefined && baselineVal !== undefined) {
          differences.push({ path: `headers.${lcName}`, kind: 'deleted', rhs: baselineVal });
        } else if (twinVal !== undefined && baselineVal === undefined) {
          differences.push({ path: `headers.${lcName}`, kind: 'added', lhs: twinVal });
        }
      }
    }
    ```

    **twins/shopify/conformance/normalizer.ts** — add `compareAllHeaders` and `ignoreHeaders` to the
    exported normalizer config object (alongside the existing `compareHeaders` field):
    ```typescript
    compareAllHeaders: true,
    ignoreHeaders: ['date', 'x-request-id', 'set-cookie', 'connection', 'keep-alive', 'transfer-encoding', 'content-length'],
    ```

    **twins/slack/conformance/normalizer.ts** — same addition alongside the existing `compareHeaders` field:
    ```typescript
    compareAllHeaders: true,
    ignoreHeaders: ['date', 'x-request-id', 'set-cookie', 'connection', 'keep-alive', 'transfer-encoding', 'content-length'],
    ```

    Keep all existing `compareHeaders` entries in both normalizers — they continue to work under the
    allowlist path and are now also subsumed by `compareAllHeaders` (the skip-if-already-compared
    guard in the new block prevents double-reporting).
  </action>
  <verify>
    <automated>cd /Users/futur/projects/sandpiper-dtu && npx tsc --noEmit -p packages/conformance/tsconfig.json 2>&1 && npx tsc --noEmit -p twins/shopify/tsconfig.json 2>&1 && npx tsc --noEmit -p twins/slack/tsconfig.json 2>&1 && echo "ALL TYPES OK"</automated>
  </verify>
  <done>
    - `FieldNormalizerConfig` has `compareAllHeaders?: boolean` and `ignoreHeaders?: string[]`
    - `normalizeResponse()` retains all non-ignored headers when `compareAllHeaders: true`
    - `compareResponsesStructurally()` compares all non-ignored headers when `compareAllHeaders: true`
    - Both twin normalizers set `compareAllHeaders: true` with the volatile-header denylist
    - TypeScript compilation passes for conformance package and both twins
    - Existing conformance tests continue to pass (backward-compatible default)
  </done>
</task>

</tasks>

<verification>
Run the full SDK verification suite to confirm no regressions:
```
cd /Users/futur/projects/sandpiper-dtu && npx vitest run tests/sdk-verification/ --reporter=verbose 2>&1 | tail -40
```

Run type checks for all affected packages:
```
cd /Users/futur/projects/sandpiper-dtu && npx tsc --noEmit -p packages/conformance/tsconfig.json && npx tsc --noEmit -p twins/shopify/tsconfig.json && npx tsc --noEmit -p twins/slack/tsconfig.json
```
</verification>

<success_criteria>
- `checkScope('any.uncatalogued.method', 'anything')` returns `{ error: 'missing_scope', needed: 'unknown (method not in scope catalog)', provided: 'anything' }` — not null
- `checkScope('auth.test', 'anything')` returns null (explicitly empty scope list)
- `Shopify.config` symbol hit appears only in tests that read `shopify.config`, confirmed by proxy getter logic
- Both twin normalizer configs set `compareAllHeaders: true` with a volatile-header denylist
- TypeScript compilation clean across all three packages
- All pre-existing conformance and scope enforcement tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-remaining-3-issues-from-external-rev/3-SUMMARY.md`
summarizing what was changed, any deviations from the plan, and the final test/type-check results.
</output>
