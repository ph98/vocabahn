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

Detailed documentation files have been consolidated under `docs/`:

*   **[Product Requirements (PRD)](docs/prd.md)**: Product goals, detailed feature specifications, user stories, and target stack decisions.
*   **[AI & Knowledge Architecture](docs/architecture.md)**: Complete system design covering the Knowledge Model hub, FSRS engine, LLM Gateway, and Model Context Protocol (MCP).
*   **[Domain Glossary & Ubiquitous Language](docs/domain.md)**: Canonical terminology definitions across learning state, experiences, and scheduling.
*   **[Developer & Contributor Guide](docs/development.md)**: Local setup workflows, diagnostic tools, and database seeding commands.
*   **[Operations & Infrastructure Guide](docs/operations.md)**: Server deployment guidelines, environment variables, TLS, monitoring, and database export/import procedures.
*   **[Project Backlog & Roadmap](docs/backlog.md)**: Feature backlog, task roadmap, UI stories, and completed delivery history.
*   **[Changelog](docs/changelog.md)**: Detailed historical versioning details.

> **AI Assistants**: Please refer to [docs/llms.txt](docs/llms.txt) and [.agents/AGENTS.md](.agents/AGENTS.md) for context and codebase rules before writing code or running commands.
