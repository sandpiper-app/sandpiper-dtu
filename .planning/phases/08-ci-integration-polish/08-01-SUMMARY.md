---
phase: 08-ci-integration-polish
plan: 01
subsystem: ci-conformance-cleanup
status: complete
started: 2026-03-01
completed: 2026-03-01
duration_minutes: 3
tasks_completed: 2
files_modified: 12
files_created: 1
requirements_completed: [INFRA-06, INFRA-09]
tags: [ci, conformance, dead-code-removal, admin-api, documentation]
dependency_graph:
  requires: []
  provides: [slack-conformance-ci, dtu-core-removed, slack-error-admin-api, phase5-requirements-traced]
  affects: [conformance-workflow, slack-twin]
tech_stack:
  added: []
  patterns: [separate-ci-jobs-per-twin, per-method-error-simulation]
key_files:
  created:
    - twins/slack/src/plugins/errors.ts
  modified:
    - .github/workflows/conformance.yml
    - tsconfig.base.json
    - twins/shopify/package.json
    - twins/shopify/tsconfig.json
    - twins/slack/package.json
    - twins/slack/tsconfig.json
    - twins/example/package.json
    - twins/example/tsconfig.json
    - twins/slack/src/index.ts
    - .planning/phases/05-slack-twin-web-api-events/05-01-SUMMARY.md
    - .planning/phases/05-slack-twin-web-api-events/05-02-SUMMARY.md
    - .planning/phases/05-slack-twin-web-api-events/05-03-SUMMARY.md
  deleted:
    - packages/core/ (directory, 3 files)
key_decisions:
  - Separate CI jobs for Shopify vs Slack conformance so failures are independently visible
  - No ErrorSimulator class for Slack — uses existing per-method inline getErrorConfig() checks
  - GET /admin/errors uses direct SQL on slackStateManager.database (no additional state manager method needed)
---

# Phase 8 Plan 01: CI Integration Polish Summary

Closed five integration gaps from the v1.0 audit: Slack conformance in CI, dead @dtu/core removal, Slack error config admin API, and Phase 5 documentation traceability.

## What Was Built

### Task 1: Slack conformance in CI + @dtu/core removal (commit: 897b231)

Added `conformance-twin-slack` as a separate job in `.github/workflows/conformance.yml` alongside the existing Shopify job. The two jobs run independently so failures are scoped to each twin. Renamed the existing Shopify job display name to "Shopify Twin Conformance" for clarity.

Fully removed the `@dtu/core` stub package which had no actual consumers in the codebase:
- Deleted `packages/core/` directory (3 files: package.json, src/index.ts, tsconfig.json)
- Removed `@dtu/core` path alias from `tsconfig.base.json`
- Removed `@dtu/core: workspace:*` dependency from shopify, slack, and example twins' package.json
- Removed `{ path: ../../packages/core }` tsconfig reference from all three twins' tsconfig.json
- Regenerated `pnpm-lock.yaml` via `pnpm install`

`pnpm build` succeeds cleanly. 236/237 tests pass (1 pre-existing flaky DLQ timing test unchanged).

### Task 2: Slack error config admin API + Phase 5 SUMMARY frontmatter (commit: 3b0eb48)

Created `twins/slack/src/plugins/errors.ts` with three admin endpoints that expose the Slack twin's existing error simulation infrastructure to the HTTP surface:
- `POST /admin/errors/configure` — creates or replaces error config for a Web API method name
- `GET /admin/errors` — lists all configured error configs via direct SQL on `slackStateManager.database`
- `POST /admin/errors/clear` — removes all configs via `slackStateManager.clearErrorConfigs()`

Registered `slackErrorsPlugin` in `twins/slack/src/index.ts` after `adminPlugin`.

Added `requirements_completed` to Phase 5 SUMMARY frontmatter files:
- `05-01-SUMMARY.md`: SLCK-03 (OAuth token exchange)
- `05-02-SUMMARY.md`: SLCK-01, SLCK-04, SLCK-06 (Web API methods, rate limiting, Block Kit)
- `05-03-SUMMARY.md`: SLCK-02, SLCK-05 (Events API, Interactions)

## Decisions Made

- **Separate CI jobs:** Two independent twin conformance jobs (`conformance-twin` for Shopify, `conformance-twin-slack` for Slack) rather than a matrix — pass/fail visibility per twin without conflation
- **No ErrorSimulator for Slack:** Slack twin uses per-method inline error checking (`getErrorConfig()` in each route handler). The errors.ts plugin only exposes the HTTP admin surface — no new ErrorSimulator class needed
- **Direct SQL in GET /admin/errors:** The `slackStateManager.database` getter is already exposed; a direct `SELECT * FROM slack_error_configs` query is simpler than adding a new state manager method for a single admin endpoint

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `pnpm install && pnpm build`: PASS
- `pnpm test`: 236/237 pass (1 pre-existing flaky DLQ timing test — unchanged)
- `grep -r '@dtu/core' ...`: CLEAN (zero matches in source)
- `conformance-twin-slack` job in conformance.yml: PASS
- `Shopify Twin Conformance` display name in conformance.yml: PASS
- `/admin/errors/configure` endpoint in errors.ts: PASS
- `requirements_completed` in 05-01, 05-02, 05-03 SUMMARY.md: PASS

## Self-Check: PASSED

All must_have truths verified:
- [x] Slack conformance suite runs in CI as `conformance-twin-slack` job alongside Shopify
- [x] @dtu/core fully removed (directory, path alias, dependencies, tsconfig references)
- [x] pnpm install and pnpm build succeed after @dtu/core removal
- [x] Slack twin exposes POST /admin/errors/configure, GET /admin/errors, POST /admin/errors/clear
- [x] Phase 5 SUMMARY frontmatter includes requirements_completed for SLCK-01 through SLCK-06
