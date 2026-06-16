#!/usr/bin/env bash
# Restore Postgres from a pg_dump .sql.gz backup file.
# Usage: bash scripts/restore.sh backups/2026-06-16_02-00_postgres.sql.gz
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/docker-compose.production.yml"
BACKUP_FILE="${1:?Usage: $0 <path-to-backup.sql.gz>}"

[[ -f "$BACKUP_FILE" ]] || { echo "File not found: $BACKUP_FILE"; exit 1; }

log()  { echo -e "\033[1;34m[restore]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }

warn "This will DROP and recreate the vocabahn database."
warn "Backup file: $BACKUP_FILE"
read -rp "Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

log "Stopping api to prevent writes..."
$COMPOSE stop api || true

log "Dropping and recreating database..."
$COMPOSE exec -T db \
  psql -U vocabahn postgres -c "DROP DATABASE IF EXISTS vocabahn; CREATE DATABASE vocabahn OWNER vocabahn;"

log "Restoring from $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | $COMPOSE exec -T db psql -U vocabahn vocabahn

log "Running pending migrations (if any)..."
$COMPOSE start api
sleep 5
$COMPOSE exec -T api pnpm exec prisma migrate deploy 2>&1 || true

log "Restore complete. Starting all services..."
$COMPOSE up -d

echo ""
log "Done. Verify the app at https://yourdomain.com"
