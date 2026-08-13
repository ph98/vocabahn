# Operations & Infrastructure Guide

This document covers production deployment setup, domain configuration, monitoring, multi-layer backups, and database export/import procedures.

---

## 1. VPS Deployment

Vocabahn is designed to run on a single virtual private server (VPS) running Ubuntu 22.04 LTS (minimum 2 GB RAM).

### Network Architecture
```
Internet ──→ nginx:443 (Web Container)
                 ├── /api/v1/* ──→ api:3000 (NestJS Server)
                 │                    ├── db:5432 (Postgres Database)
                 │                    └── redis:6379 (Redis & BullMQ Queue)
                 └── /* ─────────→ SPA static assets (React PWA)
```
Only the Nginx container (ports 80/443) exposes sockets directly to the host machine. All database and caching services communicate within a private, internal Docker network.

---

## 2. Server Deployment Walkthrough

### First-Time Server Setup
1. **Connect to VPS**:
   ```bash
   ssh user@your-server-ip
   ```
2. **Install Docker Engine**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
3. **Clone Repository & Configure Files**:
   ```bash
   git clone https://github.com/ph98/vocabahn.git
   cd vocabahn
   cp .env.example .env
   nano .env # configure values (see variables table below)
   ```
4. **Copy GCP Credentials**:
   ```bash
   scp service-account.json user@your-server-ip:~/vocabahn/service-account.json
   ```
5. **Initialize Setup (Self-Signed Certificates)**:
   ```bash
   bash scripts/deploy.sh --setup
   ```
6. **Launch System**:
   ```bash
   bash scripts/deploy.sh
   ```

### Subsequent Updates (Automated & Manual)

#### Automated CI/CD Deployment (Single-Branch Tag-Driven Pipeline)

Vocabahn uses a lightweight single-branch deployment model:
1. **`main` Branch $\rightarrow$ Staging (`staging.vocabahn.app`)**
   - Merging PRs or pushing commits into `main` automatically triggers deployment to the Staging environment (`staging.vocabahn.app`).
   - Staging includes `X-Robots-Tag: noindex` headers to prevent search engine indexing.
2. **Git Release Tags $\rightarrow$ Production (`vocabahn.app`)**
   - Tagging a commit on `main` (e.g. `git tag v1.0.0 && git push origin v1.0.0`) or creating a GitHub Release triggers deployment to Production (`vocabahn.app`).

**Required GitHub Repository Secrets** (`Settings` -> `Secrets and variables` -> `Actions`):
- `STAGING_VPS_HOST` / `VPS_HOST`: Public IP or hostname of your staging / primary VPS server.
- `STAGING_VPS_USERNAME` / `VPS_USERNAME`: SSH username on the VPS.
- `STAGING_VPS_SSH_KEY` / `VPS_SSH_KEY`: Private SSH key authorized on the server.
- `PROD_VPS_HOST`: Production VPS IP or hostname.
- `PROD_VPS_USERNAME`: Production SSH username.
- `PROD_VPS_SSH_KEY`: Production SSH private key.
- `VPS_WORK_DIR` *(optional)*: Remote working directory path (defaults to `~/vocabahn`).
- `VPS_PORT` *(optional)*: SSH port (defaults to `22`).

*Note for Fork Pull Requests*: CI checks run automatically on fork PRs without exposing secrets or triggering deployments. Deployment is only triggered upon push to `main` or release tag `v*`.

#### Manual Updates
To manually trigger a deployment on the server, execute:
```bash
ssh user@your-server-ip
cd vocabahn
bash scripts/deploy.sh
```
This deployment script performs the following sequentially:
1. Pulls the latest changes from Git, **when the checkout is on a branch that can
   fast-forward**. On a detached HEAD (how the production tag deploy checks out),
   or when the branch has diverged from its upstream, it logs the revision it
   found and deploys that instead of aborting — CI has already pinned the
   revision with `git reset --hard origin/main` or `git checkout <tag>` before
   invoking the script. Set `SKIP_GIT_PULL=true` to skip the pull outright.
2. Rebuilds and upgrades the Docker container images.
3. Automatically runs `scripts/backup.sh` to record a pre-deploy database snapshot.
4. Performs a zero-downtime container swap using a timeout configuration.
5. Runs `prisma migrate deploy` to update database schemas.
6. Queries the API health check endpoint before verifying success.

---

## 3. Production Environment Reference

The following environment variables are configured in the `.env` file at the repository root:

| Variable | Description | Recommendation |
| :--- | :--- | :--- |
| `POSTGRES_PASSWORD` | Postgres database root password | Generate via `openssl rand -hex 24` |
| `JWT_SECRET` | Token signing secret | Generate via `openssl rand -base64 48` |
| `GOOGLE_CLIENT_ID` | OAuth API Client ID | Google Cloud Developers Console |
| `GOOGLE_CLIENT_SECRET` | OAuth API Client Secret | Google Cloud Developers Console |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI | `https://yourdomain.com/api/v1/auth/google/redirect` |
| `FRONTEND_URL` | Application root domain | `https://yourdomain.com` |
| `DIRECTUS_KEY` | Directus secret key | Generate via `openssl rand -base64 32` |
| `DIRECTUS_SECRET` | Directus system secret | Generate via `openssl rand -base64 32` |
| `DIRECTUS_ADMIN_EMAIL` | Break-glass admin email | e.g. `admin@vocabahn.com` |
| `DIRECTUS_ADMIN_PASSWORD` | Break-glass admin password | Strong, generated password |
| `GEMINI_API_KEY` | Gemini API key | Google AI Studio Console |
| `UNSPLASH_ACCESS_KEY` | Unsplash developer access token | Unsplash Developers Portal |
| `GCP_PROJECT` | Google Cloud project ID | For Cloud TTS generation |
| `ENRICHMENT_DAILY_CAP` | Per-user enrichment limit | Recommended default: `50` |

---

## 4. Custom Domains & SSL Setup

### Let's Encrypt (Production)
1. Point your domain's A-record to the VPS IP address.
2. Install Certbot on the host:
   ```bash
   sudo apt install certbot
   ```
3. Request certificates using standalone verification:
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```
4. Copy the key files into the local SSL directory:
   ```bash
   sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
   sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
   ```
5. Configure automated certificate renewal in `crontab`:
   ```bash
   # Execute crontab -e and append:
   0 3 * * * certbot renew --quiet && \
     cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ~/vocabahn/ssl/cert.pem && \
     cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ~/vocabahn/ssl/key.pem && \
     docker compose -f ~/vocabahn/docker-compose.prod.yml restart web
   ```

---

## 5. Post-Deploy Database Ingestion

Once containers are running in production for the first time, execute the seeding pipeline via `scripts/seed-production.sh` or manually:
```bash
# Exec into the NestJS API container
docker compose -f docker-compose.prod.yml exec api sh

# Inside container run:
pnpm run ingest:lexicon     # Parses and stores Wiktextract dump (takes ~20-30 min)
pnpm run seed:dictionary --top 5000 # Activates top 5,000 frequent terms
pnpm run seed:course        # Seed standard A1-B2 CEFR courses
exit
```

---

## 6. Multi-Layer Backup Strategy

Vocabahn utilizes a 3-layer approach to safeguard database information:

```
Layer 1: Pre-Deploy Snapshot ──→ Triggered automatically by scripts/deploy.sh
Layer 2: Daily Scheduled Dump ─→ Configured via Server Cron (running scripts/backup.sh)
Layer 3: Offsite S3 Sync ──────→ Optional; synced to cloud buckets (S3/R2/B2)
```

### Coverage Scope
- **Postgres (High Priority)**: Full database table schemas and entries are dumped via `pg_dump` to `./backups/*_postgres.sql.gz`.
- **Redis (Optional)**: BullMQ queues are backed up using `BGSAVE` to `./backups/*.rdb`. (Failing over to a fresh cache is acceptable since queues are ephemeral-safe).
- **Excluded Items**: Static sources (938 MB Wiktextract) and generated asset links are not backed up. They can be re-downloaded or regenerated.

### Daily Scheduled Dumps (Layer 2)
Configure a daily cron script on the server:
```bash
crontab -e

# Run at 2 AM daily and write to logs:
0 2 * * * cd /home/user/vocabahn && bash scripts/backup.sh >> /var/log/vocabahn-backup.log 2>&1
```
*Note: Backups older than `BACKUP_KEEP_DAYS` (default: 14) are automatically pruned by the script.*

### Cloud Storage Sync (Layer 3)
1. Set the destination bucket name in `.env`:
   ```env
   BACKUP_S3_BUCKET=your-backup-bucket
   ```
2. Install and configure the AWS CLI on the host server (`aws configure`).
3. Once configured, `scripts/backup.sh` will upload newly generated archive packages to remote storage.

---

## 7. Database Export, Import & Migration Guide

### 7.1 Exporting the Database
- **Via Vocabahn Script (Docker / VPS)**:
  ```bash
  bash scripts/backup.sh my_export
  ```
  Generates `backups/my_export_postgres.sql.gz`.

- **Manual `pg_dump` in Docker**:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U vocabahn -d vocabahn' | gzip > vocabahn_backup.sql.gz
  ```

- **Manual `pg_dump` (Standalone PostgreSQL)**:
  ```bash
  pg_dump -h localhost -p 5432 -U vocabahn -F c -b -v -f vocabahn_backup.dump vocabahn
  ```

### 7.2 Transferring Dumps
- **Via `scp`**:
  ```bash
  scp backups/my_export_postgres.sql.gz user@target-server-ip:~/vocabahn/backups/
  ```
- **Via AWS S3**:
  ```bash
  aws s3 cp backups/my_export_postgres.sql.gz s3://your-backup-bucket/backups/
  ```

### 7.3 Importing the Database into Target System
> [!WARNING]
> Importing a database dump will **overwrite existing tables and data** in the target `vocabahn` database. Ensure you have backed up any critical data beforehand.

- **Via Vocabahn Restore Script (Docker Target)**:
  ```bash
  bash scripts/restore.sh backups/my_export_postgres.sql.gz
  ```
  The script automatically stops API traffic, drops/recreates `vocabahn`, streams the gzipped SQL dump into PostgreSQL, runs pending Prisma migrations (`prisma migrate deploy`), and restarts services.

- **Manual Import in Docker**:
  ```bash
  docker compose -f docker-compose.prod.yml stop api
  docker compose -f docker-compose.prod.yml exec -T db psql -U vocabahn -d postgres -c "DROP DATABASE IF EXISTS vocabahn;"
  docker compose -f docker-compose.prod.yml exec -T db psql -U vocabahn -d postgres -c "CREATE DATABASE vocabahn OWNER vocabahn;"
  gunzip -c backups/my_export_postgres.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U vocabahn -d vocabahn
  docker compose -f docker-compose.prod.yml start api
  docker compose -f docker-compose.prod.yml exec -T api pnpm exec prisma migrate deploy
  docker compose -f docker-compose.prod.yml up -d
  ```

### 7.4 Troubleshooting Empty Dump Files
A **20-byte file** indicates an empty `.gz` header caused by database user mismatch (e.g. `pg_dump -U vocabahn` run against a DB configured with `POSTGRES_USER=postgres`). `scripts/backup.sh` and `scripts/restore.sh` set `set -eo pipefail` and auto-detect `$POSTGRES_USER` to guarantee non-zero valid dumps.

---

## 8. Recovery Procedures

### Restore Database to Pre-Deploy State
If a container deployment requires rollback:
```bash
git revert HEAD
bash scripts/restore.sh backups/pre-deploy_postgres.sql.gz
bash scripts/deploy.sh
```

### Verification
Verify database backup stream integrity:
```bash
LATEST=$(ls -t backups/*_postgres.sql.gz | head -1)
gunzip -c "$LATEST" | head -100 # Should output standard PostgreSQL DDL statements
```

---

## 9. Infrastructure Monitoring

| Target | Command | Description |
| :--- | :--- | :--- |
| **API health checks** | `curl https://yourdomain.com/api/v1/health` | Verifies Redis and DB statuses |
| **Log streams** | `docker compose -f docker-compose.prod.yml logs -f api` | Tail logs of the API container |
| **Admin Panel** | Connect to `https://yourdomain.com:3001/admin` | Web view of models and failures |
| **Postgres counts** | `docker compose -f docker-compose.prod.yml exec db psql -U vocabahn -c "SELECT count(*) FROM \"DictionaryEntry\";"` | Confirm record counts |
