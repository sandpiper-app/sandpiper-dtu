---
phase: 13
slug: upstream-sdk-mirrors-surface-inventory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (root workspace) |
| **Config file** | Root `vitest.config.ts` (projects: packages/*, twins/*, tests/*) |
| **Quick run command** | `git submodule status && pnpm list ts-morph --depth=0` |
| **Full suite command** | `npx tsx tools/sdk-surface/inventory/run-inventory.ts` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `git submodule status && pnpm list ts-morph --depth=0`
- **After every plan wave:** Run `npx tsx tools/sdk-surface/inventory/run-inventory.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | INFRA-10 | structural | `git submodule status` (exit 0) | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | INFRA-10 | structural | `node -e "JSON.parse(require('fs').readFileSync('third_party/sdk-pins.json'))"` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | INFRA-11, INFRA-16 | automated | `npx tsx tools/sdk-surface/inventory/run-inventory.ts` (throws on count failure) | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | INFRA-11 | structural | `ls tools/sdk-surface/manifests/*.json \| wc -l` (expect 5) | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 1 | INFRA-10 | CI check | `grep -q 'submodules: recursive' .github/workflows/conformance.yml` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 1 | — | structural | `grep -q "tests/\\*" vitest.config.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `third_party/upstream/` directories — created by `git submodule add` commands
- [ ] `.gitmodules` — created by `git submodule add` commands
- [ ] `third_party/sdk-pins.json` — version lock file (hand-authored after submodule setup)
- [ ] `tools/sdk-surface/inventory/walk-exports.ts` — core ts-morph walker
- [ ] `tools/sdk-surface/inventory/run-inventory.ts` — CLI entrypoint
- [ ] `tools/sdk-surface/manifests/` — created by running the inventory generator
- [ ] CI: `submodules: recursive` in `conformance.yml` and `e2e.yml`
- [ ] Root `vitest.config.ts`: add `tests/*` to projects array
- [ ] Vitest alignment: twin packages updated from `^2.1.8` to `^3.0.0`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fork repos exist on GitHub | INFRA-10 | Requires GitHub UI/API check | Verify fork URLs in `.gitmodules` are accessible |
| sdk-pins.json SHAs match version tags | INFRA-10 | Requires cross-referencing upstream release tags | Check each SHA in `sdk-pins.json` against upstream release tags |
| ts-morph used (not raw TS API) | INFRA-16 | Code review | Inspect `walk-exports.ts` imports for `ts-morph` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
