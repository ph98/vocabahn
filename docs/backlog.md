# Project Backlog & Roadmap

This document serves as the single source of truth for the Vocabahn roadmap, organizing active epics, detailed UI user stories, and completed development history.

---

## 1. Active Backlog

### CEFR Alignment & Smart Prior Knowledge Estimation
- [ ] **1.1 Complete CEFR A1–C2 Vocabulary Dataset**
  - Populate complete canonical word lists for all CEFR levels (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`) using `kaikki.org` dictionary and `de_full.txt` frequency ranks.
  - Ensure every word entry includes lemma, part-of-speech (POS), CEFR tag, frequency rank, and English translation stub.
  - Update Zod schemas in `packages/shared/` and Prisma models to support explicit CEFR level tagging (`A1`–`C2`) and frequency score priors.
- [ ] **1.2 Onboarding & Prior Knowledge Calibration**
  - Prompt new users on login to select their self-assessed German proficiency (`A1` to `C2`) and primary study goal.
  - Implement an adaptive 2–3 minute diagnostic quiz sampling words across frequency bands to pinpoint the learner's actual vocabulary frontier.
  - Initialize the per-user Knowledge Ledger with `Assumed Known` state for vocabulary below the calibrated frontier.
  - Provide a fast tap/select interface allowing users to review, confirm, or bulk-mark familiar words.
- [ ] **1.3 Smart Knowledge Engine & Anti-Spam Relevancy Filtering**
  - Filter out `Assumed Known` and `Evidenced Known` words from daily card queues, micro-stories, and drills, presenting only **Frontier Words** and **Due** items.
  - Self-healing demotion: if a user triggers a negative signal on an `Assumed Known` word, immediately demote it into active study.
  - Seed initial FSRS memory parameters based on frequency rank and estimated familiarity.
- [ ] **1.4 Personalised Dashboard & Re-calibration UX**
  - Display personalized frontier words and recommended learning activities tailored strictly to estimated proficiency.
  - Render dynamic progress bars showing breakdown across A1–C2 levels, distinguishing between estimated known words and evidenced masteries.
  - Allow users to retake the Calibration Quiz or manually adjust their starting CEFR level in settings at any time.

### Decks & Courses
- [ ] **Seamless Course Overview**: Allow users to browse and view their progress in course structures without requiring an explicit "enrollment" action, leveraging overlap logic.
- [ ] **Unified Library Tab**: Combine decks and courses into a single tab. Support official tracks, community tracks, and custom user-created decks in parallel.
- [ ] **Course Deregistration**: Add a simple mechanism for users to de-enroll or de-register from a selected course track.

### Known Words Management
- [ ] **Heuristic Known-Words Inference**: Implement a smart questionnaire or fast quiz on first launch to map the user's vocabulary priors, automatically marking lower-level words as known.
- [ ] **Related Words Suggestion**: Offer a list of related vocabulary recommendations in the "Known Words" section to allow users to bulk-select hundreds of words in a few taps.

### User Interface & Customizations
- [ ] **Logo Header Animation**: Add a subtle, smooth GSAP rotation/movement to the logo icon in the app header to showcase frontend polish.
- [ ] **Vocabahn Branding Polish**: Refine the visual theme to emphasize the link between "Voca" (vocabulary) and "Bahn" (railway/path/road), matching the project's visual layout.
- [ ] **Realistic Login UI**: Refactor the initial login visual styles to feel more immersive and secure.
- [ ] **One-Tap Google SignIn**: Integrate one-tap quick login for returning Google users.
- [ ] **GSAP Micro-Interactions**: Identify transitions, lists, and hover interactions to enrich with GSAP springs and animations.
- [ ] **Streak Activity Date Realism**: Ensure the user streak calendar starts from the current date and shows chronological learning timelines correctly.

---

## 2. UI User Stories & Acceptance Criteria

### Epic 1: Design System & Theming Architecture

#### Story 1.1: Semantic Color System & Smooth Dark Mode
*   **As a** user
*   **I want** a seamless and visually pleasing transition between light and dark modes
*   **So that** my eyes aren't strained when the UI updates, and the application feels highly polished.
*   **Acceptance Criteria**:
    *   Replace all hardcoded hex color values with a semantic HSL-based CSS variable system (e.g. `var(--bg-primary)`, `var(--text-muted)`).
    *   Apply a global transition (`background-color 0.3s ease-in-out`, `color 0.3s ease-in-out`) on the root elements.
    *   *Light Theme*: Off-white page backgrounds with pure white card overlays and cool-grey borders.
    *   *Dark Theme*: OLED-friendly slate backgrounds with elevated card overlays.
    *   Verify that all text contrast pairings meet WCAG AA requirements ($\ge 4.5:1$ ratio).

#### Story 1.2: Advanced Typography System
*   **As a** language learner
*   **I want** a clear visual distinction between the application interface and the actual German vocabulary
*   **So that** I can easily parse the layout and focus my cognitive energy on the words I am trying to memorize.
*   **Acceptance Criteria**:
    *   Use a clean, geometric sans-serif font (e.g. Plus Jakarta Sans or Satoshi) globally for all UI controls, headers, and descriptions.
    *   Use a high-legibility, classic serif font (e.g. Merriweather or Playfair Display) exclusively for the German words inside dictionary pages.

#### Story 1.3: Depth and Shadow Refinement
*   **As a** user
*   **I want** the interface to have a realistic sense of depth
*   **So that** interactive elements and floating cards feel distinct from the background layer.
*   **Acceptance Criteria**:
    *   Remove standard flat box shadows.
    *   Implement a diffuse, multi-layered shadow stack using multiple low-opacity layers to create premium elevations.

### Epic 2: Core UX & Dictionary Interactions

#### Story 2.1: Dictionary Skeleton Loading State
*   **As a** user
*   **I want** to see a structural placeholder while a dictionary word is being fetched
*   **So that** the application feels performant and the layout does not jump when loading.
*   **Acceptance Criteria**:
    *   Remove solid progress loading bars from the dictionary lookup page.
    *   Implement a shimmer Skeleton UI that mirrors the layout of incoming cards (lemma, POS, examples).
    *   Use hardware-accelerated CSS keyframe transforms (`opacity`, `transform`) for the shimmer effect.

#### Story 2.2: Gender-Coded Noun Articles
*   **As a** German learner
*   **I want** immediate visual cues for noun genders
*   **So that** I can build stronger associations and memorize "der, die, das" more effectively.
*   **Acceptance Criteria**:
    *   Color-code definite articles preceding nouns: e.g. blue for *der*, red/pink for *die*, and green for *das*.
    *   Apply subtle, elegant shades that fit dark/light schemes without breaking WCAG contrast rules.

#### Story 2.3: Immersive Search Experience
*   **As a** user
*   **I want** the search input to command my full focus when activated
*   **So that** I can type and review my queries without visual distractions from the dashboard behind it.
*   **Acceptance Criteria**:
    *   Increase padding and base font size on the search input box.
    *   Apply localized backdrop blur (`backdrop-filter: blur()`) and a slight dimming overlay to the surrounding workspace when focused.

#### Story 2.4: Contextual Example Formatting
*   **As a** user
*   **I want** usage examples to be visually separated from the core definitions
*   **So that** I can quickly scan the entry for context without reading everything.
*   **Acceptance Criteria**:
    *   Wrap example sentences and usage boxes inside soft, rounded containers.
    *   Apply a distinct, muted background color to separate them from definitions.

### Epic 3: Dashboard & Layout Modernization

#### Story 3.1: Bento Box Dashboard Architecture
*   **As a** user
*   **I want** my learning statistics presented in a tight, cohesive grid
*   **So that** I can quickly scan my daily progress and due reviews at a glance.
*   **Acceptance Criteria**:
    *   Reorganize statistics (Due, Reviewed, Known, Learning, New) into an asymmetrical, tightly packed Bento Box grid.
    *   Use uniform border-radii and subtle borders instead of heavy box shadows.

#### Story 3.2: Activity Heatmap Enhancements
*   **As a** user
*   **I want** my learning streak and activity history to look visually rewarding
*   **So that** I am highly motivated to log in and study every day.
*   **Acceptance Criteria**:
    *   Add a subtle inner shadow to inactive dates.
    *   Apply a glowing, vibrant gradient (e.g. scaling from cool blue to primary violet based on study intensity) to active days.

#### Story 3.3: Animated Course Progress Indicators
*   **As a** user
*   **I want** to see my course level progress clearly and dynamically
*   **So that** I know exactly how close I am to reaching the next CEFR level.
*   **Acceptance Criteria**:
    *   Apply fully rounded borders to progress bars.
    *   Add a subtle, running shimmer or gradient sweep animation strictly over the filled/active section of the bar.

#### Story 3.4: Dynamic Landing Page Hook
*   **As a** prospective user
*   **I want** the landing page to look modern and captivating
*   **So that** I immediately trust the quality and technical foundation of the platform.
*   **Acceptance Criteria**:
    *   Implement an asymmetrical layout or split-screen hero section.
    *   Create a slowly morphing mesh gradient element behind the main copy.
    *   Convert features lists into hover-sensitive cards that scale and glow.

---

## 3. Completed Development History

The following items represent previously completed requirements and are logged here for archive purposes:
- **Documentation Restructure & Cleanup**: Consolidated fragmented PRD files into `docs/prd.md`, architecture docs into `docs/architecture.md`, operations/export guides into `docs/operations.md`, and domain terms into `docs/domain.md`. Single compose standard `docker-compose.prod.yml`.
- **Server Deployment**: Configured one-step deployment pipelines, production-ready SSL termination, backup policies, and logs.
- **Multilayer Backup System**: Delivered automated pre-deploy dumps, daily chron-scheduled backups, and S3-compatible remote sync tasks.
- **Auto-Versioning**: Configured release tag scripts and a user-visible changelog page.
- **Starter Courses**: Seeded six official CEFR courses (A1-B1) with curriculum-aligned words.
- **E2E Testing Suite**: Developed Playwright tests simulating reviews, dictionary lookups, keyboard navigation, and basic WCAG rules.
- **Custom Decks**: Added Prisma schemas and React routes to allow users to build and publish custom vocabulary lists.
- **Bulk Known Words**: Added endpoints and list selectors to let users check off known words and restore them.
- **Quota Enforcements**: Configured user-tier limits and progress trackers on new word enrichments.
- **Landing Design**: Created SVG vector illustrations and a landing page interface.
- **Offline Pack Download**: Added an option for users to download an offline database pack (top 1,000 words) to work offline.
- **Enhanced Re-Enrichment**: Configured user down-voting queues to trigger higher-tier LLMs for re-evaluating reported terms.
- **Global Themes**: Implemented dark/light theme options.
- **Header and Navigation Refinements**: Added user profile pictures, moved menus, and contained page containers to stop scroll jitter.
