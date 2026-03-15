---
phase: 41
slug: regression-closure-and-release-gate-recovery
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-14
updated: 2026-03-14
---

# Phase 41 — Validation Strategy

> Validation contract aligned to the finalized Phase 41 execution plans.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts`, `tests/sdk-verification/vitest.config.ts`, `twins/shopify/vitest.config.ts`, `twins/slack/vitest.config.ts`, `packages/conformance/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run tests/sdk-verification/sdk/shopify-regression-closure.test.ts tests/sdk-verification/sdk/slack-regression-closure.test.ts tests/sdk-verification/coverage/proof-integrity-regression.test.ts` |
| **Full suite command** | `pnpm build && pnpm --dir twins/shopify build && pnpm --dir twins/slack build && pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin && pnpm vitest run tests/sdk-verification/coverage/proof-integrity-regression.test.ts tests/sdk-verification/sdk/slack-method-coverage.test.ts` |
| **Estimated runtime** | ~420 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest affected command from the per-task map below.
- **After every plan wave:** Run the full suite command for the completed wave boundary.
- **Before `$gsd-verify-work`:** The full suite command must be green, and the active planning docs must reflect the resulting truth state.
- **Max feedback latency:** 45 seconds for task-level checks where practical; full-suite runtime is allowed only at wave boundaries and final signoff.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 0 | SHOP-17 / SHOP-18 / SHOP-20 | red contract | `OUTPUT=$(pnpm vitest run tests/sdk-verification/sdk/shopify-regression-closure.test.ts 2>&1); STATUS=$?; printf '%s\n' "$OUTPUT"; test $STATUS -ne 0 && printf '%s' "$OUTPUT" | rg -q "unsupported API version 2025-02|Product.delete\\(\\)|refreshToken|offline tokenExchange|orderUpdate preserves lineItems|InventoryLevel.adjust\\(\\)"` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 0 | INFRA-20 / SLCK-18 / SLCK-20 / SLCK-22 | red contract | `OUTPUT=$(pnpm vitest run tests/sdk-verification/sdk/slack-regression-closure.test.ts 2>&1); STATUS=$?; printf '%s\n' "$OUTPUT"; test $STATUS -ne 0 && printf '%s' "$OUTPUT" | rg -q "missing_scope|absolute upload_url|invalid_client"` | ❌ W0 | ⬜ pending |
| 41-01-03 | 01 | 0 | INFRA-19 / INFRA-23 / INFRA-24 / INFRA-25 / SLCK-14 | red contract | `OUTPUT=$(pnpm vitest run tests/sdk-verification/coverage/proof-integrity-regression.test.ts 2>&1); STATUS=$?; printf '%s\n' "$OUTPUT"; test $STATUS -ne 0 && printf '%s' "$OUTPUT" | rg -q "build script includes twin builds|shopify-api-client does not record top-level symbols at construction time|slack method coverage proof is not representative-only|deterministic proof headers"` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 1 | INFRA-19 | build | `pnpm build && pnpm --dir twins/shopify build && pnpm --dir twins/slack build` | ✅ exists | ⬜ pending |
| 41-02-02 | 02 | 1 | INFRA-23 / INFRA-25 | resilience | `pnpm vitest run tests/sdk-verification/coverage/runtime-artifact-resilience.test.ts && pnpm coverage:generate && pnpm drift:check` | ❌ W0 | ⬜ pending |
| 41-03-01 | 03 | 2 | SHOP-17 / SHOP-18 | sdk | `pnpm vitest run tests/sdk-verification/sdk/shopify-regression-closure.test.ts tests/sdk-verification/sdk/shopify-api-auth.test.ts` | ❌ W0 | ⬜ pending |
| 41-03-02 | 03 | 2 | SHOP-20 | sdk + integration | `pnpm vitest run tests/sdk-verification/sdk/shopify-regression-closure.test.ts tests/sdk-verification/sdk/shopify-behavioral-parity.test.ts -t "delete removes the product|orderUpdate preserves lineItems|InventoryLevel.adjust" && pnpm --dir twins/slack build` | ❌ W0 | ⬜ pending |
| 41-04-01 | 04 | 2 | INFRA-20 / SLCK-18 | catalog + sdk | `pnpm vitest run tests/sdk-verification/sdk/slack-scope-catalog.test.ts && pnpm vitest run tests/sdk-verification/sdk/slack-regression-closure.test.ts -t "missing_scope"` | ❌ W0 | ⬜ pending |
| 41-04-02 | 04 | 2 | SLCK-20 / SLCK-22 | sdk + docker smoke | `sh -c 'set -e; docker compose -f docker-compose.twin.yml up -d --build slack-twin; trap "docker compose -f docker-compose.twin.yml rm -sf slack-twin >/dev/null 2>&1 || true" EXIT; SLACK_API_URL=http://localhost:3001 pnpm vitest run tests/sdk-verification/sdk/slack-docker-upload-url-smoke.test.ts; pnpm vitest run tests/sdk-verification/sdk/slack-regression-closure.test.ts tests/sdk-verification/sdk/slack-webclient-base.test.ts'` | ❌ W0 | ⬜ pending |
| 41-05-01 | 05 | 3 | INFRA-23 / SLCK-14 | proof | `pnpm vitest run tests/sdk-verification/coverage/proof-integrity-regression.test.ts -t "build script includes twin builds|shopify-api-client does not record top-level symbols at construction time|slack method coverage proof is not representative-only" && pnpm vitest run tests/sdk-verification/sdk/slack-method-coverage.test.ts` | ✅ exists | ⬜ pending |
| 41-06-01 | 06 | 4 | INFRA-24 | conformance | `pnpm vitest run tests/sdk-verification/coverage/proof-integrity-regression.test.ts -t "conformance comparator preserves deterministic proof headers" && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin` | ✅ exists | ⬜ pending |
| 41-06-02 | 06 | 4 | INFRA-19 / INFRA-24 / INFRA-25 | full signoff | `node -e "const r=require('./.planning/phases/41-regression-closure-and-release-gate-recovery/41-06-signoff-receipt.json'); const ok=r.preRestore&&r.postRestore&&r.preRestore.exitCode===0&&r.postRestore.exitCode===0&&r.preRestore.docsState==='pending'&&r.postRestore.docsState==='completed'&&r.preRestore.command===r.postRestore.command&&Date.parse(r.preRestore.completedAt)<Date.parse(r.postRestore.completedAt); if(!ok) process.exit(1)" && pnpm build && pnpm --dir twins/shopify build && pnpm --dir twins/slack build && pnpm test:sdk --reporter=verbose --reporter=json --outputFile.json=tests/sdk-verification/coverage/vitest-evidence.json && pnpm coverage:generate && pnpm drift:check && pnpm --filter @dtu/twin-shopify conformance:twin && pnpm --filter @dtu/twin-slack conformance:twin && pnpm vitest run tests/sdk-verification/coverage/proof-integrity-regression.test.ts tests/sdk-verification/sdk/slack-method-coverage.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/sdk-verification/sdk/shopify-regression-closure.test.ts` — RED contracts for Shopify version, OAuth shape, delete persistence, orderUpdate, and inventory-level regressions
- [x] `tests/sdk-verification/sdk/slack-regression-closure.test.ts` — RED contracts for missing scope enforcement, strict OAuth/OIDC, and `filesUploadV2` argument/url behavior
- [x] `tests/sdk-verification/coverage/proof-integrity-regression.test.ts` — RED contracts for root build truth, runtime-evidence truth, representative-only method proof, and conformance header/value proof
- [x] Build/artifact regressions remain explicitly validated by direct CLI commands in the per-task map instead of being inferred from green tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Active planning docs only return to "complete" after the full signoff command is green | INFRA-25 | This is a timing/closeout judgment, not a product-side runtime behavior | Before marking Phase 41 complete, read `ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` and confirm they were left in the reopened/pending state during implementation and changed back to complete only after `41-06-02` passed. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit wave dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers every currently open regression cluster
- [x] No watch-mode flags
- [x] Feedback latency target is documented
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
