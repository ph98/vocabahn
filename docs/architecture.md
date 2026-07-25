# Architecture Specification

**Status:** Approved Architectural Standard  
**Latest Update:** 2026-07-25  

Vocabahn is engineered around an **AI-first knowledge architecture**. Rather than treating language learning as a static flashcard deck, Vocabahn orchestrates a dynamic interplay between a deterministic spaced-repetition engine (FSRS), an immutable evidence ledger, an adaptive session planner, and Large Language Models (LLMs). This document details the system design, core knowledge loop, LLM gateway, and Model Context Protocol (MCP) integration.

---

## 1. Vision & Architectural Inversion

### 1.1 Core Loop & Principles
Vocabahn's core differentiator over generic AI language tutors is its per-user, per-word **Knowledge Model** paired with a forgetting forecast. The application operates across three major subsystems:
1. **The Shared Dictionary**: Provides a canonical, community-wide source of truth for German vocabulary, enriched once via LLMs and cached centrally.
2. **The Knowledge Model & Evidence Ledger**: Maintains the ground-truth state of what a learner knows, receiving evidence from all experiences and estimating forgetting intervals.
3. **The LLM Gateway & Experiences**: Generates personalized comprehensible input (Micro-Stories), grades typed exercises (Production Drills), and populates dictionary entries.

### 1.2 Knowledge Model as Architectural Hub (ADR 0001)
In legacy flashcard architectures, cards own scheduling state directly. Vocabahn inverts this structure:
* **The Knowledge Model is the Hub**: Every user interaction (card flip, story reading, drill response, calibration quiz) emits an **Evidence Event** into an append-only ledger.
* **Experiences are Producers**: Learning activities produce evidence; they never mutate FSRS scheduling state directly.
* **FSRS is a Consumer**: FSRS standard algorithms (`ts-fsrs`) consume aggregated evidence to compute review intervals.
* **Evolution, Not Rewrite**: Existing card review history is backfilled into the ledger as `card-self-grade` events, ensuring 100% backward compatibility and ground-truth continuity.

---

## 2. Knowledge Model & Evidence Architecture

### 2.1 Domain Entities
* **Knowledge Item**: A unit of tracked learning (in v1: a German word sense; in v2: expanded to Grammar Concepts).
* **Evidence Event**: An immutable record of an observed learning signal containing: `userId`, `knowledgeItemId`, `experienceType`, `evidenceKind`, `outcome`, `latencyMs`, `sessionId`, and `timestamp`.
* **Assumed Known**: Provisional state seeded by priors (declared CEFR level, corpus frequency, calibration quiz). Usable by generators as known vocabulary; any failure signal (e.g. story tap) demotes the item into active study.
* **Known Word**: Evidenced mastery. Achieved only when strong positive evidence criteria are satisfied.

### 2.2 Evidence Kinds & Strengths
| Kind | Source Experience | Strength | Policy Impact |
| :--- | :--- | :--- | :--- |
| `production-graded` | Production Drill verdict | **Strong** | Capable of graduating items to Known |
| `recall-check` | Micro-Check recall question | **Medium** | Schedule maintenance |
| `card-self-grade` | Classic card flip rating | **Medium** (Self-reported) | Schedule maintenance |
| `story-tap` | Tap-to-Reveal in Micro-Story | **Negative only** | Forces session failure on target item |
| `prior-assumption` | Calibration Quiz / Onboarding | **Prior** | Audit record; does not update FSRS |

### 2.3 Evidence Policy Module
The Evidence Policy is a pure, unit-tested module that aggregates raw events **per Knowledge Item per Session**:
1. **Failure Dominance**: Any negative event in a session (e.g. a story tap) caps the item's session rating at `Again`, regardless of subsequent positive signals in that same session.
2. **Graduation Guard**: Auto-Graduation to `Known` strictly requires at least one `production-graded` success event; passive or medium evidence alone can never graduate a word.
3. **Session Boundaries**: Sessions close automatically after 30 minutes of inactivity.

---

## 3. LLM Enrichment & Gateway Architecture

### 3.1 Shared Dictionary & Async Enrichment
Every German word searched by a learner is enriched exactly once across the platform:
1. **Lookup**: User queries a term. If present, the enriched JSON payload returns immediately.
2. **Stub Creation**: If absent, a "stub" entry is created with status `PENDING`.
3. **Background Queue**: A BullMQ worker receives an enrichment job and calls Google Gemini via the LLM Gateway.
4. **SSE Streaming**: Web clients subscribe to Server-Sent Events (SSE), smoothly transitioning UI skeleton shimmers to enriched cards upon job completion.

### 3.2 Unified LLM Gateway
All model invocations route through a single provider-agnostic LLM Gateway module:
* **Task-Shaped Interface**: Exposes strongly typed methods (`enrichWord`, `gradeProductionDrill`, `generateMicroStory`, `parseUserGoal`, `explainPlan`).
* **Structured Output Validation**: Enforces Zod schema compliance on all model outputs. Malformed outputs trigger automated retries (max 2) before safe fallback execution.
* **Workload-Tiered Serving**:
  * *Fast/Light Models* (`gemini-flash-lite-latest`): Drill grading, goal parsing, plan explanations.
  * *Top-Tier Models* (`gemini-2.0-flash`): Micro-story generation and deep dictionary re-enrichment.

---

## 4. Deterministic Planner & User Surface (ADR 0002)

### 4.1 Planner Core
The Planner composes each daily session from available Experiences.
* **Pure Function Arithmetic**: Takes due-item counts, frontier size, learner time budget, and mix weights as inputs; outputs an ordered session composition.
* **Deterministic Core**: Given identical knowledge states and inputs, the planner produces identical compositions on every run.
* **Guarantees**: Servicing due items takes precedence over frontier expansion; words nearing graduation receive production drills; session total estimated time fits user budget.

### 4.2 Conversational LLM Surface
LLMs wrap the deterministic core at the user boundaries:
* **Goal Parsing**: Translates free-text objectives ("pass Goethe B1 by March") into structured parameters (target level, target date, weekly time budget).
* **Plan Explanation**: Generates clear, template-grounded one-line explanations ("Story-heavy today: 18 words due, and *ablehnen* is ready to graduate").
* **Negotiation**: User inputs via chips ("I have 5 min") or free text re-parameterize the planner core, instantly re-running composition arithmetic.

---

## 5. Model Context Protocol (MCP) Integration

### 5.1 Overview & Vision
Vocabahn natively supports the **Model Context Protocol (MCP)**, allowing external AI assistants (e.g. Claude Desktop, Cursor, local agents) to securely query and interact with a learner's Vocabahn dataset.

### 5.2 Standalone MCP Server Architecture
Exposed via a standalone server interface (`apps/mcp-server`) connecting to the NestJS API:
* **Exposed MCP Tools**:
  * `vocabahn_lookup_word(word: string)`: Fetches enriched dictionary definitions and usage examples.
  * `vocabahn_add_flashcard(word: string)`: Adds a target word to the learner's study queue.
  * `vocabahn_get_stats()`: Queries study streak, reviewed item counts, and current CEFR level progress.
* **Exposed MCP Resources**:
  * `vocabahn://user/deck/active`: Live feed of the active review queue.
  * `vocabahn://system/dictionary/recent`: Feed of recently enriched community terms.
* **Security & Auth**: Authenticated via scoped Personal Access Tokens (PATs) generated in the web UI.

---

## 6. Phasing & Implementation Roadmap

```
Phase A: Foundation ──→ Phase B: Experiences ──→ Phase C: Planner ──→ Phase D: v2 Evolution
(Ledger & Policy)       (Stories & Drills)      (Goal & Today's Plan) (Conversation & MCP)
```

- **Phase A — Foundation**: Evidence ledger schema, Evidence Policy module, FSRS review log backfill migration, LLM Gateway integration.
- **Phase B — Experiences**: Production Drill grading endpoint + UI; Micro-Story generation with Target-Word span validation, pre-generation BullMQ job, reader UI with Tap-to-Reveal, and Micro-Check UI.
- **Phase C — Planner & Surface**: Goal & Plan entities, deterministic planner core, "Today's Plan" dashboard card, onboarding additions (Calibration Quiz).
- **Phase D — v2 Evolution**: Vocab-constrained dialogue experience, Grammar Concepts as Knowledge Items, standalone lemmatizer text import, production MCP server.

---

## 7. Architecture Decisions of Record (ADRs)

Detailed decision records are maintained under [`docs/adr/`](./adr/):
- **[ADR 0001: Knowledge Model as Architectural Hub](./adr/0001-knowledge-model-as-hub.md)**
- **[ADR 0002: Deterministic Planner Core with LLM Surface](./adr/0002-deterministic-planner-llm-surface.md)**
