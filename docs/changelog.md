# Changelog

All notable changes to Vocabahn are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
New entries are prepended automatically by `scripts/release.sh`.

---

## [1.0.0] — 2026-06-16

### Features
- Phase 0: Monorepo scaffold, Docker Compose, Postgres + Redis, Prisma schema, Google OAuth, CI
- Phase 1: Wiktextract + frequency list ingestion, dictionary search, entry page, BullMQ enrichment queue, AdminJS
- Phase 2: Courses, FSRS-based spaced-repetition reviews, swipe-to-rate gestures, GSAP card motion
- Phase 3: Dashboard — streaks, activity heatmap, stats, course progress
- Phase 4: Offline PWA review queue, knowledge model with auto-graduation, known-words list
- Phase 5: Dark/light theme, safe-area insets, pull-to-refresh, edge-swipe back, swipe affordance + velocity physics, touch target fixes, Lighthouse ≥ 95
- Deployment: one-step deploy script, production Docker Compose, nginx TLS config
- Backup: multilayer pg_dump + Redis RDB + optional S3 offsite, restore script
