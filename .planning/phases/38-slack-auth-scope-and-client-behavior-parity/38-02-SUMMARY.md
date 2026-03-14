---
phase: 38-slack-auth-scope-and-client-behavior-parity
plan: 02
subsystem: auth
tags: [slack, oauth, oidc, jwt, token-validation, scope-enforcement]

# Dependency graph
requires:
  - phase: 35-slack-behavioral-parity
    provides: "openid.connect.token handler, METHOD_SCOPES, scope enforcement infrastructure"
  - phase: 31-slack-oauth-method-coverage
    provides: "oauth.v2.access CodeBinding interface, client_id validation"
provides:
  - "client_secret validation and granted-scope propagation for oauth.v2.access"
  - "stateful OIDC token issuance and dedicated openid.connect.userInfo handler"
  - "app-token enforcement for apps.connections.open (rejects bot tokens)"
  - "token-class-aware auth.test identity response (bot/user/app branches)"
  - "seedSlackAppToken() seeder for Socket Mode tests"
  - "Wave 0 slack-auth-parity.test.ts proving all four token defects fixed"
affects: [38-03, 38-04, slack-bolt-socket-mode-receiver]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLIENT_SECRETS map for credential validation at token exchange (same shape in oauth.ts and new-families.ts)"
    - "token_type branch pattern in auth.test handler — bot/user/app branches return correct identity shape"
    - "seedSlackAppToken() parallel to seedSlackBotToken() for app-token-gated routes"

key-files:
  created:
    - tests/sdk-verification/sdk/slack-auth-parity.test.ts
  modified:
    - twins/slack/src/plugins/oauth.ts
    - twins/slack/src/plugins/web-api/new-families.ts
    - twins/slack/src/plugins/web-api/stubs.ts
    - twins/slack/src/plugins/web-api/auth.ts
    - tests/sdk-verification/setup/seeders.ts
    - tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts
    - twins/slack/test/smoke.test.ts
    - twins/slack/test/auth.test.ts
    - twins/slack/test/web-api.test.ts
    - twins/slack/test/ui.test.ts
    - twins/slack/test/integration.test.ts

key-decisions:
  - "CLIENT_SECRETS map in oauth.ts maps client_id to expected client_secret; unknown client_id or wrong secret returns invalid_client before code lookup"
  - "oauth.v2.access now uses binding.scope (not hardcoded scopes) — bot and user tokens both carry the authorize-time granted scope string"
  - "U_AUTHED user seeded idempotently at oauth.v2.access exchange time so auth.test user branch returns real identity (name='authed-user', email='authed-user@twin.dev')"
  - "openid.connect.token calls createToken() before returning — OIDC access_token is stateful and accepted by openid.connect.userInfo"
  - "apps.connections.open enforces BOTH token_type==='app' AND token.startsWith('xapp-') — bot tokens with connections:write scope are rejected"
  - "auth.test branches on token_type: user → omit bot_id, return user identity; app → omit bot_id, return app_id; bot → preserve existing response"
  - "In-repo Slack twin tests updated to pass client_id='test' + client_secret='test' at exchange AND request broader scopes at authorize time to cover all tested methods"
  - "seedSlackAppToken() dedicated seeder with tokenType='app' for Socket Mode tests; seedSlackBotToken() unchanged"

patterns-established:
  - "CLIENT_SECRETS credential map: same structure duplicated in oauth.ts and new-families.ts — no shared module needed since map is small and both files are no-auth entry points"
  - "Idempotent user creation before token issuance: check getUser() before createUser() to avoid UNIQUE constraint errors on repeated calls in same session"
  - "In-repo test authorize URL must request all scopes the test body needs — tightened scope propagation means bot tokens only get what was granted"

requirements-completed: [SLCK-20, SLCK-23]

# Metrics
duration: 40min
completed: 2026-03-14
---

# Phase 38 Plan 02: Slack Auth and Token Semantics Fix Summary

**oauth.v2.access validates client_secret and echoes granted scope; OIDC tokens are stateful; apps.connections.open enforces app-token type; auth.test returns correct identity per token class**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-03-14T14:45:00Z
- **Completed:** 2026-03-14T15:28:53Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Fixed `oauth.v2.access` to validate `client_secret` via a `CLIENT_SECRETS` map and return `invalid_client` for unknown or mismatched credentials; bot and user tokens now carry the exact scope string granted at authorize time instead of hardcoded values
- Made `openid.connect.token` stateful — issued tokens are stored via `createToken()` and accepted by a dedicated `openid.connect.userInfo` handler that reads token record and user identity from state
- Added app-token gate to `apps.connections.open` (rejects tokens with `token_type !== 'app'` or not prefixed `xapp-`) and made `auth.test` token-class-aware (user branch omits bot_id, app branch includes app_id)
- Updated all in-repo Slack twin tests to pass explicit client credentials and added `seedSlackAppToken()` seeder; Socket Mode test now seeds the app token with the correct token type

## Task Commits

Each task was committed atomically:

1. **Task 1: Stateful OIDC and credential-validating oauth.v2.access** - `5ea2c80` (feat)
2. **Task 2: App-token enforcement and token-class-aware auth.test** - `a7eaf1c` (feat)
3. **Task 3: Update in-repo tests to tightened oauth.v2.access contract** - `986ec61` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tests/sdk-verification/sdk/slack-auth-parity.test.ts` - Wave 0 auth/token parity tests (6 tests covering OIDC round-trip, client_secret rejection, scope echo, app-token gate, auth.test identity)
- `twins/slack/src/plugins/oauth.ts` - CLIENT_SECRETS map, client_secret validation, binding.scope propagation, U_AUTHED seeding
- `twins/slack/src/plugins/web-api/new-families.ts` - Stateful openid.connect.token, dedicated openid.connect.userInfo handler
- `twins/slack/src/plugins/web-api/stubs.ts` - app-token gate in apps.connections.open
- `twins/slack/src/plugins/web-api/auth.ts` - token-class-aware identity branches
- `tests/sdk-verification/setup/seeders.ts` - seedSlackAppToken() with tokenType='app'
- `tests/sdk-verification/sdk/slack-bolt-socket-mode-receiver.test.ts` - Use seedSlackAppToken() for APP_TOKEN
- `twins/slack/test/{smoke,auth,web-api,ui,integration}.test.ts` - client credentials + broader authorize scopes

## Decisions Made

- CLIENT_SECRETS map duplicated in `oauth.ts` and `new-families.ts` (not shared) — both files are no-auth entry points; the map is small and no circular import risk
- `oauth.v2.access` scope propagation: `binding.scope` is the exact scope string from the authorize step; both bot and user tokens get the SAME scope (not split into "bot scopes" / "user scopes")
- In-repo tests authorize with `scope=chat:write,channels:read,channels:history,users:read` to cover all methods tested — a single broad authorize keeps the existing test structure intact
- `auth.test` user branch: load user record for real name; `user?.name ?? 'authed-user'` pattern handles the case where U_AUTHED isn't found yet

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] In-repo test authorize URLs needed broader scope**
- **Found during:** Task 3 (update in-repo tests)
- **Issue:** After tightening oauth.v2.access to use binding.scope, the in-repo `web-api.test.ts` and `integration.test.ts` `beforeEach` hooks obtained tokens with `scope=chat:write` only, causing all `conversations.list`, `users.list`, etc. calls to fail with `missing_scope`
- **Fix:** Updated authorize URL in `beforeEach` to request `scope=chat:write,channels:read,channels:history,users:read` covering all methods tested in the file; updated `ui.test.ts` for `channels:read`
- **Files modified:** `twins/slack/test/web-api.test.ts`, `twins/slack/test/integration.test.ts`, `twins/slack/test/ui.test.ts`
- **Committed in:** `986ec61` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (missing critical — scope request breadth)
**Impact on plan:** The fix was necessary because scope propagation now correctly reflects the authorize-time grant. No scope creep.

## Issues Encountered

- Initial suspicion of test isolation failure for `apps.connections.open` tests was a false alarm — the failures were from running the full SDK suite BEFORE Task 2 stubs.ts changes were applied. After committing Task 2, all 287 SDK tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 38-03 (conversation scope parity) and 38-04 (client-visible behavior) are unblocked
- The `seedSlackAppToken()` seeder is ready for any future tests that exercise app-token routes
- Bot tokens now carry dynamically assigned scopes — any new in-repo test that calls scoped methods must request those scopes in the authorize step

---
*Phase: 38-slack-auth-scope-and-client-behavior-parity*
*Completed: 2026-03-14*
