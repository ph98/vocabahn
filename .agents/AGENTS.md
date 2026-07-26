# AI Developer Guidelines

Welcome to the Vocabahn repository. When working as an AI developer or assistant in this codebase, please adhere to the following rules:

- **Required reading**: `docs/system/README.md` describes what this system
  actually does — topology, data flow, cross-subsystem invariants — and links one
  file per subsystem. Read it before editing code. It is derived from the code, so
  trust it over any other document, and correct it when you change behaviour.
- **Legacy docs are not specifications**: `docs/legacy/prd.md` and
  `docs/legacy/backlog.md` were written ahead of the code and describe features
  that do not exist (evidence ledger, production drills, micro-stories, planner,
  listening mode, a separate `apps/worker`, MCP support). Never implement from
  them. Planned work lives in GitHub issues.
- **ADRs are proposals**: `docs/adr/0001` and `0002` are `proposed`, not built.
  Cards + FSRS are the architectural hub today.
- **Large Dataset Safety**: Never load or print the entirety of the 938 MB `kaikki.org-dictionary-German-words.jsonl` file directly. Read it streaming or parse short samples (e.g. `head -n 5`).
- **Shared Package Contract**: Ensure any changes to API inputs or outputs are reflected in the Zod schemas located in `packages/shared/` before updating endpoints. The web client parses responses through these schemas, so a mismatch fails at the boundary.
- **`ReviewLog` is the source of truth for scheduling**: a card's FSRS columns are
  a recomputable cache, and offline sync replays the full log. Never write FSRS
  state the log cannot reproduce.
- **CEFR is 12 half sub-levels** (`A1.1` … `C2.2`), defined in
  `apps/api/src/knowledge/constants.ts`. Do not treat it as six flat levels.
- **GSAP and Gestures**: Maintain a strict focus on mobile-first interaction. Ensure all swipe gestures have equivalent standard button alternatives, and animations are bypassed if `prefers-reduced-motion` is enabled.
- **Environment Boundaries**: Ensure `.env` and `service-account.json` are excluded from git.
