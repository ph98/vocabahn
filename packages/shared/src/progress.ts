import { z } from 'zod';

/**
 * How far a user has got through a collection of words (a course or a deck).
 *
 * The three buckets are disjoint and always sum to the number of *distinct*
 * dictionary entries in the collection:
 *
 * - `learned`     — the app will not schedule the word again: the card is in
 *                   FSRS `REVIEW`, or its `knownState` is `AUTO_KNOWN` /
 *                   `USER_KNOWN` (which can happen while FSRS still says
 *                   `LEARNING`).
 * - `inProgress`  — actively being studied: FSRS `LEARNING` or `RELEARNING`.
 *                   A lapsed word therefore moves back out of `learned`.
 * - `notStarted`  — never shown: no card at all, or a card still in FSRS `NEW`.
 */
export const progressSchema = z.object({
  learned: z.number(),
  inProgress: z.number(),
  notStarted: z.number(),
});
export type Progress = z.infer<typeof progressSchema>;
