// Half sub-levels (Goethe / Profile Deutsch), same scale as DictionaryEntry.cefrLevel
// and the Gemini enrichment provider's `cefrLevel` field.
export const CEFR_LEVELS = [
  'A1.1',
  'A1.2',
  'A2.1',
  'A2.2',
  'B1.1',
  'B1.2',
  'B2.1',
  'B2.2',
  'C1.1',
  'C1.2',
  'C2.1',
  'C2.2',
] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function cefrIndex(level: string | null | undefined): number | null {
  if (!level) return null;
  const index = CEFR_LEVELS.indexOf(level as CefrLevel);
  return index === -1 ? null : index;
}

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

export function farFutureDate(): Date {
  return new Date(Date.now() + KNOWN_CARD_DUE_DAYS * 24 * 60 * 60 * 1000);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
