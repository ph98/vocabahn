# Vocabahn Project TODO List: CEFR Alignment & Smart Knowledge Estimation

> **Goal:** Complete A1–C2 word datasets and implement smart prior-knowledge estimation on user login to prevent spamming learners with vocabulary they already know outside the app.

---

## 📌 Epics Overview

- [ ] **Epic 1: Complete CEFR A1–C2 Vocabulary Dataset**
- [ ] **Epic 2: Onboarding & Prior Knowledge Calibration (Outside Knowledge)**
- [ ] **Epic 3: Smart Knowledge Engine & Anti-Spam Relevancy Filtering**
- [ ] **Epic 4: Personalised Dashboard & Re-calibration UX**

---

## 🎯 Task Breakdown

### 🔹 Epic 1: Complete CEFR A1–C2 Vocabulary Dataset
- [ ] **1.1 Seed A1–C2 Word Lists**
  - Populate complete canonical word lists for all CEFR levels (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`) using `kaikki.org` dictionary and `de_full.txt` frequency ranks.
  - Ensure every word entry includes lemma, part-of-speech (POS), CEFR tag, frequency rank, and English translation stub.
- [ ] **1.2 Monorepo Schema Updates (`packages/shared`)**
  - Update Zod schemas and Prisma models to support explicit CEFR level tagging (`A1`–`C2`) and frequency score priors.
  - Add API endpoints to query vocabulary counts and progression per CEFR level.

---

### 🔹 Epic 2: Onboarding & Prior Knowledge Calibration (Outside Knowledge)
- [ ] **2.1 Onboarding CEFR & Goal Selector UI**
  - Prompt new users on login to select their self-assessed German proficiency (`A1` to `C2`) and primary study goal.
- [ ] **2.2 Adaptive Calibration Quiz**
  - Implement a 2–3 minute diagnostic quiz sampling words across frequency bands and CEFR levels to pinpoint the learner's actual vocabulary frontier.
- [ ] **2.3 Knowledge Ledger Seeding (`Assumed Known`)**
  - Initialize the per-user Knowledge Ledger with `Assumed Known` state for all vocabulary below the user's calibrated frontier.
  - Distinguish between `Assumed Known` (provisional prior) and `Evidenced Known` (proven through practice).
- [ ] **2.4 Bulk Known-Word Refinement UI**
  - Provide a fast tap/select interface allowing users to review, confirm, or bulk-mark familiar words during onboarding or in account settings.

---

### 🔹 Epic 3: Smart Knowledge Engine & Anti-Spam Relevancy Filtering
- [ ] **3.1 Anti-Spam Card Filter**
  - Filter out `Assumed Known` and `Evidenced Known` words from daily card queues, micro-stories, and drills.
  - Ensure the user is only presented with **Frontier Words** (words right at their learning boundary) and actual **Due** items.
- [ ] **3.2 Seamless Self-Healing Demotion**
  - If a user triggers a negative signal (e.g. Tap-to-Reveal in a story or incorrect answer in a drill) on an `Assumed Known` word, immediately demote it to active study without breaking flow.
- [ ] **3.3 FSRS Prior Score Integration**
  - Seed initial FSRS memory parameters based on frequency rank and estimated familiarity so new words aren't over-repeated.

---

### 🔹 Epic 4: Personalised Dashboard & Re-calibration UX
- [ ] **4.1 "Today's Plan" Personalised Feed**
  - Display personalized frontier words and recommended learning activities tailored strictly to the user's estimated proficiency level.
- [ ] **4.2 Knowledge Frontier & Level Progress Visualizer**
  - Render dynamic progress bars showing breakdown across A1–C2 levels, distinguishing between estimated known words and evidenced masteries.
- [ ] **4.3 Re-calibration & Level Reset Options**
  - Allow users to retake the Calibration Quiz or manually adjust their starting CEFR level in settings at any time.

---

## 🧪 Verification & Acceptance Criteria
- [ ] Users signing up with B1 proficiency automatically skip A1 & A2 basic vocabulary.
- [ ] Calibration Quiz correctly shifts user's starting frontier.
- [ ] Tap-to-reveal on assumed known words instantly shifts them into active study queue.
- [ ] Dashboard renders clean A1–C2 breakdown without loading delay.
