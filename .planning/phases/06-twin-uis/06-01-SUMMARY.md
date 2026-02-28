---
phase: 06-twin-uis
plan: 01
subsystem: ui
tags: [eta, pico-css, htmx, fastify-view, fastify-static, fastify-formbody]

requires:
  - phase: 01-foundation-monorepo-setup
    provides: pnpm workspace structure, packages/* convention
provides:
  - "@dtu/ui shared package with registerUI() helper"
  - "6 Eta partials: layout, sidebar, table, detail, form, flash"
  - "Pico CSS overrides with twin accent color variables"
  - "Template helpers: formatDate, formatJson, truncate, escapeHtml"
  - "Static CSS serving at /ui/static/"
affects: [06-twin-uis]

tech-stack:
  added: ["@fastify/view@11.x", "@fastify/static@8.x", "@fastify/formbody@8.x", "eta@3.x"]
  patterns: ["registerUI() one-call Fastify UI setup", "Eta partial include resolution across packages", "Pico CSS classless styling with twin accent variables"]

key-files:
  created:
    - packages/ui/package.json
    - packages/ui/src/index.ts
    - packages/ui/src/helpers.ts
    - packages/ui/src/partials/layout.eta
    - packages/ui/src/partials/sidebar.eta
    - packages/ui/src/partials/table.eta
    - packages/ui/src/partials/detail.eta
    - packages/ui/src/partials/form.eta
    - packages/ui/src/partials/flash.eta
    - packages/ui/src/public/styles.css
  modified: []

key-decisions:
  - "Eta resolvePath override for cross-package partial resolution: twin views checked first, then shared @dtu/ui partials"
  - "CDN delivery for Pico CSS and HTMX — zero build step for UI assets"
  - "reply.viewAsync (not reply.view) for async Fastify 5 route handlers"
  - "decorateReply: false on @fastify/static to avoid polluting reply object"

patterns-established:
  - "registerUI() pattern: one function call wires view engine + static + formbody for any twin"
  - "Twin accent color via data-twin HTML attribute and CSS custom properties"
  - "Shared partials include() with automatic fallback to @dtu/ui directory"

requirements-completed: [UI-05]

duration: 8min
completed: 2026-02-28
---

# Plan 06-01: Shared UI Package Summary

**@dtu/ui package with Eta template partials, Pico CSS styling, and registerUI() Fastify helper for both twins**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-28
- **Completed:** 2026-02-28
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Created @dtu/ui workspace package with registerUI() helper
- 6 shared Eta partials: layout (HTML shell with Pico CSS/HTMX), sidebar (twin nav), table (data grid with HTMX delete), detail (fields + raw JSON toggle), form (dynamic field rendering), flash (alert messages)
- Pico CSS classless styling with twin-specific accent colors (green for Shopify, purple for Slack)
- Integration test confirms view engine, static serving, and form parsing all work

## Task Commits

1. **Task 1: Create @dtu/ui package** - `814f07a` (feat)
2. **Task 2: Integration test** - `e6c998e` (test)

## Files Created/Modified
- `packages/ui/package.json` — Package definition with @fastify/view, eta, @fastify/static, @fastify/formbody
- `packages/ui/src/index.ts` — registerUI() helper with Eta resolvePath override for cross-package partials
- `packages/ui/src/helpers.ts` — formatDate, formatJson, truncate, escapeHtml template helpers
- `packages/ui/src/partials/layout.eta` — HTML5 shell with Pico CSS CDN, HTMX CDN, sidebar + main grid
- `packages/ui/src/partials/sidebar.eta` — Twin-branded navigation with active state highlighting
- `packages/ui/src/partials/table.eta` — Dense data table with HTMX delete buttons and empty state
- `packages/ui/src/partials/detail.eta` — Entity detail with description list and raw JSON toggle
- `packages/ui/src/partials/form.eta` — Dynamic form with text/textarea/select/checkbox fields
- `packages/ui/src/partials/flash.eta` — Conditional alert messages (success/error/info)
- `packages/ui/src/public/styles.css` — Pico CSS overrides, twin accent colors, dense table styling
- `packages/ui/test/register.test.ts` — Integration test for registerUI with Fastify

## Decisions Made
- Used Eta's resolvePath override instead of symlinks for cross-package partial resolution
- CDN delivery for Pico CSS and HTMX (no npm install needed for frontend assets)
- Used reply.viewAsync for async Fastify 5 handler compatibility

## Deviations from Plan
None - plan executed as specified

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- @dtu/ui package ready for consumption by Shopify and Slack twins
- Both twins add `@dtu/ui: workspace:*` dependency and call `registerUI()` in their UI plugins

---
*Phase: 06-twin-uis*
*Completed: 2026-02-28*
