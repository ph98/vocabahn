import { z } from 'zod';

export const deckWordSchema = z.object({
  dictionaryEntryId: z.string(),
  word: z.string(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  addedAt: z.string(),
});
export type DeckWord = z.infer<typeof deckWordSchema>;

export const deckSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  isPublic: z.boolean(),
  wordCount: z.number(),
  ownerName: z.string().nullable(),
  isOwner: z.boolean(),
  createdAt: z.string(),
});
export type DeckSummary = z.infer<typeof deckSummarySchema>;

export const deckDetailSchema = deckSummarySchema.extend({
  words: z.array(deckWordSchema),
});
export type DeckDetail = z.infer<typeof deckDetailSchema>;

export const deckListResponseSchema = z.object({
  myDecks: z.array(deckSummarySchema),
  publicDecks: z.array(deckSummarySchema),
});
export type DeckListResponse = z.infer<typeof deckListResponseSchema>;

export const createDeckBodySchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  isPublic: z.boolean().optional(),
});
export type CreateDeckBody = z.infer<typeof createDeckBodySchema>;

export const updateDeckBodySchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateDeckBody = z.infer<typeof updateDeckBodySchema>;
