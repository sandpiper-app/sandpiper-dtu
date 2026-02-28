# Phase 5: Slack Twin - Web API & Events - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Slack twin replicates Web API methods, Events API delivery, OAuth installation flow, and Block Kit button interactions — scoped to what Sandpiper actually uses. This is a test double, not a full Slack simulator. Modals, message_action, and view_submission are out of scope (deferred per SLCK-04 narrowing).

</domain>

<decisions>
## Implementation Decisions

### Response fidelity
- Sandpiper-only fields — only include response fields that Sandpiper actually reads
- Slack-realistic ID and timestamp formats — channels use C-prefix, users use U-prefix, teams use T-prefix, message timestamps use Slack's `ts` format (e.g., `1503435956.000247`)
- Error responses match Slack's format exactly — `{ok: false, error: "channel_not_found"}` with the same error codes Slack uses
- Rate limiting is configurable — toggle between: always succeed (default), return 429 after N calls, or realistic tier-based rate windows. Supports `Retry-After` header.

### Event delivery
- Near-immediate async delivery — events queued and delivered within milliseconds after the triggering API call returns (not synchronous, not delayed)
- Fire and forget — attempt delivery once, log the failure if callback URL is unreachable, move on (no retries)
- Only emit events Sandpiper uses — `message`, `app_mention`, `reaction_added` as listed in SLCK-02
- Request signing optional via config — signing secret available but disabled by default for simpler testing

### Workspace state & configuration
- Minimal seed on startup — one workspace, one `#general` channel, one bot user. Just enough to be immediately usable
- Environment variables for all configuration — `SLACK_TWIN_CALLBACK_URL`, `SLACK_TWIN_SIGNING_SECRET`, etc. Standard for Docker/CI
- Reset endpoint — `POST /admin/reset` clears all state back to seed for repeatable test runs
- Admin API for state inspection — endpoints like `GET /admin/messages`, `GET /admin/channels` for direct state inspection and test assertions

### Block Kit & interactions
- Structural + limits validation — validate block count (50-block limit), required fields per block type, and basic block structure
- Only validate block types Sandpiper actually sends — research phase will determine the exact list from Sandpiper's codebase
- Button click interactions triggered via admin API — `POST /admin/interact` with action_id and user, twin delivers interaction payload to app's response URL
- Response URL updates original message — when app responds to `response_url`, twin updates/replaces the original message in state

### Claude's Discretion
- Exact admin API endpoint naming and structure
- OAuth token generation approach (random vs deterministic)
- Internal event queue implementation
- SQLite schema design for Slack entities

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-slack-twin-web-api-events*
*Context gathered: 2026-02-28*
