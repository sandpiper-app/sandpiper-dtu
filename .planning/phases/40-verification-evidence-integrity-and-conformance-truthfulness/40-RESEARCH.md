# Phase 40: Verification Evidence Integrity and Conformance Truthfulness - Research

**Researched:** 2026-03-14
**Domain:** SDK verification evidence provenance, conformance proof boundaries, and verification/doc truthfulness
**Confidence:** HIGH

## User Constraints

- Keep the scope tight and do not over-explore.
- Research only what is needed to plan Phase 40 well.
- Write only the Phase 40 research artifact.
- Explicitly call out that `INFRA-23`, `INFRA-24`, and `INFRA-25` are currently missing from `REQUIREMENTS.md`.

## Summary

Phase 40 is not a new Shopify or Slack capability phase. The remaining work is about proof integrity. The current SDK coverage pipeline reads real Vitest JSON output, but it still turns symbols live through a hand-authored `EVIDENCE_MAP` keyed to test files. That means the pass/fail evidence is real, but symbol attribution is still manual. The current drift gate also trusts checked-in `vitest-evidence.json` and `coverage-report.json`, so a stale artifact can preserve a false "live" story until someone regenerates it.

The conformance side has a similar truth-boundary issue. The harness is stronger than it was before Phase 37, but the actual suite inventory is still narrow: Shopify has products, orders, and webhook suites; Slack has chat, conversations, users, and oauth suites; many tests still carry legacy requirement IDs like `SHOP-01` and `SLCK-01`. Several deterministic Slack error cases still run in structural mode, which means a changed `error` string can pass as long as the shape matches. Current phase and verification docs overstate what those suites prove.

**Primary recommendation:** Plan Phase 40 as a tight four-part truthfulness phase: define the missing `INFRA-23..25` requirements, replace `EVIDENCE_MAP` with runtime symbol evidence captured at the shared helper seam, tighten deterministic conformance checks where value parity actually matters, and update gates/docs so they describe only what the code proves.

<phase_requirements>
## Phase Requirements

Roadmap assigns `INFRA-23`, `INFRA-24`, and `INFRA-25` to Phase 40, but `REQUIREMENTS.md` does **not** currently define any of them. Planning should treat the following as working descriptions until `REQUIREMENTS.md` is updated in Wave 0.

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-23 | Coverage status for tracked SDK symbols is derived from runtime symbol execution evidence, not a hand-authored symbol-to-test-file attribution map. | Replace `EVIDENCE_MAP` with runtime evidence emitted from shared SDK helper/proxy seams; keep manifest enumeration and report generation. |
| INFRA-24 | Conformance claims are limited to behavior that is actually value-checked or exact-compared; structural-only suites are reported as structural smoke, not 1:1 proof. | Add exact/value checks to deterministic seams, keep structural mode for non-deterministic success paths, and relabel suite/report output accordingly. |
| INFRA-25 | Verification docs, gates, and traceability artifacts align with what is actually proven right now, including freshness of evidence and the real breadth of conformance coverage. | Update `REQUIREMENTS.md`, traceability, drift gate output, coverage metadata, and active planning/verification docs to remove overclaims. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | `^3.0.0` | SDK verification project and JSON reporter | Already drives `pnpm test:sdk` and emits the evidence file the pipeline consumes. |
| `tsx` | `^4.0.0` | Run coverage/drift scripts | Already powers `coverage:generate` and `drift:check`. |
| `@dtu/conformance` | workspace | Comparator, runner, suite typing | All conformance truthfulness changes land here or in suite definitions. |
| `@shopify/admin-api-client` | `1.1.1` | Shopify low-level client surface under test | Current coverage-report entries already target this manifest. |
| `@shopify/shopify-api` | `12.3.0` | Shopify higher-level client surface under test | Shared helpers already centralize most access to this package. |
| `@slack/web-api` | `7.14.1` | Slack WebClient surface under test | Shared `createSlackClient()` helper is the main runtime seam. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` / `node:path` | built-in | Write raw runtime evidence and generated report artifacts | Evidence recorder and report generator. |
| `Proxy` / function wrapping | built-in | Runtime symbol hit capture without patching every test title | Shared helper factories and direct-call exceptions. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Runtime evidence from helper/proxy seams | Parse test titles or filenames into symbol hits | Still manual, brittle, and not actual execution evidence. |
| Tight targeted exact/value checks | Convert the entire conformance suite to exact mode | Too broad; most success-path responses are intentionally non-deterministic. |
| Updating every historical planning artifact | Update only active truth consumers | Tighter scope and lower churn; Phase 40 should fix the live story, not rewrite archive history. |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure

```text
tests/sdk-verification/
├── coverage/
│   ├── generate-report-evidence.ts     # rewrite to consume runtime symbol evidence
│   ├── vitest-evidence.json            # still records which test files passed
│   ├── coverage-report.json            # generated truth report
│   ├── runtime-evidence.ts             # new recorder API
│   └── runtime-evidence.json           # new raw symbol-hit artifact
├── helpers/
│   ├── shopify-client.ts               # helper-level instrumentation seam
│   ├── shopify-rest-client.ts          # helper-level instrumentation seam
│   ├── shopify-api-client.ts           # helper-level instrumentation seam
│   └── slack-client.ts                 # helper-level instrumentation seam
└── setup/
    └── global-setup.ts                 # initialize / flush runtime evidence per run

packages/conformance/
├── src/
│   ├── comparator.ts                   # keep exact vs structural semantics honest
│   ├── runner.ts                       # report proof mode truthfully
│   └── types.ts                        # suite/test proof metadata
└── test/
    └── comparator.test.ts              # extend value/exact truth tests

twins/*/conformance/
├── index.ts                            # suite inventory and reporting language
├── normalizer.ts                       # compareValueFields only where justified
└── suites/*.conformance.ts             # deterministic error seams upgraded to exact/value checks

.planning/
├── REQUIREMENTS.md                     # define INFRA-23..25 and traceability
└── STATE.md / phase verification docs  # active truth consumers only
```

### Pattern 1: Record Runtime Symbol Hits at the Shared Helper Seam

**What:** Instrument the shared SDK helper factories instead of trying to infer symbol coverage from filenames. In this repo, most SDK-facing tests already pass through:

- `tests/sdk-verification/helpers/shopify-client.ts`
- `tests/sdk-verification/helpers/shopify-rest-client.ts`
- `tests/sdk-verification/helpers/shopify-api-client.ts`
- `tests/sdk-verification/helpers/slack-client.ts`

**Why:** Those files centralize client creation for the vast majority of SDK tests. That makes them the narrowest viable seam for real symbol execution evidence.

**Recommended recorder contract:**

```typescript
type RuntimeSymbolHit = {
  symbol: string;          // manifest key, e.g. "@slack/web-api@7.14.1/WebClient.chat.postMessage"
  testFile: string;        // relative path under tests/sdk-verification/
  testName?: string;       // optional current assertion name
  timestamp: string;
};
```

**Attribution rule:** Prefer current Vitest state for `testFile`; use a stack-trace fallback for module-scope helper calls where the client is created before the test body runs. This is necessary because several Shopify tests create the shared client at module scope.

### Pattern 2: Keep File-Pass Evidence, But Join It With Runtime Symbol Evidence

**What:** `vitest-evidence.json` should remain the source of truth for which test files actually ran and passed. The new runtime evidence artifact should answer a different question: which manifest symbols were actually exercised.

**Why:** These are separate truth problems:

- `vitest-evidence.json` proves a file passed.
- runtime evidence proves a symbol was executed.

Phase 40 should join them rather than replace one with the other.

**Recommended generator logic:**

1. Build `passedFiles` from `vitest-evidence.json` exactly as today.
2. Build `symbol -> evidenceFiles[]` from `runtime-evidence.json`.
3. Mark a symbol `live` only when at least one evidence file for that symbol is in `passedFiles`.
4. Persist all evidence files for that symbol, not a single hand-picked file.

### Pattern 3: Use Narrow Exact/Value Checks for Deterministic Conformance Seams

**What:** Keep structural comparison for non-deterministic success responses, but promote deterministic error responses to exact or explicit value checks.

**Why:** The current conformance suite breadth is limited, so the honest move is not "make everything exact." The honest move is "tighten the endpoints whose values are supposed to be fixed."

**Best immediate candidates from current suites:**

- `twins/slack/conformance/suites/oauth.conformance.ts`
  - invalid code
  - missing code
- `twins/slack/conformance/suites/chat.conformance.ts`
  - missing channel
  - missing text
- `twins/slack/conformance/suites/conversations.conformance.ts`
  - missing auth
- `twins/slack/conformance/suites/users.conformance.ts`
  - unknown user

For those seams, the meaningful truth is the `ok/error` value pair, not just shape.

### Pattern 4: Separate "Structural Smoke" From "Parity Proof" In Reports

**What:** The runner, suite index files, and verification docs should distinguish:

- exact/value-checked parity
- structural smoke
- twin-only smoke

**Why:** `pnpm --filter @dtu/twin-shopify conformance:twin` and `pnpm --filter @dtu/twin-slack conformance:twin` are useful, but the current suite inventory does not justify milestone-wide "1:1 behavior" language.

**Recommended report language:**

- "`conformance:twin` passed" = structural consistency smoke for the suite inventory
- "`exact/value-checked seams passed`" = stronger parity claim for specific endpoints only

### Pattern 5: Fix Active Truth Consumers First

**What:** Update the docs and gates that are still read during planning and verification now:

- `REQUIREMENTS.md`
- `STATE.md`
- current milestone audit/phase verification language that is still being referenced
- `coverage-report.json` metadata and drift output text

**Why:** Tight scope. Phase 40 should correct the live narrative, not rewrite every archived summary.

## Recommended Plan Decomposition

### Plan 40-01: Requirement Definitions and Wave 0 Truth Contracts

**Goal:** Make the planning and verification surface honest before implementation starts.

**Files:**
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md` (only if requirement text needs alignment)
- new/extended tests for truth contracts

**Tasks:**
- Define `INFRA-23`, `INFRA-24`, and `INFRA-25` in `REQUIREMENTS.md`.
- Add traceability rows mapping them to Phase 40.
- Add Wave 0 RED tests for:
  - runtime symbol evidence file generation
  - stale evidence rejection
  - deterministic conformance error/value expectations
- Inventory direct SDK call sites that bypass shared helpers; keep that exception list explicit.

### Plan 40-02: Replace `EVIDENCE_MAP` With Runtime Symbol Evidence

**Goal:** Remove hand-authored symbol attribution from the live/deferred decision path.

**Files:**
- `tests/sdk-verification/coverage/generate-report-evidence.ts`
- new `tests/sdk-verification/coverage/runtime-evidence.ts`
- `tests/sdk-verification/helpers/shopify-client.ts`
- `tests/sdk-verification/helpers/shopify-rest-client.ts`
- `tests/sdk-verification/helpers/shopify-api-client.ts`
- `tests/sdk-verification/helpers/slack-client.ts`
- small number of direct-call exception files (Bolt/OIDC/manual `new WebClient(...)` call sites)
- `tests/sdk-verification/setup/global-setup.ts`

**Tasks:**
- Emit runtime symbol hits keyed to manifest symbol IDs.
- Capture `testFile` from current Vitest state when possible, with stack fallback for module-scope helper invocations.
- Generate `coverage-report.json` from manifests + runtime evidence + passed test files.
- Replace single `testFile` attribution with truthful `evidenceFiles[]` data; keep backward compatibility only if a downstream consumer requires it.

### Plan 40-03: Tighten Conformance Proof Boundaries

**Goal:** Ensure conformance output only claims the kind of proof that actually exists.

**Files:**
- `packages/conformance/src/runner.ts`
- `packages/conformance/src/types.ts`
- `packages/conformance/test/comparator.test.ts`
- `twins/slack/conformance/index.ts`
- `twins/shopify/conformance/index.ts`
- targeted suite files under `twins/slack/conformance/suites/`
- normalizer files only where specific value fields are justified

**Tasks:**
- Promote deterministic Slack error cases to `comparisonMode: 'exact'` or explicit `compareValueFields`.
- Keep structural mode for success paths that are intentionally non-deterministic.
- Replace legacy suite/report wording that implies full parity proof.
- Retag legacy suite requirement IDs or mark them as legacy so current reports stop implying milestone requirement coverage from old `SHOP-01` / `SLCK-01` tags.

### Plan 40-04: Align Gates and Active Docs With Actual Proof

**Goal:** Make the verification story externally truthful after the implementation lands.

**Files:**
- `tests/sdk-verification/drift/check-drift.ts`
- `tests/sdk-verification/coverage/coverage-report.json` metadata generation
- `.planning/STATE.md`
- current phase/milestone verification docs that are still active consumers

**Tasks:**
- Make `drift:check` fail on stale runtime evidence or stale `vitest-evidence.json`.
- Ensure the documented command path always regenerates evidence before drift evaluation.
- Update active verification/docs to say:
  - runtime symbol evidence is real runtime evidence
  - `conformance:twin` is a narrow structural smoke unless exact/value proof is explicitly called out
  - Phase 40 closed the truthfulness gap for the current proof surface, not universal parity

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Symbol coverage inference | Regexes over test names or filenames | Runtime symbol recorder at shared helper/proxy seam | Test titles are still manual metadata, not execution evidence. |
| Whole-suite exact comparison | Blanket deep-equal for all conformance responses | Exact/value checks only for deterministic seams | Success paths still contain legitimate non-determinism. |
| Freshness trust | Assume checked-in `vitest-evidence.json` is current | Explicit freshness gate in `check-drift.ts` | Current pipeline can preserve stale proof artifacts. |
| Broad historical doc rewrite | Editing every archived phase summary | Fix active consumers and add a clear Phase 40 truth boundary | Keeps scope tight and useful. |

**Key insight:** The existing pipeline already has three useful pieces: manifest inventory, file-pass evidence, and centralized helper seams. Phase 40 should connect those honestly, not replace them with a larger system.

## Common Pitfalls

### Pitfall 1: Freshness Illusion

**What goes wrong:** `coverage-report.json` and `vitest-evidence.json` are checked in. `drift:check` reads them as if they reflect the current run, but it does not regenerate them itself.

**Why it happens:** The evidence pipeline is split across commands, and the gate trusts artifacts on disk.

**How to avoid:** Make the gate validate freshness metadata or require a freshly generated runtime evidence artifact as input.

**Warning signs:** `coverage-report.json` still says a prior phase in its `note`/`phase` metadata; live count is unchanged after adding new tests.

### Pitfall 2: Helper-Only Instrumentation Misses Direct Constructor Calls

**What goes wrong:** A helper-based recorder covers most SDK tests, but not the few direct call sites that instantiate SDK clients without helpers.

**Why it happens:** A handful of tests still construct clients directly, especially around Bolt/OIDC/manual `new WebClient(...)` seams.

**How to avoid:** Inventory those exceptions in Wave 0 and either migrate them to helpers or wrap them explicitly.

**Warning signs:** A symbol is visibly exercised in a passing test but remains `deferred` in the generated report.

### Pitfall 3: One Exact Test Does Not Justify a Global Parity Claim

**What goes wrong:** The presence of some exact/value-checked conformance cases is used to justify milestone-wide "1:1" language.

**Why it happens:** Current conformance suite counts are easy to summarize and easy to over-interpret.

**How to avoid:** Report proof class by seam: exact/value-checked vs structural smoke.

**Warning signs:** Verification docs say "1:1 behavior" while suite files still mostly use structural mode and legacy requirement IDs.

### Pitfall 4: Missing Requirement Definitions Block Honest Verification

**What goes wrong:** `ROADMAP.md` assigns `INFRA-23..25` to Phase 40, but `REQUIREMENTS.md` has no matching definitions or traceability rows.

**Why it happens:** Phase 40 was added after the current requirements snapshot.

**How to avoid:** Make requirement definition/traceability the first plan.

**Warning signs:** Planner/verifier artifacts have to invent descriptions ad hoc.

## Code Examples

### Runtime Evidence Recorder at the Slack Helper Seam

```typescript
// Source pattern: tests/sdk-verification/helpers/slack-client.ts
import { WebClient } from '@slack/web-api';
import { recordSymbolHit } from '../coverage/runtime-evidence.js';

export function createSlackClient(token?: string): WebClient {
  const slackApiUrl = process.env.SLACK_API_URL!;
  const client = new WebClient(token ?? 'xoxb-test-token', {
    slackApiUrl: slackApiUrl.replace(/\/$/, '') + '/api/',
  });

  const originalApiCall = client.apiCall.bind(client);
  client.apiCall = async (method, options) => {
    recordSymbolHit(`@slack/web-api@7.14.1/WebClient.${method}`);
    return originalApiCall(method, options);
  };

  return client;
}
```

**Why this fits the repo:** `createSlackClient()` is already the main helper used by the Slack SDK verification files.

### Proxy the Shopify Low-Level Client Instead of Mapping Test Files By Hand

```typescript
// Source pattern: tests/sdk-verification/helpers/shopify-client.ts
import { createAdminApiClient } from '@shopify/admin-api-client';
import { recordSymbolHit } from '../coverage/runtime-evidence.js';

export function createShopifyClient(options: { accessToken: string; apiVersion?: string }) {
  recordSymbolHit('@shopify/admin-api-client@1.1.1/createAdminApiClient');
  const client = createAdminApiClient(/* existing config */);

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          recordSymbolHit(`@shopify/admin-api-client@1.1.1/AdminApiClient.${String(prop)}`);
          return value.apply(target, args);
        };
      }
      return value;
    },
  });
}
```

**Why this fits the repo:** the helper already centralizes low-level Shopify client creation and request host rewriting.

### Tighten Deterministic Conformance Errors Without Broadening the Suite

```typescript
// Source pattern: twins/slack/conformance/suites/oauth.conformance.ts
{
  id: 'oauth-access-invalid-code',
  name: 'POST oauth.v2.access with invalid code returns invalid_code error',
  category: 'oauth',
  comparisonMode: 'exact',
  operation: {
    method: 'POST',
    path: '/api/oauth.v2.access',
    headers: {
      authorization: '',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'code=invalid-conformance-test-code',
  },
}
```

**Why this fits the repo:** this endpoint already has a deterministic error contract in the existing suite; Phase 40 should make the proof exact rather than merely structural.

## State of the Art

| Old Approach | Current Approach | Current Weakness | Phase 40 Target |
|--------------|------------------|------------------|-----------------|
| `LIVE_SYMBOLS` hand map | `EVIDENCE_MAP` + passed test files from Vitest JSON | Symbol attribution is still hand-authored; only file pass/fail is execution-derived | Runtime symbol hits joined with passing test files |
| `conformance:twin` self-comparison | twin-mode second-call structural consistency | Structural suite breadth is still narrow and overclaimed in docs | Structural smoke reported honestly; deterministic seams upgraded to exact/value proof |
| No Phase 40 infra requirements | roadmap-only `INFRA-23..25` | Planner/verifier lack formal requirement definitions | `REQUIREMENTS.md` defines and traces Phase 40 infra truth requirements |

**Deprecated/outdated:**

- Single-file symbol attribution as the basis for "live" coverage is no longer sufficient for Phase 40.
- Global "1:1 behavior" language for current conformance scripts is too broad for the actual suite inventory.

## Open Questions

1. **Should `coverage-report.json` keep a singular `testFile` field?**
   - What we know: runtime truth can produce multiple evidence files per symbol.
   - What's unclear: whether any downstream consumer requires a singular field.
   - Recommendation: add `evidenceFiles: string[]`; keep `testFile` only as a compatibility alias if something still reads it.

2. **How many direct SDK call sites bypass shared helpers?**
   - What we know: most tests use shared helpers; a small number of direct `WebClient`/Bolt-style call sites remain.
   - What's unclear: the exact exception count after a full Wave 0 inventory.
   - Recommendation: inventory them first; if the set is small, wrap or migrate only those files instead of adding global monkeypatching.

3. **Which historical docs actually need correction in Phase 40?**
   - What we know: active truth consumers are `REQUIREMENTS.md`, `STATE.md`, current verification docs, drift output, and coverage metadata.
   - What's unclear: whether any external consumer reads archived phase summaries as live truth.
   - Recommendation: correct active consumers only; avoid archive churn unless a current command or workflow still reads an old artifact.

## Validation Architecture

`workflow.nyquist_validation` is not explicitly disabled in `.planning/config.json`, so validation planning is in scope.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^3.0.0` |
| Config file | `tests/sdk-verification/vitest.config.ts`; `packages/conformance/vitest.config.ts`; root `vitest.config.ts` |
| Quick run command | `pnpm vitest run packages/conformance/test/comparator.test.ts tests/sdk-verification/sdk/slack-chat.test.ts tests/sdk-verification/sdk/slack-conversations.test.ts tests/sdk-verification/sdk/slack-users.test.ts tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts` |
| Full suite command | `pnpm test && pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-23 | Only symbols actually executed in passing tests become `live` | integration/script | `pnpm vitest run tests/sdk-verification/coverage/runtime-evidence.test.ts -x` | ❌ Wave 0 |
| INFRA-24 | Deterministic conformance seams fail on value drift; structural smoke is labeled honestly | unit + integration | `pnpm vitest run packages/conformance/test/comparator.test.ts tests/sdk-verification/sdk/slack-chat.test.ts tests/sdk-verification/sdk/slack-conversations.test.ts tests/sdk-verification/sdk/slack-users.test.ts -x` | ❌ Wave 0 |
| INFRA-25 | Drift/coverage/docs reject stale evidence and report only proven scope | integration/script | `pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run packages/conformance/test/comparator.test.ts tests/sdk-verification/sdk/slack-chat.test.ts tests/sdk-verification/sdk/slack-conversations.test.ts tests/sdk-verification/sdk/slack-users.test.ts tests/sdk-verification/sdk/shopify-admin-graphql-client.test.ts tests/sdk-verification/sdk/shopify-admin-rest-client.test.ts`
- **Per wave merge:** `pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check`
- **Phase gate:** `pnpm test && pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin`

### Wave 0 Gaps

- [ ] `tests/sdk-verification/coverage/runtime-evidence.test.ts` — proves runtime symbol-hit capture and join against passed test files for `INFRA-23`
- [ ] `tests/sdk-verification/coverage/report-truthfulness.test.ts` — proves stale/manual-only symbols stay `deferred`
- [ ] `packages/conformance/test/comparator.test.ts` additions — exact/value checks for deterministic error seams and proof-class labeling for `INFRA-24`
- [ ] `tests/sdk-verification/coverage/runtime-evidence.ts` — shared recorder used by helper instrumentation
- [ ] `REQUIREMENTS.md` updates — formal definitions and traceability rows for `INFRA-23`, `INFRA-24`, and `INFRA-25`

## Sources

### Primary (HIGH confidence)

- `.planning/ROADMAP.md` - Phase 40 goal, dependencies, and roadmap-only requirement IDs
- `.planning/REQUIREMENTS.md` - confirmed absence of `INFRA-23`, `INFRA-24`, and `INFRA-25`
- `.planning/STATE.md` - current milestone status and active Phase 40 context
- `.planning/v1.2-MILESTONE-AUDIT.md` - original truthfulness findings and audit framing
- `tests/sdk-verification/coverage/generate-report-evidence.ts` - current file-pass-gated `EVIDENCE_MAP` implementation
- `tests/sdk-verification/drift/check-drift.ts` - current live-count gate and artifact trust model
- `tests/sdk-verification/coverage/coverage-report.json` - current generated report metadata and schema
- `tests/sdk-verification/coverage/vitest-evidence.json` - current passing-file evidence shape
- `tests/sdk-verification/helpers/shopify-client.ts` - centralized Shopify admin GraphQL client helper seam
- `tests/sdk-verification/helpers/shopify-rest-client.ts` - centralized Shopify admin REST client helper seam
- `tests/sdk-verification/helpers/shopify-api-client.ts` - centralized `@shopify/shopify-api` helper seam
- `tests/sdk-verification/helpers/slack-client.ts` - centralized Slack WebClient helper seam
- `tests/sdk-verification/setup/global-setup.ts` - shared SDK verification run lifecycle
- `packages/conformance/src/comparator.ts` - current exact vs structural semantics
- `packages/conformance/src/runner.ts` - current twin/live/offline execution semantics
- `packages/conformance/src/types.ts` - current suite/test comparison contract
- `packages/conformance/test/comparator.test.ts` - current comparator proof surface
- `twins/shopify/conformance/index.ts` - actual Shopify conformance suite breadth
- `twins/slack/conformance/index.ts` - actual Slack conformance suite breadth
- `twins/shopify/conformance/normalizer.ts` - current Shopify value-check coverage
- `twins/slack/conformance/normalizer.ts` - current Slack value-check coverage
- `twins/shopify/conformance/suites/*.conformance.ts` - actual Shopify endpoint coverage and proof mode
- `twins/slack/conformance/suites/*.conformance.ts` - actual Slack endpoint coverage and proof mode

### Secondary (MEDIUM confidence)

- None needed; the planning questions are resolved from in-repo sources.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - all versions, scripts, and seams are directly confirmed from repo files.
- Architecture: HIGH - helper concentration, generator behavior, and conformance suite breadth are directly observed.
- Pitfalls: HIGH - each pitfall is present in current code, artifacts, or active planning docs.

**Research date:** 2026-03-14
**Valid until:** 2026-03-21
