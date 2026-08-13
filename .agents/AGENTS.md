# AI Developer Guidelines

Welcome to the Vocabahn repository. When working as an AI developer or assistant in this codebase, please adhere to the following rules:

- **Required reading**: `docs/system/README.md` describes what this system
  actually does — topology, data flow, cross-subsystem invariants — and links one
  file per subsystem. Read it before editing code. It is derived from the code, so
  trust it over any other document, and correct it when you change behaviour.
- **Legacy docs are not specifications**: `docs/legacy/prd.md` and
  `docs/legacy/backlog.md` were written ahead of the code and describe features
  that do not exist (evidence ledger, production drills, planner, listening
  mode, a separate `apps/worker`, MCP support). Never implement from them.
  Planned work lives in GitHub issues. Micro-stories now exist, but were built
  from scratch — see `docs/system/stories.md`, not the PRD's version.
- **ADRs are proposals**: `docs/adr/0001` and `0002` are `proposed`, not built.
  Cards + FSRS are the architectural hub today. Micro-stories record a
  comprehension signal (`StoryTarget.understood`) that nothing consumes — it is
  deliberately inert, not the ADR's evidence ledger.
- **Large Dataset Safety**: Never load or print the entirety of the 938 MB `kaikki.org-dictionary-German-words.jsonl` file directly. Read it streaming or parse short samples (e.g. `head -n 5`).
- **Shared Package Contract**: Ensure any changes to API inputs or outputs are reflected in the Zod schemas located in `packages/shared/` before updating endpoints. The web client parses responses through these schemas, so a mismatch fails at the boundary.
- **`ReviewLog` is the source of truth for scheduling**: a card's FSRS columns are
  a recomputable cache, and offline sync replays the full log. Never write FSRS
  state the log cannot reproduce.
- **CEFR is 12 half sub-levels** (`A1.1` … `C2.2`), defined in
  `apps/api/src/knowledge/constants.ts`. Do not treat it as six flat levels.
- **GSAP and Gestures**: Maintain a strict focus on mobile-first interaction. Ensure all swipe gestures have equivalent standard button alternatives, and animations are bypassed if `prefers-reduced-motion` is enabled.
- **Environment Boundaries**: Ensure `.env` and `service-account.json` are excluded from git.

---

## Agent Work Flow

When assigned or starting work on a task, follow this step-by-step lifecycle:

### 1. Select a Single GitHub Issue
- All planned work is tracked via **GitHub issues**, which contain complete, self-contained specifications.
- Pick **one issue** to work on at a time. Do not combine multiple issues into a single task/PR.
- Never use legacy docs (`docs/legacy/`) or proposed ADRs (`docs/adr/`) as specifications.

### 2. Create a Feature/Fix Branch
- Ensure your local `main` branch is up to date with origin.
- Create and checkout a new branch named according to the issue type and number:
  - Bug fixes: `fix/issue-<ID>-<short-description>` (e.g., `fix/issue-42-fsrs-log-replay`)
  - Features: `feat/issue-<ID>-<short-description>` (e.g., `feat/issue-89-cefr-level-badge`)
  - Chores / Refactoring: `chore/issue-<ID>-<short-description>` or `refactor/issue-<ID>-<short-description>`

### 3. Implement & Respect Invariants
- Read `docs/system/README.md` first to understand subsystem topology and invariants.
- Update `packages/shared` Zod schemas first if API inputs/outputs change.
- Keep changes minimal, clean, and directly targeted at solving the issue.

### 4. Local Verification
- Before committing, verify your changes build and pass all existing checks:
  ```bash
  pnpm --filter @vocabahn/api prisma:generate  # if schema updated
  pnpm build
  pnpm lint
  pnpm --filter @vocabahn/web test
  ```

### 5. Create a Pull Request (PR)
- Push your branch to origin: `git push -u origin <branch-name>`.
- Open a Pull Request targeting `main`.
- **Title**: `<type>(<scope>): concise summary (#<ID>)` (e.g. `fix(api): correct FSRS log replay calculation (#42)`).
- **Body**:
  - Link the issue: `Closes #<ID>` (or `Fixes #<ID>`).
  - Provide a clear summary of what was changed and why.
  - Detail the manual and automated verification steps performed.

