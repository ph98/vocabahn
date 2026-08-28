# Build context must be the repo root (pnpm workspace).
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Install deps first so source edits don't bust the cache.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches ./patches
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @vocabahn/shared build \
 && pnpm --filter @vocabahn/api exec prisma generate \
 && pnpm --filter @vocabahn/api build

# Stamped last so a new revision does not bust the install/build layers above.
# `deploy.sh` reads this back out of the built image and refuses to deploy when
# it does not match the checked-out revision — a cached layer once shipped an
# image compiled from older source, which is not otherwise visible from outside.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
