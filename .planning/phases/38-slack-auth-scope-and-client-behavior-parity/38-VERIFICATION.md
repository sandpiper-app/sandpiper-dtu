---
phase: 38-slack-auth-scope-and-client-behavior-parity
verified: 2026-03-14T16:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 38: Slack Auth Scope and Client Behavior Parity — Verification Report

**Phase Goal:** Fix Slack auth scope enforcement and client behavior parity — OIDC tokens, oauth.v2.access validation, conversation scope resolution, filesUploadV2 metadata, response_url semantics.
**Verified:** 2026-03-14T16:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQUIREMENTS.md defines SLCK-20..23 with Phase 38 meanings; Enterprise Grid moved to SLCK-24 | VERIFIED | Lines 74-77, 100, 167-170 of REQUIREMENTS.md — all four IDs present as `[x]` complete with correct descriptions; SLCK-24 present in v2 section |
| 2 | `openid.connect.token` persists OIDC tokens; `openid.connect.userInfo` accepts them | VERIFIED | `new-families.ts` L91-116: `createToken(oidcToken, 'user', 'T_TWIN', 'U_AUTHED', 'openid', 'A_TWIN')` before reply; dedicated `userInfo` handler L120-146 reads token record and user identity |
| 3 | `oauth.v2.access` validates `client_secret` and echoes authorize-time granted scope | VERIFIED | `oauth.ts` L29-33: `CLIENT_SECRETS` map; L108-111: `expectedSecret && (!client_secret \|\| ...)` rejection; L150: `const grantedScope = binding.scope`; L166/169: both `scope` and `authed_user.scope` return `grantedScope` |
| 4 | `apps.connections.open` rejects bot tokens; accepts only `xapp-` app tokens | VERIFIED | `stubs.ts` L158: `if (tokenRecord.token_type !== 'app' \|\| !token.startsWith('xapp-'))` returns `{ ok: false, error: 'invalid_auth' }` |
| 5 | `auth.test` returns correct identity per token class (bot/user/app branches) | VERIFIED | `auth.ts` L86-112: user branch omits `bot_id`, returns `user?.name ?? 'authed-user'` and `user_id`; app branch returns `app_id`, omits `bot_id`; bot branch preserves existing response with `TWIN_BOT_ID` |
| 6 | `conversations.list/info/history` resolve scopes dynamically from `types` or channel class | VERIFIED | `conversations.ts` imports `resolveConversationTypeScopes`, `resolveChannelClass`, `checkResolvedScopes`; each of the three handlers calls the matching helper; `X-Accepted-OAuth-Scopes` set from `requiredScopes.join(',')` |
| 7 | `method-scopes.ts` exports the three conversation scope helpers | VERIFIED | `method-scopes.ts` exports `resolveConversationTypeScopes`, `resolveChannelClass`, `checkResolvedScopes` (confirmed by grep returning all three) |
| 8 | `filesUploadV2` returns Slack-shaped completed file metadata with `id`, `name`, `permalink` | VERIFIED | `files.ts` L92-106: completed map builds `{ id, name, title, mimetype, filetype, user, url_private, permalink }` with `permalink: \`https://twin-workspace.slack.com/files/...\`` |
| 9 | `files.completeUploadExternal` normalizes `files` field from JSON string or array | VERIFIED | `files.ts` L74-89: `typeof rawFiles === 'string'` branch parses JSON; array branch used directly; returns `invalid_arguments` on failure |
| 10 | `response_url` with `replace_original` mutates original message in place | VERIFIED | `interaction-handler.ts` L143-149: `body.replace_original === true` calls `updateMessage(entry.messageTs, ...)` and returns `{ ok: true }` without creating a new message |
| 11 | `response_url` with `delete_original` removes original message from history | VERIFIED | `interaction-handler.ts` L137-142: `body.delete_original === true` runs `DELETE FROM slack_messages WHERE ts = ? AND channel_id = ?` and returns `{ ok: true }` |
| 12 | `seedSlackAppToken()` seeder exists; Socket Mode test uses it | VERIFIED | `seeders.ts` exports `seedSlackAppToken` with `tokenType: 'app'`; `slack-bolt-socket-mode-receiver.test.ts` L29: `await seedSlackAppToken(APP_TOKEN)` |
| 13 | In-repo Slack twin tests send explicit `client_id`/`client_secret` at exchange | VERIFIED | All five files (`smoke.test.ts`, `auth.test.ts`, `web-api.test.ts`, `ui.test.ts`, `integration.test.ts`) contain `client_id: 'test', client_secret: 'test'` payloads; no bare `payload: { code }` patterns remain |
| 14 | Wave 0 parity test files exist with substantive assertions | VERIFIED | All three files created: `slack-auth-parity.test.ts` (6 tests), `slack-conversation-scope-parity.test.ts` (9 tests), `slack-client-behavior-parity.test.ts` (4 tests) — each exercises the exact twin routes implicated by defects |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/REQUIREMENTS.md` | SLCK-20..23 defined; SLCK-24 for Enterprise Grid; 4 traceability rows as `Complete` | VERIFIED | SLCK-20..23 present as `[x]` under v1.2 Slack Fidelity; SLCK-24 under v2 Extended Fidelity; traceability table rows all show `Complete` (updated after execution) |
| `.planning/phases/38-slack-auth-scope-and-client-behavior-parity/38-VALIDATION.md` | SLCK-23 mapped to `38-01-04` and `38-02-02`; no `38-04-02` row | VERIFIED | Rows 38-01-04 (SLCK-23) and 38-02-02 (SLCK-23) present; no `38-04-02` row found |
| `tests/sdk-verification/sdk/slack-auth-parity.test.ts` | 6 Wave 0 auth/token parity tests | VERIFIED | File exists, 226 lines; contains all 6 named tests including OIDC round-trip, `invalid_client`, scope echo, `apps.connections.open` bot rejection and app acceptance, and `auth.test` identity split |
| `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` | Dynamic scope tests for `conversations.list/info/history` | VERIFIED | File exists, 231 lines; 9 tests covering public/private/DM channel class scope resolution and `X-Accepted-OAuth-Scopes` header assertions |
| `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` | filesUploadV2 metadata + response_url behavior tests | VERIFIED | File exists, 186 lines; 4 tests covering nested completion metadata, JSON-string `files` field, `replace_original`, and `delete_original` |
| `twins/slack/src/plugins/oauth.ts` | `CLIENT_SECRETS` map; `client_secret` validation; `binding.scope` propagation; `U_AUTHED` seeding | VERIFIED | L29-33: `CLIENT_SECRETS`; L108-111: rejection logic; L150: `grantedScope = binding.scope`; L133-142: idempotent `U_AUTHED` creation |
| `twins/slack/src/plugins/web-api/new-families.ts` | Stateful `openid.connect.token`; dedicated `openid.connect.userInfo` handler | VERIFIED | L72-116: OIDC handler with `OIDC_CLIENT_SECRETS`, `createToken()`, and `U_AUTHED` seeding; L120-146: dedicated `userInfo` handler with token record lookup and user identity |
| `twins/slack/src/plugins/web-api/stubs.ts` | App-token gate in `apps.connections.open` | VERIFIED | L158: `tokenRecord.token_type !== 'app' \|\| !token.startsWith('xapp-')` gate returning `invalid_auth` |
| `twins/slack/src/plugins/web-api/auth.ts` | Token-class-aware `auth.test` with user/app/bot branches | VERIFIED | L86-124: three distinct branches; user branch omits `bot_id`; app branch includes `app_id` and omits `bot_id`; bot branch preserves existing identity |
| `twins/slack/src/services/method-scopes.ts` | Three new exports: `resolveConversationTypeScopes`, `resolveChannelClass`, `checkResolvedScopes` | VERIFIED | All three exports confirmed present; original `METHOD_SCOPES` catalog and `allScopesString()` unchanged |
| `twins/slack/src/plugins/web-api/conversations.ts` | Dynamic scope enforcement in `list/info/history` handlers | VERIFIED | All three imports confirmed; `conversations.list` resolves from `types` param; `conversations.info` and `conversations.history` resolve after channel lookup |
| `twins/slack/src/plugins/web-api/files.ts` | JSON-string normalization + Slack-shaped completion metadata | VERIFIED | L74-106: string/array normalization, `invalid_arguments` error path, and completion map with all required fields including `permalink` |
| `twins/slack/src/services/interaction-handler.ts` | `delete_original` SQL DELETE; `replace_original` calls `updateMessage` | VERIFIED | L137-149: both branches correctly implemented; append-only fallback still exists for the default case (L152-160) |
| `tests/sdk-verification/setup/seeders.ts` | `seedSlackAppToken()` with `tokenType: 'app'` | VERIFIED | L91-113: export confirmed with all required fields |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `twins/slack/src/plugins/oauth.ts` | `twins/slack/src/plugins/web-api/auth.ts` | `oauth.v2.access` user token -> `auth.test` user identity branch | WIRED | `oauth.ts` creates user token with `token_type='user'` and `user_id='U_AUTHED'`; `auth.ts` branches on `tokenRecord.token_type === 'user'` and loads user via `getUser(tokenRecord.user_id)` |
| `twins/slack/src/plugins/web-api/new-families.ts` | `tests/sdk-verification/sdk/slack-auth-parity.test.ts` | `openid.connect.token -> openid.connect.userInfo` round-trip | WIRED | `new-families.ts` persists token via `createToken()`; test L67-82 calls `openid.connect.token` then uses returned `access_token` with a new `WebClient` for `openid.connect.userInfo` |
| `twins/slack/src/plugins/web-api/stubs.ts` | `tests/sdk-verification/sdk/slack-auth-parity.test.ts` | `apps.connections.open` rejects bot, accepts xapp | WIRED | `stubs.ts` gate at L158; test has two assertions (L117-177) covering rejection of `xoxb-` and acceptance of `xapp-` |
| `twins/slack/src/services/method-scopes.ts` | `twins/slack/src/plugins/web-api/conversations.ts` | Scope resolution helpers imported and called | WIRED | `conversations.ts` imports all three helpers; each of three handlers calls `resolveConversationTypeScopes` and `checkResolvedScopes` |
| `twins/slack/src/plugins/web-api/conversations.ts` | `tests/sdk-verification/sdk/slack-conversation-scope-parity.test.ts` | `X-Accepted-OAuth-Scopes` and `missing_scope` body assertions | WIRED | Test uses `fetch()` to inspect response headers; assertions at L76, L93, L135, L152, L194, L211 check `x-accepted-oauth-scopes` |
| `twins/slack/src/plugins/web-api/files.ts` | `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` | `filesUploadV2` nested completion response | WIRED | `files.ts` returns `{ ok, files: completed, response_metadata: {} }`; test L46-49 asserts `fileObj.id` matches `/^F_/`, `name === 'wave0.txt'`, `permalink` contains `/files/` |
| `twins/slack/src/services/interaction-handler.ts` | `tests/sdk-verification/sdk/slack-client-behavior-parity.test.ts` | `response_url` replace/delete semantics | WIRED | `interaction-handler.ts` branches at L137/L143; test L73-185 drives full interaction flow and checks `conversations.history` results |
| `tests/sdk-verification/setup/seeders.ts` | `tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts` | Socket Mode app token seeded with `tokenType='app'` | WIRED | `seeders.ts` exports `seedSlackAppToken`; `slack-bolt-socket-mode-receiver.test.ts` L17 imports it; L29 calls `await seedSlackAppToken(APP_TOKEN)` |
| `twins/slack/src/plugins/oauth.ts` | `twins/slack/test/integration.test.ts` | Tightened `oauth.v2.access` contract with explicit credentials | WIRED | `integration.test.ts` L32: `payload: { code, client_id: 'test', client_secret: 'test' }` |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| SLCK-20 | 38-01, 38-02 | `openid.connect.token` persists OIDC tokens; `oauth.v2.access` validates `client_secret` and echoes granted scope; `apps.connections.open` requires app token | SATISFIED | `oauth.ts` CLIENT_SECRETS + `binding.scope`; `new-families.ts` stateful OIDC; `stubs.ts` app-token gate; marked `[x]` in REQUIREMENTS.md |
| SLCK-21 | 38-01, 38-03 | Dynamic conversation scope resolution for `list/info/history` | SATISFIED | `method-scopes.ts` three helpers; `conversations.ts` wired to all three handlers; 9 parity tests pass; marked `[x]` in REQUIREMENTS.md |
| SLCK-22 | 38-01, 38-04 | `filesUploadV2` Slack-shaped metadata; `response_url` replace/delete semantics | SATISFIED | `files.ts` full metadata shape with `permalink`; `interaction-handler.ts` delete/replace branches; 4 parity tests pass; marked `[x]` in REQUIREMENTS.md |
| SLCK-23 | 38-01, 38-02 | `auth.test` returns identity matching token class | SATISFIED | `auth.ts` three-branch identity logic (bot/user/app); user branch confirmed omits `bot_id`; marked `[x]` in REQUIREMENTS.md |

No orphaned requirements — all four SLCK-20..23 IDs are claimed by plans 38-01 through 38-04. SLCK-24 (Enterprise Grid, deferred) is correctly placed in v2 requirements and not assigned to Phase 38.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `38-VALIDATION.md` frontmatter | `nyquist_compliant: false`, `wave_0_complete: false`, all task statuses remain `pending` | Info | Documentation artifact only — does not reflect the completed state. The validation doc was pre-populated before execution and never updated to reflect green status. This is a documentation staleness issue, not a code defect. The tests themselves are substantive and wired. |

No stub return values (`return null`, `return {}`, empty handlers) found in the implementation files. No `TODO`/`FIXME`/`PLACEHOLDER` comments found in any modified production file. All `createMessage` calls appear exactly once in `interaction-handler.ts` (the append-only fallback path), confirming the replace/delete branches do not call it.

---

### Commit Integrity

All 9 implementation commits referenced in the SUMMARY files were verified to exist in git history:

| Commit | Description |
|--------|-------------|
| `fc9c9e5` | feat(38-01): realign Phase 38 requirement IDs in REQUIREMENTS.md |
| `8488d19` | fix(38-01): fix Wave 0 test transport issues and auth validation edge cases |
| `5ea2c80` | feat(38-02): stateful OIDC token issuance and oauth.v2.access credential validation |
| `a7eaf1c` | feat(38-02): app-token enforcement and token-class-aware auth.test identity |
| `986ec61` | fix(38-02): update in-repo Slack twin tests to tightened oauth.v2.access contract |
| `af51fb3` | feat(38-03): add dynamic conversation scope helpers to method-scopes.ts |
| `2488602` | feat(38-03): wire conversations.list/info/history to resolved scope helpers |
| `14c45f7` | feat(38-04): normalize files.completeUploadExternal input and return Slack-shaped metadata |
| `102c627` | feat(38-04): response_url replace/delete original + filesUploadV2 content-type |

---

### Human Verification Required

None — all Phase 38 behaviors are fully exercised by automated SDK integration tests. The SUMMARY confirms 287/287 tests pass after all plans completed.

---

### Gaps Summary

No gaps. All 14 must-haves are verified at all three levels (exists, substantive, wired). All four requirement IDs (SLCK-20, SLCK-21, SLCK-22, SLCK-23) are satisfied with implementation evidence and green test coverage. All referenced commits exist. No blocker anti-patterns found in production code.

The single documentation staleness noted (38-VALIDATION.md frontmatter showing `pending` statuses) is informational only — it predates execution and does not affect the correctness of any implementation.

---

_Verified: 2026-03-14T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
