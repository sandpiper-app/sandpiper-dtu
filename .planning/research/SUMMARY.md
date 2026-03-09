# Project Research Summary

**Project:** Sandpiper DTU
**Domain:** Official SDK-grounded conformance for service digital twins
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

Local source inspection of the cloned upstream repos shows that the requested milestone is materially broader than the current twin surface. The targeted packages are not just thin clients: `@shopify/admin-api-client` includes both GraphQL and generic REST access; `@shopify/shopify-api` adds auth, session, clients, webhooks, billing, flow, fulfillment-service, and versioned REST resources; `@slack/web-api` exposes 274 bound API methods plus helper flows; `@slack/oauth` defines install/state/store behavior; and `@slack/bolt` adds framework-level listener and receiver contracts, including transitive Socket Mode support.

The recommended approach is to freeze those SDKs inside the repo as pinned submodules, generate a machine-readable surface inventory from source, and build the roadmap around capability waves instead of hand-written method lists. The old manual-verification phase should be merged into the new verification harness so HMAC, async delivery timing, and UI structure remain covered while the SDK-driven suites expand.

The main risks are package/ref drift, false positives from mocked transports, and underestimating hidden surface area in Shopify REST resources and Bolt receivers. The roadmap should front-load source freezing and inventory generation before any package-specific implementation work.

## Key Findings

### Recommended Stack

The exact compatibility boundary should be the official packages themselves, pinned to the versions verified from local source: `@shopify/admin-api-client@1.1.1`, `@shopify/shopify-api@12.3.0`, `@slack/web-api@7.14.1`, `@slack/oauth@3.0.4`, and `@slack/bolt@4.6.0`. These should be paired with repo-owned fork submodules so the source snapshot, package version, and test harness all stay aligned.

**Core technologies:**
- Git submodules: commit-pinned upstream mirrors for source truth and reviewable updates
- Official SDK packages: the real developer boundary the twins must satisfy
- TypeScript compiler API + Vitest: source-derived inventory generation and exhaustive test execution

### Expected Features

The milestone must ship pinned SDK mirrors, generated public-surface manifests, official SDK-based tests, full Shopify client/platform compatibility, full Slack Web API/OAuth/Bolt compatibility, CI drift detection, and the old manual verification checks folded into the same pipeline.

**Must have (table stakes):**
- Pinned upstream mirrors and source-derived inventories
- Official SDK packages installed and used directly in tests
- Full targeted Shopify and Slack package coverage against the twins
- CI drift/coverage gate
- Legacy manual verification checks merged into the verification stack

**Should have (competitive):**
- Symbol-level coverage reporting
- Capability-grouped gap reports
- Version-aware update workflow for pinned SDK refs

**Defer (v2+):**
- Additional Slack packages outside the targeted milestone set
- Shopify app-framework packages
- Applying the same model to future twins such as Nylas or Shippo

### Architecture Approach

The architecture should be source first: submodule mirrors feed inventory generators; inventories feed generated test matrices; official SDK packages exercise live twin transports; reports and CI gates enforce that no symbol silently drops out of coverage. This keeps the milestone auditable even as upstream packages change.

**Major components:**
1. Upstream mirrors — pinned fork submodules for Shopify and Slack SDK repos
2. Surface inventory/generation tooling — manifest generation and test matrix creation
3. Verification harness — official SDK packages, local HTTP/OAuth/WebSocket helpers, and shared fixture seeders
4. Twin expansion layers — Shopify and Slack twin capabilities grouped by package family
5. Reporting/drift gate — per-symbol coverage and ref/version mismatch detection

### Critical Pitfalls

1. **README-only coverage** — avoid by generating inventories directly from source exports
2. **Repo/package drift** — avoid by pinning commit SHA and package version together and failing CI on mismatch
3. **Mock-heavy false positives** — avoid by using live local HTTP/WebSocket transports
4. **Shopify surface explosion** — avoid by splitting low-level client, platform helper, and REST resource work
5. **Bolt hidden transport surface** — avoid by planning explicit HTTP/Express/Socket Mode/AWS receiver coverage

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 13: Upstream SDK Mirrors & Surface Inventory
**Rationale:** Freeze the source of truth before implementation so literal scope is measurable.
**Delivers:** Fork-backed submodule layout, pinned refs, package-version ledger, generated public-surface manifests.
**Addresses:** SDK mirror requirements, full-surface inventory, drift-prevention foundation.
**Avoids:** README-only coverage and repo/package drift.

### Phase 14: Verification Harness Foundation & Legacy Gap Merge
**Rationale:** Exhaustive SDK suites need shared harnesses before any package-specific expansion.
**Delivers:** Dedicated SDK test workspace, fixture seeders, callback/receiver/socket helpers, merged HMAC/timing/UI verification.
**Addresses:** Shared verification infrastructure and old Phase 12 gap closure.
**Uses:** Existing Vitest, Fastify, SQLite, and webhook infrastructure.

### Phase 15: Shopify Admin Client Compatibility
**Rationale:** Low-level Shopify clients are the smallest and most concrete package boundary.
**Delivers:** `@shopify/admin-api-client` GraphQL and generic REST compatibility against the Shopify twin.
**Implements:** Shared request/version/header/retry semantics needed by higher-level Shopify package work.

### Phase 16: Shopify `shopify-api` Platform Surface
**Rationale:** Auth/session/utils/webhooks/billing/flow/fulfillment-service depend on the lower-level client and current twin auth behavior.
**Delivers:** High-level Shopify helper compatibility and the twin-side auth/webhook/billing semantics those helpers require.
**Addresses:** The widest platform-helper gap short of the REST resource class explosion.

### Phase 17: Shopify REST Resource & Client Expansion
**Rationale:** Source inspection shows 72 exported REST resource classes in the pinned Admin API version and additional client surfaces such as Storefront and graphqlProxy.
**Delivers:** Versioned REST resource compatibility, high-level client coverage, and remaining Shopify client surface.
**Avoids:** Treating Shopify as GraphQL-only.

### Phase 18: Slack WebClient Full Surface
**Rationale:** Slack Web API has the largest single method tree and needs shared method-family infrastructure before Bolt.
**Delivers:** `WebClient` compatibility across core, admin, files, canvases, assistant, functions, workflows, pagination, and upload helpers.
**Avoids:** Manual method-by-method drift.

### Phase 19: Slack OAuth & Bolt HTTP Surface
**Rationale:** Bolt HTTP and Express flows depend on real OAuth, request verification, and response semantics.
**Delivers:** `InstallProvider` compatibility, Bolt `App` listener coverage, HTTPReceiver/ExpressReceiver behavior, and end-to-end ack semantics.
**Uses:** The shared harness built in Phase 14.

### Phase 20: Bolt Alternate Receivers & Drift Automation
**Rationale:** Literal Bolt scope is not closed until alternate receivers and long-term drift controls are in place.
**Delivers:** SocketModeReceiver and AwsLambdaReceiver coverage, final coverage gates, and update workflow automation.
**Avoids:** Shipping an apparently complete milestone that still excludes exported receiver paths.

### Phase Ordering Rationale

- Source freezing and inventorying come first because the rest of the milestone is undefined without them.
- Shared verification infrastructure comes second because every package family depends on it.
- Shopify is split into low-level, platform, and REST-resource waves to keep the surface manageable.
- Slack WebClient comes before Bolt because Bolt depends on Web API, OAuth, and transport correctness.
- Drift automation comes last because it only works once coverage manifests and suites already exist.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 17:** Shopify REST resource classes and Storefront/billing semantics are large and version-sensitive.
- **Phase 18:** Slack admin/enterprise/files/canvases/functions families will need generated grouping and gap reports.
- **Phase 20:** Socket Mode and AWS receiver harnesses need careful transport modeling.

Phases with standard patterns (skip research-phase):
- **Phase 13:** Source inventory and submodule freezing use standard repo/tooling patterns.
- **Phase 14:** Verification harness merge is straightforward given existing Vitest/Fastify infrastructure.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified from local cloned package source and package manifests |
| Features | HIGH | Derived from actual exports and docs in the cloned repos |
| Architecture | HIGH | Follows directly from the need to inventory, generate, and verify against live transports |
| Pitfalls | HIGH | Based on the visible surface mismatch between current twins and cloned upstream packages |

**Overall confidence:** HIGH

### Gaps to Address

- Package-internal local-only exports still need an explicit verification policy during implementation, even when they are not backend-bound
- Shopify API-version selection for the resource wave must stay pinned and explicit
- Bolt receiver coverage will need a clear plan for Socket Mode and AWS harness isolation

## Sources

### Primary (HIGH confidence)
- `/tmp/gsd-sdk-research/shopify-app-js` — verified Shopify package versions, docs, and exported surfaces
- `/tmp/gsd-sdk-research/node-slack-sdk` — verified Slack Web API and OAuth package surfaces
- `/tmp/gsd-sdk-research/bolt-js` — verified Bolt exports, listener APIs, and receiver stack
- Existing Sandpiper DTU planning docs — verified current twin scope and old manual-verification gap

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
