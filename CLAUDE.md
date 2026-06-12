# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project State

Vocabahn is a German vocabulary learning app (shared AI-enriched dictionary + FSRS spaced-repetition flashcards + curated courses). **No code exists yet** — this is a rebuild starting from an approved PRD.

- **`PRD.md` is the source of truth.** It contains the full requirements, resolved decisions (§10), and the phased delivery plan (§8). Follow it; don't re-litigate decisions recorded there.
- `PROJECT_OVERVIEW.md` is a historical reference describing the *original* app, superseded by the PRD.
- The repo is not yet a git repository. **Before `git init`: `.env` and `service-account.json` contain real secrets — they must be gitignored first.**

## Planned Architecture (PRD §5)

pnpm workspaces monorepo (no Turborepo):

```
apps/api/      NestJS 11 + Prisma + PostgreSQL; BullMQ + Redis for background jobs
apps/worker/   enrichment worker (BullMQ consumer; may live inside api as a module)
apps/web/      React 19 + Vite + Tailwind + shadcn/ui
packages/shared/  DTOs, zod schemas, enums — the single source of the API contract
```

Key stack decisions (fixed, see PRD §10):
- **Frontend is the top priority** — mobile-first PWA, GSAP as the *sole* animation engine (no Framer Motion), `@use-gesture/react` for gestures, WCAG 2.2 AA, Lighthouse ≥ 95. Every animation needs a `prefers-reduced-motion` variant; every gesture needs a button equivalent.
- Auth: Google OAuth only (web code flow + ID-token verify for future mobile), JWT sessions. API is versioned (`/api/v1`), token-based, client-agnostic.
- Spaced repetition: `ts-fsrs`. `ReviewLog` is the source of truth — FSRS state is recomputable by replay (this is also how offline review sync resolves conflicts).
- A **knowledge model** sits above FSRS (per-user knowledge score, auto-graduation of known words, undo) — derived and recomputable, separate from FSRS card state.
- Enrichment is **local-data-first**: Wiktextract + frequency list answer most fields; Gemini (`gemini-flash-lite-latest`), Unsplash, and Google Cloud TTS fill only the gaps, via a rate-limited BullMQ queue — never on the request path.
- Admin: AdminJS. Deploy: Docker Compose on a single VPS (db, redis, api, web/nginx).

## Source Data (`data/`)

- `kaikki.org-dictionary-German-words.jsonl` — **938 MB** Wiktextract dump (one JSON record per line). Always process it streaming, line-by-line, with per-record error tolerance (log and skip). Never load it into memory whole, and never `cat`/Read it directly — sample with `head -n 1` or similar.
- `de_full.txt` — 17 MB frequency list, `word count` per line, descending (e.g. `ich 5890279`). Provides frequency rank and the knowledge model's frequency prior.

Ingestion stores complete data (all senses, forms, etymology) plus the raw JSON per record in a `jsonb` column, so future features never need re-ingestion (PRD §7).

## Environment

`.env.example` documents all required variables (database, Google OAuth, Gemini, GCP TTS, Unsplash, reCAPTCHA, AdminJS). A populated `.env` and the GCP `service-account.json` already exist at repo root — keep both out of version control.

## Commands

Run from the repo root unless noted:

- `docker compose up -d` — start Postgres (5432) + Redis (6379). Dev-only services; api/web run on the host. **Note:** the old app's containers (`vocabahn-be-*`) also use 5432/3000 — stop them first if running.
- `pnpm dev` — builds `@vocabahn/shared`, then runs api (`:3000`, NestJS watch) and web (`:5173`, Vite with `/api` proxy) in parallel.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` — workspace-wide.
- `pnpm --filter @vocabahn/api prisma:migrate` — Prisma migrate dev (loads root `.env` via dotenv-cli).
- `pnpm --filter @vocabahn/api prisma:generate` — regenerate Prisma client.

Health check: `curl http://localhost:3000/api/v1/health` (reports db + redis status; the web app's status page consumes the same endpoint).

CI (`.github/workflows/ci.yml`): build, lint (includes `eslint-plugin-jsx-a11y`), `pnpm audit`. Axe component tests still to come.
