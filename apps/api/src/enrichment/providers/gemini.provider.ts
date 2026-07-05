import { GoogleGenAI, Type } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';

/** Gap-fill content the local datasets can't provide (PRD §7 step 3). */
export interface GeminiEnrichment {
  translation: string | null;
  emoji: string | null;
  cefrLevel: string | null;
  usageNote: string | null;
  examples: { de: string; en: string }[];
  collocations: { phrase: string; translation: string }[];
  falseFriends: { word: string; explanation: string }[];
  register: string | null;
  mnemonic: string | null;
}

const MODEL = 'gemini-flash-lite-latest';

const REGISTERS = [
  'neutral',
  'formal',
  'informal',
  'colloquial',
  'vulgar',
  'regional',
  'dated',
  'literary',
  'technical',
] as const;

// Half sub-levels (Goethe / Profile Deutsch) — precise but reliably estimable.
const CEFR_LEVELS = [
  'A1.1',
  'A1.2',
  'A2.1',
  'A2.2',
  'B1.1',
  'B1.2',
  'B2.1',
  'B2.2',
  'C1.1',
  'C1.2',
  'C2.1',
  'C2.2',
];

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * One small Gemini call per word. Returns null only when unconfigured;
   * a real API error throws so the job can retry (PRD §6 backoff).
   */
  async enrich(input: {
    word: string;
    pos: string;
    gender: string | null;
    glosses: string[];
    betterModel?: boolean;
  }): Promise<GeminiEnrichment | null> {
    if (!this.client) {
      this.logger.warn('GEMINI_API_KEY not set — skipping AI enrichment');
      return null;
    }

    const known = input.glosses.slice(0, 6).join('; ') || '(no glosses)';
    const prompt = [
      'You curate a premium German→English learner dictionary. Quality matters more',
      'than quantity: every field must be clean, accurate, and useful to a learner.',
      'No filler, no meta-commentary, no markdown — just the requested content.',
      '',
      `German headword: ${input.word}`,
      `Part of speech: ${input.pos}${input.gender ? ` (gender: ${input.gender})` : ''}`,
      `Reference glosses: ${known}`,
      '',
      'Return:',
      '- translation: the one most natural English translation (a few words). No list,',
      '  no parenthetical notes.',
      '- emoji: a single emoji that best represents the word, or "" if none truly fits.',
      `- cefrLevel: precise CEFR sub-level, one of: ${CEFR_LEVELS.join(', ')}.`,
      '- usageNote: ONE short, high-signal sentence (max ~30 words) telling the learner',
      '  how/when to use this word — its most common real use case plus the single most',
      '  important grammar pitfall (e.g. case it governs, separable prefix, irregular',
      '  plural, false friend). Skip anything obvious. No fluff.',
      '- examples: 2 to 4 natural example sentences, each showcasing a DIFFERENT common',
      '  use case or sense of the word, ordered easiest first and near the CEFR level.',
      '  Give fewer (even just 2) for words with limited everyday usage rather than',
      '  padding with contrived sentences. Each item: the German sentence using this',
      '  word + its natural English translation.',
      '- collocations: 0 to 4 common collocations, fixed phrases, or idioms that use',
      '  this word (e.g. for "Hund": "auf den Hund kommen" → "to go to the dogs").',
      '  Only include genuinely common ones; an empty list is fine if none stand out.',
      '- falseFriends: 0 to 2 false friends for English speakers — words that look or',
      '  sound similar but mean something different (e.g. "Rente" looks like "rent"',
      '  but means "pension"). Each item: the misleading word + a one-sentence',
      '  explanation. Empty list if none apply — do not force it.',
      `- register: this word's typical register/domain, one of: ${REGISTERS.join(', ')}.`,
      '  Use "neutral" for everyday words with no special register.',
      '- mnemonic: ONE short, genuinely helpful memory hook (max ~20 words) connecting',
      '  the word\'s sound or spelling to its meaning — e.g. via a cognate, a vivid',
      '  image, or wordplay. Use "" if you cannot think of a good one; a weak mnemonic',
      '  is worse than none.',
    ].join('\n');

    const res = await this.client.models.generateContent({
      model: input.betterModel ? 'gemini-2.5-flash' : MODEL,
      contents: prompt,
      config: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING },
            emoji: { type: Type.STRING },
            cefrLevel: { type: Type.STRING, enum: CEFR_LEVELS },
            usageNote: { type: Type.STRING },
            examples: {
              type: Type.ARRAY,
              minItems: 2,
              maxItems: 4,
              items: {
                type: Type.OBJECT,
                properties: {
                  de: { type: Type.STRING },
                  en: { type: Type.STRING },
                },
                required: ['de', 'en'],
              },
            },
            collocations: {
              type: Type.ARRAY,
              minItems: 0,
              maxItems: 4,
              items: {
                type: Type.OBJECT,
                properties: {
                  phrase: { type: Type.STRING },
                  translation: { type: Type.STRING },
                },
                required: ['phrase', 'translation'],
              },
            },
            falseFriends: {
              type: Type.ARRAY,
              minItems: 0,
              maxItems: 2,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['word', 'explanation'],
              },
            },
            register: { type: Type.STRING, enum: REGISTERS },
            mnemonic: { type: Type.STRING },
          },
          required: [
            'translation',
            'cefrLevel',
            'usageNote',
            'examples',
            'collocations',
            'falseFriends',
            'register',
            'mnemonic',
          ],
        },
      },
    });

    const text = res.text;
    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    const parsed = JSON.parse(text) as {
      translation?: string;
      emoji?: string;
      cefrLevel?: string;
      usageNote?: string;
      examples?: { de?: string; en?: string }[];
      collocations?: { phrase?: string; translation?: string }[];
      falseFriends?: { word?: string; explanation?: string }[];
      register?: string;
      mnemonic?: string;
    };

    return {
      translation: parsed.translation?.trim() || null,
      emoji: parsed.emoji?.trim() || null,
      cefrLevel: parsed.cefrLevel?.trim() || null,
      usageNote: parsed.usageNote?.trim() || null,
      examples: (parsed.examples ?? [])
        .filter((e): e is { de: string; en: string } => Boolean(e?.de && e?.en))
        .map((e) => ({ de: e.de.trim(), en: e.en.trim() }))
        .slice(0, 4),
      collocations: (parsed.collocations ?? [])
        .filter((c): c is { phrase: string; translation: string } =>
          Boolean(c?.phrase && c?.translation),
        )
        .map((c) => ({ phrase: c.phrase.trim(), translation: c.translation.trim() }))
        .slice(0, 4),
      falseFriends: (parsed.falseFriends ?? [])
        .filter((f): f is { word: string; explanation: string } =>
          Boolean(f?.word && f?.explanation),
        )
        .map((f) => ({ word: f.word.trim(), explanation: f.explanation.trim() }))
        .slice(0, 2),
      register: parsed.register?.trim() || null,
      mnemonic: parsed.mnemonic?.trim() || null,
    };
  }
}
