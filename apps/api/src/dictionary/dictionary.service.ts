import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type {
  DictionaryEntryDetail,
  DictionarySearchResult,
} from '@vocabahn/shared';
import Fuse from 'fuse.js';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdjectiveDeclension, buildNounDeclension } from './declension';
import { buildVerbConjugation } from './verb-conjugation';

// When a word has several lexicon records, layer the dictionary entry on the
// most useful one (same heuristic as scripts/seed-dictionary.ts).
const POS_PRIORITY = ['noun', 'verb', 'adj', 'adv'];
const posRank = (pos: string) =>
  POS_PRIORITY.indexOf(pos) === -1 ? POS_PRIORITY.length : POS_PRIORITY.indexOf(pos);

// A lemma has at least one sense that is a real meaning, not a form-of/alt-of
// pointer to another word (e.g. "Hunde" = plural of Hund is *not* a lemma).
const FORM_TAGS = ['form-of', 'alt-of'];
const isLemma = (senses: { tags: string[] }[]) =>
  senses.some((s) => !s.tags.some((t) => FORM_TAGS.includes(t)));

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

  search(q: string): DictionarySearchResult[] {
    return this.fuse.search(q, { limit: 20 }).map((r) => r.item);
  }

  /**
   * Entry detail by headword. A word that exists in the lexicon but not yet in
   * the active dictionary is promoted to a PENDING stub instantly (PRD §4.2),
   * and viewing a not-yet-enriched word is what triggers enrichment — paid APIs
   * never run for the 10k promoted-but-unviewed entries.
   */
  async getEntry(
    word: string,
    userId: string,
    depth = 0,
  ): Promise<DictionaryEntryDetail> {
    const include = {
      examples: { orderBy: { order: 'asc' as const } },
      imageCredit: true,
      lexiconEntry: {
        include: {
          senses: { orderBy: { order: 'asc' as const } },
          forms: true,
        },
      },
    };

    let entry = await this.prisma.dictionaryEntry.findFirst({
      where: { word: { equals: word, mode: 'insensitive' } },
      include,
    });

    if (!entry) {
      const candidates = await this.prisma.lexiconEntry.findMany({
        where: { word: { equals: word, mode: 'insensitive' } },
        select: {
          id: true,
          word: true,
          pos: true,
          senses: { select: { tags: true } },
          _count: { select: { senses: true } },
        },
      });

      // Promote only real lemmas; inflected/alternative forms are never listed.
      const best = candidates
        .filter((c) => isLemma(c.senses))
        .sort((a, b) => posRank(a.pos) - posRank(b.pos) || b._count.senses - a._count.senses)[0];

      if (best) {
        entry = await this.prisma.dictionaryEntry.create({
          data: { lexiconEntryId: best.id, word: best.word },
          include,
        });
        this.fuse.add(this.toSearchResult(entry));
        this.logger.log(`promoted "${best.word}" to active dictionary (pending enrichment)`);
      } else if (candidates.length > 0 && depth < 2) {
        // The word exists only as an inflected/alternative form → show its lemma.
        const lemmaWord = await this.resolveLemmaWord(candidates.map((c) => c.id));
        if (lemmaWord && lemmaWord.toLowerCase() !== word.toLowerCase()) {
          return this.getEntry(lemmaWord, userId, depth + 1);
        }
        throw new NotFoundException(`No entry for "${word}"`);
      } else {
        throw new NotFoundException(`No entry for "${word}"`);
      }
    }

    // On-demand enrichment (PRD §4.2): fire only when the word is actually viewed
    // and still needs work. ENRICHING/ENRICHED entries are left alone.
    if (entry.enrichmentStatus === 'PENDING' || entry.enrichmentStatus === 'FAILED') {
      await this.enrichment.requestEnrichment(entry.id, userId);
    }

    const lex = entry.lexiconEntry;
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
      imageCredit: entry.imageCredit && {
        authorName: entry.imageCredit.authorName,
        authorUrl: entry.imageCredit.authorUrl,
      },
    };
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

  private toSearchResult(e: {
    word: string;
    translation: string | null;
    emoji: string | null;
    cefrLevel: string | null;
    enrichmentStatus: DictionarySearchResult['enrichmentStatus'];
    lexiconEntry: { pos: string; gender: string | null; frequencyRank: number | null };
  }): DictionarySearchResult {
    return {
      word: e.word,
      pos: e.lexiconEntry.pos,
      gender: e.lexiconEntry.gender,
      translation: e.translation,
      emoji: e.emoji,
      cefrLevel: e.cefrLevel,
      frequencyRank: e.lexiconEntry.frequencyRank,
      enrichmentStatus: e.enrichmentStatus,
    };
  }
}
