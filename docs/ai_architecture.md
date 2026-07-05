# AI & Knowledge Architecture

Vocabahn is designed around an "AI-first" experience. Instead of a static dictionary and simple review queue, the app orchestrates a dynamic interplay between a deterministic spaced-repetition algorithm (FSRS) and probabilistic Large Language Models (LLMs).

## 1. The Core Loop
The primary learning loop involves three systems:
1. **The Shared Dictionary**: Provides the canonical source of truth for words.
2. **The Enrichment Engine (LLMs)**: Populates the dictionary asynchronously.
3. **The Knowledge Model (FSRS + Custom Heuristics)**: Decides *when* and *what* the user should review.

## 2. LLM Enrichment Engine
Every German word looked up by a user is enriched exactly once. We use Google Gemini to generate:
- Contextual definitions and translations.
- Example sentences with the target word highlighted.
- Grammatical details (Part of Speech, Gender, Plural forms).
- Emoji representations.

**Flow:**
1. User searches a word.
2. If absent, a "stub" is created.
3. A background task (BullMQ + Redis) asks the LLM to generate the full JSON payload.
4. The client UI subscribes (via SSE) to the task and smoothly transitions from a skeleton state to the fully enriched card.

## 3. FSRS vs. The Knowledge Model
While the Free Spaced Repetition Scheduler (FSRS) is excellent at deciding *when* a card will be forgotten, it assumes the user starts with zero knowledge. Vocabahn uses a higher-level Knowledge Model to preempt this:
- **Prior Estimation**: We estimate a user's starting knowledge using their declared CEFR level and word frequency data.
- **Auto-Graduation**: If the user answers quickly and accurately on their first encounters, the Knowledge Model overrides FSRS and graduates the card to "Known", skipping unnecessary early review steps.

## 4. UI/UX: Reacting to the User
The UI is built to react to user inputs securely and gracefully:
- **Swipe Gestures**: Rating a card triggers instant velocity-aware animations.
- **Micro-interactions**: Revealing AI-generated hints gracefully animates into view without layout shift.
- **Listening Mode**: A purely audio-driven prompt that flips the traditional flashcard paradigm, leveraging Google Cloud TTS before the text is even revealed.
