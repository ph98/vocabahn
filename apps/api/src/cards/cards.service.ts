import { Injectable, NotFoundException } from '@nestjs/common';
import type { ReviewCard, ReviewMode, ReviewRating } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildReviewLogSnapshot, createScheduler, fromFsrsCard, ratingToFsrs, toFsrsCard } from '../fsrs/fsrs';

const cardInclude = {
  dictionaryEntry: {
    include: {
      lexiconEntry: { select: { pos: true } },
      examples: { orderBy: { order: 'asc' as const } },
    },
  },
};

type CardWithEntry = NonNullable<Awaited<ReturnType<CardsService['findOwnedCard']>>>;

@Injectable()
export class CardsService {
  private readonly scheduler = createScheduler();

  constructor(private readonly prisma: PrismaService) {}

  async getDueCards(
    userId: string,
    { courseId, limit = 20 }: { courseId?: string; limit?: number },
  ): Promise<ReviewCard[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        knownState: 'ACTIVE',
        due: { lte: new Date() },
        ...(courseId
          ? { dictionaryEntry: { courseWords: { some: { courseId } } } }
          : {}),
      },
      orderBy: { due: 'asc' },
      take: limit,
      include: cardInclude,
    });
    return cards.map((c) => this.toReviewCard(c));
  }

  async submitReview(
    userId: string,
    cardId: string,
    { rating, mode, latencyMs }: { rating: ReviewRating; mode: ReviewMode; latencyMs?: number },
  ): Promise<ReviewCard> {
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
          mode,
          latencyMs,
          ...buildReviewLogSnapshot(updated, now),
        },
      }),
    ]);

    return this.toReviewCard(saved);
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
