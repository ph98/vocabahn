# PRD — Planner, Goal & Today's Plan (Phase C)

**Status:** Draft for review
**Created:** 2026-07-06
**Depends on:** Evidence Ledger, Production Drill, Micro-Story PRDs ·
ADR 0002 · **Vocabulary:** `/CONTEXT.md`
**Parent plan:** [ai_first_replan.md](../ai_first_replan.md)

## 1. Summary

A deterministic planner core composes each day's session from the available
Experiences; an LLM surface makes it conversational: the learner states a
Goal in plain language, sees the plan explained in plain language, and
renegotiates it in plain language from a "Today's Plan" dashboard card.
Onboarding is extended to collect the inputs the Planner needs.

## 2. Goals

- **G1** — The learner always knows *what* to do today and *why*, in one
  glance.
- **G2** — Plans adapt to goal, due load, and available time without any
  manual deck management.
- **G3** — Same knowledge state + same inputs ⇒ same plan (deterministic,
  testable core per ADR 0002).
- **G4** — Cold start: a brand-new user gets a working plan and a readable
  story on day one.

### Non-Goals
- No open-ended tutor chat (v2 conversation Experience).
- No LLM inside session-composition arithmetic.
- No changes to decks/courses in v1 (they persist as word sources; full
  reconciliation with the Plan is a later decision — see open questions).

## 3. Functional Requirements

### 3.1 Planner core
- Pure function. Inputs: due-item count and urgency distribution, frontier
  size, learner time budget, mix weights, graduation-pipeline state (words
  awaiting strong evidence). Output: ordered session composition — e.g.
  one Micro-Story (with its Target Word set), a Production Drill block
  (which words), a residual classic-card block.
- Guarantees: due items are serviced before frontier expansion; words
  eligible for graduation get drills; session fits the time budget.
- Composition rules are code, unit-tested, with tunable weights.

### 3.2 Goal
- Captured as free text at onboarding (editable later in Profile); parsed
  via the LLM Gateway into structured parameters: target CEFR level,
  deadline (absolute date), optional track (e.g. Goethe exam vocabulary),
  weekly time expectation.
- Parse results are confirmed with the user before saving ("So: B2 by
  March, ~15 min/day — right?").

### 3.3 Today's Plan card
- Leads the dashboard. Shows: today's composition with time estimates,
  progress through it, and a one-line LLM explanation of *why* this plan
  ("Story-heavy today — 23 words due, and *ablehnen* is ready to
  graduate").
- **Negotiation**: quick chips ("I have 5 min", "More stories", "Skip
  drills today") and a free-text line. Both translate to new planner-core
  inputs; the core re-runs; the card updates with a revised explanation.
- Explanations are generated from the plan's actual inputs (a template-
  grounded prompt), so the narration can never contradict the plan.
- Fully accessible: chips and free text keyboard-reachable, updates
  announced via live region.

### 3.4 Onboarding additions
- Ordered flow: declared CEFR level (exists) → Goal free text → interest
  areas (chips + free text) → **Calibration Quiz**.
- Calibration Quiz: adaptive sampling across frequency bands (~2–3 min),
  self-report known/unknown with a small number of spot-check recall
  questions; output seeds Assumed Known state as `prior-assumption` ledger
  entries (never FSRS reviews).
- Skippable; skipping falls back to level+frequency priors alone.

### 3.5 Pre-generation hook
- On session completion, the planner core runs against forecasted next-day
  state and hands the story slot to the Micro-Story pre-generation job.

## 4. Acceptance Criteria

1. Given a fixed knowledge state, time budget, and weights, the planner
   returns an identical plan on every run (property test).
2. "I have 5 minutes" via chip or free text produces a plan fitting 5
   minutes, explained accordingly.
3. A malformed/unparseable goal falls back to a guided structured form —
   never a silent failure.
4. A fresh user completing onboarding (with quiz) lands on a dashboard with
   a plan and a ready story on day one.
5. Skipping the quiz still yields a valid plan from declared-level priors.
6. Plan explanations always match the actual composition (asserted by
   grounding the prompt in the plan object, spot-checked in tests).

## 5. Open Questions
- Calibration Quiz sampling algorithm (per-band binary search vs adaptive
  staircase) and spot-check density.
- How courses/decks surface inside the Plan (as tracks feeding frontier
  selection is the working assumption).
- Whether the Planner should propose goal revisions when progress trends
  off-deadline (nice v1.x follow-up).
