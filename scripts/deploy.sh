#!/usr/bin/env bash
# One-step production deployment for Vocabahn.
# Run on the server: bash scripts/deploy.sh
# First-time setup: bash scripts/deploy.sh --setup
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/docker-compose.production.yml"
SETUP_MODE=false

for arg in "$@"; do
  [[ "$arg" == "--setup" ]] && SETUP_MODE=true
done

cd "$REPO_DIR"

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
  required_vars=(POSTGRES_PASSWORD JWT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_PASSWORD ADMIN_COOKIE_PASSWORD)
  for v in "${required_vars[@]}"; do
    grep -qE "^${v}=.+" .env || err "$v is not set in .env"
  done

  # SSL certs
  if [[ ! -f ssl/cert.pem || ! -f ssl/key.pem ]]; then
    log "No SSL certs found at ssl/. Generating self-signed certs for now."
    log "Replace with Let's Encrypt certs for production: see DEPLOYMENT.md §SSL"
    mkdir -p ssl
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -keyout ssl/key.pem -out ssl/cert.pem \
      -subj "/CN=vocabahn" -quiet
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

log "Pulling latest code..."
git pull --ff-only

log "Building images..."
$COMPOSE build --pull

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
$COMPOSE exec -T api sh -c "pnpm exec prisma migrate deploy" 2>&1 || true

log "Checking API health..."
for i in {1..20}; do
  curl -sf http://localhost/api/v1/health >/dev/null && break
  sleep 3
done
curl -sf http://localhost/api/v1/health >/dev/null || err "API health check failed after deploy"

ok "Deploy complete! App is live."
$COMPOSE ps
