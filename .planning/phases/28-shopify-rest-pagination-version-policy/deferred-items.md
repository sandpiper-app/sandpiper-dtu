# Deferred Items — Phase 28

## Pre-existing failures (out of scope for this plan)

### 1. rate-limit.test.ts — GraphQL Rate Limiting throttling test flaky

- **File:** twins/shopify/test/integration/rate-limit.test.ts
- **Test:** "returns HTTP 429 with Retry-After when bucket is depleted"
- **Failure:** expected responses array to contain 429 but all are 200
- **Status:** Pre-existing failure before Phase 28 changes (confirmed by running before/after)
- **Not caused by:** Phase 28-01 pagination.test.ts or SDK sentinel changes
- **Action needed:** Investigate rate-limit bucket depletion logic in isolation (separate plan/task)
