import { z } from 'zod';
import { autoGraduationSchema } from './knowledge.js';

export const fsrsStateSchema = z.enum(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING']);
export type FsrsState = z.infer<typeof fsrsStateSchema>;

export const reviewRatingSchema = z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']);
export type ReviewRating = z.infer<typeof reviewRatingSchema>;

export const reviewExampleSchema = z.object({
  de: z.string(),
  en: z.string(),
  audioUrl: z.string().nullable(),
});

export const reviewCardEntrySchema = z.object({
  id: z.string(),
  word: z.string(),
  pos: z.string(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  imageUrl: z.string().nullable(),
  audioUrl: z.string().nullable(),
  examples: z.array(reviewExampleSchema),
});

export const reviewCardSchema = z.object({
  id: z.string(),
  due: z.string(),
  state: fsrsStateSchema,
  reps: z.number(),
  lapses: z.number(),
  entry: reviewCardEntrySchema,
});

export type ReviewCard = z.infer<typeof reviewCardSchema>;

export const dueCardsQuerySchema = z.object({
  courseId: z.string().optional(),
  deckId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const dueCardsResponseSchema = z.object({
  cards: z.array(reviewCardSchema),
});
export type DueCardsResponse = z.infer<typeof dueCardsResponseSchema>;

export const submitReviewBodySchema = z.object({
  rating: reviewRatingSchema,
  latencyMs: z.number().int().nonnegative().optional(),
});
export type SubmitReviewBody = z.infer<typeof submitReviewBodySchema>;

export const submitReviewResponseSchema = z.object({
  card: reviewCardSchema,
  autoGraduated: autoGraduationSchema.nullable(),
});
export type SubmitReviewResponse = z.infer<typeof submitReviewResponseSchema>;

// ── Offline review sync ─────────────────────────────────────────────────────
// Reviews completed while offline are queued client-side with their original
// timestamp, then replayed in timestamp order; server-side FSRS state is
// recomputed from the full ReviewLog (the log is the source of truth).

export const syncReviewItemSchema = z.object({
  cardId: z.string(),
  rating: reviewRatingSchema,
  latencyMs: z.number().int().nonnegative().optional(),
  reviewedAt: z.string(),
});
export type SyncReviewItem = z.infer<typeof syncReviewItemSchema>;

export const syncReviewsBodySchema = z.object({
  reviews: z.array(syncReviewItemSchema).min(1).max(200),
});
export type SyncReviewsBody = z.infer<typeof syncReviewsBodySchema>;

export const syncReviewsResponseSchema = z.object({
  synced: z.number(),
});
export type SyncReviewsResponse = z.infer<typeof syncReviewsResponseSchema>;
