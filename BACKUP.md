# Backup Architecture

Vocabahn uses a **3-layer backup strategy** to ensure data survives hardware failures, accidental deletion, and bad deploys.

---

## Layer overview

```
Layer 1 — Pre-deploy snapshot   (scripts/deploy.sh runs before every deploy)
Layer 2 — Daily scheduled dump  (cron → scripts/backup.sh)
Layer 3 — Offsite S3 sync       (optional; set BACKUP_S3_BUCKET in .env)
```

Each layer is independent. A bad deploy can be rolled back with Layer 1. A disk failure can be recovered with Layer 3.

---

## What is backed up

| Data | Backup method | Location |
|---|---|---|
| Postgres (all tables) | `pg_dump \| gzip` | `./backups/*.sql.gz` |
| Redis (BullMQ queues) | `BGSAVE` → RDB file copy | `./backups/*.rdb` |
| Uploaded service-account.json | Keep a copy off-server | — |
| `.env` | Never commit. Keep in a password manager | — |

The ingested lexicon (`lexicon_entries`, 938 MB source) is re-ingestible from the source JSONL at any time and is therefore low-priority for backup. All user data (cards, review logs, knowledge scores, known words) lives in Postgres and is fully covered by pg_dump.

---

## Layer 1 — Pre-deploy snapshot

`scripts/deploy.sh` automatically calls `scripts/backup.sh pre-deploy` before stopping containers. If a deploy breaks the app, roll back in ~2 minutes:

```bash
# Roll back code
git revert HEAD
# Restore database to the pre-deploy state
bash scripts/restore.sh backups/pre-deploy_postgres.sql.gz
# Redeploy
bash scripts/deploy.sh
```

---

## Layer 2 — Daily scheduled backup

Set up a cron job on the server:

```bash
# Open crontab
crontab -e

# Add: run backup at 2 AM every day
0 2 * * * cd /home/user/vocabahn && bash scripts/backup.sh >> /var/log/vocabahn-backup.log 2>&1
```

Backups older than `BACKUP_KEEP_DAYS` (default: 14) are pruned automatically.

---

## Layer 3 — Offsite S3 sync

Set in `.env`:
```
BACKUP_S3_BUCKET=your-bucket-name
```

Requires `aws` CLI installed and configured (`aws configure`) on the server.  
Any S3-compatible provider works (AWS S3, Backblaze B2, Cloudflare R2).

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Configure
aws configure   # enter Access Key, Secret, Region, output=json

# Test
bash scripts/backup.sh && aws s3 ls s3://your-bucket-name/backups/
```

---

## Recovery procedures

### Restore Postgres from a backup file

```bash
bash scripts/restore.sh backups/2026-06-16_02-00_postgres.sql.gz
```

The script:
1. Stops the api to prevent writes
2. Drops and recreates the `vocabahn` database
3. Streams the gzipped dump back in
4. Runs `prisma migrate deploy` for any pending migrations
5. Restarts all services

### Restore from S3

```bash
# Download backup from S3
aws s3 cp s3://your-bucket-name/backups/2026-06-16_02-00_postgres.sql.gz backups/

# Restore
bash scripts/restore.sh backups/2026-06-16_02-00_postgres.sql.gz
```

### Redis recovery

Redis data (BullMQ job queues) is ephemeral-safe: any jobs in the queue at the time of failure will simply retry when Redis comes back. The RDB backup exists as a best-effort layer; in practice, failing over to an empty Redis is acceptable.

---

## Backup verification

Run monthly to verify backups are readable:

```bash
# Test that the most recent dump restores cleanly into a temp container
LATEST=$(ls -t backups/*_postgres.sql.gz | head -1)
docker run --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test \
  postgres:16-alpine sh -c "sleep 2" &
sleep 3
gunzip -c "$LATEST" | head -100   # should print SQL statements
echo "Backup $LATEST appears valid."
```

---

## Data that is NOT automatically backed up

| Data | Mitigation |
|---|---|
| `.env` (secrets) | Store in a password manager (1Password, Bitwarden) |
| `service-account.json` | Keep a copy in your GCP console |
| Unsplash/TTS audio/image files (if stored locally) | Currently stored as external URLs; no local copy needed |
| Source data files (`data/*.jsonl`, `data/*.txt`) | Re-downloadable from kaikki.org / frequency list sources |
