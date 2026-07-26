import { Card as PrismaCard, FsrsState, ReviewRating } from '@prisma/client';
import { Card as FsrsCard, createEmptyCard, fsrs, Grade, State } from 'ts-fsrs';

// Short-term (same-day) learning steps rely on a `learning_steps` counter
// that isn't persisted on the Prisma `Card` model. Disabling short-term
// scheduling keeps the FSRS algorithm fully driven by the fields we do
// store (stability, difficulty, due, ...), so state is exactly recomputable
// by replaying `ReviewLog`.
export function createScheduler() {
  return fsrs({ enable_short_term: false });
}

const FSRS_STATES: FsrsState[] = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'];
const FSRS_RATINGS: ReviewRating[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

/** A brand-new card's FSRS state, used as the replay starting point for offline sync. */
export function emptyFsrsCard(): FsrsCard {
  return createEmptyCard();
}

export function toFsrsCard(card: PrismaCard): FsrsCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: FSRS_STATES.indexOf(card.state) as State,
    last_review: card.lastReview ?? undefined,
  };
}

export function fromFsrsCard(fsrsCard: FsrsCard) {
  return {
    due: fsrsCard.due,
    stability: fsrsCard.stability,
    difficulty: fsrsCard.difficulty,
    elapsedDays: fsrsCard.elapsed_days,
    scheduledDays: fsrsCard.scheduled_days,
    reps: fsrsCard.reps,
    lapses: fsrsCard.lapses,
    state: FSRS_STATES[fsrsCard.state] as FsrsState,
    lastReview: fsrsCard.last_review ?? null,
  };
}

export function ratingToFsrs(rating: ReviewRating): Grade {
  return (FSRS_RATINGS.indexOf(rating) + 1) as Grade;
}

export function buildReviewLogSnapshot(fsrsCard: FsrsCard, reviewedAt: Date) {
  return {
    state: FSRS_STATES[fsrsCard.state] as FsrsState,
    due: fsrsCard.due,
    stability: fsrsCard.stability,
    difficulty: fsrsCard.difficulty,
    elapsedDays: fsrsCard.elapsed_days,
    scheduledDays: fsrsCard.scheduled_days,
    reviewedAt,
  };
}
