# Feature Research

**Domain:** Literal full-surface SDK conformance for Shopify and Slack twins
**Researched:** 2026-03-09
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pinned upstream SDK mirrors in-repo | Without local source mirrors, "full literal scope" is not auditable | MEDIUM | Use repo-owned forks as submodule remotes and pin exact commits. |
| Machine-generated public surface inventory | Manual inventories will miss methods and transitive exports | HIGH | Must include every targeted package export and method family. |
| Official SDK packages used directly in tests | The milestone exists to validate behavior through the real client libraries | LOW | These packages become test dependencies, not optional references. |
| Shopify low-level client compatibility | `@shopify/admin-api-client` is the first boundary app code can hit | HIGH | Source shows both GraphQL and generic REST support. |
| Shopify high-level platform compatibility | `@shopify/shopify-api` exposes auth, session, clients, billing, webhooks, flow, fulfillment-service, and REST resources | VERY HIGH | This is materially broader than the current twin. |
| Slack Web API full compatibility | `@slack/web-api` source contains 274 bound methods plus helper flows | VERY HIGH | Hand-written spot checks are not sufficient. |
| Slack OAuth compatibility | Real apps rely on `InstallProvider` semantics, not just raw token endpoints | HIGH | State cookies, redirects, stores, and callbacks all matter. |
| Slack Bolt compatibility | Bolt is the developer-facing framework for events, actions, commands, views, shortcuts, and receivers | VERY HIGH | Source shows HTTP, Express, Socket Mode, and AWS Lambda receiver support. |
| Continuous drift detection | Upstream SDKs evolve; one-time coverage is not enough | MEDIUM | CI must detect ref, version, or manifest drift. |
| Prior manual verification merged into the same harness | Old Phase 12 checks are still valid and should not remain isolated | LOW | HMAC, async timing, and UI verification should run beside SDK conformance. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Source-derived test generation | Keeps coverage aligned with the actual package surface instead of a stale checklist | HIGH | The inventory generator is the foundation for exhaustive testing. |
| Symbol-level coverage report | Makes "what is still missing?" mechanically answerable | MEDIUM | Useful for both roadmaping and CI gating. |
| Capability-gap reports grouped by package family | Turns huge SDKs into implementable work waves | MEDIUM | Especially important for Slack admin/enterprise methods and Shopify REST resources. |
| Version-aware update workflow | Lets the team safely advance pinned SDK refs without blind breakage | MEDIUM | Required if the user wants up-to-date upstream behavior over time. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| "Just test the README examples" | Feels faster than full-surface inventorying | README examples cover only a tiny fraction of the public API | Generate the surface list from source and map every symbol. |
| Silent allowlists of unsupported SDK methods | Lets the team ship partial support faster | Violates the literal-scope milestone definition and hides drift | Track temporary gaps explicitly in manifests and phase ownership until closed. |
| Patching SDK internals to point at the twin | Reduces immediate twin work | Can bypass behavior the real package enforces at runtime | Keep the official package code untouched and adapt the twin/backend instead. |
| Docs snapshots as the compatibility contract | Easier than cloning repos | Docs miss transitive exports and generated method trees | Use the cloned repos and installed package code as source of truth. |

## Feature Dependencies

```text
Pinned submodules
    └──requires──> Source inventory generator
                         └──requires──> Generated coverage manifest
                                              └──requires──> Exhaustive SDK suites
                                                                   └──requires──> Twin expansion + CI drift gate

Shopify auth/session/webhook support
    └──requires──> Shopify client compatibility
                         └──requires──> Billing / REST resource coverage

Slack OAuth support
    └──requires──> Bolt HTTP receiver compatibility
                         └──requires──> Socket Mode / alternate receiver compatibility

Hand-maintained method lists ──conflicts──> Literal full-surface milestone scope
```

### Dependency Notes

- **Pinned submodules require generated inventory:** without a generated manifest, the submodule only freezes source, it does not make the surface measurable.
- **Shopify high-level features require client compatibility first:** `shopify-api` is layered on top of client/auth/session primitives.
- **Slack OAuth requires Bolt HTTP correctness:** Bolt's install and event handling flows depend on OAuth, state, and request verification.
- **Bolt alternate receivers depend on shared listener semantics:** socket mode and AWS receiver support should reuse the same listener contract, not fork it.
- **Manual allowlists conflict with literal scope:** any hidden skip list destroys the audit trail the milestone needs.

## MVP Definition

### Launch With (v1.1)

- [ ] Pinned submodules for the targeted upstream repos, with repo URLs, package versions, and commit SHAs recorded
- [ ] Machine-generated inventory for every public export and method in the targeted packages
- [ ] Official SDK packages imported directly in workspace tests
- [ ] Shopify twin compatibility for `@shopify/admin-api-client`
- [ ] Shopify twin compatibility for the full targeted `@shopify/shopify-api` surface
- [ ] Slack twin compatibility for the full targeted `@slack/web-api` surface
- [ ] Slack twin compatibility for `@slack/oauth` and `@slack/bolt`, including receiver behavior
- [ ] CI drift and coverage gate
- [ ] Old manual verification checks merged into the same verification pipeline

### Add After Validation (v1.x)

- [ ] Automated PRs or reports when pinned SDK versions update upstream
- [ ] Multi-version conformance matrix for additional pinned API versions
- [ ] Coverage dashboards published as build artifacts for easier regression review

### Future Consideration (v2+)

- [ ] Apply the same SDK-grounded approach to future twins such as Nylas, Shippo, and Triple Whale
- [ ] Extend coverage to adjacent Slack packages not targeted in this milestone (`@slack/rtm-api`, `@slack/webhook`, standalone `@slack/socket-mode`)
- [ ] Extend coverage to Shopify app-framework packages (`shopify-app-express`, Remix, React Router) if the twin project needs them

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Upstream mirrors + inventories | HIGH | MEDIUM | P1 |
| Generated exhaustive test harness | HIGH | HIGH | P1 |
| Shopify low-level client parity | HIGH | HIGH | P1 |
| Shopify high-level `shopify-api` parity | HIGH | VERY HIGH | P1 |
| Slack WebClient parity | HIGH | VERY HIGH | P1 |
| Slack OAuth + Bolt parity | HIGH | VERY HIGH | P1 |
| CI drift gate | HIGH | MEDIUM | P1 |
| Coverage dashboards | MEDIUM | MEDIUM | P2 |
| Automated upstream update suggestions | MEDIUM | MEDIUM | P2 |
| Multi-version SDK matrix | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Current repo | Docs-only/manual approach | Our Approach |
|---------|--------------|---------------------------|--------------|
| SDK surface discovery | Small hand-written subset | Usually README examples or ad hoc curl calls | Generated directly from cloned source and package exports |
| Compatibility proof | Partial twin conformance suites | Usually sample requests only | Official SDK packages run end to end against the twins |
| Drift detection | Limited and package-specific | Usually manual spot checking | CI coverage and ref drift gate tied to pinned submodule commits |
| Verification gap handling | Old manual verification phase | Often ignored once the demo works | Merged into the same automated verification stack |

## Sources

- `/tmp/gsd-sdk-research/shopify-app-js` — package source and reference docs
- `/tmp/gsd-sdk-research/node-slack-sdk` — package source for Web API and OAuth
- `/tmp/gsd-sdk-research/bolt-js` — package source for Bolt exports, receivers, and listener APIs
- Existing Sandpiper DTU repo state — current twin surface and prior manual verification gap

---
*Feature research for: literal SDK conformance*
*Researched: 2026-03-09*
