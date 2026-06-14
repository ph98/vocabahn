import { z } from 'zod';

export const feedbackVoteSchema = z.enum(['UP', 'DOWN']);
export type FeedbackVote = z.infer<typeof feedbackVoteSchema>;

// Quick-pick issue categories shown as checkboxes alongside the free-text comment.
export const feedbackIssueSchema = z.enum([
  'LEVEL',
  'TRANSLATION',
  'IMAGE',
  'EMOJI',
  'AUDIO',
  'EXAMPLE',
  'GRAMMAR',
  'MNEMONIC',
  'OTHER',
]);
export type FeedbackIssue = z.infer<typeof feedbackIssueSchema>;

export const FEEDBACK_ISSUE_LABELS: Record<FeedbackIssue, string> = {
  LEVEL: 'CEFR level not right',
  TRANSLATION: 'Translation problem',
  IMAGE: 'Wrong image',
  EMOJI: 'Wrong emoji',
  AUDIO: 'Audio/pronunciation issue',
  EXAMPLE: 'Example sentence issue',
  GRAMMAR: 'Grammar/conjugation/declension issue',
  MNEMONIC: 'Memory hook unhelpful',
  OTHER: 'Other',
};

export const submitFeedbackBodySchema = z.object({
  vote: feedbackVoteSchema.nullable().optional(),
  issues: z.array(feedbackIssueSchema).optional(),
  comment: z.string().trim().max(2000).optional(),
});
export type SubmitFeedbackBody = z.infer<typeof submitFeedbackBodySchema>;

export const entryFeedbackSchema = z.object({
  vote: feedbackVoteSchema.nullable(),
  issues: z.array(feedbackIssueSchema),
  comment: z.string().nullable(),
});
export type EntryFeedback = z.infer<typeof entryFeedbackSchema>;
