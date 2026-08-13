# Vocabahn — System Description

What this codebase does, as of 2026-08-13. Present tense only: if something is
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
| `stories.md` | Micro-stories retold from real articles, topics, daily scheduling, narration |
| `sources.md` | German publisher feeds, topic taxonomy, parsing, retention |
| `notifications.md` | Web Push, the daily study reminder, the first server-backed setting |
| `content.md` | CEFR courses, user decks, source datasets, seed scripts |
| `web-client.md` | Routes, navigation, theming, motion, gestures, a11y, PWA |
| `analytics.md` | GA4 event taxonomy, consent gating, what is deliberately not sent |
| `monitoring.md` | Mocked PR e2e vs. unmocked live monitoring, health checks, deploy gates, alerting |

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

Directus is a self-hosted admin panel containerized in production (`docker-compose.prod.yml`)
and served via nginx at `admin.vocabahn.app`. It isolates system tables in a dedicated `directus` PostgreSQL schema.

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
   PostgreSQL ◀─────┤ Prisma  ·  26 models                     │
                    │                                          │
       Redis  ◀─────┤ BullMQ queue + quota counters            │
                    │        │                                 │
                    │        ▼ same process                    │
                    │ EnrichmentProcessor  (concurrency 2)     │
                    │ StoryProcessor       (concurrency 2)     │
                    │ SourceProcessor      (every 2 h)         │
                    │ StoryDigestProcessor (hourly sweep)      │
                    │ ReminderProcessor    (15-minute sweep)   │
                    └────────┬─────────────────────────────────┘
                             │
        Gemini ◀─────────────┼──────────▶ ElevenLabs → Google TTS fallback
                             │            Web Push services (FCM, Mozilla, …)
                          Unsplash        writes static/audio/*.mp3
                             ▼
      tagesschau · kicker · Sportschau · heise · wissenschaft.de · Spektrum
                     (RSS, read-only, title + summary only)
```

Five queue consumers now run in the API process, not one. Three are repeatable
schedulers registered at boot with fixed job ids, so N replicas still produce
one poll and one of each sweep (`sources.md`, `stories.md`,
`notifications.md`).

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
6. Requesting a story picks a subject and a real German article on it, then
   enqueues a second BullMQ job that retells the article at the learner's level
   around their current words and narrates it, polled the same way
   (`stories.md`, `sources.md`).
7. Independently of any request, an hourly sweep writes each active learner one
   story timed to 07:00 in their own timezone, so it is waiting when they open
   the app (`stories.md`).
8. A second sweep, every 15 minutes, pushes a study reminder to each learner who
   opted in, at the local time they chose, unless they have already reviewed
   that day (`notifications.md`).

## Invariants that hold across subsystems

- **`ReviewLog` is the source of truth for scheduling.** A card's FSRS columns
  are a cache, fully recomputable by replaying its log in `reviewedAt` order.
  `cards.service.ts` relies on this for offline sync. One place violates it —
  see `learning.md`.
- **The API contract lives in `packages/shared`.** The web client parses almost
  every response through the exported Zod schema. Changing a response shape
  without changing the schema surfaces as a client-side parse error, not a
  silent mismatch.
- **Paid APIs fire on demand, with one scheduled exception.** Nothing
  bulk-enriches: roughly 10k entries are promoted but unenriched by design.
  Enrichment (triggered by viewing an entry) and on-demand story generation
  (triggered by asking) each carry a per-user daily Redis cap. The daily story
  is the exception — it is generated without anyone asking, so it is bounded
  differently: only learners with an active card and a review in the last 14
  days, at most one per learner per local day, enforced by a Redis `SET NX`
  claim rather than a counter (`stories.md`). No read path may spend that quota
  implicitly: the story payload ships the entry fields its word popovers show
  rather than looking each word up, because a lookup enriches.
- **CEFR is 12 half sub-levels**, `A1.1` … `C2.2` (Goethe / Profile Deutsch),
  defined once in `apps/api/src/knowledge/constants.ts` and mirrored in the
  Gemini response schema. Anything treating CEFR as six flat levels is wrong.
- **All day boundaries are UTC**, everywhere — except the two scheduled sweeps,
  which are deliberately per-learner local (`User.timezone`): "a story waiting
  when you wake up" and "remind me at 19:00" have no meaning in UTC. Both keep
  their Redis claim keys on the learner's local date for the same reason. See
  the limitation in `learning.md`.
- **Settings are `localStorage`, with one exception.** The daily study reminder
  lives on the `User` row, because the server is what sends it and a browser
  flag cannot switch that off (`notifications.md`). Everything else is
  `useSettings` (`web-client.md`).

## Relationship to the ADRs

`docs/adr/0001` and `0002` propose a different architecture — a per-user
evidence ledger as the hub, with experiences (stories, drills) emitting
evidence and a deterministic planner composing sessions. Both ADRs remain
`proposed`, and **the architecture they describe is not built**: there is no
evidence ledger and no planner. Cards plus FSRS are still the hub, and the
"knowledge model" that exists is a derived score (`learning.md`).

One piece has since landed independently. Micro-stories (`stories.md`) are a
non-card experience that records a per-word comprehension signal
(`StoryTarget.understood`). That signal is deliberately inert — nothing reads
it — and it is feature-local rather than a general event schema, because a
ledger designed from a single producer would be designed wrong.

## Limitations of this directory

- Written from static reading of the code plus screenshots of a running
  instance. No load testing, no runtime verification of error paths.
- Test coverage has grown but is still partial: 25 mocked Playwright specs
  across 5 files (run twice, chromium and mobile-safari), 8 unmocked
  live-monitoring specs across 2 files, 244 Vitest cases across 26 files in
  `apps/web`, and 223 across 22 files in `apps/api`. Absence of a bug here does
  not mean the tests would catch it — the mocked Playwright specs in particular
  stub the API away entirely (`monitoring.md`).
