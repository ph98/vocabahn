import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  dueCardsQuerySchema,
  submitReviewBodySchema,
  type DueCardsResponse,
  type SubmitReviewResponse,
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
    query: { courseId?: string; limit?: number },
    @CurrentUserId() userId: string,
  ): Promise<DueCardsResponse> {
    const cards = await this.cards.getDueCards(userId, query);
    return { cards };
  }

  @Post(':cardId')
  async submit(
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(submitReviewBodySchema))
    body: { rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY'; mode: 'STANDARD' | 'LISTENING'; latencyMs?: number },
    @CurrentUserId() userId: string,
  ): Promise<SubmitReviewResponse> {
    const card = await this.cards.submitReview(userId, cardId, body);
    return { card };
  }
}
