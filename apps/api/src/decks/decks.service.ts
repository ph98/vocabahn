import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateDeckBody, DeckDetail, DeckListResponse, DeckSummary, UpdateDeckBody } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) {}

  async listDecks(userId: string): Promise<DeckListResponse> {
    const [myDecks, publicDecks] = await Promise.all([
      this.prisma.userDeck.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { words: true } }, user: { select: { name: true } } },
      }),
      this.prisma.userDeck.findMany({
        where: { isPublic: true, userId: { not: userId } },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { words: true } }, user: { select: { name: true } } },
      }),
    ]);

    const toSummary = (d: (typeof myDecks)[number], isOwner: boolean): DeckSummary => ({
      id: d.id,
      title: d.title,
      description: d.description ?? null,
      isPublic: d.isPublic,
      wordCount: d._count.words,
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

    return {
      id: deck.id,
      title: deck.title,
      description: deck.description ?? null,
      isPublic: deck.isPublic,
      wordCount: deck._count.words,
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
      include: { _count: { select: { words: true } }, user: { select: { name: true } } },
    });
    return {
      id: deck.id,
      title: deck.title,
      description: deck.description ?? null,
      isPublic: deck.isPublic,
      wordCount: deck._count.words,
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
    return { added: true };
  }

  async removeWord(userId: string, deckId: string, entryId: string): Promise<void> {
    await this.assertOwner(userId, deckId);
    await this.prisma.userDeckWord.deleteMany({ where: { deckId, dictionaryEntryId: entryId } });
  }

  private async assertOwner(userId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.userDeck.findUnique({ where: { id: deckId }, select: { userId: true } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException();
  }
}
