import { z } from 'zod';

export const knownReasonSchema = z.enum(['AUTO', 'MANUAL']);
export type KnownReason = z.infer<typeof knownReasonSchema>;

export const knownWordSchema = z.object({
  cardId: z.string(),
  dictionaryEntryId: z.string(),
  word: z.string(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  cefrLevel: z.string().nullable(),
  reason: knownReasonSchema,
  score: z.number().nullable(),
  knownAt: z.string(),
});
export type KnownWord = z.infer<typeof knownWordSchema>;

export const knownWordsResponseSchema = z.object({
  words: z.array(knownWordSchema),
});
export type KnownWordsResponse = z.infer<typeof knownWordsResponseSchema>;

export const autoGraduationSchema = z.object({
  count: z.number(),
  words: z.array(z.string()),
});
export type AutoGraduation = z.infer<typeof autoGraduationSchema>;
