# Phase 7: Integration & E2E Testing - Research

**Researched:** 2026-02-28
**Domain:** Docker containerization, Docker Compose orchestration, base URL swap integration, CI/CD pipeline configuration
**Confidence:** HIGH

## Summary

Phase 7 integrates the Sandpiper DTU twins (Shopify and Slack) with the Sandpiper application via two complementary mechanisms: base URL swap (environment variable configuration pointing IntegrationClient at twin URLs) and Docker Compose orchestration (multi-container setup with health checks for CI/E2E testing). The twins are Fastify HTTP servers using better-sqlite3 (native C++ addon) and Eta templates (loaded at runtime from source directories), which creates specific Docker image construction requirements.

The primary technical challenges are: (1) building Docker images for a pnpm monorepo with native modules, (2) handling runtime file dependencies (GraphQL schema, Eta view templates, CSS assets) that live outside the compiled `dist/` directory, (3) wiring containers together on a Docker network so Sandpiper can reach twins by service name, and (4) creating a CI workflow that builds images, starts the stack, and runs E2E tests without sandbox credentials.

**Primary recommendation:** Use multi-stage Docker builds with `node:20-slim` base images (not Alpine, due to better-sqlite3 native module compatibility), a shared Dockerfile parameterized by build arg for twin selection, and `pnpm deploy --filter --prod` for minimal production node_modules. Include `src/` directories alongside `dist/` in the final image to satisfy runtime file loading patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | Base URL swap -- Sandpiper's IntegrationClient points at twin URLs via environment config | Environment variable pattern: `SHOPIFY_API_URL=http://localhost:3000`, `SLACK_API_URL=http://localhost:3001`. Twins already listen on configurable PORT with `0.0.0.0` binding. Document the env var mapping so Sandpiper developers can swap base URLs. |
| INTG-02 | Docker Compose overlay (`docker-compose.twin.yml`) starts all twins + Sandpiper, wired together | Docker Compose file defining shopify-twin and slack-twin services on a shared network, with health checks, configurable ports, and environment variables. Sandpiper service added as optional (may live in Sandpiper's own repo). |
| INTG-03 | Docker images for each twin with health checks and configurable ports | Multi-stage Dockerfile using `node:20-slim`, `pnpm deploy --filter --prod` for production dependencies, runtime file copying (views, schema, CSS), and `HEALTHCHECK` instruction using Node.js HTTP module (no curl needed). |
</phase_requirements>

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Docker | 24+ | Container runtime | Industry standard, required for Docker Compose |
| Docker Compose | v2 (plugin) | Multi-container orchestration | Built into Docker Desktop, `docker compose` subcommand |
| node:20-slim | Node 20 LTS | Base Docker image | Matches project's `engines.node >= 20.0.0`; `-slim` variant avoids Alpine's musl/glibc issues with better-sqlite3 native module while keeping image small |
| pnpm deploy | 9.x | Monorepo production deployment | Extracts single package with all workspace dependencies into flat node_modules -- official pnpm recommendation for Docker |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| BuildKit | Built-in | Docker build engine | Cache mounts for pnpm store (`--mount=type=cache`), faster builds |
| Docker networks | N/A | Inter-container communication | Twins reachable by service name (e.g., `http://shopify-twin:3000`) |
| Node.js healthcheck script | N/A | Container health verification | Avoids installing curl/wget in slim images; uses Node.js built-in `http` module |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:20-slim | node:20-alpine | Alpine uses musl libc -- better-sqlite3 native module requires glibc or manual compilation with `python3 make g++`. Slim is ~50MB larger but avoids build failures and runtime `fcntl64` symbol errors. |
| pnpm deploy | Copy entire monorepo | pnpm deploy produces isolated flat node_modules with only production deps. Full copy includes devDependencies, all packages, test files -- bloated images. |
| Node.js healthcheck | curl -f | Requires `apt-get install curl` in slim image, adding attack surface and ~10MB. Node.js script is zero-dependency since Node.js is already present. |
| Parameterized single Dockerfile | Separate Dockerfile per twin | Both twins have identical build structure (pnpm monorepo package, Fastify app, same base image). Single parameterized Dockerfile avoids duplication. |

**Installation:** No new npm dependencies needed. Docker and Docker Compose are system-level tools.

## Architecture Patterns

### Recommended Project Structure

```
(project root)
├── Dockerfile                       # Shared multi-stage build for all twins
├── .dockerignore                    # Exclude node_modules, dist, .git, .planning
├── docker-compose.twin.yml          # Twin stack: shopify-twin + slack-twin
├── scripts/
│   └── healthcheck.mjs              # Node.js healthcheck script for Docker
├── twins/
│   ├── shopify/                     # Existing Shopify twin
│   └── slack/                       # Existing Slack twin
└── .github/
    └── workflows/
        ├── conformance.yml          # Existing conformance CI
        └── e2e.yml                  # New: E2E tests against Docker twins
```

### Pattern 1: Parameterized Multi-Stage Dockerfile

**What:** Single Dockerfile with `ARG TWIN_NAME` build argument that selects which twin to build. Three stages: deps (install), build (compile), runtime (minimal).

**When to use:** Building Docker images for either twin from the same monorepo.

**Example:**
```dockerfile
# Stage 1: Base with pnpm
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate

# Stage 2: Install dependencies and build
FROM base AS build
ARG TWIN_NAME
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY twins/${TWIN_NAME}/ ./twins/${TWIN_NAME}/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter="./packages/*" run build
RUN pnpm --filter="@dtu/twin-${TWIN_NAME}" run build
# Deploy production dependencies to /prod
RUN pnpm deploy --filter="@dtu/twin-${TWIN_NAME}" --prod /prod/${TWIN_NAME}

# Stage 3: Runtime
FROM node:20-slim AS runtime
ARG TWIN_NAME
ENV NODE_ENV=production
WORKDIR /app

# Copy deployed production node_modules
COPY --from=build /prod/${TWIN_NAME} .

# Copy compiled output
COPY --from=build /app/twins/${TWIN_NAME}/dist ./dist

# Copy runtime file dependencies (views, schema, public assets)
COPY --from=build /app/twins/${TWIN_NAME}/src/views ./src/views
COPY --from=build /app/twins/${TWIN_NAME}/src/schema ./src/schema
# Copy shared @dtu/ui partials and public assets
COPY --from=build /app/packages/ui/src/partials ./node_modules/@dtu/ui/src/partials
COPY --from=build /app/packages/ui/src/public ./node_modules/@dtu/ui/src/public

# Healthcheck script
COPY scripts/healthcheck.mjs ./healthcheck.mjs

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.mjs

CMD ["node", "dist/index.js"]
```

**Build commands:**
```bash
docker build --build-arg TWIN_NAME=shopify -t dtu/shopify-twin .
docker build --build-arg TWIN_NAME=slack -t dtu/slack-twin .
```

### Pattern 2: Docker Compose Overlay for Twin Stack

**What:** `docker-compose.twin.yml` defines twin services on a shared network with health checks and configurable ports.

**When to use:** Local development, CI/E2E testing, integration with Sandpiper.

**Example:**
```yaml
# docker-compose.twin.yml
services:
  shopify-twin:
    build:
      context: .
      args:
        TWIN_NAME: shopify
    ports:
      - "${SHOPIFY_TWIN_PORT:-3000}:3000"
    environment:
      - PORT=3000
      - DB_PATH=:memory:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "node", "healthcheck.mjs"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    networks:
      - twin-network

  slack-twin:
    build:
      context: .
      args:
        TWIN_NAME: slack
    ports:
      - "${SLACK_TWIN_PORT:-3001}:3001"
    environment:
      - PORT=3001
      - DB_PATH=:memory:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "node", "healthcheck.mjs"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    networks:
      - twin-network

networks:
  twin-network:
    driver: bridge
```

### Pattern 3: Base URL Swap via Environment Variables

**What:** Sandpiper's IntegrationClient switches from real API URLs to twin URLs by changing environment variables.

**When to use:** Running Sandpiper tests against twins (local dev or CI).

**Example environment configuration:**
```bash
# .env.twin (for Sandpiper project)
SHOPIFY_API_URL=http://localhost:3000
SHOPIFY_STORE_URL=http://localhost:3000
SLACK_API_URL=http://localhost:3001

# In Docker Compose network (service names as hostnames):
SHOPIFY_API_URL=http://shopify-twin:3000
SLACK_API_URL=http://slack-twin:3001
```

### Pattern 4: Node.js Healthcheck Script

**What:** Lightweight Node.js script that checks the `/health` endpoint without requiring curl or wget.

**When to use:** Docker HEALTHCHECK instruction in slim/distroless images.

**Example:**
```javascript
// scripts/healthcheck.mjs
import http from 'node:http';

const port = process.env.PORT || 3000;

const req = http.get(`http://localhost:${port}/health`, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.setTimeout(2000, () => {
  req.destroy();
  process.exit(1);
});
```

### Pattern 5: CI E2E Workflow with Docker Compose

**What:** GitHub Actions workflow that builds twin images, starts the stack, waits for health, and runs tests.

**When to use:** CI pipeline that validates Sandpiper against twins without sandbox credentials.

**Example:**
```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and start twin stack
        run: docker compose -f docker-compose.twin.yml up -d --build --wait

      - name: Verify health checks
        run: |
          curl -f http://localhost:3000/health
          curl -f http://localhost:3001/health

      - name: Run E2E tests against twins
        run: |
          # Tests run against twin URLs
          SHOPIFY_API_URL=http://localhost:3000 \
          SLACK_API_URL=http://localhost:3001 \
          pnpm test:e2e

      - name: Tear down
        if: always()
        run: docker compose -f docker-compose.twin.yml down
```

### Anti-Patterns to Avoid

- **Alpine base image with better-sqlite3:** better-sqlite3 compiles native C++ code against glibc. Alpine uses musl libc. Results in `fcntl64: symbol not found` runtime errors or requiring `python3 make g++` in the image, negating Alpine's size advantage.

- **Copying entire monorepo into Docker image:** Includes devDependencies, test files, .planning, .git, IDE configs. Use `pnpm deploy --filter --prod` to extract only production runtime.

- **Using `tsx` in production Docker images:** tsx is a devDependency for development. Production images should run `node dist/index.js` with pre-compiled JavaScript.

- **Hardcoding twin URLs in test code:** Use environment variables for all URLs. Tests should read `SHOPIFY_API_URL` and `SLACK_API_URL` from env, defaulting to localhost for local dev.

- **Running as root in Docker:** Use `USER node` in the final stage. The official Node.js Docker images include a `node` user.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monorepo Docker packaging | Custom copy scripts for workspace deps | `pnpm deploy --filter --prod` | Handles workspace dependency resolution, symlink flattening, devDependency pruning automatically |
| Container health checking | Bash scripts with curl/wget | Node.js `http.get` script | Already have Node.js runtime; avoids adding system packages to slim images |
| Multi-container orchestration | Shell scripts starting processes | Docker Compose | Health check waiting, network wiring, environment injection, declarative configuration |
| CI Docker caching | Manual layer optimization | Docker BuildKit cache mounts + `--mount=type=cache` | Persistent pnpm store cache across builds without manual management |
| Docker image building for CI | Building in CI from scratch each time | Docker layer caching with `actions/cache` | GitHub Actions can cache Docker layers to speed up subsequent builds |

**Key insight:** The Docker/Compose ecosystem has mature, battle-tested solutions for every aspect of this phase. The complexity is in the pnpm monorepo packaging and the runtime file dependency handling, not in inventing new infrastructure.

## Common Pitfalls

### Pitfall 1: Runtime File Dependencies Missing from Docker Image

**What goes wrong:** Twins load files at runtime from paths relative to `__dirname` -- GraphQL schema (`schema.graphql`), Eta view templates (`src/views/`), and shared @dtu/ui partials (`src/partials/`). When running compiled JS from `dist/`, these paths resolve outside the `dist/` directory. If the Docker image only contains `dist/` and `node_modules/`, the app crashes with ENOENT errors.

**Why it happens:** TypeScript compilation (`tsc --build`) only outputs `.js` and `.d.ts` files. Non-TypeScript assets (`.graphql`, `.eta`, `.css`) are NOT copied to `dist/`. The existing code handles this with path detection:
- GraphQL plugin: `__dirname.includes('/dist/') ? join(__dirname, '../../src/schema/schema.graphql') : ...`
- UI plugins: `path.join(__dirname, '../views')` -- this resolves to `dist/views/` when compiled, which does NOT exist.

**How to avoid:** In the Dockerfile, explicitly COPY runtime file dependencies into the image at paths the compiled code expects:
1. Copy `twins/{name}/src/views/` to the image (the UI plugin paths resolve from dist/plugins/ to dist/../views = the package root level)
2. Copy `twins/{name}/src/schema/` to the image (GraphQL plugin's dist-mode path goes up to project root then into src/schema/)
3. Copy `packages/ui/src/partials/` and `packages/ui/src/public/` into the `node_modules/@dtu/ui/src/` path

**Warning signs:** Container starts but returns 500 errors on UI routes or GraphQL queries. Health check passes (no file dependencies) but API routes fail.

### Pitfall 2: better-sqlite3 Native Module Platform Mismatch

**What goes wrong:** better-sqlite3 compiles a native C++ addon (`.node` file) during `npm install`. If compiled on macOS (ARM64/x64) and the Docker image runs on Linux (x64/ARM64), the binary is incompatible. Or if using Alpine (musl), the glibc-linked binary crashes.

**Why it happens:** Native Node.js addons are platform-specific binaries. pnpm's content-addressable store may cache the wrong platform's binary.

**How to avoid:** Always run `pnpm install` INSIDE the Docker build (not copy from host). Use `node:20-slim` (Debian-based, glibc). The multi-stage build pattern handles this correctly because `pnpm install --frozen-lockfile` runs in the build stage on the target platform.

**Warning signs:** `Error: Cannot find module better_sqlite3.node` or `Error relocating better_sqlite3.node: fcntl64: symbol not found`.

### Pitfall 3: pnpm deploy Missing workspace:* Dependencies

**What goes wrong:** `pnpm deploy --filter=@dtu/twin-shopify --prod` copies the twin's production dependencies but may not include workspace package runtime files (Eta templates, CSS) that are referenced by path at runtime rather than through node_modules.

**Why it happens:** `pnpm deploy` resolves `workspace:*` dependencies and includes their `dist/` output in node_modules. But `@dtu/ui` has a `"files"` field in package.json that specifies `["dist/", "src/partials/", "src/public/"]` -- these extra directories need to be published/deployed correctly.

**How to avoid:** Verify that `pnpm deploy` includes the `files` entries from `@dtu/ui`. If not, add explicit COPY instructions in the Dockerfile for the shared assets. The @dtu/ui package already has the correct `"files"` field, so `pnpm deploy` should handle this. Test by inspecting the deployed output.

**Warning signs:** UI routes return 500 with "template not found" or static CSS returns 404.

### Pitfall 4: Docker Compose Health Check Timing

**What goes wrong:** Services declared with `depends_on: { shopify-twin: { condition: service_healthy } }` wait indefinitely or time out because the health check `start_period` is too short for container initialization.

**Why it happens:** Twin containers need time to: start Node.js, initialize SQLite, register Fastify plugins, and bind to the port. If `start_period` is too short, Docker marks the container as unhealthy before it finishes starting.

**How to avoid:** Set `start_period: 5s` (twins initialize fast with in-memory SQLite), `interval: 10s`, `timeout: 3s`, `retries: 3`. Monitor with `docker compose ps` to verify health status.

**Warning signs:** `docker compose up` shows containers in "starting" or "unhealthy" state despite the app running correctly.

### Pitfall 5: Port Collision Between Local Dev and Docker

**What goes wrong:** Developer runs twins locally (port 3000/3001) AND tries to start Docker Compose which maps the same host ports.

**Why it happens:** Both local dev (`tsx watch`) and Docker Compose default to ports 3000/3001.

**How to avoid:** Use environment variables for Docker Compose port mapping: `SHOPIFY_TWIN_PORT` and `SLACK_TWIN_PORT` with defaults. Document that local dev and Docker Compose should not run simultaneously on the same ports.

**Warning signs:** `docker compose up` fails with "port already in use" or "address already in use".

## Code Examples

### Healthcheck Script (scripts/healthcheck.mjs)

```javascript
// Source: Verified pattern from Node.js docs + Docker healthcheck best practices
import http from 'node:http';

const port = process.env.PORT || 3000;

const req = http.get(`http://localhost:${port}/health`, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.setTimeout(2000, () => {
  req.destroy();
  process.exit(1);
});
```

### .dockerignore

```
node_modules
dist
.git
.github
.planning
.claude
.vscode
.idea
*.md
!pnpm-workspace.yaml
coverage
*.db
*.sqlite
*.sqlite3
*.tsbuildinfo
*.log
.DS_Store
.env
.env.*
twins/example
```

### Docker Compose with Sandpiper Integration

```yaml
# docker-compose.twin.yml
# Usage: docker compose -f docker-compose.twin.yml up --build
# For Sandpiper integration, Sandpiper's own compose file can extend this
# or reference the twin images directly.

services:
  shopify-twin:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        TWIN_NAME: shopify
    ports:
      - "${SHOPIFY_TWIN_PORT:-3000}:3000"
    environment:
      PORT: "3000"
      DB_PATH: ":memory:"
      NODE_ENV: production
    healthcheck:
      test: ["CMD", "node", "healthcheck.mjs"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    networks:
      - twin-network

  slack-twin:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        TWIN_NAME: slack
    ports:
      - "${SLACK_TWIN_PORT:-3001}:3001"
    environment:
      PORT: "3001"
      DB_PATH: ":memory:"
      NODE_ENV: production
    healthcheck:
      test: ["CMD", "node", "healthcheck.mjs"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    networks:
      - twin-network

networks:
  twin-network:
    driver: bridge
```

### GitHub Actions E2E Workflow

```yaml
name: E2E Tests (Twins)

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e-twins:
    name: E2E against Docker twins
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and start twin stack
        run: docker compose -f docker-compose.twin.yml up -d --build --wait
        timeout-minutes: 5

      - name: Verify twin health
        run: |
          curl -sf http://localhost:3000/health | jq .
          curl -sf http://localhost:3001/health | jq .

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build packages
        run: pnpm build

      - name: Run E2E tests against twins
        run: pnpm test
        env:
          SHOPIFY_API_URL: http://localhost:3000
          SLACK_API_URL: http://localhost:3001

      - name: Tear down twin stack
        if: always()
        run: docker compose -f docker-compose.twin.yml down --volumes
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `docker-compose` (v1, standalone binary) | `docker compose` (v2, built-in plugin) | 2023 | Use `docker compose` (no hyphen) in all commands and CI |
| Alpine for small images | Slim for native modules | Ongoing | Alpine + native C++ addons = pain. Slim is ~50MB larger but works out of the box |
| curl in HEALTHCHECK | Node.js http script | 2024+ best practice | Zero additional dependencies, works in slim/distroless images |
| Copy entire monorepo to Docker | `pnpm deploy --filter --prod` | pnpm 7+ | Production-only flat node_modules, 60-80% smaller than full monorepo copy |
| Separate Dockerfiles per service | Parameterized multi-stage builds | Docker 17.05+ | Single Dockerfile with `ARG` reduces duplication |

**Deprecated/outdated:**
- Docker Compose v1 (`docker-compose` binary): EOL, use `docker compose` v2 plugin
- `pnpm fetch` for Docker: Still valid for CI without BuildKit cache mounts, but `pnpm deploy` is preferred for final image construction
- `npm ci` in Docker: pnpm monorepos should use `pnpm install --frozen-lockfile`

## Open Questions

1. **UI plugin path resolution in compiled mode**
   - What we know: The Shopify GraphQL plugin correctly handles `dist/` vs `src/` path detection (`__dirname.includes('/dist/')`). The UI plugins in both twins do NOT have this detection -- they use `path.join(__dirname, '../views')` which resolves to `dist/views/` when compiled.
   - What's unclear: Whether `pnpm deploy` or the Dockerfile COPY creates the views at the path the compiled code expects, or if we need to fix the path resolution in the UI plugins.
   - Recommendation: During implementation, first test with COPY to expected locations. If that's fragile, add dist-mode detection (like the GraphQL plugin) to both UI plugins. The most robust approach is fixing the path resolution to mirror the GraphQL plugin pattern, then COPY views to `src/views/` relative to the package root.

2. **pnpm deploy with inject-workspace-packages**
   - What we know: `pnpm deploy` requires `inject-workspace-packages: true` in `.npmrc` by default, or `--legacy` flag. This project has no `.npmrc` file.
   - What's unclear: Whether `pnpm deploy --legacy` works correctly for this monorepo structure, or if we need to create `.npmrc` with `inject-workspace-packages=true`.
   - Recommendation: Test `pnpm deploy --legacy --filter=@dtu/twin-shopify --prod /tmp/test-deploy` locally first. If it fails, add `.npmrc` with the required setting. Alternatively, use `--legacy` flag in the Dockerfile.

3. **Sandpiper integration scope**
   - What we know: Sandpiper is a SEPARATE project/repository. It has an `IntegrationClient` with configurable base URLs. The DTU repo provides the twins.
   - What's unclear: Whether success criteria #2 ("Sandpiper integration tests run successfully against twins") and #4 ("Sandpiper container communicates with twin containers") require changes in the Sandpiper repo (out of scope for this repo) or can be fully demonstrated within the DTU repo.
   - Recommendation: Within the DTU repo: (a) create integration smoke tests that verify the twins respond correctly to the same HTTP patterns Sandpiper's IntegrationClient uses, (b) document the environment variable configuration for Sandpiper, (c) provide a docker-compose.twin.yml that Sandpiper can reference. Leave Sandpiper-side changes to the Sandpiper repo.

## Sources

### Primary (HIGH confidence)
- pnpm Docker documentation (https://pnpm.io/docker) - Multi-stage build patterns, pnpm fetch, cache mounts
- pnpm deploy CLI documentation (https://pnpm.io/cli/deploy) - --filter, --prod, --legacy flags, workspace handling
- better-sqlite3 Docker discussion (https://github.com/WiseLibs/better-sqlite3/discussions/1270) - Alpine compatibility issues, glibc requirement
- Project codebase analysis - Examined all twin entry points, build configs, runtime file loading patterns, existing CI workflow

### Secondary (MEDIUM confidence)
- Docker healthcheck best practices (https://www.mattknight.io/blog/docker-healthchecks-in-distroless-node-js) - Node.js healthcheck pattern without curl/wget
- Docker Compose integration testing patterns (https://medium.com/@alexandre.therrien3/docker-compose-for-integration-testing-a-practical-guide-for-any-project-49b361a52f8c) - Service orchestration, health check waiting
- GitHub Actions Docker Compose workflows (https://github.com/peter-evans/docker-compose-actions-workflow) - CI pipeline patterns

### Tertiary (LOW confidence)
- None -- all findings verified against official documentation or project source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Docker, Docker Compose, pnpm deploy are mature, well-documented tools. node:20-slim choice verified against better-sqlite3 compatibility requirements.
- Architecture: HIGH - Multi-stage Docker builds and Docker Compose orchestration are standard patterns. Parameterized Dockerfile confirmed by pnpm Docker docs.
- Pitfalls: HIGH - Runtime file dependency issue verified by reading actual source code (graphql.ts line 38-40, ui.ts viewsDir resolution). better-sqlite3 Alpine issue verified by official GitHub discussion.
- Integration pattern: MEDIUM - Sandpiper is a separate repo; exact IntegrationClient env var names are assumed based on project documentation. May need adjustment when actually integrating.

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable domain -- Docker, pnpm, Node.js LTS)
