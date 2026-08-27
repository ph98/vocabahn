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
    upsert: ReturnType<typeof vi.fn>;
  };
  dictionaryEntry: {
    findMany: ReturnType<typeof vi.fn>;
  };
  knowledgeScore: {
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  reviewLog: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
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
        upsert: vi.fn(),
      },
      dictionaryEntry: {
        findMany: vi.fn(),
      },
      knowledgeScore: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      reviewLog: {
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
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

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(batchSpy).toHaveBeenCalledWith('user-1', 5);
    });
  });

  describe('setUserCefrLevel', () => {
    it('throws BadRequestException if CEFR level string is invalid', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ cefrLevel: null });
      await expect(service.setUserCefrLevel('user-1', 'INVALID_LEVEL')).rejects.toThrow('Invalid CEFR level');
    });

    it('updates user CEFR level and graduates fillers + high prior cards when setting level for first time', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ cefrLevel: null });
      prismaMock.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        timezone: null,
        cefrLevel: 'B1.1',
      });
      prismaMock.card.findMany.mockResolvedValue([]); // No candidates found

      const result = await service.setUserCefrLevel('user-1', 'B1.1');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          cefrLevel: 'B1.1',
          cefrLevelSource: 'MANUAL',
          cefrLevelSetAt: expect.any(Date),
        },
        select: expect.any(Object),
      });

      expect(result.user.cefrLevel).toBe('B1.1');
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

  describe('getDiagnosticProbe', () => {
    it('returns a battery of probe items covering CEFR levels and pseudo-words', async () => {
      prismaMock.dictionaryEntry.findMany.mockResolvedValue([
        { id: 'entry-hallo', word: 'Hallo', cefrLevel: 'A1.1', translation: 'hello' },
      ]);

      const result = await service.getDiagnosticProbe();
      expect(result.items.length).toBeGreaterThanOrEqual(30);
      expect(result.items.some((item) => !item.isReal)).toBe(true);
      expect(result.items.some((item) => item.word.toLowerCase() === 'hallo')).toBe(true);
    });
  });

  describe('calibrateDiagnostic', () => {
    it('throws BadRequestException if answers are empty', async () => {
      await expect(service.calibrateDiagnostic('user-1', { answers: [] })).rejects.toThrow('Answers cannot be empty');
    });

    it('accurately estimates CEFR sub-level and graduates mastered vocabulary', async () => {
      prismaMock.dictionaryEntry.findMany
        .mockResolvedValueOnce([
          { id: 'e-1', word: 'Hallo' },
          { id: 'e-2', word: 'Tisch' },
        ])
        .mockResolvedValueOnce([
          { id: 'frontier-1', word: 'auswirken', translation: 'have an effect', emoji: '⚡', cefrLevel: 'B1.2' },
        ]);

      prismaMock.user.update.mockResolvedValue({

        id: 'user-1',
        email: 'learner@example.com',
        name: 'Learner',
        avatarUrl: null,
        timezone: null,
        cefrLevel: 'B1.2',
        interests: [],
      });

      // User knows all A1.1 to B1.2 words, does not know C-level or pseudo-words
      const mockAnswers = [
        // A1.1 to B1.2 -> known
        { id: '1', word: 'Hallo', isReal: true, known: true },
        { id: '2', word: 'trinken', isReal: true, known: true },
        { id: '3', word: 'Tisch', isReal: true, known: true },
        { id: '4', word: 'einkaufen', isReal: true, known: true },
        { id: '5', word: 'Bahnhof', isReal: true, known: true },
        { id: '6', word: 'bezahlen', isReal: true, known: true },
        { id: '7', word: 'Erfahrung', isReal: true, known: true },
        { id: '8', word: 'pünktlich', isReal: true, known: true },
        { id: '9', word: 'empfehlen', isReal: true, known: true },
        { id: '10', word: 'Zustand', isReal: true, known: true },
        { id: '11', word: 'verhandeln', isReal: true, known: true },
        { id: '12', word: 'unabhängig', isReal: true, known: true },
        { id: '13', word: 'Maßnahme', isReal: true, known: true },
        { id: '14', word: 'überzeugen', isReal: true, known: true },
        { id: '15', word: 'verlässlich', isReal: true, known: true },
        { id: '16', word: 'auswirken', isReal: true, known: true },
        { id: '17', word: 'Anforderung', isReal: true, known: true },
        { id: '18', word: 'bewältigen', isReal: true, known: true },
        // Pseudo-words -> not known (honest answer)
        { id: 'p1', word: 'knörig', isReal: false, known: false },
        { id: 'p2', word: 'berumpfen', isReal: false, known: false },
        { id: 'p3', word: 'frechtlich', isReal: false, known: false },
        // Advanced C1/C2 -> not known
        { id: '20', word: 'prägnant', isReal: true, known: false },
        { id: '21', word: 'beschwichtigen', isReal: true, known: false },
      ];

      const result = await service.calibrateDiagnostic('user-1', { answers: mockAnswers });

      expect(result.estimatedCefrLevel).toBe('B1.2');
      expect(result.falseAlarmRate).toBe(0);
      expect(result.confidenceScore).toBe(1);
      expect(result.estimatedVocabSize).toBeGreaterThan(1500);
      expect(result.breakdown.length).toBe(12);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          cefrLevel: 'B1.2',
          cefrLevelSource: 'CALIBRATED',
          cefrLevelSetAt: expect.any(Date),
        },
        select: expect.any(Object),
      });
    });
  });

  describe('CEFR level inference', () => {
    /** A review log row at `level` with `rating`, as the inference reads them. */
    const logs = (level: string, rating: string, n: number) =>
      Array(n).fill({ rating, card: { dictionaryEntry: { cefrLevel: level } } });

    const reviewing = (userLevel: string | null, extra: Record<string, unknown> = {}) => {
      prismaMock.card.findUnique.mockResolvedValue({
        id: 'card-1',
        dictionaryEntryId: 'entry-1',
        knownState: 'ACTIVE',
        reps: 1,
        dictionaryEntry: { word: 'test', cefrLevel: 'A1.1', lexiconEntry: { frequencyRank: 100 } },
        reviewLogs: [{ rating: 'GOOD' }],
        user: { cefrLevel: userLevel },
      });
      prismaMock.user.findUnique.mockResolvedValue({
        cefrLevel: userLevel,
        cefrLevelSource: null,
        cefrLevelSetAt: null,
        ...extra,
      });
      prismaMock.card.findMany.mockResolvedValue([]);
      prismaMock.user.update.mockResolvedValue({ cefrLevel: userLevel });
    };

    const writtenLevel = () =>
      prismaMock.user.update.mock.calls.length === 0
        ? null
        : (prismaMock.user.update.mock.calls[0][0].data.cefrLevel as string);

    // The regression this whole rule exists for: a handful of trivial words
    // mis-tagged B2.1 by enrichment must not read as B2 competence when the
    // learner is visibly failing A2.
    it('does not credit a high level while a lower one with real evidence is failing', async () => {
      reviewing('A2.1');
      prismaMock.reviewLog.findMany.mockResolvedValue([
        ...logs('A1.1', 'GOOD', 26),
        ...logs('A2', 'HARD', 21),
        ...logs('B2.1', 'EASY', 9),
      ]);

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(writtenLevel()).not.toBe('B2.1');
    });

    it('still promotes when every level below is passing', async () => {
      reviewing('A1.1');
      prismaMock.reviewLog.findMany.mockResolvedValue([
        ...logs('A1.1', 'EASY', 8),
        ...logs('A1.2', 'EASY', 8),
        ...logs('A2.1', 'EASY', 8),
      ]);

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(writtenLevel()).toBe('A2.1');
      expect(prismaMock.user.update.mock.calls[0][0].data.cefrLevelSource).toBe('INFERRED');
    });

    it('lowers the level when a failing level has a full sample behind it', async () => {
      reviewing('A2.1');
      prismaMock.reviewLog.findMany.mockResolvedValue([
        ...logs('A1.1', 'EASY', 10),
        ...logs('A2.1', 'AGAIN', 20),
      ]);

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(writtenLevel()).toBe('A1.1');
    });

    it('does not lower the level on a thin bad run', async () => {
      reviewing('A2.1');
      prismaMock.reviewLog.findMany.mockResolvedValue([
        ...logs('A1.1', 'EASY', 10),
        ...logs('A2.1', 'AGAIN', 6),
      ]);

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('leaves a learner-set level alone inside the grace window', async () => {
      reviewing('A2.1', { cefrLevelSource: 'MANUAL', cefrLevelSetAt: new Date('2026-08-01') });
      prismaMock.reviewLog.count.mockResolvedValue(12);
      prismaMock.reviewLog.findMany.mockResolvedValue(logs('B1.1', 'EASY', 30));

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(prismaMock.user.update).not.toHaveBeenCalled();
      // The window is spent in reviews, not in wall-clock time.
      expect(prismaMock.reviewLog.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', reviewedAt: { gt: new Date('2026-08-01') } },
      });
    });

    it('resumes inferring once the learner has reviewed past the grace window', async () => {
      reviewing('A1.1', { cefrLevelSource: 'MANUAL', cefrLevelSetAt: new Date('2026-08-01') });
      prismaMock.reviewLog.count.mockResolvedValue(150);
      prismaMock.reviewLog.findMany.mockResolvedValue([
        ...logs('A1.1', 'EASY', 8),
        ...logs('A1.2', 'EASY', 8),
      ]);

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(writtenLevel()).toBe('A1.2');
    });

    it('leaves a calibrated level alone inside the grace window too', async () => {
      reviewing('B1.1', { cefrLevelSource: 'CALIBRATED', cefrLevelSetAt: new Date('2026-08-01') });
      prismaMock.reviewLog.count.mockResolvedValue(3);
      prismaMock.reviewLog.findMany.mockResolvedValue(logs('A1.1', 'AGAIN', 40));

      await service.recomputeAfterReview('user-1', 'card-1');

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });
});

