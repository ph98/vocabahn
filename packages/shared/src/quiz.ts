import { z } from 'zod';

import { enrichmentStatusSchema } from './dictionary.js';

export const quizQuestionTypeSchema = z.enum(['MEANING']);
export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

/**
 * A question as the client sees it: the correct index is deliberately absent.
 * The server grades the attempt, so `QuizAttempt.correct` cannot be set by a
 * buggy or hostile client.
 */
export const quizQuestionSchema = z.object({
  id: z.string(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  options: z.array(z.string()),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const entryQuizResponseSchema = z.object({
  // Mirrors the entry's enrichment status so the tab can show the same
  // polling state as the rest of the word page instead of an empty list.
  status: enrichmentStatusSchema,
  questions: z.array(quizQuestionSchema),
});
export type EntryQuizResponse = z.infer<typeof entryQuizResponseSchema>;

export const submitQuizAttemptBodySchema = z.object({
  selectedIndex: z.number().int().min(0).max(9),
  latencyMs: z.number().int().nonnegative().max(3_600_000).optional(),
});
export type SubmitQuizAttemptBody = z.infer<typeof submitQuizAttemptBodySchema>;

export const quizAttemptResultSchema = z.object({
  correct: z.boolean(),
  correctIndex: z.number().int(),
  correctOption: z.string(),
  explanation: z.string().nullable(),
});
export type QuizAttemptResult = z.infer<typeof quizAttemptResultSchema>;

export const quizReportReasonSchema = z.enum([
  'WRONG_ANSWER',
  'AMBIGUOUS',
  'TOO_EASY',
  'BAD_GERMAN',
  'OTHER',
]);
export type QuizReportReason = z.infer<typeof quizReportReasonSchema>;

export const QUIZ_REPORT_REASON_LABELS: Record<QuizReportReason, string> = {
  WRONG_ANSWER: 'The marked answer is wrong',
  AMBIGUOUS: 'More than one option is correct',
  TOO_EASY: 'The wrong options are obviously wrong',
  BAD_GERMAN: 'The German is wrong or unnatural',
  OTHER: 'Something else',
};

export const submitQuizReportBodySchema = z.object({
  reason: quizReportReasonSchema,
  comment: z.string().trim().max(2000).optional(),
});
export type SubmitQuizReportBody = z.infer<typeof submitQuizReportBodySchema>;

export const quizReportSchema = z.object({
  reason: quizReportReasonSchema,
  comment: z.string().nullable(),
});
export type QuizReport = z.infer<typeof quizReportSchema>;
