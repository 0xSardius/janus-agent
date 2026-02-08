# ═══════════════════════════════════════════════════════════════════════════
# Stage 1: Builder — install deps and compile TypeScript
# ═══════════════════════════════════════════════════════════════════════════
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy monorepo root files first (workspace config)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy agent package.json for dependency resolution
COPY packages/agent/package.json packages/agent/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy agent source code
COPY packages/agent/ packages/agent/

# Copy root tsconfig (extended by agent)
COPY tsconfig.json ./

# Build TypeScript
RUN pnpm --filter @janus/agent build

# ═══════════════════════════════════════════════════════════════════════════
# Stage 2: Runner — slim production image
# ═══════════════════════════════════════════════════════════════════════════
FROM node:20-slim AS runner

WORKDIR /app

RUN npm install -g pnpm@9

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json packages/agent/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod || pnpm install --prod

# Copy built artifacts from builder
COPY --from=builder /app/packages/agent/dist packages/agent/dist

EXPOSE 3000

CMD ["node", "packages/agent/dist/runner.js"]
