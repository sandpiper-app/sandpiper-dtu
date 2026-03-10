---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - twins/shopify/conformance/adapters/live-adapter.ts
  - .github/workflows/conformance.yml
autonomous: true
requirements: []

must_haves:
  truths:
    - "Live conformance can authenticate with client_id + client_secret instead of a short-lived access_token"
    - "SHOPIFY_ACCESS_TOKEN still works as a fallback (backward-compatible)"
    - "CI workflow uses long-lived credential env vars for the scheduled live run"
    - "Startup fails fast with a clear error if neither credential set is provided"
  artifacts:
    - path: "twins/shopify/conformance/adapters/live-adapter.ts"
      provides: "Updated ShopifyLiveAdapter that accepts SHOPIFY_CLIENT_ID+SHOPIFY_CLIENT_SECRET or SHOPIFY_ACCESS_TOKEN"
    - path: ".github/workflows/conformance.yml"
      provides: "Updated live conformance job using SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET secrets"
  key_links:
    - from: "ShopifyLiveAdapter constructor"
      to: "POST /admin/oauth/access_token"
      via: "fetch at init() time when client credentials provided"
      pattern: "grant_type.*client_credentials|client_id.*client_secret"
    - from: ".github/workflows/conformance.yml"
      to: "ShopifyLiveAdapter env vars"
      via: "SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET secrets replacing SHOPIFY_ACCESS_TOKEN"
---

<objective>
Switch Shopify live conformance from short-lived access tokens to long-lived app client credentials.

Purpose: `SHOPIFY_ACCESS_TOKEN` issued by Shopify's OAuth flow expires after 24 hours (online access mode). Custom App installations in a dev store issue offline access tokens that never expire — they can be obtained by exchanging `client_id` + `client_secret` via `POST /admin/oauth/access_token` with `grant_type=client_credentials`. This makes scheduled CI conformance runs reliable without token rotation.

Output: Updated live adapter that performs the exchange at startup, and updated CI workflow to use the new secret names.
</objective>

<execution_context>
@/Users/futur/.claude/get-shit-done/workflows/execute-plan.md
@/Users/futur/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Key interfaces the executor needs. -->
<interfaces>
From twins/shopify/conformance/adapters/live-adapter.ts (current):
```typescript
export class ShopifyLiveAdapter implements ConformanceAdapter {
  constructor() {
    this.baseUrl = process.env.SHOPIFY_STORE_URL ?? '';
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN ?? '';
    // throws if either missing
  }
  async init(): Promise<void> { /* validates token via GET /admin/api/2024-01/shop.json */ }
  async execute(op: ConformanceOperation): Promise<ConformanceResponse> { /* uses X-Shopify-Access-Token header */ }
  async teardown(): Promise<void> { /* no-op */ }
}
```

Shopify offline token exchange endpoint (Custom App):
  POST /admin/oauth/access_token
  Body: { client_id, client_secret, grant_type: 'client_credentials' }
  Response: { access_token: string, scope: string }

Note: `grant_type=client_credentials` is the Custom App flow. Standard OAuth code exchange
uses `code` instead. The Custom App flow skips user redirection entirely and issues an
offline (non-expiring) token directly from credentials.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update ShopifyLiveAdapter to support client credentials</name>
  <files>twins/shopify/conformance/adapters/live-adapter.ts</files>
  <action>
Rewrite ShopifyLiveAdapter to accept either credential set:

Priority order (checked in constructor):
1. `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` — exchange for offline token at `init()` time
2. `SHOPIFY_ACCESS_TOKEN` — use directly (backward-compatible legacy path)

Constructor logic:
- If `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` are both set → set `this.useClientCredentials = true`, store them, leave `this.accessToken = ''` (populated in `init()`)
- Else if `SHOPIFY_ACCESS_TOKEN` is set → `this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN`, `this.useClientCredentials = false`
- Else → throw: `'Provide SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (recommended, long-lived) or SHOPIFY_ACCESS_TOKEN (expires in 24h)'`

`init()` change:
- If `this.useClientCredentials`:
  - `POST ${this.baseUrl}/admin/oauth/access_token` with `Content-Type: application/json`
  - Body: `{ client_id, client_secret, grant_type: 'client_credentials' }`
  - Parse response as `{ access_token: string }` — store in `this.accessToken`
  - On non-2xx or missing `access_token`: throw with status code and hint to check credentials/scopes
- Then validate (as before) with `GET /admin/api/2024-01/shop.json` using the obtained token

`execute()` and `teardown()` are unchanged — they already use `this.accessToken`.

Update the file-level JSDoc comment to reflect both auth modes.
  </action>
  <verify>
    <automated>cd /Users/futur/projects/sandpiper-dtu && pnpm --filter @dtu/twin-shopify run build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes with no TypeScript errors. The adapter exports the same `ShopifyLiveAdapter` class with backward-compatible constructor (no breaking change to callers that set SHOPIFY_ACCESS_TOKEN).</done>
</task>

<task type="auto">
  <name>Task 2: Update CI workflow to use long-lived credential secrets</name>
  <files>.github/workflows/conformance.yml</files>
  <action>
In the `conformance-live` job (Shopify scheduled live run), replace the env block:

Before:
```yaml
env:
  SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
  SHOPIFY_ACCESS_TOKEN: ${{ secrets.SHOPIFY_ACCESS_TOKEN }}
```

After:
```yaml
env:
  SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
  SHOPIFY_CLIENT_ID: ${{ secrets.SHOPIFY_CLIENT_ID }}
  SHOPIFY_CLIENT_SECRET: ${{ secrets.SHOPIFY_CLIENT_SECRET }}
```

Add a comment above the step explaining why:
```yaml
# Uses Custom App client credentials (long-lived, no expiry) instead of an
# OAuth access token (expires 24h). Set SHOPIFY_CLIENT_ID and
# SHOPIFY_CLIENT_SECRET in repo secrets from the Shopify Partner Dashboard
# or Store Admin > Apps > Develop apps > [your app] > API credentials.
```

Do NOT change the Slack job or any other job. The `SHOPIFY_ACCESS_TOKEN` secret reference is removed — the workflow now requires `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` GitHub secrets to be set.
  </action>
  <verify>
    <automated>cd /Users/futur/projects/sandpiper-dtu && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/conformance.yml')); print('YAML valid')"</automated>
  </verify>
  <done>conformance.yml is valid YAML. The `conformance-live` job env block contains `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` (not `SHOPIFY_ACCESS_TOKEN`). All other jobs are unchanged.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @dtu/twin-shopify run build` exits 0
- `twins/shopify/conformance/adapters/live-adapter.ts` contains `grant_type.*client_credentials` or `client_credentials`
- `twins/shopify/conformance/adapters/live-adapter.ts` still references `SHOPIFY_ACCESS_TOKEN` (backward compat)
- `.github/workflows/conformance.yml` contains `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` under `conformance-live`
- `.github/workflows/conformance.yml` does NOT contain `SHOPIFY_ACCESS_TOKEN` under `conformance-live`
- YAML parses without errors
</verification>

<success_criteria>
Running `conformance:live` with `SHOPIFY_CLIENT_ID=xxx SHOPIFY_CLIENT_SECRET=yyy SHOPIFY_STORE_URL=https://...` connects to the store and obtains a token without needing a pre-issued access token. The same adapter still works with `SHOPIFY_ACCESS_TOKEN` for anyone with an existing token. The scheduled CI workflow no longer depends on a secret that rotates every 24 hours.
</success_criteria>

<output>
After completion, create `.planning/quick/1-live-tests-currently-require-shopify-acc/1-SUMMARY.md`
</output>
