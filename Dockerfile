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

# Build shared packages first (order matters: types → state → core → webhooks → conformance → ui)
RUN pnpm --filter="./packages/*" run build

# Build the target twin
RUN pnpm --filter="@dtu/twin-${TWIN_NAME}" run build

# Deploy production dependencies into isolated directory
RUN pnpm deploy --filter="@dtu/twin-${TWIN_NAME}" --prod /prod/${TWIN_NAME}

# ─── Stage 3: runtime ─────────────────────────────────────────────────
FROM node:20-slim AS runtime

ARG TWIN_NAME
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

# Copy shared @dtu/ui partials and public assets into the expected node_modules path.
# At runtime, @dtu/ui resolves getPackageRoot()/src/partials and getPackageRoot()/src/public.
# pnpm deploy places @dtu/ui in node_modules/@dtu/ui/ with dist/ but without src/.
COPY --from=build /app/packages/ui/src/partials ./node_modules/@dtu/ui/src/partials
COPY --from=build /app/packages/ui/src/public ./node_modules/@dtu/ui/src/public

# Copy healthcheck script
COPY scripts/healthcheck.mjs ./healthcheck.mjs

# Run as non-root user for security
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "healthcheck.mjs"]

CMD ["node", "dist/index.js"]
