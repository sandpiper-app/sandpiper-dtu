---
phase: 35-slack-behavioral-parity
plan: 01
subsystem: api
tags: [slack, fastify, typescript, method-stubs, oauth, oidc, file-upload, scope-enforcement]

# Dependency graph
requires:
  - phase: 34-slack-build-fix-evidence-pipeline
    provides: Slack twin compiles cleanly and test suite runs (exit 0)
  - phase: 26-slack-scope-enforcement
    provides: stub() factory pattern with checkScope() + X-OAuth-Scopes headers
provides:
  - 16 previously-missing WebClient method routes registered in new-families.ts
  - openid.connect.token as a no-auth code-exchange handler (client_id + client_secret)
  - POST verb for binary upload endpoint (filesUploadV2 3-step chain completes)
  - apps.connections.open, oauth.v2.access, admin.workflows.search in METHOD_SCOPES
affects: [36-shopify-behavioral-parity, 37-billing-fidelity-conformance-rigor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "No-auth handler pattern for code-exchange endpoints (openid.connect.token, oauth.access, oauth.v2.exchange): do NOT use stub() factory, validate body fields directly"
    - "POST verb for binary upload endpoints — SDK's axios.post() call; PUT registration produces 404"
    - "connections:write auto-propagates to seedSlackBotToken() via allScopesString() when added to METHOD_SCOPES"

key-files:
  created: []
  modified:
    - twins/slack/src/plugins/web-api/new-families.ts
    - twins/slack/src/services/method-scopes.ts
    - twins/slack/src/plugins/web-api/files.ts

key-decisions:
  - "openid.connect.token handler must NOT use extractToken() for bearer auth — validates client_id + client_secret in body; WebClient also sends Authorization header but handler ignores it"
  - "16 missing routes added to new-families.ts (not a new plugin file); plugin already serves as the catch-all for extended families"
  - "oauth.v2.access kept in oauth.ts — only METHOD_SCOPES entry added for catalog completeness; stub() factory not used because endpoint is no-auth"
  - "openid.connect.token entry in METHOD_SCOPES changed from ['openid'] to [] — consistent with its new no-auth status"
  - "allScopesString() auto-includes connections:write after METHOD_SCOPES addition — seedSlackBotToken() needs no changes"

patterns-established:
  - "No-auth endpoint pattern: async (request, reply) => { const body = ...; if (!body.client_id) return reply.send({ ok: false, ... }); return reply.send({ ok: true, ... }); }"
  - "new-families.ts comment must accurately list all families registered — remove false 'already registered in other files' notes"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 35 Plan 01: Slack Behavioral Parity Summary

**16 missing WebClient method routes registered, openid.connect.token converted to no-auth code-exchange, binary upload verb fixed PUT to POST, and 4 METHOD_SCOPES entries added — closing all four High-severity findings from the second adversarial review**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T02:21:59Z
- **Completed:** 2026-03-14T02:24:51Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Registered 16 previously-missing stub routes in new-families.ts, eliminating 404 transport errors for any bound WebClient method in @slack/web-api@7.14.1
- Fixed openid.connect.token from bearer-gated stub to proper no-auth code-exchange handler accepting client_id + client_secret in the POST body
- Fixed filesUploadV2 3-step chain by changing the binary upload endpoint from PUT to POST (WebClient uses axios.post() unconditionally)
- Added apps.connections.open (connections:write), oauth.v2.access ([]), admin.workflows.search (admin.workflows:read) to METHOD_SCOPES; changed openid.connect.token from ['openid'] to [] — scope catalog now accurate
- All 253 tests green (31 test files, exit 0)

## Task Commits

1. **Task 1: Register 16 missing stub routes + fix openid.connect.token** - `18c1647` (feat)
2. **Task 2: Add apps.connections.open, oauth.v2.access, admin.workflows.search to METHOD_SCOPES** - `dba40a2` (feat)
3. **Task 3: Fix PUT to POST for binary upload endpoint in files.ts** - `644b998` (fix)

## Files Created/Modified

- `twins/slack/src/plugins/web-api/new-families.ts` — Replaced openid.connect.token stub() call with no-auth handler; added 16 missing routes (apps.manifest.* x5, apps.uninstall, apps.event.authorizations.list, files.upload, files.uploadV2, oauth.access, oauth.v2.exchange, team.billing.info, team.externalTeams.disconnect/list, users.discoverableContacts.lookup, admin.workflows.search); removed false "already registered" comment; updated module JSDoc
- `twins/slack/src/services/method-scopes.ts` — Added apps.connections.open (['connections:write']), admin.workflows.search (['admin.workflows:read']), oauth.v2.access ([]), changed openid.connect.token from ['openid'] to []
- `twins/slack/src/plugins/web-api/files.ts` — Changed fastify.put to fastify.post for /api/_upload/:file_id; updated JSDoc comment

## Decisions Made

- openid.connect.token handler validates client_id + client_secret in the POST body without requiring a bearer token — the WebClient sends an Authorization header incidentally but the handler does not require it, maintaining backward compatibility with existing tests
- All 16 missing routes added to new-families.ts rather than creating a new plugin file — the file already serves as the extended family catch-all
- oauth.v2.access is not moved from oauth.ts to new-families.ts; only the METHOD_SCOPES entry is added for catalog completeness
- connections:write scope for apps.connections.open propagates automatically to seedSlackBotToken() via allScopesString() — no seeder changes needed

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Slack twin behavioral parity complete — all 253 tests green, all bound WebClient methods return {ok:true}
- Phase 36 (Shopify Behavioral Parity) and Phase 37 (Billing Fidelity & Conformance Rigor) unblocked

---
*Phase: 35-slack-behavioral-parity*
*Completed: 2026-03-14*

## Self-Check: PASSED

- FOUND: twins/slack/src/plugins/web-api/new-families.ts
- FOUND: twins/slack/src/services/method-scopes.ts
- FOUND: twins/slack/src/plugins/web-api/files.ts
- FOUND: .planning/phases/35-slack-behavioral-parity/35-01-SUMMARY.md
- FOUND: commit 18c1647 (Task 1)
- FOUND: commit dba40a2 (Task 2)
- FOUND: commit 644b998 (Task 3)
