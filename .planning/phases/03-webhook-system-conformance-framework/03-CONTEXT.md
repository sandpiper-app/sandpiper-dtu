# Phase 3: Webhook System & Conformance Framework - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-grade async webhook delivery for all twin state mutations, plus a generic conformance testing framework that validates twins behave identically to real APIs. Webhook delivery includes background queue, retry with backoff, dead letter queue, and HMAC signing. Conformance framework runs the same tests against twin AND real sandbox API, reports behavioral differences.

</domain>

<decisions>
## Implementation Decisions

### Webhook subscription model
- Mirror real Shopify API for registration (GraphQL mutations like `webhookSubscriptionCreate`)
- Also support config-file-based subscriptions as a convenience (like Shopify's `shopify.app.toml` approach)
- Both methods coexist — config file for defaults, API for runtime test changes

### Webhook payload format
- Full HMAC signing (X-Shopify-Hmac-SHA256) on all webhook deliveries — no shortcut mode
- Payloads match real Shopify's exact documented payload shape — same fields, nesting, types
- Auto-generate webhook topic for every state mutation the twin supports, not just four named topics

### Delivery & retry behavior
- Configurable delay multiplier for compressed time in tests (e.g., 0.001x so retries happen in milliseconds)
- Real timing available as default, compressed timing for test runs
- Exponential backoff schedule: immediate, 1min, 5min (as specified in success criteria)
- Failed deliveries after retries go to dead letter queue

### Claude's Discretion
- Dead letter queue inspection interface (admin API, log output, or both)
- Queue persistence strategy (in-memory vs SQLite-backed) — pick based on existing state management patterns
- Whether to support optional synchronous delivery mode for simpler test assertions
- Exact retry timing implementation

### Conformance framework scope
- Generic, reusable framework — any twin can plug in, not Shopify-specific
- Shopify is the first plugin, Slack reuses the same framework in Phase 5
- Framework lives in shared `@dtu/conformance` package

### Conformance test modes
- Live mode: runs against real Shopify dev store for accurate drift detection
- Offline mode: runs against recorded API fixtures — no credentials or network needed
- CI uses offline mode by default, periodic scheduled jobs use live mode

### Conformance comparison strategy
- Claude's discretion on handling non-deterministic fields (IDs, timestamps, created_at)
- Claude's discretion on test organization (per-behavior, per-endpoint, or per-requirement)

### Conformance reporting
- Summary table for quick overview (pass/fail per test)
- Diff-style output for each failure (expected vs actual, like git diff)
- Strict pass/fail — no "known differences" concept. Every difference is a failure.
- Claude's discretion on machine-readable output format (JUnit XML, JSON, or exit-code-only)
- Claude's discretion on upstream drift notification mechanism

</decisions>

<specifics>
## Specific Ideas

- Webhook registration should feel like using real Shopify — developers shouldn't learn a different API
- Config-file subscriptions are a convenience layer, not a replacement for the API interface
- Conformance strictness is intentional — forces you to fix or skip, no sweeping differences under the rug
- Dual-mode conformance (live + offline) enables fast CI without sacrificing accuracy on scheduled runs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-webhook-system-conformance-framework*
*Context gathered: 2026-02-27*
