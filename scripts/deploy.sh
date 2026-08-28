#!/usr/bin/env bash
# One-step production deployment for Vocabahn.
# Run on the server: bash scripts/deploy.sh
# First-time setup: bash scripts/deploy.sh --setup
set -euo pipefail

DEPLOY_ENV="${ENV:-production}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/docker-compose.prod.yml"
SETUP_MODE=false

for arg in "$@"; do
  [[ "$arg" == "--setup" ]] && SETUP_MODE=true
done

cd "$REPO_DIR"

NGINX_CONF="apps/web/nginx.production.conf"
if [[ "$DEPLOY_ENV" == "staging" ]]; then
  NGINX_CONF="apps/web/nginx.staging.conf"
fi

# ── helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[deploy]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ok]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

# ── first-time setup ─────────────────────────────────────────────────────────
if $SETUP_MODE; then
  log "First-time setup..."

  command -v docker >/dev/null 2>&1 || err "Docker not found. Install Docker Engine first: https://docs.docker.com/engine/install/"
  command -v git    >/dev/null 2>&1 || err "git not found."

  [[ -f .env ]] || err ".env not found. Copy .env.example → .env and fill in all secrets before running --setup."

  # Verify required env vars are set
  required_vars=(POSTGRES_PASSWORD JWT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DIRECTUS_KEY DIRECTUS_SECRET DIRECTUS_ADMIN_EMAIL DIRECTUS_ADMIN_PASSWORD)
  for v in "${required_vars[@]}"; do
    grep -qE "^${v}=.+" .env || err "$v is not set in .env"
  done

  # SSL certs
  if [[ ! -f ssl/cert.pem || ! -f ssl/key.pem ]]; then
    log "No SSL certs found at ssl/. Generating self-signed certs for now."
    log "Replace with Let's Encrypt certs for production: see docs/operations.md §SSL"
    mkdir -p ssl
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -keyout ssl/key.pem -out ssl/cert.pem \
      -subj "/CN=vocabahn"
    ok "Self-signed cert generated at ssl/"
  fi

  # Backup dir
  mkdir -p backups

  log "Pulling base images..."
  docker pull postgres:16-alpine
  docker pull redis:7-alpine
  docker pull nginx:1.27-alpine
  docker pull node:20-slim

  ok "Setup complete. Run scripts/deploy.sh (without --setup) to deploy."
  exit 0
fi

# ── deploy ───────────────────────────────────────────────────────────────────
[[ -f .env ]]            || err ".env not found. Run: bash scripts/deploy.sh --setup"
[[ -f ssl/cert.pem ]]    || err "ssl/cert.pem not found. Run: bash scripts/deploy.sh --setup"
[[ -f ssl/key.pem ]]     || err "ssl/key.pem not found. Run: bash scripts/deploy.sh --setup"

# The caller may already have pinned the revision — CI does
# `git reset --hard origin/main` for staging and `git checkout <tag>` for
# production, the latter leaving a detached HEAD. In both cases a pull is at
# best redundant and at worst deploys something other than the revision CI
# tested, so a pull that cannot fast-forward is a reason to carry on with what
# is checked out, not to abort the deploy.
if [[ "${SKIP_GIT_PULL:-}" == "true" ]]; then
  log "Skipping git pull — caller pinned $(git rev-parse --short HEAD)"
elif ! git symbolic-ref -q HEAD >/dev/null; then
  log "Detached HEAD — deploying the checked-out revision $(git rev-parse --short HEAD)"
elif git pull --ff-only; then
  ok "Updated to $(git rev-parse --short HEAD)"
else
  log "git pull --ff-only did not apply (no upstream, or diverged from it)."
  log "Deploying the revision already checked out: $(git rev-parse --short HEAD)"
fi

# Exported so compose can stamp it into the API image (see docker-compose.prod.yml).
export GIT_SHA="$(git rev-parse HEAD)"

log "Building images (revision ${GIT_SHA:0:12})..."
$COMPOSE build --pull

# A build can report success and still ship an image compiled from older source
# — a cached layer did exactly that on 2026-08-27 and cost ~3.5h of downtime,
# with the running API silently two PRs behind a clean checkout. Nothing about
# the image's age is visible from outside, so read the stamp back and refuse to
# deploy an artifact that disagrees with the revision we are deploying.
built_sha() {
  docker run --rm --entrypoint sh vocabahn-api -c 'printf %s "${GIT_SHA:-}"' 2>/dev/null || true
}
if [[ "$(built_sha)" != "$GIT_SHA" ]]; then
  log "API image reports '$(built_sha)', expected '${GIT_SHA:0:12}' — rebuilding without cache."
  $COMPOSE build --no-cache api
  [[ "$(built_sha)" == "$GIT_SHA" ]] \
    || err "API image still reports '$(built_sha)' after a --no-cache rebuild, expected '$GIT_SHA'. Refusing to deploy a stale build."
fi
ok "API image built from ${GIT_SHA:0:12}"

log "Taking a pre-deploy database backup..."
bash "$REPO_DIR/scripts/backup.sh" pre-deploy || log "Warning: pre-deploy backup failed (continuing)"

log "Stopping old containers gracefully..."
$COMPOSE down --timeout 30 || true

log "Starting services..."
$COMPOSE up -d

log "Waiting for db to be healthy..."
for i in {1..30}; do
  $COMPOSE ps db | grep -q "healthy" && break
  sleep 2
done
$COMPOSE ps db | grep -q "healthy" || err "DB did not become healthy in time"

log "Running database migrations..."
$COMPOSE exec -T api sh -c "pnpm exec prisma migrate deploy"

log "Checking API health..."
for i in {1..20}; do
  curl -sf http://localhost/api/v1/health >/dev/null && break
  sleep 3
done
curl -sf http://localhost/api/v1/health >/dev/null || err "API health check failed after deploy"

ok "Deploy complete! App is live."
$COMPOSE ps
