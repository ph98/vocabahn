#!/usr/bin/env bash
set -euo pipefail

log()  { echo -e "\033[1;34m[seed-prod]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ok]\033[0m $*"; }

# 1. Run ingest:lexicon --force
log "Running ingest:lexicon --force..."
docker compose -f docker-compose.production.yml exec -T api pnpm run ingest:lexicon -- --force
ok "ingest-lexicon.ts has completed!"

# 2. Run seed:dictionary --reset
log "Seeding dictionary (top 10000 lemmas)..."
docker compose -f docker-compose.production.yml exec -T api pnpm run seed:dictionary --top 10000 --reset
ok "Dictionary seeded."

# 3. Run seed:course
log "Seeding courses..."
docker compose -f docker-compose.production.yml exec -T api pnpm run seed:course
ok "Courses seeded."

# 4. Run seed:cefr-courses
log "Seeding CEFR courses..."
docker compose -f docker-compose.production.yml exec -T api pnpm run seed:cefr-courses
ok "CEFR courses seeded."

ok "All seeding and ingestion processes are complete!"
