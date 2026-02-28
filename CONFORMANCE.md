# Twin Conformance Process

How we ensure twins behave identically to the real services they clone.

## Core Principle

Every twin endpoint must be indistinguishable from the real API at the HTTP boundary.
A test that passes against the twin must also pass against the real service, and vice versa.

## Conformance Dimensions

Every endpoint is validated across these dimensions:

| Dimension | What to check | Example |
|-----------|--------------|---------|
| HTTP Methods | Which methods does the real API accept? | Slack reads accept GET+POST |
| Content Types | JSON, form-urlencoded, multipart? | Slack oauth requires form-urlencoded |
| Authentication | Bearer header, body param, query param, custom header? | Slack accepts all three |
| Response Shape | Field names, nesting, types | `{ ok: true, channels: [...] }` |
| Error Format | HTTP status codes, error field names, error codes | Slack returns 200 + `{ ok: false }` |
| Pagination | Cursor format, next_cursor location | Base64-encoded ID cursors |
| Rate Limiting | Headers, status codes, retry-after format | 429 + Retry-After header |

## Running Conformance Tests

### Shopify Twin

```bash
cd twins/shopify
pnpm run conformance:twin      # Test twin against itself (fast, no external deps)
pnpm run conformance:live      # Compare twin vs real Shopify API (requires credentials)
pnpm run conformance:offline   # Compare twin vs recorded fixtures
pnpm run conformance:record    # Record real API responses as fixtures
```

Required env vars for live mode:
- `SHOPIFY_STORE_URL` — e.g. `https://my-dev-store.myshopify.com`
- `SHOPIFY_ACCESS_TOKEN` — Admin API access token

### Slack Twin

```bash
cd twins/slack
pnpm run conformance:twin      # Test twin against itself (fast, no external deps)
pnpm run conformance:live      # Compare twin vs real Slack API (requires credentials)
pnpm run conformance:offline   # Compare twin vs recorded fixtures
pnpm run conformance:record    # Record real API responses as fixtures
```

Required env vars for live mode:
- `SLACK_BOT_TOKEN` — xoxb- bot token for a test workspace

Optional:
- `SLACK_BASE_URL` — Override API base URL (default: `https://slack.com`)

## New Endpoint Checklist

When adding a new API endpoint to an existing twin:

- [ ] Read the official API documentation for the endpoint
- [ ] Read the official client SDK source to see how it makes requests
- [ ] Implement the endpoint matching all conformance dimensions above
- [ ] Add a conformance test in the appropriate suite file (`twins/{name}/conformance/suites/`)
- [ ] Run `pnpm run conformance:twin` — new test passes
- [ ] If live API access available: run `pnpm run conformance:live` to validate against real API
- [ ] If live API access available: run `pnpm run conformance:record` to capture fixture for offline mode

## New Twin Checklist

When creating a twin for a new service:

- [ ] Study the service's API documentation thoroughly
- [ ] Study the official client SDK (how does it make requests? what content types? auth mechanism?)
- [ ] Create twin: `twins/{name}/src/` — implement `buildApp()` factory that returns a ready Fastify instance
- [ ] Create conformance directory: `twins/{name}/conformance/`
- [ ] Create twin adapter: `conformance/adapters/twin-adapter.ts` (implements `ConformanceAdapter` using `buildApp()` + `inject()`)
- [ ] Create live adapter: `conformance/adapters/live-adapter.ts` (implements `ConformanceAdapter` using `fetch()` against real API)
- [ ] Create normalizer: `conformance/normalizer.ts` (strip timestamps, IDs, tokens — any non-deterministic field)
- [ ] Create conformance suites: `conformance/suites/*.conformance.ts` — one file per API domain
- [ ] Create index: `conformance/index.ts` (combine suites, export adapters and normalizer)
- [ ] Add `@dtu/conformance` to `package.json` dependencies
- [ ] Add npm scripts: `conformance:twin`, `conformance:live`, `conformance:offline`, `conformance:record`
- [ ] Run `conformance:twin` — all tests pass
- [ ] Run `conformance:live` — compare against real API (if access available)
- [ ] Record fixtures: `conformance:record` — baseline for offline comparison

## Architecture

```
packages/conformance/               Generic framework (runner, comparator, CLI)
  src/types.ts                      ConformanceAdapter, ConformanceSuite, ConformanceTest interfaces
  src/runner.ts                     Test execution engine
  src/cli.ts                        CLI entrypoint (--mode twin/live/offline, --record)

twins/shopify/conformance/          Shopify conformance tests
  adapters/twin-adapter.ts          In-process adapter (buildApp + inject, X-Shopify-Access-Token)
  adapters/live-adapter.ts          Real Shopify Admin API adapter (fetch, X-Shopify-Access-Token)
  normalizer.ts                     Strip created_at/updated_at, normalize GIDs
  suites/orders.conformance.ts      GraphQL order create/list/validate tests
  suites/products.conformance.ts    GraphQL product create/list/validate tests
  suites/webhooks.conformance.ts    Webhook subscription registration tests
  fixtures/                         Recorded Shopify API responses for offline mode
  index.ts                          shopifyConformanceSuite + exports

twins/slack/conformance/            Slack conformance tests
  adapters/twin-adapter.ts          In-process adapter (buildApp + inject, OAuth for bot token)
  adapters/live-adapter.ts          Real Slack API adapter (fetch, SLACK_BOT_TOKEN)
  normalizer.ts                     Strip ts/created/updated, normalize IDs/tokens
  suites/conversations.conformance.ts  conversations.list/info/history (GET+POST, pagination, auth)
  suites/chat.conformance.ts        chat.postMessage/update (text, blocks, form-urlencoded, errors)
  suites/users.conformance.ts       users.list/info (GET+POST, not-found error)
  suites/oauth.conformance.ts       oauth.v2.access (form-urlencoded, response shape, no-code error)
  fixtures/                         Recorded Slack API responses for offline mode
  index.ts                          slackConformanceSuite + exports
```

## CI Integration

Conformance tests run on two schedules:

- **On PR**: `conformance:twin` — fast (< 5s), no external dependencies, catches regressions
- **Weekly**: `conformance:live` — validates against real APIs, requires credentials stored as secrets

Add to your PR CI workflow:
```yaml
- name: Shopify conformance (twin mode)
  run: pnpm --filter @dtu/twin-shopify run conformance:twin

- name: Slack conformance (twin mode)
  run: pnpm --filter @dtu/twin-slack run conformance:twin
```

## When Tests Fail

A conformance test failure means the twin's behavior diverges from the real API.

1. **Check if the real API changed** (upstream drift) — update the twin to match the real API's new behavior
2. **Check if the twin regressed** (code change broke conformance) — fix the twin, not the test
3. **Never "fix" the test to match the twin** — the test defines correct behavior

The `conformance:live` mode is the source of truth. The `conformance:twin` mode verifies the twin self-consistently.
