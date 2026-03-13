# Phase 28: Shopify REST Pagination & Version Policy - Research

**Researched:** 2026-03-13
**Domain:** Shopify twin REST plugin — cursor pagination, API version validation
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-23 | Shopify REST list endpoints return `Link` header with `rel="next"` and `page_info` cursor parameter for paginated responses, matching real Shopify pagination format | Cursor encode/decode utilities exist (`services/cursor.ts`); `stateManager.listProducts()` etc. return full arrays; need slice-and-cursor logic in REST plugin handlers |
| SHOP-17 | Shopify twin serves routes with parameterized API version accepting any valid Shopify API version string; **unsupported/sunset versions return appropriate error responses**; test helpers no longer rewrite request URLs to a single version | `api-version.ts` regex accepts `2024-99` (syntactically valid, semantically nonsense); needs a supported-versions allow-list + sunset-versions reject-list |

</phase_requirements>

---

## Summary

Phase 28 closes two gaps found by the adversarial audit. **SHOP-23** is the higher-complexity gap: the REST plugin currently emits a `Link` header only when `?page_info=test` is present (a sentinel) — no slicing, no cursor advancement. The real Shopify REST API uses opaque cursor tokens encoded in the `page_info` query parameter; the twin already has `encodeCursor`/`decodeCursor` utilities in `services/cursor.ts` but they are only used by the GraphQL layer. The fix is to wire those same utilities into the REST list endpoints so each request computes a real slice, emits a `Link` header with encoded cursors, and advances on the next call.

**SHOP-17** is lower complexity: the current version regex `/(unstable|\d{4}-\d{2})/` accepts any four-digit year and two-digit month (`2024-99`, `9999-99`, etc.). The requirement says unsupported/sunset versions must return error responses. The fix adds an allow-list of supported versions and a reject-list (or age-threshold) for sunset versions, then maps each to an appropriate HTTP error shape matching real Shopify behavior.

**A critical side issue** affects both requirements: `twins/shopify/test/integration/pagination.test.ts` still uses the old OAuth pattern (`POST /admin/oauth/access_token` with only `code`) instead of `POST /admin/tokens` introduced in Phase 21-02. This causes 32+ test failures noted in the audit. Phase 28 must migrate that test file's token seeding before new pagination tests can run green.

**Primary recommendation:** Fix SHOP-23 first (higher value, self-contained), then SHOP-17 (version allow-list), and do the integration test migration in Wave 0 (failing test scaffold step).

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | (project-pinned) | Synchronous SQLite queries for cursor lookups | Already the state layer; synchronous fits Fastify request handlers |
| `node:crypto` / `Buffer` | built-in | Base64 encode/decode for `page_info` cursor tokens | No external dependency; `cursor.ts` already uses `Buffer` |
| `services/cursor.ts` | internal | `encodeCursor(type, id)` / `decodeCursor(token, type)` | Already implemented for GraphQL pagination; twin REST layer must reuse |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `services/api-version.ts` | internal | `parseShopifyApiVersion`, `setApiVersionHeader`, `buildAdminApiPath` | Extend for version policy: add allow-list, sunset detection |
| `StateManager.listProducts()` etc. | internal | Returns full arrays sorted by `id ASC` | Used as the source for paginated slices; no changes to StateManager needed |

### No New Dependencies

This phase requires zero new npm packages. All cursor encoding, version parsing, and state lookup utilities are already in the project.

---

## Architecture Patterns

### Recommended Project Structure (no new files needed)

The changes live entirely in two existing files:

```
twins/shopify/src/
├── services/
│   ├── api-version.ts      # Add version allow-list + sunset policy + error helper
│   └── cursor.ts           # No changes (already correct)
├── plugins/
│   └── rest.ts             # Replace sentinel pagination with real slice+cursor logic
twins/shopify/test/integration/
└── pagination.test.ts      # Migrate OAuth pattern; add REST pagination tests
tests/sdk-verification/sdk/
└── shopify-api-rest-client.test.ts   # Replace sentinel tests with real multi-page tests
```

### Pattern 1: REST Cursor Pagination (SHOP-23)

**What:** Each list endpoint reads `limit` (default 50, max 250) and `page_info` from query params. `page_info` is a base64-encoded `arrayconnection:{ResourceType}:{afterId}` cursor. The handler fetches all records, slices from `afterId` up to `limit`, then emits `Link` headers if pages exist before or after.

**When to use:** All `GET /*.json` list endpoints (products, orders, customers, inventory_items).

**Example:**
```typescript
// Source: services/cursor.ts (encodeCursor), extended pattern for REST plugin
import { encodeCursor, decodeCursor } from '../services/cursor.js';

// Inside list handler (e.g. GET /products.json):
const allItems = (fastify as any).stateManager.listProducts();
const limitParam = parseInt(String(req.query?.limit ?? '50'), 10);
const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 250);
const pageInfoToken = req.query?.page_info as string | undefined;

let afterId = 0;
if (pageInfoToken) {
  try {
    afterId = decodeCursor(pageInfoToken, 'Product');
  } catch {
    return reply.status(400).send({ errors: 'Invalid page_info cursor' });
  }
}

// Slice: items with id > afterId, take first `limit`
const startIdx = allItems.findIndex((p: any) => p.id > afterId);
const slice = startIdx === -1 ? [] : allItems.slice(startIdx, startIdx + limit);
const hasNext = startIdx !== -1 && startIdx + limit < allItems.length;
const hasPrev = afterId > 0;

if (hasNext) {
  const lastId = slice[slice.length - 1].id;
  const nextCursor = encodeCursor('Product', lastId);
  const nextUrl = `https://dev.myshopify.com${buildAdminApiPath(version, '/products.json')}?page_info=${nextCursor}&limit=${limit}`;
  // Build prev link only when we have a cursor (page 2+)
  const prevCursor = encodeCursor('Product', slice[0].id - 1); // points before first item on this page
  const prevUrl = `https://dev.myshopify.com${buildAdminApiPath(version, '/products.json')}?page_info=${prevCursor}&limit=${limit}`;
  const linkParts = [`<${nextUrl}>; rel="next"`];
  if (hasPrev) linkParts.unshift(`<${prevUrl}>; rel="previous"`);
  reply.header('Link', linkParts.join(', '));
} else if (hasPrev) {
  // Last page — only previous link
  const prevCursor = encodeCursor('Product', slice[0].id - 1);
  const prevUrl = `https://dev.myshopify.com${buildAdminApiPath(version, '/products.json')}?page_info=${prevCursor}&limit=${limit}`;
  reply.header('Link', `<${prevUrl}>; rel="previous"`);
}

return { products: slice };
```

**Key insight from SDK source (`rest/client.ts:201-243`):** The SDK parses `Link` headers via regex `/<([^<]+)>; rel="([^"]+)"/`. It checks for `page_info` in the URL's query params. The header format is `<url>; rel="next"` (with quoted `rel` value). Both `next` and `previous` can appear in the same header, comma-separated.

### Pattern 2: Shared Pagination Helper

**What:** Extract a `paginateList<T>` helper used by all list endpoints to avoid duplicating cursor logic.

**When to use:** Any list endpoint in `rest.ts`.

```typescript
// Shared helper — can live at top of rest.ts or in a new pagination.ts service
interface PaginationResult<T> {
  items: T[];
  linkHeader: string | null;
}

function paginateList<T extends { id: number }>(
  all: T[],
  resourceType: string,
  version: string,
  path: string,
  limit: number,
  afterId: number,
): PaginationResult<T> {
  const startIdx = afterId === 0 ? 0 : all.findIndex(item => item.id > afterId);
  const slice = startIdx === -1 ? [] : all.slice(startIdx, startIdx + limit);
  const hasNext = startIdx !== -1 && startIdx + limit < all.length;
  const hasPrev = afterId > 0;
  // ... build Link header from hasNext/hasPrev flags
}
```

### Pattern 3: Version Allow-List + Sunset Policy (SHOP-17)

**What:** Replace the permissive regex with an explicit set of supported and sunset versions. Unsupported/syntactically-invalid requests get 404. Sunset requests get a 410 Gone (or 400 — see below).

**What real Shopify returns for sunset versions:** Official docs say Shopify "falls forward" rather than returning an error — requests to sunset versions are served as the oldest supported version. However, the SHOP-17 requirement explicitly says "unsupported/sunset versions return appropriate error responses." For the twin, returning HTTP 400 with `{errors: 'Unsupported API version'}` on syntactic nonsense and 400 on sunset is the right interpretation — the twin is a behavioral clone, not a full production API, and the SDK tests only use 2024-01 and 2025-01, both of which will be in the supported list.

**Example for `api-version.ts`:**
```typescript
// Source: extension of existing api-version.ts
const SUNSET_VERSIONS = new Set([
  '2023-01', '2023-04', '2023-07', '2023-10',
]);

// Supported = any YYYY-MM not in SUNSET and passing the regex, plus 'unstable'
// Strategy: regex-valid AND not-sunset = supported
export function parseShopifyApiVersion(raw: string | undefined): string {
  if (!raw || !SHOPIFY_API_VERSION_RE.test(raw)) {
    throw new TypeError(`Invalid Shopify API version: "${raw}".`);
  }
  if (SUNSET_VERSIONS.has(raw)) {
    const err = new Error(`Sunset Shopify API version: "${raw}".`) as any;
    err.sunset = true;
    throw err;
  }
  return raw;
}
```

Route handlers distinguish `err.sunset` to return a distinct error response (HTTP 400 with `{errors: 'This API version is no longer supported'}`) vs. the existing 400 for invalid format.

### Anti-Patterns to Avoid

- **Hard-coding `page_info=test` sentinel:** The existing sentinel must be removed and replaced with real cursor logic. Tests asserting `page_info=test` sentinel behavior must be updated.
- **Fetching all records on every request without slicing:** Never return the full `listProducts()` array when `limit < all.length` — that defeats pagination fidelity.
- **Encoding arbitrary data in `page_info`:** The cursor must be the last-seen record's `id`, not timestamps or offsets. This ensures determinism when records are added between pages.
- **Using `rel="next"` without quotes:** The SDK regex requires `rel="next"` (quoted). Unquoted `rel=next` will not be parsed.
- **Rejecting unknown months with a hard allow-list:** The audit found `2024-99` passes the current regex. The fix is a sunset-based approach: regex-valid AND not-in-SUNSET. A hard allow-list of `[2024-01, 2024-04, ...]` would require constant maintenance as Shopify releases new versions. The better pattern is sunset-only rejection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor encoding | Custom UUID or hash-based token | `services/cursor.ts encodeCursor/decodeCursor` | Already implemented, tested, handles cross-resource injection |
| Version-aware URL construction | String concatenation in route handlers | `buildAdminApiPath(version, path)` from `api-version.ts` | Keeps version in Link header consistent with route |
| List slicing | Custom database pagination queries | In-memory slice of `listProducts()` | StateManager lists are small in test context; in-memory slice is fast and avoids schema changes |

**Key insight:** The cursor utilities are production-ready and already tested with 12 unit tests. The only work is calling them from the REST plugin.

---

## Common Pitfalls

### Pitfall 1: Old OAuth Pattern in `pagination.test.ts`
**What goes wrong:** `twins/shopify/test/integration/pagination.test.ts` still uses `POST /admin/oauth/access_token` with `{ code: 'test' }` (bare code, no `client_id`/`client_secret`). Phase 23 tightened OAuth to require those fields. The test was never migrated.
**Why it happens:** Noted in the milestone audit as "32+ pre-existing integration test failures."
**How to avoid:** Wave 0 must include migrating this test to `POST /admin/tokens` (the test-seeding endpoint from Phase 21-02). Do not attempt to fix the pagination implementation before fixing the test setup — tests will be confusingly red.
**Warning signs:** Tests failing with `invalid_client` or missing `access_token` in the response.

### Pitfall 2: `page_info` Token Re-Use Across Resource Types
**What goes wrong:** A cursor from `/products.json` is used in `/orders.json`. The `decodeCursor` call with `expectedType='Order'` throws `cross-resource cursor injection rejected`.
**Why it happens:** The cursor encodes the resource type (`arrayconnection:Product:42`). Cross-resource injection is rejected by design.
**How to avoid:** Each list endpoint passes its own resource type string (`'Product'`, `'Order'`, etc.) to `decodeCursor`. Error should return HTTP 400.

### Pitfall 3: `limit` Parameter Must Be Forwarded in Link Header URLs
**What goes wrong:** Link header URL omits `limit` parameter. SDK's `PageInfo` object returns `nextPage.query.limit` as undefined, breaking follow-on requests.
**Why it happens:** Forgetting to include all original query parameters in the Link header URL.
**How to avoid:** Always include `limit=N` in `page_info`-bearing Link URLs. The SDK test (`rest_client.test.ts:1013-1035`) confirms `limit` appears in `prevPage.query` and `nextPage.query`.

### Pitfall 4: Regex-Valid but Semantically Nonsense Versions
**What goes wrong:** `2024-99` passes `SHOPIFY_API_VERSION_RE` (`/^(unstable|\d{4}-\d{2})$/`). The requirement explicitly calls this out.
**Why it happens:** The regex only validates format, not calendar validity.
**How to avoid:** After regex validation, check that the month component is in `01..12` (or just add a month-range sub-check). The sunset approach requires: `(1) regex-valid, (2) month in 01-12, (3) not in SUNSET_VERSIONS`.

### Pitfall 5: StateManager `dist` Rebuild Not Needed (No Schema Change)
**What goes wrong:** Previous phases (24-02) required `pnpm -F @dtu/state build` after adding StateManager methods. This phase adds no new StateManager methods — list methods already exist.
**Why it happens:** The state package exports from compiled `dist/`.
**How to avoid:** No StateManager changes, no rebuild needed. The REST plugin already imports `stateManager.listProducts()` etc. directly.

### Pitfall 6: `hasPreviousPage` Logic for Page 1
**What goes wrong:** Page 1 (no `page_info` param, `afterId = 0`) incorrectly emits `rel="previous"`.
**Why it happens:** Off-by-one in `hasPrev` calculation.
**How to avoid:** `hasPrev = afterId > 0` (only true when a `page_info` cursor was supplied). When `page_info` is absent, the client is on page 1, and no previous link exists.

---

## Code Examples

Verified from `third_party/upstream/shopify-app-js` source code:

### SDK Link Header Parsing (from `rest/client.ts:54,201-242`)
```typescript
// Source: third_party/upstream/shopify-app-js/.../rest/client.ts
static LINK_HEADER_REGEXP = /<([^<]+)>; rel="([^"]+)"/;

// On receiving a response:
const link = response.headers.get('Link');
if (link !== undefined) {
  const pageInfo: PageInfo = { limit: params.query?.limit?.toString() ?? '50' };
  if (link) {
    const links = link.split(', ');
    for (const segment of links) {
      const parsed = segment.match(RestClient.LINK_HEADER_REGEXP);
      if (!parsed) continue;
      const [, url, rel] = parsed;
      const linkUrl = new URL(url);
      const linkPageToken = linkUrl.searchParams.get('page_info');
      if (linkPageToken) {
        if (rel === 'previous') {
          pageInfo.previousPageUrl = url;
          pageInfo.prevPage = buildRequestParams(url);
        } else if (rel === 'next') {
          pageInfo.nextPageUrl = url;
          pageInfo.nextPage = buildRequestParams(url);
        }
      }
    }
  }
  requestReturn.pageInfo = pageInfo;
}
```

**Critical:** The SDK only populates `pageInfo.nextPage/prevPage` if `page_info` appears in the link URL's query params. The link header MUST include `page_info=<cursor>` not just a positional token.

### Expected Link Header Format
```
# Single next-page link (first page):
Link: <https://dev.myshopify.com/admin/api/2025-01/products.json?page_info=YXJyYXljb25uZWN0aW9uOlByb2R1Y3Q6NTA=&limit=50>; rel="next"

# Both prev and next (middle page):
Link: <https://dev.myshopify.com/admin/api/2025-01/products.json?page_info=YXJyYXljb25uZWN0aW9uOlByb2R1Y3Q6MA==&limit=50>; rel="previous", <https://dev.myshopify.com/admin/api/2025-01/products.json?page_info=YXJyYXljb25uZWN0aW9uOlByb2R1Y3Q6MTAw&limit=50>; rel="next"

# Last page only (previous link only):
Link: <https://dev.myshopify.com/admin/api/2025-01/products.json?page_info=YXJyYXljb25uZWN0aW9uOlByb2R1Y3Q6MA==&limit=50>; rel="previous"
```

### Version Policy (api-version.ts extension)
```typescript
// Source: extension of existing twins/shopify/src/services/api-version.ts
// Versions that were supported at some point but are now sunset
const SUNSET_VERSIONS = new Set<string>([
  '2023-01', '2023-04', '2023-07', '2023-10',
]);

// Month validation: reject 2024-99 etc.
const VALID_MONTH_RE = /^(0[1-9]|1[0-2])$/;

export function parseShopifyApiVersion(raw: string | undefined): string {
  if (!raw || !SHOPIFY_API_VERSION_RE.test(raw)) {
    throw new TypeError(`Invalid Shopify API version: "${raw}".`);
  }
  if (raw !== 'unstable') {
    const month = raw.split('-')[1];
    if (!VALID_MONTH_RE.test(month)) {
      throw new TypeError(`Invalid Shopify API version: "${raw}". Month out of range.`);
    }
  }
  if (SUNSET_VERSIONS.has(raw)) {
    const err = new Error(`Sunset Shopify API version: "${raw}".`) as any;
    err.sunset = true;
    throw err;
  }
  return raw;
}
```

Route handler update in `rest.ts` (and `graphql.ts`):
```typescript
const parseVersionHeader = (request: any, reply: any): string | null => {
  let version: string;
  try {
    version = parseShopifyApiVersion(request.params?.version);
  } catch (err: any) {
    if (err.sunset) {
      reply.status(400).header('content-type', 'application/json').send({
        errors: 'This API version is no longer supported',
      });
    } else {
      reply.status(400).header('content-type', 'application/json').send({
        errors: 'Invalid API version',
      });
    }
    return null;
  }
  setApiVersionHeader(reply, version);
  return version;
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `page_info=test` sentinel emits Link header | Real cursor-based pagination with slice + Link header | Phase 28 (this phase) | `pageInfo.nextPage`/`prevPage` populated correctly in SDK |
| Regex-only version validation (accepts `2024-99`) | Regex + month range + sunset rejection | Phase 28 (this phase) | `2024-99` and `2023-*` rejected with 400 |
| Old OAuth pattern in integration test (`code` only) | `POST /admin/tokens` seeding | Must migrate in Wave 0 | 32+ previously-failing integration tests become runnable |

**Deprecated/outdated:**
- `if (pageInfo === 'test')` branch in `rest.ts:125-131`: Remove entirely; replace with real cursor logic.
- `SHOPIFY_API_VERSION_RE` alone as the only validation: Extend with month-range check and sunset set.

---

## Open Questions

1. **Sunset version set boundaries**
   - What we know: SDK `ApiVersion` enum (v12.3.0) contains `January23 = "2023-01"` through `January25 = "2025-01"`. Real Shopify supports ~4 quarterly versions at a time (12 months).
   - What's unclear: The exact list of sunset versions as of 2026-03. Based on Shopify's quarterly cadence (4 versions supported, 12 month window), versions before approximately `2025-01` are likely sunset or approaching sunset in 2026.
   - Recommendation: Use `{2023-01, 2023-04, 2023-07, 2023-10}` as the sunset set for Phase 28. The twin tests only use `2024-01` and `2025-01` — both will pass. Document the list as the known-sunset set at time of implementation.

2. **`previous` cursor encoding strategy**
   - What we know: The cursor encodes `arrayconnection:{Type}:{id}`. For "previous" pages, the cursor should point to the item *before* the first item on the current page.
   - What's unclear: Whether `afterId = slice[0].id - 1` is always correct when IDs are not contiguous (e.g., items deleted, non-sequential inserts).
   - Recommendation: Use `afterId = all[startIdx - 1].id` (the actual ID of the item before the current slice's start) when `startIdx > 0`. This handles non-contiguous IDs correctly.

3. **Which list endpoints need pagination**
   - What we know: Products, orders, customers, inventory_items are Tier 1 (state-backed). Tier 2 stubs (custom_collections, metafields, pages, webhooks, blogs, articles) return empty arrays.
   - What's unclear: Whether Tier 2 stubs need pagination (currently always return `[]`).
   - Recommendation: Implement pagination only for Tier 1 state-backed endpoints (products, orders, customers, inventory_items). Tier 2 stubs always return empty arrays — no pagination needed (empty = no next page).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (workspace config at `vitest.shared.ts`) |
| Config file | `twins/shopify/vitest.config.ts` (inherits shared) |
| Quick run command | `pnpm vitest run --project @dtu/twin-shopify` |
| Full suite command | `pnpm test:sdk` (SDK verification project) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-23 | First page of products returns `rel="next"` Link header | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/pagination.test.ts` | Wave 0 (extend existing) |
| SHOP-23 | Second page of products (page_info cursor) returns correct slice + `rel="previous"` | integration | same | Wave 0 (new test in existing file) |
| SHOP-23 | Last page returns `rel="previous"` only (no next) | integration | same | Wave 0 |
| SHOP-23 | Invalid page_info cursor returns 400 | integration | same | Wave 0 |
| SHOP-23 | SDK `RestClient.get()` with `limit=2` seeds 3 products, gets page 1 + page 2 | SDK verification | `pnpm test:sdk --reporter=verbose` | Wave 0 (extend `shopify-api-rest-client.test.ts`) |
| SHOP-17 | `2024-99` version returns 400 | integration | `pnpm vitest run --project @dtu/twin-shopify twins/shopify/test/integration/pagination.test.ts` | Wave 0 (new) |
| SHOP-17 | `2023-01` (sunset) version returns 400 | integration | same | Wave 0 (new) |
| SHOP-17 | `2025-01` (supported) version returns 200 | integration | same | Exists (phase 22) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project @dtu/twin-shopify`
- **Per wave merge:** `pnpm test:sdk`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `twins/shopify/test/integration/pagination.test.ts` — migrate `beforeEach` OAuth seeding from `POST /admin/oauth/access_token` to `POST /admin/tokens`; add REST pagination tests (SHOP-23) and version policy tests (SHOP-17)
- [ ] `tests/sdk-verification/sdk/shopify-api-rest-client.test.ts` — replace `page_info=test` sentinel tests with real multi-page assertions using `limit=2`, create 3+ products, verify page traversal

---

## Sources

### Primary (HIGH confidence)
- `twins/shopify/src/plugins/rest.ts` — current pagination sentinel implementation (lines 121-133)
- `twins/shopify/src/services/cursor.ts` — `encodeCursor`/`decodeCursor` utilities (verified, tested)
- `twins/shopify/src/services/api-version.ts` — current version regex (line 17)
- `third_party/upstream/shopify-app-js/.../rest/client.ts` — SDK Link header parsing implementation (lines 54, 201-243)
- `third_party/upstream/shopify-app-js/.../__tests__/rest_client.test.ts` — SDK test expectations for Link header format (lines 1012-1046)
- `packages/state/src/state-manager.ts` — `listProducts()`, `listOrders()`, `listCustomers()` return full arrays sorted by `id ASC`
- `.planning/v1.2-MILESTONE-AUDIT.md` — authoritative audit findings for SHOP-23 and SHOP-17

### Secondary (MEDIUM confidence)
- Shopify official REST pagination docs (https://shopify.dev/docs/api/admin-rest/usage/pagination) — confirmed `page_info` is opaque cursor, default limit 50, max 250
- Shopify versioning docs (https://shopify.dev/docs/api/usage/versioning) — confirmed quarterly release cadence, 12-month support window

### Tertiary (LOW confidence)
- WebSearch result on sunset versions as of 2026-03 — Shopify's current supported set appears to be `2025-04`, `2025-07`, `2025-10`, `2026-01`, `2026-04-RC`. The exact sunset boundary for `2023-*` versions is inferred from the 12-month window, not confirmed from a live API call.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all utilities already exist and are tested in the project
- Architecture: HIGH — cursor.ts patterns verified from source; SDK Link header parsing verified from upstream source
- Pitfalls: HIGH — Old OAuth pattern confirmed from audit; other pitfalls derived from reading code
- Version policy: MEDIUM — sunset set inferred from Shopify cadence, not from live API; safe for twin purposes

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable domain — Shopify versioning cadence changes quarterly, but the pattern is stable)
