# Sandpiper DTU — Parameterized twin Docker image
# Build: docker build --build-arg TWIN_NAME=shopify -t dtu/shopify-twin .
# Build: docker build --build-arg TWIN_NAME=slack -t dtu/slack-twin .

# ─── Stage 1: base ────────────────────────────────────────────────────
# Use node:20-slim (glibc) — better-sqlite3 native module requires glibc, not musl (Alpine).
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate

# ─── Stage 2: build ───────────────────────────────────────────────────
FROM base AS build
WORKDIR /app

ARG TWIN_NAME
RUN test -n "$TWIN_NAME" || (echo "ERROR: TWIN_NAME build arg required (shopify or slack)" && exit 1)

# Copy lockfile and workspace config first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# Copy all shared packages (needed for build and runtime)
COPY packages/ ./packages/

# Copy the target twin
COPY twins/${TWIN_NAME}/ ./twins/${TWIN_NAME}/

# Install dependencies with BuildKit cache mount for pnpm store
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build shared packages first (order matters: types → state → webhooks → conformance → ui)
RUN pnpm --filter="./packages/*" run build

# Build the target twin
RUN pnpm --filter="@dtu/twin-${TWIN_NAME}" run build

# Deploy production dependencies into isolated directory
RUN pnpm deploy --filter="@dtu/twin-${TWIN_NAME}" --prod /prod/${TWIN_NAME}

# ─── Stage 3: runtime ─────────────────────────────────────────────────
FROM node:20-slim AS runtime

ARG TWIN_NAME
ARG TWIN_PORT=3000
ENV NODE_ENV=production

WORKDIR /app

# Copy deployed production dependencies (node_modules + package.json)
COPY --from=build /prod/${TWIN_NAME} .

# Copy compiled JavaScript output
COPY --from=build /app/twins/${TWIN_NAME}/dist ./dist

# Copy runtime file dependencies that tsc does NOT compile:
# - .eta view templates (UI plugin resolves ../views from dist/plugins/)
# - .graphql schema (GraphQL plugin dist-mode path: ../../src/schema/)
# Copying the entire src/ dir is safe — .ts files are ignored at runtime, adds negligible size.
COPY --from=build /app/twins/${TWIN_NAME}/src ./src

# Create views symlink for dist-mode path resolution.
# Compiled UI plugin: __dirname=dist/plugins/, viewsDir=path.join(__dirname, '../views')=dist/views/
# But views are in src/views/. Symlink dist/views -> ../src/views makes this work.
RUN ln -s ../src/views dist/views

# Copy shared @dtu/ui partials and public assets.
# pnpm deploy uses symlinks: node_modules/@dtu/ui -> .pnpm/.../@dtu/ui
# We must copy into the REAL directory (the pnpm store path), not just the symlink.
# Use $(readlink -f ...) to resolve the actual @dtu/ui directory.
COPY --from=build /app/packages/ui/src/partials ./ui-assets/partials
COPY --from=build /app/packages/ui/src/public ./ui-assets/public
RUN UI_REAL=$(readlink -f node_modules/@dtu/ui 2>/dev/null || echo node_modules/@dtu/ui) && \
    mkdir -p "$UI_REAL/src" && \
    cp -r ui-assets/partials "$UI_REAL/src/partials" && \
    cp -r ui-assets/public "$UI_REAL/src/public" && \
    rm -rf ui-assets

# Copy healthcheck script
COPY scripts/healthcheck.mjs ./healthcheck.mjs

# Run as non-root user for security
USER node

EXPOSE $TWIN_PORT

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "healthcheck.mjs"]

CMD ["node", "dist/index.js"]
