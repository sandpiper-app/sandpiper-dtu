# Project Research Summary

**Project:** Sandpiper DTU v1.1 -- Official SDK Conformance
**Domain:** SDK conformance testing infrastructure for Shopify and Slack digital twins
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

Sandpiper DTU v1.1 adds official SDK conformance testing to an existing digital twin system that already serves Shopify and Slack APIs via Fastify HTTP servers. The core approach is to install the official SDK packages (`@shopify/shopify-api`, `@slack/bolt`, `@slack/web-api`, `@slack/oauth`), point them at the twins running on localhost ephemeral ports, and verify that the SDKs work end-to-end over real HTTP and WebSocket transports. A parallel infrastructure track uses git submodules of upstream SDK source repos and `ts-morph` to generate machine-readable surface manifests that enumerate every public symbol, enabling automated coverage tracking and drift detection. This is not mock-based testing -- the SDKs must hit real network endpoints.

The recommended approach is infrastructure-first: pin SDK submodules, generate surface manifests, and establish the test harness before expanding twin endpoints. The twins have significant coverage gaps -- the Shopify twin covers roughly 30% of the `@shopify/admin-api-client` surface and 10% of the full `@shopify/shopify-api` surface (missing OAuth flows, billing, REST resources). The Slack twin covers roughly 4% of `@slack/web-api` methods (8 of 200+), with no support for slash commands, views/modals, or Socket Mode. Prioritizing by real-world usage (not raw method count) reduces the effective gap to approximately 100-110 high-value features across all packages.

The key risks are: (1) submodule/package version desynchronization silently invalidating manifests, (2) the 274-method Slack Web API surface creating triage paralysis if tests are generated without implementation-status categorization, (3) Shopify REST resource scope explosion (73 classes, most deprecated), and (4) treating Bolt receiver testing as HTTP-only when Socket Mode and Lambda receivers represent roughly half of real-world deployments. All four risks have concrete prevention strategies detailed in the research.

## Key Findings

### Recommended Stack

The stack is entirely additive -- no existing dependencies change. Official SDK packages are installed as workspace-root devDependencies for test use only. Upstream SDK source repos are added as git submodules under `third_party/upstream/` for surface inventory generation. See [STACK.md](STACK.md) for full details.

**Core technologies:**
- `@shopify/shopify-api@12.3.0` + `@shopify/admin-api-client@1.1.1`: Shopify platform SDK (auth, clients, webhooks, billing, REST resources). Node >=20 required.
- `@slack/bolt@4.6.0` + `@slack/web-api@7.14.1` + `@slack/oauth@3.0.4`: Slack app framework with 274 Web API methods, 4 receiver types, and OAuth InstallProvider. Node >=18 required.
- `ts-morph@25.0.1`: TypeScript export enumeration for surface manifests. Pin to 25.0.1 specifically because it bundles TS 5.7.3, matching the project's TypeScript version.
- `ws@^8`: WebSocket server for Socket Mode test harness. Matches `@slack/socket-mode`'s internal `ws` dependency.
- Git submodules (repo-owned forks): `shopify-app-js`, `node-slack-sdk`, `bolt-js` -- source mirrors for inventory generation, insulated from upstream force-pushes.

**No version conflicts exist.** All SDK packages resolve cleanly against each other and against existing project dependencies. Express comes as a Bolt transitive dep but does not conflict with Fastify.

### Expected Features

See [FEATURES.md](FEATURES.md) for the full feature landscape with gap percentages.

**Must have (table stakes):**
- `@shopify/admin-api-client` end-to-end: `createAdminApiClient()`, `client.request()`, `client.fetch()`, retry on 429/503, API version in URL path
- `@shopify/shopify-api` auth flows: `auth.begin()`, `auth.callback()`, `auth.tokenExchange()`, session management, webhook register/process
- `@slack/web-api` core methods: `auth.test` (gateway for all SDK init), chat family (~12 methods), conversations family (~22 methods), users family (~8 methods), reactions and pins
- `@slack/oauth` InstallProvider: `generateInstallUrl()`, `handleCallback()`, `authorize()`, state verification
- `@slack/bolt` listener dispatch: `app.event()`, `app.action()`, `app.command()`, `app.view()`, request signature verification, `ack()` semantics

**Should have (differentiators):**
- Source-derived public surface manifest (machine-generated, not hand-maintained)
- Symbol-level coverage tracking with per-family breakdown
- Prioritized method tiers (Tier 1 covers 90%+ of real app usage)
- Bolt payload format test fixtures (exact-match, not approximate)

**Defer (v2+):**
- Shopify REST resources (73 classes, deprecated by Shopify since April 2025) -- stub strategically, do not implement fully
- Shopify billing endpoints -- lower priority, can stub
- Slack admin.* methods (~89 enterprise-only methods)
- Slack Socket Mode server -- defer to v1.2+, focus on HTTP receiver first
- Slack files, search, reminders, DnD, stars, workflows families -- implement on demand
- Multi-version API matrix testing

### Architecture Approach

The architecture adds three new directory trees to the existing repo without modifying the core twin or conformance packages. See [ARCHITECTURE.md](ARCHITECTURE.md) for component diagrams and code examples.

**Major components:**
1. `third_party/upstream/` -- Git submodule source mirrors for SDK inventory generation
2. `tools/sdk-surface/` -- Inventory generator (ts-morph), manifest storage (JSON per package), test matrix builders
3. `tests/sdk-verification/` -- Vitest workspace with shared harness (twin lifecycle, fixture seeders, callback server, Socket Mode broker, Lambda harness) and per-SDK test suites
4. Extended twins -- Shopify twin gains OAuth redirect flow, session endpoints; Slack twin gains ~60 high-value Web API stubs, `apps.connections.open` endpoint

**Key patterns:** Twin lifecycle manager (boot on port 0, reset between tests, teardown), Shopify URL redirection via `customFetchApi`, Slack URL redirection via `slackApiUrl`, Socket Mode WebSocket broker, AWS Lambda direct handler invocation. All SDK tests use real network transport -- no mocking of fetch/axios/WebSocket.

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for all 15 pitfalls with detection and recovery strategies.

1. **Submodule/package version desync** -- Submodule commit and npm package version drift independently. Create `sdk-pins.json` that links both, enforce in CI. (Phases 13, 20)
2. **Generated test maintenance collapse** -- 274+ generated tests become noise when twin evolves. Split into existence tier (auto-regenerated) and semantic tier (hand-curated). (Phase 14)
3. **Shopify REST resource scope explosion** -- 73 REST classes in SDK, most deprecated. Categorize as ACTIVE/DEPRECATED/LEGACY, implement only must-have resources. (Phases 15-17)
4. **Bolt receiver testing treated as HTTP-only** -- Socket Mode and Lambda receivers are ~50% of real deployments. Build dedicated WebSocket broker and Lambda event harness. (Phase 19-20)
5. **Transport mocking bypassing fidelity boundary** -- Stubbing fetch/axios defeats the entire milestone. Enforce live transport in all SDK conformance tests, lint for mock imports. (Phase 14, 20)

## Implications for Roadmap

Based on research, suggested phase structure (8 phases, mapping to the dependency chain identified in FEATURES.md and the build order in ARCHITECTURE.md):

### Phase 13: Submodule Setup and SDK Pins
**Rationale:** Everything depends on having pinned upstream source and installed SDK packages. This is the foundation with zero feature output but unlocks all downstream work.
**Delivers:** Git submodules at pinned commits, `sdk-pins.json`, SDK packages installed at workspace root, CI updated with `submodules: recursive`.
**Addresses:** Infrastructure prerequisites from FEATURES.md dependency graph.
**Avoids:** Pitfall 1 (submodule/version desync), Pitfall 7 (CI checkout failures), Pitfall 12 (fork naming confusion).

### Phase 14: Surface Inventory and Test Harness
**Rationale:** Manifests must exist before any conformance tests can be written, and the shared harness (twin lifecycle, signing helpers) is needed by every subsequent phase.
**Delivers:** ts-morph inventory generator, JSON manifests for all 5 SDK packages, shared test harness (twin-lifecycle, fixture-seeders, callback-server, signing), Vitest workspace config, legacy Phase 12 tests ported.
**Addresses:** Source-derived manifest differentiator, test infrastructure from ARCHITECTURE.md.
**Avoids:** Pitfall 8 (export enumeration gaps), Pitfall 9 (Vitest workspace conflicts), Pitfall 10 (conformance framework mismatch), Pitfall 14 (per-test twin boot overhead).

### Phase 15: Shopify Low-Level Clients
**Rationale:** `@shopify/admin-api-client` is the gateway for all Shopify SDK work. Verify it first before building on top.
**Delivers:** `createAdminApiClient()` verified against twin, `client.request()` and `client.fetch()` tests, retry behavior on 429/503, `customFetchApi` URL redirection pattern established.
**Addresses:** admin-api-client table stakes (~25% gap).
**Avoids:** Pitfall 5 (transport mocking), Pitfall 11 (REST deprecation confusion -- establish GraphQL-first approach here).

### Phase 16: Shopify Platform Helpers
**Rationale:** Auth flows, webhooks, and session management depend on the low-level client working. These are the highest-value gaps in `@shopify/shopify-api`.
**Delivers:** Full OAuth begin/callback/tokenExchange flow, session token JWT support, webhook register/process end-to-end, API version negotiation.
**Addresses:** shopify-api auth/webhooks/session (~90% gap, biggest items).
**Avoids:** Pitfall 3 (scope explosion -- billing and REST resources are explicitly deferred to later phases), Pitfall 15 (incomplete OAuth flow).

### Phase 17: Shopify REST Resources (Strategic Stubs)
**Rationale:** REST resources are part of the public surface but are deprecated. Categorize and stub, do not fully implement.
**Delivers:** REST resource categorization (ACTIVE/DEPRECATED/LEGACY), route stubs for must-have resources, REST transport verification, billing query stubs.
**Addresses:** REST resource coverage from FEATURES.md, billing stubs.
**Avoids:** Pitfall 3 (scope explosion -- explicit categorization prevents boiling the ocean), Pitfall 11 (deprecation confusion -- clear documentation of what is stubbed and why).

### Phase 18: Slack Web API Expansion
**Rationale:** `auth.test` is the gateway for all Slack SDK work. After that, expand by method family in priority order (chat, conversations, users, reactions, pins, views).
**Delivers:** `auth.test` and `api.test` endpoints, ~60 high-value Web API method stubs organized by family, paginate/retry behavior verification.
**Addresses:** web-api table stakes (~96% gap by count, ~60% gap for high-value methods).
**Avoids:** Pitfall 6 (triage paralysis -- family-based grouping with IMPLEMENTED/PLANNED/DEFERRED categories).

### Phase 19: Slack OAuth and Bolt Integration
**Rationale:** Bolt depends on Web API methods working. OAuth InstallProvider depends on the token exchange endpoint. Both build on Phase 18.
**Delivers:** Full InstallProvider flow (state, callback, installation storage), Bolt event/action/command/view dispatch, request signature verification, ExpressReceiver OAuth, slash command endpoint.
**Addresses:** oauth InstallProvider (~85% gap), Bolt listeners (~80% gap).
**Avoids:** Pitfall 4 (HTTP-only testing -- plan for all receivers), Pitfall 15 (incomplete OAuth -- full redirect flow).

### Phase 20: Alternate Receivers, CI Drift Gate, and Polish
**Rationale:** Socket Mode broker and Lambda harness are the most complex infrastructure. Drift gate ties everything together. This is the capstone phase.
**Delivers:** Socket Mode WebSocket broker, Lambda event harness, receiver-specific test suites, CI drift gate (ref verification + manifest regeneration check), coverage reports, mock-detection lint rule.
**Addresses:** Bolt alternate receivers, CI integration, drift detection differentiator.
**Avoids:** Pitfall 1 (CI drift gate enforces ref/version sync), Pitfall 2 (generated test decay -- manifest regeneration check), Pitfall 4 (Socket Mode and Lambda receivers tested), Pitfall 5 (mock-detection lint).

### Phase Ordering Rationale

- **Phases 13-14 first:** All downstream work depends on submodules, manifests, and the shared test harness. No feature output, but blocking dependencies.
- **Shopify before Slack (15-17 before 18-19):** Shopify has a smaller total surface and clearer dependency chain. Completing it first delivers early wins and validates the harness patterns before tackling the larger Slack surface.
- **Slack Web API before Bolt (18 before 19):** Bolt's `app.event()` triggers `say()` which calls `chat.postMessage` via WebClient. The Web API methods must work before Bolt integration tests can pass.
- **Alternate receivers last (20):** Socket Mode broker and Lambda harness are the most complex components. Deferring them to the final phase limits blast radius if they take longer than expected.
- **CI drift gate in Phase 20:** The gate validates everything built in Phases 13-19. It must come last because it checks the entire pipeline.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 16 (Shopify Platform Helpers):** Shopify's `auth.tokenExchange()` and session token JWT format are complex and poorly documented outside the SDK source. Read the SDK source carefully during planning.
- **Phase 19 (Slack OAuth + Bolt):** Bolt's `processBeforeResponse` behavior and ExpressReceiver OAuth flow have known issues (bolt-js #2380). Research exact payload envelope formats from Bolt source during planning.
- **Phase 20 (Socket Mode Broker):** Verify that `SocketModeReceiver`'s `clientOptions.slackApiUrl` actually reaches the internal WebClient. Confidence is MEDIUM on this passthrough path.

Phases with standard patterns (skip research-phase):
- **Phase 13 (Submodule Setup):** Well-documented git submodule workflow. No ambiguity.
- **Phase 14 (Inventory + Harness):** ts-morph's `getExportedDeclarations()` is well-documented. Vitest workspace config follows existing project patterns.
- **Phase 15 (Shopify Low-Level Clients):** `customFetchApi` and `scheme` options are documented in the SDK README. Straightforward verification tests.
- **Phase 18 (Slack Web API Expansion):** `slackApiUrl` is a simple constructor option. Method stubs follow a repetitive pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry. Dependency compatibility matrix shows zero conflicts. ts-morph version pinning rationale is well-supported. |
| Features | HIGH | Gap analysis based on direct inspection of existing twin source and SDK package exports. Method counts verified against official documentation and source. |
| Architecture | HIGH | Patterns verified against existing codebase structure, upstream SDK source, and official documentation. Code examples tested against SDK constructor options. |
| Pitfalls | HIGH | Critical pitfalls sourced from upstream issue trackers, CI documentation, and direct codebase inspection. Recovery costs estimated from component complexity. |

**Overall confidence:** HIGH

### Gaps to Address

- **SocketModeReceiver `clientOptions` passthrough:** MEDIUM confidence that `clientOptions.slackApiUrl` reaches the internal WebClient created by SocketModeClient. Verify during Phase 20 implementation by reading SocketModeReceiver constructor source.
- **Shopify `auth.tokenExchange()` twin requirements:** The token exchange flow for embedded apps requires specific JWT format and validation. The SDK source must be read carefully during Phase 16 planning to understand exact twin endpoint requirements.
- **Bolt `processBeforeResponse` interaction with OAuth:** Known issues in bolt-js (#2380) suggest ExpressReceiver OAuth requires specific configuration. Verify during Phase 19 planning.
- **REST resource deprecation granularity:** Shopify's deprecation is per-API-version, not per-resource. Some resources may lose REST support in 2025-04 while others persist. The exact per-resource deprecation schedule needs verification during Phase 17 planning.

## Sources

### Primary (HIGH confidence)
- npm registry package metadata for all 6 SDK packages (versions, dependencies, engines)
- Upstream SDK GitHub repositories (shopify-app-js, node-slack-sdk, bolt-js) -- source inspection
- Slack official documentation (Web API methods, Socket Mode protocol, request verification)
- Shopify official documentation (REST deprecation, GraphQL Admin API)
- Bolt source code (AwsLambdaReceiver, SocketModeReceiver, HTTPReceiver, ExpressReceiver)
- SocketModeClient source code (apps.connections.open flow, WebSocket reconnection)
- ts-morph documentation and release history (version/TS compatibility, export enumeration API)
- Existing Sandpiper DTU codebase (twin implementations, conformance framework, CI workflows)

### Secondary (MEDIUM confidence)
- Bolt issue tracker (#1300, #1480, #2076, #2380) -- known receiver issues and workarounds
- Community guides on git submodule CI integration
- Shopify REST deprecation timeline articles

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
