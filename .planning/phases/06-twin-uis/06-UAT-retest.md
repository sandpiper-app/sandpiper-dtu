---
status: complete
phase: 06-twin-uis
source: 06-UAT.md (gap retest after plans 04-06)
started: 2026-02-28T18:45:00Z
updated: 2026-02-28T19:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Raw JSON Display (No Double-Escaping)
expected: Open any detail page with the Raw JSON toggle. JSON should display with real quote characters — no literal &quot; text.
result: pass

### 2. Slack API GET + Form-Urlencoded Conformance
expected: Slack read methods (conversations.list, conversations.info, conversations.history, users.list, users.info) accept GET with Bearer token. Write methods (chat.postMessage, oauth.v2.access) accept form-urlencoded POST bodies. Token accepted via Bearer header, body param, or query param.
result: pass
validated_by: 14 Slack conformance tests + 2 Shopify conformance tests (all passing)

### 3. Webhook Subscription Create Form
expected: Navigate to Shopify /ui/admin/webhooks. Page shows a create form with topic dropdown and callback URL input above the subscriptions table. Submit creates a new webhook subscription.
result: pass

### 4. Order-Product Association with Prices
expected: Navigate to Shopify /ui/products — create or edit a product and see a price field. Navigate to /ui/orders/new — see product checkboxes with quantity inputs for line item selection. Submit creates order with associated products.
result: pass

### 5. Admin Load Fixtures Button
expected: Both Shopify /ui/admin and Slack /ui/admin pages show a "Load Fixtures" button. Clicking it seeds sample data (Shopify: 2 products, 2 customers, 2 orders; Slack: 2 channels, 2 users). Entity counts update after loading.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Webhook topic dropdown includes Shopify mandatory compliance webhooks (customers/data_request, customers/redact, shop/redact)"
  status: missing
  reason: "User reported: compliance webhooks from https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance are not in the topic dropdown"
  severity: minor
  test: 3
  root_cause: ""
  artifacts: []
  missing:
    - "Add mandatory compliance webhook topics to the webhook subscription topic dropdown"
    - "Consider adding compliance webhook endpoint handling in the twin"
  debug_session: ""

- truth: "Price field normalizes numeric input to consistent decimal format (e.g. '60' → '60.00')"
  status: missing
  reason: "User reported: price is stored as plain string without formatting — '60' and '60.00' are not treated as equivalent"
  severity: minor
  test: 4
  root_cause: ""
  artifacts: []
  missing:
    - "Normalize price to 2-decimal string on create/update (parseFloat then toFixed(2))"
  debug_session: ""

## Additional Fix Applied

- **Trailing slash 404**: Both twins returned `Route GET:/ui/ not found` because Fastify defaults to strict trailing slash matching. Fixed by adding `ignoreTrailingSlash: true` to Fastify config in both `twins/shopify/src/index.ts` and `twins/slack/src/index.ts`.
