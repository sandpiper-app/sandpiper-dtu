---
phase: quick-1
plan: "01"
subsystem: shopify-live-conformance
tags: [shopify, conformance, auth, ci, credentials]
dependency_graph:
  requires: []
  provides: [long-lived-shopify-credentials, client-credentials-auth]
  affects: [twins/shopify/conformance/adapters/live-adapter.ts, .github/workflows/conformance.yml]
tech_stack:
  added: []
  patterns: [client-credentials-grant, offline-token-exchange, backward-compatible-fallback]
key_files:
  created: []
  modified:
    - twins/shopify/conformance/adapters/live-adapter.ts
    - .github/workflows/conformance.yml
decisions:
  - "Mode 1 priority: SHOPIFY_CLIENT_ID+SECRET checked before SHOPIFY_ACCESS_TOKEN — offline tokens never expire vs 24h TTL"
  - "Token exchange at init() not constructor — defers network calls to after object construction; constructor stays synchronous"
  - "Fail-fast error message names both credential modes — removes ambiguity for new operators setting up CI"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 1: Live Tests Currently Require Shopify Account — Summary

**One-liner:** ShopifyLiveAdapter exchanges client_id+client_secret for an offline (non-expiring) token via Shopify's Custom App grant_type=client_credentials flow, with SHOPIFY_ACCESS_TOKEN kept as a backward-compatible fallback.

## What Was Built

The Shopify live conformance adapter previously required a `SHOPIFY_ACCESS_TOKEN` — a short-lived credential issued by Shopify's online OAuth flow that expires every 24 hours. This made weekly scheduled CI runs unreliable: the token would expire between runs, causing silent failures until someone manually rotated it.

The fix uses Shopify's Custom App credential flow: `client_id` + `client_secret` are long-lived secrets that never expire. At `init()` time the adapter exchanges them for an offline access token via `POST /admin/oauth/access_token` with `grant_type=client_credentials`. This token also never expires, making scheduled CI runs reliable indefinitely.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update ShopifyLiveAdapter to support client credentials | abd901c | twins/shopify/conformance/adapters/live-adapter.ts |
| 2 | Update CI workflow to use long-lived credential secrets | 9cbaa5f | .github/workflows/conformance.yml |

## Decisions Made

**Token exchange at init(), not constructor**
Constructor stays synchronous (cleaner interface). Network call to `/admin/oauth/access_token` happens in `init()` alongside the existing shop.json health check.

**Mode 1 checked before Mode 2**
If both `SHOPIFY_CLIENT_ID+SECRET` and `SHOPIFY_ACCESS_TOKEN` are set, client credentials win. This prevents a stale legacy token from being used when someone has set up the recommended long-lived credentials.

**Error message names both credential modes**
`'Provide SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (recommended, long-lived) or SHOPIFY_ACCESS_TOKEN (expires in 24h)'` — removes ambiguity for operators new to the setup.

## Operator Setup Required

To use the new CI flow, add two GitHub repository secrets:

- `SHOPIFY_CLIENT_ID` — from Shopify Partner Dashboard or Store Admin > Apps > Develop apps > [your app] > API credentials
- `SHOPIFY_CLIENT_SECRET` — same location as above

Remove or leave the old `SHOPIFY_ACCESS_TOKEN` secret — it is no longer referenced by the `conformance-live` job.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files modified:
- [x] twins/shopify/conformance/adapters/live-adapter.ts — updated, contains `grant_type: 'client_credentials'` and `SHOPIFY_ACCESS_TOKEN` backward-compat path
- [x] .github/workflows/conformance.yml — updated, conformance-live job uses SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET, no SHOPIFY_ACCESS_TOKEN

Commits:
- [x] abd901c — feat(quick-1-01): support client_id+client_secret auth in ShopifyLiveAdapter
- [x] 9cbaa5f — feat(quick-1-02): switch conformance-live CI job to long-lived client credentials

Build: `pnpm --filter @dtu/twin-shopify run build` exits 0

## Self-Check: PASSED
