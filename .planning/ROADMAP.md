# Roadmap: Sandpiper DTU

**Project:** Sandpiper DTU (Digital Twin Universe)
**Milestone:** v1.1 Official SDK Conformance
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.
**Created:** 2026-03-09
**Depth:** Comprehensive

**Historical Note:** Previous work used Phases 1-12 under v1.0. This milestone resumes at Phase 13; the old Phase 12 manual-verification scope is absorbed into Phase 14.

## Phases

- [x] **Phase 13: Upstream SDK Mirrors & Surface Inventory** - Freeze upstream source truth and generate public-surface manifests (completed 2026-03-09)
- [x] **Phase 14: Verification Harness Foundation & Legacy Gap Merge** - Build the shared SDK verification workspace and absorb old manual verification coverage (completed 2026-03-09)
- [ ] **Phase 15: Shopify Admin Client Compatibility** - Make the Shopify twin satisfy `@shopify/admin-api-client`
- [ ] **Phase 16: Shopify `shopify-api` Platform Surface** - Make auth, session, utils, webhooks, billing, flow, and fulfillment-service helpers work against the twin
- [ ] **Phase 17: Shopify Client Surfaces & Strategic REST Stubs** - Cover Shopify client surfaces and strategically stub deprecated REST resource classes
- [ ] **Phase 18: Slack WebClient Full Surface** - Make the Slack twin satisfy the full pinned `@slack/web-api` surface
- [ ] **Phase 19: Slack OAuth & Bolt HTTP Surface** - Make `@slack/oauth` and Bolt's HTTP/Express application surface work against the twin
- [ ] **Phase 20: Bolt Alternate Receivers & Drift Automation** - Close Socket Mode/AWS receiver gaps and enforce long-term SDK drift detection

## Phase Details

### Phase 13: Upstream SDK Mirrors & Surface Inventory
**Goal**: Freeze the literal SDK source of truth inside the repo and generate a machine-readable coverage contract.
**Depends on:** Completed v1.0 twin baseline
**Requirements**: INFRA-10, INFRA-11, INFRA-16
**Success Criteria** (what must be TRUE):
  1. Developer can initialize repo-owned fork submodules for `shopify-app-js`, `node-slack-sdk`, and `bolt-js` under `third_party/upstream/` and see pinned SHAs plus package versions recorded
  2. Developer can run inventory tooling (using `ts-morph` v25.0.1+ for reliable export enumeration) that emits manifests for `@shopify/admin-api-client`, `@shopify/shopify-api`, `@slack/web-api`, `@slack/oauth`, and `@slack/bolt`
  3. Generated manifests record every public symbol and method from the pinned packages with stable IDs suitable for coverage tracking
  4. Manifest diffs clearly show added or removed surface when a ref or package version changes
  5. SDK packages are installed at workspace root, not per-twin; Vitest aligns to ^3.0.0 across workspace
**Plans:** 3/3 plans complete

Plans:
- [ ] 13-01-PLAN.md — Workspace config and CI submodule checkout (vitest.config.ts, twin Vitest alignment, conformance.yml + e2e.yml)
- [ ] 13-02-PLAN.md — SDK package installs, ts-morph inventory generator, and five manifest JSON files
- [ ] 13-03-PLAN.md — Git submodule add for three upstream forks, SHA pinning, and sdk-pins.json

### Phase 14: Verification Harness Foundation & Legacy Gap Merge
**Goal**: Build the shared verification harness that all SDK conformance work will use, merge the old manual verification checks into it, and establish the `auth.test` gateway and SDK URL redirection patterns.
**Depends on:** Phase 13
**Requirements**: INFRA-12, INFRA-13, INFRA-14 (basic drift), INFRA-15, SLCK-06.5
**Success Criteria** (what must be TRUE):
  1. Developer can run a dedicated SDK verification workspace that boots reusable Shopify and Slack twin instances plus shared fixture seeders
  2. Official SDK packages hit live local HTTP/WebSocket endpoints using SDK URL redirection mechanisms (`customFetchApi` for Shopify, `slackApiUrl` for Slack), not mocked transports
  3. Slack twin responds to `auth.test` and `api.test` with valid auth verification responses, enabling WebClient initialization (the gateway for all Slack SDK work)
  4. HMAC signature, async webhook timing, and UI structure checks run in the same verification command as the SDK suites
  5. Coverage reports show per-symbol ownership across generated and curated tests
  6. Basic drift detection validates that pinned submodule refs match installed package versions and generated manifests
**Plans:** 5/5 plans complete

Plans:
- [ ] 14-01-PLAN.md — Slack twin auth.test and api.test routes (authPlugin)
- [ ] 14-02-PLAN.md — SDK verification workspace scaffold (vitest config, global setup, client helpers, test:sdk script)
- [ ] 14-03-PLAN.md — SDK gateway tests: Slack auth.test via WebClient, Shopify client wire-up
- [ ] 14-04-PLAN.md — Legacy conformance migration: HMAC signature, async webhook timing, UI structure tests
- [ ] 14-05-PLAN.md — Coverage ledger (coverage-report.json) and basic drift detection script

### Phase 15: Shopify Admin Client Compatibility
**Goal**: Make the Shopify twin satisfy the low-level Admin GraphQL and generic REST clients.
**Depends on:** Phase 14
**Requirements**: SHOP-08, SHOP-09
**Success Criteria** (what must be TRUE):
  1. `createAdminApiClient()` request, fetch, getHeaders, and getApiUrl behaviors pass against the Shopify twin for pinned and per-request API versions
  2. `createAdminRestApiClient()` get, post, put, and delete behaviors pass against the Shopify twin with correct headers, search params, payload encoding, and retry semantics
  3. Twin-side auth, versioning, and error semantics match what the low-level Shopify clients expect
**Plans:** 3 plans

Plans:
- [ ] 15-01-PLAN.md — GraphQL client method tests (request, fetch, getHeaders, getApiUrl) for SHOP-08
- [ ] 15-02-PLAN.md — REST plugin for Shopify twin + createRestClient() helper for SHOP-09
- [ ] 15-03-PLAN.md — REST client tests (all 4 verbs, searchParams, headers, retry, auth error) + coverage ledger update

### Phase 16: Shopify `shopify-api` Platform Surface
**Goal**: Make the high-level Shopify platform helpers work against the twin. Auth, session, and webhooks are the core; billing is lower priority and can be stubbed initially.
**Depends on:** Phase 15
**Requirements**: SHOP-10, SHOP-11, SHOP-12, SHOP-13
**Success Criteria** (what must be TRUE):
  1. Auth helpers complete begin, callback, token exchange, refresh, client credentials, and embedded URL flows against the Shopify twin
  2. Session and utility helpers create, decode, validate, and resolve twin-backed session data correctly
  3. Webhook, Flow, and fulfillment-service validation helpers accept valid twin-generated requests and reject invalid ones correctly
  4. Billing helpers can request, inspect, cancel, and mutate billing state against the Shopify twin _(lower priority — can be stubbed initially)_
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 16` to break down)

### Phase 17: Shopify Client Surfaces & Strategic REST Stubs
**Goal**: Cover the Shopify client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) and strategically stub deprecated REST resource classes. Full REST resource implementation is deprioritized given Shopify's April 2025 REST deprecation mandate.
**Depends on:** Phase 16
**Requirements**: SHOP-14, SHOP-15
**Success Criteria** (what must be TRUE):
  1. `shopify.clients.Graphql`, `Rest`, `Storefront`, and `graphqlProxy` work against the Shopify twin with the pinned package configuration
  2. Strategic REST resource classes (those still commonly used) have twin coverage for the methods they expose; deprecated REST resources are tracked in manifest but stubbed rather than fully implemented
  3. The Shopify twin exposes the endpoints, shapes, and state transitions required by the client surfaces without hidden manual allowlists
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 17` to break down)

### Phase 18: Slack WebClient Full Surface
**Goal**: Make the Slack twin satisfy the full pinned `@slack/web-api` package surface using a tiered method family strategy.
**Depends on:** Phase 14
**Requirements**: SLCK-07, SLCK-08
**Success Criteria** (what must be TRUE):
  1. `WebClient` base behaviors (`apiCall`, `paginate`, `filesUploadV2`, `ChatStreamer`, retry and rate-limit handling) pass against the Slack twin
  2. Tier 1 method families (chat, conversations, users, reactions, pins, auth, views: ~60 methods) have full twin coverage with correct shapes and semantics
  3. Tier 2 method families (files, search, reminders) are stubbed with valid response shapes
  4. Tier 3 method families (admin.*) are deferred — tracked in manifest but not implemented in this phase
  5. Every bound method in the pinned `@slack/web-api` package maps to a declared coverage entry (live test, stub, or deferred)
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 18` to break down)

### Phase 19: Slack OAuth & Bolt HTTP Surface
**Goal**: Make Slack OAuth and Bolt's HTTP-oriented framework surface work against the twin.
**Depends on:** Phase 18
**Requirements**: SLCK-09, SLCK-10, SLCK-11
**Success Criteria** (what must be TRUE):
  1. `InstallProvider` install path, state, callback, and authorize flows work end to end against the Slack twin
  2. Bolt `App` listener APIs handle events, messages, actions, commands, options, shortcuts, views, functions, and assistant flows with correct ack semantics
  3. HTTPReceiver and ExpressReceiver verify requests, satisfy URL verification, support response_url flows, and honor custom routes against the Slack twin
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 19` to break down)

### Phase 20: Bolt Alternate Receivers & Drift Automation
**Goal**: Close the remaining Bolt receiver surface and harden long-term SDK drift detection (basic drift detection established in Phase 14).
**Depends on:** Phase 19
**Requirements**: INFRA-14 (full), SLCK-12
**Success Criteria** (what must be TRUE):
  1. SocketModeReceiver passes against a twin-backed `ws.Server` broker harness with equivalent WebSocket delivery and acknowledgement semantics
  2. AwsLambdaReceiver passes against direct function invocation harness with zero AWS dependencies
  3. CI fails when submodule refs, installed package versions, manifests, or symbol coverage drift (hardened beyond Phase 14 basic detection)
  4. Developer can update a pinned SDK ref, regenerate manifests, and see compatibility deltas before merging
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 20` to break down)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Upstream SDK Mirrors & Surface Inventory | 3/3 | Complete    | 2026-03-09 |
| 14. Verification Harness Foundation & Legacy Gap Merge | 5/5 | Complete    | 2026-03-09 |
| 15. Shopify Admin Client Compatibility | 0/3 | In Progress | — |
| 16. Shopify `shopify-api` Platform Surface | 0/0 | Pending | — |
| 17. Shopify Client Surfaces & Strategic REST Stubs | 0/0 | Pending | — |
| 18. Slack WebClient Full Surface | 0/0 | Pending | — |
| 19. Slack OAuth & Bolt HTTP Surface | 0/0 | Pending | — |
| 20. Bolt Alternate Receivers & Drift Automation | 0/0 | Pending | — |

## Dependencies

```text
Completed v1.0 baseline
  ↓
Phase 13 (Mirrors & Inventory)
  ↓
Phase 14 (Verification Harness)
  ├──→ Phase 15 (Shopify Admin Client)
  │      ↓
  │    Phase 16 (Shopify Platform Surface)
  │      ↓
  │    Phase 17 (Shopify Client Surfaces & REST Stubs)
  │
  └──→ Phase 18 (Slack WebClient)
         ↓
       Phase 19 (Slack OAuth & Bolt HTTP)
         ↓
       Phase 20 (Bolt Alternate Receivers & Drift Automation)
```
