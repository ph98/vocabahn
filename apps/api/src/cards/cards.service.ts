import { Injectable, NotFoundException } from '@nestjs/common';
import type { AutoGraduation, ReviewCard, ReviewRating, SyncReviewItem } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildReviewLogSnapshot,
  createScheduler,
  emptyFsrsCard,
  fromFsrsCard,
  ratingToFsrs,
  toFsrsCard,
} from '../fsrs/fsrs';
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

  /**
   * Syncs reviews completed offline. Each card touched is fully
   * replayed from an empty FSRS state through its complete ReviewLog history
   * (existing + newly-synced, sorted by `reviewedAt`) — the log is the source
   * of truth, so this also self-heals out-of-order submissions.
   */
  async syncReviews(userId: string, items: SyncReviewItem[]): Promise<{ synced: number }> {
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    const owned = await this.prisma.card.findMany({
      where: { id: { in: cardIds }, userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((c) => c.id));
    const valid = items.filter((i) => ownedIds.has(i.cardId));

    const byCard = new Map<string, SyncReviewItem[]>();
    for (const item of valid) {
      const bucket = byCard.get(item.cardId);
      if (bucket) bucket.push(item);
      else byCard.set(item.cardId, [item]);
    }

    for (const [cardId, newItems] of byCard) {
      await this.replayCard(userId, cardId, newItems);
      await this.knowledge.recomputeAfterReview(userId, cardId);
    }

    return { synced: valid.length };
  }

  private async replayCard(userId: string, cardId: string, newItems: SyncReviewItem[]): Promise<void> {
    const existingLogs = await this.prisma.reviewLog.findMany({
      where: { cardId },
      orderBy: { reviewedAt: 'asc' },
      select: { id: true, rating: true, latencyMs: true, reviewedAt: true },
    });

    type Entry = { id?: string; rating: ReviewRating; latencyMs: number | null; reviewedAt: Date };
    const merged: Entry[] = [
      ...existingLogs.map((l) => ({ id: l.id, rating: l.rating, latencyMs: l.latencyMs, reviewedAt: l.reviewedAt })),
      ...newItems.map((i) => ({ rating: i.rating, latencyMs: i.latencyMs ?? null, reviewedAt: new Date(i.reviewedAt) })),
    ].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());

    let fsrsCard = emptyFsrsCard();
    const ops = [];
    for (const entry of merged) {
      const { card: updated } = this.scheduler.next(fsrsCard, entry.reviewedAt, ratingToFsrs(entry.rating));
      const snapshot = buildReviewLogSnapshot(updated, entry.reviewedAt);
      ops.push(
        entry.id
          ? this.prisma.reviewLog.update({ where: { id: entry.id }, data: snapshot })
          : this.prisma.reviewLog.create({
              data: {
                cardId,
                userId,
                rating: entry.rating,
                latencyMs: entry.latencyMs ?? undefined,
                ...snapshot,
              },
            }),
      );
      fsrsCard = updated;
    }
    ops.push(this.prisma.card.update({ where: { id: cardId }, data: fromFsrsCard(fsrsCard) }));

    await this.prisma.$transaction(ops);
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
