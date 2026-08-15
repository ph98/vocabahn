import { z } from 'zod';
import { userSchema } from './user.js';


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

export const diagnosticProbeItemSchema = z.object({
  id: z.string(),
  word: z.string(),
  cefrLevel: z.string().nullable().optional(),
  pos: z.string().nullable().optional(),
  translation: z.string().nullable().optional(),
  isReal: z.boolean(),
});
export type DiagnosticProbeItem = z.infer<typeof diagnosticProbeItemSchema>;

export const diagnosticProbeResponseSchema = z.object({
  items: z.array(diagnosticProbeItemSchema),
});
export type DiagnosticProbeResponse = z.infer<typeof diagnosticProbeResponseSchema>;

export const diagnosticProbeAnswerSchema = z.object({
  id: z.string(),
  word: z.string(),
  isReal: z.boolean(),
  known: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
});
export type DiagnosticProbeAnswer = z.infer<typeof diagnosticProbeAnswerSchema>;

export const calibrateDiagnosticBodySchema = z.object({
  answers: z.array(diagnosticProbeAnswerSchema),
});
export type CalibrateDiagnosticBody = z.infer<typeof calibrateDiagnosticBodySchema>;

export const levelMasteryStatusSchema = z.enum(['MASTERED', 'FRONTIER', 'LEARNING']);
export type LevelMasteryStatus = z.infer<typeof levelMasteryStatusSchema>;

export const levelBreakdownItemSchema = z.object({
  cefrLevel: z.string(),
  accuracy: z.number(),
  sampleCount: z.number(),
  status: levelMasteryStatusSchema,
});
export type LevelBreakdownItem = z.infer<typeof levelBreakdownItemSchema>;

export const frontierWordSchema = z.object({
  id: z.string(),
  word: z.string(),
  translation: z.string().nullable(),
  emoji: z.string().nullable().optional(),
  cefrLevel: z.string().nullable().optional(),
});
export type FrontierWord = z.infer<typeof frontierWordSchema>;

export const calibrateDiagnosticResponseSchema = z.object({
  user: userSchema,
  estimatedCefrLevel: z.string(),
  estimatedCefrIndex: z.number(),
  estimatedVocabSize: z.number(),
  confidenceScore: z.number(),
  falseAlarmRate: z.number(),
  graduatedCount: z.number(),
  graduatedWords: z.array(z.string()),
  frontierWords: z.array(frontierWordSchema),
  breakdown: z.array(levelBreakdownItemSchema),
});
export type CalibrateDiagnosticResponse = z.infer<typeof calibrateDiagnosticResponseSchema>;

