import { z } from 'zod';
import { fsrsStateSchema } from './review';

export const courseProgressSchema = z.object({
  learned: z.number(),
  inProgress: z.number(),
  notStarted: z.number(),
});
export type CourseProgress = z.infer<typeof courseProgressSchema>;

export const courseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  cefrLevel: z.string().nullable(),
  order: z.number(),
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
