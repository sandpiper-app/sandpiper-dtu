# Phase 41: Regression Closure & Release Gate Recovery - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** Post-4765f900 adversarial re-audit plus direct local repros

<domain>
## Phase Boundary

This phase does not add new product scope. It is a single remediation phase whose job is to close every regression still open after the attempted fixes in Phases 38-40 and to remove the false "milestone complete" story from the active planning surface until the repo is genuinely green again.

A correct Phase 41 end state is:
- `pnpm build` fails if either twin fails to compile because the root build actually includes both twins
- `pnpm --dir twins/shopify build`, `pnpm --dir twins/slack build`, and `pnpm test:sdk` all pass
- A failed or interrupted SDK run does not leave `tests/sdk-verification/coverage/symbol-execution.json` deleted or make `pnpm coverage:generate` / `pnpm drift:check` unusable
- Shopify rejects unsupported API versions, returns complete offline/refresh OAuth payloads, persists destructive REST changes, and does not corrupt order state on `orderUpdate`
- Slack enforces scopes for every implemented/auth-checked method, validates OAuth/OIDC credentials strictly, and returns absolute plus upstream-compatible upload URLs and payload validation for `filesUploadV2`
- Coverage reports and conformance output stop overstating proof: symbols are live only when truly executed, WebClient method coverage is proven against the full pinned surface, and conformance compares the headers/values that the repo claims are identical

</domain>

<decisions>
## Implementation Decisions

### One Remediation Phase Only
- Use one new phase with multiple plans, not another chain of follow-up phases
- If any finding remains open at the end, Phase 41 is incomplete and the milestone stays in progress

### Verification Before Repair
- Wave 0 must convert each audited discrepancy into an executable RED contract before production changes start
- The final plan must rerun root build, twin builds, `pnpm test:sdk`, `pnpm coverage:generate`, `pnpm drift:check`, and the targeted parity/conformance suites in one signoff sequence

### Truthful Planning Metadata
- `ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` must be corrected before implementation so reopened requirements are marked pending instead of complete
- Phase 41 is allowed to reopen previously complete v1.2 requirement rows when the re-audit proved they are not actually satisfied

### No Artifact Hand Editing
- Do not "fix" coverage or drift by editing checked-in generated JSON directly unless the normal generator is what writes the final form
- Do not add harness rewrites or environment hacks that bypass the real HTTP contracts the upstream SDKs exercise

### Scope Limits
- Do not broaden scope to new services, multiple Shopify API schemas, full Enterprise Grid behavior, or Shopify app-framework package support
- Keep fixes narrow and contract-driven so previously green behavior stays green

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Truth
- `.planning/ROADMAP.md` — current phase lineage and reopened requirement mapping
- `.planning/REQUIREMENTS.md` — authoritative requirement semantics that Phase 41 must reopen and close truthfully
- `.planning/STATE.md` — current milestone status that must stop claiming completion
- `.planning/v1.2-MILESTONE-AUDIT.md` — latest active audit artifact referenced by planning and signoff

### Prior Remediation Context
- `.planning/phases/38-slack-auth-scope-and-client-behavior-parity/38-RESEARCH.md` — previous Slack auth/files parity intent
- `.planning/phases/39-shopify-oauth-rest-state-and-id-parity/39-RESEARCH.md` — previous Shopify parity intent
- `.planning/phases/40-verification-evidence-integrity-and-conformance-truthfulness/40-RESEARCH.md` — previous proof-integrity intent
- `.planning/phases/40-verification-evidence-integrity-and-conformance-truthfulness/40-VALIDATION.md` — current validation command set and truthfulness gates

### Shopify Source of Truth
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/types.ts` — supported API version contract
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/refresh-token.ts` — refresh token request/response contract
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts` — token exchange request/response contract
- `third_party/upstream/shopify-app-js/packages/apps/shopify-api/lib/auth/oauth/create-session.ts` — session fields expected after OAuth flows

### Slack Source of Truth
- `tools/sdk-surface/manifests/slack-web-api@7.14.1.json` — full pinned bound-method surface that must be proven, not sampled
- `third_party/upstream/node-slack-sdk/packages/web-api/src/WebClient.ts` — `filesUploadV2` transport and completion behavior
- `third_party/upstream/node-slack-sdk/packages/web-api/src/types/request/files.ts` — required file-upload payload shapes
- `third_party/upstream/node-slack-sdk/packages/oauth/src/install-provider.ts` — OAuth validation expectations

</canonical_refs>

<specifics>
## Specific Findings To Close

### Build and Verification Gates
- `twins/shopify/src/plugins/oauth.ts` currently breaks `pnpm --dir twins/shopify build` because `subject_token_type` is read but not typed
- Root `package.json` build does not compile the twins, so `pnpm build` can pass while a twin is broken
- `tests/sdk-verification/setup/global-setup.ts` removes `tests/sdk-verification/coverage/symbol-execution.json`; a failing SDK run can leave the tracked file deleted and strand `pnpm coverage:generate` plus `pnpm drift:check`

### Shopify Regressions
- `twins/shopify/src/services/api-version.ts` accepts impossible versions like `2025-02`
- `twins/shopify/src/plugins/rest.ts` returns success for product delete without removing the product
- `twins/shopify/src/plugins/oauth.ts` still returns bare `{access_token, scope}` for refresh/offline flows that upstream expects to carry more fields
- `twins/shopify/src/schema/resolvers.ts` plus `packages/state/src/state-manager.ts` double-stringify `orderUpdate` line items and corrupt later reads
- `tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts` still fails on `InventoryLevel.adjust()`

### Slack Regressions
- `twins/slack/src/services/method-scopes.ts` treats missing catalog entries as "no scope required", leaving many implemented methods under-protected
- `tests/sdk-verification/setup/seeders.ts` derives granted scopes from that same incomplete catalog, so enforcement and seeding drift together
- `twins/slack/src/plugins/web-api/files.ts` emits a relative upload URL when `SLACK_API_URL` is unset and accepts payloads upstream rejects
- `twins/slack/src/plugins/web-api/new-families.ts` still accepts invalid OAuth/OIDC credentials

### Proof and Reporting Regressions
- `tests/sdk-verification/helpers/shopify-api-client.ts` eagerly records live symbol hits at construction time instead of only when the corresponding surface is actually exercised
- `packages/conformance/src/comparator.ts` still ignores most headers and most primitive values even where the repo claims parity
- `tests/sdk-verification/sdk/slack-method-coverage.test.ts` still proves only representative methods per family, not the entire pinned bound surface

</specifics>

<deferred>
## Deferred Ideas

None. Every open finding from the post-remediation re-audit is in scope for Phase 41.

</deferred>

---

*Phase: 41-regression-closure-and-release-gate-recovery*
*Context gathered: 2026-03-14*
