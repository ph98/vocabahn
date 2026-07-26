# Vocabahn

German vocabulary learning app: a shared AI-enriched dictionary, FSRS spaced-repetition flashcards, and curated courses — built as a mobile-first PWA with an AI-first knowledge model architecture.

---

## Technical Stack

- **Backend (`apps/api`)** — NestJS 11, Prisma + PostgreSQL, BullMQ + Redis task queue
- **Frontend (`apps/web`)** — React 19, Vite, Tailwind CSS 4, TanStack Query, GSAP animations
- **Shared (`packages/shared`)** — Zod schemas & types: the single source of the API contract

---

## Quick Start

### Prerequisites
Make sure you have Node.js $\ge 20$, pnpm $\ge 10$, and Docker installed.

### Setup and Run
```bash
cp .env.example .env          # Copy and configure environment variables
docker compose up -d          # Start Postgres & Redis containers
pnpm install                  # Install all monorepo dependencies
pnpm --filter @vocabahn/api prisma:migrate  # Run database migrations
pnpm dev                      # Spin up backend (3000) and frontend (5173) in watch mode
```

---

## Documentation Index

*   **[System Description](docs/system/README.md)**: What the codebase actually
    does today — topology, data flow, and one file per subsystem, each with its
    known limitations. Start here.
*   **[Developer & Contributor Guide](docs/development.md)**: Local setup workflows, diagnostic tools, and database seeding commands.
*   **[Operations & Infrastructure Guide](docs/operations.md)**: Server deployment guidelines, environment variables, TLS, monitoring, and database export/import procedures.
*   **[Architecture Decisions](docs/adr/)**: Recorded decisions. Both current
    ADRs are `proposed` and describe an architecture that is not built.
*   **[Changelog](docs/changelog.md)**: Detailed historical versioning details.

**Planned work lives in GitHub issues, not in this repository.** There is no
roadmap document. `docs/legacy/` holds the superseded PRD and backlog; they are
retained as raw material for issue triage and are not specifications.

> **AI Assistants**: Read [docs/system/README.md](docs/system/README.md) first,
> then [.agents/AGENTS.md](.agents/AGENTS.md) for codebase rules.
