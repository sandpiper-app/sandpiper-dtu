# Roadmap: Sandpiper DTU

**Project:** Sandpiper DTU (Digital Twin Universe)
**Milestone:** v1.1 Official SDK Conformance
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.
**Created:** 2026-03-09
**Depth:** Comprehensive

**Historical Note:** Previous work used Phases 1-12 under v1.0. This milestone resumes at Phase 13; the old Phase 12 manual-verification scope is absorbed into Phase 14.

## Phases

- [ ] **Phase 13: Upstream SDK Mirrors & Surface Inventory** - Freeze upstream source truth and generate public-surface manifests
- [ ] **Phase 14: Verification Harness Foundation & Legacy Gap Merge** - Build the shared SDK verification workspace and absorb old manual verification coverage
- [ ] **Phase 15: Shopify Admin Client Compatibility** - Make the Shopify twin satisfy `@shopify/admin-api-client`
- [ ] **Phase 16: Shopify `shopify-api` Platform Surface** - Make auth, session, utils, webhooks, billing, flow, and fulfillment-service helpers work against the twin
- [ ] **Phase 17: Shopify REST Resource & Client Expansion** - Cover Shopify client surfaces and every exported REST resource class in the pinned package version
- [ ] **Phase 18: Slack WebClient Full Surface** - Make the Slack twin satisfy the full pinned `@slack/web-api` surface
- [ ] **Phase 19: Slack OAuth & Bolt HTTP Surface** - Make `@slack/oauth` and Bolt's HTTP/Express application surface work against the twin
- [ ] **Phase 20: Bolt Alternate Receivers & Drift Automation** - Close Socket Mode/AWS receiver gaps and enforce long-term SDK drift detection

## Phase Details

### Phase 13: Upstream SDK Mirrors & Surface Inventory
**Goal**: Freeze the literal SDK source of truth inside the repo and generate a machine-readable coverage contract.
**Depends on:** Completed v1.0 twin baseline
**Requirements**: INFRA-10, INFRA-11
**Success Criteria** (what must be TRUE):
  1. Developer can initialize repo-owned fork submodules for `shopify-app-js`, `node-slack-sdk`, and `bolt-js` under `third_party/upstream/` and see pinned SHAs plus package versions recorded
  2. Developer can run inventory tooling that emits manifests for `@shopify/admin-api-client`, `@shopify/shopify-api`, `@slack/web-api`, `@slack/oauth`, and `@slack/bolt`
  3. Generated manifests record every public symbol and method from the pinned packages with stable IDs suitable for coverage tracking
  4. Manifest diffs clearly show added or removed surface when a ref or package version changes
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 13` to break down)

### Phase 14: Verification Harness Foundation & Legacy Gap Merge
**Goal**: Build the shared verification harness that all SDK conformance work will use and merge the old manual verification checks into it.
**Depends on:** Phase 13
**Requirements**: INFRA-12, INFRA-13
**Success Criteria** (what must be TRUE):
  1. Developer can run a dedicated SDK verification workspace that boots reusable Shopify and Slack twin instances plus shared fixture seeders
  2. Official SDK packages hit live local HTTP, OAuth, and WebSocket harnesses without bypassing their transport layers
  3. HMAC signature, async webhook timing, and UI structure checks run in the same verification command as the SDK suites
  4. Coverage reports show per-symbol ownership across generated and curated tests
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 14` to break down)

### Phase 15: Shopify Admin Client Compatibility
**Goal**: Make the Shopify twin satisfy the low-level Admin GraphQL and generic REST clients.
**Depends on:** Phase 14
**Requirements**: SHOP-08, SHOP-09
**Success Criteria** (what must be TRUE):
  1. `createAdminApiClient()` request, fetch, getHeaders, and getApiUrl behaviors pass against the Shopify twin for pinned and per-request API versions
  2. `createAdminRestApiClient()` get, post, put, and delete behaviors pass against the Shopify twin with correct headers, search params, payload encoding, and retry semantics
  3. Twin-side auth, versioning, and error semantics match what the low-level Shopify clients expect
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 15` to break down)

### Phase 16: Shopify `shopify-api` Platform Surface
**Goal**: Make the high-level Shopify platform helpers work against the twin.
**Depends on:** Phase 15
**Requirements**: SHOP-10, SHOP-11, SHOP-12, SHOP-13
**Success Criteria** (what must be TRUE):
  1. Auth helpers complete begin, callback, token exchange, refresh, client credentials, and embedded URL flows against the Shopify twin
  2. Session and utility helpers create, decode, validate, and resolve twin-backed session data correctly
  3. Webhook, Flow, and fulfillment-service validation helpers accept valid twin-generated requests and reject invalid ones correctly
  4. Billing helpers can request, inspect, cancel, and mutate billing state against the Shopify twin
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 16` to break down)

### Phase 17: Shopify REST Resource & Client Expansion
**Goal**: Cover the remaining Shopify client surfaces and the full pinned REST resource bundle.
**Depends on:** Phase 16
**Requirements**: SHOP-14, SHOP-15
**Success Criteria** (what must be TRUE):
  1. `shopify.clients.Graphql`, `Rest`, `Storefront`, and `graphqlProxy` work against the Shopify twin with the pinned package configuration
  2. Every exported REST resource class in the pinned `@shopify/shopify-api/rest/admin/[version]` bundle has twin coverage for the methods that class exposes
  3. The Shopify twin exposes the endpoints, shapes, and state transitions required by those clients and resources without hidden manual allowlists
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 17` to break down)

### Phase 18: Slack WebClient Full Surface
**Goal**: Make the Slack twin satisfy the full pinned `@slack/web-api` package surface.
**Depends on:** Phase 14
**Requirements**: SLCK-07, SLCK-08
**Success Criteria** (what must be TRUE):
  1. `WebClient` base behaviors (`apiCall`, `paginate`, `filesUploadV2`, `ChatStreamer`, retry and rate-limit handling) pass against the Slack twin
  2. Every bound method in the pinned `@slack/web-api` package maps to an executable test and passes against the Slack twin
  3. Core, admin, files, views, workflows, assistant, canvases, and other advanced method families return the shapes and semantics the official package expects
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
**Goal**: Close the remaining Bolt receiver surface and enforce long-term SDK drift detection.
**Depends on:** Phase 19
**Requirements**: INFRA-14, SLCK-12
**Success Criteria** (what must be TRUE):
  1. SocketModeReceiver and AwsLambdaReceiver pass against dedicated twin-backed harnesses with equivalent delivery and acknowledgement semantics
  2. CI fails when submodule refs, installed package versions, manifests, or symbol coverage drift
  3. Developer can update a pinned SDK ref, regenerate manifests, and see compatibility deltas before merging
**Plans:** 0 plans

Plans:
- [ ] TBD (run `$gsd-plan-phase 20` to break down)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Upstream SDK Mirrors & Surface Inventory | 0/0 | Pending | — |
| 14. Verification Harness Foundation & Legacy Gap Merge | 0/0 | Pending | — |
| 15. Shopify Admin Client Compatibility | 0/0 | Pending | — |
| 16. Shopify `shopify-api` Platform Surface | 0/0 | Pending | — |
| 17. Shopify REST Resource & Client Expansion | 0/0 | Pending | — |
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
  │    Phase 17 (Shopify REST & Clients)
  │
  └──→ Phase 18 (Slack WebClient)
         ↓
       Phase 19 (Slack OAuth & Bolt HTTP)
         ↓
       Phase 20 (Bolt Alternate Receivers & Drift Automation)
```
