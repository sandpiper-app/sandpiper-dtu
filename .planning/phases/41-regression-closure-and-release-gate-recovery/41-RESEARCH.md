# Phase 41: Regression Closure & Release Gate Recovery - Research

**Researched:** 2026-03-14
**Domain:** Post-remediation regression closure across build gates, Shopify parity, Slack parity, and proof integrity
**Confidence:** HIGH

## Summary

Phase 41 is not a feature phase. It is a release-bar recovery phase. The codebase already attempted to fix the earlier adversarial review in Phases 38-40, but the current branch still fails the hostile signoff in four distinct ways:

1. **Build and verification gates are not trustworthy**
   - `pnpm --dir twins/shopify build` still fails on `subject_token_type` typing drift in [`twins/shopify/src/plugins/oauth.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/oauth.ts).
   - Root `pnpm build` still passes because [`package.json`](/Users/futur/projects/sandpiper-dtu/package.json) does not build the twins.
   - `pnpm test:sdk` can leave [`tests/sdk-verification/coverage/symbol-execution.json`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/coverage/symbol-execution.json) deleted, which strands `pnpm coverage:generate` and `pnpm drift:check`.

2. **Shopify parity is still wrong at the seams Sandpiper actually exercises**
   - [`twins/shopify/src/services/api-version.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/services/api-version.ts) still accepts impossible versions like `2025-02` instead of quarterly allowlisted versions from the vendored enum in [`third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/types.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/types.ts).
   - [`twins/shopify/src/plugins/oauth.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/oauth.ts) still collapses refresh and offline token-exchange flows into a bare `{access_token, scope}` response, even though the vendored SDK expects offline-expiring responses with `expires_in`, `refresh_token`, and `refresh_token_expires_in` when present.
   - [`twins/shopify/src/plugins/rest.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/plugins/rest.ts) still does not persist product delete, and the current `orderUpdate` path double-stringifies line items between [`twins/shopify/src/schema/resolvers.ts`](/Users/futur/projects/sandpiper-dtu/twins/shopify/src/schema/resolvers.ts) and [`packages/state/src/state-manager.ts`](/Users/futur/projects/sandpiper-dtu/packages/state/src/state-manager.ts).
   - The pinned SDK verification still fails on `InventoryLevel.adjust()`.

3. **Slack auth/files behavior is still under-specified and too permissive**
   - [`twins/slack/src/services/method-scopes.ts`](/Users/futur/projects/sandpiper-dtu/twins/slack/src/services/method-scopes.ts) still treats missing catalog entries as "no scope required", so implemented methods can silently bypass enforcement.
   - [`tests/sdk-verification/setup/seeders.ts`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/setup/seeders.ts) seeds scopes from that same incomplete catalog, so missing entries also hide from test tokens.
   - [`twins/slack/src/plugins/web-api/new-families.ts`](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/new-families.ts) still accepts invalid OAuth/OIDC credentials for `oauth.access`, `oauth.v2.exchange`, and `openid.connect.token`.
   - [`twins/slack/src/plugins/web-api/files.ts`](/Users/futur/projects/sandpiper-dtu/twins/slack/src/plugins/web-api/files.ts) still depends on `SLACK_API_URL` for absolute upload URLs and still accepts payloads upstream rejects (`filename`, `length`, and non-empty `files` are not enforced).

4. **Proof and reporting are still overstating what is real**
   - [`tests/sdk-verification/helpers/shopify-api-client.ts`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/helpers/shopify-api-client.ts) still records top-level Shopify symbols at helper construction time, which inflates runtime evidence.
   - [`tests/sdk-verification/sdk/slack-method-coverage.test.ts`](/Users/futur/projects/sandpiper-dtu/tests/sdk-verification/sdk/slack-method-coverage.test.ts) is still representative-family sampling, not proof of the full bound `WebClient` surface from [`tools/sdk-surface/manifests/slack-web-api@7.14.1.json`](/Users/futur/projects/sandpiper-dtu/tools/sdk-surface/manifests/slack-web-api@7.14.1.json).
   - [`packages/conformance/src/comparator.ts`](/Users/futur/projects/sandpiper-dtu/packages/conformance/src/comparator.ts) still strips almost all headers and compares too little value data for the repo’s current parity language.

**Primary recommendation:** Keep this as a single six-plan phase:
- Wave 0 RED contracts
- Build/artifact gate recovery
- Shopify closure
- Slack closure
- Proof closure
- Conformance semantics plus final signoff

That split is the narrowest shape that keeps write scopes disjoint enough to execute safely while still closing every audited finding without another follow-up phase.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-19 | Root and twin build/test gates must be real and runnable. | Root `build` must include twins; Shopify twin build must compile; SDK verification path must be green before closeout. |
| INFRA-20 | Shared Slack scope catalog must stay aligned between seeding and enforcement. | Missing catalog entries are the direct cause of the current false-green scope behavior. |
| INFRA-23 | Runtime symbol evidence must reflect actual execution, not helper construction. | Remove eager hits and keep live status joined to passed test files only. |
| INFRA-24 | Conformance must only claim what deterministic checks actually prove. | Header/value comparison needs explicit opt-in and truthful output labels. |
| INFRA-25 | Active docs and gates must remain truthful and resilient. | Artifact survival, regenerated reports, and restored milestone-complete claims only after green signoff are all required. |
| SHOP-17 | Version handling must match real supported Shopify API versions. | Use a supported-version allowlist instead of `YYYY-MM` regex acceptance. |
| SHOP-18 | OAuth flows must match upstream response contracts, not just validate credentials. | Refresh and offline token-exchange shapes must populate session fields the vendored SDK uses. |
| SHOP-20 | Persistent Shopify CRUD/state must survive destructive and update flows. | Product delete, orderUpdate, and inventory-level behavior are still drifted. |
| SLCK-14 | Full bound WebClient surface must be proven, not sampled. | Replace representative-family testing with a manifest-exact call matrix. |
| SLCK-18 | Scope enforcement must apply to every auth-checked method. | Add a completeness test that fails whenever a checked method is missing from `METHOD_SCOPES`. |
| SLCK-20 | OAuth/OIDC endpoints must reject invalid credentials and persist valid identity flows. | `oauth.access`, `oauth.v2.exchange`, and `openid.connect.token` need strict credential validation. |
| SLCK-22 | `filesUploadV2` must match upstream transport and payload rules. | Absolute upload URLs and required argument validation are still missing. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | workspace | RED contracts, SDK verification, proof regression checks | All required regression seams already live under Vitest. |
| `better-sqlite3` via `@dtu/state` | workspace | Shopify persistence fixes | Product delete, order updates, and inventory levels are state bugs, not transport bugs. |
| vendored `@shopify/shopify-api` | pinned under `third_party/upstream` | Exact OAuth/version contracts | Required for response-shape and version allowlist truth. |
| vendored `@slack/web-api` / `@slack/oauth` | pinned under `third_party/upstream` | Exact method surface and files/OAuth contracts | Required for `filesUploadV2`, OAuth argument rules, and full-surface proof. |
| `@dtu/conformance` | workspace | Conformance proof boundary | Existing comparator/normalizer/reporter remain the right seam. |

### No New Dependencies

Everything needed is already in the repo. This phase should be source edits, tests, and regenerated artifacts only.

## Architecture Patterns

### Pattern 1: Treat Build and Artifact Survival as Product Behavior

**What:** The root `build` script, twin compile status, and evidence artifact lifecycle must be fixed in the same way as API behavior bugs.

**Why:** Today the repo can report a clean build while a twin does not compile, and a failed SDK run can destroy the artifact path required by later gates. That is release-path drift, not "just tooling."

**Concrete requirement:**
- Root `build` must include `./twins/*`
- `symbol-execution.json` must remain present and valid JSON even when a test run exits non-zero
- `coverage:generate` and `drift:check` must consume the same artifact locations after both green and red runs

### Pattern 2: Use a Supported-Version Allowlist for Shopify, Not Regex Acceptance

**What:** Version parsing should allow only `unstable` and the vendored quarterly enum values from [`types.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/types.ts).

**Why:** Regex-accepting any `YYYY-MM` string is how `2025-02` got through.

**Recommended allowlist for this branch:**
- `2024-01`, `2024-04`, `2024-07`, `2024-10`
- `2025-01`, `2025-04`, `2025-07`, `2025-10`
- `2026-01`, `2026-04`
- `unstable`

Treat older quarterly values already listed in `SUNSET_VERSIONS` as explicit sunset errors.

### Pattern 3: Shopify OAuth Must Match Session-Creation Shapes, Not Just Status Codes

**What:** Token responses need to be shaped so the vendored session builders in [`create-session.ts`](/Users/futur/projects/sandpiper-dtu/third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/create-session.ts) populate the right fields.

**Why:** The current twin returns enough to look "valid" on the wire but not enough for the SDK’s session objects to be correct.

**Concrete response table:**

| Flow | Required response shape |
|------|-------------------------|
| Refresh token | `{access_token, scope, expires_in: 525600, refresh_token: <new>, refresh_token_expires_in: 2592000}` |
| Token exchange, online | Existing online payload with `expires_in`, `associated_user_scope`, `associated_user` |
| Token exchange, offline, `expiring='1'` | Same offline-expiring shape as refresh token |
| Token exchange, offline, `expiring='0'` | `{access_token, scope}` only |

These values are directly compatible with the vendored refresh/token-exchange tests.

### Pattern 4: Shopify REST and GraphQL Must Share the Same Stored Order/Product/Inventory State

**What:** Fixes must land in the shared storage seam, not as route-local response hacks.

**Why:** The current delete/orderUpdate/inventory bugs all come from transport code diverging from what the state layer stores or expects.

**Concrete implications:**
- Add a real `deleteProduct(id: number): boolean` state-layer helper and call it from the REST delete route
- Stop pre-stringifying `line_items` in the GraphQL resolver if `StateManager.updateOrder()` already stringifies
- Make `InventoryLevel.adjust/connect/set/delete`, `GET /inventory_levels.json`, and `GET /locations/:id/inventory_levels.json` all read/write the same persisted rows

### Pattern 5: Slack Scope Enforcement Needs a Completeness Test, Not Manual Memory

**What:** Add a test that enumerates every method literal passed to `checkScope(...)` or every route that emits `X-Accepted-OAuth-Scopes`, then fails if `METHOD_SCOPES` does not define that method.

**Why:** The current failure mode exists because missing methods default to no-scope-required. Manual catalog maintenance is not enough.

**Concrete target state:**
- Every auth-checked method has a `METHOD_SCOPES` entry
- No-auth methods are expressed explicitly as `[]`, not by omission
- `allScopesString()` remains the union of the catalog, so seeders and enforcement stay aligned

### Pattern 6: Slack Files/OAuth Strictness Must Come From the Same Source-of-Truth Contracts the SDK Uses

**What:** Use vendored request types and `WebClient` upload flow as the concrete target.

**Why:** The broken behavior is exactly at the seams the SDK abstracts:
- `files.getUploadURLExternal` must require `filename` and `length`
- `files.completeUploadExternal` must require a non-empty `files` array
- `openid.connect.token` / `oauth.access` / `oauth.v2.exchange` must reject bad credentials and missing required arguments

**Best implementation shape:**
- Share one client-secret registry between Slack OAuth plugins
- Derive absolute upload URLs from `SLACK_API_URL` when set, otherwise from request origin so the URL is always absolute even outside the SDK test harness

### Pattern 7: Full Slack Surface Proof Needs a Manifest-Exact Call Matrix

**What:** Replace representative-family sampling with a keyed call matrix for every bound WebClient method in [`slack-web-api@7.14.1.json`](/Users/futur/projects/sandpiper-dtu/tools/sdk-surface/manifests/slack-web-api@7.14.1.json).

**Why:** Route registration is not proof. The requirement claims every bound method is callable, so the test must load the manifest, verify exact method-key parity, and call each one.

**Recommended structure:**
- `tests/sdk-verification/sdk/slack-method-call-matrix.ts`
- `tests/sdk-verification/sdk/slack-method-coverage.test.ts`

The test should assert:
1. matrix keys exactly equal manifest bound-method keys
2. every matrix entry resolves against the twin
3. no representative/family wording remains

### Pattern 8: Conformance Needs Explicit Header and Deterministic-Value Opt-Ins

**What:** Add header allowlists to the normalizer/type layer and compare those headers in both exact and structural modes when declared.

**Why:** Right now exact mode strips almost everything except `content-type`, which makes the repo’s parity language too broad for what is actually compared.

**Minimum deterministic headers worth comparing now:**
- `x-shopify-api-version`
- `x-oauth-scopes`
- `x-accepted-oauth-scopes`
- `content-type`

**Immediate deterministic value seams worth tightening:**
- Slack OAuth invalid code / invalid client
- Slack chat missing channel / missing text
- Slack users unknown user
- Shopify invalid version / invalid OAuth request if those suites cover them

## Recommended Plan Decomposition

1. **41-01 Wave 0**
   - Add RED contracts for Shopify, Slack, and proof-integrity regressions
   - Keep failures assertion-based and local, not syntax/module errors

2. **41-02 Gate Recovery**
   - Fix root build and Shopify twin compile
   - Make runtime evidence artifacts survive failing runs

3. **41-03 Shopify Closure**
   - Quarterly version allowlist
   - Full refresh/offline OAuth shapes
   - Product delete, orderUpdate, inventory persistence fixes

4. **41-04 Slack Closure**
   - Exhaustive scope-catalog coverage
   - Strict OAuth/OIDC validation
   - Absolute/validated `filesUploadV2` flow

5. **41-05 Proof Closure**
   - Remove synthetic symbol attribution
   - Prove full bound Slack surface
6. **41-06 Conformance Semantics and Final Signoff**
   - Tighten conformance headers/value checks
   - Regenerate artifacts
   - Restore active planning docs only after a pre-restore green run and a second post-restoration green run

This split keeps the only parallel wave at 41-03 vs 41-04, where Shopify and Slack write scopes are disjoint.

## Validation Architecture

### Wave 0

Create these RED contract files first:
- `tests/sdk-verification/sdk/shopify-regression-closure.test.ts`
- `tests/sdk-verification/sdk/slack-regression-closure.test.ts`
- `tests/sdk-verification/coverage/proof-integrity-regression.test.ts`

Expected behavior on the current branch:
- They compile
- They fail with assertion errors naming the current regressions
- They do not fail from missing imports, syntax errors, or missing fixtures

### Task-Level Sampling

- Build/artifact work: `pnpm build`, `pnpm --dir twins/shopify build`, `pnpm vitest run tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts`
- Shopify work: targeted runs of `shopify-regression-closure.test.ts`, `shopify-api-auth.test.ts`, and `shopify-behavioral-parity.test.ts`
- Slack work: targeted runs of `slack-scope-catalog.test.ts`, `slack-regression-closure.test.ts`, and `slack-webclient-base.test.ts`
- Proof work: targeted runs of `proof-integrity-regression.test.ts`, `slack-method-coverage.test.ts`, and `packages/conformance/test/comparator.test.ts`

### Final Signoff

The final phase signoff must run this chain in order:

```bash
pnpm build \
  && pnpm --dir twins/shopify build \
  && pnpm --dir twins/slack build \
  && pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json \
  && pnpm coverage:generate \
  && pnpm drift:check \
  && pnpm --filter @dtu/twin-shopify conformance:twin \
  && pnpm --filter @dtu/twin-slack conformance:twin \
  && pnpm vitest run \
       tests/sdk-verification/coverage/proof-integrity-regression.test.ts \
       tests/sdk-verification/sdk/slack-method-coverage.test.ts
```

Only after this chain is green should `ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` be moved back to a completed state.

## Common Pitfalls

### Pitfall 1: Fixing Shopify compile/build without fixing root build truth

If `pnpm --dir twins/shopify build` goes green but root `pnpm build` still skips twins, the main release gate is still lying.

### Pitfall 2: Recreating `symbol-execution.json` only on success

That still leaves `coverage:generate` and `drift:check` broken after red runs. The artifact must exist after failure paths too.

### Pitfall 3: Repairing Shopify OAuth validation but not session-shaping responses

Credential validation alone will still leave refresh/offline flows wrong for the upstream SDK.

### Pitfall 4: Adding missing Slack scope entries without a completeness test

Manual additions will rot again. The test that proves catalog completeness is the real fix.

### Pitfall 5: Making `upload_url` absolute only when `SLACK_API_URL` is present

That recreates the current environment dependency. There must be a request-origin fallback.

### Pitfall 6: Replacing representative family sampling with another sampled proof

`SLCK-14` will remain unproven unless the test keys exactly match the pinned manifest surface.

### Pitfall 7: Updating docs back to complete before the final full run

This phase already exists because the previous closeout claimed too much. Do not repeat that error.

---

*Phase: 41-regression-closure-and-release-gate-recovery*
*Research completed: 2026-03-14*
