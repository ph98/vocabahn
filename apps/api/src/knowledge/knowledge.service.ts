import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReviewRating, DictionaryEntry, Prisma } from '@prisma/client';

import type {
  AutoGraduation,
  CalibrateDiagnosticBody,
  CalibrateDiagnosticResponse,
  DiagnosticProbeItem,
  FrontierWord,
  KnownWord,
  LevelBreakdownItem,
  User as SharedUser,
} from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_GRADUATE_MIN_REPS,
  AUTO_GRADUATE_PRIOR_THRESHOLD,
  AUTO_GRADUATE_THRESHOLD,
  CEFR_FREQUENCY_CEILING,
  CEFR_LEVELS,
  CEFR_SOURCE_CALIBRATED,
  CEFR_SOURCE_INFERRED,
  CEFR_SOURCE_MANUAL,
  LEARNER_SET_CEFR_SOURCES,
  LEVEL_DEMOTION_MIN_SAMPLES,
  LEVEL_INFERENCE_LOOKBACK,
  LEVEL_INFERENCE_MIN_AVG,
  LEVEL_INFERENCE_MIN_SAMPLES,
  MANUAL_LEVEL_GRACE_REVIEWS,
  PERFORMANCE_HISTORY_LIMIT,
  cefrIndex,
  clamp01,
  farFutureDate,
} from './constants';

function mergeGraduations(...graduations: (AutoGraduation | null)[]): AutoGraduation | null {
  const present = graduations.filter((g): g is AutoGraduation => g !== null);
  if (present.length === 0) return null;
  return {
    count: present.reduce((sum, g) => sum + g.count, 0),
    words: present.flatMap((g) => g.words),
  };
}

/**
 * The highest CEFR index the recent-review buckets support, or null when they
 * support nothing.
 *
 * Evidence at a level is only credited once every level *below* it that has
 * enough samples is also passing: competence is a ladder, and a learner who is
 * failing A2 has not demonstrated B2 no matter how well a few B2-tagged words
 * went. The first failing level therefore caps the result rather than being
 * averaged away.
 *
 * Demotion needs a fuller sample than promotion (`LEVEL_DEMOTION_MIN_SAMPLES`):
 * a bad run of five reviews should not cost a level.
 */
export function inferCefrIndexFromBuckets(
  perLevel: ReadonlyMap<number, { sum: number; count: number }>,
  currentIndex: number | null,
): number | null {
  const levels = [...perLevel.entries()].sort((a, b) => a[0] - b[0]);

  let cap = Infinity;
  let capCount = 0;
  let best: number | null = null;

  for (const [index, bucket] of levels) {
    if (index >= cap) break;
    if (bucket.count < LEVEL_INFERENCE_MIN_SAMPLES) continue;
    if (bucket.sum / bucket.count >= LEVEL_INFERENCE_MIN_AVG) {
      best = index;
    } else {
      // The lowest level with real evidence against it closes the ladder;
      // nothing above it can be credited.
      cap = index;
      capCount = bucket.count;
    }
  }

  if (best === null) return null;
  if (currentIndex === null || best > currentIndex) return best;
  if (best === currentIndex) return currentIndex;
  // Below the current level: only act on a sample big enough to mean it.
  return capCount >= LEVEL_DEMOTION_MIN_SAMPLES ? best : currentIndex;
}

const RATING_VALUES: Record<ReviewRating, number> = {
  AGAIN: 0,
  HARD: 0.4,
  GOOD: 0.8,
  EASY: 1,
};

export interface PriorInput {
  userCefrIndex: number | null;
  entryCefrLevel: string | null;
  frequencyRank: number | null;
}

export interface NewCardCandidate {
  dictionaryEntry: {
    cefrLevel: string | null;
    lexiconEntry: { frequencyRank: number | null };
  };
}

export interface BenchmarkProbe {
  word: string;
  cefrLevel: (typeof CEFR_LEVELS)[number] | null;
  pos?: string;
  translation?: string;
  isReal: boolean;
}

export const BENCHMARK_PROBES: BenchmarkProbe[] = [
  // A1.1
  { word: 'Hallo', cefrLevel: 'A1.1', pos: 'noun', translation: 'hello', isReal: true },
  { word: 'trinken', cefrLevel: 'A1.1', pos: 'verb', translation: 'to drink', isReal: true },
  { word: 'Tisch', cefrLevel: 'A1.1', pos: 'noun', translation: 'table', isReal: true },
  // A1.2
  { word: 'einkaufen', cefrLevel: 'A1.2', pos: 'verb', translation: 'to shop / buy groceries', isReal: true },
  { word: 'Bahnhof', cefrLevel: 'A1.2', pos: 'noun', translation: 'train station', isReal: true },
  { word: 'bezahlen', cefrLevel: 'A1.2', pos: 'verb', translation: 'to pay', isReal: true },
  // Pseudo-word 1
  { word: 'knörig', cefrLevel: null, isReal: false },
  // A2.1
  { word: 'Erfahrung', cefrLevel: 'A2.1', pos: 'noun', translation: 'experience', isReal: true },
  { word: 'pünktlich', cefrLevel: 'A2.1', pos: 'adj', translation: 'punctual / on time', isReal: true },
  { word: 'empfehlen', cefrLevel: 'A2.1', pos: 'verb', translation: 'to recommend', isReal: true },
  // A2.2
  { word: 'Zustand', cefrLevel: 'A2.2', pos: 'noun', translation: 'condition / state', isReal: true },
  { word: 'verhandeln', cefrLevel: 'A2.2', pos: 'verb', translation: 'to negotiate', isReal: true },
  { word: 'unabhängig', cefrLevel: 'A2.2', pos: 'adj', translation: 'independent', isReal: true },
  // Pseudo-word 2
  { word: 'berumpfen', cefrLevel: null, isReal: false },
  // B1.1
  { word: 'Maßnahme', cefrLevel: 'B1.1', pos: 'noun', translation: 'measure / action', isReal: true },
  { word: 'überzeugen', cefrLevel: 'B1.1', pos: 'verb', translation: 'to convince', isReal: true },
  { word: 'verlässlich', cefrLevel: 'B1.1', pos: 'adj', translation: 'reliable', isReal: true },
  // B1.2
  { word: 'auswirken', cefrLevel: 'B1.2', pos: 'verb', translation: 'to have an effect', isReal: true },
  { word: 'Anforderung', cefrLevel: 'B1.2', pos: 'noun', translation: 'requirement', isReal: true },
  { word: 'bewältigen', cefrLevel: 'B1.2', pos: 'verb', translation: 'to overcome / manage', isReal: true },
  // Pseudo-word 3
  { word: 'frechtlich', cefrLevel: null, isReal: false },
  // B2.1
  { word: 'Einschränkung', cefrLevel: 'B2.1', pos: 'noun', translation: 'limitation / restriction', isReal: true },
  { word: 'verblüffend', cefrLevel: 'B2.1', pos: 'adj', translation: 'astonishing / baffling', isReal: true },
  { word: 'voraussetzen', cefrLevel: 'B2.1', pos: 'verb', translation: 'to presuppose / require', isReal: true },
  // B2.2
  { word: 'Aufschluss', cefrLevel: 'B2.2', pos: 'noun', translation: 'insight / information', isReal: true },
  { word: 'beanstanden', cefrLevel: 'B2.2', pos: 'verb', translation: 'to object to / challenge', isReal: true },
  { word: 'unumgänglich', cefrLevel: 'B2.2', pos: 'adj', translation: 'unavoidable / essential', isReal: true },
  // Pseudo-word 4
  { word: 'zupfenhaft', cefrLevel: null, isReal: false },
  // C1.1
  { word: 'prägnant', cefrLevel: 'C1.1', pos: 'adj', translation: 'concise / succinct', isReal: true },
  { word: 'willkürlich', cefrLevel: 'C1.1', pos: 'adj', translation: 'arbitrary', isReal: true },
  { word: 'verharmlosen', cefrLevel: 'C1.1', pos: 'verb', translation: 'to downplay / trivialize', isReal: true },
  // C1.2
  { word: 'versäumen', cefrLevel: 'C1.2', pos: 'verb', translation: 'to miss / neglect', isReal: true },
  { word: 'anfechtbar', cefrLevel: 'C1.2', pos: 'adj', translation: 'contestable / voidable', isReal: true },
  { word: 'unentbehrlich', cefrLevel: 'C1.2', pos: 'adj', translation: 'indispensable', isReal: true },
  // Pseudo-word 5
  { word: 'schlorren', cefrLevel: null, isReal: false },
  // C2.1
  { word: 'beschwichtigen', cefrLevel: 'C2.1', pos: 'verb', translation: 'to appease / soothe', isReal: true },
  { word: 'Unbill', cefrLevel: 'C2.1', pos: 'noun', translation: 'injustice / hardship', isReal: true },
  { word: 'stichhaltig', cefrLevel: 'C2.1', pos: 'adj', translation: 'sound / valid', isReal: true },
  // C2.2
  { word: 'Klaue', cefrLevel: 'C2.2', pos: 'noun', translation: 'claw / illegible scrawl', isReal: true },
  { word: 'heischen', cefrLevel: 'C2.2', pos: 'verb', translation: 'to demand / crave', isReal: true },
  { word: 'verfänglich', cefrLevel: 'C2.2', pos: 'adj', translation: 'tricky / insidious', isReal: true },
  // Pseudo-word 6
  { word: 'verkrangeln', cefrLevel: null, isReal: false },
];

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estimated knowledge prior (0..1) for a word the user hasn't reviewed yet,
   * combining level inference and the frequency prior.
   */
  priorScore({ userCefrIndex, entryCefrLevel, frequencyRank }: PriorInput): number {
    if (userCefrIndex === null) return 0;

    let levelPrior = 0;
    const entryIndex = cefrIndex(entryCefrLevel);
    if (entryIndex !== null) {
      // Positive gap = entry is below the user's level → more likely already known.
      const gap = userCefrIndex - entryIndex;
      levelPrior = clamp01(0.5 + gap * 0.2);
    }

    let frequencyPrior = 0;
    if (frequencyRank !== null) {
      const ceilingIndex = Math.max(userCefrIndex - 1, 0);
      const ceiling = CEFR_FREQUENCY_CEILING[ceilingIndex] ?? 300;
      frequencyPrior = clamp01(1 - frequencyRank / ceiling);
    }

    return clamp01(0.5 * levelPrior + 0.5 * frequencyPrior);
  }

  /**
   * Orders new (never-reviewed) cards lowest-knowledge-score first, so a
   * session's introduction slots go to genuinely unknown material.
   */
  orderByPrior<T extends NewCardCandidate>(userCefrLevel: string | null, cards: T[]): T[] {
    const userCefrIndex = cefrIndex(userCefrLevel);
    return [...cards].sort(
      (a, b) =>
        this.priorScore({
          userCefrIndex,
          entryCefrLevel: a.dictionaryEntry.cefrLevel,
          frequencyRank: a.dictionaryEntry.lexiconEntry.frequencyRank,
        }) -
        this.priorScore({
          userCefrIndex,
          entryCefrLevel: b.dictionaryEntry.cefrLevel,
          frequencyRank: b.dictionaryEntry.lexiconEntry.frequencyRank,
        }),
    );
  }

  /**
   * Recomputes the knowledge score for the reviewed card, auto-graduates it
   * if it crosses the threshold, and re-infers the user's CEFR level (which
   * may trigger a batch graduation of "filler" words). Returns a summary of
   * any words newly marked known, for the "N words auto-marked as known"
   * notification.
   */
  async recomputeAfterReview(userId: string, cardId: string): Promise<AutoGraduation | null> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        dictionaryEntry: {
          select: { id: true, word: true, cefrLevel: true, lexiconEntry: { select: { frequencyRank: true } } },
        },
        reviewLogs: { orderBy: { reviewedAt: 'desc' }, take: PERFORMANCE_HISTORY_LIMIT, select: { rating: true } },
        user: { select: { cefrLevel: true } },
      },
    });
    if (!card) return null;

    const performance = this.performanceScore(card.reviewLogs.map((l) => l.rating));
    const prior = this.priorScore({
      userCefrIndex: cefrIndex(card.user.cefrLevel),
      entryCefrLevel: card.dictionaryEntry.cefrLevel,
      frequencyRank: card.dictionaryEntry.lexiconEntry.frequencyRank,
    });
    // Lean on the prior early on; once there's enough review history, performance dominates.
    const repWeight = clamp01(card.reps / AUTO_GRADUATE_MIN_REPS);
    const score = repWeight * performance + (1 - repWeight) * prior;

    await this.prisma.knowledgeScore.upsert({
      where: { userId_dictionaryEntryId: { userId, dictionaryEntryId: card.dictionaryEntryId } },
      create: { userId, dictionaryEntryId: card.dictionaryEntryId, score, components: { performance, prior, repWeight } },
      update: { score, components: { performance, prior, repWeight } },
    });

    let graduation: AutoGraduation | null = null;
    if (card.knownState === 'ACTIVE' && card.reps >= AUTO_GRADUATE_MIN_REPS && score >= AUTO_GRADUATE_THRESHOLD) {
      await this.prisma.card.update({
        where: { id: card.id },
        data: { knownState: 'AUTO_KNOWN', due: farFutureDate() },
      });
      graduation = { count: 1, words: [card.dictionaryEntry.word] };
    }

    const { index: cefrLevelIndex, levelChanged, graduation: fillerGraduation } = await this.maybeUpdateCefrLevel(userId);

    // Only sweep high-prior cards when the user's inferred level actually changes,
    // rather than scanning every single new card on every review.
    const highPriorGraduation =
      levelChanged && cefrLevelIndex !== null ? await this.batchGraduateHighPrior(userId, cefrLevelIndex) : null;

    return mergeGraduations(graduation, fillerGraduation, highPriorGraduation);
  }

  async listKnownWords(userId: string): Promise<KnownWord[]> {
    const cards = await this.prisma.card.findMany({
      where: { userId, knownState: { in: ['AUTO_KNOWN', 'USER_KNOWN'] } },
      orderBy: { updatedAt: 'desc' },
      include: { dictionaryEntry: { select: { id: true, word: true, translation: true, emoji: true, cefrLevel: true } } },
    });
    if (cards.length === 0) return [];

    const scores = await this.prisma.knowledgeScore.findMany({
      where: { userId, dictionaryEntryId: { in: cards.map((c) => c.dictionaryEntryId) } },
      select: { dictionaryEntryId: true, score: true },
    });
    const scoreByEntry = new Map(scores.map((s) => [s.dictionaryEntryId, s.score]));

    return cards.map((c) => ({
      cardId: c.id,
      dictionaryEntryId: c.dictionaryEntryId,
      word: c.dictionaryEntry.word,
      translation: c.dictionaryEntry.translation,
      emoji: c.dictionaryEntry.emoji,
      cefrLevel: c.dictionaryEntry.cefrLevel,
      reason: c.knownState === 'USER_KNOWN' ? 'MANUAL' : 'AUTO',
      score: scoreByEntry.get(c.dictionaryEntryId) ?? null,
      knownAt: c.updatedAt.toISOString(),
    }));
  }

  /** Mark a word as USER_KNOWN by its dictionary entry ID; creates the card if needed. */
  async markKnown(userId: string, dictionaryEntryId: string): Promise<void> {
    await this.prisma.card.upsert({
      where: { userId_dictionaryEntryId: { userId, dictionaryEntryId } },
      create: {
        userId,
        dictionaryEntryId,
        knownState: 'USER_KNOWN',
        due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year out
        stability: 100,
        difficulty: 1,
        elapsedDays: 0,
        scheduledDays: 365,
        reps: 0,
        lapses: 0,
        state: 'REVIEW',
      },
      update: { knownState: 'USER_KNOWN', due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    });
  }

  /** Bulk mark words as USER_KNOWN */
  async bulkMarkKnown(userId: string, dictionaryEntryIds: string[]): Promise<void> {
    const due = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const upserts = dictionaryEntryIds.map((dictionaryEntryId) =>
      this.prisma.card.upsert({
        where: { userId_dictionaryEntryId: { userId, dictionaryEntryId } },
        create: {
          userId,
          dictionaryEntryId,
          knownState: 'USER_KNOWN',
          due,
          stability: 100,
          difficulty: 1,
          elapsedDays: 0,
          scheduledDays: 365,
          reps: 0,
          lapses: 0,
          state: 'REVIEW',
        },
        update: { knownState: 'USER_KNOWN', due },
      }),
    );
    await this.prisma.$transaction(upserts);
  }

  /** Get words the user has not started learning or marked known yet, with optional search and level filtering. */
  async getSuggestions(
    userId: string,
    options: { limit?: number; offset?: number; cefrLevel?: string; search?: string } = {},
  ): Promise<DictionaryEntry[]> {
    const { limit = 50, offset = 0, cefrLevel, search } = options;

    const where: Prisma.DictionaryEntryWhereInput = {
      cards: { none: { userId, knownState: { in: ['AUTO_KNOWN', 'USER_KNOWN'] } } },
    };


    if (cefrLevel && cefrLevel.trim() !== '') {
      if (cefrLevel.includes('.')) {
        where.cefrLevel = cefrLevel;
      } else {
        where.cefrLevel = { startsWith: cefrLevel };
      }
    }

    if (search && search.trim().length > 0) {
      where.OR = [
        { word: { contains: search.trim(), mode: 'insensitive' } },
        { translation: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.dictionaryEntry.findMany({
      where,
      orderBy: [
        { cefrLevel: 'asc' },
        { lexiconEntry: { frequencyRank: 'asc' } },
      ],
      skip: offset,
      take: limit,
    }) as unknown as DictionaryEntry[];
  }

  /** Retrieve the battery of diagnostic probe questions for CEFR level calibration. */
  async getDiagnosticProbe(): Promise<{ items: DiagnosticProbeItem[] }> {
    // Try to find matching DictionaryEntry records for real probe words
    const realWords = BENCHMARK_PROBES.filter((p) => p.isReal).map((p) => p.word);
    const dbEntries = await this.prisma.dictionaryEntry.findMany({
      where: { word: { in: realWords, mode: 'insensitive' } },
      select: { id: true, word: true, cefrLevel: true, translation: true },
    });

    const dbMap = new Map(dbEntries.map((e) => [e.word.toLowerCase(), e]));

    const items: DiagnosticProbeItem[] = BENCHMARK_PROBES.map((probe, idx) => {
      const dbMatch = probe.isReal ? dbMap.get(probe.word.toLowerCase()) : null;
      return {
        id: dbMatch?.id ?? `probe-${idx}-${probe.word.toLowerCase()}`,
        word: probe.word,
        cefrLevel: probe.cefrLevel,
        pos: probe.pos ?? null,
        translation: dbMatch?.translation ?? probe.translation ?? null,
        isReal: probe.isReal,
      };
    });

    return { items };
  }

  /**
   * Evaluates user probe responses using psychometric Signal Detection Theory (LexTALE model),
   * computes the exact continuous CEFR sub-level, estimates vocabulary size, and batch-graduates
   * mastered baseline vocabulary.
   */
  async calibrateDiagnostic(userId: string, body: CalibrateDiagnosticBody): Promise<CalibrateDiagnosticResponse> {
    const { answers } = body;
    if (!answers || answers.length === 0) {
      throw new BadRequestException('Answers cannot be empty');
    }

    // 1. Calculate false alarm rate on pseudo-words
    const fakeAnswers = answers.filter((a) => !a.isReal);
    const totalFakes = fakeAnswers.length;
    const fakeHits = fakeAnswers.filter((a) => a.known).length;
    const falseAlarmRate = totalFakes > 0 ? fakeHits / totalFakes : 0;

    // 2. Evaluate performance per CEFR sub-level
    const breakdown: LevelBreakdownItem[] = [];
    const subLevelAccuracies: number[] = [];

    for (let idx = 0; idx < CEFR_LEVELS.length; idx++) {
      const level = CEFR_LEVELS[idx] ?? 'A1.1';
      const probeWordsForLevel = BENCHMARK_PROBES.filter((p) => p.isReal && p.cefrLevel === level).map((p) =>
        p.word.toLowerCase(),
      );

      const levelAnswers = answers.filter(
        (a) => a.isReal && a.word && probeWordsForLevel.includes(a.word.toLowerCase()),
      );

      const count = levelAnswers.length > 0 ? levelAnswers.length : 1;
      const knownCount = levelAnswers.filter((a) => a.known).length;
      const rawAccuracy = knownCount / count;
      // Damped false alarm correction
      const correctedAccuracy = clamp01(rawAccuracy - falseAlarmRate * 0.75);
      subLevelAccuracies.push(correctedAccuracy);

      let status: 'MASTERED' | 'FRONTIER' | 'LEARNING' = 'LEARNING';
      if (correctedAccuracy >= 0.7) {
        status = 'MASTERED';
      } else if (correctedAccuracy >= 0.35) {
        status = 'FRONTIER';
      }

      breakdown.push({
        cefrLevel: level,
        accuracy: Math.round(correctedAccuracy * 100) / 100,
        sampleCount: count,
        status,
      });
    }

    // 3. Determine the continuous estimated CEFR sub-level index
    const totalScore = subLevelAccuracies.reduce((sum, acc) => sum + acc, 0);
    let estimatedCefrIndex = Math.min(CEFR_LEVELS.length - 1, Math.max(0, Math.round(totalScore) - 1));
    if (totalScore < 0.5) {
      estimatedCefrIndex = 0; // A1.1
    }
    const estimatedCefrLevel = CEFR_LEVELS[estimatedCefrIndex] ?? 'A1.1';

    // Set the user's CEFR level
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        cefrLevel: estimatedCefrLevel,
        cefrLevelSource: CEFR_SOURCE_CALIBRATED,
        cefrLevelSetAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        timezone: true,
        cefrLevel: true,
        interests: true,
      },
    });

    // 4. Calculate estimated vocabulary size
    let estimatedVocabSize = 0;
    for (let i = 0; i < CEFR_LEVELS.length; i++) {
      const prevCeiling = i === 0 ? 0 : (CEFR_FREQUENCY_CEILING[i - 1] ?? 0);
      const currCeiling = CEFR_FREQUENCY_CEILING[i] ?? (prevCeiling + 300);
      const bandSize = currCeiling - prevCeiling;
      const acc = subLevelAccuracies[i] ?? 0;
      estimatedVocabSize += Math.round(bandSize * acc);
    }
    estimatedVocabSize = Math.max(150, Math.round(estimatedVocabSize / 50) * 50);


    // 5. Batch graduate lower-level words (levels where status == 'MASTERED' and index <= estimatedCefrIndex)
    const masteredLevels = breakdown
      .slice(0, estimatedCefrIndex + 1)
      .filter((b) => b.status === 'MASTERED')
      .map((b) => b.cefrLevel);

    let graduatedCount = 0;
    let graduatedWords: string[] = [];

    if (masteredLevels.length > 0) {
      // Find candidate entries to auto-mark as USER_KNOWN
      const candidateEntries = await this.prisma.dictionaryEntry.findMany({
        where: {
          cefrLevel: { in: masteredLevels },
        },
        select: { id: true, word: true },
        take: 2500,
      });

      if (candidateEntries.length > 0) {
        const entryIds = candidateEntries.map((e) => e.id);
        const due = farFutureDate();

        const upserts = entryIds.map((dictionaryEntryId) =>
          this.prisma.card.upsert({
            where: { userId_dictionaryEntryId: { userId, dictionaryEntryId } },
            create: {
              userId,
              dictionaryEntryId,
              knownState: 'USER_KNOWN',
              due,
              stability: 100,
              difficulty: 1,
              elapsedDays: 0,
              scheduledDays: 365,
              reps: 0,
              lapses: 0,
              state: 'REVIEW',
            },
            update: { knownState: 'USER_KNOWN', due },
          }),
        );

        await this.prisma.$transaction(upserts);
        graduatedCount = candidateEntries.length;
        graduatedWords = candidateEntries.slice(0, 50).map((e) => e.word);
      }
    }

    // 6. Fetch 8-12 frontier words around the estimated CEFR sub-level that are NOT known yet
    const frontierEntries = (await this.prisma.dictionaryEntry.findMany({
      where: {
        cefrLevel: estimatedCefrLevel,
        cards: { none: { userId, knownState: { in: ['AUTO_KNOWN', 'USER_KNOWN'] } } },
      },
      take: 12,
      select: { id: true, word: true, translation: true, emoji: true, cefrLevel: true },
    })) as unknown as FrontierWord[];

    const confidenceScore = clamp01(1 - falseAlarmRate);

    return {
      user,
      estimatedCefrLevel,
      estimatedCefrIndex,
      estimatedVocabSize,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      falseAlarmRate: Math.round(falseAlarmRate * 100) / 100,
      graduatedCount,
      graduatedWords,
      frontierWords: frontierEntries,
      breakdown,
    };
  }

  /** Undo multiple known words in an atomic batch transaction. */
  async bulkUndo(userId: string, cardIds: string[]): Promise<void> {
    if (!cardIds || cardIds.length === 0) return;

    const cards = await this.prisma.card.findMany({
      where: { id: { in: cardIds }, userId, knownState: { not: 'ACTIVE' } },
      select: { id: true, dictionaryEntryId: true },
    });
    if (cards.length === 0) return;

    const validCardIds = cards.map((c) => c.id);
    const entryIds = [...new Set(cards.map((c) => c.dictionaryEntryId))];

    await this.prisma.$transaction([
      this.prisma.card.updateMany({
        where: { id: { in: validCardIds } },
        data: { knownState: 'ACTIVE', due: new Date() },
      }),
      this.prisma.knowledgeScore.updateMany({
        where: {
          userId,
          dictionaryEntryId: { in: entryIds },
          score: { gte: AUTO_GRADUATE_THRESHOLD },
        },
        data: { score: AUTO_GRADUATE_THRESHOLD - 0.1 },
      }),
    ]);
  }

  async undoKnown(userId: string, cardId: string): Promise<void> {
    const card = await this.prisma.card.findFirst({ where: { id: cardId, userId } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    if (card.knownState === 'ACTIVE') return;

    await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: cardId }, data: { knownState: 'ACTIVE', due: new Date() } }),
      this.prisma.knowledgeScore.updateMany({
        where: { userId, dictionaryEntryId: card.dictionaryEntryId, score: { gte: AUTO_GRADUATE_THRESHOLD } },
        data: { score: AUTO_GRADUATE_THRESHOLD - 0.1 },
      }),
    ]);
  }

  private performanceScore(ratingsMostRecentFirst: ReviewRating[]): number {
    if (ratingsMostRecentFirst.length === 0) return 0;
    let weightedSum = 0;
    let weightTotal = 0;
    let weight = 1;
    for (const rating of ratingsMostRecentFirst) {
      weightedSum += RATING_VALUES[rating] * weight;
      weightTotal += weight;
      weight *= 0.7;
    }
    return weightedSum / weightTotal;
  }

  /**
   * Manually sets or updates the user's CEFR level (e.g. from onboarding or settings),
   * seeds the prior score, and triggers batch graduation of lower-level filler and
   * high-prior words if the level was set for the first time or increased.
   */
  async setUserCefrLevel(
    userId: string,
    level: string | null,
  ): Promise<{ user: SharedUser; graduation: AutoGraduation | null }> {
    const previousUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } });
    const prevIndex = cefrIndex(previousUser?.cefrLevel);

    let targetLevel = level;
    if (targetLevel !== null) {
      const idx = cefrIndex(targetLevel);
      if (idx === null) {
        throw new BadRequestException(`Invalid CEFR level: ${level}`);
      }
      targetLevel = CEFR_LEVELS[idx] ?? null;
    }

    const newIndex = cefrIndex(targetLevel);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      // Stamped as the learner's own: the inference leaves it alone until they
      // have reviewed enough afterwards to genuinely disagree.
      data: {
        cefrLevel: targetLevel,
        cefrLevelSource: targetLevel === null ? null : CEFR_SOURCE_MANUAL,
        cefrLevelSetAt: targetLevel === null ? null : new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        timezone: true,
        cefrLevel: true,
        interests: true,
      },
    });

    let graduation: AutoGraduation | null = null;
    if (newIndex !== null && (prevIndex === null || newIndex > prevIndex)) {
      const fillerGrad = await this.batchGraduateFillers(userId, newIndex);
      const highPriorGrad = await this.batchGraduateHighPrior(userId, newIndex);
      graduation = mergeGraduations(fillerGrad, highPriorGrad);
    }

    return { user: updatedUser, graduation };
  }

  /**
   * True while a level the learner set or measured themselves is still off
   * limits to the inference. The window is counted in reviews completed since
   * they set it, so it closes through study rather than through time — and a
   * learner who keeps correcting the level keeps winning.
   */
  private async isLearnerSetLevelProtected(
    userId: string,
    user: { cefrLevel: string | null; cefrLevelSource: string | null; cefrLevelSetAt: Date | null } | null,
  ): Promise<boolean> {
    if (!user?.cefrLevel || !user.cefrLevelSource) return false;
    if (!LEARNER_SET_CEFR_SOURCES.includes(user.cefrLevelSource)) return false;
    if (!user.cefrLevelSetAt) return true;

    const reviewsSince = await this.prisma.reviewLog.count({
      where: { userId, reviewedAt: { gt: user.cefrLevelSetAt } },
    });
    return reviewsSince < MANUAL_LEVEL_GRACE_REVIEWS;
  }

  /**
   * Re-estimates the user's effective CEFR level from recent review
   * performance and persists it if it changed. Returns the current (possibly
   * updated) level index, whether the level changed, plus any batch graduation
   * of "filler" words triggered by a level increase.
   *
   * Two rules keep this honest, both learned from a real regression where a
   * handful of trivial words mis-tagged `B2.1` by enrichment ("Ich", "Haben")
   * read as B2 competence and pinned an A2 learner at B2.1:
   *
   * - **The ladder.** A level only counts if every level *below* it that has
   *   enough evidence is also passing. Doing well on a few mis-tagged words
   *   can no longer vault a learner over the levels they are still failing.
   * - **The learner's own word wins.** A level the learner set or measured is
   *   left alone until they have reviewed enough afterwards to genuinely
   *   disagree with it.
   */
  private async maybeUpdateCefrLevel(
    userId: string,
  ): Promise<{ index: number | null; levelChanged: boolean; graduation: AutoGraduation | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cefrLevel: true, cefrLevelSource: true, cefrLevelSetAt: true },
    });
    const currentIndex = cefrIndex(user?.cefrLevel);
    const unchanged = { index: currentIndex, levelChanged: false, graduation: null };

    if (await this.isLearnerSetLevelProtected(userId, user)) return unchanged;

    const logs = await this.prisma.reviewLog.findMany({
      where: { userId },
      orderBy: { reviewedAt: 'desc' },
      take: LEVEL_INFERENCE_LOOKBACK,
      select: { rating: true, card: { select: { dictionaryEntry: { select: { cefrLevel: true } } } } },
    });
    if (logs.length < LEVEL_INFERENCE_MIN_SAMPLES) return unchanged;

    const perLevel = new Map<number, { sum: number; count: number }>();
    for (const log of logs) {
      const index = cefrIndex(log.card.dictionaryEntry.cefrLevel);
      if (index === null) continue;
      const bucket = perLevel.get(index) ?? { sum: 0, count: 0 };
      bucket.sum += RATING_VALUES[log.rating];
      bucket.count += 1;
      perLevel.set(index, bucket);
    }

    const inferredIndex = inferCefrIndexFromBuckets(perLevel, currentIndex);
    if (inferredIndex === null || inferredIndex === currentIndex) return unchanged;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        cefrLevel: CEFR_LEVELS[inferredIndex],
        cefrLevelSource: CEFR_SOURCE_INFERRED,
        cefrLevelSetAt: new Date(),
      },
    });

    const graduation =
      currentIndex === null || inferredIndex > currentIndex
        ? await this.batchGraduateFillers(userId, inferredIndex)
        : null;
    return { index: inferredIndex, levelChanged: true, graduation };
  }

  /** Auto-marks unseen words at least two sub-levels below `levelIndex` as known. */
  async batchGraduateFillers(userId: string, levelIndex: number): Promise<AutoGraduation | null> {
    const fillerCeiling = levelIndex - 2;
    if (fillerCeiling < 0) return null;

    const candidates = await this.prisma.card.findMany({
      where: {
        userId,
        knownState: 'ACTIVE',
        state: 'NEW',
        dictionaryEntry: { cefrLevel: { in: [...CEFR_LEVELS.slice(0, fillerCeiling + 1)] } },
      },
      select: { id: true, dictionaryEntry: { select: { word: true } } },
    });
    if (candidates.length === 0) return null;

    await this.prisma.card.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { knownState: 'AUTO_KNOWN', due: farFutureDate() },
    });

    return { count: candidates.length, words: candidates.map((c) => c.dictionaryEntry.word) };
  }

  /**
   * Auto-marks NEW (never-reviewed) cards whose prior alone — frequency rank
   * combined with the gap below the user's level — is overwhelming
   * ("a user performing well at rank ~3,000 gets high knowledge
   * priors for the top-1,000 words they haven't seen yet").
   */
  async batchGraduateHighPrior(userId: string, levelIndex: number): Promise<AutoGraduation | null> {
    const eligibleLevels = [...CEFR_LEVELS.slice(0, Math.max(0, levelIndex - 1))];
    if (eligibleLevels.length === 0) return null;

    const ceilingIndex = Math.max(levelIndex - 1, 0);
    const ceiling = CEFR_FREQUENCY_CEILING[ceilingIndex] ?? 300;
    const maxRank = Math.floor(0.2 * ceiling);

    const candidates = await this.prisma.card.findMany({
      where: {
        userId,
        knownState: 'ACTIVE',
        state: 'NEW',
        dictionaryEntry: {
          cefrLevel: { in: eligibleLevels },
          lexiconEntry: { frequencyRank: { lte: maxRank } },
        },
      },
      select: {
        id: true,
        dictionaryEntry: {
          select: { word: true, cefrLevel: true, lexiconEntry: { select: { frequencyRank: true } } },
        },
      },
    });

    const toGraduate = candidates.filter(
      (c) =>
        this.priorScore({
          userCefrIndex: levelIndex,
          entryCefrLevel: c.dictionaryEntry.cefrLevel,
          frequencyRank: c.dictionaryEntry.lexiconEntry.frequencyRank,
        }) >= AUTO_GRADUATE_PRIOR_THRESHOLD,
    );
    if (toGraduate.length === 0) return null;

    await this.prisma.card.updateMany({
      where: { id: { in: toGraduate.map((c) => c.id) } },
      data: { knownState: 'AUTO_KNOWN', due: farFutureDate() },
    });

    return { count: toGraduate.length, words: toGraduate.map((c) => c.dictionaryEntry.word) };
  }
}

