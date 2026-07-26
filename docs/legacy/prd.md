# Product Requirements Document (PRD)

> **LEGACY — SUPERSEDED. DO NOT TREAT AS SPECIFICATION.**
>
> This document was written ahead of the code and describes features that were
> never built alongside features that were built differently. It is retained
> only as raw material for triaging GitHub issues.
>
> For what the system actually does, read `docs/system/`. For what is planned,
> read the GitHub issues — nothing in this file is planned work until it has an
> issue.
>
> Known-false claims in this file include: a separate `apps/worker` application,
> a standalone AdminJS server, SSE for enrichment progress, listening mode,
> and the entire Phase A/B/C AI-first spine (evidence ledger, production
> drills, micro-stories, planner). Section numbers cited elsewhere refer to
> earlier revisions of this file and no longer resolve.

**Status:** Approved for Implementation  
**Latest Update:** 2026-07-25  

Vocabahn is a German vocabulary learning application combining a community-shared dictionary, spaced-repetition flashcards, curated course modules, and an AI-first learning experience (comprehensible input micro-stories, production drills, and an adaptive deterministic planner). This document serves as the single canonical Product Requirements Document and source of truth for all product specifications and feature designs.

---

## 1. Executive Summary

Vocabahn is built upon three core pillars and an AI-first architecture:
1. **Community-Shared Dictionary**: Every German word looked up by any user is enriched exactly once (translations, grammar, example sentences, emoji, image, audio) and cached centrally, preventing redundant external API calls.
2. **Spaced-Repetition & Knowledge Model**: Users study vocabulary using flashcards and AI experiences powered by the **FSRS (Free Spaced Repetition Scheduler)** algorithm operating below a higher-level **Knowledge Model** that tracks per-user knowledge items and eliminates unnecessary reviews of familiar words.
3. **Curated Courses & AI-First Experiences**: Structured word lists organized by CEFR levels (A1–B2) seed cards, while AI-generated Micro-Stories (comprehensible input) and Production Drills serve as primary review mechanisms.

This application is built with a clean monorepo architecture, low operational cost, showcase-grade frontend polish (gestures, animations, accessibility), and a custom **knowledge model** as its architectural hub.

---

## 2. Goals & Non-Goals

### Core Project Intent
1. **Frontend Showcase**: Demonstrate top-tier frontend craftsmanship: responsive layout, deep accessibility (WCAG 2.2 AA), seamless motion (GSAP), and touch gesture interactions.
2. **Modern Engineering Practices**: Practice standard monorepo workflows (pnpm workspaces), versioned API contracts, and containerized deployment pipelines.
3. **High-Value Learning Utility**: Provide a minimal, robust vocabulary builder that respects the user's study time.

### Goals
- **G1 — Native-Quality PWA**: Smooth transitions, touch gestures, standalone display, and offline capabilities to make the app feel indistinguishable from a native mobile application.
- **G2 — Feature Parity & Improvements**: Ensure all core vocabulary functionality exists alongside structural AI-first improvements.
- **G3 — Efficient Ingestion & Caching**: Cache all AI enrichments, images, and Text-to-Speech audio so they are generated once and stored forever.
- **G4 — Clean, Unified Contract**: End-to-end type safety with shared Zod schemas between NestJS and React.
- **G5 — Smart Review Scheduling**: Skip or graduate cards automatically using a derived knowledge model, maximizing learning efficiency.
- **G6 — AI-First Review & Planning**: Service review items through generated Micro-Stories and Production Drills, guided by a deterministic Planner and conversational goal surface.

### Non-Goals
- Native app stores (App Store/Play Store) in v1; the API remains token-based and client-agnostic so a native wrapper can be developed later.
- Subscriptions, payment gateways, or analytic tools.
- Multi-language support (German to English only).
- Multi-provider credentials (only Google OAuth and Email OTP magic links are supported).
- Open-ended unstructured tutor chat or real-time voice synthesis in v1.

---

## 3. Product & User Experience Requirements

### 3.1 Frontend & Motion Quality
The frontend is the primary showcase. Visual polish and responsiveness are core requirements:
*   **Mobile-First Design**: The interface is designed primarily for phone screens and scales gracefully to tablet/desktop layouts.
*   **Touch & Gesture Controls**: Swipe-to-rate card reviews using `@use-gesture/react` with velocity-aware springs and directional visual feedback. Drag-to-dismiss panels and pull-to-refresh feeds are supported. Every gesture must have a non-touch equivalent (e.g. keyboard shortcuts or buttons).
*   **GSAP Animations**: Fluid card flips, smooth transitions, and staggered lists running at 60fps on transform/opacity properties.
*   **Accessibility (WCAG 2.2 AA)**:
    *   Full keyboard navigation (space to flip cards, 1–4 to rate).
    *   Proper screen-reader support via semantic HTML and ARIA labels.
    *   `prefers-reduced-motion` settings respected globally, falling back to simple fades or instant swaps.
    *   Contained scroll regions to prevent browser double-bounce or page-shake.
    *   Contrast ratios $\ge 4.5:1$ and minimum touch targets of $44\text{px} \times 44\text{px}$.

### 3.2 Authentication & User Profiles
*   **Sign-In Options**: Google OAuth (default) and Email Magic-Link OTP.
*   **Profile Stats**: Tracks streaks, daily review activity heatmap, and details regarding daily enrichment usage.
*   **Quota Management**: Enforces daily caps on how many new words a user can enrich to prevent database/API abuse.

### 3.3 The Shared Dictionary
*   **Fuzzy Search**: Instant search over existing dictionary entries using Fuse.js.
*   **Rich Dictionary Entries**: Includes lemma, part of speech (POS), CEFR estimate, gender (with article color cues), IPA pronunciation, etymology, emoji, examples with highlights, Unsplash image, and Cloud TTS audio.
*   **On-Demand Enrichment**: Searching an unknown word inserts a stub and triggers a background BullMQ task. The web client subscribes via SSE, rendering a skeleton shimmer loading state until the word is ready.

### 3.4 Spaced Repetition (FSRS) & Knowledge Model
*   **FSRS Integration**: Standard scheduling via `ts-fsrs`.
*   **Review Session**: Standard flashcard layout with options to flip, review translation/usage, and rate recall (Again, Hard, Good, Easy).
*   **Listening Mode**: Audio-only prompts where the learner hears the TTS audio first, guesses, and reveals the word.
*   **Offline Support**: Syncs reviews made while offline. The API reconciles FSRS scheduling sequentially using timestamps from `ReviewLog`.
*   **Score Prior**: Estimates starting scores using CEFR levels and frequency ranks from `de_full.txt`.
*   **Auto-Graduation**: Consistently fast, positive answers automatically graduate cards as "known".
*   **Undo Action**: A dedicated "Known Words" interface lists auto-graduated vocabulary, allowing single-click reversal.

---

## 4. AI-First Core Capabilities & Feature Specifications

### 4.1 Evidence Ledger & Evidence Policy (Phase A)
*   **Immutable Evidence Events**: Every learning signal in the system is recorded as an immutable Evidence Event before updating scheduling state. Events record: user, Knowledge Item (word), source Experience type, evidence kind, outcome, response latency, session ID, and timestamp.
*   **Evidence Kinds & Strengths**:
    *   `production-graded` (Production Drill verdict) → **strong**
    *   `recall-check` (Micro-Check answer) → **medium**
    *   `card-self-grade` (classic card rating) → **medium (self-reported)**
    *   `story-tap` (Tap-to-Reveal on Target Word) → **negative only**
    *   `prior-assumption` (Calibration Quiz / bulk marking) → **prior (not evidence)**
*   **Policy Rules**: The Evidence Policy aggregates events *per Knowledge Item per Session* into at most one FSRS rating update.
    *   **Failure Dominance**: Any negative event in a session caps the session rating at `Again`.
    *   **Graduation Guard**: Auto-Graduation to `Known` requires at least one strong-kind success event (`production-graded`); weak/medium evidence alone can never graduate an item.

### 4.2 Production Drill (Phase B)
*   **Targeted Production**: Learners demonstrate knowledge by writing German rather than self-grading.
*   **Drill Exercises**:
    1. **Translation**: Prompt in EN → type the German word/phrase in context (and DE → EN).
    2. **Contextual Production**: "Write a sentence using *<word>*" with the word sense pinned.
*   **Grading Contract**: Graded via the LLM Gateway returning structured verdict `{ verdict: correct | partial | wrong, targetWordOk: boolean, feedback: string }`.
    *   Scheduling evaluates strictly `targetWordOk` (target word usage/meaning). Ancillary grammar errors (e.g. wrong article or word order elsewhere) are noted in `feedback` coaching without penalizing target word recall.
*   **Latency & Fallback**: Target grading latency $\le 2\text{s}$ (p90). If grading times out (> 5s), the drill falls back to self-grade and records a `card-self-grade` event.

### 4.3 Micro-Story: Comprehensible Input (Phase B)
*   **Personalized German Reading**: Generated short German texts (~90–150 words) calibrated to ~95% known vocabulary (Known + Assumed Known), weaving in Due and Frontier words as Target Words.
*   **Span Validation**: Generated stories self-annotate Target Word spans `{ surfaceForm, offset, lemma, knowledgeItemId }`. Spans are strictly validated against text content before rendering.
*   **Pre-Generation**: Following session completion, a BullMQ job pre-generates the next session's story.
*   **Reader UI & Micro-Check**:
    *   **Tap-to-Reveal**: Tapping a Target Word displays its contextual gloss and emits a `story-tap` (negative) event. Tapping background words performs dictionary lookup without emitting evidence.
    *   **Micro-Check**: Story ends with 2–4 recall check questions. Correct answers emit `recall-check` (medium) evidence. Reading without completing the Micro-Check produces zero positive evidence.

### 4.4 Deterministic Planner & Goal Dashboard (Phase C)
*   **Deterministic Core**: A pure function taking due-item count, frontier size, learner time budget, and mix weights to produce the exact session composition (Micro-Story, Production Drill block, residual flashcards). Same inputs always produce identical plans.
*   **Conversational Surface**:
    *   **Goal Parsing**: Free-text goal input ("pass Goethe B1 by March") parsed into target level, deadline, and daily time budget.
    *   **"Today's Plan" Dashboard Card**: Leads the dashboard with plan composition, progress, and a one-line LLM explanation of *why* this plan was chosen.
    *   **Negotiation**: Quick chips ("I have 5 min", "More stories") and free-text inputs adjust planner core parameters and regenerate the plan instantly.
*   **Onboarding Additions**: Sequenced flow: Declared CEFR level → Free-text Goal → Interest topics → Adaptive Calibration Quiz (sampling frequency bands to seed `Assumed Known` state).

---

## 5. Technical Architecture

### Monorepo Structure
```
vocabahn/
├── apps/
│   ├── api/        # NestJS API Server (endpoints, DB migrations, seeders)
│   ├── worker/     # BullMQ Worker (AI, TTS, and Image enrichment)
│   └── web/        # React 19 Frontend + Vite
├── packages/
│   └── shared/     # Zod schemas, TypeScript types, API contracts
└── docs/           # Consolidated Documentation
```

### Technology Stack
*   **Backend**: NestJS 11, Prisma ORM, PostgreSQL.
*   **Task Queue**: Redis and BullMQ.
*   **Frontend**: React 19, Tailwind CSS 4, shadcn/ui (Radix primitives), GSAP.
*   **Data Sources**:
    *   `kaikki.org-dictionary-German-words.jsonl` (~938 MB German Wiktionary dump).
    *   `de_full.txt` (17 MB German corpus frequency list).
*   **AI & External APIs**:
    *   Google Gemini (`gemini-flash-lite-latest` / `gemini-2.0-flash`) via unified LLM Gateway.
    *   Google Cloud Text-to-Speech (cached locally as `.mp3`).
    *   Unsplash API (cached images with attribution).
*   **Admin Panel**: Standalone AdminJS server.

---

## 6. Security Architecture
*   **Rate Limiting**: Enforced via `@nestjs/throttler` with specific rules for auth and API-intensive endpoints.
*   **Captcha Validation**: Google reCAPTCHA protects contact forms and high-cost routes.
*   **HTTP Hardening**: Helmet configuration, strict CORS allowlist, and secure HTTP-only cookies.
*   **Database Safety**: Prisma parameters prevent SQL injection.
*   **Container Security**: Non-root container execution, isolated Docker networks, and encrypted backups.
