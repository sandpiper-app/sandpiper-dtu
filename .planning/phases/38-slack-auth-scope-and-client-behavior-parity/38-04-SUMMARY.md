---
phase: 38-slack-auth-scope-and-client-behavior-parity
plan: 04
subsystem: api
tags: [slack, files, filesUploadV2, response_url, interactions, fastify]

# Dependency graph
requires:
  - phase: 38-01
    provides: slack-client-behavior-parity.test.ts Wave 0 parity tests (SLCK-22)
provides:
  - files.completeUploadExternal normalizes files field (JSON string or array) and returns Slack-shaped file metadata
  - response_url honors replace_original (mutates original message) and delete_original (removes message from history)
affects: [39-shopify-oauth-rest-state-and-id-parity, 40-verification-evidence-integrity-and-conformance-truthfulness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read env vars per-request when globalSetup sets them AFTER twin boots (same pattern as upload_url in files.ts)"
    - "Register content-type parsers for binary MIME types on specific route plugins rather than globally"
    - "delete_original: direct SQL DELETE on slack_messages; replace_original: calls existing updateMessage() helper"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts
  modified:
    - twins/slack/src/plugins/web-api/files.ts
    - twins/slack/src/services/interaction-handler.ts

key-decisions:
  - "JSON-string normalization for files field: upstream SDK serializes the files array as a JSON string when sending form-encoded; parse-then-validate pattern returns invalid_arguments on malformed input"
  - "Slack-shaped file metadata: id, name, title, mimetype, filetype, user, url_private, permalink — all derived from tokenRecord.user_id and file_id; no state persistence needed for conformance"
  - "delete_original uses raw SQL DELETE directly on slackStateManager.database (getter already exposed); plan explicitly says not to add a new state-manager method"
  - "replace_original calls existing updateMessage(entry.messageTs, ...) — already has the right signature"
  - "Binary upload 415 fix: addContentTypeParser for multipart/form-data + application/octet-stream within files plugin scope; body discarded (twin doesn't need file content for conformance)"
  - "response_url base URL: read process.env.SLACK_API_URL per-call in generateInteractionPayload (globalSetup sets it AFTER buildApp); same per-request env-read pattern used by getUploadURLExternal"

patterns-established:
  - "Per-request env read for dynamic base URLs: (process.env.SLACK_API_URL ?? this.baseUrl).replace(/\\/api\\/?$/, '') — safe fallback to constructor value when env not set"

requirements-completed: [SLCK-22]

# Metrics
duration: 9min
completed: 2026-03-14
---

# Phase 38 Plan 04: Client-Visible Slack Behavior Parity Summary

**files.completeUploadExternal now normalizes JSON-string input and returns full Slack-shaped file metadata; response_url honors replace_original (in-place message mutation) and delete_original (SQL DELETE) instead of always appending**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-14T15:14:36Z
- **Completed:** 2026-03-14T15:23:36Z
- **Tasks:** 2
- **Files modified:** 3 (+ 1 created)

## Accomplishments
- `files.completeUploadExternal` now accepts `files` as a JSON string (upstream SDK sends form-encoded) or array, validates it, and returns full Slack-shaped completion objects with `id`, `name`, `title`, `mimetype`, `filetype`, `user`, `url_private`, and `permalink`
- `response_url` honors `replace_original: true` (calls `updateMessage` on the original message ts) and `delete_original: true` (SQL DELETE by ts+channel) — default append behavior preserved unchanged
- `slack-client-behavior-parity.test.ts` created with 4 parity assertions covering both files and response_url flows (all 4 GREEN)
- `slack-webclient-base.test.ts` filesUploadV2 chain test stays GREEN through all three changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Normalize files.completeUploadExternal input and return Slack-shaped file metadata** - `14c45f7` (feat)
2. **Task 2: Honor replace_original and delete_original in response_url handling** - `102c627` (feat)

**Plan metadata:** `a71cd5d` (docs: complete plan)

## Files Created/Modified
- `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` - Wave 0 SLCK-22 parity tests: filesUploadV2 nested metadata, completeUploadExternal JSON-string, replace_original, delete_original
- `twins/slack/src/plugins/web-api/files.ts` - JSON-string normalization for files field, Slack-shaped completion metadata, content-type parsers for binary upload step
- `twins/slack/src/services/interaction-handler.ts` - delete_original/replace_original branches, per-request SLACK_API_URL for response_url generation

## Decisions Made
- `delete_original` uses `this.slackStateManager.database.prepare('DELETE FROM slack_messages WHERE ts = ? AND channel_id = ?').run(...)` directly — plan explicitly ruled out a new state-manager method; the `database` getter is already public
- `replace_original` calls the existing `updateMessage(entry.messageTs, { text, blocks })` — matching the existing helper signature exactly
- Binary upload 415: Fastify rejects multipart/form-data bodies by default; added `addContentTypeParser` for both `multipart/form-data` and `application/octet-stream` within the files plugin (scoped, not global)
- response_url base URL reads `process.env.SLACK_API_URL` per-call: globalSetup sets this env var AFTER the twin starts listening, so the construction-time value would always be `localhost:3001` in tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Created slack-client-behavior-parity.test.ts (missing prerequisite)**
- **Found during:** Task 1 setup
- **Issue:** Plan 38-04 depends on Plan 38-01 having created the test file, but it was absent (predecessor test file creation hadn't yet happened for the SLCK-22 file specifically)
- **Fix:** Created `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` with 4 Wave 0 SLCK-22 assertions per Plan 38-01 Task 3 spec
- **Files modified:** `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` (created)
- **Verification:** All 4 tests pass after Task 1 + Task 2 implementation
- **Committed in:** `14c45f7` (Task 1 commit)

**2. [Rule 1 - Bug] Binary upload step returned 415 Unsupported Media Type**
- **Found during:** Task 1 verification (filesUploadV2 test)
- **Issue:** `POST /api/_upload/:file_id` received multipart/form-data from the upstream SDK but Fastify had no content-type parser for it, returning 415 and causing the SDK to retry 5 times then fail with a timeout
- **Fix:** Added `addContentTypeParser` for `multipart/form-data` and `application/octet-stream` in the files plugin; body discarded (twin doesn't use file content for conformance)
- **Files modified:** `twins/slack/src/plugins/web-api/files.ts`
- **Verification:** filesUploadV2 parity test passes; no 415 warnings in test output
- **Committed in:** `102c627` (Task 2 commit)

**3. [Rule 1 - Bug] response_url pointed to localhost:3001 in test environment**
- **Found during:** Task 2 verification (response_url tests)
- **Issue:** `InteractionHandler` receives `baseUrl: process.env.SLACK_API_URL ?? 'http://localhost:3001'` at construction time, but globalSetup sets `SLACK_API_URL` AFTER the app starts, so tests got a response_url pointing to port 3001 (connection refused)
- **Fix:** Changed `generateInteractionPayload` to read `process.env.SLACK_API_URL` per-call (same per-request pattern already used by `getUploadURLExternal` for the upload_url)
- **Files modified:** `twins/slack/src/services/interaction-handler.ts`
- **Verification:** replace_original and delete_original tests pass (no ECONNREFUSED errors)
- **Committed in:** `102c627` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All fixes were required for the plan's success criteria. No scope creep — all changes directly caused by Task 1/2 implementation.

## Issues Encountered
- Tests ran with pre-existing failures from Plans 38-02 (`apps.connections.open` token-class enforcement, `openid.connect.token` invalidation) and Plan 38-03 (`SLCK-18f` redirect_uri_mismatch). These are expected unrelated failures, not regressions from Plan 38-04.

## Next Phase Readiness
- SLCK-22 GREEN: filesUploadV2 nested completion shape + response_url replace/delete semantics now match Slack client expectations
- Phase 38 is complete; Phase 39 (Shopify OAuth, REST state, and ID parity) is next

---
*Phase: 38-slack-auth-scope-and-client-behavior-parity*
*Completed: 2026-03-14*
