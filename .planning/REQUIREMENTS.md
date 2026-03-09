# Requirements: Sandpiper DTU

**Defined:** 2026-03-09
**Core Value:** Sandpiper's integration tests run against behavioral clones that behave identically to real services — fast, deterministic, free, and capable of simulating failure modes impossible to trigger against live APIs.

## v1.1 Requirements

Requirements for milestone `v1.1 Official SDK Conformance`. Each maps to one roadmap phase.

### Conformance Infrastructure

- [x] **INFRA-10**: Developer can check out repo-owned fork submodules of the targeted upstream SDK repos under `third_party/upstream/`, with each submodule pinned to a recorded commit and package version
- [x] **INFRA-11**: Developer can run a manifest generator that inventories every public export and method in the targeted packages and writes a checked-in coverage ledger
- [x] **INFRA-12**: Developer can see, for each inventoried symbol, whether it is verified by a live twin test or a local-only utility test, and CI fails if any `v1.1` symbol lacks declared coverage
- [x] **INFRA-13**: Developer can run one verification command that executes SDK conformance, HMAC signature, async webhook timing, and UI structure checks together
- [x] **INFRA-14**: CI can detect upstream drift by comparing pinned submodule refs, installed package versions, and generated manifests on milestone updates
- [x] **INFRA-15**: SDK verification tests hit live local HTTP/WebSocket endpoints using official SDK URL redirection mechanisms (`customFetchApi` for Shopify, `slackApiUrl` for Slack), not mocked transports
- [x] **INFRA-16**: Manifest generation uses `ts-morph` (v25.0.1+) for reliable export enumeration rather than raw TypeScript compiler API

### Shopify SDK Coverage

- [x] **SHOP-08**: Developer can use `@shopify/admin-api-client` GraphQL client methods (`request`, `fetch`, `getHeaders`, `getApiUrl`) against the Shopify twin across pinned and per-request API versions
- [ ] **SHOP-09**: Developer can use `@shopify/admin-api-client` generic REST client methods (`get`, `post`, `put`, `delete`) against the Shopify twin with supported headers, search params, payloads, and retry behavior
- [ ] **SHOP-10**: Developer can use `@shopify/shopify-api` auth helpers (`begin`, `callback`, `tokenExchange`, `refreshToken`, `clientCredentials`, and embedded URL helpers) against the Shopify twin
- [ ] **SHOP-11**: Developer can use `@shopify/shopify-api` session and utility helpers to create, decode, validate, and resolve Shopify session data for twin-backed requests
- [ ] **SHOP-12**: Developer can use `@shopify/shopify-api` webhook, Flow, and fulfillment-service validation helpers with twin-generated requests and signatures
- [ ] **SHOP-13**: Developer can use `@shopify/shopify-api` billing helpers to request, inspect, cancel, and mutate billing state against the Shopify twin _(lower priority — can be stubbed initially; auth+session+webhooks are the core)_
- [ ] **SHOP-14**: Developer can use `@shopify/shopify-api` client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) against the Shopify twin with the pinned package configuration
- [ ] **SHOP-15**: Developer can use Shopify client surfaces (`Graphql`, `Rest`, `Storefront`, `graphqlProxy`) and strategically stubbed REST resource classes, with deprecated REST resources tracked in manifest but not fully implemented (reflects Shopify's April 2025 REST deprecation mandate)

### Slack SDK Coverage

- [x] **SLCK-06.5**: Developer can call `auth.test` and `api.test` via WebClient and receive valid auth verification responses — this is the gateway for all Slack SDK work (WebClient calls `auth.test` during initialization)
- [ ] **SLCK-07**: Developer can use `@slack/web-api` `WebClient` base behaviors (`apiCall`, `paginate`, `filesUploadV2`, `ChatStreamer`, retries, and rate-limit handling) against the Slack twin
- [ ] **SLCK-08**: Developer can call every bound method exposed by the pinned `@slack/web-api` package against the Slack twin, including admin, files, views, workflows, assistant, canvases, and other advanced method families
- [ ] **SLCK-09**: Developer can use `@slack/oauth` `InstallProvider` flows (`handleInstallPath`, `generateInstallUrl`, `handleCallback`, `authorize`) against the Slack twin with valid state, cookie, redirect, and installation-store behavior
- [ ] **SLCK-10**: Developer can use `@slack/bolt` `App` listener APIs (`event`, `message`, `action`, `command`, `options`, `shortcut`, `view`, `function`, and `assistant`) against twin-backed Slack requests with correct ack semantics
- [ ] **SLCK-11**: Developer can use `@slack/bolt` HTTP and Express receiver flows against the Slack twin, including request verification, URL verification, response_url behavior, and custom routes
- [ ] **SLCK-12**: Developer can use `@slack/bolt` Socket Mode and AWS Lambda receiver flows against twin-backed harnesses with equivalent event delivery and acknowledgement semantics _(Socket Mode uses ws.Server broker; Lambda uses direct function invocation with zero AWS deps)_

## v2 Requirements

Deferred after the literal `v1.1` package-surface baseline exists.

### Additional SDK Targets

- **SLCK-13**: Developer can validate standalone Slack packages outside the v1.1 target set (`@slack/rtm-api`, `@slack/webhook`, standalone `@slack/socket-mode`) against dedicated twins or harnesses
- **SHOP-16**: Developer can validate Shopify app-framework packages (`shopify-app-express`, `shopify-app-remix`, `shopify-app-react-router`) against the twin ecosystem when app-framework fidelity becomes valuable

### Automation

- **INFRA-17**: Developer can open an automated update PR that bumps pinned SDK refs, regenerates manifests, and summarizes compatibility diffs
- **INFRA-18**: Developer can run a multi-version package matrix across more than one pinned Shopify or Slack package release

## Out of Scope

Explicitly excluded from `v1.1` to keep the milestone aligned with the targeted package set.

| Feature | Reason |
|---------|--------|
| APIs not reachable through the targeted package surfaces | Would expand beyond the literal SDK contract approved for this milestone |
| Multi-version package support in the initial v1.1 build | One pinned version per package is already a large scope increase |
| New service twins (Nylas, Shippo, Triple Whale) | Deferred until the SDK-grounded validation pattern is proven on Shopify and Slack |
| Production deployment work | Sandpiper DTU remains development and test infrastructure |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-10 | Phase 13 | Complete |
| INFRA-11 | Phase 13 | Complete |
| INFRA-12 | Phase 14 | Complete |
| INFRA-13 | Phase 14 | Complete |
| INFRA-14 | Phase 14, 20 | Complete |
| INFRA-15 | Phase 14 | Complete |
| INFRA-16 | Phase 13 | Complete |
| SHOP-08 | Phase 15 | Complete |
| SHOP-09 | Phase 15 | Pending |
| SHOP-10 | Phase 16 | Pending |
| SHOP-11 | Phase 16 | Pending |
| SHOP-12 | Phase 16 | Pending |
| SHOP-13 | Phase 16 | Pending |
| SHOP-14 | Phase 17 | Pending |
| SHOP-15 | Phase 17 | Pending |
| SLCK-06.5 | Phase 14 | Complete |
| SLCK-07 | Phase 18 | Pending |
| SLCK-08 | Phase 18 | Pending |
| SLCK-09 | Phase 19 | Pending |
| SLCK-10 | Phase 19 | Pending |
| SLCK-11 | Phase 19 | Pending |
| SLCK-12 | Phase 20 | Pending |

**Coverage:**
- v1.1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-08 after independent research review*
