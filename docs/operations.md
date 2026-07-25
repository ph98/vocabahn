# Operations & Infrastructure Guide

This document covers production deployment setup, domain configuration, monitoring, and database backup architectures.

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
   git clone https://github.com/YOUR_ORG/vocabahn.git
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

#### Automated CI/CD Deployment (GitHub Actions)
Whenever a pull request or commit is merged into `main`, GitHub Actions automatically runs the `ci` pipeline (tests, linting, build verification, security audit). Upon success, the `deploy` job triggers via SSH and runs `scripts/deploy.sh` on the VPS.

**Required GitHub Repository Secrets** (`Settings` -> `Secrets and variables` -> `Actions`):
- `VPS_HOST`: Public IP or hostname of your VPS server.
- `VPS_USERNAME`: SSH username on the VPS (e.g., `ubuntu` or `root`).
- `VPS_SSH_KEY`: Private SSH key authorized on the server.
- `VPS_WORK_DIR` *(optional)*: Remote working directory path (defaults to `~/vocabahn`).
- `VPS_PORT` *(optional)*: SSH port (defaults to `22`).

*Note for Fork Pull Requests*: CI checks run automatically on fork PRs without exposing secrets or triggering deployments. Deployment is only triggered when code is merged into `main` in the primary repository.

#### Manual Updates
To manually trigger a deployment on the server, execute:
```bash
ssh user@your-server-ip
cd vocabahn
bash scripts/deploy.sh
```
This deployment script performs the following sequentially:
1. Pulls the latest changes from Git.
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
| `ADMIN_PASSWORD` | Access key for AdminJS panel | Strong, unique password |
| `ADMIN_COOKIE_PASSWORD` | Session encryption key for AdminJS | Generate via `openssl rand -hex 24` |
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
     docker compose -f ~/vocabahn/docker-compose.production.yml restart web
   ```

---

## 5. Post-Deploy Database Ingestion

Once the containers are running in production for the first time, execute the seeding pipeline:
```bash
# Exec into the NestJS API container
docker compose -f docker-compose.production.yml exec api sh

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
Layer 3: Offsite S3 Sync ──────→ Optional; synced to clouds (S3/R2/B2)
```

### Coverage Scope
- **Postgres (High Priority)**: Full database table schemas and entries are dumped via `pg_dump` to `./backups/*_postgres.sql.gz`.
- **Redis (Optional)**: BullMQ queues are backed up using `BGSAVE` to `./backups/*.rdb`. (Failing over to a fresh cache is acceptable since queues are ephemeral-safe).
- **Excluded Items**: Static sources (938 MB Wiktextract) and generated asset links are not backed up. They can be re-downloaded or regenerated.

### Layer 2 Setup (Daily Scheduled Dumps)
Configure a daily cron script on the server:
```bash
# Open crontab:
crontab -e

# Run at 2 AM daily and write to logs:
0 2 * * * cd /home/user/vocabahn && bash scripts/backup.sh >> /var/log/vocabahn-backup.log 2>&1
```
*Note: Backups older than `BACKUP_KEEP_DAYS` (default: 14) are automatically pruned by the script.*

### Layer 3 Setup (S3 Compatible Storage Sync)
1. Set the destination bucket name in `.env`:
   ```env
   BACKUP_S3_BUCKET=your-backup-bucket
   ```
2. Install and configure the AWS CLI on the host server (`aws configure`), providing keys and regions.
3. Once configured, `scripts/backup.sh` will upload newly generated archive packages to the remote storage.

---

## 7. Recovery Procedures

### Restore Database to Pre-Deploy State
If a container deploy goes wrong, revert the code state and roll back the DB in minutes:
```bash
git revert HEAD
bash scripts/restore.sh backups/pre-deploy_postgres.sql.gz
bash scripts/deploy.sh
```

### General Database Restore
To overwrite the active production database with an archived snapshot:
```bash
bash scripts/restore.sh backups/2026-06-16_02-00_postgres.sql.gz
```
The script stops incoming API traffic, drops and recreates the target database, streams the gzipped backup SQL, applies Prisma migrations, and restarts the backend process.

### Download Backup from Cloud Storage
```bash
aws s3 cp s3://your-backup-bucket/backups/2026-06-16_02-00_postgres.sql.gz backups/
```

### Verification
Run tests monthly to ensure that database backup files are readable:
```bash
# Verify the gzip stream header parses correctly:
LATEST=$(ls -t backups/*_postgres.sql.gz | head -1)
gunzip -c "$LATEST" | head -100 # Should output standard PostgreSQL DDL statements
```

---

## 8. Infrastructure Monitoring

| Target | command | Description |
| :--- | :--- | :--- |
| **API health checks** | `curl https://yourdomain.com/api/v1/health` | Verifies Redis and DB statuses |
| **Log streams** | `docker compose -f docker-compose.production.yml logs -f api` | Tail logs of the API container |
| **Admin Panel** | Connect to `https://yourdomain.com:3001/admin` | Web view of models and failures |
| **Postgres counts** | `docker compose exec db psql -U vocabahn -c "SELECT count(*) FROM \"DictionaryEntry\";"` | Confirm record counts |
