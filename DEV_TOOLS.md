# Dev & Monitoring Tools

How to inspect Vocabahn's data and watch it flow through the pipeline. All tools
read the dev database defined by `DATABASE_URL` in the root `.env`.

**Prereqs:** `docker compose up -d` (Postgres + Redis) and `pnpm install` done once.

| Tool | Command | URL | What it's for |
|---|---|---|---|
| **Stats snapshot** | `pnpm --filter @vocabahn/api stats` | — | One-shot terminal summary of the whole system |
| **Prisma Studio** | `pnpm --filter @vocabahn/api studio` | http://localhost:5555 | Browse & edit any table, follow relations |
| **AdminJS** | `pnpm --filter @vocabahn/api admin` | http://localhost:3001/admin | Rich admin UI: search, filter, edit, grouped by domain |
| **API health** | `curl localhost:3000/api/v1/health` | — | DB + Redis liveness (also shown on the web home page) |
| **psql** | `docker exec -it vocabahn-db-1 psql -U postgres -d vocabahn` | — | Raw SQL for ad-hoc queries |
| **redis-cli** | `docker exec -it vocabahn-redis-1 redis-cli` | — | Inspect Redis / BullMQ keys |

> Shortcut: most of these can be run from `apps/api` as `pnpm stats`, `pnpm studio`,
> `pnpm admin` (drop the `--filter`).

---

## Stats snapshot (`pnpm stats`)

Read-only. Safe to run anytime, including during ingest/enrichment. Prints:

- **Lexicon** — total entries, % with a frequency rank, form/sense counts, POS breakdown.
- **Active dictionary** — count, and the **enrichment funnel** (PENDING → ENRICHING →
  ENRICHED → FAILED) as a bar chart, plus how many have examples/image/audio.
- **Users & study loop** — users, cards, review logs, courses.
- **Top dictionary entries by frequency** — a sanity check that the highest-frequency
  words look right (pronouns/articles at the top).

This is the fastest way to answer "where is the data right now?" — e.g. watch the
enrichment funnel shift from 100% PENDING as the queue runs (Phase 1).

## Prisma Studio (`pnpm studio` → :5555)

The schema-aware table browser. Best for **following relationships** (click from a
`DictionaryEntry` to its `LexiconEntry` → `WordForm`s/`WordSense`s) and quick edits.
Reflects the current Prisma schema automatically; no config. Ctrl-C to stop.

## AdminJS (`pnpm admin` → :3001/admin)

Full admin UI with search, filters, pagination, and inline editing. This is the
operator tool from PRD §4.7 (it will later host failed-enrichment retry and course
authoring).

- **Credentials:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` (generated on setup;
  the cookie secret is `ADMIN_COOKIE_PASSWORD`). Port is `ADMIN_PORT` (default 3001).
- **Navigation** is grouped: Lexicon, Dictionary, Study, Courses, System.
- Runs **standalone** (`apps/api/scripts/admin.mts`, express + `@adminjs/prisma`),
  separate from the NestJS API — see "Why standalone" below.

### Gotchas / notes
- **`.mts` extension is required.** AdminJS packages are ESM-only; the NestJS app is
  CommonJS. The `.mts` extension makes `tsx` run the script as native ESM without
  flipping the whole `apps/api` package to ESM.
- **tiptap version pin.** AdminJS's bundled rich-text editor needs all `@tiptap/*`
  packages on one version. The root `package.json` `pnpm.overrides` pins
  `@tiptap/core|pm|react|starter-kit` to `2.27.2`; without it the panel crashes at
  startup with `does not provide an export named 'canInsertNode'`. Keep that override.
- First start is slower (AdminJS warms its frontend bundle).
- Auth uses an in-memory session store — fine for a local dev tool; not for prod.

### Why standalone (not inside NestJS)
Embedding AdminJS v7 (ESM) into the CommonJS NestJS process requires brittle
dynamic-import workarounds. Running it as its own tsx process against the same DB is
robust, has clean separation, and is trivial to start/stop. If we later need it inside
the API (shared auth, single deploy), revisit then.

---

## Raw SQL cheats (psql)

```sql
-- enrichment funnel
SELECT "enrichmentStatus", count(*) FROM "DictionaryEntry" GROUP BY 1;

-- a word's full lexicon record
SELECT word, pos, gender, ipa, "frequencyRank" FROM "LexiconEntry" WHERE word = 'Haus';

-- inflected-form → lemma lookup
SELECT le.word AS lemma, wf.form, wf.tags
FROM "WordForm" wf JOIN "LexiconEntry" le ON le.id = wf."entryId"
WHERE wf.form = 'Häuser';
```
