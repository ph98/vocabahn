import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DecksService } from './decks.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DictionaryService } from '../dictionary/dictionary.service';

type MockPrisma = {
  userDeck: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  userDeckWord: {
    createMany: ReturnType<typeof vi.fn>;
  };
  card: {
    createMany: ReturnType<typeof vi.fn>;
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
      },
      userDeckWord: {
        createMany: vi.fn(),
      },
      card: {
        createMany: vi.fn(),
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
});
