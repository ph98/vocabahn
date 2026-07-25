#!/usr/bin/env bash
# Multilayer backup: pg_dump + Redis RDB snapshot → local ./backups/
# Optional: set BACKUP_S3_BUCKET in .env to also sync to S3.
# Usage:
#   bash scripts/backup.sh              # timestamped backup
#   bash scripts/backup.sh pre-deploy   # labeled backup before a deploy
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if docker compose -f "$REPO_DIR/docker-compose.production.yml" ps --services 2>/dev/null | grep -q "^db$"; then
  COMPOSE="docker compose -f $REPO_DIR/docker-compose.production.yml"
else
  COMPOSE="docker compose"
fi

BACKUP_DIR="$REPO_DIR/backups"
LABEL="${1:-$(date +%Y-%m-%d_%H-%M)}"
PG_FILE="$BACKUP_DIR/${LABEL}_postgres.sql.gz"
REDIS_FILE="$BACKUP_DIR/${LABEL}_redis.rdb"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"   # keep backups for N days

log()  { echo -e "\033[1;34m[backup]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ok]\033[0m $*"; }

mkdir -p "$BACKUP_DIR"

# ── 1. Postgres dump ──────────────────────────────────────────────────────────
log "Dumping Postgres → $PG_FILE"
$COMPOSE exec -T db \
  sh -c 'set -eo pipefail; USER="${POSTGRES_USER:-postgres}"; DB="${POSTGRES_DB:-vocabahn}"; pg_dump -U "$USER" "$DB" | gzip' \
  > "$PG_FILE"
ok "Postgres dump: $(du -sh "$PG_FILE" | cut -f1)"

# ── 2. Redis RDB snapshot ─────────────────────────────────────────────────────
log "Snapshotting Redis → $REDIS_FILE"
# BGSAVE triggers an async dump; wait for it to finish then copy the RDB file.
$COMPOSE exec -T redis redis-cli BGSAVE >/dev/null
sleep 2
$COMPOSE exec -T redis redis-cli DEBUG SLEEP 0 >/dev/null 2>&1 || true
docker cp "$($COMPOSE ps -q redis)":/data/dump.rdb "$REDIS_FILE" 2>/dev/null || \
  log "Warning: Redis RDB copy failed (Redis may not have written dump.rdb yet)"
ok "Redis snapshot done"

# ── 3. Offsite sync (optional) ───────────────────────────────────────────────
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  log "Syncing to s3://$BACKUP_S3_BUCKET/backups/"
  aws s3 cp "$PG_FILE"    "s3://$BACKUP_S3_BUCKET/backups/" || log "Warning: S3 upload failed"
  aws s3 cp "$REDIS_FILE" "s3://$BACKUP_S3_BUCKET/backups/" || log "Warning: S3 Redis upload failed"
  ok "S3 sync done"
fi

# ── 4. Prune old local backups ────────────────────────────────────────────────
log "Pruning backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name '*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name '*.rdb'    -mtime +"$KEEP_DAYS" -delete

ok "Backup complete: $LABEL"
ls -lh "$BACKUP_DIR" | tail -6
