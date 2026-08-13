import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryService } from './dictionary.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EnrichmentService } from '../enrichment/enrichment.service';

type MockPrisma = {
  dictionaryEntry: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  lexiconEntry: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

type MockEnrichment = {
  requestEnrichment: ReturnType<typeof vi.fn>;
};

describe('DictionaryService', () => {
  let service: DictionaryService;
  let mockPrisma: MockPrisma;
  let mockEnrichment: MockEnrichment;

  beforeEach(() => {
    mockPrisma = {
      dictionaryEntry: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      lexiconEntry: {
        findMany: vi.fn(),
      },
    };

    mockEnrichment = {
      requestEnrichment: vi.fn(),
    };

    service = new DictionaryService(
      mockPrisma as unknown as PrismaService,
      mockEnrichment as unknown as EnrichmentService,
    );
  });

  describe('findOrCreateEntry', () => {
    it('returns existing entry without calling requestEnrichment', async () => {
      const existingEntry = { id: 'entry-1', word: 'Hund' };
      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(existingEntry);

      const result = await service.findOrCreateEntry('Hund');

      expect(result).toEqual({ id: 'entry-1', word: 'Hund' });
      expect(mockEnrichment.requestEnrichment).not.toHaveBeenCalled();
    });

    it('promotes lexicon lemma entry to dictionaryEntry stub without calling requestEnrichment', async () => {
      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(null);
      mockPrisma.lexiconEntry.findMany.mockResolvedValue([
        {
          id: 'lex-1',
          word: 'Hund',
          pos: 'noun',
          senses: [{ tags: [] }],
          _count: { senses: 1 },
        },
      ]);
      mockPrisma.dictionaryEntry.create.mockResolvedValue({
        id: 'entry-new',
        word: 'Hund',
      });

      const result = await service.findOrCreateEntry('Hund');

      expect(result).toEqual({ id: 'entry-new', word: 'Hund' });
      expect(mockPrisma.dictionaryEntry.create).toHaveBeenCalledWith({
        data: { lexiconEntryId: 'lex-1', word: 'Hund' },
        select: { id: true, word: true },
      });
      expect(mockEnrichment.requestEnrichment).not.toHaveBeenCalled();
    });

    it('returns null if no lexicon entry matches', async () => {
      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(null);
      mockPrisma.lexiconEntry.findMany.mockResolvedValue([]);

      const result = await service.findOrCreateEntry('nonexistent');

      expect(result).toBeNull();
      expect(mockEnrichment.requestEnrichment).not.toHaveBeenCalled();
    });
  });
});
