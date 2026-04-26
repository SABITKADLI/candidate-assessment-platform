FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
# Docker CLI needed to spawn sandbox containers
RUN apk add --no-cache docker-cli
WORKDIR /app

# Copy manifests for install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config-ts/package.json ./packages/config-ts/
COPY apps/sandbox-worker/package.json ./apps/sandbox-worker/

RUN pnpm install --frozen-lockfile --filter @cap/sandbox-worker...

# Copy source
COPY packages/db/ ./packages/db/
COPY packages/shared/ ./packages/shared/
COPY packages/config-ts/ ./packages/config-ts/
COPY apps/sandbox-worker/ ./apps/sandbox-worker/

WORKDIR /app/apps/sandbox-worker

ENV NODE_ENV=production

CMD ["pnpm", "run", "start"]
