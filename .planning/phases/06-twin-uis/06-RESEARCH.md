# Phase 6: Twin UIs - Research

**Researched:** 2026-02-28
**Domain:** Server-rendered web UIs for twin state inspection and manipulation
**Confidence:** HIGH

## Summary

Phase 6 adds web UIs to both the Shopify and Slack twins, served directly from each twin's Fastify server at `/ui`. The UIs are server-rendered HTML with minimal client-side interactivity — a developer tool aesthetic (like pgAdmin or Prisma Studio) for inspecting and manipulating twin state without API calls. Each twin already has a complete state management layer (StateManager for Shopify with orders/products/customers/fulfillments, SlackStateManager for Slack with channels/users/messages) and admin endpoints that demonstrate the CRUD patterns.

The stack is Fastify-native: `@fastify/view` with Eta templates for server-rendered HTML, `@fastify/static` for serving CSS, `@fastify/formbody` for form POST parsing, and Pico CSS for utilitarian classless styling. HTMX adds targeted interactivity (delete without full page reload, JSON toggle) while keeping the baseline as plain HTML forms and links. Both twins share a `@dtu/ui` package containing reusable Eta partials (layout, data table, detail view, form scaffolding) and shared CSS, while each twin provides its own routes and entity-specific templates.

**Primary recommendation:** Build a shared `@dtu/ui` package with Eta partials and Pico CSS, then add a `ui` plugin to each twin's Fastify server that registers view/static/formbody and mounts entity routes at `/ui`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Separate UIs per twin — each twin's Fastify server serves its own UI (e.g., at `/ui`)
- Entity-based sidebar navigation within each twin (Orders, Products, Customers for Shopify; Channels, Users for Slack)
- Admin section at bottom of sidebar: Reset State, Load Fixtures, View Webhooks/Events log
- Dense data tables for entity lists — sortable, compact, many rows visible
- No search or filtering — testing tool with controlled data sets, just show everything
- Clicking a row navigates to a separate detail page (not side panel)
- Detail pages include a raw JSON toggle to inspect underlying twin state
- Dedicated form pages for create/edit (not modals or inline)
- Essential fields only — minimal forms for creating valid entities, power users use API for full control
- No confirmation on delete — testing tool, state is resettable
- UI operations trigger same webhooks/events as API calls (creating order via UI fires orderCreate webhook)
- Dev tool / utilitarian aesthetic — functional, no frills (like pgAdmin or Prisma Studio)
- Server-rendered HTML served by Fastify — no JS framework, HTMX for interactivity if needed
- Light theme only — single theme, keep it simple
- Subtle twin identity via accent colors (green for Shopify, purple for Slack)

### Claude's Discretion
- CSS framework or approach (plain CSS, Pico CSS, etc.)
- Table column choices per entity type
- HTMX vs plain form submissions for interactivity
- Page layout proportions and spacing
- Admin section specifics (which logs/actions to surface)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Shopify twin web UI — sidebar navigation (Orders, Products, Customers, Inventory), list views, detail views per entity | @fastify/view + Eta templates render entity lists from StateManager.listOrders/listProducts/listCustomers; sidebar partial with nav links; detail pages via getOrder/getProduct/getCustomer by ID |
| UI-02 | Shopify twin web UI — create, edit, delete orders, products, customers through forms | @fastify/formbody parses form POSTs; routes call StateManager.createOrder/updateOrder etc; delete calls same StateManager methods; webhook triggers reuse existing resolver patterns |
| UI-03 | Slack twin web UI — channel sidebar, message timeline view, user list, workspace navigation | Same template stack; SlackStateManager.listChannels/listUsers/listMessages(channelId) provide data; message timeline styled differently from data tables |
| UI-04 | Slack twin web UI — create channels, post messages, manage users through the interface | Form routes call SlackStateManager.createChannel/createMessage/createUser; event dispatch reuses existing EventDispatcher for side effects |
| UI-05 | Shared UI framework — consistent barebones styling across twins, reusable list/detail/form components | @dtu/ui package with shared Eta partials (layout, table, detail, form), Pico CSS for base styling, twin-specific accent color CSS variables |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/view | ^11.x | Template rendering for Fastify | Official Fastify plugin, supports Eta, caching in production |
| eta | ^3.x | Lightweight template engine | 2KB gzipped, EJS-compatible syntax, TypeScript-native, 3x faster than EJS, supports partials/layouts |
| @fastify/static | ^8.x | Serve CSS/JS static files | Official Fastify plugin, compression support, Fastify 5 compatible |
| @fastify/formbody | ^8.x | Parse application/x-www-form-urlencoded | Official Fastify plugin, required for HTML form POST handling |
| Pico CSS | ^2.x | Classless/minimal CSS framework | Styles semantic HTML directly, <10 classes total, light theme default, responsive, no build step |
| htmx | ^2.x | HTML-driven interactivity | 14KB, no build step, CDN delivery, progressive enhancement for delete/toggle without full reload |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/flash | ^6.x | Flash messages after form actions | Optional — "Order created" confirmation banners after redirects |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Eta | EJS | EJS is more common but 2x larger, slower, and Eta is TypeScript-native |
| Eta | Handlebars | Handlebars is logic-less which makes data tables harder; Eta allows inline JS |
| Pico CSS | plain CSS | Plain CSS requires more boilerplate; Pico gives professional baseline with zero classes |
| Pico CSS | Tailwind | Tailwind requires build step and adds complexity; Pico works with semantic HTML |
| HTMX | plain forms | Plain forms work but require full page reload for every action; HTMX adds targeted updates |

**Installation (per twin):**
```bash
pnpm add @fastify/view @fastify/static @fastify/formbody eta
```

**Installation (shared package):**
```bash
mkdir -p packages/ui
# Pico CSS and HTMX served from CDN — no npm install needed
# Package contains Eta partials (.eta files) and custom CSS
```

## Architecture Patterns

### Recommended Project Structure
```
packages/ui/                    # @dtu/ui shared package
├── package.json
├── src/
│   ├── index.ts               # Export helper functions (registerUI, formatDate, etc.)
│   ├── partials/              # Shared Eta partials
│   │   ├── layout.eta         # HTML shell: head, sidebar, main content area
│   │   ├── table.eta          # Reusable data table (receives columns[] + rows[])
│   │   ├── detail.eta         # Detail page scaffold (field list + raw JSON toggle)
│   │   ├── form.eta           # Form scaffold (fields[] → inputs)
│   │   └── flash.eta          # Flash message banner
│   └── public/                # Static assets
│       └── styles.css         # Pico CSS overrides + twin accent variables

twins/shopify/src/
├── plugins/
│   └── ui.ts                  # UI plugin: registers view/static/formbody, mounts routes
├── views/                     # Shopify-specific Eta templates
│   ├── orders/
│   │   ├── list.eta
│   │   ├── detail.eta
│   │   ├── form.eta
│   └── products/
│   │   ├── list.eta
│   │   ├── detail.eta
│   │   ├── form.eta
│   └── customers/
│   │   ├── list.eta
│   │   ├── detail.eta
│   │   ├── form.eta
│   └── admin/
│       ├── index.eta
│       └── webhooks.eta

twins/slack/src/
├── plugins/
│   └── ui.ts                  # UI plugin (same pattern)
├── views/                     # Slack-specific Eta templates
│   ├── channels/
│   │   ├── list.eta
│   │   ├── detail.eta         # Message timeline view
│   │   ├── form.eta
│   └── users/
│   │   ├── list.eta
│   │   ├── detail.eta
│   │   ├── form.eta
│   └── admin/
│       ├── index.eta
│       └── events.eta
```

### Pattern 1: UI Plugin Registration
**What:** Single Fastify plugin per twin that wires up view engine, static serving, and all UI routes
**When to use:** Every twin that needs a UI
**Example:**
```typescript
// twins/shopify/src/plugins/ui.ts
import fp from 'fastify-plugin';
import view from '@fastify/view';
import staticPlugin from '@fastify/static';
import formbody from '@fastify/formbody';
import { Eta } from 'eta';
import path from 'node:path';

export default fp(async function uiPlugin(fastify) {
  const eta = new Eta({
    views: path.join(import.meta.dirname, '../views'),
    // Include shared partials from @dtu/ui
    cache: process.env.NODE_ENV === 'production',
  });

  await fastify.register(view, { engine: { eta } });
  await fastify.register(formbody);
  await fastify.register(staticPlugin, {
    root: path.join(import.meta.dirname, '../../node_modules/@dtu/ui/public'),
    prefix: '/ui/static/',
    decorateReply: false,
  });

  // Mount routes under /ui prefix
  fastify.get('/ui', async (req, reply) => {
    return reply.view('orders/list.eta', {
      orders: fastify.stateManager.listOrders(),
      nav: 'orders',
      twin: 'shopify',
    });
  });
  // ... more routes
});
```

### Pattern 2: Reusable Data Table Partial
**What:** Shared Eta partial that renders a sortable data table from column definitions + row data
**When to use:** Every entity list view
**Example:**
```html
<!-- packages/ui/src/partials/table.eta -->
<table role="grid">
  <thead>
    <tr>
      <% it.columns.forEach(col => { %>
        <th><%= col.label %></th>
      <% }) %>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <% it.rows.forEach(row => { %>
      <tr>
        <% it.columns.forEach(col => { %>
          <td><%= row[col.key] %></td>
        <% }) %>
        <td>
          <a href="<%= it.basePath %>/<%= row[it.idKey] %>">View</a>
          <a href="<%= it.basePath %>/<%= row[it.idKey] %>/edit">Edit</a>
          <button hx-delete="<%= it.basePath %>/<%= row[it.idKey] %>"
                  hx-target="closest tr" hx-swap="outerHTML">Delete</button>
        </td>
      </tr>
    <% }) %>
  </tbody>
</table>
```

### Pattern 3: Webhook/Event Side Effects from UI Actions
**What:** UI form handlers trigger the same webhook/event dispatch as API calls
**When to use:** Any create/edit/delete operation in the UI
**Example:**
```typescript
// Creating an order via UI form triggers same webhooks as GraphQL mutation
fastify.post('/ui/orders/create', async (req, reply) => {
  const data = req.body as Record<string, string>;
  const gid = createGID('Order', Date.now() + Math.floor(Math.random() * 100000));
  const id = fastify.stateManager.createOrder({
    gid,
    name: data.name,
    total_price: data.total_price,
    currency_code: data.currency_code || 'USD',
  });

  // Trigger webhook just like GraphQL resolver does
  const order = fastify.stateManager.getOrder(id);
  const subs = fastify.stateManager.listWebhookSubscriptions()
    .filter(s => s.topic === 'orders/create');
  for (const sub of subs) {
    await fastify.webhookQueue.enqueue({
      id: randomUUID(),
      topic: 'orders/create',
      callbackUrl: sub.callback_url,
      payload: order,
      secret: fastify.webhookSecret,
    });
  }

  return reply.redirect('/ui/orders');
});
```

### Pattern 4: Raw JSON Toggle
**What:** Detail pages include a collapsible section showing the raw state object as formatted JSON
**When to use:** Every detail view
**Example:**
```html
<!-- HTMX-powered toggle -->
<details>
  <summary>Raw JSON</summary>
  <pre><code><%= JSON.stringify(it.entity, null, 2) %></code></pre>
</details>
```

### Anti-Patterns to Avoid
- **Building a SPA:** No client-side routing, no fetch-based data loading, no component framework. Server-rendered pages with links and forms.
- **Custom CSS grid system:** Pico CSS handles responsive layout. Don't build a grid framework.
- **Complex form validation:** Minimal forms with HTML5 validation attributes only. Server-side validation returns error messages.
- **Over-using HTMX:** Keep HTMX to delete buttons and JSON toggle. Navigation and form submission use standard HTML.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML templating | Custom string interpolation | Eta via @fastify/view | Caching, partials, escaping, layouts |
| CSS styling | Custom CSS framework | Pico CSS (CDN) | Styles semantic HTML, responsive, professional baseline |
| Form parsing | Custom body parser | @fastify/formbody | Handles URL-encoded forms correctly, Fastify-native |
| Static file serving | Custom route handlers | @fastify/static | Caching, compression, proper MIME types |
| Client-side interactivity | Custom JavaScript | HTMX (CDN) | Declarative, no build step, progressive enhancement |
| Date formatting | Custom date utils | Intl.DateTimeFormat | Built-in, locale-aware, handles timestamps from SQLite |

**Key insight:** The entire UI stack uses zero-build-step tools (Pico CSS from CDN, HTMX from CDN, Eta templates interpreted at runtime). No webpack, no bundler, no compilation pipeline for the UI layer.

## Common Pitfalls

### Pitfall 1: Eta Template Path Resolution
**What goes wrong:** Eta can't find partials when template directories span multiple packages
**Why it happens:** @dtu/ui partials live in a different directory than twin-specific templates
**How to avoid:** Configure Eta with explicit `views` array or use `include` with absolute paths. Test partial resolution during plugin registration.
**Warning signs:** "Template not found" errors at runtime, partials rendering as empty

### Pitfall 2: Static File Prefix Collision with API Routes
**What goes wrong:** `/ui/static/` prefix collides with twin API routes or `/ui` page routes
**Why it happens:** Fastify matches routes by prefix; static plugin could intercept API calls
**How to avoid:** Register static plugin with explicit `prefix: '/ui/static/'` and `decorateReply: false` to avoid polluting reply with sendFile
**Warning signs:** 404s on known API routes, static files served instead of API responses

### Pitfall 3: Form POST Without Redirect (PRG Pattern)
**What goes wrong:** Submitting a form and returning HTML directly causes resubmission on browser refresh
**Why it happens:** Browser remembers POST request and asks "Resubmit?" on refresh
**How to avoid:** Always use POST-Redirect-GET pattern — form POST handlers redirect to the entity list or detail page
**Warning signs:** "Confirm Form Resubmission" dialog in browser, duplicate entities created

### Pitfall 4: HTMX Delete Without Proper Response
**What goes wrong:** HTMX `hx-delete` removes the row but the server returns JSON, causing the table cell to show raw JSON
**Why it happens:** HTMX expects HTML response to swap into target; API-style JSON response gets rendered as text
**How to avoid:** For `hx-delete`, return empty string with 200 status (HTMX will remove the target element). Or return a replacement HTML fragment.
**Warning signs:** Raw JSON appearing in table cells after delete

### Pitfall 5: Webhook Dispatch Inconsistency Between UI and API
**What goes wrong:** Creating an order via UI doesn't trigger webhooks, but creating via GraphQL does
**Why it happens:** Webhook dispatch logic lives in GraphQL resolvers, not shared
**How to avoid:** Extract webhook dispatch into a shared service function that both resolvers and UI routes call. Or have UI routes call the existing admin/API endpoints internally.
**Warning signs:** Tests that create via UI don't receive expected webhooks

### Pitfall 6: Missing Inventory in Shopify UI
**What goes wrong:** UI-01 requires Inventory in the sidebar but StateManager's inventory support is minimal
**Why it happens:** Inventory items exist in the schema but were not a primary Phase 4 focus
**How to avoid:** Include inventory_items in the sidebar but with read-only list view; create/edit can be deferred or minimal
**Warning signs:** Empty inventory page with no data, confusion about what inventory operations are supported

## Code Examples

### Fastify View + Eta Setup
```typescript
// Source: @fastify/view README + Eta docs
import view from '@fastify/view';
import { Eta } from 'eta';
import path from 'node:path';

const eta = new Eta({
  views: path.join(import.meta.dirname, '../views'),
  cache: process.env.NODE_ENV === 'production',
});

await fastify.register(view, {
  engine: { eta },
  root: path.join(import.meta.dirname, '../views'),
});

// In route handler:
fastify.get('/ui/orders', async (req, reply) => {
  const orders = fastify.stateManager.listOrders();
  return reply.view('orders/list.eta', { orders, nav: 'orders' });
});
```

### Pico CSS Integration
```html
<!-- In layout.eta head -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<link rel="stylesheet" href="/ui/static/styles.css">
```

### HTMX Delete Button
```html
<!-- In table row -->
<button hx-delete="/ui/orders/<%= it.id %>"
        hx-target="closest tr"
        hx-swap="delete"
        class="secondary outline">
  Delete
</button>

<!-- Include HTMX from CDN in layout -->
<script src="https://unpkg.com/htmx.org@2.0.4"></script>
```

### Form with POST-Redirect-GET
```typescript
// POST handler
fastify.post('/ui/orders/create', async (req, reply) => {
  const body = req.body as Record<string, string>;
  const gid = createGID('Order', Date.now() + Math.floor(Math.random() * 100000));
  fastify.stateManager.createOrder({
    gid,
    name: body.name || `#${Date.now()}`,
    total_price: body.total_price || '0.00',
    currency_code: body.currency_code || 'USD',
  });
  // PRG: redirect after POST
  return reply.redirect('/ui/orders');
});
```

### Twin Accent Colors via CSS Variables
```css
/* packages/ui/src/public/styles.css */
:root {
  --twin-accent: #666;  /* default */
}

:root[data-twin="shopify"] {
  --twin-accent: #5c6ac4;  /* Shopify purple-blue, or green #008060 */
}

:root[data-twin="slack"] {
  --twin-accent: #611f69;  /* Slack aubergine */
}

/* Use accent in sidebar, headings */
nav a.active {
  border-left: 3px solid var(--twin-accent);
}

h1, .twin-badge {
  color: var(--twin-accent);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EJS templates | Eta (EJS-compatible, faster) | 2023+ | 3x faster rendering, TypeScript native, smaller bundle |
| jQuery for DOM updates | HTMX | 2020+ | Declarative HTML attributes, no custom JS needed |
| Bootstrap/Tailwind for admin UIs | Pico CSS classless | 2022+ | Zero-class semantic HTML, smaller footprint, fits dev tool aesthetic |
| Client-side SPAs for admin tools | Server-rendered HTML | 2023+ (HTMX renaissance) | Simpler architecture, no API layer needed, faster initial load |

**Deprecated/outdated:**
- `point-of-view` — renamed to `@fastify/view` (use scoped package)
- `fastify-static` — renamed to `@fastify/static` (use scoped package)
- EJS — still works but Eta is the modern replacement with identical syntax

## Open Questions

1. **Eta partial sharing across packages**
   - What we know: Eta supports configurable `views` directory and `include()` for partials
   - What's unclear: Whether @fastify/view supports multiple view directories or if partials need to be copied/symlinked
   - Recommendation: Test during implementation; worst case, copy partials into each twin's views directory at build time or use absolute paths in `include()`

2. **Inventory entity depth**
   - What we know: StateManager has an `inventory_items` table with sku, tracked, available fields. UI-01 mentions Inventory in the sidebar.
   - What's unclear: Whether create/edit for inventory is expected or just listing
   - Recommendation: Include read-only list + detail views for inventory. Skip create/edit forms — inventory is typically managed through product associations, not standalone.

3. **Delete via StateManager**
   - What we know: StateManager has create/update/list/get methods but no explicit `delete` methods for most entities
   - What's unclear: Whether the UI should add delete functionality or just show existing state
   - Recommendation: Add simple `DELETE FROM table WHERE id = ?` methods to StateManager for UI use. Testing tools benefit from easy cleanup. Keep it simple — no cascading deletes needed.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `twins/shopify/src/index.ts`, `twins/slack/src/index.ts` — Fastify 5 patterns, plugin registration, state manager integration
- Existing codebase: `packages/state/src/state-manager.ts` — Full schema and CRUD API for Shopify entities
- Existing codebase: `twins/slack/src/state/slack-state-manager.ts` — Full schema and CRUD API for Slack entities
- npm: @fastify/view — Template rendering plugin for Fastify, Eta support confirmed
- npm: @fastify/static — Static file serving for Fastify
- npm: @fastify/formbody — Form body parsing for Fastify
- Eta official site (eta.js.org) — Template syntax, performance, TypeScript support
- Pico CSS official site (picocss.com) — Classless CSS framework, semantic HTML styling
- htmx.org — HTMX attributes, CDN delivery, 14KB size

### Secondary (MEDIUM confidence)
- Web search: @fastify/view v11.x compatible with Fastify 5
- Web search: HTMX 2.x patterns for delete and partial page updates
- Web search: Pico CSS classless mode for admin/dev tool UIs

### Tertiary (LOW confidence)
- None — all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are official Fastify plugins or well-established tools; verified via npm and official docs
- Architecture: HIGH — follows existing twin plugin patterns exactly; UI is a straightforward addition to the existing Fastify app
- Pitfalls: HIGH — based on direct codebase inspection (PRG pattern, static prefix collision, webhook dispatch consistency)

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable domain, minimal API churn)
