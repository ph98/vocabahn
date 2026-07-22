# Vocabahn — Ubiquitous Language

Glossary of domain terms. Terms here are canonical: code, docs, and discussion
should use these words with these meanings. Implementation details do not
belong in this file.

## Core model

- **Knowledge Model** — the per-user ledger of what the learner knows, per
  Knowledge Item, with a confidence/forgetting estimate. The architectural hub
  of the system: it consumes Evidence Events from every Experience and is the
  single source of truth about the learner's state.
- **Knowledge Item** — a unit of knowledge being tracked. Today: a word sense.
  Planned: also a Grammar Concept.
- **Evidence Event** — an observation that a learner demonstrated (or failed to
  demonstrate) knowledge of a Knowledge Item, emitted by any Experience.
  Evidence varies in strength (e.g. producing a word in a sentence is stronger
  than understanding it while reading).
- **Evidence Policy** — the single module that aggregates a session's Evidence
  Events per Knowledge Item into at most one scheduling update. Failure
  dominates success within a session; weak (passive) evidence can maintain a
  schedule but never graduate an item to Known.
- **Session** — one continuous study sitting; the aggregation window for the
  Evidence Policy.
- **Experience** — any learner-facing activity that produces Evidence Events:
  card review, generated story, conversation, cloze exercise, reading an
  imported text. Experiences are pluggable; the Knowledge Model does not know
  which Experience evidence came from, only its strength and outcome.
- **Learning Plan** — the per-user, goal-directed composition of Experiences
  over time (e.g. today's session: one story + a dialogue + residual cards).
  Continuously revised by the Planner; always explainable to the learner.
- **Planner** — the agent that composes and revises the Learning Plan from the
  learner's Goal, Knowledge Model state, forgetting forecast, and time budget.
- **Goal** — the learner's declared objective driving the Planner (e.g. "B2 by
  March", "read news comfortably", "pass Goethe B1").

## Scheduling

- **FSRS** — the spaced-repetition scheduler. One consumer of Evidence Events;
  it estimates when a Knowledge Item will be forgotten.
- **Due** — a Knowledge Item whose forgetting forecast says it needs
  reinforcement now.
- **Auto-Graduation** — the Knowledge Model overriding FSRS to mark an item
  Known early, based on strong early evidence (fast, accurate first encounters).
- **Known Word** — a word the Knowledge Model treats as acquired; excluded from
  active study, still tracked.
- **Assumed Known** — a word treated as known on the basis of priors (declared
  CEFR level, frequency band, calibration quiz, bulk self-marking) rather than
  evidence. Usable by Experiences as known vocabulary, but provisional: any
  failure evidence (e.g. a story tap) demotes it into active study. Distinct
  from evidenced Known.
- **Calibration Quiz** — the onboarding Experience that samples words across
  frequency bands to locate the learner's frontier and seed Assumed Known
  state.
- **Frontier Word** — a word just beyond the learner's current knowledge,
  eligible for introduction (selected by level + frequency priors and the Plan).

## Content

- **Shared Dictionary** — the canonical, community-wide store of German word
  entries. Not per-user.
- **Enrichment** — LLM generation of a dictionary entry's content (definitions,
  examples, grammar details). Happens once per word, on demand.
- **Stub** — a dictionary entry created at first lookup, awaiting Enrichment.
- **Comprehensible Input** — generated reading/listening material calibrated so
  the learner knows ~95% of the words, with Due and Frontier words woven in.
- **Micro-Story** — the primary Comprehensible Input Experience: a short
  generated text in the learner's interest areas embedding Due/Frontier words.
  Always ends with a Micro-Check; reading alone produces no positive evidence.
- **Tap-to-Reveal** — in-story gloss lookup. Tapping a word is negative
  evidence for it; *not* tapping is no evidence at all.
- **Target Word** — a Due or Frontier word deliberately woven into a
  Micro-Story by the generator, annotated with its lemma so evidence binds to
  the right Knowledge Item. Only Target Words carry scheduling evidence;
  taps on background words are ordinary dictionary lookups.
- **Micro-Check** — the short recall check (a few one-tap questions) ending a
  Micro-Story, targeting the Due/Frontier words that appeared. The source of
  positive evidence from reading.

## Grammar (planned)

- **Grammar Concept** — a discrete grammar pattern tracked as a Knowledge Item
  (e.g. dative after "mit", separable-verb word order).
- **Error Profile** — the learner's recurring grammar error patterns, mined
  from produced language across Experiences; consumed by the Planner.
