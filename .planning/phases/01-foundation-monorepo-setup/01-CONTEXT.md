# Phase 1: Foundation & Monorepo Setup - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish shared infrastructure and architectural foundation for all twin development. Monorepo with pnpm workspaces, shared packages (@dtu/core, @dtu/state, @dtu/types), state management with SQLite/in-memory backends resettable in <100ms, health check endpoints, and structured JSON logging with correlation IDs. No twin-specific API logic — that starts in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### HTTP framework
- Fastify as the HTTP framework for all twin apps
- Node.js runtime (not Bun)
- Fastify's built-in JSON Schema validation for request/response validation
- Route organization: Claude's discretion (plugin-per-domain vs file-based)

### State layer interface
- State interaction pattern: Claude's discretion (repository pattern, Drizzle ORM, or hybrid)
- State reset via drop and recreate (not truncate) — guaranteed clean slate
- Backend strategy: Claude's discretion (in-memory only vs both file + in-memory)
- Fixtures: both JSON files (for standard datasets via POST /admin/fixtures/load) and TypeScript factory functions (for programmatic test setup)

### Twin app skeleton
- Twin apps live in `twins/` top-level directory (twins/shopify/, twins/slack/)
- Internal twin structure: Claude's discretion (domain-grouped vs layer-grouped)
- Include a minimal example twin in Phase 1 to validate foundation end-to-end (health check, one stateful endpoint, structured logging)
- Vitest as the test runner across the monorepo

### Claude's Discretion
- Route organization pattern (plugin-per-domain vs file-based — whichever fits Fastify best)
- State interaction pattern (repository, ORM, or hybrid)
- SQLite backend strategy (in-memory only vs file + in-memory switchable)
- Internal twin app folder structure (domain-grouped vs layer-grouped)

</decisions>

<specifics>
## Specific Ideas

- Example twin should be minimal — just enough to prove shared packages wire up correctly (health check, one stateful endpoint, structured logging)
- Fixtures support both JSON files for inspectable standard datasets and TypeScript factories for composable, type-safe programmatic setup

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-monorepo-setup*
*Context gathered: 2026-02-27*
