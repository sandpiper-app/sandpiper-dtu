---
phase: 03-webhook-system-conformance-framework
plan: 01
subsystem: infra
tags: [webhooks, sqlite, hmac, retry, exponential-backoff, dead-letter-queue, better-sqlite3]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: monorepo structure, shared package pattern, TypeScript config
  - phase: 02-shopify-core-twin
    provides: StateManager with SQLite connection for DLQ sharing

provides:
  - "@dtu/webhooks package with WebhookQueue, SqliteDeadLetterStore, deliverWebhook, generateHmacSignature"
  - "Async webhook delivery with exponential backoff (immediate, 1min, 5min at timeScale=1.0)"
  - "Compressed timing mode (timeScale=0.001) for fast test execution"
  - "SQLite-backed dead letter queue for permanently failed deliveries"
  - "Shopify twin integrated with WebhookQueue and DeadLetterStore via Fastify decorators"

affects:
  - 03-webhook-system-conformance-framework
  - 04-shopify-advanced-features
  - 05-slack-twin

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared package pattern: @dtu/webhooks follows @dtu/state structure (package.json, tsconfig.json, dist/)"
    - "In-memory queue with SQLite-backed DLQ: active queue uses Map+setTimeout, failures persist to SQLite"
    - "Compressed timing: timeScale multiplier on all delays, enabling ms-level retry tests"
    - "Sync mode for test assertions: syncMode=true makes enqueue() await delivery and throw on failure"
    - "Shared DB connection: SqliteDeadLetterStore accepts existing Database instance from StateManager"

key-files:
  created:
    - packages/webhooks/src/types.ts
    - packages/webhooks/src/webhook-delivery.ts
    - packages/webhooks/src/webhook-queue.ts
    - packages/webhooks/src/dead-letter.ts
    - packages/webhooks/src/index.ts
    - packages/webhooks/package.json
    - packages/webhooks/tsconfig.json
    - packages/webhooks/vitest.config.ts
    - packages/webhooks/test/webhook-queue.test.ts
  modified:
    - tsconfig.base.json
    - twins/shopify/src/index.ts
    - twins/shopify/package.json
    - pnpm-lock.yaml

key-decisions:
  - "In-memory queue with SQLite DLQ only: BullMQ+Redis rejected as over-engineered for local dev/test tool"
  - "Sync mode (syncMode=true) implemented for test simplicity: enqueue() awaits and throws"
  - "SqliteDeadLetterStore shares StateManager's DB connection to avoid multiple SQLite connections"
  - "Compressed timing via timeScale multiplier: 0.001 makes 1-minute retries happen in 60ms"
  - "Retry array [0, 60000, 300000]: 3 total attempts (immediate, 1min, 5min) before DLQ"
  - "Config-file webhook subscriptions loaded from WEBHOOK_SUBSCRIPTIONS_FILE env var"

patterns-established:
  - "WebhookQueue: construct with options, enqueue deliveries, shutdown() on close"
  - "SqliteDeadLetterStore: construct with existing Database, migrate on init, share with StateManager"
  - "Test pattern: in-memory SQLite + local HTTP server as callback target + syncMode for assertions"

requirements-completed: [INFRA-05]

# Metrics
duration: 13min
completed: 2026-02-27
---

# Phase 3 Plan 01: @dtu/webhooks Package Summary

**In-memory webhook queue with SQLite dead letter persistence, HMAC-SHA256 signing, compressed timing, and 10 passing integration tests integrated into Shopify twin**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-27T04:35:00Z (estimated from commit history)
- **Completed:** 2026-02-27T04:49:09Z
- **Tasks:** 2 (+ integration task)
- **Files modified:** 13

## Accomplishments
- Created `@dtu/webhooks` package with full webhook delivery infrastructure (WebhookQueue, SqliteDeadLetterStore, HMAC delivery)
- Implemented configurable exponential backoff with compressed timing (timeScale=0.001 enables ms-level test execution)
- Integrated WebhookQueue and SqliteDeadLetterStore into Shopify twin via Fastify decorators with shared DB connection
- 10 integration tests covering: delivery, retry, DLQ exhaustion, compressed timing, sync mode, shutdown, and HMAC verification

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Create @dtu/webhooks package** - `b0f3189` (feat)
2. **Integration: Integrate @dtu/webhooks into Shopify twin** - `2d5ca94` (feat)

**Plan metadata:** (created in this run) (docs)

## Files Created/Modified
- `packages/webhooks/src/types.ts` - WebhookDelivery, WebhookJob, DeadLetterEntry, WebhookQueueOptions, DeadLetterStore interface
- `packages/webhooks/src/webhook-delivery.ts` - HTTP POST with HMAC-SHA256, throws on non-2xx for retry
- `packages/webhooks/src/webhook-queue.ts` - In-memory Map+setTimeout queue with configurable retry/backoff
- `packages/webhooks/src/dead-letter.ts` - SQLite-backed DLQ using better-sqlite3 prepared statements
- `packages/webhooks/src/index.ts` - Re-exports all public API
- `packages/webhooks/test/webhook-queue.test.ts` - 10 integration tests with local HTTP server
- `packages/webhooks/package.json` - Package config with @dtu/types and better-sqlite3 deps
- `packages/webhooks/tsconfig.json` - Extends tsconfig.base.json, composite true, references ../types
- `packages/webhooks/vitest.config.ts` - Vitest config for node environment
- `tsconfig.base.json` - Added @dtu/webhooks path alias
- `twins/shopify/src/index.ts` - Integrated WebhookQueue, SqliteDeadLetterStore, config-file subscriptions
- `twins/shopify/package.json` - Added @dtu/webhooks workspace dependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- **No Redis dependency:** In-memory queue sufficient for local dev/test tool; BullMQ+Redis rejected as over-engineered
- **Shared DB connection:** SqliteDeadLetterStore accepts the existing StateManager Database instance
- **Sync mode:** `syncMode: true` makes `enqueue()` await delivery and throw on failure, simplifying test assertions
- **Compressed timing:** `timeScale: 0.001` scales all delays, enabling 1-minute retries to complete in 60ms during tests
- **Retry semantics:** `retryDelays: [0, 60000, 300000]` = 3 attempts total (attempt 0 immediate, retry 1 at 1min, retry 2 at 5min)

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written. The shopify twin integration (twins/shopify/src/index.ts) was added to complete the plan's stated objective ("replaces the current synchronous sendWebhook() in the Shopify twin") even though the specific files weren't listed in `files_modified` frontmatter.

## Issues Encountered
- None

## User Setup Required
None - no external service configuration required. The WebhookQueue operates locally with configurable env vars (WEBHOOK_TIME_SCALE, WEBHOOK_SYNC_MODE, WEBHOOK_SUBSCRIPTIONS_FILE).

## Next Phase Readiness
- `@dtu/webhooks` ready for use in Phase 4 (Shopify Advanced Features) for webhook subscription management via GraphQL mutations
- `@dtu/webhooks` ready for Slack twin (Phase 5) to use the same queue infrastructure
- Shopify twin has webhookQueue and deadLetterStore available via Fastify decorators for all plugins to use
- No blockers

## Self-Check: PASSED

- FOUND: packages/webhooks/src/webhook-queue.ts
- FOUND: packages/webhooks/src/dead-letter.ts
- FOUND: packages/webhooks/src/types.ts
- FOUND: packages/webhooks/test/webhook-queue.test.ts
- FOUND: .planning/phases/03-webhook-system-conformance-framework/03-01-SUMMARY.md
- FOUND: commit b0f3189
- FOUND: commit 2d5ca94

---
*Phase: 03-webhook-system-conformance-framework*
*Completed: 2026-02-27*
