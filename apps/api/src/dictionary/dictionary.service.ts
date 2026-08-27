import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  compoundDecompositionSchema,
  type CompoundDecomposition,
  type DictionaryEntryDetail,
  type DictionarySearchResult,
} from '@vocabahn/shared';
import Fuse from 'fuse.js';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdjectiveDeclension, buildNounDeclension } from './declension';
import { decomposeGermanWord } from './decompounder';
import { buildPronunciation, buildTopics, buildWordFamily } from './lexicon-extras';
import { buildVerbConjugation } from './verb-conjugation';

import { compareLexiconCandidates, isLemma } from './lexicon-ranking';

// A sense tagged with any of these is a pointer to another word, not a meaning.
const FORM_TAGS = ['form-of', 'alt-of'];

@Injectable()
export class DictionaryService implements OnModuleInit {
  private readonly logger = new Logger(DictionaryService.name);
  private fuse = new Fuse<DictionarySearchResult>([], {
    keys: [
      { name: 'word', weight: 2 },
      { name: 'translation', weight: 1 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichment: EnrichmentService,
  ) {}

  async onModuleInit() {
    await this.rebuildIndex();
  }

  async rebuildIndex() {
    const entries = await this.prisma.dictionaryEntry.findMany({
      // `raw` is deliberately absent: it is the full Wiktionary payload, and
      // pulling it for every entry to build the index costs hundreds of MB.
      // Search results don't render the compound breakdown — the word page
      // fetches the entry itself for that.
      select: {
        word: true,
        translation: true,
        emoji: true,
        cefrLevel: true,
        enrichmentStatus: true,
        lexiconEntry: { select: { pos: true, gender: true, frequencyRank: true } },
      },
    });
    this.fuse.setCollection(entries.map((e) => this.toSearchResult(e)));
    this.logger.log(
      `search index built: ${entries.length} entries (index size ${this.fuse.getIndex().size()})`,
    );
  }

  async updateSearchIndex(id: string): Promise<void> {
    const entry = await this.prisma.dictionaryEntry.findUnique({
      where: { id },
      select: {
        word: true,
        translation: true,
        emoji: true,
        cefrLevel: true,
        enrichmentStatus: true,
        lexiconEntry: { select: { pos: true, gender: true, frequencyRank: true } },
      },
    });
    if (!entry) return;

    const result = this.toSearchResult(entry);
    this.fuse.remove((doc) => doc.word === result.word && doc.pos === result.pos);
    this.fuse.add(result);
    this.logger.log(`updated search index for "${result.word}" (${result.pos}) (${id})`);
  }

  search(q: string): DictionarySearchResult[] {
    return this.fuse.search(q, { limit: 20 }).map((r) => r.item);
  }

  /**
   * Resolves a word into a DictionaryEntry (promoting from Lexicon if needed)
   * without enqueuing background enrichment or consuming enrichment quota.
   */
  async findOrCreateEntry(
    word: string,
    pos?: string,
    depth = 0,
  ): Promise<{ id: string; word: string } | null> {
    const trimmed = word.trim();
    if (!trimmed) return null;

    let entry =
      (await this.prisma.dictionaryEntry.findFirst({
        where: {
          word: trimmed,
          ...(pos ? { lexiconEntry: { pos } } : {}),
        },
        select: { id: true, word: true },
      })) ??
      (await this.prisma.dictionaryEntry.findFirst({
        where: {
          word: { equals: trimmed, mode: 'insensitive' },
          ...(pos ? { lexiconEntry: { pos } } : {}),
        },
        select: { id: true, word: true },
      }));

    if (!entry) {
      const candidateSelect = {
        id: true,
        word: true,
        pos: true,
        senses: { select: { tags: true, glosses: true } },
        _count: { select: { senses: true } },
      } as const;
      const candidates = await this.prisma.lexiconEntry.findMany({
        where: {
          word: { equals: trimmed, mode: 'insensitive' },
          ...(pos ? { pos } : {}),
        },
        select: candidateSelect,
      });

      const best = candidates
        .filter((c) => isLemma(c.senses))
        .sort((a, b) => compareLexiconCandidates(a, b, trimmed))[0];

      if (best) {
        try {
          entry = await this.prisma.dictionaryEntry.create({
            data: { lexiconEntryId: best.id, word: best.word },
            select: { id: true, word: true },
          });
          this.fuse.add(
            this.toSearchResult({
              word: best.word,
              translation: null,
              emoji: null,
              cefrLevel: null,
              enrichmentStatus: 'PENDING',
              lexiconEntry: { pos: best.pos, gender: null, frequencyRank: null },
            }),
          );
          this.logger.log(`promoted "${best.word}" (${best.pos}) to active dictionary (pending enrichment)`);
        } catch (err: unknown) {
          if (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            entry = await this.prisma.dictionaryEntry.findFirst({
              where: { lexiconEntryId: best.id },
              select: { id: true, word: true },
            });
          }
          if (!entry) return null;
        }
      } else if (candidates.length > 0 && depth < 2) {
        const lemmaWord = await this.resolveLemmaWord(candidates.map((c) => c.id));
        if (lemmaWord && lemmaWord.toLowerCase() !== trimmed.toLowerCase()) {
          return this.findOrCreateEntry(lemmaWord, pos, depth + 1);
        }
        return null;
      } else {
        const decomp = await decomposeGermanWord(this.prisma, trimmed);
        if (decomp) {
          try {
            const gloss = `Compound ${decomp.pos}: ${decomp.left.word} (${decomp.left.translation || decomp.left.gloss || decomp.left.pos}) + ${decomp.right.word} (${decomp.right.translation || decomp.right.gloss || decomp.right.pos})`;
            const lex = await this.prisma.lexiconEntry.create({
              data: {
                word: trimmed,
                pos: decomp.pos,
                gender: decomp.gender,
                raw: { isCompound: true, compound: decomp },
                senses: {
                  create: [
                    {
                      order: 0,
                      glosses: [gloss],
                      tags: ['compound'],
                      topics: [],
                      synonyms: [],
                      antonyms: [],
                    },
                  ],
                },
              },
            });
            const trans = `${decomp.left.translation || decomp.left.gloss || decomp.left.word} + ${decomp.right.translation || decomp.right.gloss || decomp.right.word}`;
            entry = await this.prisma.dictionaryEntry.create({
              data: {
                lexiconEntryId: lex.id,
                word: trimmed,
                translation: trans,
                emoji: '🧩',
                usageNote: `Compound ${decomp.pos} formed from "${decomp.left.word}" and "${decomp.right.word}". The grammatical properties (gender, plural) are determined by "${decomp.right.word}".`,
              },
              select: { id: true, word: true },
            });
            this.fuse.add(
              this.toSearchResult({
                word: trimmed,
                translation: trans,
                emoji: '🧩',
                cefrLevel: null,
                enrichmentStatus: 'PENDING',
                lexiconEntry: {
                  pos: decomp.pos,
                  gender: decomp.gender,
                  frequencyRank: null,
                  raw: { compound: decomp },
                },
              }),
            );
            this.logger.log(`promoted compound "${trimmed}" (${decomp.pos}) to active dictionary`);
          } catch {
            entry = await this.prisma.dictionaryEntry.findFirst({
              where: { word: { equals: trimmed, mode: 'insensitive' } },
              select: { id: true, word: true },
            });
            if (!entry) return null;
          }
        } else {
          return null;
        }
      }
    }

    return { id: entry.id, word: entry.word };
  }

  /**
   * Resolves a batch of surface words into dictionary entries without enqueuing
   * background enrichment or consuming quota. Returns a map from normalized surface form
   * (lowercase) and exact word to the resolved entry ID and headword.
   */
  async resolveWordsToEntries(
    words: string[],
  ): Promise<Map<string, { id: string; word: string }>> {
    const map = new Map<string, { id: string; word: string }>();
    const cleanWords = [
      ...new Set(
        words
          .map((w) => w.trim())
          .filter((w) => w.length > 0 && /^[\p{L}ÄÖÜäöüß-]+$/u.test(w)),
      ),
    ];
    if (cleanWords.length === 0) return map;

    // 1. Bulk check existing DictionaryEntry
    const existing = await this.prisma.dictionaryEntry.findMany({
      where: {
        OR: [
          { word: { in: cleanWords } },
          { word: { in: cleanWords.map((w) => w.toLowerCase()), mode: 'insensitive' } },
        ],
      },
      select: { id: true, word: true },
    });

    for (const entry of existing) {
      map.set(entry.word, { id: entry.id, word: entry.word });
      map.set(entry.word.toLowerCase(), { id: entry.id, word: entry.word });
    }

    // 2. For words not found, try to resolve/promote
    const missing = cleanWords.filter(
      (w) => !map.has(w) && !map.has(w.toLowerCase()),
    );

    for (const word of missing) {
      try {
        const resolved = await this.findOrCreateEntry(word);
        if (resolved) {
          map.set(word, resolved);
          map.set(word.toLowerCase(), resolved);
          map.set(resolved.word, resolved);
          map.set(resolved.word.toLowerCase(), resolved);
        } else {
          // Check WordForm table for inflected form pointing to a lemma
          const wordForm = await this.prisma.wordForm.findFirst({
            where: { form: { equals: word, mode: 'insensitive' } },
            select: { entry: { select: { word: true } } },
          });
          if (wordForm?.entry?.word) {
            const lemmaResolved = await this.findOrCreateEntry(wordForm.entry.word);
            if (lemmaResolved) {
              map.set(word, lemmaResolved);
              map.set(word.toLowerCase(), lemmaResolved);
              map.set(lemmaResolved.word, lemmaResolved);
              map.set(lemmaResolved.word.toLowerCase(), lemmaResolved);
            }
          }
        }
      } catch {
        // Ignore single word resolution failure
      }
    }

    return map;
  }

  /**
   * Entry detail by headword. A word that exists in the lexicon but not yet in
   * the active dictionary is promoted to a PENDING stub instantly,
   * and viewing a not-yet-enriched word is what triggers enrichment — paid APIs
   * never run for the 10k promoted-but-unviewed entries.
   */
  async getEntry(
    word: string,
    userId: string,
    pos?: string,
    timeZone?: string,
    depth = 0,
  ): Promise<DictionaryEntryDetail> {
    const include = {
      examples: { orderBy: { order: 'asc' as const } },
      imageCredit: true,
      // Entries enriched before the quiz existed have none; the count drives
      // the same view-triggered backfill as the learner-aid fields did.
      _count: { select: { quizQuestions: true } },
      lexiconEntry: {
        include: {
          senses: { orderBy: { order: 'asc' as const } },
          forms: true,
        },
      },
    };

    // German case carries meaning (e.g. "Frau" the noun vs "frau" the pronoun),
    // so an exact-case match must win over a same-spelling different-case entry.
    let entry =
      (await this.prisma.dictionaryEntry.findFirst({
        where: {
          word,
          ...(pos ? { lexiconEntry: { pos } } : {}),
        },
        include,
      })) ??
      (await this.prisma.dictionaryEntry.findFirst({
        where: {
          word: { equals: word, mode: 'insensitive' },
          ...(pos ? { lexiconEntry: { pos } } : {}),
        },
        include,
      }));

    if (!entry) {
      const candidateSelect = {
        id: true,
        word: true,
        pos: true,
        senses: { select: { tags: true, glosses: true } },
        _count: { select: { senses: true } },
      } as const;
      const candidates = await this.prisma.lexiconEntry.findMany({
        where: {
          word: { equals: word, mode: 'insensitive' },
          ...(pos ? { pos } : {}),
        },
        select: candidateSelect,
      });

      // Promote only real lemmas; inflected/alternative forms are never listed.
      const best = candidates
        .filter((c) => isLemma(c.senses))
        .sort((a, b) => compareLexiconCandidates(a, b, word))[0];

      if (best) {
        try {
          entry = await this.prisma.dictionaryEntry.create({
            data: { lexiconEntryId: best.id, word: best.word },
            include,
          });
          this.fuse.add(this.toSearchResult(entry));
          this.logger.log(`promoted "${best.word}" (${best.pos}) to active dictionary (pending enrichment)`);
        } catch (err: unknown) {
          if (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            entry = await this.prisma.dictionaryEntry.findFirst({
              where: { lexiconEntryId: best.id },
              include,
            });
          }
          if (!entry) throw new NotFoundException(`No entry for "${word}"`);
        }
      } else if (candidates.length > 0 && depth < 2) {
        // The word exists only as an inflected/alternative form: show the
        // lemma's entry with a banner describing this form (e.g. "plural of Hund").
        const lemmaWord = await this.resolveLemmaWord(candidates.map((c) => c.id));
        if (lemmaWord && lemmaWord.toLowerCase() !== word.toLowerCase()) {
          const lemmaEntry = await this.getEntry(lemmaWord, userId, pos, timeZone, depth + 1);
          // Drop Wiktextract's "inflection of X:" boilerplate gloss, keeping
          // only the descriptive part (e.g. "first/third-person plural preterite").
          const descriptions = [
            ...new Set(
              candidates.flatMap((c) =>
                c.senses
                  .filter((s) => s.tags.some((t) => FORM_TAGS.includes(t)))
                  .flatMap((s) => s.glosses)
                  .filter((g) => !/^inflection of .+:$/.test(g)),
              ),
            ),
          ];
          return { ...lemmaEntry, word, formOf: { lemma: lemmaWord, descriptions } };
        }
        throw new NotFoundException(`No entry for "${word}"`);
      } else {
        const created = await this.findOrCreateEntry(word, pos);
        if (created) {
          return this.getEntry(created.word, userId, pos, timeZone, depth + 1);
        }
        throw new NotFoundException(`No entry for "${word}"`);
      }
    }

    // Check for a primary sibling lexicon entry (e.g. "wenn" conj vs "Wenn" noun,
    // or "hallo" intj vs "Hallo" noun) or an alt-of case variant (e.g. "Du" pron -> "du").
    // ONLY do sibling merge when NO specific POS was requested!
    if (!pos && depth < 2) {
      const candidateSelect = {
        id: true,
        word: true,
        pos: true,
        senses: { select: { tags: true, glosses: true } },
        _count: { select: { senses: true } },
      } as const;
      const siblings = await this.prisma.lexiconEntry.findMany({
        where: { word: { equals: word, mode: 'insensitive' } },
        select: candidateSelect,
      });
      const bestSibling = siblings
        .filter((c) => isLemma(c.senses))
        .sort((a, b) => compareLexiconCandidates(a, b))[0];

      if (bestSibling && bestSibling.id !== entry.lexiconEntryId) {
        const merged = await this.getEntry(bestSibling.word, userId, undefined, timeZone, depth + 1);
        const existingGlosses = new Set(merged.senses.flatMap((s) => s.glosses));
        const extraSenses = entry.lexiconEntry.senses
          .filter((s) => !s.glosses.some((g) => existingGlosses.has(g)))
          .map((s) => ({
            glosses: s.glosses,
            tags: s.tags,
            topics: s.topics,
            synonyms: s.synonyms,
            antonyms: s.antonyms,
          }));
        return {
          ...merged,
          word,
          senses: [...merged.senses, ...extraSenses],
        };
      }

      const caseVariant = await this.findCaseVariantLemma(word, entry.lexiconEntryId);
      if (caseVariant) {
        const target = await this.prisma.dictionaryEntry.findFirst({ where: { word: caseVariant }, include });
        if (target && target.id !== entry.id) {
          const merged = await this.getEntry(caseVariant, userId, undefined, timeZone, depth + 1);
          return {
            ...merged,
            word,
            senses: [
              ...merged.senses,
              ...entry.lexiconEntry.senses.map((s) => ({
                glosses: s.glosses,
                tags: s.tags,
                topics: s.topics,
                synonyms: s.synonyms,
                antonyms: s.antonyms,
              })),
            ],
          };
        }
      }
    }

    // On-demand enrichment: fire only when the word is actually viewed
    // and still needs work. Also re-enrich entries that predate the AI learner
    // aids (collocations/false friends/register/mnemonic) or the per-word quiz,
    // so both backfill on view rather than in a bulk sweep.
    if (
      entry.enrichmentStatus === 'PENDING' ||
      entry.enrichmentStatus === 'FAILED' ||
      (entry.enrichmentStatus === 'ENRICHED' &&
        (entry.register === null || entry._count.quizQuestions === 0))
    ) {
      await this.enrichment.requestEnrichment(entry.id, userId, timeZone);
    }

    const lex = entry.lexiconEntry;
    const raw = lex.raw as { isCompound?: boolean; compound?: CompoundDecomposition } | null;
    let compound: CompoundDecomposition | null = raw?.compound ?? null;
    if (!compound && entry.word.length >= 6) {
      compound = await decomposeGermanWord(this.prisma, entry.word);
    }

    return {
      id: entry.id,
      word: entry.word,
      pos: lex.pos,
      gender: lex.gender,
      ipa: lex.ipa,
      hyphenation: lex.hyphenation,
      etymology: lex.etymology,
      frequencyRank: lex.frequencyRank,
      translation: entry.translation,
      emoji: entry.emoji,
      cefrLevel: entry.cefrLevel,
      usageNote: entry.usageNote,
      collocations: (entry.collocations as { phrase: string; translation: string }[] | null) ?? [],
      falseFriends: (entry.falseFriends as { word: string; explanation: string }[] | null) ?? [],
      register: entry.register,
      mnemonic: entry.mnemonic,
      imageUrl: entry.imageUrl,
      audioUrl: entry.audioUrl,
      enrichmentStatus: entry.enrichmentStatus,
      examples: entry.examples.map((e) => ({ de: e.de, en: e.en, audioUrl: e.audioUrl })),
      senses: lex.senses.map((s) => ({
        glosses: s.glosses,
        tags: s.tags,
        topics: s.topics,
        synonyms: s.synonyms,
        antonyms: s.antonyms,
      })),
      forms: lex.forms.map((f) => ({ form: f.form, tags: f.tags })),
      conjugation: lex.pos === 'verb' ? buildVerbConjugation(entry.word, lex.forms) : null,
      nounDeclension: lex.pos === 'noun' ? buildNounDeclension(entry.word, lex.forms) : null,
      adjectiveDeclension: lex.pos === 'adj' ? buildAdjectiveDeclension(entry.word, lex.forms) : null,
      wordFamily: buildWordFamily(lex.raw),
      pronunciation: buildPronunciation(lex.raw),
      topics: buildTopics(lex.raw),
      formOf: null,
      compound,
      imageCredit: entry.imageCredit && {
        authorName: entry.imageCredit.authorName,
        authorUrl: entry.imageCredit.authorUrl,
      },
    };
  }

  /**
   * A sibling lexicon entry for the same exact spelling that is just an
   * alternative letter-case form of a different word (e.g. "Du" the pronoun
   * is alt-of "du"). Returns that other word if one exists.
   */
  private async findCaseVariantLemma(word: string, excludeLexiconEntryId: string): Promise<string | null> {
    const siblings = await this.prisma.lexiconEntry.findMany({
      where: { word, NOT: { id: excludeLexiconEntryId } },
      select: { raw: true },
    });
    for (const sibling of siblings) {
      const senses =
        (
          sibling.raw as {
            senses?: { tags?: string[]; form_of?: { word?: string }[]; alt_of?: { word?: string }[] }[];
          }
        )?.senses ?? [];
      for (const sense of senses) {
        if (!sense.tags?.some((t) => FORM_TAGS.includes(t))) continue;
        const target = sense.form_of?.[0]?.word ?? sense.alt_of?.[0]?.word;
        if (target && target !== word && target.toLowerCase() === word.toLowerCase()) {
          return target;
        }
      }
    }
    return null;
  }

  /** Lemma headword that a set of form-of/alt-of lexicon entries points to. */
  private async resolveLemmaWord(entryIds: string[]): Promise<string | null> {
    const rows = await this.prisma.lexiconEntry.findMany({
      where: { id: { in: entryIds } },
      select: { raw: true },
    });
    for (const row of rows) {
      const senses =
        (row.raw as { senses?: { form_of?: { word?: string }[]; alt_of?: { word?: string }[] }[] })
          ?.senses ?? [];
      for (const s of senses) {
        const lemma = s.form_of?.[0]?.word ?? s.alt_of?.[0]?.word;
        if (lemma) return lemma;
      }
    }
    return null;
  }

  /** Top-1000 enriched entries serialized for offline use. */
  async getOfflinePack(): Promise<Array<{
    word: string; pos: string; gender: string | null; translation: string | null;
    emoji: string | null; cefrLevel: string | null; frequencyRank: number | null;
  }>> {
    const rows = await this.prisma.dictionaryEntry.findMany({
      where: { enrichmentStatus: 'ENRICHED' },
      orderBy: { lexiconEntry: { frequencyRank: 'asc' } },
      take: 1000,
      select: {
        word: true,
        translation: true,
        emoji: true,
        cefrLevel: true,
        lexiconEntry: { select: { pos: true, gender: true, frequencyRank: true } },
      },
    });
    return rows.map((e) => ({
      word: e.word,
      pos: e.lexiconEntry.pos,
      gender: e.lexiconEntry.gender,
      translation: e.translation,
      emoji: e.emoji,
      cefrLevel: e.cefrLevel,
      frequencyRank: e.lexiconEntry.frequencyRank,
    }));
  }

  private toSearchResult(e: {
    word: string;
    translation: string | null;
    emoji: string | null;
    cefrLevel: string | null;
    enrichmentStatus: DictionarySearchResult['enrichmentStatus'];
    lexiconEntry: {
      pos: string;
      gender: string | null;
      frequencyRank: number | null;
      raw?: unknown;
    };
  }): DictionarySearchResult {
    const raw = e.lexiconEntry.raw as { isCompound?: boolean; compound?: CompoundDecomposition } | undefined;
    const compoundParsed = compoundDecompositionSchema.safeParse(raw?.compound);
    return {
      word: e.word,
      pos: e.lexiconEntry.pos,
      gender: e.lexiconEntry.gender,
      translation: e.translation,
      emoji: e.emoji,
      cefrLevel: e.cefrLevel,
      frequencyRank: e.lexiconEntry.frequencyRank,
      enrichmentStatus: e.enrichmentStatus,
      compound: compoundParsed.success ? compoundParsed.data : null,
    };
  }
}
