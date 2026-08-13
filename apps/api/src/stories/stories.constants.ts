export const STORY_QUEUE = 'story';

export interface StoryJobData {
  storyId: string;
}

/** Hourly sweep that writes each learner their story for the day. */
export const STORY_DIGEST_QUEUE = 'story-digest';

/** The sweep always covers every learner — it carries no payload. */
export type StoryDigestJobData = Record<string, never>;

/**
 * A learner with no review in this many days is treated as dormant and skipped
 * by the daily sweep. Each daily story is a paid model call, and writing one
 * every morning for an account nobody opens is the easiest way to spend the
 * Gemini budget on nothing.
 */
export const STORY_DIGEST_ACTIVE_DAYS = Number(process.env.STORY_DIGEST_ACTIVE_DAYS ?? 14);

/** How many studied words a story is asked to weave in. */
export const STORY_TARGET_COUNT = 8;

/**
 * Below this many verified target words the story isn't worth reading — it has
 * drifted off the learner's vocabulary. The job throws so BullMQ regenerates.
 */
export const STORY_MIN_TARGETS = 3;

/** Level used when the learner's own level has not been inferred yet. */
export const STORY_FALLBACK_LEVEL = 'A2.1';

/**
 * Story targets are drawn from content words only. A due queue full of
 * prepositions and conjunctions produces a story peppered with tappable "von"
 * and "für", which tells us nothing — "I didn't understand *von*" is not a
 * signal anyone can act on. Falls back to any part of speech when a learner
 * has too few content words due.
 */
export const STORY_CONTENT_POS = ['noun', 'verb', 'adj', 'adv'];

// Per-user/day cap on story generation (each story is one paid Gemini call).
export const STORY_DAILY_CAP = Number(process.env.STORY_DAILY_CAP ?? 10);
