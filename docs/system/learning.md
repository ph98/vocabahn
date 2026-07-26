# Learning: Cards, FSRS, and the Knowledge Model

Scheduling, the review session, offline sync, and the derived knowledge score
that graduates words out of study.

Code: `apps/api/src/cards/`, `apps/api/src/fsrs/fsrs.ts`,
`apps/api/src/knowledge/`, `apps/api/src/dashboard/`,
`apps/web/src/components/ReviewSession.tsx`,
`apps/web/src/components/KnownWordsPage.tsx`, `apps/web/src/offline/`.

## The two state axes

A `Card` is one (user, dictionary entry) pair carrying **two independent**
states, and conflating them is the most common mistake in this subsystem:

- `state: FsrsState` — `NEW` / `LEARNING` / `REVIEW` / `RELEARNING`, owned by
  `ts-fsrs`.
- `knownState: KnownState` — `ACTIVE` / `AUTO_KNOWN` / `USER_KNOWN` /
  `SUSPENDED`, owned by the knowledge model.

Every queue and count filters on `knownState: ACTIVE`. Graduated cards are never
deleted; they are pushed 180 days out (`KNOWN_CARD_DUE_DAYS`) or a year out for
manual marks, so their history survives.

`SUSPENDED` is declared in the enum and never written anywhere.

## Building a session

`CardsService.getDueCards`, default limit 20 (**observed** as `1 / 20` in the
progress row), optionally filtered to one course:

1. Due reviews first — `knownState: ACTIVE`, `due <= now`, `state != NEW`,
   ordered by `due` ascending.
2. If short of the limit, pull up to `3×` the remaining count of `NEW` cards,
   order them by `KnowledgeService.orderByPrior` **lowest prior first**, and take
   what's needed. Introduction slots therefore go to genuinely unknown material
   rather than filler the learner probably already knows.

## Rating a card

`submitReview` runs `ts-fsrs`, then in one transaction updates the card's FSRS
columns and appends a `ReviewLog` row holding the rating, `latencyMs`, and the
full FSRS snapshot. Afterwards — outside the transaction —
`knowledge.recomputeAfterReview` runs and may return an `AutoGraduation`.

The web session (`ReviewSession.tsx`) is a single scrolling card, not a flip:

- Front: POS badge, headword, pronunciation button.
- `Show answer` (or Space/Enter) reveals the **full dictionary entry** below via
  the shared `EntryBody`, fetched separately on reveal and polled while
  enriching. The card payload from `/reviews/due` is deliberately thin.
- Rating: four buttons, arrow keys (← Again, → Good, ↑ Easy, ↓ Hard), or a
  horizontal swipe. GSAP flies the card off in the rating's direction; the drag
  triggers on 100 px of travel **or** a flick faster than 0.5 px/ms.
- `latencyMs` is measured from reveal to rating.
- An `aria-live` region announces card position, reveals, and ratings; a
  `role="status"` banner reports offline state, queued count, and
  "N words auto-marked as known" with a link to undo.

## Offline reviews

`apps/web/src/offline/queue.ts` — IndexedDB `vocabahn-offline`, store
`review-queue`. Reviews are enqueued proactively when `navigator.onLine` is
false, and reactively from the mutation's `onError`, so a flaky connection loses
nothing. On reconnect the queue flushes to `POST /reviews/sync` and invalidates
the due-cards, courses, dashboard, and known-words queries.

`CardsService.syncReviews` does not append: for each touched card it **replays
the entire history**. Existing logs plus the new items are merged, sorted by
`reviewedAt`, and re-scheduled from `emptyFsrsCard()` forward, rewriting every
log's snapshot and the card's final state in one transaction. This is what makes
out-of-order submission self-healing, and it is why `ReviewLog` must stay the
source of truth.

Ownership is checked before replay — items for cards the user does not own are
dropped silently, and the returned `synced` count reflects only valid items.

## The knowledge model

Not a ledger. A single derived float per (user, entry) in `KnowledgeScore`, with
a `components` JSON blob recording the breakdown for transparency. Constants live
in `apps/api/src/knowledge/constants.ts`.

**Prior** (`priorScore`), for words with no review history — zero unless the
user's level is known:

- *level prior* = `clamp01(0.5 + (userLevelIndex − entryLevelIndex) × 0.2)`
- *frequency prior* = `clamp01(1 − rank / CEFR_FREQUENCY_CEILING[userIndex−1])`,
  where the ceiling table runs 300 → 20000 across the 12 sub-levels
- combined 50/50

**Performance** — the last 8 ratings, most recent first, exponentially weighted
by 0.7 per step, with `AGAIN` 0, `HARD` 0.4, `GOOD` 0.8, `EASY` 1.

**Blend** — `repWeight = clamp01(reps / 3)`, so the prior dominates early and
performance takes over by the third repetition.

## Auto-graduation

Four ways a word becomes known, all funnelled through `recomputeAfterReview`
and merged into one `AutoGraduation` summary:

1. **Earned** — `ACTIVE`, `reps >= 3`, score `>= 0.85` → `AUTO_KNOWN`, due +180 d.
2. **Level inference** — the last 100 review logs are bucketed by the entry's
   CEFR sub-level; any level with ≥ 5 samples averaging ≥ 0.7 raises the user's
   inferred level. `User.cefrLevel` is written here and nowhere else.
3. **Filler sweep** — on a level *increase*, every `NEW`/`ACTIVE` card at least
   two sub-levels below the new level is marked `AUTO_KNOWN` in bulk.
4. **High prior** — whenever the level is known, `NEW`/`ACTIVE` cards whose prior
   alone reaches 0.9 graduate without any review history.

Manual marking (`markKnown`, `bulkMarkKnown`) writes `USER_KNOWN` with due one
year out. Undo returns the card to `ACTIVE`, due now, and **pulls the score down
to 0.75** (threshold − 0.1) so the next review cannot instantly re-graduate it.

## Dashboard

`DashboardService` — 365-day heatmap of review counts, streak walked backwards
from today (tolerating an unreviewed today), plus five stats and enrolled-course
progress. All **observed**.

Note what the labels mean: **"Known" on the dashboard counts `ACTIVE` cards in
FSRS state `REVIEW`** — not `AUTO_KNOWN`/`USER_KNOWN` cards, which is what the
Known Words page lists. The two "known" numbers are unrelated and will disagree.
"Learning" is every other non-`NEW` state; `dueToday` counts everything due
before tomorrow, so it includes the overdue backlog.

## Limitations

- **Every day boundary is UTC.** Streak, heatmap buckets, "reviewed today", and
  the enrichment quota key all use `toISOString()` dates. For a learner far from
  UTC, the streak can break despite daily study, and reviews land in the wrong
  heatmap cell.
- **Two different meanings of "known" in the UI** (above). Nothing in the code
  reconciles them.
- **`markKnown` fabricates FSRS state** — `stability: 100`, `difficulty: 1`,
  `state: REVIEW`, `reps: 0`, with no `ReviewLog` rows. This contradicts the
  log-is-truth invariant: any later `syncReviews` replay of that card resets it
  from `emptyFsrsCard()` and discards the fabricated numbers.
- **`batchGraduateHighPrior` runs on every single review** and loads *all* of the
  user's `NEW`/`ACTIVE` cards to filter them in JavaScript. A learner enrolled in
  every course carries thousands of such cards (**observed**: 3,197 new), so each
  rating triggers a full scan. `maybeUpdateCefrLevel` adds another 100-row joined
  query per review.
- Auto-graduation has no strong-evidence requirement: three self-graded `EASY`
  taps satisfy it. Self-report is the only evidence kind that exists.
- Swipe covers only **Again** and **Good**. `RATING_OFFSET` defines vertical
  directions and the buttons show ↑/↓ hints, but the drag is `axis: 'x'`, so
  Easy and Hard are keyboard/button only.
- Arrow keys rate the card **without revealing it**, and the handler is bound to
  `window` for the whole `/review` route. Rating unseen produces a real
  `ReviewLog` row with no `latencyMs`.
- Session summary's "Back to courses" points at `/courses`, which only redirects
  to `/library`.
- Listening mode does not exist — no audio-only prompt path anywhere in the web
  app.
- Known-words management is implemented (`KnownWordsPage.tsx` and
  `knowledge.service.ts`: list, bulk mark, frequency-ranked suggestions, bulk
  undo, per-card undo). It has no test coverage, has not been verified at
  runtime, and its value to the learner is unvalidated.
- `bulkUndo` fans out `Promise.all` over individual `undoKnown` calls, each its
  own transaction and each re-reading the card; a large selection is N round
  trips with no batching and no partial-failure reporting.
