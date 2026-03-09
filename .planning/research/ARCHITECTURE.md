# Architecture Research

**Domain:** Source-driven SDK conformance architecture for digital twins
**Researched:** 2026-03-09
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    Upstream Source-of-Truth Layer                   │
├──────────────────────────────────────────────────────────────────────┤
│  Git submodules (repo-owned forks)                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ shopify-app-js │  │ node-slack-sdk │  │ bolt-js                │ │
│  └───────┬────────┘  └───────┬────────┘  └──────────┬─────────────┘ │
├──────────┴────────────────────┴──────────────────────┴───────────────┤
│                   Inventory / Generation Layer                       │
├──────────────────────────────────────────────────────────────────────┤
│  Surface extractor -> symbol manifests -> generated test matrices    │
│  package versions -> pinned refs -> coverage ledger                  │
├──────────────────────────────────────────────────────────────────────┤
│                     Verification Harness Layer                       │
├──────────────────────────────────────────────────────────────────────┤
│  Official SDK packages  <->  local HTTP / OAuth / WebSocket harness  │
│  fixture seeding            callback capture      receiver emulation  │
├──────────────────────────────────────────────────────────────────────┤
│                       Twin Backend Layer                             │
├──────────────────────────────────────────────────────────────────────┤
│  Shopify twin (GraphQL/REST/auth/webhooks/billing/Storefront)        │
│  Slack twin (Web API/events/oauth/interactions/receivers/socket)     │
├──────────────────────────────────────────────────────────────────────┤
│                    Reporting / Drift Gate Layer                      │
├──────────────────────────────────────────────────────────────────────┤
│  coverage manifests, per-symbol reports, CI drift checks             │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Upstream mirrors | Freeze the exact SDK source being targeted | Git submodules rooted under a dedicated third-party directory |
| Surface extractor | Enumerate every targeted public export and method | TypeScript compiler API walking package entrypoints and exported symbols |
| Generated manifest | Record coverage ownership and status per symbol | Checked-in JSON/Markdown report keyed by package name and version |
| Verification harness | Run the official SDK packages against live twin transports | Vitest suites plus local HTTP/WebSocket helper servers |
| Twin capability layer | Implement the behaviors the SDKs actually rely on | Existing Fastify twins extended by package/capability wave |
| Drift/reporting layer | Detect ref drift and lost coverage | CI jobs that compare manifests, package versions, and test results |

## Recommended Project Structure

```text
third_party/
├── upstream/
│   ├── shopify-app-js/      # Pinned fork submodule
│   ├── node-slack-sdk/      # Pinned fork submodule
│   └── bolt-js/             # Pinned fork submodule
tools/
├── sdk-surface/
│   ├── inventory/           # Export walkers and package readers
│   ├── generators/          # Generated test matrix builders
│   └── manifests/           # Checked-in symbol manifests
tests/
├── sdk/
│   ├── shared/              # OAuth, callback, socket, fixture helpers
│   ├── shopify/             # Generated + curated Shopify suites
│   ├── slack/               # Generated + curated Slack suites
│   └── verification/        # Merged legacy manual verification coverage
reports/
└── sdk-coverage/            # Human-readable coverage reports
```

### Structure Rationale

- **`third_party/upstream/`:** keeps source mirrors clearly separate from first-party packages while remaining in-repo.
- **`tools/sdk-surface/`:** inventory and generation logic should not live inside test files or twins.
- **`tests/sdk/`:** package-driven conformance needs a dedicated workspace distinct from today's smaller integration tests.
- **`reports/sdk-coverage/`:** generated artifacts should be reviewable without reading raw JSON.

## Architectural Patterns

### Pattern 1: Source-Derived Coverage Manifest

**What:** Generate the compatibility contract from package exports instead of writing it by hand.
**When to use:** Always for this milestone.
**Trade-offs:** More up-front tooling, much lower long-term drift risk.

**Example:**
```ts
// Pseudocode: walk the package entrypoint and record every exported symbol.
const manifest = inventoryPackage(entryFile);
writeManifest(packageName, packageVersion, manifest);
```

### Pattern 2: Generated Matrix + Curated Semantics

**What:** Combine generated symbol-level coverage with a smaller set of curated end-to-end semantic flows.
**When to use:** When the public surface is too large for purely hand-written tests.
**Trade-offs:** Requires clear ownership boundaries between generated and curated suites.

**Example:**
```ts
for (const symbol of manifest.symbols) {
  createGeneratedCase(symbol);
}

createCuratedCase('oauth state cookie survives redirect');
createCuratedCase('socket-mode ack semantics match Bolt expectations');
```

### Pattern 3: Capability-First Twin Expansion

**What:** Expand the twins by shared capability layers rather than by random method order.
**When to use:** When many SDK methods share auth, pagination, upload, or transport semantics.
**Trade-offs:** Some individual methods wait for the right shared foundation.

## Data Flow

### Request Flow

```text
Pinned submodule ref
    ↓
Inventory generator
    ↓
Coverage manifest
    ↓
Generated SDK test case
    ↓
Official SDK package
    ↓
Twin HTTP / OAuth / WebSocket endpoint
    ↓
Assertion + coverage report
```

### State Management

```text
Fixture seeders
    ↓
Twin state managers (SQLite / in-memory)
    ↓
Official SDK requests mutate / query state
    ↓
Coverage and semantic assertions read outcomes
```

### Key Data Flows

1. **SDK inventory flow:** cloned source -> exported symbol manifest -> checked-in coverage ledger.
2. **Conformance flow:** official SDK package -> local harness -> twin backend -> normalized assertion output.
3. **Drift flow:** changed submodule ref or package version -> regenerated manifest -> CI gate if coverage mismatches.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-500 symbols | One generated manifest per package and a single SDK test workspace is fine |
| 500-2,000 symbols | Split generated suites by package family to keep runtime and failure triage manageable |
| 2,000+ symbols | Parallelize generation/execution and publish per-family coverage artifacts in CI |

### Scaling Priorities

1. **First bottleneck:** test execution time — fix by grouping suites by package family and reusing seeded twin instances.
2. **Second bottleneck:** triage noise — fix by attaching failures to symbol manifests and capability groups instead of a flat list.

## Anti-Patterns

### Anti-Pattern 1: Manual Surface Checklists

**What people do:** Maintain a Markdown list of "supported methods" by hand.
**Why it's wrong:** It drifts immediately and hides package export changes.
**Do this instead:** Generate manifests directly from source and fail CI on drift.

### Anti-Pattern 2: Test Harnesses That Bypass Real Transports

**What people do:** Stub `fetch`, `axios`, or receiver internals to make tests pass faster.
**Why it's wrong:** It skips the exact boundary the user wants to trust.
**Do this instead:** Run the official SDK against live local HTTP/WebSocket endpoints.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Shopify SDK mirrors | Git submodule + package inventory | `@shopify/shopify-api` includes much more than the current twin surface. |
| Slack SDK mirrors | Git submodule + package inventory | `@slack/web-api` and `@slack/oauth` live in `node-slack-sdk`; Bolt is separate. |
| Bolt receiver stack | HTTP + WebSocket + Lambda-style harnesses | Literal package scope includes alternate receivers and Socket Mode support. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `tools/sdk-surface` ↔ `tests/sdk` | Generated manifests and test matrices | Keep generation and execution decoupled. |
| `tests/sdk` ↔ `twins/*` | Real HTTP/WebSocket traffic plus admin seeding endpoints | Avoid mocking transport internals. |
| `tests/sdk` ↔ `reports/sdk-coverage` | JSON/Markdown artifacts | Reports should be publishable in CI. |

## Sources

- `/tmp/gsd-sdk-research/shopify-app-js/packages/apps/shopify-api/docs/reference/`
- `/tmp/gsd-sdk-research/shopify-app-js/packages/api-clients/admin-api-client/src/`
- `/tmp/gsd-sdk-research/node-slack-sdk/packages/web-api/src/`
- `/tmp/gsd-sdk-research/node-slack-sdk/packages/oauth/src/`
- `/tmp/gsd-sdk-research/bolt-js/src/`

---
*Architecture research for: source-driven SDK conformance*
*Researched: 2026-03-09*
