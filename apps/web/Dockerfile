# Build context must be the repo root (pnpm workspace).
FROM node:20-slim AS build
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
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
# Product feedback widget. `.env` is dockerignored, so a build arg is the only
# way a VITE_ variable reaches the bundle. Unset builds a working app with no
# feedback trigger.
ARG VITE_USERSNAP_API_KEY
ENV VITE_USERSNAP_API_KEY=$VITE_USERSNAP_API_KEY
# Analytics and error tracking. Both are public by design — they ship in client
# JavaScript either way — so unlike `.env`'s server secrets they belong in the
# image. Unset builds a working app with GA4 and Sentry simply switched off.
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN pnpm --filter @vocabahn/shared build \
 && pnpm --filter @vocabahn/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
