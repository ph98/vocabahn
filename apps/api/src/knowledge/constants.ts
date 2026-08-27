export { CEFR_LEVELS, type CefrLevel, cefrIndex } from '@vocabahn/shared';

// Approximate cumulative frequency-rank ceiling reached by each CEFR level
// (rank in de_full.txt). Used as a rough prior: a word at or under the
// ceiling of the level below the user's inferred level is likely a "filler"
// they already know.
export const CEFR_FREQUENCY_CEILING: number[] = [
  300, 600, 1000, 1500, 2200, 3000, 4200, 5500, 8000, 11000, 15000, 20000,
];

// A card auto-graduates to AUTO_KNOWN once its knowledge score crosses this
// threshold, provided it has been reviewed at least AUTO_GRADUATE_MIN_REPS times.
export const AUTO_GRADUATE_THRESHOLD = 0.85;
export const AUTO_GRADUATE_MIN_REPS = 3;

// A NEW (never-reviewed) card auto-graduates outright once its prior alone
// (frequency + level gap) crosses this much higher bar — e.g. extremely
// frequent "filler" words well below the user's inferred level.
export const AUTO_GRADUATE_PRIOR_THRESHOLD = 0.9;

// How far out a known card's due date is pushed (still scheduled, not deleted).
export const KNOWN_CARD_DUE_DAYS = 180;

// Number of most-recent review logs used for the performance signal.
export const PERFORMANCE_HISTORY_LIMIT = 8;

// Minimum recent reviews at a CEFR level required before it counts toward
// inferring the user's effective level.
export const LEVEL_INFERENCE_MIN_SAMPLES = 5;
export const LEVEL_INFERENCE_MIN_AVG = 0.7;
export const LEVEL_INFERENCE_LOOKBACK = 100;

// Dropping someone a level is a worse error than leaving them a level high, so
// a failing level only pulls the inference down on a fuller sample than the one
// that lets a level count at all.
export const LEVEL_DEMOTION_MIN_SAMPLES = 15;

// Reviews a learner must complete after setting their own level before the
// inference is allowed to move it again. Counted in reviews rather than days so
// the window cannot be waited out by not studying.
export const MANUAL_LEVEL_GRACE_REVIEWS = 100;

// Provenance values for `User.cefrLevelSource`.
export const CEFR_SOURCE_MANUAL = 'MANUAL';
export const CEFR_SOURCE_CALIBRATED = 'CALIBRATED';
export const CEFR_SOURCE_INFERRED = 'INFERRED';

/** Levels the learner chose or measured, which the inference must not trample. */
export const LEARNER_SET_CEFR_SOURCES: readonly string[] = [
  CEFR_SOURCE_MANUAL,
  CEFR_SOURCE_CALIBRATED,
];

export function farFutureDate(): Date {
  return new Date(Date.now() + KNOWN_CARD_DUE_DAYS * 24 * 60 * 60 * 1000);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
