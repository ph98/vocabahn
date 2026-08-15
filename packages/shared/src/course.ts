import { z } from 'zod';
import { progressSchema, type Progress } from './progress.js';
import { fsrsStateSchema } from './review.js';

/** Courses and decks share one progress shape — see `progress.ts` for the buckets. */
export const courseProgressSchema = progressSchema;
export type CourseProgress = Progress;

export const courseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  cefrLevel: z.string().nullable(),
  order: z.number(),
  isComplete: z.boolean(),
  wordCount: z.number(),
  enrolled: z.boolean(),
  progress: courseProgressSchema.nullable(),
});
export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const courseListResponseSchema = z.object({
  courses: z.array(courseSummarySchema),
});
export type CourseListResponse = z.infer<typeof courseListResponseSchema>;

export const courseWordSchema = z.object({
  order: z.number(),
  dictionaryEntryId: z.string(),
  word: z.string(),
  pos: z.string().optional(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  cefrLevel: z.string().nullable(),
  cardState: fsrsStateSchema.nullable(),
});
export type CourseWordSummary = z.infer<typeof courseWordSchema>;

export const courseDetailSchema = courseSummarySchema.extend({
  words: z.array(courseWordSchema),
});
export type CourseDetail = z.infer<typeof courseDetailSchema>;

export const enrollResponseSchema = z.object({
  enrolled: z.literal(true),
  cardsCreated: z.number(),
});
export type EnrollResponse = z.infer<typeof enrollResponseSchema>;

export const unenrollResponseSchema = z.object({
  enrolled: z.literal(false),
  cardsSuspended: z.number(),
});
export type UnenrollResponse = z.infer<typeof unenrollResponseSchema>;

