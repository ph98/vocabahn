Epic 1: Design System & Theming Architecture
Story 1.1: Semantic Color System & Smooth Dark Mode
As a user
I want a seamless and visually pleasing transition between light and dark modes
So that my eyes aren't strained when the UI updates, and the application feels highly polished.
Acceptance Criteria:

Replace all hardcoded hex color values in components with a semantic, HSL-based CSS variable system (e.g., var(--bg-primary), var(--text-muted)).

Implement a global CSS transition (transition: background-color 0.3s ease-in-out, color 0.3s ease-in-out;) on the root or body element.

Ensure the light theme utilizes off-white backgrounds with pure white cards and cool-grey borders.

Ensure the dark theme utilizes deep slate/OLED black backgrounds with elevated dark cards.

Verify that all text and background color pairings in both themes meet WCAG AA contrast ratios.

Story 1.2: Advanced Typography System
As a language learner
I want a clear visual distinction between the application interface and the actual German vocabulary
So that I can easily parse the layout and focus my cognitive energy on the words I am trying to memorize.
Acceptance Criteria:

Implement a clean, geometric sans-serif font (e.g., Plus Jakarta Sans, Satoshi) globally for all UI elements, buttons, and headings.

Implement a high-legibility, classic serif font (e.g., Merriweather, Playfair Display) exclusively for the German vocabulary words within the dictionary entries.

Story 1.3: Depth and Shadow Refinement
As a user
I want the interface to have a realistic sense of depth
So that interactive elements and floating cards feel distinct from the background layer.
Acceptance Criteria:

Remove standard, single-layer box-shadow implementations.

Implement a multi-layered, diffuse shadow system (e.g., combining multiple low-opacity shadows) on all cards and dropdowns to create realistic, premium elevation.

Epic 2: Core UX & Dictionary Interactions
Story 2.1: Dictionary Skeleton Loading State
As a user
I want to see a structural placeholder while a dictionary word is being fetched
So that the application feels performant and the layout does not jump or flash error-like colors when loading.
Acceptance Criteria:

Remove the existing solid-color loading progress bar from the dictionary entry view.

Implement a Skeleton UI that mirrors the layout of an incoming dictionary entry (title block, grammar tags, definition lines).

Apply a subtle shimmer animation to the skeleton using CSS transform and opacity to ensure a locked 60fps animation on the GPU.

Story 2.2: Gender-Coded Noun Articles
As a German learner
I want immediate visual cues for noun genders
So that I can build stronger associations and memorize "der, die, das" more effectively.
Acceptance Criteria:

Apply specific, accessible color coding to the definite articles preceding nouns in the dictionary view.

Use established cognitive hooks for the coloring (e.g., a specific blue for der, pink/red for die, green for das).

Ensure the colors are subtle enough to remain elegant but distinct enough to act as an immediate visual aid.

Story 2.3: Immersive Search Experience
As a user
I want the search input to command my full focus when activated
So that I can type and review my queries without visual distractions from the dashboard behind it.
Acceptance Criteria:

Increase the default padding and font size of the main search input.

When the search input is in focus, apply a localized backdrop blur and a slight dimming overlay to the surrounding application background.

Story 2.4: Contextual Example Formatting
As a user
I want usage examples to be visually separated from the core definitions
So that I can quickly scan the entry for context without reading everything.
Acceptance Criteria:

Place "HOW TO USE" and "EXAMPLES" blocks within soft, rounded inset containers.

Apply a distinct, muted background shade to these containers to clearly separate them from the primary definition text.

Epic 3: Dashboard & Layout Modernization
Story 3.1: Bento Box Dashboard Architecture
As a user
I want my learning statistics presented in a tight, cohesive grid
So that I can quickly scan my daily progress and due reviews at a glance.
Acceptance Criteria:

Refactor the standalone floating statistic pills ("Due Today", "Reviewed", "Known", "Learning", "New") into an asymmetrical, tightly packed "Bento Box" CSS grid.

Apply uniform border radii to all grid items.

Implement subtle internal borders or very faint internal gradients to define the tiles instead of heavy drop shadows.

Story 3.2: Activity Heatmap Enhancements
As a user
I want my learning streak and activity history to look visually rewarding
So that I am highly motivated to log in and study every day.
Acceptance Criteria:

Add a subtle inner shadow to the empty/inactive squares on the activity heatmap.

Apply a vibrant, glowing gradient (e.g., scaling from light blue to primary violet based on intensity) to the active squares.

Story 3.3: Animated Course Progress Indicators
As a user
I want to see my course level progress clearly and dynamically
So that I know exactly how close I am to reaching the next CEFR level.
Acceptance Criteria:

Increase the border-radius of the CEFR progress bars so the terminals are completely rounded.

Add a continuous, subtle shimmer or sweeping gradient animation strictly to the filled portion of the active progress bar.

Story 3.4: Dynamic Landing Page Hook
As a prospective user
I want the landing page to look modern and captivating
So that I immediately trust the quality and technical foundation of the platform.
Acceptance Criteria:

Refactor the centered, stacked layout into an asymmetrical or split-screen hero section.

Implement a soft, animated mesh gradient or a slow-moving abstract background element behind the primary copy.

Convert the feature list into overlapping bento-box cards with dynamic hover states (e.g., subtle lift and border glow on hover).