# PRD — Evidence Ledger & Evidence Policy (Phase A)

**Status:** Draft for review
**Created:** 2026-07-06
**Depends on:** ADR 0001, ADR 0002 · **Vocabulary:** `/CONTEXT.md`
**Parent plan:** [ai_first_replan.md](../ai_first_replan.md)

## 1. Summary

Introduce the per-user Evidence Ledger as the system's ground truth for
learning signals, and the Evidence Policy module that converts heterogeneous
evidence into FSRS scheduling updates. This is the foundation every new
Experience (Micro-Story, Production Drill, and later conversation) plugs
into. Also introduces the LLM Gateway that all model calls route through.

## 2. Goals

- **G1** — Every learning signal in the system is recorded as an immutable
  Evidence Event before it affects scheduling.
- **G2** — FSRS remains stock (`ts-fsrs`, unmodified); all judgment about
  how evidence maps to ratings lives in one testable policy module.
- **G3** — Existing review history is preserved: the ledger is complete from
  day one via backfill.
- **G4** — All LLM calls (including existing enrichment) go through one
  provider-agnostic gateway with per-workload model configuration.

### Non-Goals
- No new user-facing UI (the classic review UI keeps working unchanged).
- No changes to FSRS parameters or algorithm.
- No grammar-concept Knowledge Items yet (word senses only).

## 3. Functional Requirements

### 3.1 Evidence Ledger
- An Evidence Event records: user, Knowledge Item (word), source Experience
  type, evidence kind, outcome, response latency where applicable, session
  id, and timestamp.
- Events are append-only. Corrections are new events, never mutations.
- Initial evidence kinds and strengths:

  | Kind | Source | Strength |
  |---|---|---|
  | `production-graded` | Production Drill verdict | strong |
  | `recall-check` | Micro-Check answer | medium |
  | `card-self-grade` | classic card rating | medium (self-reported) |
  | `story-tap` | Tap-to-Reveal on a Target Word | negative only |
  | `prior-assumption` | Calibration Quiz / bulk marking | prior, not evidence |

- `prior-assumption` entries set Assumed Known state; they are stored in the
  ledger for auditability but are never converted into FSRS reviews.

### 3.2 Evidence Policy
- Aggregates events **per Knowledge Item per Session** into at most one FSRS
  rating.
- **Failure dominates**: any negative event in the session for an item caps
  the rating at Again, regardless of later successes in the same session.
- Rating mapping (initial constants, tunable):
  - negative event present → Again
  - `partial` production verdict → Hard
  - success on medium evidence → Good (never Easy)
  - `correct` production verdict → Good; fast + correct → Easy
- **Graduation guard**: Auto-Graduation to Known requires at least one
  strong-kind success event; medium/weak evidence alone can never graduate
  an item.
- The policy is a pure function over a session's events; unit tests cover
  every rule above.

### 3.3 Write-path rerouting
- The existing card-review endpoint stops writing FSRS state directly; it
  emits a `card-self-grade` event and the policy produces the FSRS update.
- Observable behavior of classic reviews must not change for users
  (same ratings → same schedules) except where failure-dominance applies.

### 3.4 Backfill migration
- One-time script converts each historical `ReviewLog` row into a
  `card-self-grade` event with its original timestamp and session grouping.
- Backfill is idempotent and does not alter current FSRS card state.

### 3.5 LLM Gateway
- Single module exposing task-shaped methods (e.g. enrich, grade, generate,
  parse) with structured-output validation.
- Model/provider per workload is configuration, not code.
- Existing enrichment calls are migrated into the gateway with no behavior
  change.

## 4. Acceptance Criteria

1. A classic review round-trips: rating → event in ledger → policy → FSRS
   state identical to the legacy path (verified by regression test).
2. Two successes plus one failure for the same word in one session yield
   exactly one FSRS update, rated Again.
3. A word with only `recall-check` successes never reaches Known.
4. Backfilled ledger row count equals historical `ReviewLog` count; re-running
   backfill adds zero rows.
5. Enrichment still works end-to-end through the gateway (existing SSE flow
   unaffected).

## 5. Open Questions
- Exact latency threshold for the fast-and-correct → Easy mapping (reuse the
  Phase 4 auto-graduation speed heuristic as the starting point).
- Session boundary definition when a user leaves mid-session (proposal:
  30 min inactivity closes a session).
