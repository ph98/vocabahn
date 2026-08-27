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

// ── Podcasts ────────────────────────────────────────────────────────────────

/**
 * German words in a five-minute episode. Spoken German runs around 130 words a
 * minute, and the hosts are deliberately slower than that.
 */
export const PODCAST_TARGET_WORD_COUNT = Number(process.env.PODCAST_TARGET_WORD_COUNT ?? 650);

/** New words per episode — the "few he doesn't know" half of the brief. */
export const PODCAST_NEW_WORD_COUNT = Number(process.env.PODCAST_NEW_WORD_COUNT ?? 4);

/** Due words woven in without explanation. */
export const PODCAST_REVIEW_WORD_COUNT = Number(process.env.PODCAST_REVIEW_WORD_COUNT ?? 6);

/**
 * How many banked words are handed to the model as "the listener knows these".
 * A sample, not the whole set: the list is there to steer the register, and a
 * thousand words of prompt would cost more than it steers.
 */
export const PODCAST_KNOWN_WORD_SAMPLE = Number(process.env.PODCAST_KNOWN_WORD_SAMPLE ?? 80);

/**
 * An episode is roughly six times a story's narration in characters, and text
 * to speech is billed per character, so podcasts get their own, smaller cap.
 */
export const PODCAST_DAILY_CAP = Number(process.env.PODCAST_DAILY_CAP ?? 2);

/**
 * Known words a learner needs before episodes unlock.
 *
 * Not an arbitrary gate. Five minutes of German with no text in front of you is
 * only followable once enough of it is already automatic; below roughly an
 * A1-complete vocabulary an episode is noise, and a learner who bounces off it
 * concludes the feature is broken rather than early. Counting `AUTO_KNOWN` and
 * `USER_KNOWN` cards makes the requirement something the learner is already
 * working towards every day, and the progress is shown rather than hidden so
 * the lock reads as a goal instead of a wall.
 */
export const PODCAST_UNLOCK_KNOWN_WORDS = Number(process.env.PODCAST_UNLOCK_KNOWN_WORDS ?? 300);

/**
 * Below this many turns the model has not written a conversation, whatever it
 * returned. The job throws so BullMQ regenerates.
 */
export const PODCAST_MIN_SEGMENTS = 6;

/**
 * Google's neural German voices, one per host. Podcasts default to Google
 * rather than ElevenLabs: at ~4,500 characters an episode, per-character
 * pricing is the dominant cost of the feature, and Google's neural voices are
 * an order of magnitude cheaper. Set PODCAST_TTS_PROVIDER=elevenlabs to trade
 * that back for the better voice.
 */
export const PODCAST_TTS_PROVIDER = process.env.PODCAST_TTS_PROVIDER ?? 'google';
export const PODCAST_VOICE_A = process.env.PODCAST_VOICE_A ?? 'de-DE-Neural2-B';
export const PODCAST_VOICE_B = process.env.PODCAST_VOICE_B ?? 'de-DE-Neural2-C';
