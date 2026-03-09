# Pitfalls Research

**Domain:** Literal official-SDK conformance for service twins
**Researched:** 2026-03-09
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: README Coverage Pretending to Be Surface Coverage

**What goes wrong:**
The team tests only README or docs examples and believes the package is covered.

**Why it happens:**
Package landing pages are much easier to read than source exports, especially for Slack and Shopify.

**How to avoid:**
Generate inventories from the cloned package source and treat the manifest as the only valid coverage ledger.

**Warning signs:**
- The number of tested methods is much smaller than the source export tree
- New package versions ship without manifest changes
- "Supported methods" lives only in prose

**Phase to address:**
Phase 13

---

### Pitfall 2: Repo Mirror and Installed Package Drift

**What goes wrong:**
The submodule ref says one thing, `package.json` or the lockfile says another, and the test suite is no longer validating the same code that was inventoried.

**Why it happens:**
Teams update npm dependencies or submodule refs independently.

**How to avoid:**
Record package version + commit SHA together and fail CI when manifests are not regenerated after either one changes.

**Warning signs:**
- Coverage files mention a different version than the installed package
- Tests start failing with shape differences after dependency bumps
- Team members cannot answer which upstream commit the current suite targets

**Phase to address:**
Phase 13 and Phase 20

---

### Pitfall 3: False Positives from Mocked Transport Paths

**What goes wrong:**
Tests pass because the SDK's network layer, cookie behavior, or receiver implementation was bypassed.

**Why it happens:**
Mocking is faster than standing up the transport the package actually uses.

**How to avoid:**
Run the official SDK packages against live loopback HTTP/WebSocket endpoints and reserve mocking for narrow local-only helpers.

**Warning signs:**
- Tests replace `fetch`, `axios`, or Bolt receiver internals globally
- OAuth tests never observe real redirects, cookies, or callback requests
- Socket mode tests never open a WebSocket

**Phase to address:**
Phase 14, Phase 19, and Phase 20

---

### Pitfall 4: Underestimating the Shopify Surface Explosion

**What goes wrong:**
Planning assumes Shopify means only GraphQL Admin calls, but `@shopify/shopify-api` also requires auth/session/utils/webhooks/billing/flow/fulfillment-service and dozens of REST resource classes.

**Why it happens:**
The current twin is GraphQL-heavy, so the existing implementation biases the team toward the smaller surface.

**How to avoid:**
Treat Shopify work as multiple phases: low-level clients first, then platform helpers, then versioned REST resources and related endpoints.

**Warning signs:**
- The roadmap has only one Shopify phase for this milestone
- Billing or Storefront work is missing from requirements
- REST resource class coverage is not tracked separately

**Phase to address:**
Phase 15, Phase 16, and Phase 17

---

### Pitfall 5: Missing Bolt's Hidden Transport Surface

**What goes wrong:**
Slack HTTP events work, but Bolt still fails because request verification, response_url handling, ack timing, or alternate receivers do not behave like Slack expects.

**Why it happens:**
Bolt's public surface is broader than "event callback plus button click".

**How to avoid:**
Plan explicit coverage for `App`, HTTP/Express receivers, OAuth integration, `SocketModeReceiver`, and `AwsLambdaReceiver`.

**Warning signs:**
- Bolt tests cover only `app.event()` with an HTTP receiver
- No WebSocket broker exists for Socket Mode
- Receiver-specific tests share no common harness or never assert ack timing

**Phase to address:**
Phase 19 and Phase 20

---

### Pitfall 6: Slack Method Count Makes Manual Authoring Collapse

**What goes wrong:**
The team tries to hand-write every `@slack/web-api` method test and stalls long before completion.

**Why it happens:**
Source shows 274 bound API calls before counting helper flows.

**How to avoid:**
Generate method-family inventories and group implementation around shared semantics such as auth, pagination, file upload, admin, views, and workflows.

**Warning signs:**
- New tests are added method by method with no generated matrix
- Failure triage becomes impossible because everything lives in one file
- Coverage percentage stops moving while test file count grows

**Phase to address:**
Phase 18

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-written allowlist of "supported" methods | Fast initial planning | Guarantees drift and missed methods | Never |
| Keeping upstream clones outside the repo | Avoids submodule setup work | Makes source refs invisible to reviewers and CI | Only during early research, not for implementation |
| Marking hard SDK cases as permanent `skip` tests | Unblocks short-term progress | Hides gaps and makes "full literal scope" false | Only as temporary issue markers with explicit phase ownership |
| Reusing old partial conformance suites as proof of full coverage | Saves time | Produces a misleading completion signal | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Shopify OAuth + session helpers | Testing raw token exchange only | Validate the helper flows that create, decode, and retrieve session IDs too |
| Shopify webhooks | Checking only payload shape | Validate HMAC headers, topic routing, and helper processing/validation behavior |
| Shopify billing | Treating billing as unrelated to twin fidelity | Implement the GraphQL/payment flows `shopify-api` expects, not just placeholder endpoints |
| Slack OAuth | Ignoring cookies and state verification | Exercise `InstallProvider` end to end with state store and callback handlers |
| Slack Bolt receivers | Testing only HTTPReceiver | Cover Express, Socket Mode, and AWS Lambda receiver contracts separately |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One giant serial SDK suite | Long feedback loops, hard triage | Split suites by package family and share seeded twin instances | Hundreds of symbols |
| Booting a fresh twin per symbol | Slow tests, flaky ports | Reuse long-lived app instances with deterministic reset hooks | Low hundreds of cases |
| Recomputing inventories in every test run | Slow local iteration | Regenerate manifests only when refs or package versions change | Any medium-sized suite |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Disabling signature validation in Bolt or Shopify tests | Misses critical auth behavior | Keep signing/HMAC verification active in end-to-end suites |
| Checking real upstream secrets into test fixtures | Credential exposure | Use local twin secrets and ephemeral test credentials only |
| Turning off OAuth state validation for convenience | CSRF semantics are no longer tested | Use proper state store/cookie flows in the harness |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Coverage reports that list only failures | Developers cannot see what is already proven | Publish per-symbol pass/fail/owner status |
| Generated tests with opaque names | Failures are hard to map back to SDK surface | Name cases by package, symbol, version, and capability group |
| Large phases without gap reports | Progress feels random and unmeasurable | Group work by package family and manifest ownership |

## "Looks Done But Isn't" Checklist

- [ ] **SDK mirrors:** submodules exist, but pinned package versions are not recorded alongside commit SHAs
- [ ] **Coverage manifests:** generated once, but not wired into CI drift detection
- [ ] **Shopify support:** GraphQL passes, but REST resources, billing, or Storefront client still fail
- [ ] **Slack support:** core chat/conversations pass, but admin/files/views/workflows families are untested
- [ ] **Bolt support:** HTTP events pass, but Express/Socket Mode/AWS receivers are missing
- [ ] **Verification:** old HMAC/timing/UI checks still live outside the main SDK harness

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Drift between submodule refs and packages | MEDIUM | Regenerate manifests, align refs/versions, rerun coverage gate |
| Hidden unsupported method families | HIGH | Add manifest grouping, split roadmap by capability family, close the gaps visibly |
| Mock-heavy tests giving false confidence | HIGH | Replace mocks with live harnesses and rerun the affected suites end to end |
| Bolt receiver mismatches | HIGH | Isolate receiver harnesses and validate each receiver contract independently |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| README coverage masquerading as full coverage | Phase 13 | Manifest includes every public symbol from source |
| Repo/package drift | Phase 13 and Phase 20 | CI fails on ref/version/manifest mismatch |
| Mocked transport false positives | Phase 14 | Official SDK suites hit live local transports |
| Shopify surface underestimation | Phase 15-17 | Shopify requirements mapped by client/platform/resource layers |
| Bolt hidden transport surface | Phase 19-20 | Receiver-specific suites pass against dedicated harnesses |
| Slack manual authoring collapse | Phase 18 | Generated matrix covers all method families |

## Sources

- `/tmp/gsd-sdk-research/shopify-app-js`
- `/tmp/gsd-sdk-research/node-slack-sdk`
- `/tmp/gsd-sdk-research/bolt-js`
- Existing `.planning/phases/12-manual-verification/` plan and research documents

---
*Pitfalls research for: literal SDK conformance*
*Researched: 2026-03-09*
