# Deployment Guide

Single-server Docker Compose deployment on a VPS (Ubuntu 22.04 LTS recommended).

---

## Prerequisites

| Requirement | Version |
|---|---|
| Docker Engine | 24+ |
| Git | any |
| VPS RAM | ≥ 2 GB |
| Open ports | 80, 443 |

---

## First-time setup (one command)

```bash
# 1. SSH into the server
ssh user@your-server-ip

# 2. Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 3. Clone the repo
git clone https://github.com/YOUR_ORG/vocabahn.git
cd vocabahn

# 4. Configure secrets
cp .env.example .env
nano .env          # fill in all required values (see §Environment Variables)

# 5. Upload GCP service account key
scp service-account.json user@your-server-ip:~/vocabahn/service-account.json

# 6. Run first-time setup (generates self-signed cert, pulls images)
bash scripts/deploy.sh --setup

# 7. Deploy
bash scripts/deploy.sh
```

That's it. The app will be live at `https://your-server-ip`.

---

## Subsequent deploys

```bash
ssh user@your-server-ip
cd vocabahn
bash scripts/deploy.sh
```

The script will:
1. Pull the latest git commits
2. Rebuild Docker images
3. Take a pre-deploy database backup
4. Zero-downtime container swap (`down --timeout 30` then `up -d`)
5. Run `prisma migrate deploy` automatically
6. Health-check the API before exiting

---

## Environment Variables

All variables live in `.env` at the repo root. Required values:

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_PASSWORD` | Postgres password | `openssl rand -hex 24` |
| `JWT_SECRET` | JWT signing key | `openssl rand -base64 48` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | from Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI | `https://yourdomain.com/api/v1/auth/google/redirect` |
| `FRONTEND_URL` | Your domain | `https://yourdomain.com` |
| `ADMIN_PASSWORD` | AdminJS login password | choose a strong password |
| `ADMIN_COOKIE_PASSWORD` | AdminJS session cookie key | `openssl rand -hex 24` |
| `ADMIN_COOKIE_PASSWORD` | AdminJS session cookie key | `openssl rand -hex 24` |
| `GEMINI_API_KEY` | Google Gemini (AI enrichment) | from [aistudio.google.com](https://aistudio.google.com/apikey) |
| `UNSPLASH_ACCESS_KEY` | Unsplash image search | from [unsplash.com/developers](https://unsplash.com/developers) |
| `GCP_PROJECT` | GCP project ID | for Cloud TTS |
| `ENRICHMENT_DAILY_CAP` | Per-user daily enrichment limit | `50` |

---

## SSL / TLS

### Let's Encrypt (recommended for production)

```bash
# Install certbot
sudo apt install certbot

# Get cert (stop nginx first if port 80 is in use)
sudo certbot certonly --standalone -d yourdomain.com

# Copy certs to the ssl/ directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem

# Auto-renew (add to crontab)
0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ~/vocabahn/ssl/cert.pem && \
  cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ~/vocabahn/ssl/key.pem && \
  docker compose -f ~/vocabahn/docker-compose.production.yml restart web
```

### Self-signed (local/staging)

`scripts/deploy.sh --setup` generates one automatically. Not suitable for production.

---

## Custom Domain

1. Point your domain's A record to the server IP.
2. Update these `.env` vars:
   ```
   FRONTEND_URL=https://yourdomain.com
   GOOGLE_CALLBACK_URL=https://yourdomain.com/api/v1/auth/google/redirect
   ```
3. Update Google Cloud Console OAuth > Authorized redirect URIs.
4. Redeploy: `bash scripts/deploy.sh`

---

## Data ingestion (post-deploy)

After first deploy, ingest the German lexicon and seed starter courses:

```bash
# Shell into the api container
docker compose -f docker-compose.production.yml exec api sh

# Inside container:
pnpm run ingest:lexicon          # ~20–30 min, 938 MB JSONL → Postgres
pnpm run seed:dictionary --top 5000
pnpm run seed:course             # creates starter decks
exit
```

---

## Monitoring

| What | How |
|---|---|
| API health | `curl https://yourdomain.com/api/v1/health` |
| Container logs | `docker compose -f docker-compose.production.yml logs -f api` |
| AdminJS panel | `https://yourdomain.com:3001/admin` (map port 3001 to host if needed) |
| Postgres stats | `docker compose exec db psql -U vocabahn -c "SELECT count(*) FROM dictionary_entries;"` |

---

## Useful commands

```bash
# View live logs
docker compose -f docker-compose.production.yml logs -f

# Restart a single service
docker compose -f docker-compose.production.yml restart api

# Manual backup
bash scripts/backup.sh

# Restore from backup
bash scripts/restore.sh backups/2026-06-16_02-00.sql.gz

# Run migrations manually
docker compose -f docker-compose.production.yml exec api pnpm exec prisma migrate deploy
```

---

## Architecture diagram

```
Internet ──→ nginx:443 (web container)
                 ├── /api/** ──→ api:3000 (NestJS)
                 │                  ├── db:5432 (Postgres)
                 │                  └── redis:6379 (Redis/BullMQ)
                 └── /** ──→ SPA dist (React PWA)
```

All four services run inside a private `internal` Docker network; only nginx exposes ports 80/443 to the host.
