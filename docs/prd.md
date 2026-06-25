# Product Requirements Document (PRD)

**Status:** Approved for Implementation  
**Latest Update:** 2026-06-25  

Vocabahn is a German vocabulary learning application combining a community-shared dictionary, spaced-repetition flashcards, and curated course modules. This document defines the comprehensive product requirements, design criteria, and architectural decisions.

---

## 1. Executive Summary

Vocabahn is built upon three core pillars:
1. **Community-Shared Dictionary**: Every German word looked up by any user is enriched exactly once (translations, grammar, example sentences, emoji, image, audio) and cached centrally, preventing redundant external API calls.
2. **Spaced-Repetition Flashcards**: Users study vocabulary using flashcards powered by the **FSRS (Free Spaced Repetition Scheduler)** algorithm.
3. **Curated Courses**: Structured word lists organized by CEFR levels (A1–B2) and thematic topics seed cards into user decks.

This version is a **rebuild** focused on clean monorepo architecture, lower operational cost, showcase-grade frontend polish (gestures, animations, accessibility), and a custom **knowledge model** to bypass reviewing words a learner already knows.

---

## 2. Goals & Non-Goals

### Core Project Intent
1. **Frontend Showcase**: Demonstrate top-tier frontend craftsmanship: responsive layout, deep accessibility (WCAG 2.2 AA), seamless motion (GSAP), and touch gesture interactions.
2. **Modern Engineering Practices**: Practice standard monorepo workflows (pnpm workspaces), versioned API contracts, and containerized deployment pipelines.
3. **High-Value Learning Utility**: Provide a minimal, robust vocabulary builder that respects the user's study time.

### Goals
- **G1 — Native-Quality PWA**: Smooth transitions, touch gestures, standalone display, and offline capabilities to make the app feel indistinguishable from a native mobile application.
- **G2 — Feature Parity & Improvements**: Ensure all functionality from the original app exists in the rebuilt stack alongside structural improvements.
- **G3 — Efficient Ingestion & Caching**: Cache all AI enrichments, images, and Text-to-Speech audio so they are generated once and stored forever.
- **G4 — Clean, Unified Contract**: End-to-end type safety with shared Zod schemas between NestJS and React.
- **G5 — Smart Review Scheduling**: Skip or graduate cards automatically using a derived knowledge model, maximizing learning efficiency.

### Non-Goals
- Native app stores (App Store/Play Store) in v1; the API remains token-based and client-agnostic so a native wrapper (React Native) can be developed later.
- Subscriptions, payment gateways, or analytic tools.
- Multi-language support (German to English only).
- Multi-provider credentials (only Google OAuth and Email OTP magic links are supported).

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
*   **On-Demand Enrichment**: Searching an unknown word inserts a stub and triggers a background BullMQ task. The web client polls or listens to SSE, rendering a skeleton shimmer loading state until the word is ready.

### 3.4 Spaced Repetition (FSRS)
*   **FSRS Integration**: Standard scheduling via `ts-fsrs`.
*   **Review Session**: Standard flashcard layout with options to flip, review translation/usage, and rate recall (Again, Hard, Good, Easy).
*   **Listening Mode**: Audio-only prompts where the learner hears the TTS audio first, guesses, and reveals the word.
*   **Offline Support**: Syncs reviews made while offline. The API reconciles FSRS scheduling sequentially using timestamps from `ReviewLog`.

### 3.5 Spaced Repetition vs. Knowledge Model
A custom knowledge model sits above FSRS to prevent users from grinding through words they already know:
*   **Score Prior**: Estimates starting scores using CEFR levels and frequency ranks from `de_full.txt`.
*   **Auto-Graduation**: Consistently fast, positive answers automatically graduate cards as "known".
*   **Undo Action**: A dedicated "Known Words" interface lists auto-graduated vocabulary, allowing single-click reversal.

---

## 4. Technical Architecture

### Directory Layout
Vocabahn is structured as a `pnpm` monorepo:
```
vocabahn/
├── apps/
│   ├── api/        # NestJS API Server (endpoints, DB migrations, seeders)
│   ├── worker/     # BullMQ Worker (AI, TTS, and Image enrichment)
│   └── web/        # React 19 Frontend + Vite
├── packages/
│   └── shared/     # Zod schemas, TypeScript types, API contracts
└── docs/           # Documentation
```

### Stack Components
*   **Backend**: NestJS 11, Prisma ORM, PostgreSQL.
*   **Task Queue**: Redis and BullMQ.
*   **Frontend**: React 19, Tailwind CSS 4, shadcn/ui (Radix primitives), GSAP.
*   **Data Sources**:
    *   `kaikki.org-dictionary-German-words.jsonl` (~938 MB German Wiktionary dump).
    *   `de_full.txt` (17 MB German corpus frequency list).
*   **Third-Party APIs**:
    *   Google Gemini (`gemini-flash-lite-latest` or `gemini-2.0-flash` for re-enrichment).
    *   Google Cloud Text-to-Speech (cached locally as `.mp3`).
    *   Unsplash API (cached images with attribution).
*   **Admin Panel**: Standalone AdminJS server.

---

## 5. Security Architecture
*   **Rate Limiting**: Enforced via `@nestjs/throttler` with specific rules for auth and API-intensive endpoints.
*   **Captcha Validation**: Google reCAPTCHA protects contact forms and high-cost routes.
*   **HTTP Hardening**: Helmet configuration, strict CORS allowlist, and secure HTTP-only cookies.
*   **Database Safety**: Prisma parameters prevent SQL injection.
*   **Container Security**: Non-root container execution, isolated Docker networks, and encrypted backups.
