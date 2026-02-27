# Technology Stack

**Project:** Sandpiper DTU (Digital Twin Universe)
**Domain:** High-fidelity API simulators/twins
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### Core HTTP Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Fastify | 5.x | HTTP server framework | TypeScript-first with native type support, 10x faster than Express (77K req/s), schema-based validation, efficient logging via Pino. Use for production-grade API simulators that need performance. |
| Express | 5.2.1+ | HTTP server fallback | Familiar to team (Sandpiper already uses it), massive middleware ecosystem, simpler for rapid prototyping. Use if team velocity matters more than performance. |

**Recommendation:** **Fastify** for new twins. Express is fine for Sandpiper compatibility, but Fastify's native TypeScript support and schema validation align perfectly with API twin requirements.

### GraphQL Server

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| GraphQL Yoga | 5.x (latest Dec 2025) | GraphQL server for Shopify twin | Built-in subscriptions (SSE), zero-config TypeScript support, universal runtime (works anywhere), includes GraphiQL out-of-box. Lighter and more modern than Apollo Server. |
| @graphql-tools/schema | Latest | Schema composition | Part of GraphQL Yoga ecosystem, handles schema stitching and type merging for complex APIs like Shopify. |
| @graphql-codegen/cli | 5.0.8+ | Type generation from schemas | Generates TypeScript types from GraphQL schema, ensuring twin API matches real Shopify GraphQL surface. Critical for fidelity. |

**Rationale:** GraphQL Yoga over Apollo Server because it's TypeScript-native, has 43.2K dependents (vs Apollo's larger but older ecosystem), and requires less configuration for simulator use cases. Apollo Server is production-grade but overkill for test infrastructure.

### Database / State Management

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| better-sqlite3 | 12.6.2+ | Twin state persistence | Synchronous API (simpler than async for test data), 11-24x faster than alternatives, zero dependencies, easy reset between test runs. Production-proven (176K dependents). |

**Rationale:** SQLite over in-memory because state persistence across twin restarts helps debugging. better-sqlite3 over node-sqlite3 because synchronous API is simpler for test infrastructure and performance is dramatically better.

**Alternative:** Bun's native SQLite (3-6x faster than better-sqlite3) if team adopts Bun runtime, but Node.js ecosystem maturity makes this premature for 2026.

### Schema Validation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Zod | Latest | Request/response validation | TypeScript-first with automatic type inference, zero dependencies, smaller bundle size than Joi. Fastify integration via @fastify/type-provider-zod. Perfect for validating twin requests match real API contracts. |

**Rationale:** Zod over Joi because TypeScript type inference means validation schemas double as type definitions (no duplication). Joi is JavaScript-first and doesn't auto-generate types. For TypeScript-heavy projects like this, Zod is the 2026 standard.

### Webhook Delivery

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| BullMQ | 5.70.1+ | Webhook queue with retry | Redis-backed distributed queue, TypeScript-native, built-in exponential backoff, rate limiting, deduplication. Rock-solid for webhook delivery simulation. |
| ioredis | Latest | Redis client for BullMQ | BullMQ dependency, fastest Redis client for Node.js. |

**Rationale:** BullMQ over custom queue because webhook retry logic is complex (exponential backoff, dead letter queues, concurrency limits). BullMQ provides this out-of-box with 797 releases of battle-testing.

**Lightweight Alternative:** For simple webhook delivery without Redis dependency, use native `better-sqlite3` queue table + `node-cron` for polling. Only use if avoiding Redis complexity is critical.

### Testing Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vitest | 4.0.18+ | Test runner for twins | TypeScript/ESM native, 4x faster cold start than Jest, 10-20x faster watch mode, Vite integration, Jest-compatible API. Industry momentum in 2026 (Nuxt, SvelteKit, Astro default to Vitest). |
| Mockttp | 4.0.0+ | HTTP conformance testing | TypeScript-native HTTP mock server for validating twin behavior against real APIs. Supports HTTPS interception, parallel tests, debug mode for understanding mismatches. |

**Rationale:** Vitest over Jest because TypeScript is first-class (no ts-jest config), ESM just works, and performance matters for conformance test suites that run frequently. Mockttp for conformance because it intercepts real HTTP (can test against sandbox APIs and twins side-by-side).

**Note:** MSW (Mock Service Worker) is great for *mocking* APIs in tests, but not suitable for building standalone API servers. It's for test/dev mocking, not server simulation.

### Monorepo Tooling

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| pnpm workspaces | 9.x+ | Package management | Fastest install, efficient disk usage, strict dependency isolation prevents phantom deps. Industry standard for TypeScript monorepos in 2026. |
| Turborepo | 2.x | Build orchestration | Remote caching (CI never does same work twice), intelligent task scheduling, works with pnpm. Simpler than Nx for this use case. |

**Rationale:** pnpm + Turborepo over npm + Lerna because pnpm is 2x faster and Turborepo's remote caching dramatically speeds up CI. Turborepo over Nx because Nx is overkill for 2-3 twins + shared libs (Nx shines at 20+ packages).

### Docker & Deployment

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| node:22-alpine | 22.x-alpine | Base image | Alpine reduces image size from 352MB to 40MB. Multi-stage build keeps dev deps out of runtime. Node 22 LTS (matches Sandpiper's Node 20+ requirement). |
| docker-compose | 3.9+ | Twin orchestration | Wires twins + Sandpiper for E2E tests. Overlay pattern lets CI swap real services for twins. |

**Rationale:** Alpine over full Node image for 87% size reduction. Multi-stage builds separate TypeScript compilation from runtime (only ship compiled JS + production deps).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | Latest | TypeScript execution | Run twins directly with `tsx src/server.ts` in dev (no tsc watch needed). Faster iteration. |
| tsup | Latest | Bundler | Bundle twin for production Docker image. Fast, zero-config, better than tsc for server bundles. |
| @types/node | Latest | Node.js types | Essential for TypeScript. Match Node runtime version (22.x). |
| pino | Latest | Structured logging | Fastify's default logger. Fast, structured JSON logs for debugging twin behavior. |
| dotenv | Latest | Environment config | Load .env for twin base URLs, ports, Redis connection. Simple, battle-tested. |

## Installation

```bash
# Core framework (choose one)
pnpm add fastify @fastify/type-provider-zod  # Recommended
# OR
pnpm add express                              # Fallback

# GraphQL (for Shopify twin)
pnpm add graphql graphql-yoga @graphql-tools/schema

# Database
pnpm add better-sqlite3

# Schema validation
pnpm add zod

# Webhook delivery (if using Redis approach)
pnpm add bullmq ioredis

# Supporting
pnpm add pino dotenv

# Dev dependencies
pnpm add -D typescript @types/node tsx tsup vitest mockttp @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Fastify | Express | Team already knows Express well, need rapid prototyping, middleware ecosystem matters more than performance. Express is fine, just slower. |
| Fastify | Hono | Building for edge runtimes (Cloudflare Workers, Deno Deploy). Hono is modern/fast but ecosystem is smaller. Overkill for Docker twins. |
| GraphQL Yoga | Apollo Server | Need Apollo Federation, enterprise support contracts, or Apollo Studio integration. Apollo is production-grade but heavier. |
| better-sqlite3 | In-memory Map | State doesn't need to survive twin restarts. Simpler but loses debugging value of persistent state. |
| BullMQ + Redis | SQLite queue table | Want zero external dependencies (no Redis). Simpler but loses distributed queue benefits (parallel workers, cross-process coordination). |
| Vitest | Jest | Existing Jest setup with 10K+ tests, migration cost too high. Vitest is faster but migration takes time. |
| Turborepo | Nx | Monorepo grows to 20+ packages, need advanced code generation, visual dependency graphs. Nx has more features but steeper learning curve. |
| pnpm | npm workspaces | Team unfamiliar with pnpm, simple monorepo (2-3 packages). npm works fine, just slower installs. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| node-sqlite3 | Asynchronous API adds complexity for test data, 11-24x slower than better-sqlite3. | better-sqlite3 |
| Joi | JavaScript-first, no automatic TypeScript type inference, larger bundle size. | Zod |
| Bull (not BullMQ) | Older, maintenance-mode. BullMQ is the TypeScript rewrite. | BullMQ |
| Jest | Slower than Vitest (30-70% longer CI runs), requires ts-jest config, ESM is second-class. | Vitest |
| MSW for standalone servers | MSW is for mocking APIs in tests, not building API servers. Using it for twins would be architectural mismatch. | Fastify/Express + Mockttp for testing |
| Lerna | Maintenance-mode, superseded by pnpm workspaces + Turborepo. | pnpm + Turborepo |
| ts-node | Slower than tsx, deprecated in favor of modern loaders. | tsx |
| Webpack/Rollup for servers | Overkill for Node.js server bundling, slow compile times. | tsup |

## Stack Patterns by Variant

**If building Shopify twin (GraphQL API):**
- Use Fastify + GraphQL Yoga + @graphql-codegen/cli
- Generate types from Shopify's official GraphQL schema
- Validate requests against schema with Zod
- Store state in better-sqlite3 tables matching Shopify's data model

**If building Slack twin (REST + Events API):**
- Use Fastify + Zod for REST endpoints
- Use BullMQ for event webhook delivery (Slack sends events async)
- Store workspace/channel/user state in better-sqlite3
- Use Mockttp to validate twin responses against real Slack API

**If avoiding Redis dependency:**
- Skip BullMQ, use better-sqlite3 table as webhook queue
- Poll queue table with `node-cron` or `setTimeout` loop
- Implement exponential backoff manually (simple algorithm)
- Loses distributed benefits but acceptable for single-process twins

**If team is Express-native:**
- Use Express instead of Fastify (performance hit acceptable for test infra)
- Add `express-validator` + Zod for request validation
- Add `pino-http` for structured logging
- All other stack choices remain the same

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Fastify 5.x | Node.js 20.6+ | Requires Node 20 minimum for ESM loader |
| better-sqlite3 12.x | Node.js 18+ | Prebuilt binaries for 18+, 20, 22 |
| BullMQ 5.x | ioredis 5.x, Redis 6+ | Redis 6.2+ required for some features |
| Vitest 4.x | Node.js 18+ | Vite 6 dependency requires Node 18+ |
| GraphQL Yoga 5.x | graphql 16.x | Yoga 5 requires GraphQL 16, not 15 |
| Turborepo 2.x | pnpm 8+, npm 9+, yarn 4+ | Works with any modern package manager |

## Sources

**HIGH Confidence (Official Docs, GitHub Repos, Context7):**
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) - Version 12.6.2, performance benchmarks, features
- [Fastify GitHub](https://github.com/fastify/fastify) - Version 5.x, TypeScript support, 77K req/s benchmarks
- [GraphQL Yoga GitHub](https://github.com/dotansimha/graphql-yoga) - Version 5.x, features, 43.2K dependents
- [Apollo Server GitHub](https://github.com/apollographql/apollo-server) - Version 5.4.0, comparison baseline
- [BullMQ GitHub](https://github.com/taskforcesh/bullmq) - Version 5.70.1, webhook patterns
- [Vitest GitHub](https://github.com/vitest-dev/vitest) - Version 4.0.18, TypeScript support
- [Mockttp GitHub](https://github.com/httptoolkit/mockttp) - Version 4.0.0, HTTP testing features
- [Express GitHub](https://github.com/expressjs/express) - Version 5.2.1, maintenance status
- [Turborepo Docs](https://turborepo.dev/docs) - Features, migration guides

**MEDIUM Confidence (WebSearch verified with multiple sources):**
- [Vitest vs Jest 2026 Benchmarks](https://www.sitepoint.com/vitest-vs-jest-2026-migration-benchmark/) - Performance data, 4x faster
- [Zod vs Joi Comparison](https://betterstack.com/community/guides/scaling-nodejs/joi-vs-zod/) - TypeScript support, bundle size
- [Monorepo Insights: Nx, Turborepo, PNPM](https://medium.com/ekino-france/monorepo-insights-nx-turborepo-and-pnpm-3-4-96a3fb363cf4) - Decision framework
- [Docker Node.js Best Practices](https://medium.com/@regansomi/4-easy-docker-best-practices-for-node-js-build-faster-smaller-and-more-secure-containers-151474129ac0) - Alpine, multi-stage builds
- [BullMQ for Webhooks](https://oneuptime.com/blog/post/2026-01-25-webhook-service-retry-logic-nodejs/view) - Retry patterns, queue architecture
- [GraphQL Code Generator](https://oneuptime.com/blog/post/2026-02-03-graphql-code-generator/view) - Type generation workflow

**MEDIUM-LOW Confidence (WebSearch ecosystem discovery):**
- [Better Stack: Joi vs Zod](https://betterstack.com/community/guides/scaling-nodejs/joi-vs-zod/) - 2026 recommendations
- [DEV Community: Vitest vs Jest 30](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb) - Ecosystem adoption trends

---

*Stack research for: Digital Twin Universe (DTU) - API simulators*
*Researched: 2026-02-27*
*Confidence: MEDIUM-HIGH (versions verified via official sources, ecosystem patterns from multiple 2026 sources)*
