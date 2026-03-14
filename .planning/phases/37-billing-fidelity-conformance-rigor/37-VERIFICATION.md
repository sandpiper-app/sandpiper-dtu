---
phase: 37-billing-fidelity-conformance-rigor
verified: 2026-03-14T00:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 37: Billing Fidelity + Conformance Rigor Verification Report

**Phase Goal:** Make billing state persistent with real response shapes (lineItems, oneTimePurchases, subscription data in currentAppInstallation), and fix the conformance harness to prove 1:1 behavior — eliminate twin self-comparison in twin mode, add Slack value opt-in checks, and fix the chat conformance suite labeling.
**Verified:** 2026-03-14T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | appSubscriptionCreate returns lineItems array matching the mutation input | ✓ VERIFIED | `resolvers.ts:840-858` — `args.lineItems` stored as JSON, parsed back with full plan transform; `appSubscription.lineItems` returned (not `[]`) |
| 2 | appSubscriptionCancel returns the subscription with its lineItems | ✓ VERIFIED | `resolvers.ts:941-965` — `updated.line_items` parsed, `cancelledLineItems` in return |
| 3 | currentAppInstallation.activeSubscriptions[0].lineItems is non-empty after creating and confirming a subscription | ✓ VERIFIED | `resolvers.ts:338-359` — per-sub JSON.parse(sub.line_items), lineItems mapped and returned |
| 4 | appPurchaseOneTimeCreate creates a persistent record with a unique numeric GID each call | ✓ VERIFIED | `resolvers.ts:876-904` + `state-manager.ts:1052-1078` — two-step GID pattern with AUTOINCREMENT rowId; each call produces a distinct `gid://shopify/AppPurchaseOneTime/<n>` |
| 5 | currentAppInstallation.oneTimePurchases returns all one-time purchases for the requesting shop | ✓ VERIFIED | `resolvers.ts:363-378` — `listOneTimePurchasesByShop(context.shopDomain)` called; edges mapped from real DB rows |
| 6 | Conformance runner twin mode runs the operation twice and compares structurally — not against itself | ✓ VERIFIED | `runner.ts:97` — `baselineResponse = await this.twin.execute(test.operation)` (second call); old `baselineResponse = twinResponse` self-assignment removed |
| 7 | Twin mode comparison branch respects comparisonMode (exact vs structural) | ✓ VERIFIED | `runner.ts:117-135` — dedicated `mode === 'twin'` branch; `exact` → `compareResponses`, default → `compareResponsesStructurally` |
| 8 | Slack conformance adapter seeds broad-scope token via admin endpoint (not narrow OAuth) | ✓ VERIFIED | `twin-adapter.ts:26-61` — BROAD_SCOPE 16 scopes; `app.inject()` to `/admin/tokens` with `token/tokenType/teamId/userId/scope/appId` |
| 9 | chat-update test accurately describes what it tests (no misleading labels) | ✓ VERIFIED | `chat.conformance.ts:80-91` — test id `chat-postMessage-second`, name "POST chat.postMessage (second message in channel)", path `/api/chat.postMessage`; no `chat-update` id exists; `postMessageForUpdate` setup field removed |
| 10 | CurrencyCode scalar accepts both string and enum literal — MoneyInput works with `currencyCode: USD` | ✓ VERIFIED | `resolvers.ts:225-241` — `CurrencyCodeScalar` with `parseLiteral` handling `Kind.STRING` and `Kind.ENUM`; `schema.graphql:7` declares `scalar CurrencyCode`; `MoneyInput.currencyCode: CurrencyCode!` |
| 11 | Shopify normalizer strips extensions.cost for non-deterministic rate-limit data in twin mode | ✓ VERIFIED | `normalizer.ts:20` — `'extensions.cost'` in `stripFields` array |

**Score:** 11/11 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/sdk-verification/sdk/shopify-api-billing.test.ts` | 4 new billing tests (lineItems + oneTimePurchases RED→GREEN) | ✓ VERIFIED | Lines 132–279: 4 `it()` blocks covering returnObject lineItems, appPurchaseOneTimeCreate uniqueness, currentAppInstallation.oneTimePurchases, activeSubscriptions.lineItems |
| `packages/state/src/state-manager.ts` | line_items column migration + one_time_purchases table + CRUD methods + reset/close null-outs | ✓ VERIFIED | `one_time_purchases` DDL at lines 411–424; idempotent `ALTER TABLE app_subscriptions ADD COLUMN line_items TEXT` at lines 435–441; `createOneTimePurchaseStmt`/`listOneTimePurchasesByShopStmt` prepared at lines 559–565; `createOneTimePurchase()` and `listOneTimePurchasesByShop()` public methods at lines 1052–1084; null-outs in both `reset()` (lines 155–157) and `close()` (lines 218–220) |
| `twins/shopify/src/schema/resolvers.ts` | lineItems surfaced in billing resolvers + persistent appPurchaseOneTimeCreate + CurrencyCode scalar | ✓ VERIFIED | JSON.parse(subscription.line_items) at lines 844–858 (create), 941–955 (cancel), 338–361 (currentAppInstallation); `appPurchaseOneTimeCreate` calls `createOneTimePurchase()` at lines 876–904; `CurrencyCodeScalar` at lines 225–247 |
| `twins/shopify/src/schema/schema.graphql` | scalar CurrencyCode; MoneyV2.currencyCode and MoneyInput.currencyCode use CurrencyCode | ✓ VERIFIED | `scalar CurrencyCode` at line 7; `MoneyV2.currencyCode: CurrencyCode!` and `MoneyInput.currencyCode: CurrencyCode!` confirmed |
| `packages/conformance/src/runner.ts` | Twin-mode second-call structural comparison; offline unchanged | ✓ VERIFIED | Line 97: `baselineResponse = await this.twin.execute(test.operation)`; lines 117–135: twin branch with exact/structural split; line 136–143: offline unchanged |
| `twins/slack/conformance/adapters/twin-adapter.ts` | Broad scope token seeded via admin endpoint (16 scopes, app.inject()) | ✓ VERIFIED | Lines 26–61: BROAD_SCOPE constant with 16 scopes; `app.inject({ method: 'POST', url: '/admin/tokens', payload: { token, tokenType, teamId, userId, scope, appId } })` |
| `twins/slack/conformance/suites/chat.conformance.ts` | Accurately labeled chat-postMessage-second test (not chat-update) | ✓ VERIFIED | Lines 80–91: id `chat-postMessage-second`, name accurate, no `setup` field, path correctly `/api/chat.postMessage`; suite description updated to remove mention of chat.update |
| `twins/shopify/conformance/normalizer.ts` | extensions.cost added to stripFields | ✓ VERIFIED | Line 20: `'extensions.cost'` in stripFields |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `appSubscriptionCreate resolver` | `StateManager.createAppSubscription` | `line_items: args.lineItems` passed and stored | ✓ WIRED | `resolvers.ts:840` passes `line_items: args.lineItems`; `state-manager.ts:547` INSERT includes `line_items` column; `state-manager.ts:1012` serialises as JSON |
| `appPurchaseOneTimeCreate resolver` | `StateManager.createOneTimePurchase` | two-step GID pattern | ✓ WIRED | `resolvers.ts:878` calls `context.stateManager.createOneTimePurchase()`; `state-manager.ts:1062-1076` inserts temp GID, updates to final GID after AUTOINCREMENT resolves |
| `currentAppInstallation resolver` | `StateManager.listOneTimePurchasesByShop` | `shop_domain` from context | ✓ WIRED | `resolvers.ts:364` calls `context.stateManager.listOneTimePurchasesByShop(context.shopDomain)`; result mapped to edges array |
| `runner.ts twin mode branch` | second `twin.execute` call | `baselineResponse = await this.twin.execute(test.operation)` | ✓ WIRED | `runner.ts:97` — not self-assignment; `mode === 'twin'` branch at line 91 confirmed |
| `twin-adapter.ts` | admin token seeder endpoint | `POST /admin/tokens` with broad scope via `app.inject()` | ✓ WIRED | `twin-adapter.ts:45-57` — inject call with all 6 required fields; status check at line 58 |

---

## Requirements Coverage

Plans 37-01, 37-02, and 37-03 all declare `requirements: []`. No requirement IDs are claimed by any plan in this phase. No REQUIREMENTS.md IDs are mapped to Phase 37 (verified by phase goal description — this phase addresses internal quality/fidelity findings #11 and #12, not tracked requirements).

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scan notes:
- No `TODO`/`FIXME`/`PLACEHOLDER` comments in phase-modified files
- No `return []` or `return {}` stubs in billing resolvers — all return computed data from DB
- `lineItems: []` hardcoded stubs eliminated in all three resolver sites
- `appPurchaseOneTimeCreate` no longer returns hardcoded `id: 'gid://shopify/AppPurchaseOneTime/1'`

---

## Human Verification Required

None. All goal-critical behaviors are verifiable from the codebase:

- Resolver wiring is code-traceable (no runtime state needed to verify structure)
- Conformance runner logic is pure TypeScript — second-call pattern is visible at line 97
- Chat suite labeling is a static rename — verified in file

The following items are verifiable by running the test suite but were not run interactively (CI/test runner confirms these per commit history):
- 268/268 SDK tests GREEN (per 37-02-SUMMARY commit `5c39bde`)
- Shopify conformance:twin 10/10 (per 37-03-SUMMARY commit `3e138ea`)
- Slack conformance:twin 20/20 (per 37-03-SUMMARY commit `3e138ea`)

---

## Summary

Phase 37 goal is fully achieved. All three plans delivered their contracts:

**Plan 01 (Wave 0 RED tests):** 4 new billing test assertions were added proving Finding #11 gaps exist before implementation. All 4 are substantive integration tests hitting the live twin over HTTP/GraphQL — not compile-time stubs.

**Plan 02 (Billing fidelity implementation):** StateManager extended with `line_items` column migration and `one_time_purchases` table. All three billing resolvers (`appSubscriptionCreate`, `appSubscriptionCancel`, `currentAppInstallation`) now parse and return real lineItems from stored JSON. `appPurchaseOneTimeCreate` replaced the hardcoded stub with a two-step GID persistent record. A `CurrencyCode` scalar was added to unblock `currencyCode: USD` enum-literal input. All 4 Wave 0 tests turned GREEN.

**Plan 03 (Conformance rigor):** Conformance runner twin mode no longer self-compares — the second `await this.twin.execute()` call provides a real structural baseline. Slack conformance adapter replaced the narrow `chat:write`-only OAuth flow with a direct 16-scope admin token seed via `app.inject()`. The misleadingly-named `chat-update` test (which called `chat.postMessage`) was renamed `chat-postMessage-second` with accurate description and its irrelevant `setup` field removed. Shopify normalizer gained `extensions.cost` strip to handle non-deterministic rate-limit buckets across two independent twin-mode calls.

No gaps. No blockers. No orphaned requirements.

---

_Verified: 2026-03-14T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
