---
phase: 30-slack-transport-state-fixes
plan: 01
subsystem: api
tags: [slack, events-api, hmac, fetch, webhook-delivery]

# Dependency graph
requires:
  - phase: 25-slack-state-tables
    provides: SlackStateManager with listEventSubscriptions()
  - phase: 26-slack-scope-enforcement
    provides: EventDispatcher integration in Slack twin
provides:
  - EventDispatcher delivering events via direct fetch() with Slack HMAC headers only
  - No X-Shopify-Hmac-Sha256 header contamination in Slack event deliveries
affects: [31-slack-transport-state-fixes, any plan testing Slack event delivery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct fetch() with X-Slack-Signature + X-Slack-Request-Timestamp headers for event delivery (same pattern as interactions.ts)"

key-files:
  created: []
  modified:
    - twins/slack/src/services/event-dispatcher.ts
    - twins/slack/src/index.ts

key-decisions:
  - "Bypass WebhookQueue entirely for Slack event delivery — direct fetch() is the cleanest fix since deliverWebhook() unconditionally injects Shopify headers before merging delivery.headers"
  - "EventDispatcherOptions.webhookQueue removed — EventDispatcher is now independent of @dtu/webhooks package"
  - "AbortSignal.timeout(5000) added for individual delivery timeout; network errors are non-fatal (log and continue)"

patterns-established:
  - "Slack event delivery pattern: JSON body + v0=${createHmac('sha256', secret).update(v0:ts:body).digest('hex')} sig in X-Slack-Signature header"

requirements-completed: [SLCK-16]

# Metrics
duration: 1min
completed: 2026-03-13
---

# Phase 30 Plan 01: Slack Event Dispatcher Direct fetch() Summary

**Slack EventDispatcher rewritten to deliver events via direct fetch() with Slack HMAC headers, eliminating X-Shopify-Hmac-Sha256 header contamination — SLCK-16a GREEN**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-13T20:20:51Z
- **Completed:** 2026-03-13T20:22:12Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed WebhookQueue dependency from EventDispatcher entirely
- Replaced webhookQueue.enqueue() with direct fetch() using only Slack-protocol headers
- SLCK-16a: events now carry `X-Slack-Signature: v0=<64 hex chars>` and `X-Slack-Request-Timestamp`
- SLCK-16b and SLCK-16c (interaction routing) already passing — confirmed no regression
- All 4 tests in slack-signing.test.ts GREEN; pre-existing 4 failures in slack-state-tables.test.ts unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace WebhookQueue with direct fetch() in EventDispatcher** - `4a106f4` (feat)

**Plan metadata:** (see below)

## Files Created/Modified
- `twins/slack/src/services/event-dispatcher.ts` - Removed WebhookQueue/randomUUID imports; replaced enqueue() with direct fetch() + Slack HMAC signing; AbortSignal.timeout(5000) for delivery timeout
- `twins/slack/src/index.ts` - Removed `webhookQueue` argument from `new EventDispatcher({...})` constructor call

## Decisions Made
- Bypass WebhookQueue entirely for Slack event delivery: `deliverWebhook()` in the webhooks package unconditionally injects Shopify headers (`X-Shopify-Hmac-Sha256`, `X-Shopify-Topic`, `X-Shopify-Webhook-Id`) before spreading `delivery.headers`. Shopify headers always win since they are written first. Direct fetch() is the correct pattern — same approach already used in `interactions.ts`.
- `randomUUID` import removed from `event-dispatcher.ts` — it was only used for `delivery.id` in the enqueue call, which no longer exists.
- `AbortSignal.timeout(5000)` added as a lightweight delivery timeout; individual subscription delivery failure is non-fatal (log and continue).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SLCK-16 requirement satisfied; Plan 30-01 complete
- Slack event delivery is now protocol-correct for Bolt-based receivers
- Phase 30 continues with remaining plans (transport/state fixes per ROADMAP)

---
*Phase: 30-slack-transport-state-fixes*
*Completed: 2026-03-13*
