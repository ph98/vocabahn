import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecksService } from './decks.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DictionaryService } from '../dictionary/dictionary.service';

type MockPrisma = {
  userDeck: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  userDeckWord: {
    createMany: ReturnType<typeof vi.fn>;
  };
  card: {
    createMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

type MockDictionary = {
  findOrCreateEntry: ReturnType<typeof vi.fn>;
  getEntry: ReturnType<typeof vi.fn>;
};

describe('DecksService', () => {
  let service: DecksService;
  let mockPrisma: MockPrisma;
  let mockDictionary: MockDictionary;

  beforeEach(() => {
    mockPrisma = {
      userDeck: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      userDeckWord: {
        createMany: vi.fn(),
      },
      card: {
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    mockDictionary = {
      findOrCreateEntry: vi.fn(),
      getEntry: vi.fn(),
    };

    service = new DecksService(
      mockPrisma as unknown as PrismaService,
      mockDictionary as unknown as DictionaryService,
    );
  });

  describe('importWords', () => {
    it('throws NotFoundException if deck does not exist', async () => {
      mockPrisma.userDeck.findUnique.mockResolvedValue(null);

      await expect(service.importWords('user-1', 'deck-99', ['Hund'])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if user does not own the deck', async () => {
      mockPrisma.userDeck.findUnique.mockResolvedValue({ userId: 'other-user' });

      await expect(service.importWords('user-1', 'deck-1', ['Hund'])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('resolves entries in parallel using findOrCreateEntry without calling getEntry', async () => {
      mockPrisma.userDeck.findUnique.mockResolvedValue({ userId: 'user-1' });

      mockDictionary.findOrCreateEntry.mockImplementation(async (word: string) => {
        if (word === 'Hund') return { id: 'entry-1', word: 'Hund' };
        if (word === 'Katze') return { id: 'entry-2', word: 'Katze' };
        return null;
      });

      const result = await service.importWords('user-1', 'deck-1', [
        'Hund',
        'Katze',
        'invalidword',
      ]);

      expect(result).toEqual({
        imported: 2,
        failed: ['invalidword'],
      });

      // Verify findOrCreateEntry was used instead of getEntry
      expect(mockDictionary.findOrCreateEntry).toHaveBeenCalledWith('Hund');
      expect(mockDictionary.findOrCreateEntry).toHaveBeenCalledWith('Katze');
      expect(mockDictionary.findOrCreateEntry).toHaveBeenCalledWith('invalidword');
      expect(mockDictionary.getEntry).not.toHaveBeenCalled();

      // Verify batch insertions were performed
      expect(mockPrisma.userDeckWord.createMany).toHaveBeenCalledWith({
        data: [
          { deckId: 'deck-1', dictionaryEntryId: 'entry-1' },
          { deckId: 'deck-1', dictionaryEntryId: 'entry-2' },
        ],
        skipDuplicates: true,
      });

      expect(mockPrisma.card.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', dictionaryEntryId: 'entry-1' },
          { userId: 'user-1', dictionaryEntryId: 'entry-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('deduplicates words input before resolving', async () => {
      mockPrisma.userDeck.findUnique.mockResolvedValue({ userId: 'user-1' });
      mockDictionary.findOrCreateEntry.mockResolvedValue({ id: 'entry-1', word: 'Hund' });

      const result = await service.importWords('user-1', 'deck-1', ['Hund', 'hund', 'HUND ']);

      expect(result).toEqual({
        imported: 1,
        failed: [],
      });
      expect(mockDictionary.findOrCreateEntry).toHaveBeenCalledTimes(1);
    });
  });

  describe('listDecks progress', () => {
    const deck = (id: string, entryIds: string[], overrides: Record<string, unknown> = {}) => ({
      id,
      title: `Deck ${id}`,
      description: null,
      isPublic: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { words: entryIds.length },
      user: { name: 'Test User' },
      words: entryIds.map((dictionaryEntryId) => ({ dictionaryEntryId })),
      ...overrides,
    });

    it('summarizes every deck from a single card query', async () => {
      mockPrisma.userDeck.findMany
        .mockResolvedValueOnce([deck('deck-1', ['e1', 'e2']), deck('deck-2', ['e3'])])
        .mockResolvedValueOnce([deck('deck-3', ['e1', 'e4'], { isPublic: true })]);
      mockPrisma.card.findMany.mockResolvedValue([
        { dictionaryEntryId: 'e1', state: 'LEARNING', knownState: 'AUTO_KNOWN' },
        { dictionaryEntryId: 'e2', state: 'RELEARNING', knownState: 'ACTIVE' },
        { dictionaryEntryId: 'e3', state: 'NEW', knownState: 'ACTIVE' },
      ]);

      const result = await service.listDecks('user-1');

      // Three decks, one query — no N+1.
      expect(mockPrisma.card.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.card.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', dictionaryEntryId: { in: ['e1', 'e2', 'e3', 'e4'] } },
        select: { dictionaryEntryId: true, state: true, knownState: true },
      });

      expect(result.myDecks[0].progress).toEqual({ learned: 1, inProgress: 1, notStarted: 0 });
      expect(result.myDecks[1].progress).toEqual({ learned: 0, inProgress: 0, notStarted: 1 });
      // Someone else's public deck reports *this* user's progress over its words.
      expect(result.publicDecks[0].progress).toEqual({ learned: 1, inProgress: 0, notStarted: 1 });
    });

    it('skips the card query entirely when no deck has words', async () => {
      mockPrisma.userDeck.findMany.mockResolvedValueOnce([deck('deck-1', [])]).mockResolvedValueOnce([]);

      const result = await service.listDecks('user-1');

      expect(mockPrisma.card.findMany).not.toHaveBeenCalled();
      expect(result.myDecks[0].progress).toEqual({ learned: 0, inProgress: 0, notStarted: 0 });
    });

    it('counts a duplicated entry once', async () => {
      mockPrisma.userDeck.findMany.mockResolvedValueOnce([deck('deck-1', ['e1', 'e1'])]).mockResolvedValueOnce([]);
      mockPrisma.card.findMany.mockResolvedValue([{ dictionaryEntryId: 'e1', state: 'REVIEW', knownState: 'ACTIVE' }]);

      const result = await service.listDecks('user-1');

      expect(result.myDecks[0].progress).toEqual({ learned: 1, inProgress: 0, notStarted: 0 });
    });
  });
});
