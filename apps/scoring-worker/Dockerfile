FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy manifests for install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config-ts/package.json ./packages/config-ts/
COPY apps/scoring-worker/package.json ./apps/scoring-worker/

RUN pnpm install --frozen-lockfile --filter @cap/scoring-worker...

# Copy source
COPY packages/db/ ./packages/db/
COPY packages/shared/ ./packages/shared/
COPY packages/config-ts/ ./packages/config-ts/
COPY apps/scoring-worker/ ./apps/scoring-worker/

WORKDIR /app/apps/scoring-worker
ENV NODE_ENV=production

CMD ["pnpm", "run", "start"]
