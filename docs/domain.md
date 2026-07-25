# Vocabahn — Ubiquitous Language & Domain Glossary

This document serves as the canonical domain glossary for Vocabahn. Terms defined here are authoritative across code, documentation, and architecture.

---

## 1. Core Model

- **Knowledge Model** — The per-user ledger of what the learner knows per Knowledge Item, with a confidence and forgetting forecast. Serves as the architectural hub consuming Evidence Events from every Experience.
- **Knowledge Item** — A discrete unit of tracked knowledge (word sense in v1; Grammar Concept in v2).
- **Evidence Event** — An immutable observation of demonstrated (or failed) knowledge of a Knowledge Item, emitted by any Experience.
- **Evidence Policy** — The single module that aggregates a session's Evidence Events per Knowledge Item into at most one scheduling update. Failure dominates within a session; weak evidence maintains scheduling but cannot graduate an item to Known.
- **Session** — A continuous study sitting; the aggregation window for the Evidence Policy (closed after 30 min of inactivity).
- **Experience** — Any learner-facing activity producing Evidence Events: card review, Micro-Story reading, Production Drill, cloze exercise, or dialogue.
- **Learning Plan** — The per-user, goal-directed composition of Experiences over time (e.g. 1 story + 1 drill block + residual cards).
- **Planner** — The agent that composes and revises the Learning Plan from the learner's Goal, Knowledge Model state, forgetting forecast, and time budget.
- **Goal** — The learner's declared objective driving the Planner (e.g., "B2 by March", "pass Goethe B1").

---

## 2. Scheduling & Prior Knowledge

- **FSRS** — Free Spaced Repetition Scheduler (`ts-fsrs`). Consumes Evidence Events to estimate when a Knowledge Item will be forgotten.
- **Due** — A Knowledge Item whose forgetting forecast indicates reinforcement is needed now.
- **Auto-Graduation** — The Knowledge Model overriding FSRS to mark an item Known based on strong early evidence (fast, accurate production).
- **Known Word** — A word the Knowledge Model treats as acquired; excluded from active study while remaining tracked.
- **Assumed Known** — A word treated as known based on priors (declared CEFR level, frequency rank, calibration quiz) rather than evidence. Usable in generated input; any failure demotes it into active study.
- **Calibration Quiz** — An onboarding Experience sampling words across frequency bands to seed `Assumed Known` state.
- **Frontier Word** — A word right at the learner's knowledge boundary, eligible for introduction.

---

## 3. Content & Generation

- **Shared Dictionary** — The canonical, community-wide store of German word entries. Centrally cached and enriched.
- **Enrichment** — LLM generation of a dictionary entry's content (definitions, examples, grammar details).
- **Stub** — A dictionary entry created at first lookup, awaiting async enrichment.
- **Comprehensible Input** — Generated reading/listening material calibrated so the learner knows ~95% of words, with Due and Frontier words woven in.
- **Micro-Story** — Short generated text in the learner's interest areas embedding Due/Frontier words, ending with a Micro-Check.
- **Tap-to-Reveal** — In-story gloss lookup. Tapping a Target Word emits negative evidence; not tapping emits no positive evidence.
- **Target Word** — A Due or Frontier word woven into a Micro-Story, annotated with its lemma so evidence binds to the right Knowledge Item.
- **Micro-Check** — Short recall check ending a Micro-Story, providing positive scheduling evidence for Target Words.

---

## 4. Grammar Concepts (v2)

- **Grammar Concept** — A discrete grammar pattern tracked as a Knowledge Item (e.g. dative after "mit", word order with separable verbs).
- **Error Profile** — The learner's recurring grammar error patterns mined from produced language across Experiences.
