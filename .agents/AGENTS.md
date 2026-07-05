# AI Developer Guidelines

Welcome to the Vocabahn repository. When working as an AI developer or assistant in this codebase, please adhere to the following rules:

- **AI-First & MCP Architecture**: Understand that this app combines FSRS with LLM enrichment and aims to support Model Context Protocol (MCP). Check `docs/ai_architecture.md` and `docs/mcp_integration.md` for architectural context.
- **PRD as Source of Truth**: The `docs/prd.md` captures approved requirements. Refer to it rather than re-deriving features.
- **Large Dataset Safety**: Never load or print the entirety of the 938 MB `kaikki.org-dictionary-German-words.jsonl` file directly. Read it streaming or parse short samples (e.g. `head -n 5`).
- **Shared Package Contract**: Ensure any changes to API inputs or outputs are reflected in the Zod schemas located in `packages/shared/` before updating endpoints.
- **GSAP and Gestures**: Maintain a strict focus on mobile-first interaction. Ensure all swipe gestures have equivalent standard button alternatives, and animations are bypassed if `prefers-reduced-motion` is enabled.
- **Environment Boundaries**: Ensure `.env` and `service-account.json` are excluded from git.
