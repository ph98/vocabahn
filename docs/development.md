# Developer & Contributor Guide

This document covers everything needed to set up, run, test, and develop Vocabahn locally.

---

## 1. Quick Start

### Prerequisites
- **Node.js**: Version $\ge 20$
- **pnpm**: Version $\ge 10$
- **Docker & Docker Compose**: For local PostgreSQL and Redis instances.

### Getting Started Steps
1. **Clone and Install Dependencies**:
   ```bash
   pnpm install
   ```
2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Open .env and fill in required secrets (Gemini key, Google OAuth credentials, etc.)
   ```
3. **Spin Up Infrastructure**:
   Start Postgres and Redis in Docker containers:
   ```bash
   docker compose up -d
   ```
4. **Run DB Migrations**:
   ```bash
   pnpm --filter @vocabahn/api prisma:migrate
   ```
5. **Start Dev Servers**:
   This runs the NestJS API (port 3000) and the Vite/React web client (port 5173 with proxy configuration) in parallel:
   ```bash
   pnpm dev
   ```
6. Open [http://localhost:5173](http://localhost:5173) in your browser. The status bar should indicate that the API, Postgres, and Redis connections are active (green).

---

## 2. Dev & Monitoring Utilities

All tools read the dev database defined by `DATABASE_URL` in the root `.env`.

| Tool | Command | Local Address / Output | Description |
| :--- | :--- | :--- | :--- |
| **Stats snapshot** | `pnpm --filter @vocabahn/api stats` | Terminal output | Prints system-wide stats (funnel, counts, top words) |
| **Prisma Studio** | `pnpm --filter @vocabahn/api studio` | [http://localhost:5555](http://localhost:5555) | Table browser to view and edit database entries |
| **AdminJS** | `pnpm --filter @vocabahn/api admin` | [http://localhost:3001/admin](http://localhost:3001/admin) | Domain-focused operational interface |
| **API Health** | `curl localhost:3000/api/v1/health` | JSON response | Checks PostgreSQL and Redis health status |
| **psql shell** | `docker exec -it vocabahn-db-1 psql -U postgres -d vocabahn` | CLI shell | Execute ad-hoc queries directly on PostgreSQL |
| **redis-cli shell**| `docker exec -it vocabahn-redis-1 redis-cli` | CLI shell | Inspect active keys and BullMQ queue statuses |

*Note: You can run these commands directly from `apps/api` using shortened names (e.g. `pnpm stats`, `pnpm studio`, `pnpm admin`).*

---

## 3. Tool In-Depth Notes

### Stats Snapshot (`pnpm stats`)
Reads system data to output:
- **Lexicon**: Total counts, part-of-speech (POS) breakdown, and frequency coverage.
- **Active Dictionary**: Shows the active enrichment status queue funnel (PENDING $\rightarrow$ ENRICHING $\rightarrow$ ENRICHED $\rightarrow$ FAILED).
- **Study Funnel**: Current counts of registered users, active cards, and historical review logs.

### AdminJS (`pnpm admin` via :3001)
- **Authentication**: Uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` defined in `.env`.
- **Architecture**: Runs as a standalone script (`apps/api/scripts/admin.mts`) separate from NestJS to avoid ESM/CommonJS integration issues.
- **Tiptap Version Override**: Root `package.json` uses a `pnpm.overrides` field targeting `@tiptap/core|pm|react|starter-kit` at `2.27.2` to resolve package runtime issues.

---

## 4. Ingestion & Seeding Commands

Commands are executed from the repo root or inside `apps/api`. They automatically reference the root `.env`:

1. **Ingest Wiktextract Lexicon**:
   Processes the 938 MB `kaikki.org-dictionary-German-words.jsonl` file in a memory-safe streaming fashion, loading all senses and grammatical forms:
   ```bash
   pnpm --filter @vocabahn/api ingest:lexicon [--limit N | --force]
   ```
2. **Seed Active Dictionary**:
   Selects the top $N$ words by corpus frequency and marks them as pending in the dictionary table:
   ```bash
   pnpm --filter @vocabahn/api seed:dictionary [--top N]
   ```
3. **Seed Starter Courses**:
   Loads official curriculum tracks (A1/A2/B1/B2) to seed review lists:
   ```bash
   pnpm --filter @vocabahn/api seed:course
   ```

---

## 5. Raw SQL Cheat Sheet

Useful snippets for database inspection via `psql`:
```sql
-- View counts grouped by enrichment status
SELECT "enrichmentStatus", count(*) FROM "DictionaryEntry" GROUP BY 1;

-- Check a word's exact lexicographical features
SELECT word, pos, gender, ipa, "frequencyRank" FROM "LexiconEntry" WHERE word = 'Haus';

-- Look up a lemma using an inflected form
SELECT le.word AS lemma, wf.form, wf.tags
FROM "WordForm" wf JOIN "LexiconEntry" le ON le.id = wf."entryId"
WHERE wf.form = 'Häuser';
```

