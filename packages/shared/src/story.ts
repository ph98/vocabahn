import { z } from 'zod';

// A micro-story is generated from words the learner is currently studying,
// retold from a real German news item on a topic the learner chose.
// Reading it is the experience; tapping a word records that it didn't land.

export const storyStatusSchema = z.enum(['PENDING', 'GENERATING', 'READY', 'FAILED']);
export type StoryStatus = z.infer<typeof storyStatusSchema>;

// Sub-steps of GENERATING, so the wait can be narrated instead of spun. Only
// meaningful while the status is PENDING or GENERATING. Source selection is not
// a stage: it happens when the row is created, so nobody waits on it.
export const storyStageSchema = z.enum(['WRITING', 'NARRATING']);
export type StoryStage = z.infer<typeof storyStageSchema>;

// ON_DEMAND: the learner pressed the button. DAILY: the scheduler wrote it for
// them overnight, in their own timezone, and it was waiting when they opened up.
export const storyOriginSchema = z.enum(['ON_DEMAND', 'DAILY']);
export type StoryOrigin = z.infer<typeof storyOriginSchema>;

export const storyTargetSchema = z.object({
  entryId: z.string(),
  // Headword, for linking through to the dictionary entry
  word: z.string(),
  // Inflected form exactly as it appears in the story text
  surfaceForm: z.string(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  // null until the story is completed; false = the learner tapped it
  understood: z.boolean().nullable(),
});
export type StoryTarget = z.infer<typeof storyTargetSchema>;

// Attribution for the real article a story was retold from. Snapshotted onto
// the story, so it survives the source item being pruned. Null for stories
// generated without a source (no feed for the topic, or the fetch was empty).
export const storySourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  // Publisher, e.g. "tagesschau"
  name: z.string(),
  publishedAt: z.string().nullable(),
});
export type StorySource = z.infer<typeof storySourceSchema>;

// A scene-setting Unsplash photo, found during generation from an English
// description the model returns with the text. Null is a normal state — stories
// written before this existed, an unset UNSPLASH_ACCESS_KEY, and any search
// that errored or matched nothing all land here. Attribution travels with the
// URL because Unsplash's terms require crediting the photographer wherever the
// photo is shown.
export const storyImageSchema = z.object({
  url: z.string(),
  authorName: z.string(),
  authorUrl: z.string().nullable(),
  // The photo's own page on Unsplash
  sourceUrl: z.string().nullable(),
});
export type StoryImage = z.infer<typeof storyImageSchema>;

export const storySchema = z.object({
  id: z.string(),
  status: storyStatusSchema,
  stage: storyStageSchema.nullable(),
  origin: storyOriginSchema,
  // Topic slug from STORY_TOPICS; null for stories written before topics existed
  topic: z.string().nullable(),
  source: storySourceSchema.nullable(),
  cefrLevel: z.string().nullable(),
  title: z.string().nullable(),
  text: z.string().nullable(),
  translation: z.string().nullable(),
  // Narration of the German text; null when synthesis is off or failed
  audioUrl: z.string().nullable(),
  // Illustration above the text; null when unconfigured, failed, or pre-dating it
  image: storyImageSchema.nullable(),
  error: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  targets: z.array(storyTargetSchema),
});
export type Story = z.infer<typeof storySchema>;

export const storyResponseSchema = z.object({
  story: storySchema,
});
export type StoryResponse = z.infer<typeof storyResponseSchema>;

// `story` is null when the learner has nothing waiting.
export const latestStoryResponseSchema = z.object({
  story: storySchema.nullable(),
});
export type LatestStoryResponse = z.infer<typeof latestStoryResponseSchema>;

export const createStoryBodySchema = z.object({
  timezone: z.string().optional(),
  // Omitted means "surprise me": the server picks from the learner's interests.
  topic: z.string().optional(),
});
export type CreateStoryBody = z.infer<typeof createStoryBodySchema>;

// Entry ids the learner tapped; every other target counts as understood.
export const completeStoryBodySchema = z.object({
  notUnderstood: z.array(z.string()).max(50),
});
export type CompleteStoryBody = z.infer<typeof completeStoryBodySchema>;

export const storyQuotaSchema = z.object({
  used: z.number(),
  cap: z.number(),
});
export type StoryQuota = z.infer<typeof storyQuotaSchema>;
