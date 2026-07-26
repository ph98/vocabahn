# Vocabahn — System Description

What this codebase does, as of 2026-07-26. Present tense only: if something is
described here, it exists in the code. Planned work lives in GitHub issues, not
in this directory.

Every claim here was derived by reading the code. Where a behaviour was
confirmed by running the app, it is marked **observed**. Where it is only
readable in code and has never been verified at runtime, that is stated.

Each file ends with a **Limitations** section: present-tense defects and gaps,
carrying an issue number where one is filed. A limitation with no issue number
is known and unplanned.

## Read these in order

| File | Subsystem |
| :--- | :--- |
| `accounts.md` | Google OAuth, One Tap, email magic links, JWT cookies, quotas, throttling |
| `dictionary.md` | Lexicon → active dictionary, search, lemma resolution, morphology tables |
| `enrichment.md` | Stub → BullMQ job → Gemini / ElevenLabs / Unsplash → polling client |
| `learning.md` | Cards, FSRS, review session, offline sync, knowledge scores, auto-graduation |
| `content.md` | CEFR courses, user decks, source datasets, seed scripts |
| `web-client.md` | Routes, navigation, theming, motion, gestures, a11y, PWA |

## Topology

Two applications, not three.

```
apps/api    NestJS 11 — HTTP API *and* the BullMQ enrichment worker, one process
apps/web    React 19 + Vite — SPA, served by nginx in production
packages/shared  Zod schemas; the API contract both sides import
```

There is no `apps/worker`. The enrichment queue consumer
(`apps/api/src/enrichment/enrichment.processor.ts`) runs inside the API process
via `@nestjs/bullmq`'s `WorkerHost`, so API replicas are also queue consumers —
scaling the API scales enrichment concurrency with it.

AdminJS is not a service. It is a script, `apps/api/scripts/admin.mts`, run
on demand with `pnpm admin`.

Infrastructure: PostgreSQL 16 and Redis 7. `docker-compose.yml` (development)
starts only those two; API and web run on the host. `docker-compose.prod.yml`
additionally builds and runs `api` and `web`.

## Request and data flow

```
                    ┌──────────────────────────────────────────┐
  browser           │ apps/web (SPA)                           │
                    │  TanStack Query · axios → /api/v1        │
                    └───────────────┬──────────────────────────┘
                                    │  httpOnly cookie vb_access
                    ┌───────────────▼──────────────────────────┐
                    │ apps/api  (prefix /api, URI version v1)  │
                    │                                          │
   PostgreSQL ◀─────┤ Prisma  ·  20 models                     │
                    │                                          │
       Redis  ◀─────┤ BullMQ queue + quota counters            │
                    │        │                                 │
                    │        ▼ same process                    │
                    │ EnrichmentProcessor (concurrency 2)      │
                    └────────┬─────────────────────────────────┘
                             │
        Gemini ◀─────────────┼──────────▶ ElevenLabs → Google TTS fallback
                             ▼
                          Unsplash        writes static/audio/*.mp3
```

The learner-facing loop:

1. A word is looked up. If it exists in the lexicon but not the active
   dictionary, a `DictionaryEntry` stub is created synchronously
   (`dictionary.md`).
2. Viewing an unenriched entry enqueues one BullMQ job, subject to a per-user
   daily quota (`enrichment.md`).
3. The client polls the entry every 4 s while its status is `PENDING` or
   `ENRICHING`. There is no SSE and no WebSocket.
4. Enrolling in a course creates one `Card` per course word (`content.md`).
5. Rating a card writes a `ReviewLog` row, advances FSRS state, then recomputes
   that word's knowledge score, which may auto-graduate it or a batch of other
   words (`learning.md`).

## Invariants that hold across subsystems

- **`ReviewLog` is the source of truth for scheduling.** A card's FSRS columns
  are a cache, fully recomputable by replaying its log in `reviewedAt` order.
  `cards.service.ts` relies on this for offline sync. One place violates it —
  see `learning.md`.
- **The API contract lives in `packages/shared`.** The web client parses almost
  every response through the exported Zod schema. Changing a response shape
  without changing the schema surfaces as a client-side parse error, not a
  silent mismatch.
- **Paid APIs fire only on view.** Nothing bulk-enriches. Roughly 10k entries
  are promoted but unenriched by design.
- **CEFR is 12 half sub-levels**, `A1.1` … `C2.2` (Goethe / Profile Deutsch),
  defined once in `apps/api/src/knowledge/constants.ts` and mirrored in the
  Gemini response schema. Anything treating CEFR as six flat levels is wrong.
- **All day boundaries are UTC**, everywhere. See the limitation in
  `learning.md`.

## Relationship to the ADRs

`docs/adr/0001` and `0002` propose a different architecture — a per-user
evidence ledger as the hub, with experiences (stories, drills) emitting
evidence and a deterministic planner composing sessions. **None of it is
built.** Both ADRs are `proposed`. Cards plus FSRS are the hub today, and the
"knowledge model" that exists is a derived score (`learning.md`), not a ledger.

## Limitations of this directory

- Written from static reading of the code plus screenshots of a running
  instance. No load testing, no runtime verification of error paths.
- Test coverage is thin enough that it corroborates nothing: 13 Playwright
  specs across 3 files, 10 Vitest cases across 5 files. Absence of a bug here
  does not mean the tests would catch it.
