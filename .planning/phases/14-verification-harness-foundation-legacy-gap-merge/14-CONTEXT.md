# Phase 14: Verification Harness Foundation & Legacy Gap Merge - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the shared SDK verification workspace that all SDK conformance work will use. Establish `auth.test` and `api.test` gateway for Slack, SDK URL redirection patterns for both twins (`customFetchApi` for Shopify, `slackApiUrl` for Slack), merge legacy HMAC/webhook/UI checks into the workspace, set up per-symbol coverage reporting, and add basic drift detection. This is the foundation — actual SDK method coverage comes in Phases 15-20.

</domain>

<decisions>
## Implementation Decisions

### SDK URL Redirection
- Shared helper pattern: `createShopifyClient()` and `createSlackClient()` utilities in the verification workspace that handle twin URL + token + SDK wiring
- Tests import shared helpers and focus on assertions, not SDK configuration boilerplate
- Shopify uses `customFetchApi` to redirect requests to local twin
- Slack uses `slackApiUrl` constructor option to redirect WebClient to local twin

### Twin Lifecycle
- Global Vitest setup boots both twins once per suite run, provides URLs via env vars
- Matches existing smoke test pattern (`buildApp()` on random ports)
- Tests are stateless between files via `/admin/reset` calls
- `pnpm test:sdk` is the unified verification command at workspace root

### Coverage Reporting
- Generated `coverage-report.json` checked into repo — shows symbol-by-symbol ownership, diffable in PRs
- Three coverage tiers per symbol: `live` (real SDK test against twin), `stub` (valid shape, minimal logic), `deferred` (tracked but no test yet) — aligns with Phase 18 method family tiering
- Phase 14: track coverage but don't fail CI on uncovered symbols — later phases add coverage and tighten the gate

### Legacy Check Merge
- Migrate HMAC signature, async webhook timing, and UI structure checks into the SDK verification workspace
- Rewrite legacy checks as standard Vitest test files — one test runner, one report format
- Existing `@dtu/conformance` fixture-based runner is replaced by Vitest for the verification workspace

### Claude's Discretion
- Fixture seeding approach (shared seeders vs per-test — Claude decides based on what works best)
- Drift detection strictness for Phase 14 (version mismatch, manifest staleness, or both)
- Workspace directory layout (under `tests/sdk-verification/`, or similar)
- `auth.test` and `api.test` implementation details in the Slack twin

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildApp()` factory in both `twins/shopify/src/index.ts` and `twins/slack/src/index.ts`: boots Fastify twin in-process on random ports
- `tests/integration/smoke.test.ts`: demonstrates dual-twin in-process boot with env var URL override pattern
- `@dtu/conformance` package (`packages/conformance/`): fixture-based comparison framework with adapters, runner, reporter
- `tools/sdk-surface/manifests/`: 5 JSON manifests from Phase 13 covering all targeted SDK packages
- `tools/sdk-surface/inventory/`: ts-morph export walker and inventory runner
- `third_party/sdk-pins.json`: version lock linking npm versions to submodule SHAs

### Established Patterns
- Vitest workspace projects in root `vitest.config.ts` with `projects: ['packages/*', 'twins/*', 'tests/*']`
- Slack API returns HTTP 200 with `{ok: false}` for errors — twin and tests must follow this convention
- Fastify plugin encapsulation for twin route organization (`twins/slack/src/plugins/web-api/`)
- `/admin/reset` endpoint on both twins for state reset between tests

### Integration Points
- Slack twin needs new `auth.test` and `api.test` endpoints in `twins/slack/src/plugins/web-api/`
- CI workflow `conformance.yml` will need updates to run `pnpm test:sdk` alongside or replacing existing conformance commands
- Root `package.json` needs `test:sdk` script
- Vitest workspace config may need a new project entry for the verification workspace

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-verification-harness-foundation-legacy-gap-merge*
*Context gathered: 2026-03-09*
