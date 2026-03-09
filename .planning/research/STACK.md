# Stack Research

**Domain:** Official SDK-grounded conformance testing for Shopify and Slack digital twins
**Researched:** 2026-03-09
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Git submodules pointing at repo-owned forks of upstream SDK repos | Commit-pinned | Keep the official SDK source inside this repo for inspection, diffs, and codegen | The milestone is source-truth driven. Commit-pinned submodules make the exact upstream surface auditable and repeatable. |
| `@shopify/admin-api-client` | 1.1.1 | Shopify Admin API boundary for GraphQL and generic REST calls | The package exposes both `createAdminApiClient()` and `createAdminRestApiClient()`, so it is a direct compatibility contract for low-level Shopify access. |
| `@shopify/shopify-api` | 12.3.0 | High-level Shopify backend surface | This package expands beyond GraphQL into auth, session, utils, webhooks, billing, flow, fulfillment-service, clients, and versioned REST resources. |
| `@slack/web-api` | 7.14.1 | Slack Web API boundary | The package exposes `WebClient`, `apiCall`, `paginate`, `filesUploadV2`, `ChatStreamer`, and 274 bound API methods from source. |
| `@slack/oauth` | 3.0.4 | OAuth installation and authorization boundary | `InstallProvider` defines state, cookie, callback, installation store, and authorize semantics that need exact end-to-end verification. |
| `@slack/bolt` | 4.6.0 | Slack app framework boundary | Bolt exports `App`, multiple receivers, middleware helpers, and re-exports OAuth/Web API surfaces. Literal compatibility requires matching framework-facing behavior, not just raw HTTP endpoints. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript compiler API (`typescript`) | 5.7.3 | Enumerate public exports and generate machine-readable coverage manifests | Use for source-derived inventories before adding any extra parser dependency. |
| `vitest` | 2.1.8 | Execute exhaustive contract tests in the existing monorepo test runner | Use for generated and curated SDK conformance suites. |
| `tsx` | 4.19.2 | Run inventory/codegen tooling directly from source | Use for manifest generation and local verification tooling. |
| Node HTTP/WebSocket harnesses | Built-in plus targeted additions only if required | Run callback servers, OAuth redirect handlers, receiver endpoints, and socket-mode brokers in tests | Use wherever the official SDK expects a real transport path. |
| Existing Fastify + SQLite twin stack | Workspace | Provide deterministic backends under test | Reuse the current twin architecture instead of building a second compatibility server layer. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `git submodule` | Pin upstream SDK mirrors to exact commits | Prefer repo-owned forks as remotes so local patches remain reviewable. |
| Generated surface manifests | Record every public symbol and its verification owner | These must be regenerated whenever a submodule ref or package version changes. |
| CI drift gate | Fail when inventory, pinned refs, or coverage reports drift | This is the only reliable way to keep "up-to-date behavior" from regressing between milestones. |

## Installation

```bash
# Official SDK packages used directly in tests
pnpm add -D @shopify/admin-api-client @shopify/shopify-api @slack/web-api @slack/oauth @slack/bolt

# Use existing workspace tooling for inventory and test execution
pnpm add -D typescript tsx vitest
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Git submodules at pinned commits | Vendored source copy | Only if git hosting rules prohibit submodules. A plain copy loses upstream diff history and is harder to update safely. |
| TypeScript compiler API | `ts-morph` | Use `ts-morph` only if the compiler API becomes too awkward for export inventory generation. |
| Official SDK packages as the test boundary | Hand-rolled HTTP requests | Hand-rolled requests are still useful for fixtures, but they cannot be the primary compatibility proof for this milestone. |
| Generated symbol inventory | Hand-maintained allowlists | Manual lists are acceptable only for temporary debugging, never as the source of truth. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Docs-only or README-only surface lists | They hide transitive exports, generated methods, and package-internal compatibility edges | Enumerate source exports from the cloned repos and installed packages. |
| Mocked SDK transports as the main proof | They can bypass headers, retries, cookies, WebSocket framing, and request signing | Run the official SDK against live twin transports in-process or over local loopback. |
| Copy-pasted vendor code into workspace packages | It makes updates opaque and encourages local drift from upstream | Keep the source in submodules and patch forks explicitly. |
| Partial-method smoke coverage marketed as "full SDK support" | It produces false confidence and guarantees missed regressions | Track every public symbol with generated coverage manifests and fail on uncovered gaps. |

## Stack Patterns by Variant

**If a package export is backend-bound:**
- Verify it by running the official package against the twin over the real transport path.
- Because transport details are part of the compatibility contract.

**If a package export is local-only utility code:**
- Keep it in the manifest and verify it separately with source-backed unit tests.
- Because "full literal scope" still requires an auditable answer for every public symbol.

**If Bolt surface requires Socket Mode or alternative receivers:**
- Add a dedicated harness for WebSocket or AWS-style event delivery instead of stubbing the receiver internals.
- Because receiver lifecycle behavior is part of Bolt's public contract.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@shopify/shopify-api@12.3.0` | `@shopify/admin-api-client@^1.1.1` | Source package declares the dependency; it also requires Node `>=20.0.0`, which matches this repo. |
| `@slack/bolt@4.6.0` | `@slack/oauth@^3.0.4`, `@slack/web-api@^7.14.1`, `@slack/socket-mode@^2.0.5` | Bolt's literal surface includes receiver behavior that depends on these packages. |
| Current repo runtime | Shopify Node `>=20`, Slack Node `>=18` | Existing project context already targets Node 20+, so the runtime floor is acceptable. |

## Sources

- `/tmp/gsd-sdk-research/shopify-app-js/packages/api-clients/admin-api-client/package.json` and `README.md` — verified package name, version, repository path, and public client shape
- `/tmp/gsd-sdk-research/shopify-app-js/packages/apps/shopify-api/package.json` and `docs/reference/` — verified package version, runtime floor, and exported capability areas
- `/tmp/gsd-sdk-research/node-slack-sdk/packages/web-api/package.json`, `README.md`, and `src/methods.ts` — verified package version and method surface size
- `/tmp/gsd-sdk-research/node-slack-sdk/packages/oauth/package.json` and `src/install-provider.ts` — verified InstallProvider surface
- `/tmp/gsd-sdk-research/bolt-js/package.json`, `README.md`, `src/index.ts`, and `src/App.ts` — verified receiver exports, listener APIs, and transitive Socket Mode dependency

---
*Stack research for: official SDK-grounded twin conformance*
*Researched: 2026-03-09*
