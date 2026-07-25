# Vocabahn

German vocabulary learning app: a shared AI-enriched dictionary, FSRS spaced-repetition flashcards, and curated courses — built as a mobile-first PWA.

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

Detailed documentation files have been consolidated into the `docs/` folder, structured around our AI-first approach:

*   **[Product Requirements (PRD)](docs/prd.md)**: Product goals, detailed feature specifications, user stories, and target stack decisions.
*   **[AI & Knowledge Architecture](docs/ai_architecture.md)**: How the custom knowledge model interacts with FSRS flashcards and LLM-driven enrichment.
*   **[Model Context Protocol (MCP)](docs/mcp_integration.md)**: Specifications for how external AI agents and assistants integrate with Vocabahn.
*   **[Developer & Contributor Guide](docs/development.md)**: Local setup workflows, diagnostic tools, and database seeding commands.
*   **[Operations & Infrastructure Guide](docs/operations.md)**: Server deployment guidelines, environment variables, TLS, and monitoring.
*   **[Database Export & Import Guide](docs/database_export_import.md)**: Step-by-step procedures for dumping, transferring, and restoring PostgreSQL data across systems.
*   **[Project Backlog & Roadmap](docs/backlog.md)**: Feature backlog, task roadmap, UI stories, and completed delivery history.
*   **[Changelog](docs/changelog.md)**: Detailed historical versioning details.

> **AI Assistants**: Please refer to `llms.txt` and `.agents/AGENTS.md` for context and codebase rules before writing code or running commands.
