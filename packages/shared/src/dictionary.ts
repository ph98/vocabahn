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

// One slot per finite-verb person/number combination.
export const personFormsSchema = z.object({
  ich: z.string().optional(),
  du: z.string().optional(),
  erSieEs: z.string().optional(),
  wir: z.string().optional(),
  ihr: z.string().optional(),
  sieSie: z.string().optional(),
});

export const conjugationMoodSchema = z.object({
  present: personFormsSchema.optional(),
  preterite: personFormsSchema.optional(),
  perfect: personFormsSchema.optional(),
  pluperfect: personFormsSchema.optional(),
  futureI: personFormsSchema.optional(),
  futureII: personFormsSchema.optional(),
});

export const verbConjugationSchema = z.object({
  infinitive: z.string(),
  auxiliary: z.string().nullable(),
  class: z.string().nullable(),
  participlePresent: z.string().nullable(),
  participlePast: z.string().nullable(),
  indicative: conjugationMoodSchema,
  subjunctiveI: conjugationMoodSchema,
  subjunctiveII: conjugationMoodSchema,
  imperative: personFormsSchema,
  alternativeForms: z.array(z.string()),
});

export type PersonForms = z.infer<typeof personFormsSchema>;
export type ConjugationMood = z.infer<typeof conjugationMoodSchema>;
export type VerbConjugation = z.infer<typeof verbConjugationSchema>;

const caseFormsSchema = z.object({
  nominative: z.string().optional(),
  genitive: z.string().optional(),
  dative: z.string().optional(),
  accusative: z.string().optional(),
});

export const nounDeclensionSchema = z.object({
  singular: caseFormsSchema,
  plural: caseFormsSchema,
});

// One declension table cell per case, with masculine/feminine/neuter/plural slots.
export const adjectiveCaseFormsSchema = z.object({
  masculine: z.string().optional(),
  feminine: z.string().optional(),
  neuter: z.string().optional(),
  plural: z.string().optional(),
});

export const adjectiveDeclensionTableSchema = z.object({
  nominative: adjectiveCaseFormsSchema.optional(),
  genitive: adjectiveCaseFormsSchema.optional(),
  dative: adjectiveCaseFormsSchema.optional(),
  accusative: adjectiveCaseFormsSchema.optional(),
});

export const adjectiveDegreeSchema = z.object({
  strong: adjectiveDeclensionTableSchema,
  weak: adjectiveDeclensionTableSchema,
  mixed: adjectiveDeclensionTableSchema,
  predicative: z.string().nullable(),
});

export const adjectiveDeclensionSchema = z.object({
  positive: adjectiveDegreeSchema,
  comparative: adjectiveDegreeSchema.nullable(),
  superlative: adjectiveDegreeSchema.nullable(),
});

export type NounDeclension = z.infer<typeof nounDeclensionSchema>;
export type AdjectiveCaseForms = z.infer<typeof adjectiveCaseFormsSchema>;
export type AdjectiveDeclensionTable = z.infer<typeof adjectiveDeclensionTableSchema>;
export type AdjectiveDegree = z.infer<typeof adjectiveDegreeSchema>;
export type AdjectiveDeclension = z.infer<typeof adjectiveDeclensionSchema>;

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
  usageNote: z.string().nullable(),
  imageUrl: z.string().nullable(),
  audioUrl: z.string().nullable(),
  enrichmentStatus: enrichmentStatusSchema,
  examples: z.array(
    z.object({
      de: z.string(),
      en: z.string(),
      audioUrl: z.string().nullable(),
    }),
  ),
  senses: z.array(wordSenseSchema),
  forms: z.array(wordFormSchema),
  conjugation: verbConjugationSchema.nullable(),
  nounDeclension: nounDeclensionSchema.nullable(),
  adjectiveDeclension: adjectiveDeclensionSchema.nullable(),
  imageCredit: z
    .object({ authorName: z.string(), authorUrl: z.string().nullable() })
    .nullable(),
});

export type DictionaryEntryDetail = z.infer<typeof dictionaryEntryDetailSchema>;
