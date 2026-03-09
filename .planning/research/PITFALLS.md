# Domain Pitfalls

**Domain:** Adding official SDK conformance testing to existing Shopify and Slack digital twins
**Researched:** 2026-03-08
**Confidence:** HIGH

## Critical Pitfalls

Mistakes that cause rewrites, major rework, or fundamentally undermine milestone goals.

---

### Pitfall 1: Submodule State Desynchronization With Package Versions

**What goes wrong:**
The git submodule ref (pinned commit SHA in `third_party/upstream/shopify-app-js`) says version X, but `pnpm-lock.yaml` resolves `@shopify/shopify-api` to version Y. The generated surface manifest describes one API shape; the tests exercise a different one. Coverage reports show green, but they are validating the wrong contract.

**Why it happens:**
Submodule refs and npm dependency versions are updated through completely independent mechanisms. A developer runs `pnpm update @shopify/shopify-api` without advancing the submodule, or advances the submodule without updating the installed package. There is no built-in enforcement linking the two. In CI, shallow clones (`fetch-depth: 1`) can silently fail to initialize submodules, so the pipeline passes with stale or missing source mirrors.

**Consequences:**
- Surface manifests become stale fiction -- symbols are tracked that no longer exist, or new symbols are invisible
- Drift detection fails silently because the manifest was never regenerated
- "Full literal scope" claim is provably false, destroying the milestone's core value proposition

**Prevention:**
- **Phase 13 (submodule setup):** Create a `tools/sdk-surface/verify-refs.ts` script that reads the submodule commit, extracts the package version from the submodule's `package.json`, and compares it against the version in `pnpm-lock.yaml`. Fail hard on mismatch.
- **Phase 20 (CI drift gate):** Wire the ref verification script into CI as a mandatory pre-test step. The conformance workflow in `.github/workflows/conformance.yml` must add `submodules: recursive` to the checkout action and run the verification script before any test execution.
- Pin both the submodule commit SHA and the package version in a single `sdk-pins.json` manifest file. Any PR that changes one without the other fails CI.

**Detection (warning signs):**
- Coverage manifests mention a different version than `pnpm list @shopify/shopify-api --depth=0`
- Tests fail with "method not found" or unexpected type errors after dependency updates
- Team members cannot answer "which upstream commit does our current manifest target?"

**Recovery cost:** MEDIUM -- regenerate manifests, align refs/versions, rerun coverage. No code rewrite needed, but every downstream artifact becomes suspect until verified.

---

### Pitfall 2: Generated Test Maintenance Collapse

**What goes wrong:**
The surface extractor generates 274+ Slack method tests and 73+ Shopify REST resource tests. Initial generation works. Three weeks later, a twin expansion changes response shapes, and now 80 generated tests fail. Nobody knows whether the failures represent real regressions or expected changes from twin improvements. The generated suite becomes a noise source that developers skip or mark as `todo`.

**Why it happens:**
Generated tests are cheap to create but expensive to maintain. Each generated test encodes assumptions about response structure, required fields, and error shapes. When the twin evolves (adding fields, changing pagination, fixing edge cases), generated tests that were "correct at generation time" break en masse. Without clear ownership boundaries between generated and curated tests, bulk failures create triage paralysis.

**Consequences:**
- Developers add `.skip` annotations to generated tests, creating invisible coverage gaps
- The generated matrix becomes a second source of drift, undermining the "source-derived coverage" differentiator
- CI execution time balloons as broken tests accumulate
- The team reverts to hand-written tests, abandoning the generation infrastructure

**Prevention:**
- **Phase 14 (test generation):** Design generated tests with two tiers: (1) **existence tests** that verify the method/endpoint exists and returns a non-error response, and (2) **semantic tests** that validate specific response shapes and are curated by hand. Existence tests are cheap to regenerate; semantic tests are owned explicitly.
- **Phase 14:** Include a `regenerate` command (`pnpm sdk:regenerate`) that re-runs the extractor and overwrites only the existence tier. Semantic tests live in separate files and are never auto-overwritten.
- **Phase 20 (CI):** Track the timestamp of the last manifest generation and warn (but do not fail) when generated tests are older than the twin's last structural change.

**Detection (warning signs):**
- More than 10% of generated tests are `.skip`-annotated
- Generated test files have not been regenerated in over 2 weeks while twin code has changed
- Coverage percentage stops moving despite new twin endpoints being added
- Triage time per CI failure exceeds 5 minutes because failures are bulk-generated noise

**Recovery cost:** HIGH -- must audit every `.skip` annotation, regenerate the matrix, and manually review which failures are real regressions vs. expected changes. If the generation tier boundary was not established, the entire generated suite may need to be rebuilt.

---

### Pitfall 3: Shopify REST Resource Scope Explosion

**What goes wrong:**
The team plans "Shopify SDK conformance" as a single phase and discovers mid-implementation that `@shopify/shopify-api` includes 73 REST resource classes (abandoned_checkout through webhook), each with multiple CRUD operations, nested resources, and custom actions. The existing twin supports ~5 resources through GraphQL. The gap is not 2x -- it is 15x.

**Why it happens:**
The existing Shopify twin is GraphQL-first. Developers mentally model "Shopify support" as "GraphQL Admin API queries work." But `@shopify/shopify-api@12.3.0` exposes REST resources as first-class OOP constructs with static methods (`Product.all()`, `Order.find()`, `Customer.search()`). The SDK's high-level surface includes these resource classes as part of its public contract. Additionally, many of these REST resources are being deprecated by Shopify in favor of GraphQL equivalents, but the SDK still exports them -- and the milestone scope says "literal public surface."

**Consequences:**
- A single "Shopify conformance" phase takes 3-5x longer than estimated
- The team implements the easy resources (Order, Product, Customer) and silently skips 60+ others
- REST resource coverage becomes a permanent blind spot masked by GraphQL test success
- The REST deprecation timeline (April 2025 for new public apps) creates confusion about whether these resources should be tested at all

**Prevention:**
- **Phase 15-17 (Shopify expansion):** Split Shopify conformance into three explicit sub-phases: (1) low-level clients (`admin-api-client` GraphQL + REST transport), (2) platform helpers (auth, session, webhooks, billing, utils), and (3) versioned REST resources grouped by domain (commerce: orders/products/customers, content: blogs/pages/articles, shipping: fulfillments/carrier_services, billing: charges/credits).
- **Phase 14 (manifest generation):** Generate the REST resource manifest immediately and categorize each resource as ACTIVE (has GraphQL equivalent, SDK still exports), DEPRECATED (Shopify has announced deprecation), or LEGACY (no GraphQL equivalent yet). Use this categorization to prioritize implementation order.
- Define explicit "not in v1.1 scope" boundaries for REST resources that are deprecated AND have GraphQL equivalents already supported by the twin. Document these exclusions in the manifest, not in prose.

**Detection (warning signs):**
- The roadmap has only one Shopify conformance phase
- REST resource coverage is not tracked separately from GraphQL coverage
- Nobody can list which of the 73 REST resources the twin currently supports
- Billing, Storefront, fulfillment-service, and flow capabilities are absent from the plan

**Recovery cost:** VERY HIGH -- adding REST resource support after the fact requires new route handlers, state management extensions, fixture seeders, and test suites for each resource. Batch recovery is impractical; it must be done resource-group by resource-group.

---

### Pitfall 4: Bolt Receiver Testing Treated as HTTP-Only

**What goes wrong:**
The Slack twin passes all `@slack/bolt` tests using HTTPReceiver, but fails when the same Bolt app uses SocketModeReceiver or AwsLambdaReceiver. The team ships "Bolt compatible" and discovers that any Bolt app not using HTTP mode breaks against the twin.

**Why it happens:**
The existing Slack twin (`twins/slack/src/plugins/`) is built entirely around HTTP endpoints (Web API routes, Events API POST handler, OAuth routes). Bolt's `HTTPReceiver` maps naturally to this surface. But Bolt's source exports four receiver implementations (HTTPReceiver, ExpressReceiver, SocketModeReceiver, AwsLambdaReceiver), each with distinct transport contracts:
- **SocketModeReceiver** uses WebSocket connections via `apps.connections.open` to receive events, requiring a WebSocket broker the twin does not have
- **AwsLambdaReceiver** expects AWS API Gateway event format (not raw HTTP), has different header processing, and has known issues with async/await handling (bolt-js issues #1300, #1480, #2076)
- **ExpressReceiver** wraps Express middleware and has OAuth-specific behavior (`processBeforeResponse: true` requirement)

**Consequences:**
- "Bolt compatible" claim is false for ~50% of real-world Bolt deployments (Socket Mode is Slack's recommended approach for development)
- Developers integrating with the twin using Socket Mode get silent failures or connection errors
- The WebSocket broker is a non-trivial infrastructure component -- it cannot be bolted on as an afterthought

**Prevention:**
- **Phase 19 (Bolt conformance):** Plan explicit receiver-specific test suites. Do not combine all receiver testing into a single test file.
- **Phase 19:** Build a minimal WebSocket broker that implements the `apps.connections.open` flow: (1) return a `wss://` URL from the API call, (2) run a local WebSocket server at that URL, (3) push events to connected clients in Slack's envelope format, (4) process acknowledgment messages.
- **Phase 19:** For AwsLambdaReceiver, create a Lambda-event adapter that transforms twin HTTP events into API Gateway event format. This is a thin translation layer, not a full Lambda runtime.
- **Phase 19:** For ExpressReceiver, verify OAuth flows with `processBeforeResponse: true` explicitly.
- Defer Socket Mode and Lambda receiver testing to a dedicated late phase (Phase 19-20) but do NOT omit them from the manifest. Track them as known gaps with explicit phase ownership.

**Detection (warning signs):**
- Bolt tests cover only `app.event()` and `app.action()` with default HTTP receiver
- No `apps.connections.open` endpoint exists in the Slack twin
- No WebSocket server runs during Bolt test execution
- Receiver-specific tests share no common harness or assertion library
- The term "AwsLambdaReceiver" appears nowhere in the test suite

**Recovery cost:** HIGH -- the WebSocket broker is ~500-1000 lines of infrastructure code. The Lambda event adapter is smaller (~200 lines) but requires understanding AWS API Gateway event format. If receiver testing is skipped entirely, retrofitting it requires re-architecting the event dispatch system.

---

### Pitfall 5: Transport Mocking That Bypasses the Fidelity Boundary

**What goes wrong:**
Tests stub `fetch`, `axios`, or the SDK's internal HTTP client to make tests faster, then declare the twin "SDK compatible." The stubs bypass headers, cookies, request signing, retry behavior, WebSocket framing, and content negotiation -- the exact transport-level behaviors that distinguish a real API from a mock.

**Why it happens:**
Running official SDK packages against live local HTTP endpoints is slower than intercepting network calls. When a test fails because the twin's response headers are wrong, it is tempting to stub the headers rather than fix the twin. When Socket Mode tests require a WebSocket connection, it is tempting to mock the WebSocket client rather than build a broker.

**Consequences:**
- Tests pass in CI but the twin fails when real application code uses it
- HMAC verification, OAuth redirects, cookie state, and content-type negotiation are never exercised
- The entire v1.1 milestone becomes a mock-validation exercise rather than a twin-fidelity proof
- Regressions in transport behavior (e.g., a Fastify upgrade changes header casing) are invisible

**Prevention:**
- **Phase 14 (harness setup):** Establish a project-wide rule: official SDK packages MUST hit live HTTP/WebSocket endpoints in conformance tests. Document this in `CONTRIBUTING.md` or a test guide.
- **Phase 14:** Create shared harness utilities that boot twins in-process and provide the base URL to SDK clients. Pattern: `const { baseUrl, cleanup } = await startTwin('shopify')`. This makes live testing as easy as mocking.
- **Phase 14:** Allow mocking ONLY for local-only SDK utilities (e.g., `shopify.utils.sanitizeShop()`, `shopify.utils.validateHmac()`) that do not make network calls.
- **Phase 20 (CI):** Add a lint rule or test helper that fails if `vi.mock('node-fetch')` or `vi.mock('undici')` appears in SDK conformance test files.

**Detection (warning signs):**
- Test files contain `vi.mock('node-fetch')`, `vi.mock('undici')`, or `vi.spyOn(WebClient.prototype, 'apiCall')`
- OAuth tests never observe real HTTP redirects or cookie headers
- No test file imports `buildApp()` or starts a Fastify instance
- Tests pass with the twin server stopped

**Recovery cost:** HIGH -- must replace every mocked transport path with a live harness, fix all twin response issues exposed by live testing, and rebuild confidence that coverage numbers are real. This is effectively redoing the test suite.

---

### Pitfall 6: Slack 274-Method Surface Creates Triage Paralysis

**What goes wrong:**
The team generates tests for all 274 `@slack/web-api` methods, runs them, and gets 200+ failures because the twin only implements ~10 methods (chat.postMessage, chat.update, conversations.list, conversations.create, conversations.info, users.list, users.info, plus OAuth). The failure wall is so large that nobody can distinguish "not yet implemented" from "implemented but broken."

**Why it happens:**
`@slack/web-api` source (`src/methods.ts`) binds 274 API methods to the `WebClient` class. The existing twin implements a tiny fraction. Generating tests for the full surface without categorizing methods by implementation status creates a signal-to-noise ratio that makes the test suite unusable.

**Consequences:**
- CI becomes permanently red, desensitizing developers to real failures
- "Not implemented" failures obscure genuine regressions in implemented methods
- Method prioritization becomes reactive (fix whatever broke) rather than strategic
- Sprint velocity collapses as developers spend time triaging noise instead of implementing methods

**Prevention:**
- **Phase 14 (manifest generation):** Categorize every method in the manifest as IMPLEMENTED, PLANNED (with phase assignment), or DEFERRED (with rationale). Generate tests only for IMPLEMENTED methods initially.
- **Phase 18 (Slack expansion):** Group the 274 methods by API family (chat.*, conversations.*, users.*, admin.*, files.*, views.*, workflows.*, etc.) and implement family-by-family. Each family shares auth, pagination, and error-handling patterns.
- **Phase 14:** Create a `sdk-coverage` report that shows per-family status: "chat: 5/8 methods, conversations: 4/12 methods, admin: 0/47 methods." This makes progress visible without requiring every method to have a passing test.
- **Phase 20 (CI):** Run only IMPLEMENTED-category tests in the blocking CI gate. Run PLANNED-category tests as informational (report failures but do not block merge).

**Detection (warning signs):**
- CI is red for more than 3 consecutive days due to "expected" failures
- The number of `.skip` or `.todo` annotations exceeds the number of passing tests
- No method-family grouping exists in test organization
- Coverage percentage is reported as a single number rather than per-family breakdown

**Recovery cost:** MEDIUM -- retroactively categorizing methods is tedious but mechanical. The bigger cost is lost developer time from operating with a broken CI gate during the uncategorized period. Budget 1-2 days for initial categorization of all 274 methods.

---

## Moderate Pitfalls

### Pitfall 7: CI Submodule Checkout Failures

**What goes wrong:**
The existing CI workflow (`.github/workflows/conformance.yml`) uses `actions/checkout@v4` without `submodules: recursive`. After adding submodules, CI clones the repo but leaves `third_party/upstream/` empty. Tests that depend on source inventory fail with confusing "file not found" errors rather than clear "submodule not initialized" messages.

**Prevention:**
- **Phase 13 (submodule setup):** Update `conformance.yml` and `e2e.yml` immediately when submodules are added. Use:
  ```yaml
  - uses: actions/checkout@v4
    with:
      submodules: recursive
      persist-credentials: true
      fetch-depth: 0
  ```
- Add a `git submodule status` check step that prints which submodules are initialized and at which commits. Fail the job if any submodule shows a `-` prefix (uninitialized).
- If using repo-owned forks on GitHub, ensure the `GITHUB_TOKEN` has read access to the fork repos, or configure a PAT with appropriate scopes.

**Detection:** CI jobs fail with "file not found" in `third_party/upstream/` paths. Locally, `git submodule status` shows `-` prefixes.

**Recovery cost:** LOW -- update CI config and re-run. But the detection delay can be hours if the failure message is not immediately recognized as a submodule issue.

---

### Pitfall 8: TypeScript Compiler API Export Enumeration Missing Re-exports

**What goes wrong:**
The surface extractor uses the TypeScript compiler API to walk package entrypoints and enumerate exports. It correctly finds directly exported symbols but misses re-exported symbols, namespace exports (`export * from './methods'`), or dynamically bound methods (like Slack's `WebClient` method binding from `methods.ts`).

**Prevention:**
- **Phase 14 (inventory generation):** Verify the extractor against known symbol counts. For `@slack/web-api`, the extractor must find at minimum 274 bound methods on `WebClient`. For `@shopify/shopify-api`, it must find the REST resource classes. If the count is lower than expected, the walker has a bug.
- Use `ts.TypeChecker.getExportsOfModule()` rather than walking the AST directly. The type checker resolves re-exports and `export *` declarations.
- Include a "known minimum" count in the manifest metadata and fail generation if the actual count drops below it.
- Consider `ts-morph` as a fallback if the raw compiler API proves too brittle for complex export patterns.

**Detection:** The generated manifest has fewer symbols than expected. Common gap: `export * from './foo'` chains are not followed.

**Recovery cost:** MEDIUM -- fixing the extractor is a targeted code change, but every manifest generated with the broken extractor must be regenerated and re-validated.

---

### Pitfall 9: Vitest Workspace Configuration Conflicts

**What goes wrong:**
Adding `tests/sdk/` as a new test workspace conflicts with the existing `vitest.config.ts` project discovery pattern (`projects: ['packages/*', 'twins/*']`). The new SDK tests either: (a) are not discovered by `pnpm test`, (b) conflict with existing twin-level `vitest.config.ts` files, or (c) cause duplicate test execution when both root and package-level configs match.

**Prevention:**
- **Phase 14 (harness setup):** Decide workspace strategy upfront. The recommended approach: add `'tests/*'` to the root `vitest.config.ts` projects array (currently only `['packages/*', 'twins/*']`). Create `tests/sdk/vitest.config.ts` following the existing pattern in `tests/integration/`.
- Verify that existing `twins/shopify/package.json` and `twins/slack/package.json` vitest configs (`"test": "vitest"`) do not conflict with the new SDK test workspace.
- Add a `test:sdk` script to the root `package.json` for targeted SDK test execution without running all workspaces.

**Detection:** `pnpm test` either skips SDK tests entirely or runs them twice. Error messages about "multiple vitest instances" or "cannot find test files."

**Recovery cost:** LOW -- configuration fix, but debugging the interaction between workspace-level and root-level vitest configs can waste hours.

---

### Pitfall 10: Existing Conformance Framework Incompatibility

**What goes wrong:**
The existing `@dtu/conformance` package (runner, adapter, comparator) was designed for HTTP-level request/response comparison between twin and live APIs. The new SDK conformance tests need to run official SDK packages (not raw HTTP requests) and validate SDK-level behavior (not just response shapes). Attempting to force SDK tests into the existing `ConformanceOperation` / `ConformanceAdapter` interface creates an awkward impedance mismatch.

**Prevention:**
- **Phase 14 (harness setup):** Do NOT try to make SDK conformance tests use the existing `@dtu/conformance` runner. The existing framework is valuable for its original purpose (HTTP-level twin-vs-live comparison) but is the wrong abstraction for "run the official SDK and verify it works."
- SDK conformance tests should be standard Vitest test files that import the official SDK packages, configure them to point at the twin, and use normal assertions. They do not need the `ConformanceRunner`, `ConformanceAdapter`, or `FixtureStore` abstractions.
- Keep the existing conformance framework running alongside the new SDK tests. They serve different purposes: the old framework validates response-level fidelity; the new tests validate SDK-level compatibility.
- Merge the old Phase 12 manual verification tests into the shared test infrastructure without forcing them into either framework.

**Detection:** Developers spend days trying to make `ConformanceAdapter.execute()` work with `WebClient.chat.postMessage()`. The adapter's `ConformanceOperation` type cannot represent SDK method calls naturally.

**Recovery cost:** MEDIUM -- unwinding an attempted integration is straightforward, but the wasted effort is real. Avoiding the mistake requires accepting that two testing approaches coexist.

---

### Pitfall 11: Shopify REST Deprecation Confusion

**What goes wrong:**
Shopify announced REST API deprecation for new public apps (April 1, 2025), but the `@shopify/shopify-api` SDK still exports all REST resource classes. The team either: (a) skips REST resources entirely ("they're deprecated, why bother?") and fails the literal-scope mandate, or (b) implements all 73 resources without considering which ones have GraphQL equivalents, wasting effort on resources nobody will use.

**Prevention:**
- **Phase 15 (Shopify platform):** Acknowledge that REST resources ARE part of the SDK's public surface and MUST appear in the manifest. But categorize them:
  - **Must implement:** Resources with no GraphQL equivalent that existing apps still use (e.g., `carrier_service`, `script_tag`, `webhook`)
  - **Verify stub:** Resources with GraphQL equivalents where the twin already has GraphQL support (e.g., `Product`, `Order`, `Customer`) -- verify the REST resource routes delegate to the same state, but full semantic parity is a lower priority
  - **Track as gap:** Resources the twin will not implement in v1.1 (e.g., `apple_pay_certificate`, `mobile_platform_application`) -- listed in manifest as DEFERRED with rationale
- Document the categorization decision so future maintainers understand why some resources are stubs.

**Detection:** All REST resources are either "fully implemented" (scope explosion) or "fully skipped" (coverage gap). No middle ground.

**Recovery cost:** MEDIUM -- adding REST route stubs after the fact is mechanical, but retroactively categorizing resources requires re-reviewing all 73 classes and their Shopify deprecation status.

---

## Minor Pitfalls

### Pitfall 12: Submodule Fork Repository Naming Confusion

**What goes wrong:**
The team forks `Shopify/shopify-app-js` and `slackapi/bolt-js` to an org or personal account. The fork names (`my-org/shopify-app-js`) collide with the upstream names, causing confusion about which remote is upstream vs. fork. `.gitmodules` URLs point to the fork, but developers mentally expect them to point upstream.

**Prevention:**
- **Phase 13:** Use clear naming conventions in `.gitmodules`. Set the fork remote as `origin` and add the upstream remote explicitly. Document the distinction in the repo's `CONTRIBUTING.md` or a `third_party/README.md`.
- Use descriptive submodule paths: `third_party/upstream/shopify-app-js` (not just `shopify-app-js`).

**Detection:** `git submodule update` pulls from the wrong remote. Developers accidentally push to upstream instead of fork.

**Recovery cost:** LOW -- fix `.gitmodules` URLs and re-initialize.

---

### Pitfall 13: pnpm Workspace Hoisting Conflicts With SDK Packages

**What goes wrong:**
Installing `@shopify/shopify-api` and `@slack/bolt` as devDependencies in the root or in `tests/sdk/` causes hoisting conflicts with the twins' existing dependencies. The SDK packages bring transitive dependencies (e.g., `@shopify/shopify-api` depends on `@shopify/admin-api-client`) that may conflict with versions the project already uses or expects.

**Prevention:**
- **Phase 14:** Install SDK packages in a dedicated `tests/sdk/package.json` workspace with explicit version pinning. Use `pnpm`'s `overrides` in the root `package.json` only if version conflicts arise.
- Run `pnpm why <package>` after installation to verify there are no unexpected duplicate versions.
- Test that the existing twin builds and tests still pass after adding SDK packages.

**Detection:** `pnpm install` shows peer dependency warnings. Twin tests fail after SDK packages are added. Different versions of the same package are resolved in different workspaces.

**Recovery cost:** LOW -- version alignment is a `package.json` fix, but detecting the root cause of subtle type mismatches can take hours.

---

### Pitfall 14: Performance Degradation From One-Twin-Per-Test Startup

**What goes wrong:**
Each SDK conformance test boots a fresh Fastify twin instance, seeds fixtures, runs one SDK call, and tears down. With 274+ Slack methods and 73+ Shopify resources, test execution time exceeds 10 minutes locally and 20 minutes in CI.

**Prevention:**
- **Phase 14 (harness setup):** Create a shared test harness that boots the twin once per test file (using `beforeAll`/`afterAll`) and resets state between tests (using the existing `POST /admin/reset` endpoint, which completes in <100ms).
- Group related SDK methods into shared test files by family (all `chat.*` methods in one file, all `conversations.*` in another).
- Use Vitest's `--pool forks` with `--poolOptions.forks.maxForks` to parallelize test files across workers while keeping each file's twin instance isolated.

**Detection:** Local test execution exceeds 5 minutes. CI SDK conformance job exceeds 15 minutes. Memory usage spikes from many concurrent Fastify instances.

**Recovery cost:** LOW -- refactoring from per-test to per-file lifecycle is a straightforward change, but it requires updating every test file that uses the wrong pattern.

---

### Pitfall 15: Incomplete OAuth Flow Testing

**What goes wrong:**
OAuth tests verify token exchange (POST to token endpoint) but skip the full browser redirect flow: authorization URL generation, state parameter verification, callback handling, cookie-based state persistence, and installation storage. The `@slack/oauth` `InstallProvider` and `@shopify/shopify-api` auth helpers exercise all of these.

**Prevention:**
- **Phase 15 (Shopify auth)** and **Phase 19 (Slack OAuth):** Build OAuth test harnesses that simulate the full redirect flow:
  1. SDK generates authorization URL
  2. Test follows the redirect to the twin's authorization endpoint
  3. Twin redirects back to the callback URL with code + state
  4. SDK exchanges code for token
  5. SDK stores the installation
- For Slack `InstallProvider`, verify state store semantics (generate state, store it, verify it on callback, delete it after use).

**Detection:** OAuth tests only call `POST /oauth/access_token` directly. No test follows a redirect chain. The `InstallProvider` is never instantiated in tests.

**Recovery cost:** MEDIUM -- building the redirect-following harness is ~200 lines, but understanding each SDK's exact OAuth expectations requires careful source reading.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Pitfall # | Mitigation |
|-------------|---------------|-----------|------------|
| Phase 13: Submodule setup | Ref/version desync, CI checkout failure | 1, 7, 12 | Create `sdk-pins.json`, update CI config, use clear fork naming |
| Phase 14: Inventory + harness | Export enumeration gaps, workspace config, perf | 8, 9, 10, 14 | Use type checker API, verify symbol counts, boot twin once per file |
| Phase 15: Shopify low-level clients | REST deprecation confusion | 3, 11 | Categorize REST resources, split by client/platform/resource |
| Phase 16: Shopify platform helpers | Scope explosion into billing/webhooks/flow | 3 | Explicit sub-phase boundaries, manifest-driven prioritization |
| Phase 17: Shopify REST resources | 73-class coverage wall | 3, 11 | Group by domain, categorize by deprecation status, stub strategically |
| Phase 18: Slack Web API expansion | 274-method triage paralysis | 6, 2 | Family-based grouping, IMPLEMENTED/PLANNED/DEFERRED categories |
| Phase 19: Slack Bolt + receivers | HTTP-only testing, missing Socket Mode | 4, 5, 15 | Build WebSocket broker, Lambda adapter, ExpressReceiver OAuth tests |
| Phase 20: CI drift gate + polish | Mock infiltration, generated test decay | 1, 2, 5 | Lint for mocked transports, enforce manifest regeneration, ref verification |

## Integration Pitfalls Between New and Existing Code

### Integration 1: New SDK Tests vs. Existing Conformance Suites

**Risk:** The existing `twins/shopify/conformance/` and `twins/slack/conformance/` directories contain HTTP-level conformance suites (orders, products, webhooks, chat, conversations, users, OAuth). The new SDK conformance tests validate overlapping behavior through a different lens. Without coordination, both suites test the same endpoints, doubling CI time without doubling coverage.

**Mitigation:** Keep both suites but document their distinct purposes in a test guide. The existing conformance suites validate HTTP-level response shapes (twin vs. live). The new SDK suites validate that official packages work end-to-end. They are complementary, not redundant. If CI time becomes an issue, consider running existing conformance suites only on schedule (like the current live conformance jobs) and running SDK suites on every PR.

### Integration 2: New `tests/sdk/` Workspace vs. Existing `tests/integration/`

**Risk:** The existing `tests/integration/smoke.test.ts` has its own vitest config and is NOT discovered by the root `vitest.config.ts` projects array. If the new `tests/sdk/` workspace follows the same isolation pattern, it becomes invisible to `pnpm test`. If it follows a different pattern (added to root projects), the existing integration tests are discovered inconsistently.

**Mitigation:** Unify the approach. Add `'tests/*'` to the root vitest projects array and ensure both `tests/integration/` and `tests/sdk/` have their own `vitest.config.ts` files. Add explicit npm scripts: `test:sdk`, `test:integration`, `test:conformance`. Update CI workflows to run all three.

### Integration 3: New SDK Package Dependencies vs. Existing Twin Dependencies

**Risk:** The twins depend on Fastify 5, graphql-yoga 5, and pino 9. The SDK packages (`@shopify/shopify-api`, `@slack/bolt`) bring their own transitive dependencies. If any SDK transitive dependency conflicts with an existing twin dependency, `pnpm install` may resolve to unexpected versions, breaking either the twin or the SDK tests.

**Mitigation:** Install SDK packages in a dedicated `tests/sdk/` workspace, not in the twin workspaces or root. Use `pnpm list --depth=5` to audit transitive dependencies before committing the lockfile. Test that `pnpm build` and `pnpm test` still pass for all existing workspaces after adding SDK packages.

### Integration 4: Old Phase 12 Manual Verification Carryover

**Risk:** The carryover from Phase 12 (HMAC e2e, webhook timing, UI verification) is queued for integration into the v1.1 pipeline. If it is treated as a separate concern, it remains isolated in `tests/verification/` and is never wired into the SDK conformance CI workflow. The milestone asks for "SDK conformance, HMAC/timing/UI verification, and drift detection run together in the same CI pipeline."

**Mitigation:** In Phase 20 (CI integration), ensure the conformance workflow includes a dedicated job for manual verification tests alongside the SDK conformance and drift detection jobs. Use job dependencies so that the pipeline runs: (1) ref verification, (2) manifest generation check, (3) SDK conformance tests, (4) legacy verification tests, (5) drift gate.

## "Looks Done But Isn't" Checklist

- [ ] **Submodules exist** but `sdk-pins.json` does not track version + commit SHA together
- [ ] **Manifests generated** but only once; no CI step regenerates or verifies them
- [ ] **SDK packages installed** but tests mock the transport layer
- [ ] **Shopify GraphQL passes** but REST resources, billing, Storefront client, and fulfillment-service are absent
- [ ] **Slack core methods pass** but admin/files/views/workflows families are untested
- [ ] **Bolt HTTP events pass** but Express/Socket Mode/AWS Lambda receivers have no tests
- [ ] **OAuth tests exist** but only test token exchange, not the full redirect flow with state verification
- [ ] **Generated tests exist** but >10% are `.skip` or `.todo` annotated
- [ ] **CI workflow updated** but submodules are not checked out recursively
- [ ] **Coverage report shows 80%+** but the denominator excludes DEFERRED methods that should be tracked

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Submodule/package desync (1) | MEDIUM | Create `sdk-pins.json`, regenerate manifests, align versions, add CI verification step |
| Generated test collapse (2) | HIGH | Audit all `.skip` annotations, establish existence/semantic tier split, regenerate existence tier, assign semantic test ownership |
| Shopify REST explosion (3) | VERY HIGH | Retroactively categorize 73 resources, implement resource-group by resource-group, add REST route stubs to twin |
| Bolt receiver gaps (4) | HIGH | Build WebSocket broker (~500-1000 LOC), Lambda event adapter (~200 LOC), receiver-specific test suites |
| Mock infiltration (5) | HIGH | Replace mocked transports with live harnesses, fix twin response issues, rebuild CI trust |
| Slack method triage paralysis (6) | MEDIUM | Retroactively categorize 274 methods by family, split test files, add IMPLEMENTED/PLANNED/DEFERRED tracking |
| CI submodule checkout (7) | LOW | Add `submodules: recursive` to CI checkout steps, add initialization verification step |
| Export enumeration bugs (8) | MEDIUM | Switch to `ts.TypeChecker.getExportsOfModule()`, add minimum-count assertions, regenerate manifests |
| Vitest workspace conflicts (9) | LOW | Update root `vitest.config.ts` projects array, add workspace-specific configs |
| Conformance framework mismatch (10) | MEDIUM | Accept two testing approaches coexist, do not force SDK tests into `ConformanceAdapter` |

## Sources

- [Reasons to avoid Git submodules](https://blog.timhutt.co.uk/against-submodules/) -- submodule synchronization challenges and detached HEAD pitfalls
- [Integrating Git Submodules in CI/CD](https://medium.com/@rezaur.official/integrating-git-submodules-in-ci-c-the-real-world-guide-no-one-writes-497c7287af9f) -- CI credential, shallow clone, and initialization pitfalls
- [Git Submodules: Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/git-submodules-complete-guide) -- version management and coordination challenges
- [GitHub Actions Checkout submodules discussion](https://github.com/orgs/community/discussions/160568) -- `actions/checkout@v4` submodule configuration
- [Managing Monorepos with Git Submodules](https://thebottleneckdev.com/blog/monorepo-git-submodules) -- practical monorepo submodule patterns
- [Shopify REST resources guide](https://github.com/Shopify/shopify-app-js/blob/main/packages/apps/shopify-api/docs/guides/rest-resources.md) -- REST resource class structure (HIGH confidence)
- [Shopify REST API deprecation](https://www.lazertechnologies.com/insights/shopifys-rest-api-deprecation-and-graphql-migration-guide) -- deprecation timeline and migration guidance
- [Shopify 2025-01 release notes](https://shopify.dev/docs/api/release-notes/2025-01) -- REST deprecation enforcement dates
- [Slack Bolt receiver docs](https://docs.slack.dev/tools/bolt-js/concepts/receiver/) -- receiver types and configuration
- [Bolt AwsLambdaReceiver issues](https://github.com/slackapi/bolt-js/issues/1300) -- known event processing failures (HIGH confidence)
- [Bolt AwsLambdaReceiver issues #1480](https://github.com/slackapi/bolt-js/issues/1480) -- token configuration pitfalls
- [Bolt AwsLambdaReceiver issues #2076](https://github.com/slackapi/bolt-js/issues/2076) -- startup errors
- [Bolt OAuth with ExpressReceiver](https://github.com/slackapi/bolt-js/issues/2380) -- `processBeforeResponse` requirement
- [Slack Socket Mode overview](https://docs.slack.dev/apis/events-api/using-socket-mode/) -- WebSocket protocol and `apps.connections.open` flow
- [slack-mock for WebSocket testing](https://github.com/Skellington-Closet/slack-mock) -- mock WebSocket server pattern
- [Slack WebClient mock issues](https://github.com/slackapi/bolt-js/issues/1253) -- mock maintenance and version compatibility
- [TypeScript Compiler API wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) -- export enumeration patterns and limitations
- Existing codebase: `packages/conformance/src/types.ts`, `twins/shopify/conformance/`, `twins/slack/conformance/`, `.github/workflows/conformance.yml`, `vitest.config.ts`, twin `package.json` files -- all read directly (HIGH confidence)

---
*Pitfalls research for: official SDK conformance added to existing digital twin system*
*Researched: 2026-03-08*
