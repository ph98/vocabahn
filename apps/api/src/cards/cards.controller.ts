import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  dueCardsQuerySchema,
  submitReviewBodySchema,
  syncReviewsBodySchema,
  type DueCardsResponse,
  type SubmitReviewResponse,
  type SyncReviewsBody,
  type SyncReviewsResponse,
  type UndoReviewResponse,
} from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CardsService } from './cards.service';

@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get('due')
  async getDue(
    @Query(new ZodValidationPipe(dueCardsQuerySchema))
    query: { courseId?: string; deckId?: string; limit?: number },
    @CurrentUserId() userId: string,
  ): Promise<DueCardsResponse> {
    const cards = await this.cards.getDueCards(userId, query);
    return { cards };
  }

  @Post('sync')
  async sync(
    @Body(new ZodValidationPipe(syncReviewsBodySchema))
    body: SyncReviewsBody,
    @CurrentUserId() userId: string,
  ): Promise<SyncReviewsResponse> {
    return this.cards.syncReviews(userId, body.reviews);
  }

  /** Rolls back the caller's most recent review of this card. */
  @Post(':cardId/undo')
  async undo(
    @Param('cardId') cardId: string,
    @CurrentUserId() userId: string,
  ): Promise<UndoReviewResponse> {
    return this.cards.undoLastReview(userId, cardId);
  }

  @Post(':cardId')
  async submit(
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(submitReviewBodySchema))
    body: { rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY'; latencyMs?: number },
    @CurrentUserId() userId: string,
  ): Promise<SubmitReviewResponse> {
    return this.cards.submitReview(userId, cardId, body);
  }
}
