import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CreateDeckBody, DeckDetail, DeckListResponse, DeckSummary, ImportWordsResponse, Progress, UpdateDeckBody } from '@vocabahn/shared';
import { distinctEntryIds, summarizeProgress, type ProgressCardState } from '../common/progress';
import { DictionaryService } from '../dictionary/dictionary.service';
import { PrismaService } from '../prisma/prisma.service';

const EMPTY_PROGRESS: Progress = { learned: 0, inProgress: 0, notStarted: 0 };

@Injectable()
export class DecksService {
  private readonly logger = new Logger(DecksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: DictionaryService,
  ) {}

  async listDecks(userId: string): Promise<DeckListResponse> {
    const include = {
      _count: { select: { words: true } },
      user: { select: { name: true } },
      words: { select: { dictionaryEntryId: true } },
    } as const;

    const [myDecks, publicDecks] = await Promise.all([
      this.prisma.userDeck.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include }),
      this.prisma.userDeck.findMany({
        where: { isPublic: true, userId: { not: userId } },
        orderBy: { createdAt: 'desc' },
        include,
      }),
    ]);

    // One card query for every deck on the page — not one per deck.
    const cardsByEntry = await this.cardStatesByEntry(
      userId,
      distinctEntryIds([...myDecks, ...publicDecks].flatMap((d) => d.words.map((w) => w.dictionaryEntryId))),
    );

    const toSummary = (d: (typeof myDecks)[number], isOwner: boolean): DeckSummary => ({
      id: d.id,
      title: d.title,
      description: d.description ?? null,
      isPublic: d.isPublic,
      wordCount: d._count.words,
      progress: this.summarizeEntries(distinctEntryIds(d.words.map((w) => w.dictionaryEntryId)), cardsByEntry),
      ownerName: d.user.name ?? null,
      isOwner,
      createdAt: d.createdAt.toISOString(),
    });

    return {
      myDecks: myDecks.map((d) => toSummary(d, true)),
      publicDecks: publicDecks.map((d) => toSummary(d, false)),
    };
  }

  async getDeck(userId: string, deckId: string): Promise<DeckDetail> {
    const deck = await this.prisma.userDeck.findUnique({
      where: { id: deckId },
      include: {
        _count: { select: { words: true } },
        user: { select: { name: true } },
        words: {
          orderBy: { addedAt: 'asc' },
          include: { dictionaryEntry: { select: { word: true, translation: true, emoji: true } } },
        },
      },
    });
    if (!deck) throw new NotFoundException('Deck not found');
    if (!deck.isPublic && deck.userId !== userId) throw new ForbiddenException();

    const entryIds = distinctEntryIds(deck.words.map((w) => w.dictionaryEntryId));

    return {
      id: deck.id,
      title: deck.title,
      description: deck.description ?? null,
      isPublic: deck.isPublic,
      wordCount: deck._count.words,
      progress: this.summarizeEntries(entryIds, await this.cardStatesByEntry(userId, entryIds)),
      ownerName: deck.user.name ?? null,
      isOwner: deck.userId === userId,
      createdAt: deck.createdAt.toISOString(),
      words: deck.words.map((w) => ({
        dictionaryEntryId: w.dictionaryEntryId,
        word: w.dictionaryEntry.word,
        translation: w.dictionaryEntry.translation ?? null,
        emoji: w.dictionaryEntry.emoji ?? null,
        addedAt: w.addedAt.toISOString(),
      })),
    };
  }

  async createDeck(userId: string, body: CreateDeckBody): Promise<DeckSummary> {
    const deck = await this.prisma.userDeck.create({
      data: { userId, title: body.title, description: body.description, isPublic: body.isPublic ?? false },
      include: { _count: { select: { words: true } }, user: { select: { name: true } } },
    });
    return {
      id: deck.id,
      title: deck.title,
      description: deck.description ?? null,
      isPublic: deck.isPublic,
      wordCount: 0,
      progress: EMPTY_PROGRESS,
      ownerName: deck.user.name ?? null,
      isOwner: true,
      createdAt: deck.createdAt.toISOString(),
    };
  }

  async updateDeck(userId: string, deckId: string, body: UpdateDeckBody): Promise<DeckSummary> {
    await this.assertOwner(userId, deckId);
    const deck = await this.prisma.userDeck.update({
      where: { id: deckId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
      },
      include: {
        _count: { select: { words: true } },
        user: { select: { name: true } },
        words: { select: { dictionaryEntryId: true } },
      },
    });
    const entryIds = distinctEntryIds(deck.words.map((w) => w.dictionaryEntryId));
    return {
      id: deck.id,
      title: deck.title,
      description: deck.description ?? null,
      isPublic: deck.isPublic,
      wordCount: deck._count.words,
      progress: this.summarizeEntries(entryIds, await this.cardStatesByEntry(userId, entryIds)),
      ownerName: deck.user.name ?? null,
      isOwner: true,
      createdAt: deck.createdAt.toISOString(),
    };
  }

  async deleteDeck(userId: string, deckId: string): Promise<void> {
    await this.assertOwner(userId, deckId);
    await this.prisma.userDeck.delete({ where: { id: deckId } });
  }

  async addWord(userId: string, deckId: string, entryId: string): Promise<{ added: true }> {
    await this.assertOwner(userId, deckId);
    const entry = await this.prisma.dictionaryEntry.findUnique({ where: { id: entryId }, select: { id: true } });
    if (!entry) throw new NotFoundException('Dictionary entry not found');
    await this.prisma.userDeckWord.upsert({
      where: { deckId_dictionaryEntryId: { deckId, dictionaryEntryId: entryId } },
      create: { deckId, dictionaryEntryId: entryId },
      update: {},
    });
    await this.prisma.card.createMany({
      data: [{ userId, dictionaryEntryId: entryId }],
      skipDuplicates: true,
    });
    return { added: true };
  }

  async removeWord(userId: string, deckId: string, entryId: string): Promise<void> {
    await this.assertOwner(userId, deckId);
    await this.prisma.userDeckWord.deleteMany({ where: { deckId, dictionaryEntryId: entryId } });
  }

  async importWords(userId: string, deckId: string, words: string[]): Promise<ImportWordsResponse> {
    await this.assertOwner(userId, deckId);

    const cleanedWords: string[] = [];
    const seen = new Set<string>();

    for (const raw of words) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        cleanedWords.push(trimmed);
      }
    }

    if (cleanedWords.length === 0) {
      return { imported: 0, failed: [] };
    }

    // Resolve entries in parallel without triggering enrichment or spending quota
    const resolvedResults = await Promise.all(
      cleanedWords.map(async (w) => {
        try {
          const entry = await this.dictionary.findOrCreateEntry(w);
          if (entry) return { word: w, entry };
        } catch {
          // ignore
        }
        return { word: w, entry: null };
      }),
    );

    const failed: string[] = [];
    const importedEntryIds: string[] = [];

    for (const res of resolvedResults) {
      if (res.entry) {
        importedEntryIds.push(res.entry.id);
      } else {
        failed.push(res.word);
      }
    }

    const uniqueEntryIds = [...new Set(importedEntryIds)];

    if (uniqueEntryIds.length > 0) {
      await this.prisma.$transaction([
        this.prisma.userDeckWord.createMany({
          data: uniqueEntryIds.map((dictionaryEntryId) => ({ deckId, dictionaryEntryId })),
          skipDuplicates: true,
        }),
        this.prisma.card.createMany({
          data: uniqueEntryIds.map((dictionaryEntryId) => ({ userId, dictionaryEntryId })),
          skipDuplicates: true,
        }),
      ]);
    }

    return { imported: uniqueEntryIds.length, failed };
  }

  private async cardStatesByEntry(userId: string, dictionaryEntryIds: string[]): Promise<Map<string, ProgressCardState>> {
    if (dictionaryEntryIds.length === 0) return new Map();
    const cards = await this.prisma.card.findMany({
      where: { userId, dictionaryEntryId: { in: dictionaryEntryIds } },
      select: { dictionaryEntryId: true, state: true, knownState: true },
    });
    return new Map(cards.map((c) => [c.dictionaryEntryId, { state: c.state, knownState: c.knownState }]));
  }

  /** `entryIds` must already be distinct. Same bucket definition as courses (`common/progress.ts`). */
  private summarizeEntries(entryIds: string[], cardsByEntry: Map<string, ProgressCardState>): Progress {
    const cards = entryIds.map((id) => cardsByEntry.get(id)).filter((c): c is ProgressCardState => c !== undefined);
    return summarizeProgress(cards, entryIds.length);
  }

  private async assertOwner(userId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.userDeck.findUnique({ where: { id: deckId }, select: { userId: true } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException();
  }
}
