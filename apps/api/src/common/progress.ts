import type { FsrsState, Progress } from '@vocabahn/shared';

/** Mirrors the `KnownState` Prisma enum. Kept structural so this stays a pure, testable function. */
export type KnownStateName = 'ACTIVE' | 'AUTO_KNOWN' | 'USER_KNOWN' | 'SUSPENDED';

/** The two independent state axes a `Card` carries — see `docs/system/learning.md`. */
export interface ProgressCardState {
  state: FsrsState;
  knownState: KnownStateName;
}

/**
 * Buckets a user's cards over a collection of words into `learned` /
 * `inProgress` / `notStarted`. Shared by courses and decks so there is one
 * definition of "progress" in the system.
 *
 * `knownState` is read **before** FSRS `state`: auto-graduation
 * (`recomputeAfterReview`) and manual marking both leave the FSRS state alone,
 * so a word graduated while still `LEARNING` is known, not in progress. Without
 * this the bar can never reach 100%.
 *
 * `RELEARNING` counts as **in progress**: the word lapsed, the app will show it
 * again within minutes, and the learner has to re-earn it. The bar moving
 * backwards after a lapse is the honest reading, so the UI names the bucket
 * "In progress" and says it covers relearning.
 *
 * `NEW` counts as **not started**: enrolment creates a card per course word up
 * front, so treating "has a card" as "started" would report a freshly enrolled
 * course as 100% in progress and leave `notStarted` permanently zero. A `NEW`
 * card has never been shown, exactly like a word with no card.
 *
 * @param cards      the user's cards for the collection, one per distinct entry
 * @param totalWords the number of **distinct** dictionary entries in the collection
 */
export function summarizeProgress(cards: Iterable<ProgressCardState>, totalWords: number): Progress {
  let learned = 0;
  let inProgress = 0;

  for (const card of cards) {
    if (card.knownState === 'AUTO_KNOWN' || card.knownState === 'USER_KNOWN' || card.state === 'REVIEW') {
      learned += 1;
    } else if (card.state === 'LEARNING' || card.state === 'RELEARNING') {
      inProgress += 1;
    }
    // `NEW` (and any card beyond `totalWords`) falls through to `notStarted`.
  }

  return {
    learned,
    inProgress,
    notStarted: Math.max(0, totalWords - learned - inProgress),
  };
}

/** Distinct entry ids, order-preserving. Courses and decks can both list an entry twice. */
export function distinctEntryIds(entryIds: readonly string[]): string[] {
  return [...new Set(entryIds)];
}
