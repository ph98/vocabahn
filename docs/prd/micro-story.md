# PRD — Micro-Story: Comprehensible Input (Phase B)

**Status:** Draft for review
**Created:** 2026-07-06
**Depends on:** Evidence Ledger PRD · **Vocabulary:** `/CONTEXT.md`
**Parent plan:** [ai_first_replan.md](../ai_first_replan.md)

## 1. Summary

Generated short German texts calibrated to the learner's known vocabulary
(~95% known words), weaving Due and Frontier words in as Target Words.
Reading with Tap-to-Reveal plus a closing Micro-Check turns comprehensible
input into honest review. This is the flagship "AI-first" Experience.

## 2. Goals

- **G1** — Every learner can read a personally comprehensible German text
  daily, in their interest areas, that simultaneously services their due
  reviews.
- **G2** — Evidence integrity: reading produces no fake positive signals.
- **G3** — The story is ready instantly when the learner arrives
  (pre-generated).

### Non-Goals
- No audio narration in v1 (TTS story audio is a natural v1.x follow-up).
- No arbitrary text import (v2 — requires standalone lemmatizer).
- No comprehension grading of the learner's summary or free response.

## 3. Functional Requirements

### 3.1 Generation
- Input: learner's usable vocabulary (Known + Assumed Known), a set of Due
  words and Frontier words to weave in, interest topics, CEFR level, target
  length (~90–150 words for a default session).
- Output (strict structured format): story text, title, per-Target-Word
  spans `{ surfaceForm, offset, lemma, knowledgeItemId }`, a gloss per
  Target Word in context, and 2–4 Micro-Check questions.
- **Span validation**: every claimed span must literally match the text at
  its offset; stories failing validation are regenerated (max 2 retries)
  before falling back to a smaller Target Word set.
- Vocabulary calibration is instruction-based (generate within the known
  set), not token-verified; Tap-to-Reveal telemetry is the corrective loop.
- Generated via the LLM Gateway with the top-tier story model.

### 3.2 Pre-generation
- After a session completes (and nightly as a safety net), a BullMQ job runs
  the Planner's forecast for the next session and generates its story.
- If the plan drifts (e.g. user studied elsewhere, new words due), the story
  regenerates on demand with the existing SSE-skeleton loading pattern.

### 3.3 Reader UI
- Clean typographic reading view consistent with the design system;
  mobile-first.
- **Tap-to-Reveal** on every word: Target Words show their prepared
  contextual gloss; background words route through dictionary lookup with
  existing form-of resolution (stub + enrichment if unknown).
- Tapping a Target Word emits a `story-tap` (negative) Evidence Event.
  Background-word taps emit nothing.
- Reduced-motion, screen-reader, and keyboard access per the app's WCAG 2.2
  AA baseline; taps have non-touch equivalents.

### 3.4 Micro-Check
- Appears when the learner finishes the story; 2–4 one-tap questions
  covering the Target Words that appeared (meaning-in-context multiple
  choice and/or one-line cloze).
- Each answer emits a `recall-check` Evidence Event (medium strength).
- A story session without a completed Micro-Check produces only whatever
  tap (negative) evidence occurred — never positive evidence.

## 4. Acceptance Criteria

1. A generated story passes span validation and renders with all Target
   Words tappable and glossed.
2. Tapping a Target Word records negative evidence; finishing the story
   without taps records nothing until the Micro-Check.
3. Micro-Check answers update schedules via the Evidence Policy (one update
   per word per session, failure-dominant with any earlier tap).
4. Opening the app after a completed prior session shows the story with no
   generation wait (pre-generated path).
5. A background-word tap on an inflected form ("Hunde") resolves to its
   lemma entry via existing dictionary behavior.
6. Story language stays within the learner's usable vocabulary well enough
   that median Target-Word density ≈ the requested Due/Frontier set and
   learner tap rate on background words stays low (monitor; no hard v1 gate).

## 5. Open Questions
- Micro-Check format mix (MC vs cloze) and whether distractors are generated
  at story time or check time.
- Story length/format variety (dialogue, news brief, narrative) — Planner
  topic-selection concern.
- When to introduce story TTS audio (reuses existing Cloud TTS caching).
