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

## Undoing the last rating

One rating deep, no history. An **Undo** button sits in the session chrome next
to the "Review" heading whenever the previous rating is still undoable —
including on the summary screen, so the last card of a session is reachable —
bound to `u` and Cmd/Ctrl+Z. It is disabled while the submit or the undo itself
is in flight, and cleared by "Review more" (a fresh queue invalidates the stored
index).

Undo steps `index` back to the rated card unrevealed, decrements that rating's
session tally, and subtracts whatever the rating added to the auto-graduated
banner. Where the rollback goes depends on where the review landed:

- **Synced** — `POST /reviews/:cardId/undo` → `CardsService.undoLastReview`.
- **Still queued offline** — `dequeueLatestReview(cardId)` pops the newest
  matching item out of IndexedDB and refreshes the count. Calling the API here
  would 404, or undo an older *synced* review of the same card. If the item is
  gone (flushed between rating and undo), the call falls through to the API.

`undoLastReview` finds the caller's newest `ReviewLog` for the card (404 if the
card isn't theirs, 409 if there is no log), then reuses `replayCard` with a
`deleteLogId`: the delete, every surviving log's rewritten snapshot and the
card's final state go in one transaction. It cannot restore the previous log's
columns instead — every snapshot is the state *after* its own review. A card
whose only review is undone returns to `emptyFsrsCard()` state, due now.

Afterwards `recomputeAfterReview` re-scores the card, and if the undone review
was the one that graduated it (`knownState` still `AUTO_KNOWN`), `undoKnown`
puts it back to `ACTIVE` — which, as on the Known Words page, sets `due` to now
rather than the replayed date and pulls the score to `AUTO_GRADUATE_THRESHOLD −
0.1`.

The session invalidates `courses`, `dashboard` and `known-words` after an undo,
and marks `due-cards` stale without refetching — a refetch mid-session would
swap the queue out from under the index just stepped back to.

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

## Quiz attempts are not reviews

The word page has a Quiz tab (`enrichment.md`). Answering a question writes a
`QuizAttempt` row — question, entry, user, selected index, server-computed
`correct`, latency — and **nothing else**. No `ReviewLog` row, no `Card` update,
no `KnowledgeScore` write. `apps/api/src/quiz/quiz.service.spec.ts` asserts this
directly, and asserts in the schema that `QuizAttempt` has no relation to either
model.

The reason is `replayCard`. A card's FSRS state is reconstructed from an empty
scheduler by walking its `ReviewLog` in `reviewedAt` order, so anything written
there *is* scheduling. A quiz answer written as a fake review would move the
card's due date, and would then be replayed as a real review on the next offline
sync — permanently, since the log is the source of truth.

**Whether attempts should feed `KnowledgeService.performanceScore` was decided
explicitly: not yet.** Three reasons:

1. A 4-option question is 25% guessable, so an attempt is much weaker evidence
   than a self-rating and would need its own weight, decay and confidence
   handling — a second evidence model, not a tweak to the first.
2. `recomputeAfterReview` runs only on review. Feeding quiz attempts means a new
   trigger path that can auto-graduate a word, and auto-graduation already has
   no strong-evidence requirement (see Limitations). Three lucky taps must not
   retire a word.
3. It matches how `StoryTarget.understood` was handled: record the signal, leave
   it inert, and design the consumer once more than one producer exists.

`QuizAttempt.questionId` is nullable with `onDelete: SetNull`, so re-enrichment
replacing a question keeps the answer history that a future consumer would need.

## Auto-graduation

Four ways a word becomes known, all funnelled through `recomputeAfterReview`
and merged into one `AutoGraduation` summary:

1. **Earned** — `ACTIVE`, `reps >= 3`, score `>= 0.85` → `AUTO_KNOWN`, due +180 d.
2. **Level inference** — the last 100 review logs are bucketed by the entry's
   CEFR sub-level; any level with ≥ 5 samples averaging ≥ 0.7 raises the user's
   inferred level. `User.cefrLevel` is written here and nowhere else.
3. **Filler sweep** — on a level *increase*, every `NEW`/`ACTIVE` card at least
   two sub-levels below the new level is marked `AUTO_KNOWN` in bulk.
4. **High prior** — on a level *increase* (or on course enrollment when the level is known), `NEW`/`ACTIVE` cards whose prior alone reaches 0.9 (filtered in SQL by CEFR level and frequency rank) graduate without any review history.

Manual marking (`markKnown`, `bulkMarkKnown`) writes `USER_KNOWN` with due one
year out. Undo returns the card to `ACTIVE`, due now, and **pulls the score down
to 0.75** (threshold − 0.1) so the next review cannot instantly re-graduate it.

**None of these routes touch the FSRS columns.** A word can be `AUTO_KNOWN`
while `state` still reads `LEARNING`. Anything counting known words must read
`knownState` first and fall back to `state` — see the progress buckets in
`content.md`, which is where reading `state` alone used to leave graduated words
counted as "in progress" forever.

## Dashboard

`DashboardService` — 365-day heatmap of review counts, streak walked backwards
from today (tolerating an unreviewed today), plus five stats and enrolled-course
progress. All **observed**.

Note what the labels mean: **"Known" on the dashboard counts cards in `AUTO_KNOWN` and `USER_KNOWN` states**, matching what the Known Words page lists. "Learning" counts all active (`knownState: ACTIVE`) cards in non-`NEW` states (`LEARNING`, `RELEARNING`, `REVIEW`); "New" counts active cards in state `NEW`; `dueToday` counts everything due before tomorrow, so it includes the overdue backlog.

## Limitations

- **Day boundaries use user/client timezone** (#20 fixed). Streak, heatmap buckets, "reviewed today", and
  the enrichment quota key use timezone-aware date formatting (accepting client-supplied timezone parameter/header or saved user timezone).
- **`markKnown` fabricates FSRS state** — `stability: 100`, `difficulty: 1`,
  `state: REVIEW`, `reps: 0`, with no `ReviewLog` rows. This contradicts the
  log-is-truth invariant: any later `syncReviews` replay of that card resets it
  from `emptyFsrsCard()` and discards the fabricated numbers.

- Auto-graduation has no strong-evidence requirement: three self-graded `EASY`
  taps satisfy it. Self-report is still the only evidence kind the knowledge
  model reads — `QuizAttempt` rows accumulate but nothing consumes them.
- Swipe covers only **Again** and **Good**. `RATING_OFFSET` defines vertical
  directions and the buttons show ↑/↓ hints, but the drag is `axis: 'x'`, so
  Easy and Hard are keyboard/button only.
- Arrow keys rate the card **without revealing it**, and the handler is bound to
  `window` for the whole `/review` route. Rating unseen produces a real
  `ReviewLog` row with no `latencyMs`.
- Session summary's "Back to courses" points at `/courses`, which only redirects
  to `/library`.
- **Undo is one deep and session-local.** Leaving `/review` drops it; there is no
  way to reach back past the previous rating.
- Undo fires and forgets: if `POST /reviews/:cardId/undo` fails, the session has
  already stepped back and only shows a notice — the server keeps the review.
- Listening mode does not exist (not planned; no issue) — no audio-only prompt path anywhere in the web
  app.
- Known-words management is implemented (`KnownWordsPage.tsx` and
  `knowledge.service.ts`: list, bulk mark, frequency-ranked suggestions, bulk
  undo, per-card undo). It has no test coverage, has not been verified at
  runtime, and its value to the learner is unvalidated (#26).
- `bulkUndo` fans out `Promise.all` over individual `undoKnown` calls, each its
  own transaction and each re-reading the card; a large selection is N round
  trips with no batching and no partial-failure reporting.
