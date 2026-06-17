#!/usr/bin/env bash
set -euo pipefail

log()  { echo -e "\033[1;34m[seed-prod]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ok]\033[0m $*"; }

# 1. Wait for ingest-lexicon.ts to complete
log "Waiting for ingest-lexicon.ts to complete..."
while ps aux | grep -v grep | grep -q "ingest-lexicon.ts"; do
  sleep 30
done
ok "ingest-lexicon.ts has completed!"

# 2. Run seed:dictionary
log "Seeding dictionary (top 5000 lemmas)..."
docker compose -f docker-compose.production.yml exec -T api pnpm run seed:dictionary --top 5000
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
