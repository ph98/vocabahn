import { z } from 'zod';
import { autoGraduationSchema } from './knowledge';

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
