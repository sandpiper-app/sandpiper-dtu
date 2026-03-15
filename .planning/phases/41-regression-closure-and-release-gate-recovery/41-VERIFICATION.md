---
phase: 41-regression-closure-and-release-gate-recovery
verified: 2026-03-15T05:00:00Z
status: gaps_found
score: 11/12 must-haves verified
gaps:
  - truth: "REQUIREMENTS.md tracking metadata is fully restored to completed status"
    status: partial
    reason: "The v1.2 traceability section header still reads '### v1.2 (Pending)' and the coverage summary still says '26 total (14 complete, 12 pending)'; all individual rows correctly say 'Complete' and all checkboxes are [x], but the metadata counters and section label were not updated to match. The 'Last updated' date also still reads 2026-03-14 instead of 2026-03-15."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "Section header '### v1.2 (Pending)' and summary line '26 total (14 complete, 12 pending)' are stale. All 26 traceability rows show Complete. Last-updated timestamp is pre-Phase-41 (2026-03-14)."
    missing:
      - "Change '### v1.2 (Pending)' to '### v1.2 (Complete)'"
      - "Change 'v1.2 requirements: 26 total (14 complete, 12 pending)' to '26 total (all complete)'"
      - "Update '*Last updated:' timestamp to 2026-03-15"
human_verification:
  - test: "Full signoff command passes on current codebase"
    expected: "pnpm build, pnpm test:sdk, pnpm coverage:generate, pnpm drift:check, conformance:twin, proof-integrity all exit 0"
    why_human: "The signoff receipt records a prior run but the codebase may have drifted since 2026-03-15T03:33:30Z. A fresh run is needed to confirm nothing broke after the Phase 41 commits."
  - test: "Docker-based Slack upload URL smoke test passes"
    expected: "SLACK_API_URL=http://localhost:3001 upload URL starts with http://localhost:3001/api/"
    why_human: "The docker-compose.twin.yml sets SLACK_API_URL, but verifying the Docker-based smoke test requires running docker compose, which cannot be verified programmatically by file inspection alone."
---

# Phase 41: Regression Closure & Release Gate Recovery Verification Report

**Phase Goal:** Close all remaining v1.2 regressions, repair broken release gates, and produce an honest release signoff receipt.
**Verified:** 2026-03-15T05:00:00Z
**Status:** gaps_found (1 gap — stale REQUIREMENTS.md metadata; all functional goals achieved)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Root `pnpm build` fails when a twin fails to compile | VERIFIED | `package.json` line 7: `pnpm -r --filter='./packages/*' --filter='./twins/*' run build` |
| 2 | Shopify twin compile error on `subject_token_type` is fixed | VERIFIED | `twins/shopify/src/plugins/oauth.ts` line 24: `subject_token_type?: string;` |
| 3 | Failing SDK run leaves `symbol-execution.json` present and valid | VERIFIED | `global-setup.ts` writes a valid payload at startup; `execution-evidence-runtime.ts` has all 6 process-exit hooks (beforeExit, exit, SIGINT, SIGTERM, uncaughtException, unhandledRejection) |
| 4 | Shopify accepts only supported quarterly versions; 2025-02 is rejected | VERIFIED | `api-version.ts`: `SUPPORTED_API_VERSIONS` derived from vendored ApiVersion enum; `2025-01`, `2025-04`, `2025-07`, `2025-10` present; `parseShopifyApiVersion` throws for unlisted values |
| 5 | Refresh and offline token-exchange flows return full session fields | VERIFIED | `oauth.ts`: `refresh_token_expires_in: REFRESH_TOKEN_EXPIRES_IN`, offline expiring branch on `expiring === '1'` |
| 6 | Product delete, orderUpdate, inventory flows persist through shared state | VERIFIED | `rest.ts` calls `stateManager.deleteProduct()`; `resolvers.ts` passes raw `lineItems` (no double-stringify); inventory routes use shared state helpers |
| 7 | Every auth-checked Slack method has an explicit METHOD_SCOPES entry | VERIFIED | `method-scopes.ts`: `users.setPhoto`, `files.getUploadURLExternal`, `files.completeUploadExternal`, `search.files`, `chat.appendStream`, `chat.stopStream` all present |
| 8 | Narrow-scope tokens fail audited methods with `missing_scope` | VERIFIED | Scope catalog expanded; `slack-scope-catalog.test.ts` enforces completeness via AST analysis |
| 9 | Slack OAuth/OIDC stubs reject invalid credentials | VERIFIED | `oauth-secrets.ts` created; imported by both `oauth.ts` and `new-families.ts`; invalid client_id returns `invalid_client` |
| 10 | `filesUploadV2` returns absolute upload URL and rejects invalid payloads | VERIFIED | `files.ts`: falls back to `protocol + host` when `SLACK_API_URL` unset; validates `filename`, `length`, rejects empty `files` array |
| 11 | Conformance compares deterministic headers, not shape-only | VERIFIED | `types.ts`: `compareHeaders?: string[]`; `comparator.ts`: preserves opted-in headers in exact mode, value-compares in structural mode; Shopify opts into `x-shopify-api-version`; Slack opts into `x-oauth-scopes` and `x-accepted-oauth-scopes` |
| 12 | Coverage artifacts regenerated through runtime-symbol-execution path | VERIFIED | `coverage-report.json` line 6: `"evidenceSource": "runtime-symbol-execution"`; 346 live symbols |
| 13 | Active planning docs restored to completed status after post-restoration signoff | PARTIAL | `STATE.md` and `ROADMAP.md` correctly show completed; `REQUIREMENTS.md` per-requirement rows are all Complete but section header and summary counts are stale |
| 14 | Signoff receipt records both pre-restore and post-restore runs with exitCode: 0 | VERIFIED | `41-06-signoff-receipt.json`: preRestore (pending, exitCode: 0, 2026-03-15T03:31:00Z) + postRestore (completed, exitCode: 0, 2026-03-15T03:33:30Z); timestamps ordered; same command string |
| 15 | Runtime symbol evidence records only symbols actually accessed or executed | VERIFIED | `shopify-api-client.ts`: `Shopify.auth`, `Shopify.clients`, `Shopify.rest` recorded only in proxy getter; `ShopifyClients.Rest` recorded only in Proxy construct handler; `ShopifyClients.graphqlProxy` recorded only in wrapped function body |
| 16 | Slack method coverage proven against full pinned manifest, not representative sampling | VERIFIED | `slack-method-coverage.test.ts`: loads `slack-web-api@7.14.1.json`, asserts `manifestMethodKeys.size >= 275`, no `representative method` phrase |

**Score:** 15/16 truths verified (functional goals all pass; 1 documentation metadata gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/sdk-verification/sdk/shopify-regression-closure.test.ts` | RED contracts for Shopify regressions | VERIFIED | File exists; contains `unsupported API version 2025-02`, `Product.delete() removes the product` |
| `tests/sdk-verification/sdk/slack-regression-closure.test.ts` | RED contracts for Slack scope/OAuth/files | VERIFIED | File exists; contains `users.setPhoto returns missing_scope`, `oauth.access rejects an invalid client secret` |
| `tests/sdk-verification/coverage/proof-integrity-regression.test.ts` | RED contracts for proof gaps | VERIFIED | File exists; contains all 4 test names; 4/4 now GREEN after phase fixes |
| `package.json` | Root build includes twins | VERIFIED | Line 7: `--filter='./packages/*' --filter='./twins/*'` |
| `twins/shopify/src/plugins/oauth.ts` | Compiling with `subject_token_type?: string` | VERIFIED | Line 24: `subject_token_type?: string;` |
| `tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts` | Resilience proof for evidence artifacts | VERIFIED | File exists; spawns child Vitest run, asserts non-zero exit, asserts artifact survives |
| `tests/sdk-verification/coverage/fixtures/failing-evidence-fixture.test.ts` | Intentional failing fixture | VERIFIED | File exists; excluded from main suite via `vitest.config.ts` |
| `twins/shopify/src/services/api-version.ts` | Supported-version set from vendored enum | VERIFIED | `SUPPORTED_API_VERSIONS` set with 2025-01, 2025-04, 2025-07, 2025-10; derived from vendored ApiVersion enum |
| `twins/shopify/src/plugins/oauth.ts` | `refresh_token_expires_in` + expiring branch | VERIFIED | Contains `refresh_token_expires_in`, `expiring === '1'` branch |
| `packages/state/src/state-manager.ts` | `deleteProduct(id: number): boolean` | VERIFIED | Line 900: `deleteProduct(id: number): boolean {` |
| `tests/sdk-verification/sdk/slack-scope-catalog.test.ts` | AST-based catalog completeness test | VERIFIED | File exists; imports `METHOD_SCOPES`; uses AST analysis via ts-morph |
| `twins/slack/src/services/method-scopes.ts` | Expanded scope catalog | VERIFIED | Contains all 6 required keys plus others |
| `twins/slack/src/services/oauth-secrets.ts` | Shared client-secret source of truth | VERIFIED | File exists; exports `OAUTH_CLIENT_SECRETS`; imported by both OAuth entry points |
| `docker-compose.twin.yml` | `SLACK_API_URL` for slack-twin service | VERIFIED | Line 42: `SLACK_API_URL: "http://localhost:3001/api"` |
| `tests/sdk-verification/sdk/slack-docker-upload-url-smoke.test.ts` | Docker-based absolute URL smoke test | VERIFIED | File exists |
| `tests/sdk-verification/sdk/slack-method-call-fixtures.ts` | Shared Slack fixture helper | VERIFIED | Exports `buildSlackMethodCallFixtures()` |
| `tests/sdk-verification/sdk/slack-method-call-matrix.ts` | Manifest-keyed invocation matrix | VERIFIED | Exports `SLACK_METHOD_CALL_MATRIX: Record<string, MatrixEntry>` |
| `tests/sdk-verification/sdk/slack-method-coverage.test.ts` | Manifest-exact full-surface Slack proof | VERIFIED | Contains `manifestMethodKeys`; >= 275 assertion; no `representative method` wording |
| `packages/conformance/src/types.ts` | `compareHeaders` field in normalizer contract | VERIFIED | Contains `compareHeaders?: string[]` with JSDoc guidance |
| `packages/conformance/src/comparator.ts` | Deterministic header comparison | VERIFIED | Lines 122-130: compareHeaders structural block; lines 265-287: normalizeResponse preserves compareHeaders |
| `tests/sdk-verification/coverage/coverage-report.json` | Regenerated coverage artifact | VERIFIED | `"evidenceSource": "runtime-symbol-execution"` at line 6 and 10 |
| `.planning/phases/41-regression-closure-and-release-gate-recovery/41-06-signoff-receipt.json` | Pre/post-restore signoff receipt | VERIFIED | Contains `preRestore` + `postRestore`; same command; ordered timestamps; exitCode: 0 both |
| `.planning/ROADMAP.md` | Phase 41 marked complete | VERIFIED | `[x] Phase 41: Regression Closure & Release Gate Recovery ... (completed 2026-03-15)` |
| `.planning/STATE.md` | `status: completed` | VERIFIED | Frontmatter `status: completed`; 29/29 phases complete; Milestone v1.2 complete |
| `.planning/REQUIREMENTS.md` | All v1.2 requirements restored to Complete | PARTIAL | All 26 traceability rows show `Complete`; all checkboxes are `[x]`; but section header and coverage summary line are stale |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json` | `twins/shopify/src/plugins/oauth.ts` | Root build covers twin | VERIFIED | `--filter='./twins/*'` in build script |
| `global-setup.ts` | `execution-evidence-runtime.ts` | Artifact lifecycle coordinated | VERIFIED | `global-setup.ts` writes initial payload; `execution-evidence-runtime.ts` has failure-path flush hooks |
| `api-version.ts` | vendored `ApiVersion` enum | Version set derived from enum | VERIFIED | Comment and Set construction reference `third_party/upstream/.../types.ts` ApiVersion |
| `oauth.ts` | vendored `create-session.ts` | Offline response fields populate session | VERIFIED | `refresh_token_expires_in` present; expiring branch `expiring === '1'` |
| `resolvers.ts` | `state-manager.ts` | `orderUpdate` stores line_items exactly once | VERIFIED | `lineItemsValue = input.lineItems` (raw, not stringified); comment explicitly notes double-stringify was removed |
| `slack-scope-catalog.test.ts` | `method-scopes.ts` | Catalog completeness guard | VERIFIED | Imports `METHOD_SCOPES`; AST-scans all plugin files |
| `new-families.ts` | `oauth.ts` (via `oauth-secrets.ts`) | Shared client-secret validation | VERIFIED | Both import from `oauth-secrets.ts`/`services/oauth-secrets.js` |
| `comparator.ts` | `twins/slack/conformance/normalizer.ts` | Deterministic header comparison driven by suite opt-ins | VERIFIED | `compareHeaders: ['x-oauth-scopes', 'x-accepted-oauth-scopes']` in Slack normalizer; comparator reads `normalizer.compareHeaders` |
| `STATE.md` | `ROADMAP.md` | Completion claims restored only after post-restoration signoff | VERIFIED | `41-06-signoff-receipt.json` proves both pre-restore (pending) and post-restore (completed) runs exited 0 before docs were updated |
| `slack-method-coverage.test.ts` | `slack-web-api@7.14.1.json` | Manifest keys are exact SLCK-14 proof contract | VERIFIED | Loads manifest at test time; derives exact method set; asserts >= 275 |
| `shopify-api-client.ts` | `generate-report-evidence.ts` | Runtime hits feed coverage with no fallback | VERIFIED | Symbols recorded only in proxy getters / construct handlers; generate-report-evidence marks symbol live only from runtime hits joined with passing test files |

### Requirements Coverage

| Requirement | Source Plan(s) | Description Summary | Status | Evidence |
|-------------|---------------|---------------------|--------|---------|
| INFRA-19 | 41-01, 41-02, 41-06 | `pnpm test:sdk` discovers all tests; CI uses matching Node | SATISFIED | Root build truthful; vitest.config.ts excludes intentional-failure fixture; 669 tests pass |
| INFRA-20 | 41-01, 41-04 | Seeders use shared scope catalog shared by enforcement and seeding | SATISFIED | `seeders.ts` imports `allScopesString()` from `method-scopes.ts`; catalog expanded with all required methods |
| INFRA-23 | 41-02, 41-05 | Coverage marks symbol live only when runtime instrumentation confirms actual call | SATISFIED | Eager constructor hits removed; `shopify-api-client.ts` records via proxy getters / construct handlers only; `generate-report-evidence.ts` uses runtime-hits-joined-with-passed-files logic exclusively |
| INFRA-24 | 41-06 | Conformance only claims parity where deterministic checks actually prove it | SATISFIED | `compareHeaders` opt-in allowlist; reporter uses "structural smoke" label; Slack conformance index clarified |
| INFRA-25 | 41-02, 41-06 | Coverage reports carry provenance metadata; evidence freshness enforced at gate | SATISFIED | `coverage-report.json`: `evidenceSource: "runtime-symbol-execution"`; `runtime-artifact-resilience.test.ts` proves artifact survives failing run |
| SHOP-17 | 41-01, 41-03 | Shopify rejects unsupported/sunset versions | SATISFIED | `SUPPORTED_API_VERSIONS` set derived from vendored enum; `2025-02` not in set; `parseShopifyApiVersion` throws |
| SHOP-18 | 41-01, 41-03 | Full OAuth authorize flow with `refresh_token_expires_in` and expiring offline exchange | SATISFIED | `oauth.ts`: refresh grant and expiring offline token exchange branches present; `subject_token_type` type error fixed |
| SHOP-20 | 41-01, 41-03 | Persistent CRUD: product delete, order updates, inventory state-backed | SATISFIED | `deleteProduct` in StateManager; DELETE route calls it; orderUpdate no double-stringify; inventory routes use shared state |
| SLCK-14 | 41-01, 41-05 | All bound WebClient methods callable against twin | SATISFIED | `slack-method-call-matrix.ts` covers full manifest; `slack-method-coverage.test.ts` asserts >= 275 methods and exact manifest match |
| SLCK-18 | 41-01, 41-04 | Scope enforcement per method; OAuth validates credentials | SATISFIED | `method-scopes.ts` expanded; `slack-scope-catalog.test.ts` enforces completeness; `oauth-secrets.ts` validates credentials |
| SLCK-20 | 41-01, 41-04 | OAuth/OIDC credential validation; openid.connect.token strict | SATISFIED | `new-families.ts`: validates `client_secret` via `oauth-secrets.ts`; `openid.connect.token` rejects unknown client_id |
| SLCK-22 | 41-01, 41-04 | `filesUploadV2` returns absolute upload URL; rejects invalid payloads | SATISFIED | `files.ts`: absolute URL from `SLACK_API_URL` or request origin; validates `filename`, `length`, empty `files` array |

**All 12 required requirement IDs are accounted for and satisfied.**

Note: REQUIREMENTS.md traceability table rows for all 12 IDs correctly show `Complete`. The documentation inconsistency (section header, summary counts, last-updated date) is the gap, not the requirement satisfaction.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 150, 183, 189 | Stale section header (`v1.2 (Pending)`), stale summary (`14 complete, 12 pending`), stale last-updated date (`2026-03-14`) | Warning | Misleading to anyone reading the requirements doc; all per-row statuses are correct; STATE.md and ROADMAP.md are correct |

No blocker anti-patterns found in implementation files. The `return {}` values in `rest.ts` (lines 339, 876, 1121) and `files.ts` (line 83) are correct protocol responses, not stubs.

### Human Verification Required

#### 1. Fresh Full Signoff Run

**Test:** Run `pnpm build && pnpm --dir twins/shopify build && pnpm --dir twins/slack build && pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin && pnpm vitest run tests/sdk-verification/coverage/proof-integrity-regression.test.ts tests/sdk-verification/sdk/slack-method-coverage.test.ts`
**Expected:** All commands exit 0; 669+ tests pass; 346+ live symbols; 0 drift issues; 30/30 conformance; 4/4 proof-integrity; 278+ Slack method coverage
**Why human:** The signoff receipt records a run from 2026-03-15T03:33:30Z. File-level verification confirms all artifacts are correctly implemented, but a live re-run is needed to confirm the full integration works after all 20 Phase 41 commits.

#### 2. Docker Slack Upload URL Smoke Test

**Test:** `docker compose -f docker-compose.twin.yml up -d --build slack-twin && SLACK_API_URL=http://localhost:3001 pnpm vitest run tests/sdk-verification/sdk/slack-docker-upload-url-smoke.test.ts`
**Expected:** Test passes; `upload_url` starts with `http://localhost:3001/api/`
**Why human:** Cannot verify Docker-based test by file inspection; requires running Docker.

### Gaps Summary

The single gap is a documentation metadata inconsistency in `.planning/REQUIREMENTS.md`. The functional goals of Phase 41 are fully achieved:

- Build gates are truthful (root build includes twins)
- Shopify regressions are closed (version validation, OAuth shape, delete/orderUpdate/inventory state)
- Slack regressions are closed (scope catalog, OAuth/OIDC credentials, filesUploadV2)
- Proof integrity is restored (literal runtime evidence, manifest-exact Slack coverage, deterministic conformance headers)
- Release signoff receipt is machine-readable with pre- and post-restoration entries both showing exitCode: 0
- All 12 required requirement IDs are satisfied and marked Complete in the traceability table rows

The gap is that after restoring the per-row statuses, the section header `### v1.2 (Pending)` was not changed to `### v1.2 (Complete)`, the coverage summary line still says `14 complete, 12 pending` instead of `26 total (all complete)`, and the `*Last updated:` timestamp still reads `2026-03-14` instead of `2026-03-15`. These are cosmetic but misleading metadata lines in the planning doc.

---

_Verified: 2026-03-15T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
