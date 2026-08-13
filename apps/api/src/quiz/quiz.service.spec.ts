import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictionaryService } from '../dictionary/dictionary.service';
import type { PrismaService } from '../prisma/prisma.service';
import { QuizService, REPORT_SUPPRESS_THRESHOLD } from './quiz.service';

/**
 * `reviewLog` and `card` are mocked here purely so the tests can prove they are
 * never touched. `ReviewLog` is the FSRS source of truth and is replayed from
 * empty state on every offline sync; a quiz answer written into it would
 * reschedule the learner's card out of thin air.
 */
function makeMocks() {
  const prisma = {
    dictionaryEntry: { findUnique: vi.fn() },
    entryQuizQuestion: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    quizAttempt: { create: vi.fn().mockResolvedValue({ id: 'attempt-1' }) },
    quizQuestionReport: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    reviewLog: {
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    card: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    knowledgeScore: { upsert: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const dictionary = {
    findOrCreateEntry: vi.fn().mockResolvedValue({ id: 'entry-1', word: 'Hund' }),
  };
  const service = new QuizService(
    prisma as unknown as PrismaService,
    dictionary as unknown as DictionaryService,
  );
  return { prisma, dictionary, service };
}

function expectNoSchedulingWrites(prisma: ReturnType<typeof makeMocks>['prisma']) {
  for (const [name, fn] of Object.entries(prisma.reviewLog)) {
    expect(fn, `reviewLog.${name} must never be called by the quiz`).not.toHaveBeenCalled();
  }
  for (const [name, fn] of Object.entries(prisma.card)) {
    expect(fn, `card.${name} must never be called by the quiz`).not.toHaveBeenCalled();
  }
  expect(prisma.knowledgeScore.upsert).not.toHaveBeenCalled();
}

describe('QuizService.getQuiz', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.prisma.dictionaryEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      enrichmentStatus: 'ENRICHED',
    });
  });

  it('returns the entry status alongside the questions, without the answer key', async () => {
    mocks.prisma.entryQuizQuestion.findMany.mockResolvedValue([
      { id: 'q1', type: 'MEANING', prompt: 'What does “Hund” mean?', options: ['dog', 'cat', 'tree', 'window'] },
    ]);

    const result = await mocks.service.getQuiz('Hund', 'user-1');

    expect(result.status).toBe('ENRICHED');
    expect(result.questions).toEqual([
      { id: 'q1', type: 'MEANING', prompt: 'What does “Hund” mean?', options: ['dog', 'cat', 'tree', 'window'] },
    ]);
    expect(result.questions[0]).not.toHaveProperty('correctIndex');
    const select = mocks.prisma.entryQuizQuestion.findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty('correctIndex');
  });

  it('hides questions this user reported and questions reported by enough others', async () => {
    await mocks.service.getQuiz('Hund', 'user-1');

    const where = mocks.prisma.entryQuizQuestion.findMany.mock.calls[0]![0].where;
    expect(where.reportCount).toEqual({ lt: REPORT_SUPPRESS_THRESHOLD });
    expect(where.reports).toEqual({ none: { userId: 'user-1' } });
  });

  it('reports a pending entry as pending rather than erroring', async () => {
    mocks.prisma.dictionaryEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      enrichmentStatus: 'ENRICHING',
    });

    const result = await mocks.service.getQuiz('Hund', 'user-1');

    expect(result).toEqual({ status: 'ENRICHING', questions: [] });
  });

  it('404s for a word with no dictionary entry', async () => {
    mocks.dictionary.findOrCreateEntry.mockResolvedValue(null);

    await expect(mocks.service.getQuiz('nichtsdergleichen', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('QuizService.submitAttempt', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.prisma.entryQuizQuestion.findUnique.mockResolvedValue({
      id: 'q1',
      entryId: 'entry-1',
      options: ['cat', 'dog', 'tree', 'window'],
      correctIndex: 1,
      explanation: 'Hund is the everyday word for a dog.',
    });
  });

  it('grades server-side and stores the attempt in QuizAttempt', async () => {
    const result = await mocks.service.submitAttempt('q1', 'user-1', {
      selectedIndex: 1,
      latencyMs: 2400,
    });

    expect(result).toEqual({
      correct: true,
      correctIndex: 1,
      correctOption: 'dog',
      explanation: 'Hund is the everyday word for a dog.',
    });
    expect(mocks.prisma.quizAttempt.create).toHaveBeenCalledWith({
      data: {
        questionId: 'q1',
        entryId: 'entry-1',
        userId: 'user-1',
        selectedIndex: 1,
        correct: true,
        latencyMs: 2400,
      },
    });
  });

  it('never writes a quiz result into ReviewLog, a Card, or the knowledge score', async () => {
    await mocks.service.submitAttempt('q1', 'user-1', { selectedIndex: 1 });
    await mocks.service.submitAttempt('q1', 'user-1', { selectedIndex: 0 });

    expect(mocks.prisma.quizAttempt.create).toHaveBeenCalledTimes(2);
    expectNoSchedulingWrites(mocks.prisma);
  });

  it('records a wrong answer as wrong and reveals the correct option', async () => {
    const result = await mocks.service.submitAttempt('q1', 'user-1', { selectedIndex: 3 });

    expect(result.correct).toBe(false);
    expect(result.correctOption).toBe('dog');
    expect(mocks.prisma.quizAttempt.create.mock.calls[0]![0].data.correct).toBe(false);
  });

  it('rejects an index outside the question options', async () => {
    await expect(
      mocks.service.submitAttempt('q1', 'user-1', { selectedIndex: 9 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.prisma.quizAttempt.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown question', async () => {
    mocks.prisma.entryQuizQuestion.findUnique.mockResolvedValue(null);

    await expect(
      mocks.service.submitAttempt('gone', 'user-1', { selectedIndex: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('QuizService.reportQuestion', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.prisma.entryQuizQuestion.findUnique.mockResolvedValue({
      id: 'q1',
      entry: { word: 'Hund' },
    });
    mocks.prisma.quizQuestionReport.upsert.mockResolvedValue({
      reason: 'WRONG_ANSWER',
      comment: null,
    });
  });

  it('stores the report with the denormalized headword and counts it once', async () => {
    const result = await mocks.service.reportQuestion(
      'q1',
      'user-1',
      { reason: 'WRONG_ANSWER' },
      { userAgent: 'vitest', locale: 'en', path: '/word/Hund' },
    );

    expect(result).toEqual({ reason: 'WRONG_ANSWER', comment: null });
    expect(mocks.prisma.quizQuestionReport.upsert.mock.calls[0]![0].create.word).toBe('Hund');
    expect(mocks.prisma.entryQuizQuestion.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { reportCount: { increment: 1 } },
    });
    expectNoSchedulingWrites(mocks.prisma);
  });

  it('does not inflate the count when the same user re-reports', async () => {
    mocks.prisma.quizQuestionReport.findUnique.mockResolvedValue({ id: 'report-1' });

    await mocks.service.reportQuestion('q1', 'user-1', { reason: 'AMBIGUOUS' }, {});

    expect(mocks.prisma.entryQuizQuestion.update).not.toHaveBeenCalled();
  });
});

describe('quiz storage is structurally separate from FSRS scheduling', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  function modelBlock(name: string): string {
    const match = schema.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`));
    expect(match, `model ${name} must exist`).not.toBeNull();
    return match![1]!;
  }

  it('leaves ReviewLog with no knowledge of the quiz', () => {
    expect(modelBlock('ReviewLog').toLowerCase()).not.toContain('quiz');
  });

  it('keeps QuizAttempt off Card and ReviewLog entirely', () => {
    const block = modelBlock('QuizAttempt');
    expect(block).not.toMatch(/\bCard\b/);
    expect(block).not.toMatch(/\bReviewLog\b/);
    expect(block).toMatch(/question\s+EntryQuizQuestion\?/);
  });

  it('keeps a learner\'s answers when a question is replaced by re-enrichment', () => {
    expect(modelBlock('QuizAttempt')).toContain('onDelete: SetNull');
  });
});
