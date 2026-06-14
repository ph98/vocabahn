import { Injectable, NotFoundException } from '@nestjs/common';
import type { AutoGraduation, ReviewCard, ReviewRating } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildReviewLogSnapshot, createScheduler, fromFsrsCard, ratingToFsrs, toFsrsCard } from '../fsrs/fsrs';
import { KnowledgeService } from '../knowledge/knowledge.service';

const cardInclude = {
  dictionaryEntry: {
    include: {
      lexiconEntry: { select: { pos: true, frequencyRank: true } },
      examples: { orderBy: { order: 'asc' as const } },
    },
  },
};

type CardWithEntry = NonNullable<Awaited<ReturnType<CardsService['findOwnedCard']>>>;

@Injectable()
export class CardsService {
  private readonly scheduler = createScheduler();

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async getDueCards(
    userId: string,
    { courseId, limit = 20 }: { courseId?: string; limit?: number },
  ): Promise<ReviewCard[]> {
    const baseWhere = {
      userId,
      knownState: 'ACTIVE' as const,
      due: { lte: new Date() },
      ...(courseId ? { dictionaryEntry: { courseWords: { some: { courseId } } } } : {}),
    };

    const dueReviews = await this.prisma.card.findMany({
      where: { ...baseWhere, state: { not: 'NEW' as const } },
      orderBy: { due: 'asc' },
      take: limit,
      include: cardInclude,
    });

    let cards = dueReviews;
    if (cards.length < limit) {
      const remaining = limit - cards.length;
      const newCards = await this.prisma.card.findMany({
        where: { ...baseWhere, state: 'NEW' as const },
        take: Math.max(remaining * 3, remaining),
        include: cardInclude,
      });
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } });
      const ordered = this.knowledge.orderByPrior(user?.cefrLevel ?? null, newCards);
      cards = [...cards, ...ordered.slice(0, remaining)];
    }

    return cards.map((c) => this.toReviewCard(c));
  }

  async submitReview(
    userId: string,
    cardId: string,
    { rating, latencyMs }: { rating: ReviewRating; latencyMs?: number },
  ): Promise<{ card: ReviewCard; autoGraduated: AutoGraduation | null }> {
    const card = await this.findOwnedCard(userId, cardId);
    if (!card) {
      throw new NotFoundException('Card not found');
    }

    const now = new Date();
    const { card: updated } = this.scheduler.next(toFsrsCard(card), now, ratingToFsrs(rating));

    const [saved] = await this.prisma.$transaction([
      this.prisma.card.update({
        where: { id: card.id },
        data: fromFsrsCard(updated),
        include: cardInclude,
      }),
      this.prisma.reviewLog.create({
        data: {
          cardId: card.id,
          userId,
          rating,
          latencyMs,
          ...buildReviewLogSnapshot(updated, now),
        },
      }),
    ]);

    const autoGraduated = await this.knowledge.recomputeAfterReview(userId, card.id);

    return { card: this.toReviewCard(saved), autoGraduated };
  }

  private findOwnedCard(userId: string, cardId: string) {
    return this.prisma.card.findFirst({
      where: { id: cardId, userId },
      include: cardInclude,
    });
  }

  private toReviewCard(card: CardWithEntry): ReviewCard {
    const entry = card.dictionaryEntry;
    return {
      id: card.id,
      due: card.due.toISOString(),
      state: card.state,
      reps: card.reps,
      lapses: card.lapses,
      entry: {
        id: entry.id,
        word: entry.word,
        pos: entry.lexiconEntry.pos,
        translation: entry.translation,
        emoji: entry.emoji,
        imageUrl: entry.imageUrl,
        audioUrl: entry.audioUrl,
        examples: entry.examples.map((e) => ({ de: e.de, en: e.en, audioUrl: e.audioUrl })),
      },
    };
  }
}
