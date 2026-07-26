import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReviewRating, DictionaryEntry } from '@prisma/client';
import type { AutoGraduation, KnownWord } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_GRADUATE_MIN_REPS,
  AUTO_GRADUATE_PRIOR_THRESHOLD,
  AUTO_GRADUATE_THRESHOLD,
  CEFR_FREQUENCY_CEILING,
  CEFR_LEVELS,
  LEVEL_INFERENCE_LOOKBACK,
  LEVEL_INFERENCE_MIN_AVG,
  LEVEL_INFERENCE_MIN_SAMPLES,
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

  /** One-tap undo: returns the card to ACTIVE, due now, so it reappears in review. */
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
    // Due to Prisma limitations with bulk upserts on composite keys in sqlite/some engines,
    // we use a transaction over individual upserts.
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
      })
    );
    await this.prisma.$transaction(upserts);
  }

  /** Get highly frequent words the user has not started learning yet. */
  async getSuggestions(userId: string, limit: number): Promise<DictionaryEntry[]> {
    return this.prisma.dictionaryEntry.findMany({
      where: {
        lexiconEntry: { frequencyRank: { not: null } },
        cards: { none: { userId } },
      },
      orderBy: { lexiconEntry: { frequencyRank: 'asc' } },
      take: limit,
    }) as unknown as DictionaryEntry[]; // Return raw dictionary entries
  }


  /** Undo multiple known words in parallel. */
  async bulkUndo(userId: string, cardIds: string[]): Promise<void> {
    await Promise.all(cardIds.map((id) => this.undoKnown(userId, id)));
  }

  async undoKnown(userId: string, cardId: string): Promise<void> {
    const card = await this.prisma.card.findFirst({ where: { id: cardId, userId } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    if (card.knownState === 'ACTIVE') return;

    await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: cardId }, data: { knownState: 'ACTIVE', due: new Date() } }),
      // Pull the score back below the auto-graduation threshold so the very
      // next review doesn't immediately re-graduate it.
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
  ): Promise<{ user: { id: string; email: string; name: string | null; avatarUrl: string | null; timezone?: string | null; cefrLevel: string | null }; graduation: AutoGraduation | null }> {
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
      data: { cefrLevel: targetLevel },
      select: { id: true, email: true, name: true, avatarUrl: true, timezone: true, cefrLevel: true },
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
   * Re-estimates the user's effective CEFR level from recent review
   * performance and persists it if it changed. Returns the current (possibly
   * updated) level index, whether the level changed, plus any batch graduation
   * of "filler" words triggered by a level increase.
   */
  private async maybeUpdateCefrLevel(
    userId: string,
  ): Promise<{ index: number | null; levelChanged: boolean; graduation: AutoGraduation | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } });
    const currentIndex = cefrIndex(user?.cefrLevel);

    const logs = await this.prisma.reviewLog.findMany({
      where: { userId },
      orderBy: { reviewedAt: 'desc' },
      take: LEVEL_INFERENCE_LOOKBACK,
      select: { rating: true, card: { select: { dictionaryEntry: { select: { cefrLevel: true } } } } },
    });
    if (logs.length < LEVEL_INFERENCE_MIN_SAMPLES) return { index: currentIndex, levelChanged: false, graduation: null };

    const perLevel = new Map<number, { sum: number; count: number }>();
    for (const log of logs) {
      const index = cefrIndex(log.card.dictionaryEntry.cefrLevel);
      if (index === null) continue;
      const bucket = perLevel.get(index) ?? { sum: 0, count: 0 };
      bucket.sum += RATING_VALUES[log.rating];
      bucket.count += 1;
      perLevel.set(index, bucket);
    }

    let inferredIndex = currentIndex ?? -1;
    for (const [index, bucket] of perLevel) {
      if (bucket.count >= LEVEL_INFERENCE_MIN_SAMPLES && bucket.sum / bucket.count >= LEVEL_INFERENCE_MIN_AVG) {
        inferredIndex = Math.max(inferredIndex, index);
      }
    }

    const levelChanged = inferredIndex >= 0 && inferredIndex !== (currentIndex ?? -1);
    if (!levelChanged) return { index: currentIndex, levelChanged: false, graduation: null };

    await this.prisma.user.update({ where: { id: userId }, data: { cefrLevel: CEFR_LEVELS[inferredIndex] } });

    const graduation =
      currentIndex === null || inferredIndex > currentIndex
        ? await this.batchGraduateFillers(userId, inferredIndex)
        : null;
    return { index: inferredIndex, levelChanged: true, graduation };
  }

  /** Auto-marks unseen words at least two sub-levels below `levelIndex` as known. */
  private async batchGraduateFillers(userId: string, levelIndex: number): Promise<AutoGraduation | null> {
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
