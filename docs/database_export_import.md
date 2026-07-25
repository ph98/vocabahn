# Database Export and Import Guide

This document provides step-by-step instructions for exporting the Vocabahn PostgreSQL database and importing it into another system or environment (e.g., local development to staging/production VPS, VPS to VPS, or local Docker to a managed Postgres instance).

---

## 1. Overview

Vocabahn uses **PostgreSQL** as its primary database, managed via **Prisma ORM**. 

- **Database Engine**: PostgreSQL 16+
- **Default Database Name**: `vocabahn`
- **Default User**: `vocabahn`
- **Database Dump Tool**: `pg_dump`
- **Database Restore Tool**: `psql` / `pg_restore`

Vocabahn includes automated scripts (`scripts/backup.sh` and `scripts/restore.sh`) for Docker-based environments, as well as native `pg_dump` / `psql` workflows for custom setups.

---

## 2. Exporting the Database

### Option A: Using Vocabahn Built-in Script (Docker Production / VPS)

If your source system runs Vocabahn using Docker Compose:

1. Navigate to the repository root directory:
   ```bash
   cd /path/to/vocabahn
   ```

2. Run the backup script with a custom label (e.g., `my_export`):
   ```bash
   bash scripts/backup.sh my_export
   ```
   This generates a gzipped PostgreSQL dump in the `backups/` directory:
   `backups/my_export_postgres.sql.gz`

---

### Option B: Manual `pg_dump` via Docker

If you prefer to export manually from a running Docker container:

```bash
docker compose exec -T db sh -c 'pg_dump -U vocabahn -d vocabahn' | gzip > vocabahn_backup.sql.gz
```

*Note: Replace `vocabahn` with your custom database name or user if configured differently in your `.env` file.*

---

### Option C: Manual `pg_dump` from Local / Standalone PostgreSQL

If PostgreSQL is running directly on your host machine (outside Docker):

```bash
# Export compressed custom format (.dump)
pg_dump -h localhost -p 5432 -U vocabahn -F c -b -v -f vocabahn_backup.dump vocabahn

# OR export gzipped plain SQL format (.sql.gz)
pg_dump -h localhost -p 5432 -U vocabahn -d vocabahn | gzip > vocabahn_backup.sql.gz
```

---

## 3. Transferring the Dump to the Target System

Use `scp`, `rsync`, or an S3 bucket to transfer the generated backup file to the target machine:

### Via `scp`:
```bash
scp backups/my_export_postgres.sql.gz user@target-server-ip:~/vocabahn/backups/
```

### Via AWS S3 (if configured):
On source server:
```bash
aws s3 cp backups/my_export_postgres.sql.gz s3://your-backup-bucket/backups/
```
On target server:
```bash
aws s3 cp s3://your-backup-bucket/backups/my_export_postgres.sql.gz backups/
```

---

## 4. Importing the Database into the Target System

> [!WARNING]
> Importing a database dump will **overwrite existing tables and data** in the target `vocabahn` database. Ensure you have backed up any critical data on the target system beforehand.

---

### Option A: Using Vocabahn Built-in Script (Docker Target)

1. Ensure the target Docker environment is set up and services are running:
   ```bash
   docker compose up -d
   ```

2. Execute the restore script, passing the path to your backup file:
   ```bash
   bash scripts/restore.sh backups/my_export_postgres.sql.gz
   ```

3. Type `yes` when prompted to confirm the operation.

The script automatically:
- Stops incoming API traffic (`docker compose stop api`).
- Drops and recreates the target database `vocabahn`.
- Restores the gzipped SQL database dump into PostgreSQL.
- Executes pending Prisma migrations (`prisma migrate deploy`).
- Restarts all API and worker services.

---

### Option B: Manual Import in Docker

If you prefer step-by-step manual execution in a Docker environment:

1. Stop the backend API container to prevent active connections/writes:
   ```bash
   docker compose stop api
   ```

2. Drop and recreate the target database:
   ```bash
   docker compose exec -T db psql -U vocabahn -d postgres -c "DROP DATABASE IF EXISTS vocabahn;"
   docker compose exec -T db psql -U vocabahn -d postgres -c "CREATE DATABASE vocabahn OWNER vocabahn;"
   ```

3. Decompress and stream the dump into Postgres:
   ```bash
   gunzip -c backups/my_export_postgres.sql.gz | docker compose exec -T db psql -U vocabahn -d vocabahn
   ```

4. Run Prisma database migrations to ensure schema alignment:
   ```bash
   docker compose start api
   docker compose exec -T api pnpm exec prisma migrate deploy
   ```

5. Restart remaining services:
   ```bash
   docker compose up -d
   ```

---

### Option C: Manual Import on Standalone PostgreSQL (Non-Docker)

1. Ensure the database user and database exist on the target server:
   ```bash
   psql -h localhost -U postgres -c "CREATE USER vocabahn WITH PASSWORD 'your_secure_password';"
   psql -h localhost -U postgres -c "CREATE DATABASE vocabahn OWNER vocabahn;"
   ```

2. Restore from file:

   - **For `.sql.gz` plain text dump:**
     ```bash
     gunzip -c vocabahn_backup.sql.gz | psql -h localhost -U vocabahn -d vocabahn
     ```

   - **For `.dump` custom-format dump:**
     ```bash
     pg_restore -h localhost -U vocabahn -d vocabahn -v vocabahn_backup.dump
     ```

3. Run Prisma schema migrations from your API directory:
   ```bash
   DATABASE_URL="postgresql://vocabahn:your_secure_password@localhost:5432/vocabahn" pnpm --filter @vocabahn/api prisma:migrate
   ```

---

## 5. Post-Import Verification

After completing the import:

1. **Verify Record Counts**:
   Check key tables (e.g. `User`, `DictionaryEntry`, `Course`, `UserProgress`):
   ```bash
   docker compose exec -T db psql -U vocabahn -d vocabahn -c 'SELECT count(*) FROM "DictionaryEntry";'
   docker compose exec -T db psql -U vocabahn -d vocabahn -c 'SELECT count(*) FROM "User";'
   ```

2. **Check API Health Endpoint**:
   ```bash
   curl http://localhost:3000/api/v1/health
   # or on production domain:
   curl https://yourdomain.com/api/v1/health
   ```

3. **Check Prisma Status**:
   ```bash
   pnpm --filter @vocabahn/api prisma:generate
   ```

---

## 6. Supplementary Notes

### Redis Cache & Queue State
- Vocabahn uses **Redis** for BullMQ task queues and transient session caching.
- Transferring Redis data across systems is generally unnecessary because queues and caches are ephemeral-safe.
- If Redis snapshotting is desired, `scripts/backup.sh` exports a `.rdb` snapshot file to `backups/` which can be copied into the Redis data directory on the target server.

### Large Dictionary Dumps (Lexicon)
- Database exports include all populated `DictionaryEntry` and `LexiconEntry` records.
- Raw Wiktextract source files (`kaikki.org-dictionary-German-words.jsonl`) do not need to be transferred separately once imported into PostgreSQL.

---

## 7. Troubleshooting

### Why is the export file only 20 bytes?

A **20-byte file** indicates a standard header for an empty `.gz` file (`1f 8b ...`). This happens when:

1. **Incorrect Database User**:
   In local development (`docker-compose.yml`), PostgreSQL defaults to `POSTGRES_USER=postgres`, whereas in production (`docker-compose.production.yml`) it uses `POSTGRES_USER=vocabahn`.
   If `pg_dump -U vocabahn` is executed against a database where the user is `postgres`, PostgreSQL outputs `FATAL: role "vocabahn" does not exist` to `stderr`. Because `stdout` is empty, `gzip` compresses 0 bytes, creating a 20-byte file.

   **Solution**:
   - Update your script or specify the matching user:
     ```bash
     docker compose exec -T db sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-vocabahn}" | gzip' > vocabahn_backup.sql.gz
     ```
   - `scripts/backup.sh` and `scripts/restore.sh` have been updated to automatically detect `$POSTGRES_USER` and set `set -eo pipefail` so any command errors stop execution immediately rather than creating an empty file.

