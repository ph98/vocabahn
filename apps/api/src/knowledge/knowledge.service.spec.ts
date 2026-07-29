import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTO_GRADUATE_PRIOR_THRESHOLD } from './constants';

type MockPrisma = {
  $transaction: ReturnType<typeof vi.fn>;
  card: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  knowledgeScore: {
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  reviewLog: {
    findMany: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let prismaMock: MockPrisma;

  beforeEach(() => {
    prismaMock = {
      $transaction: vi.fn().mockImplementation((promises) => Promise.all(promises)),
      card: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      knowledgeScore: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      reviewLog: {
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new KnowledgeService(prismaMock as unknown as PrismaService);
  });

  describe('priorScore', () => {
    it('returns 0 if user level is unknown', () => {
      expect(service.priorScore({ userCefrIndex: null, entryCefrLevel: 'A1.1', frequencyRank: 100 })).toBe(0);
    });

    it('calculates high prior for low entry level and high frequency rank', () => {
      // User B1.2 (index 5), Entry A1.1 (index 0), rank 100
      // gap = 5 -> levelPrior = 1.0 (clamped)
      // ceiling for B1.2 (index 5 - 1 = 4) = 2200 -> freqPrior = 1 - 100/2200 = 0.9545
      // prior = 0.5 * 1.0 + 0.5 * 0.9545 = 0.977 >= 0.9
      const score = service.priorScore({ userCefrIndex: 5, entryCefrLevel: 'A1.1', frequencyRank: 100 });
      expect(score).toBeGreaterThanOrEqual(AUTO_GRADUATE_PRIOR_THRESHOLD);
    });
  });

  describe('batchGraduateHighPrior', () => {
    it('returns null when eligibleLevels is empty (e.g. levelIndex = 0)', async () => {
      const result = await service.batchGraduateHighPrior('user-1', 0);
      expect(result).toBeNull();
      expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    });

    it('queries database with SQL filters on cefrLevel and frequencyRank', async () => {
      prismaMock.card.findMany.mockResolvedValue([
        {
          id: 'card-1',
          dictionaryEntry: {
            word: 'hund',
            cefrLevel: 'A1.1',
            lexiconEntry: { frequencyRank: 100 },
          },
        },
      ]);
      prismaMock.card.updateMany.mockResolvedValue({ count: 1 });

      // User B1.2 (index 5)
      const result = await service.batchGraduateHighPrior('user-1', 5);

      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          knownState: 'ACTIVE',
          state: 'NEW',
          dictionaryEntry: {
            cefrLevel: { in: ['A1.1', 'A1.2', 'A2.1', 'A2.2'] },
            lexiconEntry: { frequencyRank: { lte: 440 } }, // 0.2 * 2200 = 440
          },
        },
        select: expect.any(Object),
      });

      expect(prismaMock.card.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['card-1'] } },
        data: expect.objectContaining({ knownState: 'AUTO_KNOWN' }),
      });

      expect(result).toEqual({
        count: 1,
        words: ['hund'],
      });
    });
  });

  describe('recomputeAfterReview', () => {
    it('does NOT call batchGraduateHighPrior when user CEFR level does not change', async () => {
      prismaMock.card.findUnique.mockResolvedValue({
        id: 'card-1',
        dictionaryEntryId: 'entry-1',
        knownState: 'ACTIVE',
        reps: 1,
        dictionaryEntry: { word: 'test', cefrLevel: 'A1.1', lexiconEntry: { frequencyRank: 100 } },
        reviewLogs: [{ rating: 'GOOD' }],
        user: { cefrLevel: 'B1.1' },
      });
      prismaMock.user.findUnique.mockResolvedValue({ cefrLevel: 'B1.1' });
      // Return insufficient review logs to change level
      prismaMock.reviewLog.findMany.mockResolvedValue([]);

      const batchSpy = vi.spyOn(service, 'batchGraduateHighPrior');

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(batchSpy).not.toHaveBeenCalled();
    });

    it('calls batchGraduateHighPrior when user CEFR level changes', async () => {
      prismaMock.card.findUnique.mockResolvedValue({
        id: 'card-1',
        dictionaryEntryId: 'entry-1',
        knownState: 'ACTIVE',
        reps: 1,
        dictionaryEntry: { word: 'test', cefrLevel: 'B1.2', lexiconEntry: { frequencyRank: 100 } },
        reviewLogs: [{ rating: 'GOOD' }],
        user: { cefrLevel: 'A1.1' },
      });
      prismaMock.user.findUnique.mockResolvedValue({ cefrLevel: 'A1.1' });

      // Provide 5 samples at B1.2 with high rating to trigger level increase
      prismaMock.reviewLog.findMany.mockResolvedValue(
        Array(5).fill({
          rating: 'EASY',
          card: { dictionaryEntry: { cefrLevel: 'B1.2' } },
        }),
      );
      prismaMock.user.update.mockResolvedValue({ cefrLevel: 'B1.2' });
      prismaMock.card.findMany.mockResolvedValue([]); // fillers & high prior candidates

      const batchSpy = vi.spyOn(service, 'batchGraduateHighPrior');

      expect(batchSpy).toHaveBeenCalledWith('user-1', 5);
    });
  });

  describe('bulkUndo', () => {
    it('returns early when cardIds array is empty', async () => {
      await service.bulkUndo('user-1', []);
      expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    });

    it('performs single transaction batch update on matching cards', async () => {
      prismaMock.card.findMany.mockResolvedValue([
        { id: 'card-1', dictionaryEntryId: 'entry-1' },
        { id: 'card-2', dictionaryEntryId: 'entry-2' },
      ]);
      prismaMock.card.updateMany.mockResolvedValue({ count: 2 });
      prismaMock.knowledgeScore.updateMany.mockResolvedValue({ count: 2 });

      await service.bulkUndo('user-1', ['card-1', 'card-2']);

      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['card-1', 'card-2'] }, userId: 'user-1', knownState: { not: 'ACTIVE' } },
        select: { id: true, dictionaryEntryId: true },
      });
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.card.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['card-1', 'card-2'] } },
        data: expect.objectContaining({ knownState: 'ACTIVE' }),
      });
      expect(prismaMock.knowledgeScore.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          dictionaryEntryId: { in: ['entry-1', 'entry-2'] },
          score: { gte: expect.any(Number) },
        },
        data: expect.objectContaining({ score: expect.any(Number) }),
      });
    });
  });
});
