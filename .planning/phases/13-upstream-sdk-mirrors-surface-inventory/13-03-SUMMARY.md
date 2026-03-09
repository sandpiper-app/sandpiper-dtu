---
phase: 13-upstream-sdk-mirrors-surface-inventory
plan: "03"
subsystem: infra
tags: [git-submodules, sdk-mirrors, shopify, slack, bolt, version-pinning]

# Dependency graph
requires:
  - phase: 13-01
    provides: CI workflow updated with submodule recursive checkout step

provides:
  - Three initialized git submodules at third_party/upstream/ pointing to sandpiper-app fork URLs
  - sdk-pins.json linking npm package versions to exact submodule commit SHAs for all five targeted packages
  - Upstream remotes in each submodule enabling future drift tracking against official repos

affects:
  - 14-sdk-verification-harness
  - 20-drift-detection

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repo-owned fork submodule pattern: fork lives at sandpiper-app org, upstream remote points to official source"
    - "sdk-pins.json as atomic version lock: npm version + submodule + commit + packagePath in one file"
    - "Pinned detached HEAD in submodule: checkout to exact SHA matching installed npm package version"

key-files:
  created:
    - .gitmodules
    - third_party/sdk-pins.json
  modified:
    - third_party/upstream/shopify-app-js (new submodule at 7399c4f)
    - third_party/upstream/node-slack-sdk (new submodule at 59df200)
    - third_party/upstream/bolt-js (new submodule at 4cfd376)

key-decisions:
  - "bolt-js does not use git tags for releases — SHA manually identified by user from commit history; no tag-based lookup possible"
  - "Monorepo submodules share a single commit SHA: @shopify/admin-api-client and @shopify/shopify-api both pin to the same shopify-app-js SHA; @slack/web-api and @slack/oauth both pin to the same node-slack-sdk SHA"
  - "Fork origin URLs used in .gitmodules (sandpiper-app org) rather than official upstream — prevents CI auth issues and preserves fork-based workflow for future SDK surface annotation"

patterns-established:
  - "sdk-pins.json schema: $schema + description + packages map keyed by npm package name, each with version/submodule/commit/packagePath"
  - "Two-remote submodule convention: origin = fork (sandpiper-app), upstream = official source (Shopify/slackapi)"

requirements-completed:
  - INFRA-10

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 13 Plan 03: Upstream SDK Mirrors Summary

**Three git submodules pinned to npm-version-matching commits with fork+upstream dual remotes and sdk-pins.json as the atomic version lock for all five targeted packages.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T06:19:03Z
- **Completed:** 2026-03-09T06:27:00Z
- **Tasks:** 1 (Task 1 resolved via human checkpoint, Task 2 executed)
- **Files modified:** 5

## Accomplishments
- Three submodules initialized at third_party/upstream/ — shopify-app-js (7399c4f), node-slack-sdk (59df200), bolt-js (4cfd376)
- Each submodule pinned to the exact commit matching the installed npm package version; SHAs cross-verified via `rev-parse HEAD`
- Dual-remote configuration in each submodule: origin pointing to sandpiper-app fork, upstream pointing to official Shopify/slackapi source
- sdk-pins.json written with version + commit entries for all five packages (@shopify/admin-api-client, @shopify/shopify-api, @slack/web-api, @slack/oauth, @slack/bolt)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fork the three upstream SDK repos and find version-matching SHAs** - human-action checkpoint resolved by user (no commit)
2. **Task 2: Add submodules, pin to version commits, configure upstream remotes, write sdk-pins.json** - `fd2790c` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `.gitmodules` - Three submodule declarations pointing to sandpiper-app fork URLs
- `third_party/sdk-pins.json` - Atomic version lock: npm version + submodule path + commit SHA + packagePath for all five packages
- `third_party/upstream/shopify-app-js` - Submodule at 7399c4fcc3fc3946bbe6925c2a0710c6493986b9
- `third_party/upstream/node-slack-sdk` - Submodule at 59df2005b96457e5c4115f6daf0031a2b203850f
- `third_party/upstream/bolt-js` - Submodule at 4cfd37634a8b09e83ba345c3b67a26c5eb6012fa

## Decisions Made
- bolt-js does not use git tags for releases — user manually identified the SHA from commit history by searching for the `@slack/bolt@4.6.0` release commit message. The commit message confirmed: `chore(release): version @slack/bolt@4.6.0`.
- Monorepo submodules share a single commit SHA: both @shopify packages pin to the same shopify-app-js commit; both @slack/web-api and @slack/oauth pin to the same node-slack-sdk commit.
- sandpiper-app fork URLs used in .gitmodules rather than official upstream URLs — CI can access the forks without additional auth; upstream remotes are configured inside each submodule for drift tracking only.

## Deviations from Plan

None — plan executed exactly as written. All six checkpoint values (three URLs + three SHAs) were provided and applied directly.

## Issues Encountered

After `git submodule add`, the submodules showed `+` prefix in `git submodule status` because the initial clone HEAD differed from the pinned SHA. Staging via `git add third_party/` after the checkout resolved the recorded pointer and removed the `+` prefix. This is expected behavior, not an error.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Submodule foundation is in place; Phase 14 (SDK verification harness) can now reference third_party/upstream/ for ts-morph source traversal
- sdk-pins.json provides the version lock that Phase 20 drift detection will read to detect SHA drift between installed packages and submodule pins
- CI (updated in Plan 01 with `submodules: recursive`) will initialize submodules correctly on the next push

---
*Phase: 13-upstream-sdk-mirrors-surface-inventory*
*Completed: 2026-03-09*
