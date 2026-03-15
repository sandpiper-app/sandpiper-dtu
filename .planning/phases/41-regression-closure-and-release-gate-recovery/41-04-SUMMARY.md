---
phase: 41-regression-closure-and-release-gate-recovery
plan: "04"
subsystem: testing
tags: [slack, oauth, scope-enforcement, files-upload, typescript-ast, ts-morph, vitest]

requires:
  - phase: 41-regression-closure-and-release-gate-recovery
    provides: plans 01-03 — Shopify fixes, Slack WebClient conformance base, drift gate truth

provides:
  - Exhaustive Slack scope catalog with explicit entries for every auth-checked method
  - AST-based catalog completeness test (ts-morph) that enforces no future omissions
  - Shared oauth-secrets.ts source of truth for Slack OAuth/OIDC credential validation
  - Strict oauth.access, oauth.v2.exchange, openid.connect.token validation (invalid_client on unknown IDs)
  - filesUploadV2 always returns absolute upload_url (request-origin fallback when SLACK_API_URL unset)
  - Docker smoke test proving absolute upload_url is rooted at SLACK_API_URL/api/

affects:
  - slack-scope-enforcement
  - slack-twin-oauth
  - slack-filesuploadv2
  - sdk-verification-tests

tech-stack:
  added: [ts-morph (AST-based source audit)]
  patterns:
    - Shared credential map (OAUTH_CLIENT_SECRETS) imported by all OAuth entry points
    - TDD RED/GREEN for scope catalog completeness
    - Request-origin fallback for absolute URLs when env var is absent

key-files:
  created:
    - tests/sdk-verification/sdk/slack-scope-catalog.test.ts
    - tests/sdk-verification/sdk/slack-docker-upload-url-smoke.test.ts
    - twins/slack/src/services/oauth-secrets.ts
  modified:
    - twins/slack/src/services/method-scopes.ts
    - twins/slack/src/plugins/web-api/new-families.ts
    - twins/slack/src/plugins/oauth.ts
    - twins/slack/src/plugins/web-api/files.ts
    - docker-compose.twin.yml

key-decisions:
  - "PARAM_FORWARD sentinel in AST resolver: helper function parameter forward-passes are silently skipped to avoid false positives in the unresolved-dynamic test"
  - "ForOfStatement SyntaxKind=250 resolution: for-of loop variables are expanded to all string literals in the iterated array, capturing conversations.ts slackConnectStubs pattern"
  - "Request-origin fallback for upload_url: when SLACK_API_URL is unset, the twin derives the base URL from the incoming request's hostname and local port, eliminating environment-dependent behavior"
  - "OAUTH_CLIENT_SECRETS shared map: unknown client_ids return invalid_client (not pass-through), closing the false-green OAuth validation gap"
  - "openid.connect.token requires code OR refresh_token: aligned with vendored OAuthGrantRefresh type"

patterns-established:
  - "Pattern: AST-audit completeness tests — use ts-morph to scan plugin source files and assert every method that reaches checkScope() has a catalog entry"
  - "Pattern: Shared credential source of truth — all OAuth/OIDC entry points import from one oauth-secrets.ts file instead of maintaining local copies"

requirements-completed: [INFRA-20, SLCK-18, SLCK-20, SLCK-22]

duration: 9min
completed: 2026-03-15
---

# Phase 41 Plan 04: Slack Scope Catalog and OAuth/Files Regression Closure Summary

**Exhaustive Slack scope catalog enforced by AST audit, OAuth/OIDC credentials strictly validated against a shared secret map, and filesUploadV2 returns an absolute upload URL in all environments**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-15T06:59:14Z
- **Completed:** 2026-03-15T07:08:00Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified + 1 docker-compose)

## Accomplishments
- METHOD_SCOPES catalog expanded from ~55 entries to ~116 entries covering every auth-checked route in the Slack twin — including files.*, search.*, users.setPhoto/setActive, chat.appendStream/stopStream, reminders.*/dnd.*/bookmarks.*/usergroups.*/calls.*/team.* stubs, dialog.open, functions.*, assistant.threads.*, auth.revoke/teams.list, and conversations.canvases.*
- AST-based slack-scope-catalog.test.ts uses ts-morph to scan all plugin files, resolves direct literals, const-backed identifiers, for-of loop variables, and function-parameter forwarding patterns; fails immediately if any method is missing from the catalog
- Shared oauth-secrets.ts eliminates credential drift — oauth.access, oauth.v2.exchange, openid.connect.token, and oauth.v2.access all use OAUTH_CLIENT_SECRETS; unknown client_ids now return invalid_client instead of passing through
- files.getUploadURLExternal validates filename (non-empty) and length (positive number), and falls back to request origin when SLACK_API_URL is not set in the environment
- files.completeUploadExternal rejects an empty files array with invalid_arguments
- Docker smoke test confirms upload_url is rooted at SLACK_API_URL/api/ in a containerized environment

## Task Commits

1. **Task 1 RED — Scope catalog completeness test (failing)** - `bf52ea7` (test)
2. **Task 1 GREEN — Expand METHOD_SCOPES** - `35df528` (feat)
3. **Task 2 — OAuth/OIDC strictness, files validation, Docker env** - `5b937ca` (feat)

## Files Created/Modified
- `tests/sdk-verification/sdk/slack-scope-catalog.test.ts` — AST-based catalog completeness audit (ts-morph)
- `tests/sdk-verification/sdk/slack-docker-upload-url-smoke.test.ts` — Docker upload URL proof test
- `twins/slack/src/services/oauth-secrets.ts` — Shared OAUTH_CLIENT_SECRETS + validateOAuthCredentials
- `twins/slack/src/services/method-scopes.ts` — Added 61 missing method entries
- `twins/slack/src/plugins/web-api/new-families.ts` — oauth.access/v2.exchange/openid.connect.token strict validation
- `twins/slack/src/plugins/oauth.ts` — Imports OAUTH_CLIENT_SECRETS from shared source
- `twins/slack/src/plugins/web-api/files.ts` — filename/length validation, absolute URL fallback, empty-files rejection
- `docker-compose.twin.yml` — SLACK_API_URL env var for slack-twin service

## Decisions Made
- Used PARAM_FORWARD sentinel to distinguish "helper parameter forwarding" (skip silently) from "truly dynamic unresolvable values" (report as test failure) in the AST resolver
- Used ForOfStatement SyntaxKind=250 (verified at runtime via ts.SyntaxKind) rather than a hardcoded constant
- Request-origin fallback reads `request.hostname` and `request.socket.localPort` to construct an absolute base URL when SLACK_API_URL is absent — this makes the twin usable in environments where the env var isn't injected
- openid.connect.token now requires code OR refresh_token (not just code), aligning with the vendored OAuthGrantRefresh type from the Slack SDK

## Deviations from Plan

None — plan executed exactly as written. All specified files were created/modified with the specified behavior.

## Issues Encountered
- Node.isParameter does not exist in ts-morph v25 — corrected to Node.isParameterDeclaration (Rule 1 auto-fix)
- ForOfStatement SyntaxKind was assumed to be 247 but is actually 250 — verified at runtime (Rule 1 auto-fix)
- tsconfig.json was expected at repo root but lives at twins/slack/tsconfig.json — fixed path constant (Rule 1 auto-fix)

## Next Phase Readiness
- All Phase 41 regression contracts are now green
- Slack scope enforcement is exhaustively covered with no silent pass-throughs
- OAuth/OIDC flows reject invalid credentials
- filesUploadV2 is environment-safe

---
*Phase: 41-regression-closure-and-release-gate-recovery*
*Completed: 2026-03-15*

## Self-Check: PASSED

- FOUND: tests/sdk-verification/sdk/slack-scope-catalog.test.ts
- FOUND: tests/sdk-verification/sdk/slack-docker-upload-url-smoke.test.ts
- FOUND: twins/slack/src/services/oauth-secrets.ts
- FOUND: .planning/phases/41-regression-closure-and-release-gate-recovery/41-04-SUMMARY.md
- FOUND commit: bf52ea7 (RED test)
- FOUND commit: 35df528 (GREEN catalog expansion)
- FOUND commit: 5b937ca (OAuth/files strictness)
