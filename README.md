# Vocabahn

German vocabulary learning app: a shared AI-enriched dictionary, FSRS spaced-repetition
flashcards, and curated courses — built as a mobile-first PWA.

See [`PRD.md`](./PRD.md) for the full requirements and phased plan.

## Stack

- **`apps/api`** — NestJS 11, Prisma + PostgreSQL, BullMQ + Redis
- **`apps/web`** — React 19, Vite, Tailwind CSS 4, TanStack Query, GSAP
- **`packages/shared`** — zod schemas & types: the single source of the API contract

## Getting started

Prereqs: Node ≥ 20, pnpm ≥ 10, Docker.

```bash
cp .env.example .env          # then fill in secrets
docker compose up -d          # Postgres + Redis
pnpm install
pnpm --filter @vocabahn/api prisma:migrate
pnpm dev                      # api on :3000, web on :5173
```

Open http://localhost:5173 — the status page should show API, PostgreSQL, and Redis green.

## Source data (not in git)

Place in `./data/` (see PRD §7):

- `kaikki.org-dictionary-German-words.jsonl` — Wiktextract German dump (~938 MB)
- `de_full.txt` — German frequency list (~17 MB)
