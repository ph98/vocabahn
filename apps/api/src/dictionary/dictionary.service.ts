import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type {
  DictionaryEntryDetail,
  DictionarySearchResult,
} from '@vocabahn/shared';
import Fuse from 'fuse.js';
import { PrismaService } from '../prisma/prisma.service';

// When a word has several lexicon records, layer the dictionary entry on the
// most useful one (same heuristic as scripts/seed-dictionary.ts).
const POS_PRIORITY = ['noun', 'verb', 'adj', 'adv'];
const posRank = (pos: string) =>
  POS_PRIORITY.indexOf(pos) === -1 ? POS_PRIORITY.length : POS_PRIORITY.indexOf(pos);

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

  constructor(private readonly prisma: PrismaService) {}

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
   * the active dictionary is promoted to a PENDING stub instantly (PRD §4.2).
   */
  async getEntry(word: string): Promise<DictionaryEntryDetail> {
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
        select: { id: true, word: true, pos: true, _count: { select: { senses: true } } },
      });
      const best = candidates.sort(
        (a, b) =>
          posRank(a.pos) - posRank(b.pos) || b._count.senses - a._count.senses,
      )[0];
      if (!best) {
        throw new NotFoundException(`No entry for "${word}"`);
      }
      entry = await this.prisma.dictionaryEntry.create({
        data: { lexiconEntryId: best.id, word: best.word },
        include,
      });
      this.fuse.add(this.toSearchResult(entry));
      this.logger.log(`promoted "${best.word}" to active dictionary (pending enrichment)`);
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
      imageUrl: entry.imageUrl,
      audioUrl: entry.audioUrl,
      enrichmentStatus: entry.enrichmentStatus,
      examples: entry.examples.map((e) => ({ de: e.de, en: e.en })),
      senses: lex.senses.map((s) => ({
        glosses: s.glosses,
        tags: s.tags,
        topics: s.topics,
        synonyms: s.synonyms,
        antonyms: s.antonyms,
      })),
      forms: lex.forms.map((f) => ({ form: f.form, tags: f.tags })),
      imageCredit: entry.imageCredit && {
        authorName: entry.imageCredit.authorName,
        authorUrl: entry.imageCredit.authorUrl,
      },
    };
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
