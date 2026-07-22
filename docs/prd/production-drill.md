# PRD — Production Drill (Phase B)

**Status:** Draft for review
**Created:** 2026-07-06
**Depends on:** Evidence Ledger PRD · **Vocabulary:** `/CONTEXT.md`
**Parent plan:** [ai_first_replan.md](../ai_first_replan.md)

## 1. Summary

An Experience where the learner *produces* German and an LLM grades it. This
is the system's only source of strong evidence in v1 — the evidence kind that
can graduate a word to Known — and replaces self-grading as the trustworthy
signal in the loop.

## 2. Goals

- **G1** — Learners demonstrate knowledge by production, not self-assessment.
- **G2** — Grading yields a clean, target-word-scoped scheduling signal.
- **G3** — Learners receive coaching-quality feedback on their full sentence
  without that feedback contaminating scheduling.
- **G4** — Interactive feel: verdict visible in ≤ 2 seconds (p90).

### Non-Goals
- No speech input/output (typed only in v1).
- No grammar-concept tracking from drill errors yet (v2 Error Profile).
- No free-form conversation.

## 3. Functional Requirements

### 3.1 Exercise forms
- **Translation**: prompt in EN → type the German word/phrase in context, and
  the reverse direction (DE → EN meaning).
- **Production**: "Write a sentence using *\<word\>*" with the enriched entry's
  sense pinned (the learner is told which meaning is meant).
- The Planner (or, pre-Planner, the review queue) selects which words get
  drills; words nearing graduation are prioritized.

### 3.2 Grading contract
- The LLM Gateway grades with a strict structured verdict:
  `{ verdict: correct | partial | wrong, targetWordOk: boolean,
  feedback: string }`.
- **Scheduling uses only the target-word judgment** — did the learner
  demonstrate knowledge of this word's meaning/usage? Case endings or word
  order elsewhere in the sentence must not lower the verdict.
- `feedback` is coaching on the whole sentence (grammar, register, more
  natural phrasing), shown to the learner, never scheduled.
- Verdict + response latency are emitted as a `production-graded` Evidence
  Event.

### 3.3 UI
- Drill card: prompt, text input, submit; verdict state with clear
  correct/partial/wrong visual language consistent with the design system;
  feedback shown as a distinct "coach's note".
- Keyboard-first (Enter submits); full a11y parity with existing review UI
  (live-region announcements of verdicts).
- German-character helper (ä ö ü ß) accessible from the input on all
  platforms.

### 3.4 Failure handling
- If grading fails or times out (> 5 s), fall back to self-grade for that
  card; the event is recorded as `card-self-grade`, not `production-graded`
  (an ungraded production must never count as strong evidence).

## 4. Acceptance Criteria

1. A sentence with a correct target word but a wrong article elsewhere
   grades `correct` with the article issue mentioned only in feedback.
2. A sentence demonstrating the wrong sense of the word grades `wrong`.
3. Graded verdicts appear as `production-graded` events; fallback path
   produces `card-self-grade` events.
4. A word graduates to Known only after the graduation guard's strong-success
   condition is met via drills.
5. p90 grading latency ≤ 2 s in production configuration.
6. Axe checks pass; verdicts are announced to screen readers.

## 5. Open Questions
- Drill-form mix ratio (translation vs production) — Planner input, tune with
  data.
- Whether `partial` should surface a one-tap "try again" retry within the
  same session (proposal: yes, but the retry emits no additional positive
  evidence — failure-dominance already caps the session).
