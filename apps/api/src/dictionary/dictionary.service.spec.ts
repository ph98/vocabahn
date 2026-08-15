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
    create: ReturnType<typeof vi.fn>;
  };
  wordForm: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
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
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      wordForm: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
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

    it('returns null if no lexicon entry matches and cannot be decomposed', async () => {
      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(null);
      mockPrisma.lexiconEntry.findMany.mockResolvedValue([]);

      const result = await service.findOrCreateEntry('nonexistent');

      expect(result).toBeNull();
      expect(mockEnrichment.requestEnrichment).not.toHaveBeenCalled();
    });

    it('filters by pos when pos is specified', async () => {
      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(null);
      mockPrisma.lexiconEntry.findMany.mockResolvedValue([
        {
          id: 'lex-verb',
          word: 'weis',
          pos: 'verb',
          senses: [{ tags: [] }],
          _count: { senses: 1 },
        },
      ]);
      mockPrisma.dictionaryEntry.create.mockResolvedValue({
        id: 'entry-verb',
        word: 'weis',
      });

      const result = await service.findOrCreateEntry('weis', 'verb');

      expect(result).toEqual({ id: 'entry-verb', word: 'weis' });
      expect(mockPrisma.lexiconEntry.findMany).toHaveBeenCalledWith({
        where: {
          word: { equals: 'weis', mode: 'insensitive' },
          pos: 'verb',
        },
        select: expect.anything(),
      });
      expect(mockPrisma.dictionaryEntry.create).toHaveBeenCalledWith({
        data: { lexiconEntryId: 'lex-verb', word: 'weis' },
        select: { id: true, word: true },
      });
    });

    it('decomposes and promotes compound words when word is not in lexicon directly', async () => {
      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(null);
      mockPrisma.lexiconEntry.findMany
        .mockResolvedValueOnce([]) // exact candidate check for Jugendhilfe
        .mockResolvedValueOnce([
          {
            id: 'lex-jugend',
            word: 'Jugend',
            pos: 'noun',
            gender: 'f',
            senses: [{ glosses: ['youth'], tags: [] }],
          },
          {
            id: 'lex-hilfe',
            word: 'Hilfe',
            pos: 'noun',
            gender: 'f',
            senses: [{ glosses: ['help'], tags: [] }],
          },
        ]); // decompounder candidate batch
      mockPrisma.lexiconEntry.create.mockResolvedValue({
        id: 'lex-compound-1',
        word: 'Jugendhilfe',
        pos: 'noun',
        gender: 'f',
      });
      mockPrisma.dictionaryEntry.create.mockResolvedValue({
        id: 'entry-compound-1',
        word: 'Jugendhilfe',
      });

      const result = await service.findOrCreateEntry('Jugendhilfe');

      expect(result).toEqual({ id: 'entry-compound-1', word: 'Jugendhilfe' });
      expect(mockPrisma.lexiconEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            word: 'Jugendhilfe',
            pos: 'noun',
            gender: 'f',
          }),
        }),
      );
    });
  });

  describe('getEntry', () => {
    it('queries dictionaryEntry with pos filter when pos is provided', async () => {
      const mockEntry = {
        id: 'entry-verb',
        word: 'weis',
        translation: 'to point',
        emoji: '👉',
        cefrLevel: 'B1.1',
        usageNote: null,
        collocations: null,
        falseFriends: null,
        register: null,
        mnemonic: null,
        imageUrl: null,
        audioUrl: null,
        enrichmentStatus: 'ENRICHED',
        examples: [],
        imageCredit: null,
        _count: { quizQuestions: 1 },
        lexiconEntry: {
          id: 'lex-verb',
          word: 'weis',
          pos: 'verb',
          gender: null,
          ipa: '/vaɪ̯s/',
          hyphenation: 'weis',
          etymology: null,
          frequencyRank: 500,
          raw: {},
          senses: [{ glosses: ['to point', 'to show'], tags: [], topics: [], synonyms: [], antonyms: [] }],
          forms: [],
        },
      };

      mockPrisma.dictionaryEntry.findFirst.mockResolvedValue(mockEntry);

      const result = await service.getEntry('weis', 'user-1', 'verb');

      expect(result.id).toBe('entry-verb');
      expect(result.pos).toBe('verb');
      expect(mockPrisma.dictionaryEntry.findFirst).toHaveBeenCalledWith({
        where: {
          word: 'weis',
          lexiconEntry: { pos: 'verb' },
        },
        include: expect.anything(),
      });
    });
  });
});
