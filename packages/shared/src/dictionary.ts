import { z } from 'zod';

export const enrichmentStatusSchema = z.enum([
  'PENDING',
  'ENRICHING',
  'ENRICHED',
  'FAILED',
]);

export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;

export const dictionarySearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

export const dictionarySearchResultSchema = z.object({
  word: z.string(),
  pos: z.string(),
  gender: z.string().nullable(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  cefrLevel: z.string().nullable(),
  frequencyRank: z.number().nullable(),
  enrichmentStatus: enrichmentStatusSchema,
});

export const dictionarySearchResponseSchema = z.object({
  results: z.array(dictionarySearchResultSchema),
});

export type DictionarySearchResult = z.infer<typeof dictionarySearchResultSchema>;
export type DictionarySearchResponse = z.infer<typeof dictionarySearchResponseSchema>;

export const wordSenseSchema = z.object({
  glosses: z.array(z.string()),
  tags: z.array(z.string()),
  topics: z.array(z.string()),
  synonyms: z.array(z.string()),
  antonyms: z.array(z.string()),
});

export const wordFormSchema = z.object({
  form: z.string(),
  tags: z.array(z.string()),
});

export const dictionaryEntryDetailSchema = z.object({
  id: z.string(),
  word: z.string(),
  pos: z.string(),
  gender: z.string().nullable(),
  ipa: z.string().nullable(),
  hyphenation: z.string().nullable(),
  etymology: z.string().nullable(),
  frequencyRank: z.number().nullable(),
  translation: z.string().nullable(),
  emoji: z.string().nullable(),
  cefrLevel: z.string().nullable(),
  imageUrl: z.string().nullable(),
  audioUrl: z.string().nullable(),
  enrichmentStatus: enrichmentStatusSchema,
  examples: z.array(z.object({ de: z.string(), en: z.string() })),
  senses: z.array(wordSenseSchema),
  forms: z.array(wordFormSchema),
  imageCredit: z
    .object({ authorName: z.string(), authorUrl: z.string().nullable() })
    .nullable(),
});

export type DictionaryEntryDetail = z.infer<typeof dictionaryEntryDetailSchema>;
