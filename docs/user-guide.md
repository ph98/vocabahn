# Vocabahn User Guide & Learning System Manual

Welcome to Vocabahn — a modern, intelligent German vocabulary learning system built on Spaced Repetition (FSRS), CEFR framework alignment, and AI context enrichment.

---

## 1. The CEFR Framework

Vocabahn aligns vocabulary and course content with the **Common European Framework of Reference for Languages (CEFR)**.

### Sub-Levels Breakdown
Vocabahn uses 12 precise half sub-levels (`A1.1` to `C2.2`), matching Goethe-Institut and Profile Deutsch standards:

| CEFR Level | Sub-Levels | Expected Vocabulary Size | Capability Milestone |
| :--- | :--- | :--- | :--- |
| **A1** (Beginner) | `A1.1`, `A1.2` | 500 – 1,000 words | Basic greetings, simple daily needs, introduce self. |
| **A2** (Elementary) | `A2.1`, `A2.2` | 1,000 – 2,000 words | Describe routine tasks, shopping, environment. |
| **A3/B1** (Intermediate) | `B1.1`, `B1.2` | 2,000 – 4,000 words | Express opinions, travel independently, handle work conversations. |
| **B2** (Vantage) | `B2.1`, `B2.2` | 4,000 – 8,000 words | Understand complex technical texts, speak fluently with native speakers. |
| **C1** (Effective Operational) | `C1.1`, `C1.2` | 8,000 – 15,000 words | Express ideas spontaneously, produce clear structured texts on complex subjects. |
| **C2** (Mastery) | `C2.1`, `C2.2` | 15,000+ words | Effortlessly understand virtually everything read or heard. |

---

## 2. Spaced Repetition (FSRS) Demystified

Vocabahn uses the **Free Spaced Repetition Scheduler (FSRS)** algorithm to schedule reviews optimal for long-term retention.

### Key Metrics
- **Stability ($S$)**: The estimated number of days it takes for retention probability to drop to 90%. Higher stability means longer review intervals.
- **Difficulty ($D$)**: The inherent difficulty of a word for you (on a scale of 1 to 10).
- **Retrievability ($R$)**: The real-time probability (0%–100%) that you will remember the word right now.

### Rating Buttons
During review sessions, rate your memory recall:
- **Again (1)**: Total lapse / forgotten. Pushes the card back into short-term relearning.
- **Hard (2)**: Remembered with significant effort. Increases interval slightly.
- **Good (3)**: Successful recall with normal effort. Standard optimal interval increase.
- **Easy (4)**: Perfect, instantaneous recall. Significantly boosts stability and interval.

---

## 3. Knowledge States & Calibration

Vocabahn tracks word mastery through a multi-tier Knowledge Model:

- **Assumed / Prior Known**: High-frequency filler words below your calibrated CEFR frontier (e.g. basic articles like *das*, *und* when calibrated at B1).
- **Evidenced Known**: Words proven through active study sessions and cross-session FSRS ratings.
- **Auto Known**: Words automatically graduated once their knowledge score crosses the graduation threshold (`0.85`).
- **Manual Known**: Words you explicitly marked as known on the Known Words page.

### CEFR Calibration
You can set your self-assessed level in your **Profile settings**. Setting your level seeds new card ordering and auto-graduates basic filler words below your frontier.

---

## 4. Study Modes & Features

- **Flashcards**: Interactive dual-sided cards with AI-generated example sentences, audio pronunciation, and grammar tags.
- **Writing Practice**: Active production mode requiring typing correct German spellings.
- **AI Context Sentences**: Gemini-powered natural sentences showcasing real-world usage.
- **Offline Mode**: Full offline review queue support with local caching and JSON dictionary export.

---

## 5. Progress & Analytics

- **Day Streak**: Consecutive days with at least one completed review session.
- **Activity Heatmap**: Annual visual record of review frequency and card volume.
- **Retention Rate**: Percentage of successful ("Good" or "Easy") reviews over time.
