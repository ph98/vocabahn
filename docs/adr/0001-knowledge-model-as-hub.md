# 0001. Knowledge Model as the architectural hub

Date: 2026-07-05
Status: proposed

> Not implemented as of 2026-07-26. Cards + FSRS remain the hub;
> there is no evidence ledger and no planner in the codebase. See
> `docs/system/learning.md` for what actually schedules reviews.

## Context

Vocabahn began as a flashcard app: cards are the central entity, FSRS schedules
them, and AI (LLM enrichment) decorates dictionary entries. The product goal is
now an AI-first learning experience where reading generated stories,
conversing, and doing exercises all teach and all count as review — not just
card flips. With cards at the center, each new AI experience would need its own
ad-hoc way of updating scheduling state, and signals from different activities
could not be combined coherently.

## Decision

Invert the architecture. The per-user **Knowledge Model** becomes the hub: a
ledger of Knowledge Items that consumes **Evidence Events** from any
**Experience** (card review, generated story, conversation, cloze, imported
reading). Experiences are pluggable producers of evidence; they do not write
scheduling state directly. FSRS becomes one consumer of evidence rather than
the owner of the loop. A **Planner** agent composes the learner's sessions from
Experiences, driven by the Knowledge Model and the learner's Goal.

First experiences built on the new spine: generated Micro-Stories
(comprehensible input) and the Planner itself. Conversation practice and the
grammar Error Profile follow without further architectural change.

## Consequences

- New experiences plug in by emitting evidence; no per-experience scheduling
  logic.
- Evidence must carry strength/type so weaker signals (passive understanding)
  and stronger ones (production) can be weighted differently by consumers.
- Card review is demoted from "the product" to one experience among several;
  existing FSRS card state must be migrated to or wrapped by the evidence
  ledger.
- The Knowledge Model's write path becomes the system's critical contract;
  its event schema needs to be versioned and stable.
- More moving parts than the flashcard design; the payoff only materialises if
  at least one non-card experience ships.
