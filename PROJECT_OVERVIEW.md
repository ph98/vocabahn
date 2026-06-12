# Vocabahn — Project Overview & Rebuild Notes

This document captures what Vocabahn *is* and how it's currently built, so it can be
rebuilt from scratch (same idea, cleaner stack) without re-deriving the design from code.

## 1. Core Idea

Vocabahn is a **German vocabulary learning app** combining:

1. **A community-shared dictionary** — every word ever looked up is enriched once
   (via AI + image/audio APIs) and stored centrally, so future users get instant,
   pre-built entries instead of repeated API calls.
2. **Spaced-repetition flashcards** (FSRS algorithm, the modern successor to Anki's
   SM-2) — each user has their own `Card` per word tracking learning state,
   independent of the shared dictionary entry.
3. **Curated courses** — ordered word lists (A1/A2/B1/B2..., "Survival German",
   "Business German", etc.) that a user enrolls in, which seeds flashcards for
   every word in that course.
4. **Rich word entries** — translation, article (der/die/das), plural, inflection,
   IPA pronunciation, emoji, an illustrative photo (Unsplash), example sentences,
   synonyms/antonyms, CEFR level, and TTS audio pronunciation.

**User flow:** sign in with Google → browse/search dictionary or enroll in a course →
study due flashcards in a review session → rate recall (Again/Hard/Good/Easy) →
FSRS schedules the next review date → dashboard shows streaks/stats.

## 2. Current Tech Stack

### Backend — `./backend/`
| Concern | Choice |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| ORM / DB | Prisma 5 + PostgreSQL 15 |
| Auth | Passport — Google OAuth2 (web) + Google ID token verify (mobile), JWT for sessions |
| Spaced repetition | `ts-fsrs` (FSRS algorithm) |
| AI enrichment | `@google/generative-ai` (Gemini, `gemini-flash-lite-latest`) — fills in translation, grammar, examples, etc. for new words |
| Images | Unsplash API (search by keyword, with attribution) |
| Audio | `@google-cloud/text-to-speech` (Google Cloud TTS), cached as static `.mp3` files |
| Admin panel | AdminJS (`@adminjs/nestjs` + `@adminjs/prisma`) for managing dictionary/courses/users |
| Fuzzy search | Fuse.js |
| Rate limiting | `@nestjs/throttler` |
| Anti-bot | reCAPTCHA on contact form |

### Frontend — `./frontend/`
| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Routing | React Router 7 |
| UI library | Tailwind CSS |
| Data fetching | TanStack Query + Axios |
| Animation | Framer Motion |
| Icons | Lucide  |
| PWA | `vite-plugin-pwa` |
| Misc | dayjs, react-calendar-heatmap (study streak heatmap), react-google-recaptcha |

### Infrastructure
- Docker Compose: `db` (Postgres), `api` (Nest, :3000), `web` (static frontend via nginx, :80)
- Deploy target appears to be a single VPS via `docker compose up -d --build`
- Secrets via `.env` (see `.env.example`)

### Data model (Prisma)
- `User` (Google-linked), `Card` (per-user FSRS state), `ReviewLog` (history)
- `DictionaryEntry` (shared, AI-enriched word data) + `DictionaryExample` + `ImageCredit`
- `Course`, `CourseWord` (ordered), `UserCourse` (enrollment)
- `ContactMessage`

## 3. Open Questions Before a Rebuild

I'd like your input on these before drafting a new architecture:

1. **Scope** — is this still a personal/portfolio project, or are you aiming for
   real users? That changes how much to invest in admin tooling, scaling, cost
   control on AI/TTS calls, etc.
2. **Mobile** — the API has a separate Google ID-token verify endpoint, suggesting
   a planned React Native app. Still wanted, or web-only going forward?
3. **AI enrichment cost/reliability** — Gemini calls happen synchronously when a
   new word is searched (slow, and dependent on a live key). Keep this design, or
   move to a background job / pre-seeded dataset?
4. **Admin panel** — AdminJS pulled in a lot of dependencies. Do you actually use
   it day-to-day, or would a simple internal script / Prisma Studio suffice?
5. **Hosting** — still self-hosted Docker on a VPS, or open to managed platforms
   (Vercel/Render/Fly.io + managed Postgres) to cut ops overhead?
6. **What to keep vs. rewrite** — the dictionary content (5,666 entries) and course
   data took real effort to build/enrich. Rebuild should almost certainly **reuse
   that DB data** via the existing backup/dump rather than regenerate it.

## 4. Suggestions for a Rebuild

Assuming "same product, cleaner/cheaper/easier to maintain":

- **Keep**: NestJS + Prisma + Postgres (solid, well-typed, this part isn't the pain
  point) and `ts-fsrs` (purpose-built, don't reinvent spaced repetition).
- **Keep**: React + Vite + TanStack Query + Tailwind. Consider dropping **Ant Design**
  for a lighter component set (shadcn/ui or Radix + Tailwind) — AntD is heavy for a
  mostly-mobile flashcard UI and fights Tailwind's utility approach.
- **Reconsider AdminJS** → if usage is light, replace with Prisma Studio (free,
  zero-maintenance) or a tiny custom admin route, removing a large dependency tree
  and one more attack surface.
- **Background jobs for AI/TTS**: move Gemini enrichment + TTS generation off the
  request path into a queue (e.g. BullMQ + Redis, or a simple cron worker). New
  words show a "enriching..." state and fill in moments later. This avoids slow
  user-facing requests and lets you batch/retry failed enrichments.
- **Image sourcing**: Unsplash requires attribution and rate limits; for a vocab
  app, consider generating simple illustrative icons (emoji is already stored!) or
  a curated/cached image set instead of a live third-party API per word.
- **Auth**: Google-only is fine for a niche app, but consider adding email/password
  or passkeys if you want broader reach without OAuth setup friction for users.
- **Hosting**: a single docker-compose VPS is fine and cheap, but if uptime/ops
  burden is a concern, Fly.io or Railway can run the same Dockerfiles with managed
  Postgres and far less manual maintenance (no more UID/permission issues like the
  one we just fixed).
- **Monorepo tooling**: if keeping both frontend/backend in one repo, consider
  pnpm workspaces / Turborepo for shared types (e.g. DTOs shared between Nest and
  React) — currently the API contract is duplicated by hand.

---

Let me know your answers to the open questions and which suggestions you want to
adopt — I can then turn this into a concrete rebuild plan (repo structure, migration
steps for existing data, and a phased implementation order).
