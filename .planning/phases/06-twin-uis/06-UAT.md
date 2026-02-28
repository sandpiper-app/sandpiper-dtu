---
status: complete
phase: 06-twin-uis
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md
started: 2026-02-28T19:30:00Z
updated: 2026-02-28T19:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Shopify UI Layout & Navigation
expected: Visit Shopify twin /ui path. Page renders with Pico CSS styling, green accent color, and a sidebar containing links for Orders, Products, Customers, and Admin.
result: pass

### 2. Shopify Orders CRUD
expected: Navigate to /ui/orders — see orders table (or empty state). Click "New" to create an order via form. After submit, redirected to list showing new order. Click order to see detail page with fields and raw JSON toggle. Edit the order, submit — detail shows updated values. Delete an order via the table's delete button — row disappears without full page reload (HTMX).
result: issue
reported: "raw json on the order detail page shows &quot; instead of actual quote characters (double-escaped HTML entities). Also, should be able to attach products to orders from the list of existing products, which also requires being able to assign prices to products."
severity: major

### 3. Shopify Products CRUD
expected: Navigate to /ui/products — see products table. Create a new product via /ui/products/new form. After submit, product appears in list. Click to view detail with raw JSON toggle. Edit and delete work same as orders.
result: pass

### 4. Shopify Customers CRUD
expected: Navigate to /ui/customers — see customers table. Create a new customer via form. View detail. Edit and delete work same as orders/products.
result: pass

### 5. Shopify Admin Dashboard
expected: Navigate to /ui/admin — see dashboard with entity count cards (orders, products, customers). Webhook subscriptions link/page is accessible. Reset button is present.
result: pass

### 6. Slack UI Layout & Navigation
expected: Visit Slack twin /ui path. Page renders with Pico CSS styling, purple accent color, and a sidebar containing links for Channels, Users, and Admin.
result: pass

### 7. Slack Channel Detail & Message Timeline
expected: Navigate to /ui/channels. Create a channel via form. Open channel detail — see chronological message timeline (messages listed with user, timestamp, and content). At the bottom, an inline "Post Message" form allows typing and submitting a message. After posting, message appears in the timeline.
result: pass

### 8. Slack Users CRUD
expected: Navigate to /ui/users — see users table. Create a new user via form. View user detail. Edit user fields. Delete a user — row removed.
result: pass

### 9. Slack Admin Dashboard
expected: Navigate to /ui/admin — see dashboard with state counts (channels, users, messages, tokens, event subscriptions). Events page accessible showing registered event subscriptions. Reset button present.
result: pass

### 10. Cross-System Visibility
expected: Create an entity via the UI (e.g., Slack channel via /ui/channels/new). Then query the API (e.g., conversations.list) — the UI-created entity appears in API responses, confirming UI and API share the same state.
result: pass

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Raw JSON on detail pages displays properly formatted JSON with real quote characters"
  status: failed
  reason: "User reported: raw JSON shows &quot; instead of actual quotes — double-escaped HTML entities in the Raw JSON toggle on detail pages across both twins (orders, products, customers, channels)"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Both twin APIs conform fully to their upstream equivalents — Slack supports GET for read methods and form-urlencoded bodies; Shopify GraphQL and REST match official API behavior. Validated against client libraries and API documentation."
  status: failed
  reason: "User reported: all twin API endpoints (both Slack and Shopify) need a full conformance audit against upstream client libraries and API documentation. Slack is currently POST-only with JSON bodies but real Slack supports GET for reads and form-urlencoded. Shopify needs equivalent validation."
  severity: major
  test: 10
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Webhook subscriptions page allows adding new webhook subscriptions directly from the UI"
  status: failed
  reason: "User requested: webhook subscriptions page should have input to add webhooks from UI rather than requiring API or GraphQL calls"
  severity: minor
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Orders support attaching products from existing product list with prices"
  status: failed
  reason: "User requested: should be able to attach products to orders from the list of products that currently exist, which also requires being able to assign prices to products"
  severity: minor
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Admin page has a Load Fixtures button to seed data from the UI"
  status: failed
  reason: "User requested: should be able to trigger load fixtures from the admin UI page"
  severity: minor
  test: 9
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
