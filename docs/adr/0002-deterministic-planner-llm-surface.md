# 0002. Deterministic planner core with a conversational LLM surface

Date: 2026-07-05
Status: proposed

> Not implemented as of 2026-07-26. Cards + FSRS remain the hub;
> there is no evidence ledger and no planner in the codebase. See
> `docs/system/learning.md` for what actually schedules reviews.

## Context

The Planner composes each learner's session (which Experiences, in what mix,
for how long) and revises the Learning Plan as knowledge state and goals
change. The product promise is "AI dynamically updates your plan" — which
suggests an LLM agent doing the planning. The alternative is a deterministic
algorithm with LLM interaction layered around it.

## Decision

The planner core is a deterministic, pure function: inputs are due load,
frontier size, time budget, and mix weights; output is the session
composition. LLMs operate only at the edges:

- **Goal parsing** — free-text goals ("pass Goethe B1 in October") are parsed
  into structured parameters (target level, deadline, track).
- **Plan explanation** — the plan is narrated to the learner ("story-heavy
  today because 23 words are due").
- **Plan negotiation** — conversational requests ("only 5 minutes today",
  "fewer drills") are translated into new inputs and the core re-runs.
- **Taste decisions** — story topic selection from interests and history,
  where judgment genuinely beats arithmetic.

## Consequences

- Same state always produces the same plan: testable, debuggable, cheap, and
  no per-session LLM latency or cost for scheduling itself.
- The "AI-first" feel is carried by the conversational surface, not the
  arithmetic; UX effort must go there.
- Pedagogical rules (interleaving, mix ratios) are explicit code, reviewable
  and tunable — not implicit in a prompt.
- The core is swappable behind its interface if LLM judgment is later wanted
  for genuine taste decisions beyond topic selection.
- Risk accepted: the plan can feel formulaic if explanation/negotiation are
  neglected; mitigation is investment in the surface, not in moving planning
  into the LLM.
