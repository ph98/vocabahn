# Vocabahn — Product Requirements Document (Rebuild)

**Status:** Approved for implementation
**Date:** 2026-06-13
**Supersedes:** `PROJECT_OVERVIEW.md` (kept as historical reference for the original build)

---

## 1. Summary

Vocabahn is a German vocabulary learning app built around three pillars:

1. **A community-shared dictionary** — every word is AI-enriched once (translation,
   grammar, examples, image, audio) and stored centrally for all users.
2. **Spaced-repetition flashcards** — per-user FSRS scheduling (`ts-fsrs`) on top of
   the shared dictionary.
3. **Curated courses** — ordered word lists (A1–B2, thematic) that seed a user's deck.

This rebuild keeps the product idea and rewrites the implementation on a cleaner,
cheaper, easier-to-maintain stack — with one significant product addition: a
**knowledge model** that stops the app from wasting review time on words the user
already knows.

## 2. Goals & Non-Goals

### Project intent (in priority order)
The rebuild serves three purposes, and trade-offs are resolved in this order:

1. **Frontend showcase** — demonstrate frontend craft: accessibility, UI/motion
   quality, project structure, and standard tooling. The frontend is the most
   important part of this project.
2. **Learning vehicle** — practice current global trends in project structure and
   deployment process (monorepo conventions, CI/CD, containerized deploys).
3. **A plain, solid German-learning app** — the most efficient possible way to
   improve vocabulary, without gimmicks that don't serve learning.

### Goals
- **G1 — Native-quality PWA**: mobile-first design; gestures, motion, and offline
  behavior good enough that the PWA feels like a real mobile app (awwwards-level
  interaction quality), with accessibility as a first-class feature, not a checkbox.
- **G2 — Feature parity + improvements**: everything the current app does, plus the
  improvements in this document, then ship.
- **G3 — Low cost, low ops**: runs on a single VPS via Docker Compose; AI/TTS/image
  costs are controlled by local-data-first enrichment (see §7) and a background
  pipeline (enrich once, cache forever).
- **G4 — Portfolio quality**: the codebase itself is a showcase — typed end-to-end,
  shared API contract, clean monorepo, security best practices throughout.
- **G5 — Respect the learner's time**: smart card selection; never spam words the
  user demonstrably knows.
- **G6 — Mobile-ready API**: web + PWA today, but the API stays token-based and
  client-agnostic so a native (Expo/React Native) app can be added later without
  backend changes.
- **G7 — Complete data foundation**: ingest and store the source data as completely
  as practical, so future features (etymology views, declension drills, frequency
  insights) need no re-ingestion.

### Non-Goals (v1)
- Native mobile app (planned for later; API must not block it).
- Monetization, payments, or growth/analytics tooling.
- Languages other than German.
- Email/password, magic-link, or guest auth — **Google OAuth only**.
- Migrating old user data (cards, review logs, streaks) — user state starts fresh.

## 3. Users

- **Primary:** the developer and a small circle of German learners (A1–B2).
- **Secondary:** recruiters/engineers reviewing the project as a portfolio piece.

Design implications: polish the core study loop and the first-run experience; do not
build for scale, but don't paint the architecture into a corner either.

## 4. Product Requirements

### 4.0 Frontend experience (top priority)
The frontend is the project's primary showcase. These are requirements, not
nice-to-haves:

- **Mobile-first PWA, native feel**: designed for the phone screen first and scaled
  up to desktop. Installed as a PWA, it should be indistinguishable from a native
  app: app-shell instant load, no browser-feeling page reloads, safe-area insets
  respected, standalone display mode, splash/theming, no rubber-band scroll
  artifacts, instant tap response (no 300ms delays, no accidental double-fires).
- **Motion quality (GSAP)**: GSAP is the primary animation engine — card flips,
  review transitions, list choreography, micro-interactions. Animations run at
  60fps (transform/opacity only on the hot path), are interruptible, and serve
  comprehension (spatial continuity between screens), not decoration.
- **Awwwards-quality gestures**: touch interactions are the core input on mobile —
  swipe-to-rate on flashcards (with directional visual affordances), drag with
  physics-based release (velocity-aware spring/inertia), pull-to-refresh where it
  makes sense, edge-swipe back navigation. Gestures track the finger 1:1 (no
  laggy followers) and every gesture has a non-gesture equivalent (buttons), so
  nothing is gesture-only.
- **Stunning accessibility (WCAG 2.2 AA minimum)**:
  - Full keyboard operability — the entire review session is playable with the
    keyboard alone (space to flip, 1–4 to rate).
  - Screen-reader support: correct roles/names/states, live-region announcements
    for card transitions and review results, `lang="de"` on German text so screen
    readers pronounce it correctly.
  - `prefers-reduced-motion` honored everywhere — every GSAP animation has a
    reduced variant (fade/instant), and gestures still work without animation.
  - Visible focus states, ≥4.5:1 contrast, ≥44px touch targets, no information
    conveyed by color alone, dark mode.
  - Audited continuously: `eslint-plugin-jsx-a11y` in CI, axe checks in component
    tests, and periodic manual screen-reader passes (VoiceOver).
- **Performance budget**: Lighthouse ≥ 95 (Performance, A11y, Best Practices, SEO)
  on mid-range mobile; route-level code splitting; images lazy-loaded and sized.

### 4.1 Authentication
- Sign in with Google (OAuth2 code flow on web).
- The API also accepts Google ID-token verification (mobile-ready, kept from the
  current design) and issues its own JWTs for sessions.
- No other auth methods in v1.

### 4.2 Dictionary
- **Search**: fuzzy search (Fuse.js) over the shared dictionary; instant results for
  known entries.
- **Entry contents**: German word, translation(s), article (der/die/das), plural,
  full inflection/declension forms, IPA, hyphenation, etymology, emoji,
  illustrative photo (with attribution), example sentences, synonyms/antonyms,
  CEFR level, frequency rank, TTS audio (`.mp3`, cached as static files).
- **Unknown words**: searching a word not yet in the dictionary creates a stub entry
  immediately and queues background enrichment. The UI shows an "enriching…" state
  and fills in live (polling or SSE) — typically within seconds.
- **Enrichment pipeline** (background worker, BullMQ + Redis), **local data first**:
  1. **Wiktextract lookup** (`data/kaikki.org-dictionary-German-words.jsonl`,
     ingested into the DB — see §7): POS, gender/article, declension forms, IPA,
     hyphenation, etymology, English glosses, synonyms/antonyms, topic tags. Free,
     instant, no API call.
  2. **Frequency rank** from `data/de_full.txt`.
  3. **Gemini** (`gemini-flash-lite-latest`) only for what local data can't
     provide: learner-friendly translation polish, example sentences, emoji,
     CEFR estimate.
  4. **Image**: Unsplash keyword search (attribution stored → `ImageCredit`);
     AI-generated illustrations are a planned future alternative — the schema
     stores image `source` (unsplash / ai / manual) from day one.
  5. **Google Cloud TTS** for audio, written once to static storage.
  - Retries with backoff; failed enrichments land in a dead-letter state visible in
    AdminJS for manual re-trigger.
  - Bulk mode: the same pipeline seeds the initial dictionary (see §7 Data).

### 4.3 Courses
- Ordered word lists (A1/A2/B1/B2, "Survival German", "Business German", …).
- Enrolling seeds a `Card` per course word for that user (lazily or in batch).
- Course progress view: words learned / in progress / not started.
- Courses are authored via AdminJS.

### 4.4 Reviews (core loop)
- FSRS scheduling via `ts-fsrs`; ratings Again / Hard / Good / Easy.
- A review session presents due cards; each review writes a `ReviewLog`.
- **Listening/audio mode**: a review variant where the prompt is the TTS audio —
  hear the word, recall meaning/spelling, then reveal. Card type is chosen per
  session (user toggle) in v1; per-card mixing can come later.
- **Offline review (PWA)**: due cards (including audio and images) are cached ahead
  of time; a session works fully offline and review results sync back when
  connectivity returns. Conflict rule: offline reviews are replayed in timestamp
  order; server-side FSRS state is recomputed from the log (the log is the source
  of truth).

### 4.5 Knowledge model ("don't spam known words")
The headline product improvement. FSRS handles *spacing*, but every card still
appears at least once and Easy-graduation is slow across thousands of words. The
knowledge model sits **above** FSRS and decides *which* cards deserve the user's
time:

- **Baseline (FSRS-native):** rating Easy on first exposure schedules the card far
  out; this remains the manual escape hatch and requires no extra UI.
- **Smart inference (v1):** a per-user *knowledge score* per word, updated
  automatically from behavior:
  - **Performance signals**: consistently fast + Easy/Good answers raise the score;
    Again lowers it.
  - **Level inference**: estimate the user's effective CEFR level from their review
    history; words well below that level start with a high prior (e.g. a user
    breezing through B1 words shouldn't grind through A1 fillers).
  - **Frequency prior**: every word's corpus frequency rank (from `de_full.txt`) is
    stored on the entry; a user performing well at rank ~3,000 words gets high
    knowledge priors for the top-1,000 words they haven't seen yet.
  - **Auto-graduation**: when a word's knowledge score crosses a threshold, the
    system marks it *known* — it is scheduled far out (not deleted), and the user is
    notified unobtrusively ("12 words auto-marked as known — review/undo").
  - **Transparency & undo**: a "Known words" list shows everything auto-graduated,
    with one-tap undo. The system must never silently make a word unrecoverable.
- **New-card ordering**: within a course, new cards are introduced lowest knowledge
  score first, so session time goes to genuinely unknown material.
- Implementation note: the knowledge score is a derived, recomputable value
  (separate from FSRS state) so the heuristic can evolve without schema migrations
  of card data.

### 4.6 Dashboard & motivation
- Daily streak counter and calendar heatmap of study activity
  (react-calendar-heatmap).
- Stats: due today, reviewed today, total known/learning/new, per-course progress.

### 4.7 Admin
- **AdminJS** (kept) for dictionary entries, examples, image credits, courses,
  course words, users, contact messages, and failed-enrichment retry.

### 4.8 Misc
- Contact form with reCAPTCHA.

### 4.9 Security (cross-cutting requirement)
Security best practices apply to every part of the application:

- **Rate limiting everywhere** (`@nestjs/throttler`), with strict tiers on anything
  that triggers paid AI/TTS/image APIs: per-user and per-IP caps on new-word
  enrichment requests (e.g. N new enrichments per user per day), plus a global
  queue-level budget cap as the backstop. Auth, search, and contact endpoints are
  also throttled.
- **CAPTCHA where possible**: reCAPTCHA on the contact form and on any
  unauthenticated or abuse-prone flow (e.g. sign-in abuse, enrichment-heavy
  endpoints if abuse appears).
- **HTTP hardening**: Helmet (CSP, HSTS, no-sniff), strict CORS allowlist, request
  body size limits; nginx TLS termination with modern ciphers.
- **Input validation on every endpoint**: zod schemas from `packages/shared`
  validated at the API boundary; Prisma parameterization (no raw SQL).
- **AuthN/AuthZ**: short-lived JWTs with rotation-capable refresh; every resource
  query scoped to the authenticated user (no IDOR); AdminJS behind a separate
  admin role and ideally IP-restricted at nginx.
- **Secrets & supply chain**: secrets only via `.env`/environment (never committed);
  `pnpm audit` + Dependabot/Renovate in CI; lockfile-enforced installs.
- **Frontend**: no `dangerouslySetInnerHTML` with user/AI content (AI-generated
  text is treated as untrusted), tokens kept out of `localStorage` where feasible
  (httpOnly cookie for web), CSP-compatible build.
- **Operational**: container processes run as non-root, Postgres/Redis not exposed
  publicly (compose-internal network only), nightly encrypted off-VPS backups.

## 5. Architecture & Tech Stack

### Repository — pnpm workspaces monorepo
```
vocabahn/
├── apps/
│   ├── api/        # NestJS 11
│   ├── worker/     # enrichment worker (BullMQ consumer; can live inside api as a module)
│   └── web/        # React 19 + Vite
├── packages/
│   └── shared/     # DTOs, zod schemas, enums — single source of the API contract
├── docker-compose.yml
└── PRD.md
```
No Turborepo in v1; plain pnpm workspace scripts suffice at this size.

### Backend
| Concern | Choice |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| ORM / DB | Prisma + PostgreSQL |
| Auth | Google OAuth2 + Google ID-token verify, JWT sessions |
| Spaced repetition | `ts-fsrs` |
| Job queue | **BullMQ + Redis** (new) — enrichment, TTS, bulk seeding |
| AI enrichment | Gemini `gemini-flash-lite-latest` |
| Images | Unsplash API (attribution stored) |
| Audio | Google Cloud TTS → static `.mp3` |
| Admin | AdminJS |
| Search | Fuse.js |
| Rate limiting | `@nestjs/throttler` |

### Frontend
| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Routing | React Router 7 |
| UI | **Tailwind CSS + shadcn/ui** (replaces heavier component libs), mobile-first |
| Data | TanStack Query + Axios, types from `packages/shared` |
| Animation | **GSAP** (primary engine: card flips, transitions, choreography). One animation system — no Framer Motion alongside it |
| Gestures | `@use-gesture/react` (1:1 touch tracking, velocity) driving GSAP springs/inertia for physics-based release |
| Accessibility | Radix primitives via shadcn, `eslint-plugin-jsx-a11y` + axe in CI, `prefers-reduced-motion` variants for all GSAP animations |
| Icons | Lucide |
| PWA / offline | `vite-plugin-pwa` + IndexedDB review-queue for offline sessions; standalone display, safe-area insets, app-shell caching |
| Misc | dayjs, react-calendar-heatmap, react-google-recaptcha |

### Infrastructure
- Docker Compose on a single VPS: `db` (Postgres), `redis`, `api` (Nest, also runs
  the worker unless split out), `web` (nginx static).
- Secrets via `.env` (`.env.example` checked in).
- Nightly `pg_dump` backups (cron on the VPS) — the dictionary is expensive to
  regenerate; back it up from day one.

### Data model (Prisma — new schema)
- `User` — Google-linked; inferred CEFR level.
- `Card` — per-user FSRS state per word; `knownState` (active / auto-known /
  user-known / suspended).
- `ReviewLog` — full history; source of truth for FSRS replay and knowledge
  inference; includes review mode (standard/listening) and answer latency.
- `KnowledgeScore` — derived per-user/per-word score (recomputable).
- **Lexicon layer** (from Wiktextract ingest, §7 — kept complete):
  - `LexiconEntry` — headword, POS, gender, IPA, hyphenation, etymology,
    `frequencyRank`, plus `raw jsonb` of the original Wiktextract record.
  - `WordForm` — every inflected form with its grammatical tags (enables
    declension drills and inflected-form → lemma lookup later).
  - `WordSense` — glosses, topic tags, synonyms/antonyms per sense.
- `DictionaryEntry` (+ `DictionaryExample`, `ImageCredit`) — the *active*,
  learner-facing entry layered on a `LexiconEntry`; holds the AI-enriched fields
  (examples, emoji, CEFR, image, audio); `enrichmentStatus` (pending / enriched /
  failed); image `source` (unsplash / ai / manual).
- `Course`, `CourseWord` (ordered), `UserCourse`.
- `ContactMessage`.

## 6. API Principles (mobile-readiness)
- Pure JSON token-authenticated API; no server-side session/cookie coupling that a
  native client couldn't use.
- All request/response types defined once in `packages/shared`.
- Versioned base path (`/api/v1`) so a future native app and the web app can evolve
  independently.

## 7. Data & Seeding (fresh start from raw source data)

Decision: **new schema, built from raw local datasets** — no old enriched content,
user data, cards, or logs are migrated. The guiding rule (G7): **keep the database
as complete as possible**, so future improvements never require re-ingestion.

### Source datasets (in `./data/`)
| File | Size | Contents | Role |
|---|---|---|---|
| `de_full.txt` | 17 MB, ~1.16M lines | German frequency list: `word count`, descending (e.g. `ich 5890279`) | Frequency rank per word; selects which words to seed; feeds the knowledge model's frequency prior |
| `kaikki.org-dictionary-German-words.jsonl` | 938 MB | Wiktextract dump of German Wiktionary — per word: POS, gender, full declension/conjugation forms, IPA, hyphenation, etymology (text + templates), English glosses, synonyms/antonyms, topic tags | Primary linguistic source — replaces most Gemini work |

### Ingestion plan
1. **Parse & load Wiktextract** (one-time streaming ingest — the file is 938 MB,
   process it line-by-line, never in memory at once) into the DB. Store the data
   **completely**: all senses, all forms with their grammatical tags, etymology,
   hyphenation, sounds, topic tags — plus the raw JSON of each record in a `jsonb`
   column as the escape hatch for anything the structured schema doesn't capture yet.
2. **Load frequency ranks** from `de_full.txt`; join on headword (and on lemma via
   the Wiktextract forms, so inflected frequency-list tokens map to their lemma).
3. **Select the active dictionary**: top-N words by frequency that have a
   Wiktextract entry (initial N ≈ 10,000), plus all course vocabulary, become
   `DictionaryEntry` rows with `enrichmentStatus = pending`. The rest stays in the
   ingested lexicon, instantly promotable when a user searches it.
4. **Gap enrichment via the queue** (rate-limited, resumable): Gemini fills only
   examples, emoji, CEFR estimate, and translation polish; Unsplash provides the
   photo; TTS generates audio. Failures retried, then surfaced in AdminJS.
5. **Courses**: seed A1–B2 and thematic course word lists (from the old DB's plain
   word lists and/or public CEFR lists) referencing the lexicon.
6. Budget note: local data eliminates the heaviest Gemini usage; the remaining
   per-word cost is 1 small Gemini call + 1 Unsplash call + 1 TTS call, run in
   batches over days within free-tier/rate limits.

## 8. Phased Delivery

| Phase | Scope | Exit criterion |
|---|---|---|
| **0. Foundation** | Monorepo scaffold, Docker Compose, Postgres + Redis, Prisma schema, Google auth, shared package, CI (lint + a11y lint + audit), security baseline (Helmet, CORS, throttler, validation) | Sign in on the deployed VPS |
| **1. Data & dictionary** | Wiktextract + frequency ingestion (§7), search, entry page, enrichment queue, AdminJS | Lexicon ingested; dictionary browsable; new word enriches in background |
| **2. Core study loop** | Courses, enrollment, FSRS reviews, ReviewLog; swipe-to-rate gestures + GSAP card motion land here, not as a later skin | Complete a polished review session end-to-end on a phone |
| **3. Dashboard** | Streaks, heatmap, stats, course progress | Parity with the old app |
| **4. Improvements** | Listening mode, offline PWA review, knowledge model (inference + auto-graduation + known-words list) | All §4.4–4.5 requirements met |
| **5. Showcase polish** | Motion/gesture refinement pass, full a11y audit (keyboard, VoiceOver, reduced-motion), Lighthouse ≥ 95, install-experience polish | §4.0 requirements met — **v1 done** |

Note on ordering: §4.0 (frontend experience) is not a phase — mobile-first layout,
accessibility, and motion quality are built into every phase; Phase 5 is the final
audit and refinement pass, not the first time these are considered.

## 9. Risks & Mitigations
- **Wiktextract ingestion complexity** — the 938 MB JSONL has messy edge cases
  (multi-sense words, missing fields, non-standard templates). Mitigate by
  streaming ingest with per-record error tolerance (log and skip, never abort),
  storing raw JSON alongside parsed fields, and validating a sample of parsed
  entries (common nouns/verbs/adjectives) before the full run.
- **Bulk gap-enrichment quality/cost** — pilot on ~50 words first; review output in
  AdminJS before running the full batch. Keep the old DB dump until the new
  dictionary is verified.
- **Motion vs. accessibility tension** — heavy GSAP/gesture work can degrade a11y
  if bolted on. Mitigate with the §4.0 rules: reduced-motion variant required for
  every animation, non-gesture equivalent required for every gesture, a11y linting
  in CI from Phase 0.
- **Knowledge-model overreach** (auto-marking words the user doesn't know) —
  conservative thresholds, visible notifications, one-tap undo; scores are
  recomputable so the heuristic can be tuned post-launch.
- **Offline sync conflicts** — ReviewLog-as-source-of-truth with timestamp replay
  keeps reconciliation deterministic.
- **Unsplash rate limits during bulk seed** — batch with delays; entries are usable
  (emoji + text) before the image lands.

## 10. Resolved Decisions (PRD interview + additions, 2026-06-13)
| Question | Decision |
|---|---|
| Project intent | 1) Frontend showcase, 2) learn modern structure/deployment trends, 3) a plain solid German-learning app |
| Scope | Portfolio + personal use |
| Platforms | Web + PWA now (mobile-first, native-app feel); API mobile-ready for a later native app |
| Enrichment | Local data first (Wiktextract + frequency list); background queue (BullMQ + Redis) for AI/image/TTS gaps |
| Hosting | Self-hosted VPS, Docker Compose |
| Admin | Keep AdminJS |
| Auth | Google OAuth only |
| Images | Mostly Unsplash (attribution stored); AI-generated images as a future source — schema supports both from day one |
| Repo | pnpm workspaces + shared types package |
| UI / motion | shadcn/ui + Tailwind; GSAP as the sole animation engine; `@use-gesture/react` for awwwards-quality gestures; WCAG 2.2 AA |
| v1 features | Parity + streaks/heatmap, offline review, listening mode, knowledge model |
| Data | Fresh start: new schema seeded from `data/de_full.txt` + `data/kaikki.org-dictionary-German-words.jsonl`; keep the DB as complete as possible |
| Known words | FSRS Easy as baseline + smart inference (performance, level, frequency priors) with auto-graduation and undo |
| Security | Cross-cutting: Helmet/CORS/validation, CAPTCHA where possible, tiered rate limits + budget caps on AI-backed endpoints |
