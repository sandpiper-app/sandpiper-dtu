# Phase 6: Twin UIs - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Web interfaces for inspecting and manipulating twin state without API calls. Each twin (Shopify, Slack) gets its own embedded UI served from its Fastify server. UIs enable manual testing — creating entities, viewing state, triggering webhooks through the interface. Not for twin configuration (that stays code-first).

</domain>

<decisions>
## Implementation Decisions

### Navigation model
- Separate UIs per twin — each twin's Fastify server serves its own UI (e.g., at `/ui`)
- Entity-based sidebar navigation within each twin (Orders, Products, Customers for Shopify; Channels, Users for Slack)
- Admin section at bottom of sidebar: Reset State, Load Fixtures, View Webhooks/Events log

### List & detail views
- Dense data tables for entity lists — sortable, compact, many rows visible
- No search or filtering — testing tool with controlled data sets, just show everything
- Clicking a row navigates to a separate detail page (not side panel)
- Detail pages include a raw JSON toggle to inspect underlying twin state

### Form & editing experience
- Dedicated form pages for create/edit (not modals or inline)
- Essential fields only — minimal forms for creating valid entities, power users use API for full control
- No confirmation on delete — testing tool, state is resettable
- UI operations trigger same webhooks/events as API calls (creating order via UI fires orderCreate webhook)

### Visual direction
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

</decisions>

<specifics>
## Specific Ideas

- UI-05 requirement calls for reusable list/detail/form components shared across twins — server-rendered templates/partials should enable this
- Webhook/event side effects from UI actions means the UI doubles as a manual webhook trigger tool
- Raw JSON toggle on detail pages helps debug twin state mismatches during conformance testing

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-twin-uis*
*Context gathered: 2026-02-28*
